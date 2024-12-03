const { GenerativeModel } = require('@google/generative-ai');
const { getCache, setCache } = require('../redis/redisUtils');  

module.exports = {
    name: 'gemini',
    description: 'Chat with Google Gemini AI',
    async execute(message, args) {
        if (!args.length) {
            return message.reply('Please provide a prompt or question.');
        }

        const prompt = args.join(' ');
        const cacheKey = `gemini:${prompt}`;  
        const apiKey = process.env.GEMINI_API_KEY;

        try {
             const cachedResponse = await getCache(cacheKey);
            if (cachedResponse) {
                console.log('Cache hit for Gemini prompt:', prompt);
                return message.channel.send(cachedResponse);
            }

            console.log('Cache miss, querying Gemini API...');
            await message.channel.sendTyping();

             const genAI = new GenerativeModel(apiKey, { model: 'gemini-1.5-pro' });
            const result = await genAI.generateContent(prompt);

            const candidates = result?.response?.candidates;
            const content = candidates?.[0]?.content?.parts?.[0]?.text;

            if (content) {
                 await setCache(cacheKey, content, 600);
                return message.channel.send(content);
            } else {
                return message.reply('No response received from Gemini.');
            }
        } catch (error) {
            console.error('Error with Gemini API:', error.message);
            message.reply('An error occurred while communicating with Gemini.');
        }
    },
};
