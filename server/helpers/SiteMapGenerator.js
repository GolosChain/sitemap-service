const fs = require('fs-extra');
const core = require('gls-core-service');
const xmlbuilder = require('xmlbuilder');
const moment = require('moment');

const Post = require('../models/Post');
const DayInfo = require('../models/DayInfo');

const Logger = core.utils.Logger;

const HOSTNAME = 'https://golos.io/';

const FIRST_POST_DATE = '2016-10-18';

class SiteMapGenerator {
    async initialSync() {
        Logger.log('Initial sync started');

        const current = new Date(FIRST_POST_DATE);
        const today = moment().format('YYYY-MM-DD');

        while (true) {
            const date = moment(current).format('YYYY-MM-DD');

            await this._syncDate(date);

            if (date === today) {
                break;
            }

            current.setDate(current.getDate() + 1);
        }

        await this._syncIndex();

        Logger.log('Initial sync complete');
    }

    async sync() {
        const query = Post.find(
            {
                synced: false,
            },
            { date: 1 },
        );

        const posts = await query.exec();

        const dates = new Set();

        for (let post of posts) {
            dates.add(post.date);
        }

        for (let date of dates) {
            await this._syncDate(date);
        }

        await this._syncIndex();
    }

    async _syncDate(date) {
        const posts = await Post.find({ date })
            .sort({ created: 1 })
            .exec();

        if (!posts.length) {
            return;
        }

        const WEEK_AGO = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const MONTH_AGO = Date.now() - 30 * 24 * 60 * 60 * 1000;

        const time = new Date(date).getTime();

        let changeFreq;

        if (time > WEEK_AGO) {
            changeFreq = 'daily';
        } else if (time > MONTH_AGO) {
            changeFreq = 'weekly';
        } else {
            changeFreq = 'monthly';
        }

        const xmlUrlList = [];
        let lastMod = null;

        for (let post of posts) {
            xmlUrlList.push({
                loc: {
                    '#text': HOSTNAME + post.link,
                },
                lastmod: {
                    '#text': formatDate(post.lastMod),
                },
                changefreq: {
                    '#text': changeFreq,
                },
            });

            if (!lastMod || lastMod < post.lastMod) {
                lastMod = post.lastMod;
            }
        }

        const doc = xmlbuilder.create(
            {
                urlset: {
                    '@xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
                    url: xmlUrlList,
                },
            },
            { encoding: 'utf-8' },
        );

        await this._writeXml(`/sitemap/sitemap_${date}.xml`, doc);

        await Post.updateMany(
            {
                date,
            },
            {
                synced: true,
            },
        );

        await DayInfo.updateOne(
            {
                date,
            },
            {
                date,
                lastMod,
            },
            {
                upsert: true,
            },
        );
    }

    async _syncIndex() {
        const daysInfo = await DayInfo.find({})
            .sort({ date: 1 })
            .exec();

        const xmlSiteMapList = [];

        for (let dayInfo of daysInfo) {
            xmlSiteMapList.push({
                loc: `${HOSTNAME}sitemap_${dayInfo.date}.xml`,
                lastmod: formatDate(dayInfo.lastMod),
            });
        }

        const doc = xmlbuilder.create(
            {
                sitemapindex: {
                    '@xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
                    sitemap: xmlSiteMapList,
                },
            },
            { encoding: 'utf-8' },
        );

        await this._writeXml('/sitemap/sitemap_index.xml', doc);
    }

    async _writeXml(fileName, doc) {
        await fs.writeFile(fileName + '_', doc.end({ pretty: true }));
        await fs.rename(fileName + '_', fileName);
    }
}

function formatDate(date) {
    return date.toJSON().replace('Z', '+00:00');
}

module.exports = SiteMapGenerator;
