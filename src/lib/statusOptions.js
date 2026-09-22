// The four "status" moods, shared between the website's Character page panel
// (src/pages/CharacterPage.jsx) and the server-side Discord bot's persistent
// status menus (server/resetRoomDiscordBot.js) — one definition so a mood
// posted from either surface always matches in wording and emoji.
export const STATUS_OPTIONS = [
  {
    id: 'locked-in',
    emoji: '🔒',
    label: '🔒 Locked in',
    description: "Don't expect a response or engagement — even if I do reply, it's not expected.",
  },
  {
    id: 'multitasking',
    emoji: '🌀',
    label: '🌀 Multitasking',
    description: "Busy, but can text in between. Don't expect full engagement.",
  },
  {
    id: 'free',
    emoji: '💬',
    label: '💬 Free to text',
    description: "We text and engage, but I might get distracted or step away once in a while.",
  },
  {
    id: 'divine-attention',
    emoji: '✨',
    label: '✨ Divine attention',
    description: "All yours — no dividing attention with anything else.",
  },
  {
    id: 'sleep',
    emoji: '😴',
    label: '😴 Sleep',
    description: "Sleeping — don't expect a response until I'm up.",
  },
  {
    id: 'need-time',
    emoji: '⏳',
    label: '⏳ Need time',
    description: "Need some space to myself right now — not about you, just need it.",
  },
];

export const STATUS_USERS = ['Principe', 'Principessa'];

// User-specific statuses are appended to the shared list by statusOptionsForUser.\nexport const IN_LOVE_STATUS_OPTIONS = {
  Principessa: {
    id: 'in-love-with-principe',
    emoji: '🤴🏽💛',
    label: 'In love with my Principe🤴🏽💛',
  },
  Principe: {
    id: 'in-love-with-principessa',
    emoji: '👸🏽💛',
    label: 'In love with my Principessa👸🏽💛',
  },
};

export function statusOptionsForUser(user) {
  const customStatus = IN_LOVE_STATUS_OPTIONS[user];
  return customStatus ? [...STATUS_OPTIONS, customStatus] : STATUS_OPTIONS;
}

// Same wording the website's DiscordSendPanel builds for the status panel
// (messageLabel="status") — kept as one function so the in-Discord mood
// menus post byte-for-byte the same content.
export function formatStatusMessage(user, option) {
  return `**${user}** status: ${option.label}`;
}

// The Emergency Mood options — same sharing arrangement as STATUS_OPTIONS
// above: one definition used by both the website's Emergency Mood panel and
// the Discord bot's persistent emergency menu. Unlike status, an emergency
// mood doesn't replace the status emoji on the nickname — it's added right
// next to it, and "Cancel" (handled separately, not as an option here)
// removes just that addition.
export const EMERGENCY_MOOD_OPTIONS = [
  { id: 'overwhelmed', emoji: '😩', label: '😩 Overwhelmed' },
  { id: 'overstimulated', emoji: '🌪️', label: '🌪️ Overstimulated' },
  { id: 'anxious', emoji: '😰', label: '😰 Anxious' },
  { id: 'sad', emoji: '😢', label: '😢 Sad' },
  { id: 'need-bestfriend', emoji: '🫂', label: '🫂 Need my bestfriend' },
  { id: 'need-affection', emoji: '🥺', label: '🥺 Need affection' },
];

// Same wording the website's DiscordSendPanel builds for the Emergency Mood
// panel (messageLabel="emergency") — kept in sync with formatStatusMessage
// above so the in-Discord emergency menu posts byte-for-byte the same
// content as the website.
export function formatEmergencyMessage(user, option) {
  return `**${user}** emergency: ${option.label}`;
}
