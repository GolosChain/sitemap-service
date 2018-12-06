const golos = require('golos-js');
const core = require('gls-core-service');
const env = require('./env');
const { sleep } = require('./helpers/time');
const StateManager = require('./helpers/StateManager');
const SiteMapGenerator = require('./helpers/SiteMapGenerator');
const DumpLoader = require('./services/DumpLoader');
const DayInfo = require('./models/DayInfo');

const { BasicMain, MongoDB } = core.services;
const Logger = core.utils.Logger;
const stats = core.utils.statsClient;

class Main extends BasicMain {
    constructor() {
        super(stats, env);

        const mongo = new MongoDB();
        const dumpLoader = new DumpLoader();

        this._state = new StateManager();

        this.addNested(mongo, dumpLoader);
    }

    async start() {
        await super.start();

        await this._state.load();

        const count = await DayInfo.countDocuments();

        await this._syncSiteMaps(count === 0);

        setImmediate(() => this._startIterating());
    }

    async stop() {
        this._stop = true;
        await this._currentIteration;

        await super.stop();
    }

    async _startIterating() {
        while (!this._stop) {
            const start = Date.now();

            this._currentIteration = this._doIteration();

            await this._currentIteration;

            if (this._stop) {
                break;
            }

            await sleep(
                Math.max(0, env.GLS_FETCH_INTERVAL - (Date.now() - start)),
            );
        }
    }

    async _doIteration() {
        const lastBlockNum = this._state.getLastAppliedBlockNum();
        let globalProps;

        try {
            globalProps = await golos.api.getDynamicGlobalProperties();
        } catch (err) {
            // Ничего не далаем, просто пропускаем итерацию
            return;
        }

        const lastIrrBlockNum = globalProps.last_irreversible_block_num;

        if (lastBlockNum === lastIrrBlockNum) {
            return;
        }

        let somethingApplied = false;

        try {
            let iterationsCount = 0;

            for (
                let blockNum = lastBlockNum + 1;
                blockNum <= lastIrrBlockNum;
                blockNum++
            ) {
                if (++iterationsCount === 1000) {
                    break;
                }

                const block = await golos.api.getBlock(blockNum);
                await this._state.applyBlock(block);
                somethingApplied = true;
            }
        } catch (err) {
            // Ничего не делаем, через 3 секунды будет новая попытка.
            Logger.error('Iteration error:', err);
        }

        if (somethingApplied) {
            await this._state.setLastBlockNum(lastIrrBlockNum);
            await this._syncSiteMaps();
        }
    }

    async _syncSiteMaps(isInitial) {
        const siteMapGenerator = new SiteMapGenerator();

        if (isInitial) {
            await siteMapGenerator.initialSync();
        } else {
            await siteMapGenerator.sync();
        }
    }
}

module.exports = Main;
