const axios = require('axios');
const { getCache, setCache } = require('../redis/redisUtils');
const vectorDB = require('../utils/vectorDB');

module.exports = {
    name: 'rag',
    description: 'Chat with AI models through OpenRouter with vector-based memory',
    async execute(message, args) {
        const subcommand = args[0];
        const userId = message.author.id;
        
        try {
            switch (subcommand) {
                case 'setup':
                    await handleSetup(message, args.slice(1), userId);
                    break;
                case 'models':
                    await handleModels(message, args.slice(1), userId);
                    break;
                case 'select':
                    await handleModelSelect(message, args.slice(1), userId);
                    break;
                case 'chat':
                    await handleChat(message, args.slice(1), userId);
                    break;
                case 'clear':
                    await handleClearHistory(message, userId);
                    break;
                case 'search':
                    await handleSearchHistory(message, args.slice(1), userId);
                    break;
                case 'embeddings':
                    await handleEmbeddingMode(message, args.slice(1), userId);
                    break;
                default:
                    if (!subcommand) {
                        await handleChat(message, args, userId);
                    } else {
                        await message.reply(`Unknown command. Use: \`!rag setup <api_key>\`, \`!rag models\`, \`!rag select <model_name>\`, \`!rag embeddings <free|paid>\`, \`!rag chat <message>\`, \`!rag search <query>\`, or \`!rag clear\``);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error in RAG command:', error.message);
            await message.reply('An error occurred while processing your request.');
        }
    },
};

async function handleSetup(message, args, userId) {
    if (!args[0]) {
        return message.reply('Please provide your OpenRouter API key: `!rag setup YOUR_API_KEY`');
    }
    
    const apiKey = args[0];
    const userKeyCache = `user:${userId}:openrouter_key`;
    
    await setCache(userKeyCache, apiKey, 86400 * 30);
    await message.reply('✅ API key stored successfully! Use `!rag models` to see available models.');
}

async function handleEmbeddingMode(message, args, userId) {
    const mode = args[0]?.toLowerCase();
    if (!mode || !['free', 'paid'].includes(mode)) {
        return message.reply('❌ Please specify embedding mode: `!rag embeddings free` or `!rag embeddings paid`');
    }
    
    const userEmbeddingCache = `user:${userId}:embedding_mode`;
    await setCache(userEmbeddingCache, mode, 86400 * 30);
    
    if (mode === 'free') {
        await message.reply('✅ **Free Local Embeddings** enabled!\n🔹 No API costs\n🔹 Privacy-focused (no data sent to external APIs)\n🔹 Good semantic search quality\n\n*This is the default mode and works great for most use cases.*');
    } else {
        await message.reply('✅ **Paid OpenRouter Embeddings** enabled!\n🔹 Higher quality embeddings\n🔹 Uses your OpenRouter API credits\n🔹 Best semantic search accuracy\n\n*Make sure you have OpenRouter credits for embedding API calls.*');
    }
}

async function handleModels(message, args, userId) {
    const showPaid = args[0] === 'paid';
    const userKeyCache = `user:${userId}:openrouter_key`;
    const apiKey = await getCache(userKeyCache);
    
    if (!apiKey) {
        return message.reply('Please setup your API key first: `!rag setup YOUR_API_KEY`');
    }
    
    try {
        const response = await axios.get('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        const models = response.data.data;
        const filteredModels = models.filter(model => {
            const isFree = model.pricing?.prompt === '0' && model.pricing?.completion === '0';
            return showPaid ? !isFree : isFree;
        });
        
        if (filteredModels.length === 0) {
            return message.reply(`No ${showPaid ? 'paid' : 'free'} models available.`);
        }
        
        let modelList = `**${showPaid ? 'Paid' : 'Free'} Models Available:**\n\n`;
        filteredModels.slice(0, 15).forEach((model, index) => {
            const contextWindow = model.context_length ? `${model.context_length}k` : `${getModelContextWindow(model.id)}k*`;
            modelList += `${index + 1}. **${model.id}**\n   Context: ${contextWindow} | ${model.name || 'No description'}\n\n`;
        });
        
        if (filteredModels.length > 15) {
            modelList += `... and ${filteredModels.length - 15} more models\n\n`;
        }
        
        modelList += `\nUse \`!rag select <model_id>\` to choose a model\n`;
        modelList += `Use \`!rag models ${showPaid ? '' : 'paid'}\` to see ${showPaid ? 'free' : 'paid'} models\n`;
        modelList += `*Context windows are estimated for optimal performance`;
        
        await message.channel.send(modelList);
        
    } catch (error) {
        console.error('Error fetching models:', error.response?.data || error.message);
        await message.reply('Failed to fetch models. Please check your API key.');
    }
}

async function handleModelSelect(message, args, userId) {
    if (!args[0]) {
        return message.reply('Please specify a model: `!rag select <model_id>`');
    }
    
    const modelId = args.join('/'); 
    const userModelCache = `user:${userId}:selected_model`;
    const contextWindow = getModelContextWindow(modelId);
    
    await setCache(userModelCache, modelId, 86400 * 30); 
    await message.reply(`✅ Model selected: **${modelId}**\n📊 Context Window: **${contextWindow}k tokens**\nYou can now start chatting with \`!rag chat <message>\` or just \`!rag <message>\`\n\n*Tip: Use \`!rag clear\` if conversations get too long for the context window.*`);
}

async function handleChat(message, args, userId) {
    if (!args.length) {
        return message.reply('Please provide a message to chat.');
    }
    
    const userKeyCache = `user:${userId}:openrouter_key`;
    const userModelCache = `user:${userId}:selected_model`;
    
    const apiKey = await getCache(userKeyCache);
    const selectedModel = await getCache(userModelCache);
    
    if (!apiKey) {
        return message.reply('Please setup your API key first: `!rag setup YOUR_API_KEY`');
    }
    
    if (!selectedModel) {
        return message.reply('Please select a model first: `!rag models` then `!rag select <model_id>`');
    }
    
    const userMessage = args.join(' ');
    const channelId = message.channel.id;
    
    try {
        await message.channel.sendTyping();
        
        const recentHistory = await getConversationHistory(userId, channelId);
        const similarConversations = await vectorDB.searchSimilarConversations(userMessage, userId, channelId, apiKey, 3);
        
        let contextMessages = [];
        
        contextMessages.push(...recentHistory);
        
        if (similarConversations.length > 0) {
            const contextSummary = similarConversations
                .filter(conv => conv.score > 0.7) // Only high similarity matches
                .map(conv => `Previous context: User asked "${conv.userMessage}" and got "${conv.aiResponse.substring(0, 200)}..."`)
                .join('\n');
            
            if (contextSummary) {
                contextMessages.unshift({
                    role: 'system',
                    content: `Relevant conversation history:\n${contextSummary}`
                });
            }
        }
        
        const messages = [
            {
                role: 'system',
                content: 'You are a helpful AI assistant. Use the conversation history and context to provide relevant, contextual responses. Keep responses concise and helpful.'
            },
            ...contextMessages,
            {
                role: 'user',
                content: userMessage
            }
        ];
        
        const modelContextWindow = getModelContextWindow(selectedModel);
        const trimmedMessages = trimMessages(messages, modelContextWindow * 0.7); // Use 70% of context window
        
        console.log(`Using ${trimmedMessages.length} messages for context (${modelContextWindow}k context window)`);
        
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: selectedModel,
            messages: trimmedMessages,
            max_tokens: Math.min(1000, modelContextWindow * 0.2 * 1000), // 20% of context for response
            temperature: 0.7,
            stream: false 
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://discord.com',
                'X-Title': 'Discord Bot'
            }
        });
        
        const aiResponse = response.data.choices[0].message.content;
        
        await storeConversation(userId, channelId, userMessage, aiResponse, selectedModel);
        await vectorDB.storeConversation(userId, channelId, userMessage, aiResponse, selectedModel, apiKey);
        
        await sendResponseWithTyping(message.channel, aiResponse);
        
    } catch (error) {
        console.error('Error in chat:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            await message.reply('Invalid API key. Please setup again: `!rag setup YOUR_API_KEY`');
        } else if (error.response?.status === 400) {
            await message.reply('Invalid model or request. Please select a different model.');
        } else if (error.response?.status === 413 || error.message.includes('context')) {
            await message.reply('Message too long for model context. Try a shorter message or use `!rag clear` to reset conversation history.');
        } else {
            await message.reply('An error occurred while processing your message.');
        }
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

async function handleSearchHistory(message, args, userId) {
    if (!args.length) {
        return message.reply('Please provide a search query: `!rag search <query>`');
    }
    
    const query = args.join(' ');
    const channelId = message.channel.id;
    const userKeyCache = `user:${userId}:openrouter_key`;
    const apiKey = await getCache(userKeyCache);
    
    if (!apiKey) {
        return message.reply('Please setup your API key first: `!rag setup YOUR_API_KEY`');
    }
    
    try {
        await message.channel.sendTyping();
        
        const similarConversations = await vectorDB.searchSimilarConversations(query, userId, channelId, apiKey, 5);
        
        if (similarConversations.length === 0) {
            return message.reply('No relevant conversations found.');
        }
        
        let searchResults = `**Search results for: "${query}"**\n\n`;
        
        similarConversations.forEach((conv, index) => {
            const date = new Date(conv.timestamp).toLocaleDateString();
            const similarity = Math.round(conv.score * 100);
            
            searchResults += `**${index + 1}. (${similarity}% match) - ${date}**\n`;
            searchResults += `**User:** ${conv.userMessage.substring(0, 100)}${conv.userMessage.length > 100 ? '...' : ''}\n`;
            searchResults += `**AI:** ${conv.aiResponse.substring(0, 150)}${conv.aiResponse.length > 150 ? '...' : ''}\n`;
            searchResults += `**Model:** ${conv.model}\n\n`;
        });
        
        if (searchResults.length > 2000) {
            const chunks = splitMessage(searchResults);
            for (const chunk of chunks) {
                await message.channel.send(chunk);
            }
        } else {
            await message.channel.send(searchResults);
        }
        
    } catch (error) {
        console.error('Error searching history:', error);
        await message.reply('Failed to search conversation history.');
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
        return history.slice(-10);
    } catch (error) {
        console.error('Error parsing history:', error);
        return [];
    }
}

async function storeConversation(userId, channelId, userMessage, aiResponse, model) {
    const historyKey = `conversation:${userId}:${channelId}`;
    const history = await getConversationHistory(userId, channelId);
    
    history.push(
        { role: 'user', content: userMessage },
        { role: 'assistant', content: aiResponse }
    );
    
    const trimmedHistory = history.slice(-20);
    
    await setCache(historyKey, JSON.stringify(trimmedHistory), 86400 * 7);
}

function trimMessages(messages, maxTokens) {
    const maxChars = maxTokens * 4;
    let totalChars = 0;
    const trimmedMessages = [];
    
    if (messages[0]?.role === 'system') {
        trimmedMessages.push(messages[0]);
        totalChars += messages[0].content.length;
    }
    
    for (let i = messages.length - 1; i >= 1; i--) {
        const messageChars = messages[i].content.length;
        if (totalChars + messageChars <= maxChars) {
            trimmedMessages.unshift(messages[i]);
            totalChars += messageChars;
        } else {
            break;
        }
    }
    
    return trimmedMessages;
}

function getModelContextWindow(modelId) {
    const contextWindows = {
        'mistralai/mistral-7b-instruct:free': 8,
        'microsoft/phi-3-mini-128k-instruct:free': 128,
        'huggingfaceh4/zephyr-7b-beta:free': 4,
        'openchat/openchat-7b:free': 8,
        'google/gemma-2-9b-it:free': 8,
        'meta-llama/llama-3.1-8b-instruct:free': 128,
        
        'openai/gpt-4': 8,
        'openai/gpt-4-turbo': 128,
        'openai/gpt-3.5-turbo': 16,
        'anthropic/claude-3-sonnet': 200,
        'anthropic/claude-3-haiku': 200,
        'google/gemini-pro': 32,
        'meta-llama/llama-3.1-70b-instruct': 128,
        'mistralai/mistral-large': 32,
    };
    
    return contextWindows[modelId] || 8;
}

async function sendResponseWithTyping(channel, response) {
    const chunks = splitMessage(response, 1500); 
    
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        await channel.sendTyping();
        
        const typingDelay = Math.min(Math.max(chunk.length * 30, 1000), 4000);
        await new Promise(resolve => setTimeout(resolve, typingDelay));
        
        await channel.send(chunk);
        
        if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }
}

function splitMessage(message, maxLength = 2000) {
    const chunks = [];
    while (message.length > 0) {
        let chunk = message.slice(0, maxLength);
        const lastNewline = chunk.lastIndexOf('\n');
        const lastSpace = chunk.lastIndexOf(' ');
        const lastSentence = chunk.lastIndexOf('. ');
        
        if (lastSentence > -1 && lastSentence > maxLength * 0.6) {
            chunk = message.slice(0, lastSentence + 2);
        } else if (lastNewline > -1 && lastNewline > maxLength * 0.5) {
            chunk = message.slice(0, lastNewline + 1);
        } else if (lastSpace > -1 && lastSpace > maxLength * 0.5) {
            chunk = message.slice(0, lastSpace + 1);
        }
        
        chunks.push(chunk.trim());
        message = message.slice(chunk.length).trim();
    }
    return chunks.filter(chunk => chunk.length > 0);
}
