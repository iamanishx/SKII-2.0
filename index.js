const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const DISCORD_BOT_TOKEN = 'MTI2NjY2MjU0MTI5MTk0NjAyNA.GMwT1u.R-gVAxH5X6WBrIkzdLvFd-nQoqeCEm7zKvGdCw';  
const URL_SHORTENER_API = 'http://localhost:8001/url';  
const BASE_SHORT_URL = 'http://localhost:8001/'; 

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return; // Ignore messages from other bots

    if (message.content.startsWith('!shorten')) {
        const urlToShorten = message.content.split(' ')[1];

        if (!urlToShorten) {
            return message.channel.send('Please provide a URL to shorten.');
        }

        try {
            const response = await axios.post(URL_SHORTENER_API, { url: urlToShorten }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const shortenedUrl = `${BASE_SHORT_URL}${response.data.id}`;
            message.channel.send(`Shortened URL: ${shortenedUrl}`);
        } catch (error) {
            console.error('Error:', error.response ? error.response.data : error.message);
            message.channel.send('Error shortening URL.');
        }
    }
});

client.login('MTI2NjY2MjU0MTI5MTk0NjAyNA.GMwT1u.R-gVAxH5X6WBrIkzdLvFd-nQoqeCEm7zKvGdCw');
