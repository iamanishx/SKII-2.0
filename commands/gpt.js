const { OpenAI } = require('openai');

 const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,  
});

module.exports = {
    name: 'gpt',
    description: 'Chat with GPT-3.5',
    async execute(message, args) {
        if (!args.length) {
            return message.reply('Please provide a prompt or question.');
        }

        const prompt = args.join(' ');

        try {
             const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
            });

            const reply = response.choices[0].message.content.trim();
            message.channel.send(reply);
        } catch (error) {
            console.error('Error with OpenAI API:', error.message);
            message.reply('An error occurred while fetching the response from GPT-3.5.');
        }
    },
};
