'use strict';

const fs = require('fs');
const os = require('os');
const dns = require('dns');
const ndns = require('native-dns');
const async = require('async');
const server = ndns.createServer();

const entries = getTheJson(process.cwd() + '/records.json') || [];
const my_ips = getMyIpAddresses();
const servers = dns.getServers().filter(x => !my_ips.includes(x));

const is_log_local = true;
const is_log_proxy = true;
const default_ttl = 300;

dns.setServers(servers);

function handler(request, response) {
    const client = request.address.address;
    const questions = [].concat(request.question);
    const defers = [];

    while (questions.length > 0) {
        const question = questions.shift();
        const records = search(question.name);
        const type = ndns.consts.QTYPE_TO_NAME[question.type];

        if (['A', 'AAAA', 'CNAME'].includes(type)) {
            // not found => forward
            if (!records.length) {
                defers.push(cb => proxy(client, question, response, cb));
            }

            // found local
            while (records.length > 0) {
                const record = records.shift();

                if (record.type === 'CNAME') {
                    questions.push({type: ndns.consts.NAME_TO_QTYPE.A, name: record.address, class: 1});
                }

                record.name = record.name || question.name;
                record.ttl = record.ttl || default_ttl;

                if (record.type === 'CNAME') {
                    record.data = record.address;
                }

                const answer = ndns[record.type](record);

                response.answer.push(answer);
                is_log_local && logAnswer(client, 'local', question, answer);
            }
        }
    }

    async.parallel(defers, () => {
        response.send();
    });
}

function search(domain) {
    let records = [].concat(entries.filter(r => new RegExp(r.regexp, 'i').exec(domain)));
    if (records.length) {
        return [].concat(records.pop().records || []);
    } else {
        return [];
    }
}

function proxy(client, question, response, cb) {
    const type = ndns.consts.QTYPE_TO_NAME[question.type];

    dns.resolve(question.name, type, function (err, items) {
        const records = [...new Set(items || [])];

        records || is_log_proxy && logAnswer(client, 'proxy', question, 'unknown');
        records.forEach(record => {
            const answer = ndns[type]({
                name: question.name,
                address: record,
                ttl: default_ttl
            });

            response.answer.push(answer);
            is_log_proxy && logAnswer(client, 'proxy', question, answer);
        });

        cb();
    });
}

function logAnswer(client, prefix, question, answer) {
    console.log(
        '[' + (new Date()).toISOString().substring(0, 19).replace('T', ' ') + ']',
        client,
        lpad(answer.type ? ndns.consts.QTYPE_TO_NAME[answer.type] : null, ' ', 5),
        question.name,
        '=>',
        answer.address || answer.data || answer
    );
}

function getTheJson(name) {
    try {
        return JSON.parse(fs.readFileSync(name).toString());
    } catch (e) {
        return [];
    }
}

function lpad(str, pad, len) {
    str = str || '';

    while (str.length < len) {
        str = pad + str;
    }
    return str;
}

function rpad(str, pad, len) {
    while (str.length < len) {
        str = pad + str;
    }
    return str;
}

function getMyIpAddresses() {
    const ips = [];
    const ifaces = os.networkInterfaces();

    Object.keys(ifaces).forEach(function (ifname) {
        ifaces[ifname].forEach(function (iface) {
            ips.push(iface.address);
        });
    });

    return ips;
}

server.on('request', handler);
server.on('close', () => console.log('server closed', server.address()));
server.on('error', (err, buff, req, res) => console.error(err.stack));
server.on('socketError', (err, socket) => console.error(err));
server.on('listening', () => {
    const name = 'Dev DNS Server';
    const version = '0.0.1';
    const address = server.address();
    const port = address.port;
    const listen = address.address + ':' + port;

    console.log(`${name} ${version}`);
    my_ips.forEach(ip => console.log(`listen on ${ip}:${port}`));
    console.log(`--------------------`);
});

server.serve(53);
