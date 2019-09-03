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

    const cur = new Date();

    for (let i = 0; i < 6; i++) {
        const end = cur.toJSON();
        cur.setDate(cur.getDate() - 30);
        const start = cur.toJSON();

        await processByInterval(db, start, end);
    }

    await client.close();
    server.close();
});

async function processByInterval(db, start, end) {
    const comments = db.collection('comment_object');

    const cursor = await comments.find(
        { depth: 0, created: { $gte: new Date(start), $lt: new Date(end) } },
        {
            projection: {
                author: 1,
                category: 1,
                permlink: 1,
                created: 1,
                body: 1,
                last_update: 1,
            },
        },
    );

    const posts = new Map();

    while (true) {
        const doc = await cursor.next();

        if (!doc) {
            break;
        }

        if (doc.category === 'goldvoice') {
            continue;
        }

        const url = `${doc.category}/@${doc.author}/${doc.permlink}`;

        posts.set(url, doc.body.length);
    }

    console.log(`Data by interval: ${start} - ${end}`);

    console.log('Posts count:', posts.size);

    const array = Array.from(posts.values());

    console.log('Avg post length ~', avgValue(array).toFixed(2));
    console.log('Medium post length ~', mediumValue(array).toFixed(2));
}

function avgValue(list) {
    let sum = 0;

    for (const value of list) {
        sum += value;
    }

    return sum / list.length;
}

function mediumValue(list) {
    list = Array.from(list).sort();

    const off = Math.floor(list.length / 10);

    list = list.slice(off, list.length - off);

    let sum = 0;

    for (const value of list) {
        sum += value;
    }

    return sum / list.length;
}
