const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'Date',
    {
        date: {
            type: String,
            required: true,
        },
        lastUpdateAt: {
            type: Date,
            required: true,
        },
        needRegenerate: {
            type: Boolean,
            required: true,
        },
        needRegenerateAt: {
            type: Date,
            default: null,
        },
    },
    {
        index: [
            {
                fields: {
                    date: 1,
                },
                options: {
                    unique: true,
                },
            },
            {
                fields: {
                    needRegenerate: 1,
                    date: 1,
                },
            },
        ],
    }
);
