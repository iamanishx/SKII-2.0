const redisClient = require('./redisClient');  

/**
  * @param {string} key 
 * @returns {Promise<string|null>}  
 */
async function getCache(key) {
    try {
        return await redisClient.get(key);
    } catch (err) {
        console.error(`Redis GET error for key "${key}":`, err);
        return null;
    }
}

/**
  * @param {string} key  
 * @param {string} value  
 * @param {number} ttl  
 */
async function setCache(key, value, ttl) {
    try {
        await redisClient.set(key, value, { EX: ttl });
    } catch (err) {
        console.error(`Redis SET error for key "${key}":`, err);
    }
}

module.exports = { getCache, setCache };
