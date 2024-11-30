const axios = require('axios');

module.exports = {
    name: 'shorten',
    description: 'Shorten a URL.',
    async execute(message, args) {
        const urlToShorten = args[0];
        if (!urlToShorten) {
            return message.channel.send('Please provide a URL to shorten.');
        }

        try {
            const response = await axios.post('http://localhost:8001/url', { url: urlToShorten }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const shortenedUrl = response.data.shortUrl;
            message.channel.send(`Shortened URL: ${shortenedUrl}`);
        } catch (error) {
            console.error('Error:', error.response ? error.response.data : error.message);
            message.channel.send('Error shortening URL.');
        }
    }
};
