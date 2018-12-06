const fs = require('fs-extra');
const core = require('gls-core-service');
const xmlbuilder = require('xmlbuilder');
const moment = require('moment');
const golos = require('golos-js');
const cloneDeep = require('lodash/cloneDeep');

const { sleep } = require('../helpers/time');
const Post = require('../models/Post');
const DayInfo = require('../models/DayInfo');
const basicLinks = require('../../data/basicLinks.json');

const Logger = core.utils.Logger;

const HOSTNAME = 'https://golos.io';

const FIRST_POST_DATE = '2016-10-18';
const REFRESH_TAGS_INTERVAL = 5 * 60 * 1000;

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

        for (const post of posts) {
            dates.add(post.date);
        }

        for (const date of dates) {
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

        const urls = posts.map(post => ({
            loc: HOSTNAME + post.link,
            lastmod: formatDate(post.lastMod),
            changefreq: changeFreq,
        }));

        await this._generateAndWriteUrlList(
            `/sitemap/sitemap_${date}.xml`,
            urls,
        );

        let lastMod = null;

        for (const post of posts) {
            if (!lastMod || lastMod < post.lastMod) {
                lastMod = post.lastMod;
            }
        }

        await this._updateDayInfo(date, lastMod);
    }

    async _generateAndWriteUrlList(fileName, urls) {
        const xmlUrlList = urls.map(urlInfo => ({
            loc: {
                '#text': urlInfo.loc,
            },
            lastmod: {
                '#text': urlInfo.lastmod,
            },
            changefreq: {
                '#text': urlInfo.changefreq,
            },
        }));

        const doc = xmlbuilder.create(
            {
                urlset: {
                    '@xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
                    url: xmlUrlList,
                },
            },
            { encoding: 'utf-8' },
        );

        await this._writeXml(fileName, doc);
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

    async _regenerateCommonSitemap(lastMod) {
        const links = cloneDeep(basicLinks);

        const tags = await this._getTrendingTags();

        for (const { name } of tags) {
            links.push(
                {
                    loc: `${HOSTNAME}/trending/${name}`,
                    changefreq: 'daily',
                },
                {
                    loc: `${HOSTNAME}/hot/${name}`,
                    changefreq: 'daily',
                },
            );
        }

        for (const link of links) {
            link.lastmod = lastMod;
        }

        await this._generateAndWriteUrlList(
            '/sitemap/sitemap_common.xml',
            links,
        );
    }

    async _syncIndex() {
        const lastMod = formatDate(new Date());

        await this._regenerateCommonSitemap(lastMod);

        const daysInfo = await DayInfo.find({}).sort({ date: 1 });

        const xmlSiteMapList = [
            {
                loc: `${HOSTNAME}/sitemap_common.xml`,
                lastmod: lastMod,
            },
        ];

        for (const dayInfo of daysInfo) {
            xmlSiteMapList.push({
                loc: `${HOSTNAME}/sitemap_${dayInfo.date}.xml`,
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

        await this._writeXml('/sitemap/sitemap.xml', doc);
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

    async _getTrendingTags() {
        if (!this._tags || Date.now() > this._tagsTs + REFRESH_TAGS_INTERVAL) {
            try {
                this._tags = await golos.api.getTrendingTags(null, 100);
                this._tagsTs = Date.now();
            } catch (err) {
                Logger.error('Get tags error:', err);
                await sleep(5000);
                return await this._getTrendingTags();
            }
        }

        return this._tags;
    }
}

function formatDate(date) {
    return date.toJSON().substr(0, 19) + '+00:00';
}

module.exports = SiteMapGenerator;
