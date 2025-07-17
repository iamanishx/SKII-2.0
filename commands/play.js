const { SlashCommandBuilder } = require("@discordjs/builders")
const { EmbedBuilder } = require("discord.js")
const { QueryType } = require("discord-player")

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("play a song from YouTube.")
        .addSubcommand(subcommand =>
            subcommand
                .setName("search")
                .setDescription("Searches for a song and plays it")
                .addStringOption(option =>
                    option.setName("searchterms").setDescription("search keywords").setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("playlist")
                .setDescription("Plays a playlist from YT")
                .addStringOption(option => option.setName("url").setDescription("the playlist's url").setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("song")
                .setDescription("Plays a single song from YT")
                .addStringOption(option => option.setName("url").setDescription("the song's url").setRequired(true))
        ),

    name: "play",

    execute: async (context) => {
        // Determine interaction context
        const interaction = context.interaction || context;
        const client = context.client || interaction.client;
        
        // Safely get user and guild
        const user = interaction.user || interaction.author;
        const guild = interaction.guild;

        if (!guild) {
            return interaction.reply("This command can only be used in a server.");
        }

        // Safely fetch member
        let member;
        try {
            member = await guild.members.fetch(user.id);
        } catch (error) {
            console.error("Error fetching member:", error);
            return interaction.reply("Could not fetch your server member information.");
        }

        if (!member.voice.channel) {
            return interaction.reply("You need to be in a Voice Channel to play a song.");
        }

        // Careful null check for permissions
        const botMember = guild.members.me;
        if (!botMember) {
            return interaction.reply("I'm not a proper member of this server.");
        }

        const hasPermissions = botMember.permissionsIn(member.voice.channel).has(["Connect", "Speak"]);
        if (!hasPermissions) {
            return interaction.reply("I don't have permission to join and speak in your voice channel.");
        }

        let queue;
        try {
            queue = await client.player.createQueue(guild);
        } catch (error) {
            console.error("Error creating queue:", error);
            return interaction.reply("There was an error creating the music queue.");
        }

        try {
            if (!queue.connection) await queue.connect(member.voice.channel);
        } catch (error) {
            console.error("Error connecting to voice channel:", error);
            client.player.deleteQueue(guild.id);
            return interaction.reply("I couldn't join your voice channel.");
        }

        let embed = new EmbedBuilder();
        let searchTerms, url;

        // Handling different command contexts
        if (interaction.commandName) {
            // Slash command context
            switch (interaction.options.getSubcommand()) {
                case "song":
                    url = interaction.options.getString("url");
                    break;
                case "playlist":
                    url = interaction.options.getString("url");
                    break;
                case "search":
                    searchTerms = interaction.options.getString("searchterms");
                    break;
            }
        }

        let result;
        try {
            if (url) {
                // Determine if it's a playlist or song URL
                result = await client.player.search(url, {
                    requestedBy: user,
                    searchEngine: url.includes("playlist") ? QueryType.YOUTUBE_PLAYLIST : QueryType.YOUTUBE_VIDEO
                });
            } else if (searchTerms) {
                result = await client.player.search(searchTerms, {
                    requestedBy: user,
                    searchEngine: QueryType.AUTO
                });
            }

            if (!result || result.tracks.length === 0) {
                return interaction.reply("No results found.");
            }

            if (result.playlist) {
                await queue.addTracks(result.tracks);
                embed.setDescription(`**${result.tracks.length} songs from [${result.playlist.title}](${result.playlist.url})** have been added to the Queue`)
                    .setThumbnail(result.playlist.thumbnail);
            } else {
                const song = result.tracks[0];
                await queue.addTrack(song);
                embed.setDescription(`**[${song.title}](${song.url})** has been added to the Queue`)
                    .setThumbnail(song.thumbnail)
                    .setFooter({ text: `Duration: ${song.duration}` });
            }

            if (!queue.playing) await queue.play();

            await interaction.reply({
                embeds: [embed],
            });
        } catch (error) {
            console.error("Error playing music:", error);
            await interaction.reply("An error occurred while trying to play the music.");
        }
    },
};