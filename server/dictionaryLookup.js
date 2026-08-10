// Word lookup for the /define Discord command, backed by Wiktionary's own
// REST API — free, keyless, and (unlike api.dictionaryapi.dev, which only
// really has data for English despite accepting other language codes) it
// genuinely covers Italian, Dutch, and Portuguese too, since one lookup
// returns every language section Wiktionary has for that spelling. Kept
// separate from the bot's Discord glue so the API call and the embed
// formatting can be reused/tested independently of discord.js, same split as
// discordRelay.js.
import { EmbedBuilder } from 'discord.js';

const API_BASE = 'https://en.wiktionary.org/api/rest_v1/page/definition';

// Wikimedia asks API consumers to identify themselves with a descriptive
// User-Agent (their etiquette policy) rather than a blank/generic one, so
// this is set explicitly instead of relying on whatever Node's fetch sends
// by default.
const USER_AGENT = 'insieme-discord-bot/1.0 (personal project; couple\'s Discord dictionary command)';

// The languages the /define command offers as choices. Portuguese here means
// Wiktionary's single "Portuguese" section — Wiktionary doesn't split
// Portugal vs. Brazil into separate language codes, regional differences
// just show up as usage notes on individual definitions.
export const SUPPORTED_LANGUAGES = {
  en: 'English',
  it: 'Italian',
  nl: 'Dutch',
  pt: 'Portuguese',
};

// Discord embed limits: 25 fields, 1024 chars/field, 6000 chars total. Capping
// how much of the response we show keeps every reply comfortably inside
// those limits even for words with many senses.
const MAX_MEANINGS = 3;
const MAX_DEFINITIONS_PER_MEANING = 2;

const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Wiktionary definitions/examples are HTML fragments (wiki links, bold tags,
// etc). This is a plain-text strip, not a full HTML parser — good enough for
// dropping into a Discord embed, not meant to handle arbitrary markup.
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Returns the array of entries for the requested language (e.g. the "it"
// list from the API's per-language response), or null if the word has no
// Wiktionary page at all, or no section for that language specifically —
// both surface as "no definition found" to the caller, since neither is
// worth distinguishing in the reply. Throws only for a real transient/API
// failure, after a couple of retries (the same reasoning as before: a single
// blip shouldn't read as "this word doesn't exist").
export async function lookupWord(word, languageCode = 'en') {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(`${API_BASE}/${encodeURIComponent(word)}`, {
        headers: { 'User-Agent': USER_AGENT },
      });
    } catch (err) {
      lastErr = err; // network error — worth retrying too
      if (attempt < MAX_ATTEMPTS) await wait(RETRY_DELAY_MS * attempt);
      continue;
    }
    if (res.status === 404) return null;
    if (res.ok) {
      const data = await res.json();
      return data[languageCode] ?? null;
    }

    lastErr = new Error(`Wiktionary API returned ${res.status}`);
    if (!TRANSIENT_STATUSES.has(res.status)) throw lastErr; // real error, don't retry
    if (attempt < MAX_ATTEMPTS) await wait(RETRY_DELAY_MS * attempt);
  }
  throw lastErr;
}

export function buildDefineEmbed(word, languageCode, entries) {
  const languageName = SUPPORTED_LANGUAGES[languageCode] ?? languageCode;

  const embed = new EmbedBuilder()
    .setTitle(`${word} (${languageName})`)
    .setColor(0x5a9be8)
    .setFooter({ text: 'via Wiktionary' });

  for (const meaning of entries.slice(0, MAX_MEANINGS)) {
    const lines = (meaning.definitions ?? []).slice(0, MAX_DEFINITIONS_PER_MEANING).map((def, i) => {
      const line = `${i + 1}. ${stripHtml(def.definition)}`;
      const example = def.examples?.[0];
      return example ? `${line}\n   _"${stripHtml(example)}"_` : line;
    });
    if (lines.length === 0) continue;
    embed.addFields({ name: meaning.partOfSpeech || 'definition', value: lines.join('\n').slice(0, 1024) });
  }

  return embed;
}
