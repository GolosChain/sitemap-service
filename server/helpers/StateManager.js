const moment = require('moment');

const State = require('../models/State');
const Post = require('../models/Post');

const LAST_BLOCK_DEFAULT = 22303100;

class StateManager {
    constructor() {
        this._state = null;
    }

    async load() {
        this._state = await State.findOne();

        if (!this._state) {
            this._state = new State({
                lastAppliedBlockNum: 0,
            });
        }
    }

    getLastAppliedBlockNum() {
        return this._state.lastAppliedBlockNum || LAST_BLOCK_DEFAULT;
    }

    async setLastBlockNum(blockNum) {
        this._state.lastAppliedBlockNum = blockNum;
        await this._state.save();
    }

    async applyBlock(block) {
        const ts = block.timestamp;
        const timestamp = new Date(ts.endsWith('Z') ? ts : ts + 'Z');

        for (let tx of block.transactions) {
            for (let [action, data] of tx.operations) {
                if (action === 'comment' && !data.parent_author) {
                    await this._processPost(data, timestamp);
                }
            }
        }
    }

    async _processPost({ parent_permlink, author, permlink }, timestamp) {
        const link = `/${parent_permlink}/@${author}/${permlink}`;
        const dateTimestamp = new Date(timestamp);

        const post = await Post.findOne({ link });

        if (post) {
            post.lastMod = dateTimestamp;
            post.synced = false;

            await post.save();
        } else {
            const date = moment(timestamp).format('YYYY-MM-DD');

            const post = new Post({
                link,
                date,
                created: dateTimestamp,
                lastMod: dateTimestamp,
                synced: false,
            });

            await post.save();
        }
    }
}

module.exports = StateManager;
