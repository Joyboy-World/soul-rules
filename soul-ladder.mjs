// The skills ladder's rules in the box function (Parts B, C and D of docs/soul-skills-ladder-plan-2026-10-09.md; his rulings
// 2026-10-09: the fork; a skill for 500 coins, written by Sonnet, a badge pinned to the Onibee, three at once; a branch, under a cap
// on live branches, free 3 and member 10, nobody over it losing anything). No network, no database: tests/soul-ladder.test.js
// holds it. The database decides every part (supabase/migrations/20261009_cwp_skills_ladder.sql); this file names its refusals in
// words the page shows, checks a branch's name before it is sent, and shapes what the page reads.

export const TITLE_MAX = 80, SHORT_MAX = 24;

// The database's codes, in words.
export const REFUSALS = Object.freeze({
  P0002: 'not_found', CL031: 'on_hold', CL032: 'not_enough', CL085: 'price_moved',
  CL121: 'not_offered', CL122: 'being_written', CL123: 'too_many_skills', CL125: 'pins_full', CL126: 'branches_full',
  CL127: 'pick_three', CL128: 'already_combined', CL129: 'workflow_being_written',   // a workflow from three skills (Part E)
});
export function refusalOf(code) { return Object.prototype.hasOwnProperty.call(REFUSALS, code) ? REFUSALS[code] : null; }

const clean = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '');
// A branch's name: the title they typed (1 to 80), and its short name (theirs, or the title's first words up to 24).
export function branchName(title, short) {
  const t = clean(title);
  if (!t || t.length > TITLE_MAX) return { error: t ? 'title_too_long' : 'no_title' };
  let s = clean(short);
  if (s.length > SHORT_MAX) return { error: 'short_too_long' };
  if (!s) {
    s = '';
    for (const w of t.split(' ')) { if ((s ? s + ' ' + w : w).length > SHORT_MAX) break; s = s ? s + ' ' + w : w; }
    if (!s) s = t.slice(0, SHORT_MAX).trim();
  }
  return { title: t, short: s };
}

// What the page reads: the price, the badges (pinned first), the skills being written, and the room for branches.
export function ladderPublic(rows) {
  const r = rows || {};
  const badges = (Array.isArray(r.badges) ? r.badges : []).map((b) => ({
    id: b.id, title: b.title, made_at: b.made_at, pinned: !!b.pinned_at, goal_id: b.goal_id || null, kind: b.kind === 'workflow' ? 'workflow' : 'skill',
  })).sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || String(b.made_at).localeCompare(String(a.made_at)));
  const jobs = (Array.isArray(r.jobs) ? r.jobs : []).map((j) => ({ goal_id: j.goal_id || null, kind: j.kind === 'workflow' ? 'workflow' : 'skill', status: j.status, refunded: j.status === 'refunded' }));
  const room = r.room && typeof r.room === 'object' ? { live: Number(r.room.live) || 0, cap: Number(r.room.cap) || 0, member: !!r.room.member } : null;
  return { skill_price: Number.isInteger(r.price) ? r.price : null, badges_max: Number.isInteger(r.pins) ? r.pins : 3, badges, jobs, room,
    workflow_price: Number.isInteger(r.workflowPrice) ? r.workflowPrice : null, workflow_need: Number.isInteger(r.workflowNeed) ? r.workflowNeed : 3 };
}
