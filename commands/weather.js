const axios = require('axios');
const { getCache, setCache } = require('../redis/redisUtils');  

module.exports = {
    name: 'weather',
    description: 'Fetches weather information for a given location.',
    execute: async (message, args) => {
        if (!args.length) {
            message.channel.send('Please provide a location. Usage: `!weather <location>`');
            return;
        }

        const location = args.join(' ');
        const cacheKey = `weather:${location.toLowerCase()}`;
        const apiKey = process.env.WEATHER_API_KEY;
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${location}&units=metric&appid=${apiKey}`;

        try {
             const cachedWeather = await getCache(cacheKey);
            if (cachedWeather) {
                console.log('Cache hit for weather location:', location);
                await message.channel.sendTyping();
                return message.channel.send(cachedWeather);
            }

            console.log('Cache miss, querying OpenWeatherMap API...');
            await message.channel.sendTyping();

             const response = await axios.get(url);
            const data = response.data;

            const weatherMessage = `\`\`\`
Weather in ${data.name}:
🌡️ Temperature: ${data.main.temp}°C
🌧️ Condition: ${data.weather[0].description}
💧 Humidity: ${data.main.humidity}%
💨 Wind Speed: ${data.wind.speed} m/s
            \`\`\``;

             await setCache(cacheKey, weatherMessage, 300);

            message.channel.send(weatherMessage);
        } catch (error) {
            console.error('Error fetching weather data:', error.message);
            message.channel.send(
                'Could not fetch weather data. Please check the location and try again.'
            );
        }
    },
};
