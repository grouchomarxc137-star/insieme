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
];

export const STATUS_USERS = ['Principe', 'Principessa'];

// Same wording the website's DiscordSendPanel builds for the status panel
// (messageLabel="status") — kept as one function so the in-Discord mood
// menus post byte-for-byte the same content.
export function formatStatusMessage(user, option) {
  return `**${user}** status: ${option.label}`;
}
