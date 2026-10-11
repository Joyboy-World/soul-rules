// Underword (2026-10-05, his AUQs: Soul's daily game on a page of its own, python-visuals.com/underword, named by him;
// plan docs/underword-plan-2026-10-05.md). A visitor plays TODAY's words, the same as every Box (his call 1, which reverses
// the Box page's "yesterday's game" for this page only, so a shared square and the game it links to are one puzzle), and
// nothing is saved on our side: the page sends back the moves of the rounds it has solved, and round N is dealt only when
// those moves replay as solved with turns to spare. So nobody is handed a later word without playing to it, and nothing is
// read but the deal. The rules, the deal and the turn count are soul-game.mjs's own; this file only decides what one
// round's request may have. Imported by cwp (index.ts, the public underword_round) and tests/underword.test.js.
import * as Game from './soul-game.mjs';

// The puzzle's number in a share ("Underword #12"): day one is the launch day, his ruling at the seventh close of 2026-10-05
// ("Wed Oct 7"). For any day before it a share names the date alone.
export const DAY_ONE = '2026-10-07';
export const MAX_PLAYED = 80;          // rounds a request may send back; a real day has never passed 24
export const MAX_RUN_MOVES = 2000;     // moves across them; a round costs at most its turns, so a real run is far below

// ── The scored day (2026-10-10, his AUQs on Grok's asks: "end the day on a score", Underword only, Soul's own game untouched) ──
// From SCORE_FROM a day is SCORE_ROUNDS rounds, the climb Soul already deals (three of four letters, two of five, one of six).
// Each round has its own turns (ROUND_TURNS_FOUR for four letters, ROUND_TURNS_LONG for five and six: about nine in ten real
// rounds solve within them, read from 30 days of Box games), plus its hidden words' turns; nothing carries between rounds. A round
// that runs out is a miss and the day goes on, so it ends on a score of SCORE_ROUNDS. Round 1 starts one coin away (his pick for an
// easy first round): the same words, one of its two turned coins left as dealt. Every date before SCORE_FROM keeps the old day
// (one pool of turns, the run ends when it runs dry), so a phone's saved game and a carried day from before replay exactly.
export const SCORE_FROM = '2026-10-11';
export const SCORE_ROUNDS = 6;
export const ROUND_TURNS_FOUR = 6;
export const ROUND_TURNS_LONG = 8;
export function isScoreDay(ymd) { return typeof ymd === 'string' && ymd >= SCORE_FROM; }
export function roundTurns(index) { return index < Game.FOUR_ROUNDS ? ROUND_TURNS_FOUR : ROUND_TURNS_LONG; }
// A scored day's deal: Soul's own, except round 1 keeps one turned coin (the first one, in coin order, that shows the other word's
// letter). Every pair differs in at least three places, so one turned coin never starts it solved.
export function scoreDeal(date, index) {
  const d = Game.dealRound(date, index);
  if (!d || index !== 0) return d;
  const keep = d.pre_flipped.findIndex((on, i) => on && d.a[i] !== d.b[i]);
  return { ...d, pre_flipped: d.pre_flipped.map((_, i) => i === keep) };
}
// Par: the fewest coin turns that make the row spell either word from the deal (a right guess is free, so this is the least a
// round can cost by turning alone).
export function parOf(a, b, pre) {
  let toA = 0, toB = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] === b[i]) continue; if (pre[i]) toA++; else toB++; }
  return Math.min(toA, toB);
}
// A scored day's rounds so far: each must replay to its end, solved or out of its own turns; none may be left half played.
function scoreRun(date, played) {
  if (!Array.isArray(played) || played.length > SCORE_ROUNDS) return { error: 'bad_run' };
  let moves = 0;
  for (const p of played) { if (!Array.isArray(p)) return { error: 'bad_run' }; moves += p.length; }
  if (moves > MAX_RUN_MOVES) return { error: 'bad_run' };
  const rounds = [];
  for (let i = 0; i < played.length; i++) {
    const list = Game.cleanMoves(played[i]);
    if (!list) return { error: 'bad_moves', at: i };
    const d = scoreDeal(date, i);
    if (!d) return { error: 'bad_date' };
    const rep = Game.gameReplay(d.a, d.b, d.pre_flipped, list, roundTurns(i), d.hidden);
    if (rep.bad) return { error: 'bad_moves', at: i };
    rounds.push({ index: i, deal: d, moves: list, rep });
  }
  return { error: null, rounds };
}

export function puzzleNumber(ymd, dayOne = DAY_ONE) {
  if (!dayOne) return null;
  const d = Game.dayNumber(ymd), one = Game.dayNumber(dayOne);
  if (d == null || one == null || d < one) return null;
  return d - one + 1;
}

// The run so far: every round in `played` (the moves of rounds 0 to N−1, in order) must replay as solved, each with the
// turns Soul's own game gives it when it begins: turnsBase(i), plus every earlier hidden word's turns, less what the
// earlier rounds cost (cwp's playTotals counts the same). Answers the turns used and given, or the first refusal.
export function runSoFar(date, played) {
  if (!Array.isArray(played) || played.length > MAX_PLAYED) return { error: 'bad_run' };
  let moves = 0;
  for (const p of played) { if (!Array.isArray(p)) return { error: 'bad_run' }; moves += p.length; }
  if (moves > MAX_RUN_MOVES) return { error: 'bad_run' };
  let used = 0, bonus = 0;
  for (let i = 0; i < played.length; i++) {
    const list = Game.cleanMoves(played[i]);
    if (!list) return { error: 'bad_moves', at: i };
    const d = Game.dealRound(date, i);
    if (!d) return { error: 'bad_date' };
    const rep = Game.gameReplay(d.a, d.b, d.pre_flipped, list, Game.turnsBase(i) + bonus - used, d.hidden);
    if (rep.bad) return { error: 'bad_moves', at: i };
    if (!rep.solved) return { error: 'not_solved', at: i };
    used += rep.turns; bonus += rep.bonus;
  }
  return { error: null, used, bonus };
}

// ── The carry (his call 2, 2026-10-05: "Remember and carry"; carried XP counts and coins never, his AUQ the same night) ─────
// Keep my streak hands over the device's streak days (each day's rounds as moves). The server checks every day by replaying
// it, keeps them for CARRY_HOURS under a code's sha-256, and hands back the code, which rides the sign-in. Once the person's own
// Box exists, the sign-in page uses the code, and each day lands as that day's game on the Box: end_reason 'carried', which the
// coins never pay; its streak chained to the day before by Soul's rule; its XP counted as Soul's own game counts it.
export const CARRY_DAYS = 30;          // days one carry may hold: the latest days of a streak
export const CARRY_BACK = 60;          // how far back a carried day may be, by our clock
export const CARRY_HOURS = 24;         // a carry waits this long for its sign-in, then the hourly sweep deletes it
export const CARRY_MOVES = 8000;       // moves across every day of one carry (a real day is a few dozen to a few hundred)
export const CARRY_HOURLY = 300;       // carries waiting from the last hour, past which a new one waits (a public door that writes)
export const CARRY_CODE_RE = /^[0-9a-f]{32}$/;

// The code: 128 random bits as 32 hex characters, shown once, kept only as its sha-256 (the invite's own shape, box-lock.mjs).
export function newCarryCode(randomBytes) {
  const b = randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += (b[i] & 255).toString(16).padStart(2, '0');
  return s;
}
// The code a sign-in page handed over: lower-cased and trimmed; anything that is not a code reads as none.
export function carryCodeOf(v) {
  const c = String(v == null ? '' : v).trim().toLowerCase();
  return CARRY_CODE_RE.test(c) ? c : '';
}

// One day's rounds, replayed with Soul's own turns: every round but the last must be solved; the last may end unsolved (out of
// turns, or the page closed before its end). Answers the rounds with their deals and replays, the turns used and given, how
// many were solved and how the day ended ('stopped' after a solve, 'out_of_turns', or 'left'), or the first refusal.
export function replayDay(date, played) {
  if (isScoreDay(date)) return replayScoreDay(date, played);
  if (!Array.isArray(played) || !played.length || played.length > MAX_PLAYED) return { error: 'bad_run' };
  let moves = 0;
  for (const p of played) { if (!Array.isArray(p) || !p.length) return { error: 'bad_run' }; moves += p.length; }
  if (moves > MAX_RUN_MOVES) return { error: 'bad_run' };
  const rounds = [];
  let used = 0, bonus = 0;
  for (let i = 0; i < played.length; i++) {
    const list = Game.cleanMoves(played[i]);
    if (!list) return { error: 'bad_moves', at: i };
    const d = Game.dealRound(date, i);
    if (!d) return { error: 'bad_date' };
    const rep = Game.gameReplay(d.a, d.b, d.pre_flipped, list, Game.turnsBase(i) + bonus - used, d.hidden);
    if (rep.bad) return { error: 'bad_moves', at: i };
    if (!rep.solved && i < played.length - 1) return { error: 'not_solved', at: i };
    rounds.push({ index: i, deal: d, moves: list, rep });
    used += rep.turns; bonus += rep.bonus;
  }
  const last = rounds[rounds.length - 1].rep;
  return { error: null, rounds, used, bonus, solved: rounds.filter((r) => r.rep.solved).length, end: last.solved ? 'stopped' : last.out ? 'out_of_turns' : 'left' };
}

// A scored day for the carry: every round but the last played to its end (solved or out); the last may be left half played.
// end: 'done' once all SCORE_ROUNDS are played to their end, else 'left'.
function replayScoreDay(date, played) {
  if (!Array.isArray(played) || !played.length || played.length > SCORE_ROUNDS) return { error: 'bad_run' };
  for (const p of played) if (!Array.isArray(p) || !p.length) return { error: 'bad_run' };
  const run = scoreRun(date, played);
  if (run.error) return run;
  for (let i = 0; i < run.rounds.length - 1; i++) { const r = run.rounds[i].rep; if (!r.solved && !r.out) return { error: 'not_solved', at: i }; }
  const last = run.rounds[run.rounds.length - 1].rep, finished = last.solved || last.out;
  return { error: null, score: true, rounds: run.rounds, used: run.rounds.reduce((s, r) => s + r.rep.turns, 0), bonus: run.rounds.reduce((s, r) => s + r.rep.bonus, 0),
    solved: run.rounds.filter((r) => r.rep.solved).length, end: finished && run.rounds.length === SCORE_ROUNDS ? 'done' : 'left' };
}

// What Keep my streak may hand over: 1 to CARRY_DAYS days, each a real date no further back than CARRY_BACK days and no later
// than tomorrow by our clock, each once, each replaying with at least one round solved, CARRY_MOVES moves at most in all.
// Answers the days, oldest first, as their replayed moves, or the first refusal.
export function carryDays(days, nowMs) {
  if (!Array.isArray(days) || !days.length || days.length > CARRY_DAYS) return { ok: false, error: 'bad_carry' };
  const today = Math.floor(nowMs / 86400000), seen = new Set(), out = [];
  let moves = 0;
  for (const x of days) {
    if (!x || typeof x !== 'object' || typeof x.date !== 'string') return { ok: false, error: 'bad_carry' };
    const n = Game.dayNumber(x.date);
    if (n == null || n < today - CARRY_BACK || n > today + 1 || seen.has(x.date)) return { ok: false, error: 'bad_date' };
    seen.add(x.date);
    if (Array.isArray(x.played)) for (const p of x.played) moves += Array.isArray(p) ? p.length : 0;
    if (moves > CARRY_MOVES) return { ok: false, error: 'bad_carry' };
    const day = replayDay(x.date, x.played);
    if (day.error) return { ok: false, error: day.error };
    if (!day.solved) return { ok: false, error: 'not_solved' };
    out.push({ date: x.date, played: day.rounds.map((r) => r.moves) });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { ok: true, days: out };
}

// Whether a carry can be used by this Box now. row: { redeemed_at, redeemed_ws, expires_at } or null; answers null (use it),
// 'already' (this Box used it), or why not: 'not_found', 'used' (another Box), 'expired'.
export function carryVerdict(row, wsId, now) {
  if (!row) return 'not_found';
  if (row.redeemed_at) return row.redeemed_ws && row.redeemed_ws === wsId ? 'already' : 'used';
  if (!(new Date(row.expires_at) > now)) return 'expired';
  return null;
}

// The rows a carry lands: each day not already on the Box, as that day's game. existing: the Box's own games around the carried
// days ({ play_date, rounds_solved, streak }). A day's streak follows Soul's rule (streakFor) from the day before, carried or
// played on the Box; its XP is Soul's own (roundXp for a solved round, endXp at its end; a day left before its end gets none of
// the end's, as a Box's game left open gets none).
export function carryRows(days, existing) {
  const have = new Map((existing || []).map((p) => [String(p.play_date), p]));
  const plays = [], skipped = [];
  for (const x of days) {
    if (have.has(x.date)) { skipped.push(x.date); continue; }
    const day = replayDay(x.date, x.played);
    if (day.error) throw new Error('carryRows: ' + x.date + ' does not replay (' + day.error + ')');
    const before = new Date((Game.dayNumber(x.date) - 1) * 86400000).toISOString().slice(0, 10);
    const streak = Game.streakFor(day.solved, have.get(before) || null);
    const cur = day.rounds.length - 1;
    const allowed = (day.score ? day.rounds.reduce((s, r) => s + roundTurns(r.index), 0) : Game.turnsBase(cur)) + day.rounds.reduce((s, r) => s + Game.foundTurns(r.rep.found), 0);
    const xpRounds = day.rounds.reduce((s, r) => s + (r.rep.solved ? Game.roundXp(r.index) : 0), 0);
    const end = day.end === 'left' ? { stop: 0, six: 0, streak: 0 } : Game.endXp(day.end, allowed - day.used, cur >= Game.GAME_SIX_FROM, streak);
    plays.push({
      play_date: x.date, current_round: cur, rounds_solved: day.solved, turns_allowed: allowed, turns_used: day.used,
      xp_rounds: xpRounds, xp_hidden: 0, xp_stop: end.stop, xp_six: end.six, xp_streak: end.streak, xp_total: xpRounds + end.stop + end.six + end.streak, streak,
      rounds: day.rounds.map((r) => ({
        round_index: r.index, word_a: r.deal.a, word_b: r.deal.b, cat_a: r.deal.cat_a, cat_b: r.deal.cat_b, pre_flipped: r.deal.pre_flipped,
        hidden: r.deal.hidden, found: r.rep.found.map((f) => f.w), moves: r.moves, turns_used: r.rep.turns, guesses: r.rep.guesses,
        solved: !!r.rep.solved, solved_word: r.rep.solved ? r.rep.word : null, first_move_ms: r.moves[0].t, last_move_ms: r.moves[r.moves.length - 1].t,
        xp: r.rep.solved ? Game.roundXp(r.index) : 0,
      })),
    });
    have.set(x.date, { play_date: x.date, rounds_solved: day.solved, streak });
  }
  return { plays, skipped };
}

// One request: the person's own date (within a day of ours, the members' rule) and the rounds they have solved. Answers
// round N (N = how many they sent) with the turns it starts with, or { ok: false, error }.
export function nextRound(date, played, nowMs) {
  if (typeof date !== 'string' || !Game.playDateOk(date, nowMs)) return { ok: false, error: 'bad_date' };
  if (isScoreDay(date)) {
    const run = scoreRun(date, played);
    if (run.error) return { ok: false, error: run.error };
    for (const r of run.rounds) if (!r.rep.solved && !r.rep.out) return { ok: false, error: 'not_solved', at: r.index };
    const index = played.length;
    if (index >= SCORE_ROUNDS) return { ok: false, error: 'day_done' };
    const d = scoreDeal(date, index);
    if (!d) return { ok: false, error: 'bad_date' };
    return { ok: true, date, number: puzzleNumber(date), index, a: d.a, b: d.b, pre: d.pre_flipped, hidden: d.hidden,
      base: roundTurns(index), score: true, rounds: SCORE_ROUNDS, par: parOf(d.a, d.b, d.pre_flipped) };
  }
  const run = runSoFar(date, played);
  if (run.error) return { ok: false, error: run.error };
  const index = played.length, d = Game.dealRound(date, index);
  if (!d) return { ok: false, error: 'bad_date' };
  return { ok: true, date, number: puzzleNumber(date), index, a: d.a, b: d.b, pre: d.pre_flipped, hidden: d.hidden,
    base: Game.turnsBase(index) + run.bonus - run.used };
}
