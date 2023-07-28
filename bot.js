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

const allowedUserId = 'USER IDS'; // User IDs for moderators who can ban
const commandPrefix = '...'; //prefix
const bannedUsersFile = 'bannedUsers.json'; //banned users file for storing and accessing user DB of banned users
const appealEmail = 'appeals@bytelabs.site'; //Appeal email inserted here
const blockedWords = ['BAD WORD','BADWORD'].filter(word => word.trim() !== ''); // Badwords which are logged and moderated
const logChannelId = 'log channel'; // Logs all "badwords" sent in channels the bot can see and sends it to the channel

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

// Function to check if a name contains any of the blocked words
function containsBlockedWords(name) {
  const lowerCaseName = name.toLowerCase();
  return blockedWords.some((word) => lowerCaseName.includes(word));
}

async function unbanUserFromAllServers(userId) {
  const guilds = client.guilds.cache.values();
  for (const guild of guilds) {
    try {
      const bans = await guild.bans.fetch();
      const bannedUser = bans.find((ban) => ban.user.id === userId);
      if (bannedUser) {
        await guild.bans.remove(userId);
        console.log(`Unbanned user with ID ${userId} from ${guild.name}`);
      }
    } catch (error) {
      console.error(`Error unbanning user with ID ${userId} from ${guild.name}:`, error);
    }
  }
}

async function kickUnder7DaysOldMembers() {
  try {
    const guilds = client.guilds.cache.values();
    for (const guild of guilds) {
      try {
        const members = await guild.members.fetch();
        for (const member of members.values()) {
          const accountAgeInDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
          if (accountAgeInDays < 7) {
            try {
              // Send a direct message to the user (optional)
              const dmChannel = await member.user.createDM();
              if (dmChannel) {
                const kickMessage =
                  `Hello ${member.user.username},\n` +
                  `You have been kicked from this server because your Discord account is less than 7 days old. ` +
                  `If you believe this is a mistake, please email your appeal to ${appealEmail}.`;
                await dmChannel.send(kickMessage);
              }
            } catch (error) {
              console.error('Error sending DM to kicked user:', error);
            }

            // Kick the user from the server
            try {
              await member.kick('Account age is less than 7 days');
              console.log(`Kicked ${member.user.tag} from ${guild.name}`);
            } catch (error) {
              if (error.code === 50013) {
                // If the bot lacks the necessary permissions, it will not attempt to kick the user.
                console.error(`Missing permissions to kick ${member.user.tag} from ${guild.name}`);
              } else {
                console.error(`Error kicking ${member.user.tag} from ${guild.name}:`, error);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching members from ${guild.name}:`, error);
      }
    }
  } catch (error) {
    console.error('Error fetching guilds:', error);
  }
}

// Function to kick users with inappropriate usernames
async function kickUsersWithInappropriateNames() {
  try {
    const guilds = client.guilds.cache.values();
    for (const guild of guilds) {
      try {
        const members = await guild.members.fetch();
        for (const member of members.values()) {
          if (containsBlockedWords(member.user.username)) {
            try {
              // Send a direct message to the user
              const dmChannel = await member.user.createDM();
              if (dmChannel) {
                const kickMessage =
                  `Hello ${member.user.username},\n` +
                  `You have been kicked from ${guild.name} because your username or nickname contains inappropriate words. ` +
                  `If you believe this is a mistake or have any queries, please email ${appealEmail}.`;
                await dmChannel.send(kickMessage);
              }
            } catch (error) {
              console.error('Error sending DM to kicked user:', error);
            }

            // Kick the user from the server
            try {
              await member.kick('Inappropriate username detected');
              console.log(`Kicked ${member.user.tag} from ${guild.name} for having an inappropriate username.`);
            } catch (error) {
              if (error.code === 50013) {
                console.error(`Missing permissions to kick ${member.user.tag} from ${guild.name}`);
              } else {
                console.error(`Error kicking ${member.user.tag} from ${guild.name}:`, error);
              }
            }
          }
          if (member.nickname && containsBlockedWords(member.nickname)) {
            try {
              // Send a direct message to the user
              const dmChannel = await member.user.createDM();
              if (dmChannel) {
                const kickMessage =
                  `Hello ${member.user.username},\n` +
                  `You have been kicked from ${guild.name} because your username or nickname contains inappropriate words. ` +
                  `If you believe this is a mistake or have any queries, please email ${appealEmail}.`;
                await dmChannel.send(kickMessage);
              }
            } catch (error) {
              console.error('Error sending DM to kicked user:', error);
            }

            // Kick the user from the server
            try {
              await member.kick('Inappropriate nickname detected');
              console.log(`Kicked ${member.user.tag} from ${guild.name} for having an inappropriate nickname.`);
            } catch (error) {
              if (error.code === 50013) {
                console.error(`Missing permissions to kick ${member.user.tag} from ${guild.name}`);
              } else {
                console.error(`Error kicking ${member.user.tag} from ${guild.name}:`, error);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching members from ${guild.name}:`, error);
      }
    }
  } catch (error) {
    console.error('Error fetching guilds:', error);
  }
}

// Kick users with inappropriate names on a timer (3 minutes)
setInterval(kickUsersWithInappropriateNames, 3 * 60 * 1000);

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith(commandPrefix) || message.author.bot) {
    // Check for blocked words
    const lowerCaseContent = message.content.toLowerCase();
    const blockedWordFound = blockedWords.some((word) => lowerCaseContent.includes(word));

    if (blockedWordFound) {
      // Create an embed to log the offensive message
const embed = new MessageEmbed()
  .setColor('#FF0000')
  .setTitle('Offensive Message Logged')
  .addField('User ID', message.author.id)
  .addField('Username', message.author.username)
  .addField('Server Name', message.guild?.name || 'Direct Message')
  .addField('Message Content', message.content)
  .setFooter({ text: `Message ID: ${message.id}` }) // Update this line
  .setTimestamp();

      // Send the embed to the log channel
      const logChannel = client.channels.cache.get(logChannelId);
      if (logChannel && logChannel.isText()) {
        try {
          await logChannel.send({ embeds: [embed] });
        } catch (error) {
          console.error('Error sending the log message:', error);
        }
      }
    }
    return;
    }

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
        try {
          const member = await guild.members.fetch(userId);
          await member.ban({ reason: banReason });
          console.log(`Banned ${bannedUser.tag} from ${guild.name}`);
        } catch (error) {
          console.error(`Error banning ${bannedUser.tag} from ${guild.name}:`, error);
        }

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
      await unbanUserFromAllServers(userId);

      bannedUsers.delete(userId);

      saveBannedUsersToFile();
      refreshBannedUsersCache();

      message.reply('User has been unbanned from all servers.');
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
  } else if (command === 'help') {
    const botUser = client.user;
    const helpEmbed = new MessageEmbed()
      .setColor('#00FF00')
      .setTitle('Bot Help')
      .setDescription('This bot can perform the following commands:')
      .addField('Command: ban', 'Usage: `.ban <user> <reason>`\nDescription: Bans a user from all servers the bot is in.')
      .addField('Command: unban', 'Usage: `.unban <user>`\nDescription: Unbans a user.')
      .addField('Command: bans', 'Usage: `.bans [page]`\nDescription: Lists banned users.')
      .addField('Command: help', 'Usage: `.help`\nDescription: Displays this help message.');

    message.channel.send({ embeds: [helpEmbed] });
    
  } else if (command === 'servers') {
    if (message.author.id !== allowedUserId) {
      return message.reply('You don\'t have permission to use this command.');
    }

    const guilds = Array.from(client.guilds.cache.values());
    const page = parseInt(args[0], 10) || 1;
    const serversPerPage = 5;

    const totalPages = Math.ceil(guilds.length / serversPerPage);
    if (page < 1 || page > totalPages) {
      return message.reply(`Invalid page number. Please enter a number between 1 and ${totalPages}.`);
    }

    const startIndex = (page - 1) * serversPerPage;
    const endIndex = page * serversPerPage;
    const pagedGuilds = guilds.slice(startIndex, endIndex);

    const embed = new MessageEmbed()
      .setColor('#00FF00')
      .setTitle('List of Servers')
      .setDescription(`Page ${page}/${totalPages}\nHere are the servers:`)
      .setTimestamp();

    for (const guild of pagedGuilds) {
      embed.addFields(
        { name: 'Server Name', value: guild.name, inline: true },
        { name: 'Server ID', value: guild.id, inline: true },
        { name: 'Member Count', value: guild.memberCount.toString(), inline: true },
      );
    }

    message.channel.send({ embeds: [embed] });
  } else if (command === 'invite') {
    if (message.author.id !== allowedUserId) {
      return message.reply('You don\'t have permission to use this command.');
    }

    const userId = getUserIdFromMessage(args[0]);
    if (!userId) {
      return message.reply('Please provide a valid user ID to generate an invite.');
    }

    try {
      const invite = await message.channel.createInvite({ targetUser: userId });
      message.reply(`Here's the invite for the user with ID ${userId}: ${invite.url}`);
    } catch (error) {
      console.error('Error creating invite:', error);
      message.reply('An error occurred while generating the invite.');
    }
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

client.on('guildMemberAdd', async (member) => {
  const accountAgeInDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);

  if (accountAgeInDays < 7) {
    try {
      // Send a direct message to the user
      const dmChannel = await member.user.createDM();
      if (dmChannel) {
        const kickMessage =
          `Hello ${member.user.username},\n` +
          `You have been kicked from this server because your Discord account is less than 7 days old. ` +
          `If you believe this is a mistake, please email your appeal to ${appealEmail}.`;
        await dmChannel.send(kickMessage);
      }
    } catch (error) {
      console.error('Error sending DM to kicked user:', error);
    }

    // Kick the user from the server
    try {
      await member.kick('Account age is less than 7 days');
      console.log(`Kicked ${member.user.tag} from ${member.guild.name}`);
    } catch (error) {
      console.error(`Error kicking ${member.user.tag} from ${member.guild.name}:`, error);
    }
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
        {
          name: 'help',
          description: 'Get bot help',
        },
      ]);
      console.log(`Slash commands registered in ${guild.name}`);
    }
    console.log('Slash commands registered successfully in all guilds.');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
});

client.on('guildCreate', async (guild) => {
  try {
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
      {
        name: 'help',
        description: 'Get bot help',
      },
    ]);
    console.log(`Slash commands registered in ${guild.name}`);

    // Check for banned users in the newly joined server
    const bans = await guild.bans.fetch();
    for (const [userId, banInfo] of bannedUsers) {
      if (bans.has(userId)) {
        const bannedUser = bans.get(userId).user;
        try {
          await guild.bans.remove(userId, 'Banned user detected in the server.');
          console.log(`Banned user with ID ${userId} (${bannedUser.tag}) from ${guild.name}`);
        } catch (error) {
          console.error(`Error banning user with ID ${userId} (${bannedUser.tag}) from ${guild.name}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`Error registering slash commands in ${guild.name}:`, error);
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

    const reportChannelId = 'report channel ID'; // Replace with the ID of the report channel

    const reportChannel = client.channels.cache.get(reportChannelId);
    if (!reportChannel || reportChannel.type !== 'GUILD_TEXT') {
      return interaction.reply('Failed to find the report channel. Please contact the bot administrator.');
    }

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
      .addField('Evidence', evidence) // Added evidence field
      .addField('Contact', contact || 'Not provided')
      .addField('Reported by', `${interaction.user.tag} (${interaction.user.id})`)
      .setFooter(`Reported by ${interaction.user.tag}`)
      .setTimestamp();

    try {
      await reportChannel.send({ embeds: [embed] });
      await interaction.reply('Report submitted successfully.');
    } catch (error) {
      console.error('Error sending report:', error);
      await interaction.reply('Failed to submit the report. Please try again later.');
    }
  } else if (commandName === 'help') {
    const helpEmbed = new MessageEmbed()
      .setColor('#00FF00')
      .setTitle('ModGuardian Help')
      .setDescription('ModGuardian is a powerful moderation bot designed to keep your server safe. It will automatically ban any users which has been reported to us via the report command.')
      .addFields(
        { name: 'Command: report', value: 'Usage: `/report <user_id> <username> <reporting_message> <evidence> [contact]`', inline: false },
        { name: 'Description:', value: 'Report a user to the moderation team.', inline: true },
        { name: 'Command: help', value: 'Usage: `/help`', inline: false },
        { name: 'Description:', value: 'Displays this help message.', inline: true }
      )
      .setFooter('For further assistance, contact ModGuardian Support');

    await interaction.reply({ embeds: [helpEmbed] });
  }
});

client.login('BOT TOKEN'); //Replace with your bot token
