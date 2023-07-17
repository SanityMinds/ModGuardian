const { Client, Intents, MessageEmbed } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_BANS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.DIRECT_MESSAGES
  ],
});

const allowedUserId = 'INSERT_YOUR_USER_ID';
const commandPrefix = '.';
const bannedUsersFile = 'bannedUsers.json';
const appealEmail = 'example@example.com';

const bansPerPage = 10; // Number of bans to display per page

let bannedUsers = new Map();

// Load banned users from file
if (fs.existsSync(bannedUsersFile)) {
  try {
    const bannedUsersData = fs.readFileSync(bannedUsersFile, 'utf-8');
    bannedUsers = new Map(JSON.parse(bannedUsersData));
  } catch (error) {
    console.error('Error parsing banned users data:', error);
  }
}

function getUserIdFromMessage(message) {
  const mentionRegex = /^<@!?(\d+)>$/;
  const userIdRegex = /^(\d+)$/;

  if (mentionRegex.test(message)) {
    return mentionRegex.exec(message)[1];
  } else if (userIdRegex.test(message)) {
    return userIdRegex.exec(message)[1];
  } else {
    return null;
  }
}

function saveBannedUsersToFile() {
  const bannedUsersData = JSON.stringify(Array.from(bannedUsers));
  fs.writeFileSync(bannedUsersFile, bannedUsersData, 'utf-8');
}

function refreshBannedUsersCache() {
  bannedUsers = new Map(JSON.parse(fs.readFileSync(bannedUsersFile, 'utf-8')));
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith(commandPrefix) || message.author.bot) return;

  const args = message.content.slice(commandPrefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'ban') {
    if (message.author.id !== allowedUserId) {
      return message.reply('You don\'t have permission to use this command.');
    }

    const userId = getUserIdFromMessage(args[0]);
    const banReason = args.slice(1).join(' ');

    if (!userId) {
      return message.reply('Please provide a valid user ID or mention to ban.');
    }

    try {
      const bannedUser = await client.users.fetch(userId);

      try {
        const dmChannel = await bannedUser.createDM();
        if (dmChannel) {
          const banMessage = `You have been banned from all servers which this bot is currently in for ${banReason || 'No reason provided'}. You may appeal to ${appealEmail}.`;
          await dmChannel.send(banMessage);
        } else {
          console.log(`Failed to send DM to banned user: ${bannedUser.tag}`);
        }
      } catch (error) {
        console.error('Error sending DM to banned user:', error);
      }

      const guilds = client.guilds.cache.values();
      for (const guild of guilds) {
        await guild.bans.create(userId, { reason: banReason });
        console.log(`Banned ${bannedUser.tag} from ${guild.name}`);

        bannedUsers.set(userId, {
          username: bannedUser.username,
          userId: bannedUser.id,
          reason: banReason || 'No reason provided',
        });
      }

      saveBannedUsersToFile();
      message.reply('User has been banned from all servers.');
    } catch (error) {
      console.error('Error banning user:', error);
      message.reply('An error occurred while banning the user.');
    }
  } else if (command === 'unban') {
    if (message.author.id !== allowedUserId) {
      return message.reply('You don\'t have permission to use this command.');
    }

    const userId = getUserIdFromMessage(args[0]);

    if (!userId) {
      return message.reply('Please provide a valid user ID to unban.');
    }

    try {
      const bans = await message.guild.bans.fetch();
      const bannedUser = bans.find((ban) => ban.user.id === userId);

      if (!bannedUser) {
        return message.reply('User is not currently banned.');
      }

      await message.guild.bans.remove(userId);
      console.log(`Unbanned user with ID ${userId} from ${message.guild.name}`);

      bannedUsers.delete(userId);

      saveBannedUsersToFile();
      refreshBannedUsersCache();

      message.reply('User has been unbanned.');
    } catch (error) {
      console.error('Error unbanning user:', error);
      message.reply('An error occurred while unbanning the user.');
    }
  } else if (command === 'bans') {
    if (message.author.id !== allowedUserId) {
      return message.reply('You don\'t have permission to use this command.');
    }

    if (bannedUsers.size === 0) {
      return message.reply('No users are currently banned.');
    }

    const page = parseInt(args[0], 10) || 1;

    const startIndex = (page - 1) * bansPerPage;
    const endIndex = page * bansPerPage;

    const bansArray = Array.from(bannedUsers.values());
    const totalPages = Math.ceil(bansArray.length / bansPerPage);

    if (page > totalPages) {
      return message.reply(`Invalid page number. Please enter a number between 1 and ${totalPages}.`);
    }

    const bansToDisplay = bansArray.slice(startIndex, endIndex);

    const embed = new MessageEmbed()
      .setColor('#FF0000')
      .setTitle('Banned Users')
      .setDescription(`Page ${page}`);

    bansToDisplay.forEach((banInfo) => {
      embed.addField('Username', banInfo.username, true);
      embed.addField('User ID', banInfo.userId, true);
      embed.addField('Reason', banInfo.reason, false);
      embed.addFields({ name: '\u200B', value: '\u200B' });
    });

    message.channel.send({ embeds: [embed] });
  }
});

client.on('guildMemberAdd', (member) => {
  if (bannedUsers.has(member.user.id)) {
    member.ban({ reason: 'Banned user rejoined the server.' })
      .then(() => {
        console.log(`Banned ${member.user.tag} who rejoined the server.`);
      })
      .catch((error) => {
        console.error('Error banning rejoined user:', error);
      });
  }
});

// Register slash commands in every guild the bot is a member of
client.on('ready', async () => {
  try {
    const guilds = client.guilds.cache.values();
    for (const guild of guilds) {
      await guild.commands.set([
        {
          name: 'report',
          description: 'Report a user',
          options: [
            {
              name: 'user_id',
              description: 'User ID',
              type: 'STRING',
              required: true,
            },
            {
              name: 'username',
              description: 'Username',
              type: 'STRING',
              required: true,
            },
            {
              name: 'reporting_message',
              description: 'Reporting message',
              type: 'STRING',
              required: true,
            },
            {
              name: 'evidence',
              description: 'Screenshot or evidence',
              type: 'STRING',
              required: true,
            },
            {
              name: 'contact',
              description: 'Contact information (optional)',
              type: 'STRING',
              required: false,
            },
          ],
        },
      ]);
      console.log(`Slash commands registered in ${guild.name}`);
    }
    console.log('Slash commands registered successfully in all guilds.');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
});

// Handle slash command interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  if (commandName === 'report') {
    const userId = options.getString('user_id');
    const username = options.getString('username');
    const reportingMessage = options.getString('reporting_message');
    const evidence = options.getString('evidence');
    const contact = options.getString('contact');

    if (!userId || !username || !reportingMessage || !evidence) {
      return interaction.reply('Please provide all required fields.');
    }

    const reportChannelId = 'REPORT_CHANNEL';

    let reportedUser;
    try {
      reportedUser = await client.users.fetch(userId);
    } catch (error) {
      console.error('Error fetching user:', error);
      return interaction.reply('Failed to fetch user information.');
    }

    const embed = new MessageEmbed()
      .setColor('#FF0000')
      .setTitle('New Report')
      .addField('User ID', userId)
      .addField('Username', username)
      .addField('Reporting Message', reportingMessage)
      .addField('Evidence', evidence) 
      .addField('Contact', contact || 'Not provided')
      .addField('Reported by', `${interaction.user.tag} (${interaction.user.id})`)
      .setFooter(`Reported by ${interaction.user.tag}`)
      .setTimestamp();

    const reportChannel = await interaction.guild.channels.fetch(reportChannelId);
    if (reportChannel && reportChannel.isText()) {
      await reportChannel.send({ embeds: [embed] });
      await interaction.reply('Report submitted successfully.');
    } else {
      await interaction.reply('Failed to submit the report. Please try again later.');
    }
  }
});

client.login('BOT_TOKEN');

