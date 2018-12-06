const fs = require('fs');
const { IGNORE_TAGS } = require('../server/constants');
const data = require('../state/initial-data');

for (const date in data) {
    data[date] = data[date].filter(post => {
        const category = post.link.match(`^\/([^\/]+)\/`)[1];

        if (category === 'goldvoice' && date >= '2018-11-22') {
            return false;
        }

        return !IGNORE_TAGS.has(category);
    });
}

fs.writeFileSync('state/initial-data.json', JSON.stringify(data, null, 2));
