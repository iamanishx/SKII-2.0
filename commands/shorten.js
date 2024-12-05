require('dotenv').config()

const axios = require('axios');
const { getCache, setCache } = require('../redis/redisUtils');

module.exports = {
    name: 'shorten',
    description: 'Shorten a URL.',
    async execute(message, args) {
        const urlToShorten = args[0];
        if (!urlToShorten) {
            return message.channel.send('Please provide a URL to shorten.');
        }

        const cacheKey = `shorten:${urlToShorten}`;

        try {
            const cachedResponse = await getCache(cacheKey);
            if (cachedResponse) {
                console.log('Cache hit for URL:', urlToShorten);
                return message.channel.send(`Shortened URL: ${cachedResponse}`);
            }

            console.log('Cache miss, querying backend...');
            await message.channel.sendTyping();

            const response = await axios.post('http://localhost:7001/url', { url: urlToShorten }, {
                headers: {
                    'Content-Type': 'application/json',

                }
            });


            const shortenedUrl = response.data.shortUrl;

            await setCache(cacheKey, shortenedUrl, 600);

            return message.channel.send(`Shortened URL: ${shortenedUrl}`);
        } catch (error) {
            console.error('Error while shortening URL:', error.response ? error.response.data : error.message);
            message.channel.send('Error shortening URL.');
        }
    }
};
