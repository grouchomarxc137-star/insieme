// Word lookup for the /define Discord command, backed by the free, keyless
// dictionaryapi.dev API (a JSON wrapper around Wiktionary). Kept separate from
// the bot's Discord glue so the API call and the embed formatting can be
// reused/tested independently of discord.js, same split as discordRelay.js.
import { EmbedBuilder } from 'discord.js';

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en';

// Discord embed limits: 25 fields, 1024 chars/field, 6000 chars total. Capping
// how much of the API response we show keeps every reply comfortably inside
// those limits even for words with dozens of meanings (e.g. "run").
const MAX_MEANINGS = 3;
const MAX_DEFINITIONS_PER_MEANING = 2;

// Returns the parsed entries array on success, null if the word has no entry
// (404 — the API's documented "not found" response), or throws for any other
// failure so the caller can tell "not found" apart from "something broke".
export async function lookupWord(word) {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(word)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`dictionary API returned ${res.status}`);
  return res.json();
}

function firstPhonetic(entries) {
  for (const entry of entries) {
    if (entry.phonetic) return entry.phonetic;
    const withText = entry.phonetics?.find((p) => p.text);
    if (withText) return withText.text;
  }
  return null;
}

export function buildDefineEmbed(word, entries) {
  const phonetic = firstPhonetic(entries);
  const allMeanings = entries.flatMap((entry) => entry.meanings ?? []);

  const embed = new EmbedBuilder()
    .setTitle(phonetic ? `${word} ${phonetic}` : word)
    .setColor(0x5a9be8)
    .setFooter({ text: 'via dictionaryapi.dev' });

  for (const meaning of allMeanings.slice(0, MAX_MEANINGS)) {
    const lines = (meaning.definitions ?? []).slice(0, MAX_DEFINITIONS_PER_MEANING).map((def, i) => {
      const line = `${i + 1}. ${def.definition}`;
      return def.example ? `${line}\n   _"${def.example}"_` : line;
    });
    if (lines.length === 0) continue;
    embed.addFields({ name: meaning.partOfSpeech || 'definition', value: lines.join('\n').slice(0, 1024) });
  }

  return embed;
}
