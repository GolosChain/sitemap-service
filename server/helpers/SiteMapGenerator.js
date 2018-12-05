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

        const current = moment(FIRST_POST_DATE);
        const today = moment().format('YYYY-MM-DD');

        while (true) {
            const date = current.format('YYYY-MM-DD');

            await this._syncDate(date);

            if (date === today) {
                break;
            }

            current.add(1, 'day');
        }

        await this._syncIndex();

        Logger.log('Initial sync complete');
    }

    async sync() {
        const posts = await Post.find({ synced: false }, { date: 1 });

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
        const posts = await Post.find({ date }).sort({ created: 1 });

        if (!posts.length) {
            return;
        }

        const changeFreq = this._getChangeFreq(date);

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

        await this._updateDayInfo(date, lastMod);
    }

    async _updateDayInfo(date, lastMod) {
        await Post.updateMany({ date }, { synced: true });

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
        const daysInfo = await DayInfo.find({}).sort({ date: 1 });

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

    _getChangeFreq(date) {
        const monthAgo = moment().subtract(30, 'day');
        const weekAgo = moment().subtract(7, 'day');
        const ts = moment(date);

        if (ts.isAfter(weekAgo, 'day')) {
            return 'daily';
        }

        if (ts.isAfter(monthAgo, 'day')) {
            return 'weekly';
        }

        return 'monthly';
    }
}

function formatDate(date) {
    return date.toJSON().substr(0, 19) + '+00:00';
}

module.exports = SiteMapGenerator;
