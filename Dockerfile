FROM centos:7

# https://tecadmin.net/install-latest-nodejs-and-npm-on-centos/
RUN curl -sL https://rpm.nodesource.com/setup_8.x | bash -\
    && yum -y install nodejs npm\
    && yum clean all \
    && rm -rf /tmp/yum*

RUN npm install -g pm2
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY . /usr/src/app
RUN npm install

EXPOSE 53/udp 53/tcp

# CMD ["npm", "start"]
CMD ["pm2", "start", "index.js", "--no-daemon", "--watch", "--merge-logs"]
