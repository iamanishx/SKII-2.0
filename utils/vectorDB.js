const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class VectorDB {
    constructor() {
        this.qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
        this.collectionName = 'discord_conversations';
        this.embeddingModel = null;
        this.fallbackEmbeddingModel = null;
    }

    async initialize() {
        try {
            await this.createCollection();
            console.log('Vector database initialized successfully');
        } catch (error) {
            console.error('Failed to initialize vector database:', error.message);
        }
    }

    async createCollection() {
        try {
            const response = await axios.get(`${this.qdrantUrl}/collections/${this.collectionName}`);
            console.log('Collection already exists');
        } catch (error) {
            if (error.response?.status === 404) {
                try {
                    await axios.put(`${this.qdrantUrl}/collections/${this.collectionName}`, {
                        vectors: {
                            size: 384,
                            distance: 'Cosine'
                        }
                    });
                    console.log('Collection created successfully with 384-dimensional vectors');
                } catch (createError) {
                    console.error('Failed to create collection:', createError.message);
                }
            } else {
                console.error('Error checking collection:', error.message);
            }
        }
    }

    async createEmbedding(text, apiKey, userId = null) {
        if (userId) {
            const { getCache } = require('../redis/redisUtils');
            const embeddingMode = await getCache(`user:${userId}:embedding_mode`);
            
            if (embeddingMode === 'paid' && apiKey) {
                try {
                    console.log('Using paid OpenRouter embeddings...');
                    const response = await axios.post('https://openrouter.ai/api/v1/embeddings', {
                        model: 'openai/text-embedding-3-small',
                        input: text,
                        dimensions: 384 
                    }, {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    return response.data.data[0].embedding;
                } catch (error) {
                    console.log('Paid embedding failed, falling back to free local embeddings...');
                    console.error('Error:', error.response?.data || error.message);
                }
            }
        }
        console.log('Using free local embedding generation...');
        return this.createLocalEmbedding(text);
    }

    createLocalEmbedding(text) {
        const embedding = new Array(384).fill(0);
        const words = text.toLowerCase().split(/\s+/);
        const sentences = text.split(/[.!?]+/);
        const wordFreq = {};
        words.forEach(word => {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        });
        
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const freq = wordFreq[word];
            const position = i / words.length;
            
            for (let j = 0; j < word.length; j++) {
                const charCode = word.charCodeAt(j);
                const index1 = (charCode + i * 7 + j * 13) % 384;
                const index2 = (charCode * freq + i * 17) % 384;
                
                embedding[index1] += (1 + Math.log(freq)) * (1 - position * 0.1);
                embedding[index2] += Math.sin(charCode / 100) * freq;
            }
            
            if (i < words.length - 1) {
                const bigram = word + words[i + 1];
                for (let k = 0; k < Math.min(bigram.length, 10); k++) {
                    const index = (bigram.charCodeAt(k) * (k + 1) + i) % 384;
                    embedding[index] += 0.5;
                }
            }
        }
        
        sentences.forEach((sentence, idx) => {
            const sentenceLength = sentence.length;
            const index = (sentenceLength + idx * 31) % 384;
            embedding[index] += sentences.length > 1 ? 1 / sentences.length : 1;
        });
        
        const textLength = text.length;
        const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
        
        embedding[0] += Math.log(textLength + 1) / 10;
        embedding[1] += avgWordLength / 10;
        embedding[2] += words.length / 100;
        embedding[3] += sentences.length / 10;
        
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
    }

    async storeConversation(userId, channelId, userMessage, aiResponse, model, apiKey) {
        try {
            const conversationText = `User: ${userMessage}\nAssistant: ${aiResponse}`;
            const embedding = await this.createEmbedding(conversationText, apiKey, userId);
            
            const point = {
                id: uuidv4(),
                vector: embedding,
                payload: {
                    userId,
                    channelId,
                    userMessage,
                    aiResponse,
                    model,
                    timestamp: new Date().toISOString(),
                    conversationText
                }
            };

            await axios.put(`${this.qdrantUrl}/collections/${this.collectionName}/points`, {
                points: [point]
            });

            console.log('Conversation stored in vector database');
        } catch (error) {
            console.error('Error storing conversation in vector DB:', error.message);
        }
    }

    async searchSimilarConversations(query, userId, channelId, apiKey, limit = 5) {
        try {
            const queryEmbedding = await this.createEmbedding(query, apiKey, userId);
            
            const searchResponse = await axios.post(`${this.qdrantUrl}/collections/${this.collectionName}/points/search`, {
                vector: queryEmbedding,
                filter: {
                    must: [
                        { key: 'userId', match: { value: userId } },
                        { key: 'channelId', match: { value: channelId } }
                    ]
                },
                limit,
                with_payload: true
            });

            return searchResponse.data.result.map(result => ({
                score: result.score,
                userMessage: result.payload.userMessage,
                aiResponse: result.payload.aiResponse,
                timestamp: result.payload.timestamp,
                model: result.payload.model
            }));
        } catch (error) {
            console.error('Error searching similar conversations:', error.message);
            return [];
        }
    }

    async getRecentConversations(userId, channelId, limit = 10) {
        try {
            const scrollResponse = await axios.post(`${this.qdrantUrl}/collections/${this.collectionName}/points/scroll`, {
                filter: {
                    must: [
                        { key: 'userId', match: { value: userId } },
                        { key: 'channelId', match: { value: channelId } }
                    ]
                },
                limit,
                with_payload: true,
                order_by: [{ key: 'timestamp', direction: 'desc' }]
            });

            return scrollResponse.data.result.points.map(point => ({
                userMessage: point.payload.userMessage,
                aiResponse: point.payload.aiResponse,
                timestamp: point.payload.timestamp,
                model: point.payload.model
            }));
        } catch (error) {
            console.error('Error getting recent conversations:', error.message);
            return [];
        }
    }

    async clearUserHistory(userId, channelId) {
        try {
            await axios.post(`${this.qdrantUrl}/collections/${this.collectionName}/points/delete`, {
                filter: {
                    must: [
                        { key: 'userId', match: { value: userId } },
                        { key: 'channelId', match: { value: channelId } }
                    ]
                }
            });
            console.log('User history cleared from vector database');
        } catch (error) {
            console.error('Error clearing user history:', error.message);
        }
    }
}

module.exports = new VectorDB();
