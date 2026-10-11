// Soul's game (Phase 2, slice 1, 2026-09-24) — the first SoulCode's coin game, rebuilt as one clean state machine.
//
// Two words hide in a row of coins: one on the fronts, one on the backs, and two coins start turned over. A tap turns a
// coin over and costs a turn; a guess of either word solves the round for free; a wrong guess costs a turn. Ten turns to
// start, two more for each solve, three more on reaching six-letter words (round 6). The game ends when the turns run out
// in the middle of a round, or when the person stops after a solve and keeps 2 XP for every turn left. One game a day,
// the same words for everyone that day, reset at the person's own midnight (captain AUQ, 2026-09-24).
//
// The SERVER owns the truth: it deals each round, replays the saved moves and computes the XP; the page plays the same
// rules for instant feedback and to rebuild a round from its saved moves. The page carries the rules block below (between
// its two markers) word for word; tests/cwp-soul-game.test.js compares the two copies, line by line, indentation aside.
// No coins: the first SoulCode trusted the browser with its coins (plan § 2).
// Slice 2 (2026-09-24, captain ruling round 12, "celebrate it"): other real words hide in the same coins (about half the
// pairs). Each round is dealt with its own list of them (computed by tools/soul/build-words.cjs, never in the page); one
// that shows, or is guessed, gets its own moment, and guessing one costs no turn. It never solves the round: the two
// words are still the point. Since 2026-10-01 (captain: "it should give them extra turns not more XP") the move that
// first finds one in a round is free and the game gets GAME_HIDDEN_TURNS more; hidden words pay no XP.
import { PAIRS_4, PAIRS_5, PAIRS_6 } from './soul-words.mjs';
import { HIDDEN_56_FROM, HIDDEN_OK_56 } from './soul-hidden-56.mjs';

// ⟦game-rules⟧ — shared word for word with workstation.html; change both, or the test goes red
var GAME_BASE_TURNS = 10, GAME_TURNS_PER_SOLVE = 2, GAME_SIX_BONUS_TURNS = 3, GAME_SIX_FROM = 5, GAME_MAX_MS = 3600000;
var GAME_HIDDEN_TURNS = 1;               // a hidden word, the first time in a round: the move that found it is free, and one more turn
var GAME_HIDDEN_PAID = 2;                // a round's first two finds pay a turn each; a find past them is still free (2026-10-02)
function gameFoundTurns(n) { return Math.min(n, GAME_HIDDEN_PAID) * GAME_HIDDEN_TURNS; }   // the turns n finds in one round give
function gameShowing(r) { var s = ''; for (var i = 0; i < r.a.length; i++) s += r.flipped[i] ? r.b[i] : r.a[i]; return s; }
function gameSolvedWord(r) { var s = gameShowing(r); return s === r.a ? r.a : s === r.b ? r.b : ''; }
function gameHidden(r, w) { return r.hidden && r.hidden.indexOf(w) >= 0 ? w : ''; }   // w if it is one of the round's hidden words
function gameStep(r, m) {
  // One move on a live round. r = { a, b, flipped, hidden } (flipped changed in place); m = { k: 'f', p } or { k: 'g', w }.
  // Answers { cost, solved, bad, hidden }: bad names a move that can never be made, and a bad move changes nothing;
  // hidden names another real word this move spelled or guessed (the round's own list, dealt by the server), else ''.
  if (gameSolvedWord(r)) return { cost: 0, solved: true, bad: 'after_solve', hidden: '' };
  if (m && m.k === 'f') {
    var p = m.p;
    if (typeof p !== 'number' || p % 1 !== 0 || p < 0 || p >= r.a.length) return { cost: 0, solved: false, bad: 'bad_coin', hidden: '' };
    r.flipped[p] = !r.flipped[p];
    var won = !!gameSolvedWord(r);
    return { cost: 1, solved: won, bad: null, hidden: won ? '' : gameHidden(r, gameShowing(r)) };
  }
  if (m && m.k === 'g') {
    var w = typeof m.w === 'string' ? m.w : '';
    if (w.length !== r.a.length || !/^[A-Z]+$/.test(w)) return { cost: 0, solved: false, bad: 'bad_guess', hidden: '' };
    if (w === r.a || w === r.b) { for (var j = 0; j < r.a.length; j++) r.flipped[j] = w === r.b; return { cost: 0, solved: true, bad: null, hidden: '' }; }
    if (gameHidden(r, w)) return { cost: 0, solved: false, bad: null, hidden: w };          // another real word: free, and never a solve
    return { cost: 1, solved: false, bad: null, hidden: '' };
  }
  return { cost: 0, solved: false, bad: 'bad_move', hidden: '' };
}
function gameReplay(a, b, pre, moves, turnsLeft, hidden) {
  // A round rebuilt from its start and its saved moves, in order. turnsLeft = the game's turns when the round began,
  // before any hidden word it finds; hidden = the round's hidden words. Answers the round as it stands: turns = what its
  // moves cost (the move that first found a hidden word costs nothing), bonus = the turns its hidden words gave, and
  // found = each hidden word the first time a move spelled or guessed it, with that move's place ({ w, at }); or
  // { bad, at } for the first move that could never have been made.
  var r = { a: a, b: b, flipped: pre.slice(), hidden: hidden || [] }, turns = 0, bonus = 0, guesses = 0, lastT = 0, found = [], seen = {};
  for (var i = 0; i < moves.length; i++) {
    var m = moves[i], t = m && m.t;
    if (typeof t !== 'number' || t % 1 !== 0 || t < lastT || t > GAME_MAX_MS) return { bad: 'bad_time', at: i };
    if (turns >= turnsLeft + bonus && !gameSolvedWord(r)) return { bad: 'no_turns', at: i };
    var s = gameStep(r, m);
    if (s.bad) return { bad: s.bad, at: i };
    var fresh = !!s.hidden && !seen[s.hidden];
    turns += fresh ? 0 : s.cost; lastT = t;
    if (m.k === 'g') guesses++;
    if (fresh) { seen[s.hidden] = true; found.push({ w: s.hidden, at: i }); bonus = gameFoundTurns(found.length); }
  }
  var won = gameSolvedWord(r);
  return { bad: null, flipped: r.flipped, turns: turns, bonus: bonus, guesses: guesses, solved: !!won, word: won, out: !won && turns >= turnsLeft + bonus, found: found };
}
// ⟦/game-rules⟧

export { GAME_BASE_TURNS, GAME_TURNS_PER_SOLVE, GAME_SIX_BONUS_TURNS, GAME_SIX_FROM, GAME_MAX_MS, GAME_HIDDEN_TURNS, GAME_HIDDEN_PAID, gameFoundTurns, gameShowing, gameSolvedWord, gameHidden, gameStep, gameReplay };

// ── the day's deal: the same words for everyone on a given date ───────────────────────────────────────────────
// Since 2026-10-01 (captain: "people are saying 5 letters are too difficult"; three rounds, six still at round 6) a day
// climbs four letters, then five, then six: rounds 1 to 3 four, 4 and 5 five, 6 on six.
export const FOUR_ROUNDS = 3;      // the first rounds of a day, four letters
export const SLOTS_4 = 3;          // four-letter rounds walk their list three at a time (273 pairs: ~90 days before a repeat)
export const SLOTS_5 = 2;          // five-letter rounds walk theirs two at a time (503 pairs: ~250 days); five a day until 2026-10-01
export const SLOTS_6 = 10;         // six-letter rounds walk theirs ten at a time
// A run past a day's ten six-letter rounds draws from far down the list, never from tomorrow's (captain AUQ 2026-10-02,
// "Draw from far away": a 24-round run on 10/01 had dealt 10/02's six-letter words a day early). The list holds about 50
// days of six-letter rounds, so far is weeks, not months: the 11th to 20th six-letter rounds of a day come from 25 days
// ahead, the next ten from 13, the next ten from 38; past forty the day's own words come round again.
export const SIX_OVER = [0, 250, 130, 380];
export const MAX_MOVES = 400;      // per round; far past any real round (a round costs at most its turns, plus one right guess)

// 'YYYY-MM-DD' → days since 1970-01-01, or null for anything that is not a real calendar date.
export function dayNumber(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd == null ? '' : ymd));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const ms = Date.UTC(y, mo - 1, d), dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return Math.floor(ms / 86400000);
}
// The person's own date, which is always within a day of the server's (time zones run from UTC−12 to UTC+14).
export function playDateOk(ymd, nowMs) {
  const n = dayNumber(ymd);
  if (n == null) return false;
  const today = Math.floor(nowMs / 86400000);
  return n >= today - 1 && n <= today + 1;
}
// The Box page's demo (captain AUQ 2026-10-02: yesterday's game, nothing saved). Its day is one already over everywhere
// on earth, so a visitor never sees words someone can still play today: the day before the UTC date once the last place
// on earth (UTC−12) has reached the UTC date, at 12:00 UTC (8 AM in New York); before that, two days back. So from 8 AM
// to midnight in New York it is their own yesterday, and before 8 AM the day before; the page names the day then.
// Three rounds that climb, so a visitor sees the game grow at once (captain, the same morning: "round 1 is 4 letters,
// round 2 is 5 letters, and round 3 is 6 … only for the box page"): the day's first round of each length.
export const DEMO_PICKS = [0, FOUR_ROUNDS, GAME_SIX_FROM];
// The turns Soul adds on the way into round `index` after solving the one before it (the page's "Keep going" button):
// GAME_TURNS_PER_SOLVE, and GAME_SIX_BONUS_TURNS more on the way into six letters. The demo hands these out the same way.
export function turnsInto(index) { return GAME_TURNS_PER_SOLVE + (index === GAME_SIX_FROM ? GAME_SIX_BONUS_TURNS : 0); }
export function demoDate(nowMs) {
  const day = Math.floor(nowMs / 86400000), hour = Math.floor((nowMs - day * 86400000) / 3600000);
  return new Date((day - (hour >= 12 ? 1 : 2)) * 86400000).toISOString().slice(0, 10);
}
function positions(n, seed) {                  // the first SoulCode's generator: s·16807 mod 2³¹−1, then a Fisher–Yates shuffle
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const out = [];
  for (let i = 0; i < n; i++) out.push(i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
  return out;
}
// Round `index` of date `ymd`: the pair, and the two coins that start turned over. The first turned coin always shows a
// letter of the other word, and every pair differs in at least three places, so a round can never start solved.
export function dealRound(ymd, index) {
  const day = dayNumber(ymd);
  if (day == null || !Number.isInteger(index) || index < 0) return null;
  const six = index >= GAME_SIX_FROM, four = index < FOUR_ROUNDS;
  const pool = six ? PAIRS_6 : four ? PAIRS_4 : PAIRS_5;
  const k = index - GAME_SIX_FROM;
  const slot = six ? day * SLOTS_6 + (k % SLOTS_6) + SIX_OVER[Math.floor(k / SLOTS_6) % SIX_OVER.length]
    : four ? day * SLOTS_4 + index : day * SLOTS_5 + (index - FOUR_ROUNDS);
  const [a, b, catA, catB, hidden] = pool[slot % pool.length];
  const order = positions(a.length, day * 113 + index * 31 + a.length);
  const first = order.find((i) => a[i] !== b[i]);
  const second = order.find((i) => i !== first);
  return { index, a, b, cat_a: catA, cat_b: catB, hidden: hiddenFor(ymd, four, hidden), pre_flipped: a.split('').map((_, i) => i === first || i === second) };
}
// A round's hidden words, its own copy (2026-10-06, his triage): from HIDDEN_56_FROM a 5- or 6-letter round keeps only the
// everyday ones (soul-hidden-56.mjs), as a four-letter round always has; every date before it deals what it always dealt, so
// a saved game, a replay and a carried Underword day from before it read exactly as they did.
export function hiddenFor(ymd, four, hidden) {
  const list = Array.isArray(hidden) ? hidden.slice() : [];
  return four || ymd < HIDDEN_56_FROM ? list : list.filter((w) => HIDDEN_OK_56.has(w));
}

// ── XP: the first SoulCode's coin rewards, paid as XP and computed here, never in the browser ──────────────────
export const STREAK_BONUS = [0, 1, 2, 3, 4, 5];
// A solved round: (2 + the round's number, capped at 10) × 1 for five letters, × 1.5 for six — 2, 3, 4, 5, 6, 10, 12 … 18.
export function roundXp(index) { return Math.floor((2 + Math.min(index, 10)) * (index < GAME_SIX_FROM ? 1 : 1.5)); }
// The turns a round's hidden words gave (a round's saved found, or gameReplay's): GAME_HIDDEN_TURNS each, first time
// only (the replay counts each once), and no more than GAME_HIDDEN_PAID finds a round (2026-10-02). They pay no XP (captain, 2026-10-01).
export function foundTurns(found) { return gameFoundTurns(Array.isArray(found) ? found.length : 0); }
// Keep going after a solve: two more turns, and three more on the way into six-letter words.
export function turnsForNext(turnsAllowed, nextIndex) { return turnsAllowed + GAME_TURNS_PER_SOLVE + (nextIndex === GAME_SIX_FROM ? GAME_SIX_BONUS_TURNS : 0); }
// The turns a game allows while round `index` is in play, before any hidden word: the ten it starts with and each
// solve's. A game's turns_allowed is this plus foundTurns over its rounds, re-derived on every save, never added to.
export function turnsBase(index) { let t = GAME_BASE_TURNS; for (let j = 1; j <= index; j++) t = turnsForNext(t, j); return t; }
// Days in a row with at least one solved round. `yesterday` is yesterday's game (or null).
export function streakFor(roundsSolved, yesterday) {
  if (!(roundsSolved > 0)) return 0;
  return (yesterday && yesterday.rounds_solved > 0 ? (yesterday.streak || 0) : 0) + 1;
}
// What the end of a game adds: 2 XP a turn left for stopping (only for stopping), 2 for reaching six letters, the streak's.
export function endXp(reason, turnsLeft, reachedSix, streak) {
  return {
    stop: reason === 'stopped' && turnsLeft > 0 ? turnsLeft * 2 : 0,
    six: reachedSix ? 2 : 0,
    streak: streak > 0 ? STREAK_BONUS[Math.min(streak, STREAK_BONUS.length - 1)] : 0,
  };
}

// ── what the page sends, checked before anything is replayed ───────────────────────────────────────────────────
// A move is { t, k: 'f', p } (turn coin p) or { t, k: 'g', w } (guess w), t = whole ms since the round began.
export function cleanMoves(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_MOVES) return null;
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') return null;
    const t = m.t;
    if (typeof t !== 'number' || !Number.isInteger(t) || t < 0 || t > GAME_MAX_MS) return null;
    if (m.k === 'f' && Number.isInteger(m.p)) out.push({ t, k: 'f', p: m.p });
    else if (m.k === 'g' && typeof m.w === 'string' && /^[A-Z]{4,6}$/.test(m.w)) out.push({ t, k: 'g', w: m.w });   // four letters since 2026-10-01
    else return null;
  }
  return out;
}
// A checkpoint may only ADD moves: the saved ones come back unchanged, in order, or the call is refused.
export function extendsSaved(saved, moves) {
  if (!Array.isArray(saved) || moves.length < saved.length) return false;
  for (let i = 0; i < saved.length; i++) {
    const a = saved[i] || {}, b = moves[i];
    if (a.t !== b.t || a.k !== b.k || (a.k === 'f' ? a.p !== b.p : a.w !== b.w)) return false;
  }
  return true;
}

// ── what the page is sent ─────────────────────────────────────────────────────────────────────────────────────
export const PLAY_COLUMNS = 'id, play_date, status, end_reason, current_round, rounds_solved, turns_allowed, turns_used, xp_rounds, xp_hidden, xp_stop, xp_six, xp_streak, xp_total, streak, started_at, ended_at';
export const ROUND_COLUMNS = 'id, play_id, round_index, word_a, word_b, pre_flipped, hidden, found, moves, moves_n, turns_used, guesses, solved, solved_word, xp, xp_hidden, started_at, solved_at';
export function publicPlay(p) {
  return {
    id: p.id, date: p.play_date, status: p.status, end: p.end_reason || null, round: p.current_round, solved: p.rounds_solved,
    turns_allowed: p.turns_allowed, turns_used: p.turns_used, streak: p.streak,
    xp: { rounds: p.xp_rounds, hidden: p.xp_hidden || 0, stop: p.xp_stop, six: p.xp_six, streak: p.xp_streak, total: p.xp_total },
  };
}
// The two words of a round that ended unsolved, once the game is over (a player's ask, captain AUQ 2026-09-28): the person
// sees what they were looking for. Never while the game is open, never for a solved round (its word is already shown).
export function roundPair(play, r) {
  return play && play.status !== 'open' && r && !r.solved && r.word_a && r.word_b ? [r.word_a, r.word_b] : null;
}
export function publicRound(r) {
  return {
    index: r.round_index, front: r.word_a, back: r.word_b, pre: r.pre_flipped, hidden: r.hidden || [], found: r.found || [], moves: r.moves || [],
    turns: r.turns_used, solved: !!r.solved, word: r.solved_word || '', xp: r.xp, xp_hidden: r.xp_hidden || 0,
  };
}
