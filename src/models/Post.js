const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'Post',
    {
        userId: {
            type: String,
            required: true,
        },
        permlink: {
            type: String,
            required: true,
        },
        postingDate: {
            type: String,
            required: true,
        },
        lastUpdateAt: {
            type: Date,
            required: true,
        },
    },
    {
        index: [
            {
                fields: {
                    userId: 1,
                    permlink: 1,
                },
                options: {
                    unique: true,
                },
            },
            {
                fields: {
                    postingDate: 1,
                },
            },
        ],
    }
);
