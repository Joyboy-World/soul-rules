// Soul's pet (Phase 2, slice 3, 2026-09-24) — its level, what it has grown, and the five play habits that shape it, all
// from the person's saved games. Pure: no network, no Deno APIs; imported by index.ts (Deno) and by
// tests/cwp-soul-pet.test.js (Node), one text for both.
//
// Captain rulings (docs/soulcode-return-plan-2026-09-23.md § 11): the creature levels with play, not work, and box work
// keeps its own track (R8); the levels people already have are the pet's head start, from then on only play moves it,
// and nobody's pet shrinks (R12); arms at level 3 and legs at level 5, on today's level curve left as it is; the frame
// grows with the pet; five play habits shape the blob, each measured from the person's own moves, the same five kinds
// the read uses (round 14, AUQ over the sketch at docs/soul/pet-card-growth-sketch-2026-09-24.html).
//
// THE HEAD START IS THE CARD'S seeded_xp. The level someone had was levelFor(seeded + work); work_xp was 0 on every card
// when this shipped (read 2026-09-24), so seeded carries each level over exactly, and work earned from here on stays on
// the work track, where R8 puts it. Play XP is every game's xp_total: the number the server scored from the saved moves.
import { walkRound } from './soul-read.mjs';

export const ARMS_AT = 3;
export const LEGS_AT = 5;
export const FRAME_AT = { corners: 2, crest: 4, light: 6, sparkles: 8 };
export const HABITS = ['tempo', 'risk', 'instinct', 'eye', 'path'];
// The word under the card for the habit it leans toward. Placeholders (round 14): his to rename.
export const LEAN_WORDS = { tempo: 'quick', risk: 'daring', instinct: 'bold', eye: 'watchful', path: 'tidy' };
export const HABIT_GAMES = 30;     // habits read the last 30 games, so the pet shows who someone is now
export const SETTLE = 4;           // with 4 moments of evidence, a habit sits halfway between neutral and their own rate
export const LEAN_MIN = 8;         // a lean shows only when a habit stands at least this far above neutral

export const PET_PLAY_COLUMNS = 'id, play_date, status, end_reason, xp_total';
export const PET_ROUND_COLUMNS = 'play_id, round_index, word_a, word_b, pre_flipped, moves, hidden';

// The level curve, the same as apeiron-os/lib/cards.cjs levelFor (a test holds the two equal), so a head start is the
// same level on both tracks.
export function levelFor(xp) { return Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 100)) + 1; }
export function xpForLevel(level) { const l = Math.max(1, Math.floor(Number(level) || 1)); return (l - 1) * (l - 1) * 100; }

// A habit starts at 50 and moves toward the person's own rate as evidence comes in: never a verdict from one moment.
function settle(sum, n) {
  if (!n) return 50;
  return Math.round(50 + ((sum / n) * 100 - 50) * n / (n + SETTLE));
}

// The five habits, 0 to 100 each.
//   plays  — the box's games: { id, play_date, status, end_reason } in any order
//   rounds — their rounds:   { play_id, round_index, word_a, word_b, pre_flipped, moves, hidden }
export function habits(plays, rounds) {
  const games = (plays || []).slice().sort((x, y) => (x.play_date < y.play_date ? -1 : x.play_date > y.play_date ? 1 : 0));
  const firstId = games.length ? games[0].id : null;
  const byPlay = new Map();
  for (const r of rounds || []) { if (!byPlay.has(r.play_id)) byPlay.set(r.play_id, []); byPlay.get(r.play_id).push(r); }
  const acc = {};
  for (const h of HABITS) acc[h] = { sum: 0, n: 0 };
  const see = (h, v) => { acc[h].sum += v; acc[h].n += 1; };
  for (const p of games.slice(-HABIT_GAMES)) {
    // risk: how a game ended, cashing out (0) or playing it out (1). A game left unfinished says nothing.
    if (p.status === 'done' && p.end_reason === 'stopped') see('risk', 0);
    else if (p.status === 'done' && p.end_reason === 'out_of_turns') see('risk', 1);
    const rs = (byPlay.get(p.id) || []).slice().sort((x, y) => x.round_index - y.round_index);
    for (const rd of rs) {
      const w = walkRound(rd);
      if (!w.steps.length) continue;
      // eye: in a round that hid another word, did they find one? A find in the learning round counts, as in the read.
      if (Array.isArray(rd.hidden) && rd.hidden.length) see('eye', w.steps.some((s) => s.hidden) ? 1 : 0);
      if (p.id === firstId && w.index === 0) continue;               // round 1 of their first game is learning the game
      // instinct: the first move a typed word (1), a word typed to finish (0.5), or coins all the way (0)
      see('instinct', w.steps[0].k === 'g' ? 1 : w.byGuess ? 0.5 : 0);
      // path: a round solved on coins, the fewest turns it could take over the turns it took
      if (w.solved && !w.byGuess && w.turns > 0) {
        const best = Math.min(w.da, w.db);
        if (best > 0) see('path', Math.min(1, best / w.turns));
      }
      // tempo: the look before the first coin. Never round 1 (its clock starts when the page opens) and never a typed
      // first move (its time holds the typing), the read's own rule. 2 s or less is quick (1), 8 s or more slow (0).
      if (w.index > 0 && w.steps[0].k === 'f') {
        const ms = w.steps[0].t;
        see('tempo', ms <= 2000 ? 1 : ms >= 8000 ? 0 : (8000 - ms) / 6000);
      }
    }
  }
  const out = {};
  for (const h of HABITS) out[h] = settle(acc[h].sum, acc[h].n);
  return out;
}

// The habit the pet leans toward, or '' when none stands out. A tie goes to the earlier habit in HABITS.
export function leansOf(h) {
  let best = '', top = LEAN_MIN - 1;
  for (const k of HABITS) {
    const d = (h && typeof h[k] === 'number' ? h[k] : 50) - 50;
    if (d > top) { top = d; best = k; }
  }
  return best;
}

// The pet as the page is sent it. seededXp is the card's seeded_xp (null when the box has no card: no head start).
export function petFrom({ seededXp, plays, rounds }) {
  const played = (plays || []).reduce((s, p) => s + Math.max(0, Number(p.xp_total) || 0), 0);
  const xp = Math.max(0, Number(seededXp) || 0) + played;
  const level = levelFor(xp);
  const h = habits(plays, rounds);
  const leans = leansOf(h);
  return {
    xp, level, level_xp: xpForLevel(level), next_xp: xpForLevel(level + 1),
    arms: level >= ARMS_AT, legs: level >= LEGS_AT,
    frame: { corners: level >= FRAME_AT.corners, crest: level >= FRAME_AT.crest, light: level >= FRAME_AT.light, sparkles: level >= FRAME_AT.sparkles },
    habits: h, leans, lean_word: leans ? LEAN_WORDS[leans] : '',
    games: (plays || []).length,
  };
}

// Play XP per box, for a room's levels and a battle's power: { box id: summed xp_total }.
export function playXpByBox(rows) {
  const out = {};
  for (const r of rows || []) out[r.workstation_id] = (out[r.workstation_id] || 0) + Math.max(0, Number(r.xp_total) || 0);
  return out;
}

// ── The legendary turn (captain AUQ 2026-09-28, "Levels and limbs only"; docs/soul-checklist.md § Next). The flip card's
// turn after the read is quiet every day and legendary only on a game that changed the pet: a new level, arms, legs. A
// lean moving does not count: it moved on 11 of the first 17 games (the backtest, 2026-09-28), so it would have made the
// rare turn the daily one. The mint joins this list when it exists. Nothing here reads a read line: the turn keys off
// what the pet earned, never off which answers were given.
export function petChange(was, now) {
  if (!was || !now) return [];
  const grew = [];
  if ((Number(now.level) || 0) > (Number(was.level) || 0)) grew.push('level');
  if (now.arms === true && was.arms !== true) grew.push('arms');
  if (now.legs === true && was.legs !== true) grew.push('legs');
  return grew;
}

// What one game did to the pet: the pet just before it against the pet just after it, both from the rows petFrom reads,
// in any order (a later game's XP never counts for an earlier one). [] when that game is not among the rows. Nothing on
// the list above reads a habit, so the rounds are left out; a lean joining the list must pass them.
export function gameChange(rows, playId) {
  const all = (rows && rows.plays) || [];
  const game = all.find((p) => p.id === playId);
  if (!game) return [];
  const upto = all.filter((p) => p.play_date <= game.play_date);
  const before = upto.filter((p) => p.play_date < game.play_date);
  return petChange(petFrom({ seededXp: rows.seededXp, plays: before, rounds: [] }), petFrom({ seededXp: rows.seededXp, plays: upto, rounds: [] }));
}
