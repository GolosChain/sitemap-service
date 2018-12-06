const moment = require('moment');
const core = require('gls-core-service');

const { IGNORE_TAGS } = require('../constants');
const State = require('../models/State');
const Post = require('../models/Post');

const Block = core.utils.Block;

const LAST_BLOCK_DEFAULT = 22332560;

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
        // Fix invalid date format from blockchain
        const timestamp = moment(ts.endsWith('Z') ? ts : ts + 'Z');

        for (const [action, data] of Block.eachRealOperation(block)) {
            if (
                action === 'comment' &&
                !data.parent_author &&
                !IGNORE_TAGS.has(data.category)
            ) {
                console.log(data);
                await this._processPost(data, timestamp);
            }
        }
    }

    async _processPost({ parent_permlink, author, permlink }, timestamp) {
        const link = `/${parent_permlink}/@${author}/${permlink}`;

        const post = await Post.findOne({ link });

        if (post) {
            post.lastMod = timestamp;
            post.synced = false;

            await post.save();
        } else {
            const date = timestamp.format('YYYY-MM-DD');

            const post = new Post({
                link,
                date,
                created: timestamp,
                lastMod: timestamp,
                synced: false,
            });

            await post.save();
        }
    }
}

module.exports = StateManager;
