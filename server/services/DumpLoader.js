const fs = require('fs-extra');
const core = require('gls-core-service');
const Post = require('../models/Post');

const { Logger } = core.utils;
const { Basic } = core.services;

const initialDataFilename = '/data/initial-data.json';

class DumpLoader extends Basic {
    async start() {
        const count = await Post.countDocuments();

        if (count === 0) {
            Logger.log('Start initial data loading');

            const initialDataJSON = await fs.readFile(initialDataFilename);
            const initialData = JSON.parse(initialDataJSON);

            for (const date in initialData) {
                const posts = initialData[date];

                for (const post of posts) {
                    const postModel = new Post({
                        link: post.link,
                        date,
                        created: post.created,
                        lastMod: post.lastMod,
                    });

                    await postModel.save();
                }
            }

            Logger.log('Initial data loading complete');
        }

        this.done();
    }
}

module.exports = DumpLoader;
