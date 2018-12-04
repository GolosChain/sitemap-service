// Описание переменных окружения смотри в Readme.
const env = process.env;

module.exports = {
    GLS_FETCH_INTERVAL: env.GLS_FETCH_INTERVAL || 3 * 1000,
};
