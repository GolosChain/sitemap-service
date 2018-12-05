const fs = require('fs');
const tunnel = require('tunnel-ssh');
const mongodb = require('mongodb');
const moment = require('moment');

const config = {
    username: process.env.SSH_USERNAME,
    host: '95.216.158.255',
    agent: process.env.SSH_AUTH_SOCK, // system environment, don't set manually
    privateKey: fs.readFileSync('/home/user/.ssh/id_rsa'),
    port: 22,
    dstHost: '10.77.77.1',
    dstPort: 27017,
    localHost: '127.0.0.1',
    localPort: 27017,
};

tunnel(config, async function(error, server) {
    if (error) {
        console.log('SSH connection failed:', error);
        return;
    }

    const client = await mongodb.MongoClient.connect(
        'mongodb://localhost:27017/Golos',
        {
            auth: {
                user: process.env.MONGO_USERNAME,
                password: process.env.MONGO_PASSWORD,
            },
        },
    );

    const db = client.db('Golos');

    const comments = db.collection('comment_object');

    const cursor = await comments.find(
        { depth: 0 },
        {
            projection: {
                author: 1,
                category: 1,
                permlink: 1,
                created: 1,
                last_update: 1,
            },
        },
    );

    const dates = {};

    let i = 0;

    while (true) {
        i++;

        if (i % 1000 === 0) {
            console.log('i:', i);
        }

        const doc = await cursor.next();

        if (!doc) {
            break;
        }

        const date = moment(doc.created).format('YYYY-MM-DD');

        let list = dates[date];

        if (!list) {
            list = [];
            dates[date] = list;
        }

        list.push({
            link: `/${doc.category}/@${doc.author}/${doc.permlink}`,
            created: doc.created,
            lastMod: doc.last_update,
        });
    }

    for (let date in dates) {
        if (dates.hasOwnProperty(date)) {
            dates[date].sort((a, b) => a.created - b.created);
        }
    }

    fs.writeFileSync('state/initial-data.json', JSON.stringify(dates, null, 2));

    await client.close();
    server.close();
});
