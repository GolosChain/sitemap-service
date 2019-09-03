const xmlbuilder = require('xmlbuilder');
const fs = require('fs-extra');

const core = require('gls-core-service');
const BasicService = core.services.Basic;
const { Logger, GenesisProcessor } = core.utils;

const env = require('../data/env');
const commonList = require('../data/commonList');
const PostModel = require('../models/Post');
const DateModel = require('../models/Date');
const { wait } = require('../utils/time');

const HOSTNAME = 'https://golos.io';
const CHUNK_SIZE = 1000;

class SitemapGenerator extends BasicService {
    start() {
        if (!env.GLS_PAUSE) {
            this.startProcessing();
        }
    }

    async startProcessing() {
        while (true) {
            try {
                await this._generateBulk();
            } catch (err) {
                Logger.error('SitemapGenerator tick failed:', err);
            }

            await wait(env.GLS_GENERATE_EVERY);
        }
    }

    async _generateBulk() {
        while (true) {
            const datesUpdated = await this._generate();

            if (datesUpdated < CHUNK_SIZE) {
                break;
            }
        }

        await this._generateCommonSitemap();
        await this._writeIndexSitemap();
    }

    async _generate() {
        const datesObjects = await DateModel.find(
            { needRegenerate: true },
            { _id: false, date: true },
            { lean: true, limit: CHUNK_SIZE, sort: { date: 1 } }
        );

        const dates = datesObjects.map(({ date }) => date);

        await DateModel.updateMany(
            {
                date: {
                    $in: dates,
                },
            },
            {
                $set: {
                    needRegenerate: false,
                },
            }
        );

        for (const { date } of dates) {
            try {
                await this._generateForDate(date);
            } catch (err) {
                Logger.error(`Can't create sitemap for date: (${date})`);
            }
        }

        return datesObjects.length;
    }

    async _generateForDate(date) {
        const posts = await PostModel.aggregate([
            {
                $match: { postingDate: date },
            },
            {
                $lookup: {
                    from: 'accounts',
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'account',
                },
            },
            {
                $project: {
                    userId: true,
                    permlink: true,
                    updatedAt: true,
                    account: true,
                },
            },
        ]);

        const xmlLines = posts.map(this._postToXml);

        const doc = xmlbuilder.create(
            {
                urlset: {
                    '@xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
                    url: xmlLines,
                },
            },
            { encoding: 'utf-8' }
        );

        await this._writeXml(`sitemap/sitemap_${date}.xml`, doc);
    }

    _postToXml({ userId, permlink, updateAt, account }) {
        const username = account.length ? account[0].username : userId;

        return {
            loc: {
                '#text': `${HOSTNAME}/@${username}/${permlink}`,
            },
            lastmod: {
                '#text': formatDate(updateAt),
            },
            changefreq: {
                '#text': 'daily',
            },
        };
    }

    async _writeIndexSitemap() {
        return new Promise((resolve, reject) => {
            const cursor = DateModel.find(
                {},
                { _id: false, date: true, lastUpdateAt: true },
                { lean: true, sort: { date: 1 } }
            ).cursor();

            const list = [
                {
                    loc: {
                        '#text': `${HOSTNAME}/sitemap_common.xml`,
                    },
                    lastmod: {
                        '#text': formatDate(new Date()),
                    },
                },
            ];

            cursor.on('data', ({ date, lastUpdateAt }) => {
                list.push({
                    loc: {
                        '#text': `${HOSTNAME}/sitemap_${date}.xml`,
                    },
                    lastmod: {
                        '#text': formatDate(lastUpdateAt),
                    },
                });
            });

            cursor.on('close', async () => {
                try {
                    const doc = xmlbuilder.create(
                        {
                            sitemapindex: {
                                '@xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
                                sitemap: list,
                            },
                        },
                        { encoding: 'utf-8' }
                    );

                    await this._writeXml('sitemap/sitemap.xml', doc);

                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    async _generateCommonSitemap() {
        const now = new Date();

        const doc = xmlbuilder.create(
            {
                urlset: {
                    '@xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
                    url: commonList.map(({ url, changeFreq }) => ({
                        loc: {
                            '#text': `${HOSTNAME}${url}`,
                        },
                        lastmod: {
                            '#text': formatDate(now),
                        },
                        changefreq: {
                            '#text': changeFreq,
                        },
                    })),
                },
            },
            { encoding: 'utf-8' }
        );

        await this._writeXml('sitemap/sitemap_common.xml', doc);
    }

    async _writeXml(fileName, doc) {
        await fs.writeFile(fileName, doc.end({ pretty: true }));
    }
}

function formatDate(date) {
    return date.toJSON().substr(0, 19) + '+00:00';
}

module.exports = SitemapGenerator;
