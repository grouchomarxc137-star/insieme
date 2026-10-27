// Website mood options, also used by the server to recover nickname emojis
// after a restart.
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

// User-specific statuses are appended to the shared list by statusOptionsForUser.
export const IN_LOVE_STATUS_OPTIONS = {
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

// Matches the website's DiscordSendPanel for messageLabel="status".
export function formatStatusMessage(user, option) {
  return `**${user}** status: ${option.label}`;
}

// Website Emergency Mood options and server nickname recovery. An emergency
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

// Matches the website's DiscordSendPanel for messageLabel="emergency".
export function formatEmergencyMessage(user, option) {
  return `**${user}** emergency: ${option.label}`;
}
