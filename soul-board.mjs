// Underword's weekly board (2026-10-11; Grok's spec, card 47f89a27, unparked by his AUQ "Weekly leaderboard"; names by his AUQ
// "Made-up names"). The rules live here once; cwp (index.ts: underword_board, underword_board_join, underword_board_score,
// underword_board_rename) and tests/underword-board.test.js import them. Table: 20261011_cwp_underword_board.sql.
//   - Nobody is on the board until they tap to join. The tap makes a key on the phone (BOARD_KEY_RE, the carry code's shape);
//     we keep only its sha-256.
//   - The name is ours, never typed: nameFor(keyHash, seed) picks it from fixed words, and a re-roll moves the seed.
//   - A day counts once, only once all six of its rounds replay to their end (soul-underword.mjs), at its score (rounds solved)
//     and its coins (turns used across the rounds).
//   - The week is Monday to Sunday by the play's own date; the board shows the week of the page's own date.
import * as Game from './soul-game.mjs';
import * as Underword from './soul-underword.mjs';

export const BOARD_KEY_RE = /^[0-9a-f]{32}$/;
export const BOARD_TOP = 10;
export const BOARD_KEEP_DAYS = 56;      // 8 weeks (the migration's expiry job)
export const BOARD_JOINS_HOURLY = 300;  // joins from the last hour, past which a new one waits (a public door that writes)
export const NAME_WORDS = ['Gold', 'Silver', 'Copper', 'Amber', 'Jade', 'Ruby', 'Coral', 'Ivory', 'Onyx', 'Pearl', 'Indigo', 'Violet',
  'Scarlet', 'Teal', 'Cobalt', 'Sable', 'Misty', 'Quiet', 'Swift', 'Lucky', 'Brave', 'Sunny', 'Velvet', 'Starry'];
export const NAME_THINGS = ['Onibee', 'Coin', 'Comet', 'Lantern', 'Fox', 'Owl', 'Moth', 'Kite', 'Wren', 'Otter', 'Heron', 'Lynx'];

// The key a page sent: lower-cased and trimmed; anything that is not a key reads as none.
export function boardKeyOf(v) {
  const k = String(v == null ? '' : v).trim().toLowerCase();
  return BOARD_KEY_RE.test(k) ? k : '';
}
// FNV-1a, 32 bits: the same name for the same key and seed, everywhere.
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
// A player's name: a word, a thing and a number from 10 to 99, e.g. "Gold Comet 41".
export function nameFor(keyHash, seed) {
  const h = fnv(String(keyHash) + ':' + (seed | 0));
  return NAME_WORDS[h % NAME_WORDS.length] + ' ' + NAME_THINGS[(h >>> 5) % NAME_THINGS.length] + ' ' + (10 + ((h >>> 9) % 90));
}
// The next seed on a re-roll, inside the table's CHECK. Two seeds in a row never made the same name in 4,000,000 tries across 200
// keys (2026-10-11), and tests/underword-board.test.js checks the re-roll changes it, so no skip is kept for a case that does not come.
export function nextSeed(keyHash, seed) {
  return ((seed | 0) + 1) % 1000000;
}
// The week a date belongs to: its Monday, 'YYYY-MM-DD'; null for anything that is not a date.
export function weekOf(ymd) {
  const n = Game.dayNumber(ymd);
  if (n == null) return null;
  const dow = (n + 3) % 7;                // 1970-01-01 was a Thursday: Monday is 0
  return new Date((n - dow) * 86400000).toISOString().slice(0, 10);
}
// The page's own date when it is within a day of ours, else our UTC date: whose week the board shows.
export function boardDate(ymd, nowMs) {
  return typeof ymd === 'string' && Game.playDateOk(ymd, nowMs) ? ymd : new Date(nowMs).toISOString().slice(0, 10);
}
// A finished scored day, as the board keeps it: { ok: true, date, solved, coins } or { ok: false, error }. The date must be the
// page's own (within a day of ours) and a scored day; all six rounds must replay to their end.
export function dayScore(date, played, nowMs) {
  if (typeof date !== 'string' || !Game.playDateOk(date, nowMs)) return { ok: false, error: 'bad_date' };
  if (!Underword.isScoreDay(date)) return { ok: false, error: 'not_scored' };
  const day = Underword.replayDay(date, played);
  if (day.error) return { ok: false, error: day.error };
  if (day.end !== 'done') return { ok: false, error: 'not_done' };
  return { ok: true, date, solved: day.solved, coins: day.used };
}
// A row of the week's read (cwp_underword_week) as the page gets it: the name in place of the key's hash and seed, which never
// leave the server; `you` marks the asker's own row.
export function boardRow(r, mine) {
  return { name: nameFor(r.key_hash, r.seed), rank: r.rank | 0, solved: r.solved | 0, coins: r.coins | 0, days: r.days | 0, you: !!mine && r.key_hash === mine };
}
export function boardView(week, mine) {
  const w = week || {};
  return {
    week: String(w.week || ''), players: w.players | 0,
    top: (Array.isArray(w.top) ? w.top : []).map((r) => boardRow(r, mine)),
    me: w.me ? boardRow(w.me, mine) : null,
  };
}
