const { GenerativeModel } = require('@google/generative-ai');

module.exports = {
  name: 'gemini',
  description: 'Chat with Google Gemini AI',
  async execute(message, args) {
    if (!args.length) {
      return message.reply('Please provide a prompt or question.');
    }

    const prompt = args.join(' ');
    const apiKey = process.env.GEMINI_API_KEY;

    try {
      await message.channel.sendTyping();

      const genAI = new GenerativeModel(apiKey, { model: 'gemini-1.5-pro' });
      const result = await genAI.generateContent(prompt);

       console.log('Raw response from Gemini:', JSON.stringify(result, null, 2));

       const candidates = result?.response?.candidates;
      const content = candidates?.[0]?.content?.parts?.[0]?.text;

      if (content) {
         message.channel.send(content);
      } else {
        message.reply('No response received from Gemini.');
      }
    } catch (error) {
      console.error('Error with Gemini API:', error.message);
      message.reply('There was an error communicating with Gemini. Please try again later.');
    }
  },
};
