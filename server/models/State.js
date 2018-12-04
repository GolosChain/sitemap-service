const core = require('gls-core-service');

const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel('State', {
    lastAppliedBlockNum: {
        type: Number,
        required: true,
    },
});
