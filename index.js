'use strict';

const fs = require('fs');
const ndns = require('native-dns');
const async = require('async');
const server = ndns.createServer();

const proxyup = {address: '8.8.8.8', port: 53, type: 'udp'};
const entries = getTheJson(process.cwd() + '/records.json') || [];

function handler(request, response) {
    const client = request.address.address;
    const questions = [].concat(request.question);
    const defers = [];

    while (questions.length > 0) {
        const question = questions.shift();
        const records = search(question.name);

        // not found => forward
        if (!records.length) {
            defers.push(cb => proxy(client, question, response, cb));
        }

        // found local
        while (records.length > 0) {
            const record = records.shift();

            record.name = question.name;
            record.ttl = record.ttl || 300;

            if (record.type === 'CNAME') {
                record.data = record.address;
                questions.push({type: ndns.consts.NAME_TO_QTYPE.A, name: record.data, class: 1});
            }

            const answer = ndns[record.type](record);

            response.answer.push(answer);

            logAnswer(client, 'found', question, answer);
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
    const request = ndns.Request({
        question: question, // forwarding the question
        server: proxyup,    // this is the DNS server we are asking
        timeout: 1000       // wait for 1 second
    });

    request.on('timeout', function () {
        logAnswer(client, 'proxy', question, 'timeout');
    });

    // when we get answers, append them to the response
    request.on('message', (err, msg) => {
        msg.answer.forEach(answer => {
            response.answer.push(answer);
            logAnswer(client, 'proxy', question, answer);
        });
    });

    request.on('end', cb);
    request.send();
}

function logAnswer(client, prefix, question, answer) {
    console.log(
        client,
        prefix,
        rpad(question.name, ' ', 48),
        '',
        lpad(answer.type ? ndns.consts.QTYPE_TO_NAME[answer.type] : null, ' ', 5),
        '',
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

server.on('request', handler);
server.on('close', () => console.log('server closed', server.address()));
server.on('error', (err, buff, req, res) => console.error(err.stack));
server.on('socketError', (err, socket) => console.error(err));
server.on('listening', () => {
    const name = 'Dev DNS Server';
    const version = '0.0.1';
    const address = server.address();
    const listen = address.address + ':' + address.port;

    console.log(`${name} ${version}`);
    console.log(`listen on ${listen}`);
    console.log(`--------------------`);
});

server.serve(53);
