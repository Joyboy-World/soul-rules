// Soul — the friends list (2026-09-29; docs/soul-checklist.md item 7; migration 20260929_cwp_zz_friends.sql).
//
// The captain's rulings (docs/soul-review-2026-09-28.md § You; AUQ 2026-09-29): a friendship is a two-way yes; a friend is
// added by a friend link or by an invite sent from a box, and either one only ASKS; nothing is seeded; each person shows
// only what they switch on, and every switch starts off; the day's squares can show, never the words.
//
// These rules live ONCE, here, imported by the function (index.ts) and by tests/cwp-soul-friends.test.js, with mutants in
// tools/soul/friends-mutants.cjs. Pure functions only: no database, no clock of their own (the caller passes `now`).

// ── What a person shows ──────────────────────────────────────────────────────────────────────────────────────────
// The three switches, in the order You shows them. The database holds the same three (friend_share's CHECK).
export const SHARE_KEYS = ['status', 'playing', 'squares'];

// Every switch is off unless it is literally true. Unknown keys are dropped.
export function shareOf(v) {
  const src = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const out = {};
  for (const k of SHARE_KEYS) out[k] = src[k] === true;
  return out;
}

// A change from the page: only known keys with a true or false value. Null when nothing valid was sent.
export function sharePatch(before, body) {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const next = shareOf(before);
  let touched = false;
  for (const k of SHARE_KEYS) if (typeof src[k] === 'boolean') { next[k] = src[k]; touched = true; }
  return touched ? next : null;
}

// ── A person's status ────────────────────────────────────────────────────────────────────────────────────────────
// Chosen by the person, never derived (the room's presence words). A chosen status goes quiet on its own after
// STATUS_FRESH_HOURS, so "here" set on Monday is not still "here" on Friday.
export const STATUSES = ['quiet', 'here', 'away', 'building'];
export const STATUS_FRESH_HOURS = 12;
export function statusOf(v) {
  return typeof v === 'string' && STATUSES.includes(v) ? v : null;
}
export function freshStatus(status, statusAt, now) {
  const s = statusOf(status);
  if (!s || s === 'quiet') return 'quiet';
  const at = statusAt ? Date.parse(statusAt) : NaN;
  const t = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(at) || !Number.isFinite(t)) return 'quiet';
  return t - at <= STATUS_FRESH_HOURS * 3600 * 1000 ? s : 'quiet';
}

// ── Soul Ties (the captain's word, 2026-09-29: a friendship is a Soul Tie, and so is the code that asks for one) ─────
// A Soul Tie code is eight characters from an alphabet with nothing that reads as something else (no 0, O, 1, I or L),
// shown as ABCD-2345 and read back however it is typed: any case, with or without the dash or spaces. 31^8 ≈ 8.5e11 codes,
// and every look-up is rate-limited, so one cannot be guessed. The old ?f= links (live for minutes) are retired.
export const TIE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const TIE_LENGTH = 8;
export const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;
export function codeOf(v) {
  if (typeof v !== 'string') return null;
  const c = v.replace(/[\s-]+/g, '').toUpperCase();
  return CODE_RE.test(c) ? c : null;
}
export function tieShown(code) {
  return CODE_RE.test(String(code)) ? code.slice(0, 4) + '-' + code.slice(4) : null;
}
// A new code from random bytes. Bytes of 248 and up are skipped, so every character is equally likely (248 = 8 × 31).
export function newTieCode(randomBytes) {
  let out = '';
  while (out.length < TIE_LENGTH) {
    for (const b of randomBytes(16)) {
      if (b < 248 && out.length < TIE_LENGTH) out += TIE_ALPHABET[b % 31];
    }
  }
  return out;
}

// ── Asking, answering, removing ──────────────────────────────────────────────────────────────────────────────────
export const LIVE = ['requested', 'accepted'];

// Whether `me` may ask the owner of a link. `live` is the live row between the two, if any. Null means yes.
export function requestRefusal(me, owner, live) {
  if (!owner) return 'not_found';
  if (owner === me) return 'self';
  if (!live) return null;
  if (live.status === 'accepted') return 'already_friends';
  return live.requester_id === me ? 'already_asked' : 'they_asked_you';
}

// Only the person who was asked answers, and only while the request is waiting.
export function answerAllowed(row, me) {
  return !!row && row.status === 'requested' && row.addressee_id === me;
}

// Either side can end a friendship; the one who asked can take back a request that is still waiting.
export function removeAllowed(row, me) {
  if (!row || !LIVE.includes(row.status)) return false;
  if (row.status === 'accepted') return row.requester_id === me || row.addressee_id === me;
  return row.requester_id === me;
}

// The other side of a row, from `me`.
export function otherOf(row, me) {
  return row.requester_id === me ? row.addressee_id : row.addressee_id === me ? row.requester_id : null;
}

// ── The squares ──────────────────────────────────────────────────────────────────────────────────────────────────
// The same squares the Share button builds (shareText in workstation.html): one per round, green solved, black the one
// that ran out. Read from `solved` and nothing else, so a word can never ride along.
export const SOLVED_SQUARE = '🟩';
export const OPEN_SQUARE = '⬛';
export function squaresOf(rounds) {
  return (Array.isArray(rounds) ? rounds : []).slice()
    .sort((a, b) => Number(a.round_index) - Number(b.round_index))
    .map((r) => (r.solved === true ? SOLVED_SQUARE : OPEN_SQUARE)).join('');
}

// What a friend view reads of someone's game. Never a word column: the test holds these lists to that.
export const FRIEND_PLAY_COLUMNS = 'id, workstation_id, play_date, status, rounds_solved';
export const FRIEND_ROUND_COLUMNS = 'play_id, round_index, solved';
export const WORD_COLUMNS = ['word_a', 'word_b', 'solved_word', 'moves', 'hidden', 'found', 'cat_a', 'cat_b', 'pre_flipped', 'guesses'];

// ── One friend's line ────────────────────────────────────────────────────────────────────────────────────────────
// The name is always there. Status, whether they played today and the squares appear only when that person switched
// each one on. `play` is their game for the viewer's day (or null) and `rounds` its rounds.
export function friendLine({ id, name, share, status, statusAt, play, rounds, now, since }) {
  const s = shareOf(share);
  const called = typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : 'A friend';
  const line = { id, name: called, letter: called.charAt(0).toUpperCase() };
  if (since) line.since = since;
  if (s.status) line.status = freshStatus(status, statusAt, now);
  const played = !!play;
  if (s.playing) {
    line.played_today = played;
    if (played) line.playing_now = play.status === 'open';
  }
  if (s.squares && played) {
    line.squares = squaresOf(rounds);
    line.rounds_solved = Number(play.rounds_solved) || 0;
  }
  line.group = groupOf(line);
  return line;
}

// The groups, in the order the list shows them (the Riot friends panel, the 9/28 review).
export const GROUPS = [
  ['playing', 'Played today'],
  ['building', 'Building with their SI'],
  ['here', 'Here'],
  ['away', 'Away'],
  ['quiet', 'Everyone else'],
];
export function groupOf(line) {
  if (line.played_today === true || typeof line.squares === 'string') return 'playing';
  if (line.status === 'building' || line.status === 'here' || line.status === 'away') return line.status;
  return 'quiet';
}

// A day the browser sends for "today": its own date, within a day of the server's (the game's rule).
export function dayOk(v, nowMs) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = Date.parse(v + 'T12:00:00Z');
  if (!Number.isFinite(d)) return false;
  return Math.abs(d - nowMs) <= 36 * 3600 * 1000;
}

export const MAX_FRIENDS = 200;   // a read returns at most this many rows of each kind
