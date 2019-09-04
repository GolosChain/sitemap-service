const core = require('gls-core-service');
const BasicService = core.services.Basic;
const { Logger, metrics } = core.utils;
const { BlockSubscribe } = core.services;
const moment = require('moment');

const ServiceMetaModel = require('../models/ServiceMeta');
const AccountModel = require('../models/Account');
const PostModel = require('../models/Post');
const DateModel = require('../models/Date');

class Subscriber extends BasicService {
    async start() {
        await super.start();

        const meta = await ServiceMetaModel.findOne({}, {}, { lean: true });

        this._subscriber = new BlockSubscribe({
            handler: this._handleEvent.bind(this),
        });

        await this._subscriber.setLastBlockMetaData({
            lastBlockNum: meta.lastProcessedBlockNum,
            lastBlockSequence: meta.lastProcessedSequence || 0,
        });

        await this._subscriber.start();
    }

    /**
     * Обработка событий из BlockSubscribe.
     * @param {'BLOCK'|'FORK'|'IRREVERSIBLE_BLOCK'} type
     * @param {Object} data
     * @private
     */
    async _handleEvent({ type, data }) {
        switch (type) {
            case BlockSubscribe.EVENT_TYPES.IRREVERSIBLE_BLOCK:
                await this._handleNewBlock(data);
                break;
            default:
            // Do nothing
        }
    }

    /**
     * Обработка нового блока.
     * @param {Object} block
     * @private
     */
    async _handleNewBlock(block) {
        for (const transaction of block.transactions) {
            for (const action of transaction.actions) {
                await this._processAction(action, block);
            }
        }
    }

    async _processAction(action, block) {
        const pathName = `${action.code}->${action.action}`;

        let result;

        try {
            switch (pathName) {
                case 'cyber.domain->newusername':
                    await this._handleNewUsername(action.args, block);
                    break;

                case 'gls.publish->createmssg':
                    result = await this._handleMessageCreate(action.args, block);
                    break;

                case 'gls.publish->updatemssg':
                    result = await this._handleMessageUpdate(action.args, block);
                    break;

                case 'gls.publish->deletemssg':
                    result = await this._handleMessageDelete(action.args, block);
                    break;
            }
        } catch (err) {
            Logger.warn(
                `Error while processing "${pathName}", block num (${block.blockNum}):`,
                err
            );
        }

        if (result) {
            await DateModel.updateOne(
                { date: result },
                {
                    date: result,
                    lastUpdateAt: block.blockTime,
                    needRegenerate: true,
                },
                {
                    upsert: true,
                }
            );
        }
    }

    async _handleNewUsername(
        { owner: userId, name: username, creator: communityId },
        { blockNum }
    ) {
        if (communityId !== 'gls') {
            return;
        }

        try {
            await AccountModel.create({
                userId,
                username,
            });
        } catch (err) {
            if (err.code === 11000) {
                Logger.warn(
                    `Duplicate user. Block num: (${blockNum}), userId: "${userId}", username: "${username}"`
                );
            } else {
                throw err;
            }
        }
    }

    async _handleMessageCreate(data, { blockNum, blockTime }) {
        // Пропускаем комментарии
        if (data.parent_id && data.parent_id.author) {
            return;
        }

        const contentId = getContentId(data);

        const postingDate = moment(blockTime).format('YYYY-MM-DD');

        try {
            await PostModel.create({
                userId: contentId.userId,
                permlink: contentId.permlink,
                postingDate,
                updatedAt: blockTime,
            });
        } catch (err) {
            if (err.code === 11000) {
                Logger.warn(
                    `Duplicate post. Block num: (${blockNum}), author: "${contentId.userId}", permlink: "${contentId.permlink}"`
                );
                return;
            } else {
                throw err;
            }
        }

        return postingDate;
    }

    async _handleMessageUpdate(data, { blockTime }) {
        const contentId = getContentId(data);

        const post = await PostModel.findOne(contentId, { postingDate: 1 }, { lean: true });

        if (post) {
            await PostModel.updateOne(contentId, {
                updatedAt: blockTime,
            });

            return post.postingDate;
        }
    }

    async _handleMessageDelete(data) {
        const contentId = getContentId(data);

        const post = await PostModel.findOne(contentId, { postingDate: 1 }, { lean: true });

        if (post) {
            await PostModel.deleteOne(contentId);
            return post.postingDate;
        }
    }
}

function getContentId(post) {
    return {
        userId: post.message_id.author,
        permlink: post.message_id.permlink,
    };
}

module.exports = Subscriber;
