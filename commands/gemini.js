const { GenerativeModel } = require('@google/generative-ai');
const { getCache, setCache } = require('../redis/redisUtils');
const vectorDB = require('../utils/vectorDB');  

module.exports = {
    name: 'gemini',
    description: 'Chat with Google Gemini AI with RAG memory',
    async execute(message, args) {
        const subcommand = args[0];
        const userId = message.author.id;
        
        try {
            switch (subcommand) {
                case 'setup':
                    await handleGeminiSetup(message, args.slice(1), userId);
                    return;
                case 'clear':
                    await handleClearHistory(message, userId);
                    return;
                default:
                    if (!subcommand) {
                        return message.reply('Please provide a command or message. Use `!gemini setup <api_key>` to get started, or `!gemini <message>` to chat.');
                    }
                    break;
            }
        } catch (error) {
            console.error('Error in Gemini command:', error.message);
            return message.reply('An error occurred while processing your request.');
        }

        const prompt = args.join(' ');
        const channelId = message.channel.id;
        
        const userKeyCache = `user:${userId}:gemini_key`;
        const apiKey = await getCache(userKeyCache);
        
        if (!apiKey) {
            return message.reply('Please setup your Gemini API key first: `!gemini setup YOUR_GEMINI_API_KEY`\n\n*Get your free API key from: https://makersuite.google.com/app/apikey*');
        }

        try {
            await message.channel.sendTyping();

            console.log('Searching similar conversations...');
            const similarConversations = await vectorDB.searchSimilarConversations(prompt, userId, channelId, null, 3);
            console.log('Found similar conversations:', similarConversations.length);

            const recentHistory = await getConversationHistory(userId, channelId);
            console.log('Recent history messages:', recentHistory.length);

            let contextMessages = [];
            contextMessages.push(...recentHistory);

            if (similarConversations.length > 0) {
                const contextContent = similarConversations.map(conv => 
                    `Previous conversation:\nUser: ${conv.userMessage}\nAssistant: ${conv.aiResponse}`
                ).join('\n\n');
                
                contextMessages.unshift({
                    role: 'system',
                    content: `Here's some relevant conversation history for context:\n\n${contextContent}`
                });
            }

            let fullPrompt = prompt;
            if (contextMessages.length > 0) {
                const contextText = contextMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n\n');
                fullPrompt = `Context from previous conversations:\n${contextText}\n\nCurrent user question: ${prompt}\n\nPlease answer the current question, using the context if relevant.`;
            }

            console.log('Querying Gemini API with context...');
            const { GoogleGenerativeAI } = require('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
            const result = await model.generateContent(fullPrompt);

            const candidates = result?.response?.candidates;
            const content = candidates?.[0]?.content?.parts?.[0]?.text;

            if (content) {
                await storeConversation(userId, channelId, prompt, content);
                
                await vectorDB.storeConversation(userId, channelId, prompt, content, 'gemini-2.0-flash-exp', null);
                
                return message.channel.send(content);
            } else {
                return message.reply('No response received from Gemini.');
            }
        } catch (error) {
            console.error('Error with Gemini API:', error.message);
            if (error.message.includes('API_KEY_INVALID') || error.message.includes('authentication')) {
                return message.reply('❌ Invalid Gemini API key. Please setup again: `!gemini setup YOUR_GEMINI_API_KEY`');
            } else if (error.message.includes('QUOTA_EXCEEDED')) {
                return message.reply('❌ Gemini API quota exceeded. Please check your usage limits or try again later.');
            } else {
                return message.reply('An error occurred while communicating with Gemini.');
            }
        }
    },
};

// Setup function for Gemini API key
async function handleGeminiSetup(message, args, userId) {
    if (!args[0]) {
        return message.reply('Please provide your Gemini API key: `!gemini setup YOUR_GEMINI_API_KEY`\n\n📋 **How to get your free Gemini API key:**\n1. Visit: https://makersuite.google.com/app/apikey\n2. Sign in with your Google account\n3. Click "Create API Key"\n4. Copy your key and use: `!gemini setup YOUR_KEY`\n\n*Your key will be stored securely and only used for your requests.*');
    }
    
    const apiKey = args[0];
    const userKeyCache = `user:${userId}:gemini_key`;
    
    try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
        await model.generateContent('Hello');
        
        await setCache(userKeyCache, apiKey, 86400 * 30); // Store for 30 days
        await message.reply('✅ **Gemini API key stored successfully!**\n\n🚀 You can now start chatting:\n• `!gemini <your message>` - Chat with Gemini AI\n• `!gemini clear` - Clear conversation history\n\n💡 *Your conversations will be stored with RAG memory for context awareness!*');
    } catch (error) {
        console.error('Gemini API key test failed:', error.message);
        await message.reply('❌ **Invalid Gemini API key!**\n\nPlease check your key and try again: `!gemini setup YOUR_GEMINI_API_KEY`\n\n📋 **Get your free API key from:**\nhttps://makersuite.google.com/app/apikey');
    }
}

async function handleClearHistory(message, userId) {
    const channelId = message.channel.id;
    const historyKey = `conversation:${userId}:${channelId}`;
    
    try {
        await setCache(historyKey, JSON.stringify([]), 86400 * 7);
        await vectorDB.clearUserHistory(userId, channelId);
        await message.reply('✅ Conversation history cleared for this channel.');
    } catch (error) {
        console.error('Error clearing history:', error);
        await message.reply('Failed to clear history.');
    }
}

async function getConversationHistory(userId, channelId) {
    const historyKey = `conversation:${userId}:${channelId}`;
    const cachedHistory = await getCache(historyKey);
    
    if (!cachedHistory) {
        return [];
    }
    
    try {
        const history = JSON.parse(cachedHistory);
        return history.slice(-6);
    } catch (error) {
        console.error('Error parsing history:', error);
        return [];
    }
}

async function storeConversation(userId, channelId, userMessage, aiResponse) {
    const historyKey = `conversation:${userId}:${channelId}`;
    const history = await getConversationHistory(userId, channelId);
    
    history.push(
        { role: 'user', content: userMessage },
        { role: 'assistant', content: aiResponse }
    );
    
    const trimmedHistory = history.slice(-12);
    
    await setCache(historyKey, JSON.stringify(trimmedHistory), 86400 * 7);
}
