const axios = require('axios');

module.exports = {
    name: 'news',
    description: 'Get the latest Indian news headlines using NewsAPI.',
    async execute(message, args) {
        const apiKey = process.env.NEWS_API_KEY;

        try {
            console.log('Fetching Indian news from NewsAPI...');
            await message.channel.sendTyping();

            const response = await axios.get('https://newsapi.org/v2/top-headlines', {
                params: {
                    apiKey: apiKey,
                    language: 'en',
                    pageSize: 3,
                    t: Date.now(),
                },
            });

            const articles = response.data.articles;
            if (!articles || articles.length === 0) {
                return message.channel.send('No breaking news for India at the moment!');
            }

            articles.sort(() => Math.random() - 0.5);

            let newsMessage = '**Here are the top Indian news headlines:**\n\n';
            articles.forEach((article, index) => {
                newsMessage += `**${index + 1}. ${article.title}**\n${article.description || ''}\n[Read more](${article.url})\n\n`;
            });

            if (newsMessage.length > 2000) {
                const splitMessages = splitMessage(newsMessage);
                for (const chunk of splitMessages) {
                    await message.channel.send(chunk);
                }
            } else {
                await message.channel.send(newsMessage);
            }
        } catch (error) {
            console.error('Error fetching Indian news:', error.response?.data || error.message);
            return message.channel.send('Failed to fetch Indian news. Please try again later.');
        }
    },
};

function splitMessage(message, maxLength = 2000) {
    const chunks = [];
    while (message.length > 0) {
        let chunk = message.slice(0, maxLength);
        const lastLineBreak = chunk.lastIndexOf('\n');
        if (lastLineBreak > -1) {
            chunk = message.slice(0, lastLineBreak + 1);
        }
        chunks.push(chunk);
        message = message.slice(chunk.length);
    }
    return chunks;
}
