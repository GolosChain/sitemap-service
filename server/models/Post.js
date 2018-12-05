const core = require('gls-core-service');

const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'Post',
    {
        link: {
            type: String,
            required: true,
        },
        date: {
            type: String,
            required: true,
        },
        created: {
            type: Date,
            required: true,
        },
        lastMod: {
            type: Date,
            required: true,
        },
        synced: {
            type: Boolean,
            required: true,
            default: false,
        },
    },
    {
        index: [
            {
                fields: {
                    link: 1,
                },
                options: {
                    unique: true,
                },
            },
            {
                fields: {
                    created: 1,
                },
            },
            {
                fields: {
                    date: 1,
                },
            },
            {
                fields: {
                    synced: 1,
                },
            },
        ],
    },
);
