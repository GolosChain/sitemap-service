const core = require('gls-core-service');

const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'DayInfo',
    {
        date: {
            type: String,
            required: true,
        },
        lastMod: {
            type: Date,
            required: true,
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
        ],
    },
);
