const core = require('gls-core-service');
const { Logger, metrics, BulkSaver } = core.utils;
const moment = require('moment');

const PostModel = require('../models/Post');
const AccountModel = require('../models/Account');
const DateModel = require('../models/Date');

class GenesisContent {
    /**
     * @param {Function} onDone -- функция для остановки дальнейшей обработки генезиса, вызывается с await.
     */
    constructor({ onDone }) {
        this._onDoneHandler = onDone;

        this._genesisDates = new Map();

        this._accountsDone = false;
        this._postsDone = false;

        this._accountsBulk = new BulkSaver(AccountModel, 'accounts');
        this._postsBulk = new BulkSaver(PostModel, 'posts');
        this._datesBulk = new BulkSaver(DateModel, 'dates');
    }

    async handle(type, data) {
        switch (type) {
            case 'account':
                this._handleAccount(data);
                return true;
            case 'message':
                this._handlePost(data);
                return true;
            default:
                // Do nothing
                return false;
        }
    }

    getQueueLength() {
        return (
            this._accountsBulk.getQueueLength() +
            this._postsBulk.getQueueLength() +
            this._datesBulk.getQueueLength()
        );
    }

    async typeEnd(type) {
        switch (type) {
            case 'account':
                await this._accountsBulk.finish();
                this._accountsDone = true;

                if (this._postsDone) {
                    await this._onDone();
                }
                break;
            case 'message':
                await this._postsBulk.finish();
                this._postsDone = true;

                if (this._accountsDone) {
                    await this._onDone();
                }
                break;
            default:
            // Do nothing
        }
    }

    async finish() {}

    _handleAccount(data) {
        const { owner: userId, name: username } = data;

        this._accountsBulk.addEntry({
            userId,
            username,
        });

        metrics.inc('genesis_type_account_processed');
    }

    _handlePost(data) {
        const { author: userId, permlink, parent_author: parentAuthor, created } = data;

        // Если есть parentAuthor значит это комментарий, пропускаем.
        if (parentAuthor) {
            return;
        }

        let createdTime = null;

        if (created !== '1970-01-01T00:00:00.000') {
            createdTime = new Date(created + 'Z');
        }

        const postingDate = moment(createdTime).format('YYYY-MM-DD');

        this._postsBulk.addEntry({
            userId,
            permlink,
            postingDate,
            updatedAt: createdTime,
        });

        const lastUpdateAt = this._genesisDates.get(postingDate);

        if (!lastUpdateAt || lastUpdateAt < createdTime) {
            this._genesisDates.set(postingDate, createdTime);
        }

        metrics.inc('genesis_type_post_processed');
    }

    async _onDone() {
        Logger.info('Dates saving started');

        for (const [date, lastUpdateAt] of this._genesisDates) {
            this._datesBulk.addEntry({
                date,
                needRegenerate: true,
                lastUpdateAt,
            });
        }

        await this._datesBulk.finish();

        this._onDoneHandler();
    }
}

module.exports = GenesisContent;
