// Soul's first read (Phase 2, slice 2, 2026-09-24) — a few lines about how a person just played, each naming the move it
// came from, written by fixed rules over their saved moves. No AI is called (plan § 6: the read is written by rules over
// their moves, never by an AI we call). Pure: no network, no Deno APIs; imported by index.ts (Deno) and by
// tests/cwp-soul-read.test.js (Node), one text for both.
//
// How a read runs (captain AUQ, 2026-09-24: one at a time, up to five): after the game, one line at a time, the strongest
// first. A "that's me" lets the next line go deeper the same way (a second line of the same family); a "not me" closes
// that family for the rest of the read, and keeps that rule out of every later read of that person: their correction is
// their lens. (Since 2026-10-02 a line is also asked at most twice, the second time worded again, then settled; a "not
// me" after a "that's me" waits a week and asks once more: readHistory below.) Leading with the strongest line works AGAINST the first-sitting bet (a1691bc4, the that's-me rate rising
// within a sitting): later lines carry less evidence, so a rise has to come from the learning.
//
// Every line is FACT: INFERENCE. The fact names a move that is in their saved moves (or the Stop / Keep going tap after
// a round) and is true by construction; "that's me / not me" judges the inference. tests/cwp-soul-read.test.js holds the
// facts to the moves, rule by rule.
import { gameStep, gameShowing, gameFoundTurns, GAME_BASE_TURNS, turnsForNext } from './soul-game.mjs';

export const MAX_LINES = 5;
export const VERDICTS = new Set(['me', 'not_me']);
export const MAX_WHY = 500;
export const READ_ENDS = new Set(['stopped', 'out_of_turns']);   // a game ended by leaving is read by nobody: no read
export const READ_COLUMNS = 'id, play_id, seq, rule, family, round_index, move_index, line, verdict, why, shown_at, ruled_at, why_at';

// The rules, in their tie-break order, each with its family. Two rules that say opposite things never share a read.
export const RULES = [
  ['hidden', 'eye'],
  ['banks', 'risk'], ['pushes', 'risk'], ['edge', 'risk'],
  ['second_word', 'path'], ['takes_back', 'path'], ['clean', 'path'], ['sweeps', 'path'],
  ['says_it', 'instinct'], ['sure_guess', 'instinct'], ['thinks_aloud', 'instinct'],
  ['looks_first', 'tempo'], ['acts_fast', 'tempo'], ['slows_down', 'tempo'], ['speeds_up', 'tempo'],
];
const FAMILY = Object.fromEntries(RULES);
const ORDER = Object.fromEntries(RULES.map(([r], i) => [r, i]));
export const OPPOSES = { banks: 'pushes', pushes: 'banks', acts_fast: 'looks_first', looks_first: 'acts_fast',
  slows_down: 'speeds_up', speeds_up: 'slows_down', thinks_aloud: 'sure_guess', sure_guess: 'thinks_aloud' };

const turnWord = (n) => n + (n === 1 ? ' turn' : ' turns');
function secs(ms) {
  const s = Math.round(ms / 100) / 10;
  if (s === 1) return '1 second';
  return (s < 10 ? s.toFixed(1) : String(Math.round(s))) + ' seconds';
}
const cap = (x, hi) => Math.min(hi, x);

// One round, walked move by move with the game's own rules: what each move did.
export function walkRound(rd) {
  const a = rd.word_a, b = rd.word_b, pre = Array.isArray(rd.pre_flipped) ? rd.pre_flipped : [];
  const r = { a, b, flipped: pre.slice(), hidden: Array.isArray(rd.hidden) ? rd.hidden : [] };
  const moves = Array.isArray(rd.moves) ? rd.moves : [];
  const steps = [];
  const seen = new Set();
  let prevT = 0, net = 0, bonus = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i] || {};
    const before = gameShowing(r);
    const s = gameStep(r, m);
    if (s.bad) break;                                   // saved moves were checked when saved; a bad one ends the walk
    const fresh = !!s.hidden && !seen.has(s.hidden);    // the first time in this round: free, and a turn (2026-10-01)
    if (fresh) { seen.add(s.hidden); bonus = gameFoundTurns(seen.size); } else net += s.cost;   // at most GAME_HIDDEN_PAID finds pay (2026-10-02)
    steps.push({ i, k: m.k, p: m.p, w: m.w, t: m.t, gap: m.t - prevT, cost: s.cost, before, showing: gameShowing(r), hidden: s.hidden, solved: s.solved });
    prevT = m.t;
    if (s.solved) break;
  }
  let da = 0, db = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { if (pre[i]) da++; else db++; }
  const last = steps[steps.length - 1];
  return {
    index: rd.round_index, n: rd.round_index + 1, a, b, da, db, steps,
    solved: !!(last && last.solved), word: last && last.solved ? last.showing : '',
    byGuess: !!(last && last.solved && last.k === 'g'),
    turns: steps.reduce((x, s) => x + s.cost, 0),       // every paid-for kind of move, the free finds included: what the fewest-turns rule counts
    net, bonus,                                         // what the round's moves cost, and the turns its hidden words gave
  };
}

// Turns allowed while playing round i, and turns left after it: the game's own arithmetic, from its saved rounds.
function allowedFor(i) { let t = GAME_BASE_TURNS; for (let j = 1; j <= i; j++) t = turnsForNext(t, j); return t; }
function leftAfter(rounds, i) {
  let used = 0;
  for (const w of rounds) if (w.index <= i) used += w.net - w.bonus;
  return allowedFor(i) - used;
}
// Turns a round had to work with when it was dealt: allowed while playing it, less what the rounds before it used.
function leftAtStart(rounds, i) {
  let used = 0;
  for (const w of rounds) if (w.index < i) used += w.net - w.bonus;
  return allowedFor(i) - used;
}

// Every line this game supports: { rule, family, round, move, weight, text }. round/move are 0-based; move is null
// for the Stop or Keep going tap after a round, which is not one of the round's moves.
export function candidates(play, roundRows) {
  const rounds = (roundRows || []).slice().sort((x, y) => x.round_index - y.round_index).map(walkRound);
  const out = [];
  const add = (rule, round, move, weight, text) => out.push({ rule, family: FAMILY[rule], round, move, weight: Math.round(weight * 100) / 100, text });
  if (!rounds.length) return out;
  const cur = play.current_round;
  const lastRound = rounds.find((w) => w.index === cur) || rounds[rounds.length - 1];
  // Round 1 of a person's first game (play.first_game, set by the caller) is them learning the game: no line is read
  // from inside it. The Stop or Keep going after it, and a hidden word found in it, still are.
  const inRound = rounds.filter((w) => !(play.first_game && w.index === 0));

  // ── risk: what they did with a lead
  if (play.end_reason === 'stopped' && lastRound.solved) {
    const left = leftAfter(rounds, lastRound.index);
    if (left >= 1) add('banks', lastRound.index, null, 2 + cap(left / 6, 1),
      'You stopped after round ' + lastRound.n + ' with ' + turnWord(left) + ' left and kept ' + (2 * left) + ' XP: you bank a win before you push it.');
  }
  if (play.end_reason === 'out_of_turns' && cur >= 1) {
    const k = rounds.find((w) => w.index === cur - 1);
    const left = k && k.solved ? leftAfter(rounds, k.index) : 0;
    if (k && left >= 2) add('pushes', k.index, null, 2 + cap(left / 6, 1),
      'After round ' + k.n + ' you kept going with ' + turnWord(left) + ' left instead of keeping ' + (2 * left) + ' XP, and ran out in round ' + (k.n + 1) + ': you’d rather play it out than cash in.');
  }
  const tight = inRound.find((w) => w.solved && leftAtStart(rounds, w.index) <= 3);
  if (tight) {
    add('edge', tight.index, tight.steps.length - 1, 1.8,
      'You had only ' + turnWord(leftAtStart(rounds, tight.index)) + ' left going into round ' + tight.n + ', and you solved it: you’re at your best when it’s tight.');
  }

  // ── path: how they got to a word
  const backs = inRound.filter((w) => w.solved && w.word === w.b);
  if (backs.length) {
    const w = backs[0], solvedN = inRound.filter((x) => x.solved).length;
    const text = backs.length === 1
      ? 'In round ' + w.n + ' you went for ' + w.b + ', the word on the backs, when ' + w.a + ' was ' + turnWord(w.da) + ' away: you look past the obvious.'
      : 'You solved ' + backs.length + ' of ' + solvedN + ' rounds on the word on the backs, ' + w.b + ' in round ' + w.n + ' first: you look past the obvious.';
    add('second_word', w.index, w.steps.length - 1, 2 + cap(0.3 * (backs.length - 1), 0.8) + (w.da < w.db ? 0.3 : 0), text);
  }
  const takeBacks = [];
  for (const w of inRound) for (let j = 1; j < w.steps.length; j++) {
    const s = w.steps[j], p = w.steps[j - 1];
    if (s.k === 'f' && p.k === 'f' && s.p === p.p) takeBacks.push({ w, s });
  }
  if (takeBacks.length) {
    const { w, s } = takeBacks[0];
    add('takes_back', w.index, s.i, 1.5 + cap(0.3 * (takeBacks.length - 1), 0.9),
      'In round ' + w.n + ' you turned coin ' + (s.p + 1) + ' over and straight back: you try an idea and let it go fast.');
  }
  const clean = inRound.filter((w) => w.solved && !w.byGuess && w.turns === Math.min(w.da, w.db) && w.turns > 0);
  if (clean.length) {
    const w = clean[0];
    add('clean', w.index, w.steps.length - 1, 1.2 + cap(0.3 * (clean.length - 1), 0.9),
      'In round ' + w.n + ' you solved ' + w.word + ' in ' + turnWord(w.turns) + ', the fewest it could take: you see the whole board before you move.');
  }
  const sweeps = inRound.filter((w) => {
    const f = w.steps.filter((s) => s.k === 'f');
    return f.length >= 3 && f.every((s, j) => j === 0 || s.p > f[j - 1].p);
  });
  if (sweeps.length) {
    const w = sweeps[0], first = w.steps.find((s) => s.k === 'f');
    add('sweeps', w.index, first.i, 1.1 + cap(0.2 * (sweeps.length - 1), 0.5),
      'In round ' + w.n + ' you turned the coins left to right, one after another: you work through things in order.');
  }

  // ── instinct: words or coins
  const guessFirst = inRound.filter((w) => w.steps.length && w.steps[0].k === 'g');
  if (guessFirst.length) {
    const w = guessFirst[0], s = w.steps[0], right = s.solved;
    add('says_it', w.index, 0, 2 + cap(0.5 * (guessFirst.length - 1), 1) + (right ? 0.5 : 0),
      'Your first move in round ' + w.n + ' was typing ' + s.w + ' before turning a single coin' + (right ? ', and it was right' : '') + ': you trust the first thing you see.');
  }
  const wrongs = [];
  for (const w of inRound) for (const s of w.steps) if (s.k === 'g' && !s.solved && !s.hidden) wrongs.push({ w, s });
  const guessSolves = inRound.filter((w) => w.byGuess);
  if (wrongs.length >= 2) {
    const { w, s } = wrongs[0];
    add('thinks_aloud', w.index, s.i, 1.4 + cap(0.2 * (wrongs.length - 2), 0.8),
      'You tried ' + s.w + ' in round ' + w.n + (w.solved ? ' before you found ' + w.word : '') + ': you think out loud.');
  } else if (guessSolves.length >= 2 && wrongs.length === 0) {
    const w = guessSolves[0];
    add('sure_guess', w.index, w.steps.length - 1, 2.2,
      'You solved ' + guessSolves.length + ' rounds by typing the word, ' + w.word + ' in round ' + w.n + ' first, without one wrong guess: when you say it, you mean it.');
  }

  // ── tempo: how fast they moved
  // Only a round that opened on a coin measures the look before the first move: a typed word lands when it is sent, so
  // its time holds the typing too (found on the harness, 2026-09-24). And never round 1: its clock starts when the page
  // opens, so it holds the opening and the how-to line (found on the captain's first game, 2026-09-24: 22 seconds).
  const firsts = rounds.filter((w) => w.index > 0 && w.steps.length && w.steps[0].k === 'f').map((w) => ({ w, ms: w.steps[0].t }));
  if (firsts.length) {
    const fast = firsts.filter((f) => f.ms < 2000);
    const slowest = firsts.reduce((x, y) => (y.ms > x.ms ? y : x));
    if (slowest.ms >= 8000) add('looks_first', slowest.w.index, 0, 1.4 + cap((slowest.ms - 8000) / 20000, 1),
      'You waited ' + secs(slowest.ms) + ' before turning your first coin in round ' + slowest.w.n + ': you look before you leap.');
    if (fast.length >= 2 && fast.length / firsts.length >= 0.6) {       // both may hold; they oppose, so a read shows one
      const quickest = fast.reduce((x, y) => (y.ms < x.ms ? y : x));
      add('acts_fast', quickest.w.index, 0, 1.4 + 0.6 * fast.length / firsts.length,
        'You turned your first coin in under two seconds in ' + fast.length + ' rounds, ' + secs(quickest.ms) + ' in round ' + quickest.w.n + ': you think with your hands.');
    }
    if (firsts.length >= 3) {
      const one = firsts[0], end = firsts[firsts.length - 1];
      if (end.ms >= 2 * one.ms && end.ms >= 4000) add('slows_down', end.w.index, 0, 1.3,
        'Your first coin took ' + secs(one.ms) + ' in round ' + one.w.n + ' and ' + secs(end.ms) + ' in round ' + end.w.n + ': you take more care the deeper you go.');
      else if (end.ms * 2 <= one.ms && one.ms >= 3000) add('speeds_up', end.w.index, 0, 1.3,
        'Your first coin took ' + secs(one.ms) + ' in round ' + one.w.n + ' and ' + secs(end.ms) + ' by round ' + end.w.n + ': you find your rhythm.');
    }
  }

  // ── eye: another real word hiding in the coins (captain ruling, round 12)
  const finds = [];
  for (const w of rounds) { const seen = new Set(); for (const s of w.steps) if (s.hidden && !seen.has(s.hidden)) { seen.add(s.hidden); finds.push({ w, s }); } }
  if (finds.length) {
    const { w, s } = finds[0];
    const text = s.k === 'f'
      ? 'In round ' + w.n + ', turning coin ' + (s.p + 1) + ' spelled ' + s.hidden + ', another word hiding in the coins: you see what other people walk past.'
      : s.before === s.hidden
        ? 'In round ' + w.n + ' the coins spelled ' + s.hidden + ' and you named it, another word hiding there: you read what’s in front of you.'
        : 'In round ' + w.n + ' you typed ' + s.hidden + ', another word hiding in those letters: you see words before they’re there.';
    add('hidden', w.index, s.i, 3 + cap(0.3 * (finds.length - 1), 0.6), text);
  }
  return out;
}

// The next line of a read, or null when there is nothing more worth saying.
//   lines    — this read's lines so far, in order: { rule, family, verdict }
//   rejected — rules this person answered "not me" to in an EARLIER read (their lens; never shown to them again)
export function pickNext(cands, lines, rejected) {
  const done = lines || [];
  if (done.length >= MAX_LINES) return null;
  const shown = new Set(done.map((l) => l.rule));
  const confirmed = new Set(done.filter((l) => l.verdict === 'me').map((l) => l.family));
  const perFamily = {};
  for (const l of done) perFamily[l.family] = (perFamily[l.family] || 0) + 1;
  const pool = (cands || []).filter((c) => {
    if (shown.has(c.rule) || (rejected && rejected.has(c.rule))) return false;
    if (OPPOSES[c.rule] && shown.has(OPPOSES[c.rule])) return false;
    const had = perFamily[c.family] || 0;
    if (had >= 2) return false;
    // A kind's second line comes only after a "that's me" on its first, and never a third: this is also what closes a
    // kind after a "not me", for the rest of the read (tools/soul/read-mutants.cjs found a separate closing rule redundant).
    if (had === 1 && !confirmed.has(c.family)) return false;
    return true;
  });
  if (!pool.length) return null;
  const best = (list) => list.reduce((x, y) => (y.weight > x.weight || (y.weight === x.weight && ORDER[y.rule] < ORDER[x.rule]) ? y : x));
  const last = done[done.length - 1];
  if (last && last.verdict === 'me') {                            // go deeper the same way, when there is more to say there
    const same = pool.filter((c) => c.family === last.family);
    if (same.length) return best(same);
  }
  return best(pool);
}

// What a person may send with a "not me": one block of their own words, trimmed, at most MAX_WHY. '' when empty.
export function cleanWhy(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, '').trim().slice(0, MAX_WHY);
}

// What the page is sent for each line (a cwp_read_lines row): the line, their answer and their own words back to them;
// never the rule or its weight. The answer is the one that stands (a change, once there is one).
export function publicLine(l) {
  return { id: l.id, seq: l.seq, text: l.line, verdict: answerOf(l), why: l.why || '' };
}

// ── A changed answer (You, rebuilt, phase 2; docs/soul-you-rebuilt-plan-2026-09-28.md; captain AUQ 2026-09-28 night, "Keep
// both"). The first answer stays as given (the table's trigger refuses to change it); a change sits beside it in
// changed_verdict, stamped by the database clock, and counts from then on: in the read, in the rules kept out of later
// reads, and on the mirror. The new columns are read on their own (CHANGE_COLUMNS), never inside READ_COLUMNS, so a
// function deployed ahead of its migration still reads every game.
export const CHANGE_COLUMNS = 'id, play_id, rule, verdict, changed_verdict, changed_at';
export const MIRROR_LINES = 60;                                     // the answered lines the mirror shows, newest first
export function answerOf(l) { return (l && (l.changed_verdict || l.verdict)) || null; }
// The rules kept out of a person's later reads: every rule whose standing answer is "not me", from the lines answered "not
// me" at first (notMe: { id, rule, verdict }) and the lines whose answer was changed either way (changed: CHANGE_COLUMNS).
export function rejectedRules(notMe, changed) {
  const byId = new Map();
  for (const l of notMe || []) byId.set(l.id, { rule: l.rule, answer: l.verdict });
  for (const c of changed || []) byId.set(c.id, { rule: c.rule, answer: answerOf(c) });
  const out = new Set();
  for (const v of byId.values()) if (v.answer === 'not_me') out.add(v.rule);
  return out;
}
// ── Asked once, worded again once, then settled (captain AUQ 2026-10-02, after "a lot of the questions are repeating":
// he had said "that's me" to the same line five games running). A rule's earlier answers on this box, oldest first,
// decide what it may do in this read:
//   never answered            → asked as written
//   "not me" the first time   → never again (their lens, as before)
//   "that's me" once          → asked once more, worded differently (REWORD)
//   "that's me" twice         → settled: never again
//   "that's me", then "not me" → asked again as written, a week after the second answer (REASK_DAYS); whatever they
//                               say then settles it
// A changed answer counts as the one that stands. Unanswered lines are not answers and decide nothing.
export const REASK_DAYS = 7;
// The second wording: the same trait, said another way. The fact before the colon stays as written.
export const REWORD = {
  hidden: 'you notice what other people miss.',
  banks: 'you’d rather keep a win than risk it.',
  pushes: 'you’d rather see how far it goes.',
  edge: 'pressure sharpens you.',
  second_word: 'you don’t settle for the first answer.',
  takes_back: 'you drop an idea the moment it stops working.',
  clean: 'you plan the whole way before you start.',
  sweeps: 'you like to go step by step.',
  says_it: 'you go with your gut.',
  sure_guess: 'you don’t guess until you know.',
  thinks_aloud: 'you figure things out by trying them.',
  looks_first: 'you take it all in before you act.',
  acts_fast: 'you’d rather start than wait.',
  slows_down: 'the harder it gets, the more careful you are.',
  speeds_up: 'you warm up as you go.',
};
// A line's second wording: the fact as written, the trait from REWORD. The text unchanged when there is none.
export function rewordLine(text, rule) {
  const s = String(text == null ? '' : text), alt = REWORD[rule], at = s.lastIndexOf(': ');
  return alt && at > 0 ? s.slice(0, at + 2) + alt : s;
}
// What each rule may do in this read, from this box's lines of EARLIER games (this game's own lines never count):
//   rows — { rule, verdict, changed_verdict?, shown_at }; nowMs — the server's clock.
// → { skip: rules kept out of this read, reword: rules asked in their second wording }
export function readHistory(rows, nowMs) {
  const byRule = new Map();
  for (const r of (rows || []).slice().sort((x, y) => String(x.shown_at).localeCompare(String(y.shown_at)))) {
    const a = answerOf(r);
    if (!r || !r.rule || !VERDICTS.has(a)) continue;
    if (!byRule.has(r.rule)) byRule.set(r.rule, []);
    byRule.get(r.rule).push({ a, at: Date.parse(r.shown_at) });
  }
  const skip = new Set(), reword = new Set();
  for (const [rule, h] of byRule) {
    if (h[0].a === 'not_me') skip.add(rule);
    else if (h.length === 1) reword.add(rule);
    else if (h[1].a === 'me' || h.length >= 3) skip.add(rule);
    else if (!(nowMs - h[1].at >= REASK_DAYS * 86400000)) skip.add(rule);   // a mismatch waits its week
  }
  return { skip, reword };
}
// A line as the mirror shows it: the answer that stands, the first one when it was changed, their reason, and the game's day.
export function mirrorLine(l, playDate) {
  return { id: l.id, text: l.line, verdict: answerOf(l), first: l.changed_verdict && l.changed_verdict !== l.verdict ? l.verdict : null, why: l.why || '', changed_at: l.changed_at || null, play_date: playDate || null };
}
