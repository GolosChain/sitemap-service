const golos = require('golos-js');
const core = require('gls-core-service');
const env = require('./env');
const StateManager = require('./helpers/StateManager');
const SiteMapGenerator = require('./helpers/SiteMapGenerator');
const DumpLoader = require('./services/DumpLoader');
const DayInfo = require('./models/DayInfo');

const { Basic, MongoDB } = core.services;
const Logger = core.utils.Logger;

class Main extends Basic {
    constructor() {
        super();

        const mongo = new MongoDB();
        const dumpLoader = new DumpLoader();

        this._state = new StateManager();

        this.printEnvBasedConfig(env);
        this.addNested(mongo, dumpLoader);
        this.stopOnExit();
    }

    async start() {
        await this.startNested();

        await this._state.load();

        const count = await DayInfo.countDocuments();

        await this._syncSiteMaps(count === 0);

        this.startLoop(1000, env.GLS_FETCH_INTERVAL);
    }

    async iteration() {
        const lastBlockNum = this._state.getLastAppliedBlockNum();

        const globalProps = await golos.api.getDynamicGlobalProperties();

        const lastIrrBlockNum = globalProps.last_irreversible_block_num;

        if (lastBlockNum === lastIrrBlockNum) {
            return;
        }

        let somethingApplied = false;

        try {
            for (
                let blockNum = lastBlockNum + 1;
                blockNum <= lastIrrBlockNum;
                blockNum++
            ) {
                const block = await golos.api.getBlock(blockNum);
                await this._state.applyBlock(block);
                somethingApplied = true;
            }
        } catch (err) {
            // Ничего не делаем, через 3 секунды будет новая попытка.
            Logger.error('Iteration error:', err);
        }

        if (somethingApplied) {
            this._state.setLastBlockNum(lastIrrBlockNum);
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
