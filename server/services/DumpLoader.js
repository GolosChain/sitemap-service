const fs = require('fs-extra');
const core = require('gls-core-service');
const Post = require('../models/Post');

const { Logger } = core.utils;
const { Basic } = core.services;

const initialDataFilename = '/data/initial-data.json';

class DumpLoader extends Basic {
    async start() {
        const somePost = await Post.findOne({});

        if (!somePost) {
            Logger.log('Start initial data loading');

            const initialDataJSON = await fs.readFile(initialDataFilename);

            const initialData = JSON.parse(initialDataJSON);

            for (let date in initialData) {
                const posts = initialData[date];

                for (let post of posts) {
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
