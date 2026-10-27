// Discord commands and nickname sync for website mood updates.
// Reset Room sessions run entirely on the website; no message lockdown or
// Discord mood menus are initialized here.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  MessageFlags,
  AttachmentBuilder,
  ApplicationCommandOptionType,
} from 'discord.js';
import { STATUS_USERS, statusOptionsForUser, EMERGENCY_MOOD_OPTIONS } from '../src/lib/statusOptions.js';
import { lookupWord, buildDefineEmbed, SUPPORTED_LANGUAGES } from './dictionaryLookup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOVE_VEST_DIR = path.join(__dirname, 'assets', 'lovevest');

// Keep the existing account mapping for website nickname sync.
const STATUS_USER_IDS = {
  Principe: '1497122888090783904',
  Principessa: '539848335104802820',
};

let client = null;

function randomLoveVestImage() {
  if (!fs.existsSync(LOVE_VEST_DIR)) return null;
  const files = fs.readdirSync(LOVE_VEST_DIR).filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f));
  if (files.length === 0) return null;
  const pick = files[Math.floor(Math.random() * files.length)];
  return path.join(LOVE_VEST_DIR, pick);
}

function sendLoveVest(channel) {
  const imagePath = randomLoveVestImage();
  if (!imagePath) return Promise.resolve();
  return channel.send({ files: [new AttachmentBuilder(imagePath)] });
}

async function registerCommands(clientId, guildId, token) {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: [
      {
        name: 'lovevest',
        description: 'Post the love vest picture in this channel',
      },
      {
        name: 'define',
        description: 'Look up the definition of a word',
        options: [
          {
            name: 'word',
            description: 'The word to define',
            type: ApplicationCommandOptionType.String,
            required: true,
          },
          {
            name: 'language',
            description: 'Language of the word (defaults to English)',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: Object.entries(SUPPORTED_LANGUAGES).map(([value, name]) => ({ name, value })),
          },
        ],
      },
    ],
  });
}

export function startDiscordBot() {
  if (client) return client;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!botToken || !clientId || !guildId) {
    console.log('[discord] DISCORD_BOT_TOKEN/DISCORD_CLIENT_ID/DISCORD_GUILD_ID not fully set, skipping bot startup');
    return;
  }

  // Slash commands use interaction events. Nickname sync fetches individual
  // members over REST, so neither message nor member event streams are needed.
  // Keep discord.js's default cache settings.
  client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once('clientReady', async () => {
    console.log(`[discord] bot logged in as ${client.user.tag}`);
    try {
      await registerCommands(clientId, guildId, botToken);
      console.log('[discord] registered /lovevest and /define commands');
    } catch (err) {
      console.error('[discord] failed to register commands:', err.message);
    }
    await initNicknameState();
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.guildId !== guildId) return;

    if (interaction.commandName === 'lovevest') {
      await interaction.reply({ content: 'here you go 💛', flags: MessageFlags.Ephemeral });
      try {
        await sendLoveVest(interaction.channel);
      } catch (err) {
        console.error('[discord] failed to send love vest image:', err.message);
      }
      return;
    }

    if (interaction.commandName === 'define') {
      const word = interaction.options.getString('word', true);
      const language = interaction.options.getString('language') ?? 'en';
      await interaction.deferReply(); // public reply — a lookup result is fine for both to see
      try {
        const entries = await lookupWord(word, language);
        if (!entries) {
          await interaction.editReply(`No definition found for **${word}** in ${SUPPORTED_LANGUAGES[language]}.`);
          return;
        }
        await interaction.editReply({ embeds: [buildDefineEmbed(word, language, entries)] });
      } catch (err) {
        console.error(`[discord] /define failed for "${word}" (${language}):`, err.message);
        await interaction.editReply("Couldn't look that word up — try again in a bit.");
      }
      return;
    }
  });

  client.login(botToken).catch((err) => {
    console.error('[discord] bot login failed:', err.message);
  });
  return client;
}

export async function stopDiscordBot() {
  const current = client;
  client = null;
  await current?.destroy();
}

// Per-user nickname emoji state: the status emoji and the emergency-mood
// emoji are tracked separately so setting one never clobbers the other —
// the nickname is always "<name> <statusEmoji><emergencyEmoji>" with the
// emergency part just omitted when there isn't one. In-memory only, which
// is why initNicknameState() below
// re-derives it from Discord's own record (the current nickname) on every
// bot login instead of assuming a restart remembers anything.
const nicknameState = {
  Principe: { statusEmoji: null, emergencyEmoji: null },
  Principessa: { statusEmoji: null, emergencyEmoji: null },
};

// Rebuilds "<name> <statusEmoji><emergencyEmoji>" from nicknameState and
// pushes it to Discord. Swallows every failure (bot not logged in, IDs not
// configured, bot's role sitting below yours, or you being the server owner
// which Discord blocks unconditionally) so a mood post never fails just
// because the nickname half of it couldn't go through.
async function applyNickname(user) {
  if (!client || !client.isReady()) {
    console.log(`[discord] skipping nickname sync for ${user}: bot not ready`);
    return;
  }
  const guildId = process.env.DISCORD_GUILD_ID;
  const userId = STATUS_USER_IDS[user];
  if (!guildId || !userId) {
    console.log(`[discord] skipping nickname sync for ${user}: guildId or userId not configured`);
    return;
  }

  const { statusEmoji, emergencyEmoji } = nicknameState[user];
  const suffix = `${statusEmoji || ''}${emergencyEmoji || ''}`;
  const nickname = suffix ? `${user} ${suffix}` : user;

  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    await member.setNickname(nickname);
    console.log(`[discord] nickname synced for ${user}: now "${member.nickname}"`);
  } catch (err) {
    console.error(`[discord] failed to set nickname for ${user}:`, err.message);
  }
}

// Full status change — same effect as before this emoji was allowed to
// share the nickname with an emergency mood: replaces the status half only.
export async function setStatusNickname(user, emoji) {
  if (!nicknameState[user]) return;
  nicknameState[user].statusEmoji = emoji;
  await applyNickname(user);
}

// Adds/replaces the emergency-mood emoji alongside whatever status emoji is
// already there.
export async function setEmergencyNickname(user, emoji) {
  if (!nicknameState[user]) return;
  nicknameState[user].emergencyEmoji = emoji;
  await applyNickname(user);
}

// The "Cancel" action: drops just the emergency emoji, leaving the status
// emoji (if any) untouched.
export async function clearEmergencyNickname(user) {
  if (!nicknameState[user] || nicknameState[user].emergencyEmoji === null) return;
  nicknameState[user].emergencyEmoji = null;
  await applyNickname(user);
}

// Reverses applyNickname's "<name> <statusEmoji><emergencyEmoji>" format
// against a set of known emojis, so a restart can recover which mood(s)
// were active instead of forgetting them (nicknameState itself doesn't
// survive a restart). Only recognizes an exact status-then-emergency emoji
// combination — anything else (nickname set by hand, or from before this
// feature existed) is left as "nothing active" rather than guessed at.
function parseNicknameSuffix(user, nickname) {
  const empty = { statusEmoji: null, emergencyEmoji: null };
  const prefix = `${user} `;
  if (!nickname || !nickname.startsWith(prefix)) return empty;
  const suffix = nickname.slice(prefix.length);
  if (!suffix) return empty;

  for (const statusOption of statusOptionsForUser(user)) {
    if (!suffix.startsWith(statusOption.emoji)) continue;
    const rest = suffix.slice(statusOption.emoji.length);
    if (!rest) return { statusEmoji: statusOption.emoji, emergencyEmoji: null };
    const emergencyOption = EMERGENCY_MOOD_OPTIONS.find((o) => o.emoji === rest);
    if (emergencyOption) return { statusEmoji: statusOption.emoji, emergencyEmoji: emergencyOption.emoji };
  }
  return empty;
}

// Called once at bot login so a website mood change
// right after a restart composes onto the real current nickname instead of
// onto blank in-memory state.
async function initNicknameState() {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return;
  try {
    const guild = await client.guilds.fetch(guildId);
    for (const user of STATUS_USERS) {
      const userId = STATUS_USER_IDS[user];
      if (!userId) continue;
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;
      nicknameState[user] = parseNicknameSuffix(user, member.nickname);
    }
  } catch (err) {
    console.error('[discord] failed to init nickname state:', err.message);
  }
}
