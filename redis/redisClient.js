const { createClient } = require('redis');

const redisClient = createClient();

redisClient.on('error', (err) => {
    console.error('Redis connection error:', err);
});

(async () => {
    await redisClient.connect();
    console.log('Redis client connected');
})();

module.exports = redisClient;
