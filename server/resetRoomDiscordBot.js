// Ported from personal/lovissimi's server/nest/discordBot.js. The message
// lockdown is the load-bearing part: while a reset session is active, every
// human message anywhere in the guild gets deleted (except the session's own
// join link) so neither of you can keep arguing outside the structured flow.
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
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import * as repo from './resetRoomRepo.js';
import * as sm from './resetRoomStateMachine.js';
import { SESSION_STATUS, ROLES, DEFAULT_NAMES } from './resetRoomConstants.js';
import { relayDiscordMessage } from './discordRelay.js';
import { STATUS_OPTIONS, STATUS_USERS, formatStatusMessage } from '../src/lib/statusOptions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOVE_VEST_DIR = path.join(__dirname, 'assets', 'lovevest');

const RESET_LINK_MESSAGE = (initiatorUrl, responderUrl) =>
  `🌿 **A reset session has started.**\n${DEFAULT_NAMES[ROLES.INITIATOR]}, join here: ${initiatorUrl}\n${DEFAULT_NAMES[ROLES.RESPONDER]}, join here: ${responderUrl}\n\nEach link drops you straight into your own role — no picking needed. No messages will stick in any channel until the session is complete — the summary will be posted here when it's done.`;

const LOCKDOWN_WARNING =
  '🔒 **Reset protocol active.** Every message sent here (and everywhere else) will be deleted until this session is resolved.';

// /clearchannel refuses to touch this channel no matter what — hardcoded, not
// configurable, so a bad confirm click can't wipe it.
const CLEARCHANNEL_PROTECTED_ID = '1448283314635935897';

// Maps the app's own user labels to real Discord accounts — nothing else in
// this app needs to know either of your actual Discord user IDs, only the
// nickname sync does. Hardcoded for now (rather than env vars) at the user's
// request.
const STATUS_USER_IDS = {
  Principe: '1497122888090783904',
  Principessa: '539848335104802820',
};

// customId format for the persistent mood buttons: "status:<user>:<optionId>",
// e.g. "status:Principe:locked-in".
const STATUS_BUTTON_PREFIX = 'status';

// All mood buttons stay the same neutral gray (Discord's "Secondary" style) —
// the person's identity comes from the embed accent color instead, not the
// button color.
const STATUS_BUTTON_STYLE = ButtonStyle.Secondary;

// Left-edge accent color for each person's status menu embed. Discord's
// button API only offers 5 fixed styles with no custom colors, so this is
// the one place in the message that can carry an arbitrary hex color.
const STATUS_MENU_COLOR = {
  Principe: 0xe8935a, // light orange
  Principessa: 0xe8c34f, // light golden yellow
};

let client = null;
let lockState = null; // { sessionId } | null

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

// Discord's bulk-delete endpoint only touches messages under 14 days old and
// caps out at 100 per call, so this keeps fetching the latest batch, bulk
// deletes whatever qualifies, and falls back to deleting the (older)
// leftovers one at a time until the channel is empty.
async function clearChannelMessages(channel) {
  let totalDeleted = 0;
  for (;;) {
    const messages = await channel.messages.fetch({ limit: 100 });
    if (messages.size === 0) break;

    const bulkDeleted = await channel.bulkDelete(messages, true);
    totalDeleted += bulkDeleted.size;

    const leftover = messages.filter((m) => !bulkDeleted.has(m.id));
    for (const message of leftover.values()) {
      try {
        await message.delete();
        totalDeleted += 1;
      } catch (err) {
        console.error(`[discord] failed to delete message ${message.id}:`, err.message);
      }
    }
  }
  return totalDeleted;
}

function buildStatusMenuRow(user) {
  return new ActionRowBuilder().addComponents(
    STATUS_OPTIONS.map((option) =>
      new ButtonBuilder()
        .setCustomId(`${STATUS_BUTTON_PREFIX}:${user}:${option.id}`)
        .setLabel(option.label)
        .setStyle(STATUS_BUTTON_STYLE)
    )
  );
}

function isStatusMenuFor(message, user) {
  const prefix = `${STATUS_BUTTON_PREFIX}:${user}:`;
  return message.components?.some((row) => row.components?.some((c) => c.customId?.startsWith(prefix)));
}

// Finds this person's existing mood-menu message in the status channel (so a
// bot restart reuses it instead of posting a duplicate), or creates it the
// first time. Menus are never reposted after that — only the live status
// message underneath them gets replaced — so they stay put at the top of the
// channel as a fixed control panel. Each restart also re-syncs the existing
// menu's embed/buttons to the current look (e.g. accent color or button
// style tweaks), so a code change like that doesn't need a manual repost.
async function ensureStatusMenu(channel, user) {
  const recent = await channel.messages.fetch({ limit: 50 });
  let message = recent.find((m) => m.author.id === client.user.id && isStatusMenuFor(m, user));

  const embed = new EmbedBuilder()
    .setColor(STATUS_MENU_COLOR[user] ?? null)
    .setDescription(`**${user}** — tap a mood to update it here (and on the app):`);

  if (!message) {
    message = await channel.send({
      embeds: [embed],
      components: [buildStatusMenuRow(user)],
    });
    console.log(`[discord] created status menu for ${user}: ${message.id}`);
  } else {
    await message.edit({ content: '', embeds: [embed], components: [buildStatusMenuRow(user)] });
  }

  if (!message.pinned) {
    try {
      await message.pin();
    } catch (err) {
      console.log(`[discord] couldn't pin ${user} status menu: ${err.message}`);
    }
  }
}

async function ensureStatusMenus() {
  const channelId = process.env.DISCORD_STATUS_CHANNEL_ID;
  if (!channelId) {
    console.log('[discord] DISCORD_STATUS_CHANNEL_ID not set, skipping status menu setup');
    return;
  }
  try {
    const channel = await client.channels.fetch(channelId);
    for (const user of STATUS_USERS) {
      await ensureStatusMenu(channel, user);
    }
  } catch (err) {
    console.error('[discord] failed to set up status menus:', err.message);
  }
}

// Same effect as picking a mood on the website's Status panel: replaces the
// person's live status message (delete-then-post, via the same relay and
// dedup key the website posts through) and syncs the emoji onto their
// nickname. Keeps the two surfaces interchangeable — whichever one is used
// last wins, and neither leaves a stale duplicate behind.
async function postStatusFromMenu(user, option) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL is not configured on the server.');
  await relayDiscordMessage({ webhookUrl, content: formatStatusMessage(user, option), key: `${user}-status` });
  await setStatusNickname(user, option.emoji);
}

async function registerCommands(clientId, guildId, token) {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: [
      {
        name: 'triggered',
        description: 'Start the reset protocol: silence the server and post a session link',
      },
      {
        name: 'cancel',
        description: 'Emergency stop: end the reset protocol immediately without waiting for the session',
      },
      {
        name: 'lovevest',
        description: 'Post the love vest picture in this channel',
      },
      {
        name: 'clearchannel',
        description: 'Delete every message in this channel (asks for confirmation first)',
      },
    ],
  });
}

export function startDiscordBot() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  const resetChannelId = process.env.DISCORD_CHANNEL_ID;
  const baseUrl = process.env.PUBLIC_BASE_URL;

  if (!botToken || !clientId || !guildId || !resetChannelId || !baseUrl) {
    console.log(
      '[discord] DISCORD_BOT_TOKEN/DISCORD_CLIENT_ID/DISCORD_GUILD_ID/DISCORD_CHANNEL_ID/PUBLIC_BASE_URL not fully set, skipping bot startup'
    );
    return;
  }

  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers],
  });

  client.once('clientReady', async () => {
    console.log(`[discord] bot logged in as ${client.user.tag}`);
    try {
      await registerCommands(clientId, guildId, botToken);
      console.log('[discord] registered /triggered, /cancel, /lovevest, /clearchannel commands');
    } catch (err) {
      console.error('[discord] failed to register commands:', err.message);
    }
    await ensureStatusMenus();
  });

  // While a reset protocol is active, delete every human message anywhere in the
  // guild the instant it's posted — this works regardless of who has admin, unlike
  // channel permission overwrites (which Discord always lets the owner/admins bypass).
  client.on('messageCreate', async (message) => {
    if (!lockState) return;
    if (message.guildId !== guildId) return;
    if (message.author.bot) return;
    // Let the active session's own join link through, so either of you can
    // reshare/paste it without it getting wiped along with everything else.
    if (message.content.includes(`${baseUrl}/reset/s/${lockState.sessionId}`)) return;
    try {
      await message.delete();
    } catch (err) {
      console.error(`[discord] failed to delete message ${message.id}:`, err.message);
    }
  });

  client.on('interactionCreate', async (interaction) => {
    // Mood buttons from the persistent status menus. Handled first and
    // narrowly scoped to "status:" customIds so the /clearchannel confirm
    // buttons (handled separately via awaitMessageComponent) still fall
    // through untouched below.
    if (interaction.isButton() && interaction.customId.startsWith(`${STATUS_BUTTON_PREFIX}:`)) {
      if (interaction.guildId !== guildId) return;

      const [, statusUser, optionId] = interaction.customId.split(':');
      const option = STATUS_OPTIONS.find((o) => o.id === optionId);
      if (!option) return;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await postStatusFromMenu(statusUser, option);
        await interaction.editReply(`${statusUser} is now ${option.label}`);
      } catch (err) {
        console.error(`[discord] status menu update failed for ${statusUser}:`, err.message);
        await interaction.editReply("Couldn't update the status — try again.");
      }
      return;
    }

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

    if (interaction.commandName === 'triggered') {
      if (lockState) {
        await interaction.reply({ content: 'A reset protocol is already in progress.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.reply({ content: 'Starting the reset protocol…', flags: MessageFlags.Ephemeral });

      try {
        const session = repo.createSession();
        // Pre-claim both roles right away so each person's link drops them
        // straight into the flow — no shared link + manual role picking.
        const initiatorToken = sm.claimRole(session.id, ROLES.INITIATOR, DEFAULT_NAMES[ROLES.INITIATOR]);
        const responderToken = sm.claimRole(session.id, ROLES.RESPONDER, DEFAULT_NAMES[ROLES.RESPONDER]);
        lockState = { sessionId: session.id };

        await interaction.channel.send(LOCKDOWN_WARNING);
        await sendLoveVest(interaction.channel);

        const resetChannel = await client.channels.fetch(resetChannelId);
        const initiatorUrl = `${baseUrl}/reset/s/${session.id}?token=${initiatorToken}`;
        const responderUrl = `${baseUrl}/reset/s/${session.id}?token=${responderToken}`;
        await resetChannel.send(RESET_LINK_MESSAGE(initiatorUrl, responderUrl));
      } catch (err) {
        console.error('[discord] failed to start reset protocol:', err.message);
        lockState = null;
      }
      return;
    }

    if (interaction.commandName === 'clearchannel') {
      if (interaction.channelId === CLEARCHANNEL_PROTECTED_ID) {
        await interaction.reply({ content: 'This channel is protected — /clearchannel can\'t be used here.', flags: MessageFlags.Ephemeral });
        return;
      }

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('clearchannel_confirm').setLabel('Yes, delete everything').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('clearchannel_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: `⚠️ This will permanently delete **all messages** in this channel. This can't be undone. Are you sure?`,
        components: [confirmRow],
        flags: MessageFlags.Ephemeral,
      });
      const promptMessage = await interaction.fetchReply();

      const confirmation = await promptMessage
        .awaitMessageComponent({ filter: (i) => i.user.id === interaction.user.id, time: 30_000 })
        .catch(() => null);

      if (!confirmation) {
        await interaction.editReply({ content: 'Confirmation timed out — nothing was deleted.', components: [] });
        return;
      }

      if (confirmation.customId === 'clearchannel_cancel') {
        await confirmation.update({ content: 'Cancelled — nothing was deleted.', components: [] });
        return;
      }

      await confirmation.update({ content: '🧹 Deleting all messages…', components: [] });
      try {
        const count = await clearChannelMessages(interaction.channel);
        await interaction.editReply({ content: `✅ Deleted ${count} message${count === 1 ? '' : 's'}.` });
      } catch (err) {
        console.error('[discord] clearchannel failed:', err.message);
        await interaction.editReply({ content: `Something went wrong: ${err.message}` });
      }
      return;
    }

    if (interaction.commandName === 'cancel') {
      if (!lockState) {
        await interaction.reply({ content: 'Nothing is active right now.', flags: MessageFlags.Ephemeral });
        return;
      }

      const { sessionId } = lockState;
      lockState = null;

      await interaction.reply({ content: '🚨 Emergency cancel — reset protocol ended.', flags: MessageFlags.Ephemeral });

      const currentStatus = repo.getSession(sessionId)?.status;
      if (currentStatus && currentStatus !== SESSION_STATUS.COMPLETED && currentStatus !== SESSION_STATUS.CANCELLED) {
        repo.setSessionStatus(sessionId, SESSION_STATUS.CANCELLED);
      }
      console.log(`[discord] emergency-cancelled session ${sessionId}`);
      return;
    }
  });

  client.login(botToken);
}

export function unlockAfterSession(sessionId) {
  if (!lockState || lockState.sessionId !== sessionId) return;
  lockState = null;
  console.log(`[discord] session ${sessionId} finished, reset protocol ended`);
}

// Renames whichever of you picked a new status to "<name> <emoji>" — e.g.
// "Principe 🔒". Swallows every failure (bot not logged in, IDs not
// configured, bot's role sitting below yours, or you being the server owner
// which Discord blocks unconditionally) so a status post never fails just
// because the nickname half of it couldn't go through.
export async function setStatusNickname(user, emoji) {
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

  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    await member.setNickname(`${user} ${emoji}`);
    console.log(`[discord] nickname synced for ${user}: now "${member.nickname}"`);
  } catch (err) {
    console.error(`[discord] failed to set nickname for ${user}:`, err.message);
  }
}
