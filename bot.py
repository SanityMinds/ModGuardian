import discord
from discord import Embed  
import openai
from discord.ext import commands, tasks
from datetime import datetime
import re

# Discord Bot Token
DISCORD_TOKEN = 'BOT_TOKEN'

# OpenAI API Key (text moderation costs $0 to run)
OPENAI_API_KEY = 'OPENAI_API_KEY'


LOG_CHANNEL_ID = 1150900821693833366  # Replace with your Discord channel ID of logging channel
AUTHORIZED_USER_IDS = ['974368593615659098', '']  # Replace with actual user IDs of mods
BAN_APPEAL_EMAIL = 'appeals@bytelabs.site'  # Replace with your actual email for appeals
BANNED_USERS_FILE = 'banned_users.txt'  # Path to the file where banned user info will be stored
WARNINGS_FILE = 'warnings.txt' # Path to the file where warnings are stored for record keeping 
EXCLUDED_CATEGORIES = ['self-harm', 'self-harm/intent', 'self-harm/instructions'] # What categories won't be moderated

# Define the intents.
intents = discord.Intents.default()
intents.messages = True
intents.guilds = True
intents.message_content = True
intents.dm_messages = True
intents.members = True

# Initialize Discord Bot with intents
bot = commands.Bot(command_prefix='...', intents=intents, help_command=None)

# OpenAI client setup
openai.api_key = OPENAI_API_KEY

# Interval for nickname checks in minutes
NICKNAME_CHECK_INTERVAL = 10  # e.g., check every 10 minutes

def get_user_id(mention):
    return int(re.sub(r'[<@!>]', '', mention)) if mention.startswith('<@') and mention.endswith('>') else int(mention)
    
    
@bot.command()
async def search(ctx, user_mention):
    if str(ctx.author.id) not in AUTHORIZED_USER_IDS:
        await ctx.send('You do not have permission to use this command.')
        return

    try:
        # Try converting mention or ID to an integer
        user_id = get_user_id(user_mention)

        # Check if the user ID corresponds to a real user in Discord
        user = bot.get_user(user_id)
        if not user:
            await ctx.send("Invalid user or user ID.")
            return

        # Search in banned users file
        banned_info = "Not banned."
        with open(BANNED_USERS_FILE, 'r') as f:
            for line in f:
                if str(user_id) in line:
                    banned_info = line.strip()
                    break

        # Search in warnings file
        warnings_info = []
        with open(WARNINGS_FILE, 'r') as f:
            for line in f:
                if str(user_id) in line:
                    warnings_info.append(line.strip())

        warning_count = len(warnings_info)
        warnings_text = "\n".join(warnings_info) if warnings_info else "No warnings."

        
        embed = discord.Embed(title=f"Search Results for {user}", color=0x00ff00)
        embed.add_field(name="Banned Info", value=banned_info, inline=False)
        embed.add_field(name=f"Warnings ({warning_count})", value=warnings_text, inline=False)
        await ctx.send(embed=embed)

    except ValueError:
        await ctx.send("Invalid user or user ID format. Please use a valid mention or numeric ID.")


@bot.command()
async def warn(ctx, member, *, reason=None):
    # Authorization check
    if str(ctx.author.id) not in AUTHORIZED_USER_IDS:
        await ctx.send('You do not have permission to use this command.')
        return

    # Convert member mention to ID or use the provided ID
    member_id = ''.join(filter(str.isdigit, member))

    # Attempt to convert member_id to int
    try:
        member_id = int(member_id)
    except ValueError:
        await ctx.send("Invalid user ID.")
        return

    # Attempt to fetch the user
    try:
        user = await bot.fetch_user(member_id)
        dm_message = f"You have been warned for the following reason: {reason}"
        await user.send(dm_message)
    except discord.NotFound:
        await ctx.send(f"User with ID {member_id} not found.")
        return
    except discord.HTTPException:
        await ctx.send(f"Failed to send DM to user with ID {member_id}.")

    # Log the warning to a file
    with open(WARNINGS_FILE, 'a') as file:
        file.write(f"{member_id}, {reason}\n")

    # Notify the command issuer
    await ctx.send(f"User with ID {member_id} has been warned.")

@bot.command()
async def ban(ctx, member_id: str, *, reason=None):
    # Check if the author is allowed to use the command
    if str(ctx.author.id) not in AUTHORIZED_USER_IDS:
        await ctx.send("You are not authorized to use this command.")
        return

    # Convert member_id to an integer if it's a mention or direct ID
    member_id = int(''.join(filter(str.isdigit, member_id)))

    # Add the user to the banned users list
    with open(BANNED_USERS_FILE, 'a') as file:
        file.write(f"{member_id}, {reason}\n")
    
    # Attempt to fetch the user
    try:
        user = await bot.fetch_user(member_id)
        dm_message = f"You have been banned for the following reason: {reason}\nYou may appeal this ban at {BAN_APPEAL_EMAIL}."
        await user.send(dm_message)
    except discord.NotFound:
        pass  # User not found, possibly due to an invalid ID
    except discord.HTTPException:
        pass  # Failed to send DM, possibly due to blocked DMs

    # Ban the user from all servers where the bot is present
    for guild in bot.guilds:
        member = guild.get_member(member_id)
        if member:
            try:
                await guild.ban(member, reason=reason)
            except discord.Forbidden:
                pass  # Bot doesn't have ban permissions in this guild

    await ctx.send(f"User with ID {member_id} has been banned.")

# Function to check content with OpenAI's Moderation API
async def check_content_for_inappropriateness(content):
    try:
        response = openai.Moderation.create(
            input=content,
            model="text-moderation-latest"
        )
        flagged = response['results'][0]['flagged']
        categories = response['results'][0]['categories']
        category_scores = response['results'][0]['category_scores']
        return flagged, categories
    except Exception as e:
        print(f"Error checking content: {e}")
        return False, {}

# Function to create an embed for logging
def create_log_embed(message, categories):
    embed = discord.Embed(title="Inappropriate message detected", color=0xFF5733)  # Red color for violations
    embed.add_field(name="User ID", value=message.author.id, inline=False)
    embed.add_field(name="Username", value=str(message.author), inline=False)  # Username with discriminator
    embed.add_field(name="Message ID", value=message.id, inline=False)
    embed.add_field(name="Server Name", value=message.guild.name, inline=False)
    embed.add_field(name="Server ID", value=message.guild.id, inline=False)
    embed.add_field(name="Message Content", value=message.content, inline=False)
    
    # Format the moderation categories for neatness
    categories_formatted = '\n'.join(f"{category}: {score:.2f}" for category, score in categories.items())
    embed.add_field(name="Moderation Categories", value=categories_formatted, inline=False)
    
    embed.set_footer(text=message.created_at.strftime("%Y-%m-%d %H:%M:%S"))
    return embed

# Check and take action on inappropriate username or nickname
async def handle_inappropriate_member(member):
    if member == bot.user or member.top_role >= member.guild.me.top_role:
        return

    name_to_check = member.display_name
    flagged, scores = await check_content_for_inappropriateness(name_to_check)

    excluded_categories = ['self-harm', 'self-harm/intent', 'self-harm/instructions']
    action_needed = any(category for category, score in scores.items() if score > 0.8 and category not in excluded_categories)

    if flagged and action_needed:
        try:
            dm_message = "Your username or nickname has been flagged as inappropriate. Please change it to comply with our server's guidelines."
            await member.send(dm_message)
            await member.kick(reason="Inappropriate username or nickname detected by moderation model.")
            
            log_channel = bot.get_channel(LOG_CHANNEL_ID)
            if log_channel:
                embed = discord.Embed(title="Content Violation", color=0xFF0000)
                embed.add_field(name="User ID", value=member.id, inline=True)
                embed.add_field(name="Username", value=str(member), inline=True)
                embed.add_field(name="Server ID", value=member.guild.id, inline=True)
                embed.add_field(name="Server Name", value=member.guild.name, inline=True)
                embed.add_field(name="Violating Name", value=name_to_check, inline=True)
                embed.add_field(name="OpenAI Moderation Values", value=str(scores), inline=False)
                embed.set_footer(text=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                await log_channel.send(embed=embed)
        except discord.Forbidden:
            # Optionally, you can log these messages if needed for debugging
            # print(f"Bot does not have permission to kick or send DM to {member.display_name} (ID: {member.id}).")
            pass
        except discord.HTTPException as e:
            # Optionally, you can log these messages if needed for debugging
            # print(f"Error handling member {member.display_name} (ID: {member.id}): {e}")
            pass
        
# Function to check all member nicknames in a server
async def check_all_members(guild):
    for member in guild.members:
        if member.nick or member.name:
            await handle_inappropriate_member(member)

# Task loop to periodically check nicknames
@tasks.loop(minutes=NICKNAME_CHECK_INTERVAL)
async def check_nicknames_periodically():
    for guild in bot.guilds:
        await check_all_members(guild)
        
@bot.command()
async def unban(ctx, member_id: str):
    # Check if the author is allowed to use the command
    if str(ctx.author.id) not in AUTHORIZED_USER_IDS:
        await ctx.send("You are not authorized to use this command.")
        return

    # Convert member_id to an integer if it's a mention or direct ID
    member_id = int(''.join(filter(str.isdigit, member_id)))

    # Read the current banned users list
    with open(BANNED_USERS_FILE, 'r') as file:
        banned_users = file.readlines()

    # Check if the user is in the banned users list
    if not any(str(member_id) in line for line in banned_users):
        await ctx.send(f"User with ID {member_id} is not in the banned users list.")
        return

    # Remove the user from the banned users list
    with open(BANNED_USERS_FILE, 'w') as file:
        for line in banned_users:
            if str(member_id) not in line:
                file.write(line)

    # Unban the user from all servers where the bot is present
    for guild in bot.guilds:
        try:
            user = await bot.fetch_user(member_id)
            await guild.unban(user)
        except discord.NotFound:
            pass  # User not banned in this server
        except discord.Forbidden:
            pass  # Bot doesn't have unban permissions in this server

    # Notify the command issuer
    await ctx.send(f"User with ID {member_id} has been unbanned from all servers.")
        
@bot.event
async def on_member_join(member):
    with open(BANNED_USERS_FILE, 'r') as file:
        banned_users = file.readlines()

    # Check if the joining member is in the banned users list
    if any(str(member.id) in line for line in banned_users):
        try:
            await member.guild.ban(member, reason="Banned user rejoined.")
            dm_message = f"You are banned. You may appeal this ban at {BAN_APPEAL_EMAIL}."
            await member.send(dm_message)
        except discord.Forbidden:
            pass  # Bot doesn't have ban permissions
        except discord.HTTPException:
            pass  # Failed to send DM or ban user
    
@bot.event
async def on_guild_join(guild):
    await check_all_members(guild)

@tasks.loop(minutes=NICKNAME_CHECK_INTERVAL)
async def check_nicknames_periodically():
    for guild in bot.guilds:
        await check_all_members(guild)
        
@check_nicknames_periodically.before_loop
async def before_check_nicknames_periodically():
    await bot.wait_until_ready()
    
# Start the nickname check loop when bot is ready
@bot.event
async def on_ready():
    print(f'Logged in as {bot.user}')
    if not check_nicknames_periodically.is_running():
        check_nicknames_periodically.start()
        
@bot.event
async def on_disconnect():
    if check_nicknames_periodically.is_running():
        check_nicknames_periodically.cancel()

@bot.event
async def on_error(event_method, *args, **kwargs):
    with open('err.log', 'a') as f:
        if event_method == 'on_message':
            f.write(f'Unhandled message: {args[0]}\n')
        else:
            raise
# Event listener for on_message
@bot.event
async def on_message(message):
    # Ignore bot's own messages and other bots
    if message.author.bot:
        return

    try:
        flagged, categories = await check_content_for_inappropriateness(message.content)
        if flagged:
            log_channel = bot.get_channel(LOG_CHANNEL_ID)
            embed = create_log_embed(message, categories)
            await log_channel.send(embed=embed)

            # Delete message and DM user if the confidence is 100% for any category except self-harm & self-harm/intent
            should_delete = any(score == 1.0 for cat, score in categories.items() if cat not in ['self-harm', 'self-harm/intent', 'self-harm/instructions'])
            if should_delete:
                # Delete the message
                await message.delete()
                # Send a DM to the user
                dm_message = "Your message was deleted because it violated discord's community guidelines."
                await message.author.send(dm_message)
            else:
                # Handle self-harm messages by sending a supportive DM
                if categories.get('self-harm/intent', 0) >= 0.9 or categories.get('self-harm/instructions', 0) >= 0.9:
                    dm_message = "Hey there! We recently flagged a message concerning self harm about yourself or someone else. If you are struggling with mental health please feel free to reach out to someone trusted and a professionally licensed mental health professional and/or a hotline or charity. We are here for you and as a result we forward all concerning messages about harm against themselves and someone else to discord due to our policies. Please contact @Kurope on discord if you have any further questions or concerns or feel like you want to talk to someone!"
                    await message.author.send(dm_message)

    except Exception as e:
        print(f"Error processing message: {e}")

    
    await bot.process_commands(message)


@bot.group(invoke_without_command=True)
async def help(ctx):
    bot_description = (
        "Modguardian is a moderation assistant designed to maintain community guidelines "
        "and ensure a safe environment for all members. It uses advanced AI to monitor "
        "messages, detect inappropriate content, and take necessary actions such as warnings "
        "or bans. Below is a list of commands that authorized users (bot owner) can use to manage "
        "community moderation. If banned with ModGuardian the advanced AI system will keep you banned from every server you share with the bot."
    )
    embed = discord.Embed(title="Modguardian Help", description=bot_description, color=discord.Color.green())
    embed.add_field(name="!search <userID or @user>", value="**Admin use only** - Searches a user's punishments and if they are in our system", inline=False)
    embed.add_field(name="!ban <userID or @user> <reason>", value="**Admin use only** - Bans a user across all servers where the bot is present", inline=False)
    embed.add_field(name="!warn <userID or @user> <reason>", value="**Admin use only** - Warns a user and records the warning in the system", inline=False)
    await ctx.send(embed=embed)
    
# Start the bot
bot.run(DISCORD_TOKEN)
