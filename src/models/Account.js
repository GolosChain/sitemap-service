const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'Account',
    {
        userId: {
            type: String,
            required: true,
        },
        username: {
            type: String,
        },
    },
    {
        index: [
            {
                fields: {
                    userId: 1,
                },
                options: {
                    unique: true,
                },
            },
        ],
    }
);
