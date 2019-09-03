const core = require('gls-core-service');
const env = process.env;

module.exports = {
    ...core.data.env,
    GLS_BLOCKCHAIN_BROADCASTER_CONNECT: env.GLS_BLOCKCHAIN_BROADCASTER_CONNECT,
    GLS_SKIP_GENESIS: Boolean(env.GLS_SKIP_GENESIS) && env.GLS_SKIP_GENESIS !== 'false',
    GLS_GENERATE_EVERY: Number(env.GLS_GENERATE_EVERY) || 30000,
    GLS_PAUSE: Boolean(env.GLS_PAUSE) && env.GLS_PAUSE !== 'false',
    GLS_DESTINATION_FOLDER: env.GLS_DESTINATION_FOLDER || './sitemap',
};
