// The SoulCard market, phase one: a person's own first edition (docs/soul-card-market-plan-2026-10-08.md; the database half is
// 20261008_cwp_first_editions.sql). His rulings 2026-10-08: sellers are 18 and over; "first edition", never "minting". The rules
// the box function and its tests share live ONCE here. A first edition is a skill the person's own AI kept on their Box
// (skills/<name>/SKILL.md), published under their name: it must be a blueprint (soul-blueprints.mjs: a --- name and a Done when
// list), it may never carry a key, a token or a password (refused outright, and never echoed back), and an email, a phone number
// or a street address is marked (the rooms' own rule, soul-playbook.mjs) and goes out only when the person says those are fine to
// share. The 18-or-older line is a statement the person makes, kept with its time; nothing here can check an age.

import { checkBlueprint, SLUG_RE, TITLE_MAX } from './soul-blueprints.mjs';
import { personalHits } from './soul-playbook.mjs';

// What a key, a token or a password looks like. A guard, not a guarantee: the usual shapes, never every one. Never echoed: a hit
// names its kind and where it is, never its text.
export const SECRET_SHAPES = [
  ['private_key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['web_token', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g],
  ['stripe_key', /\b[rs]k_(?:live|test)_[A-Za-z0-9]{10,}/g],
  ['supabase_key', /\bsb_secret_[A-Za-z0-9_-]{10,}/g],
  ['github_token', /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}/g],
  ['aws_key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['slack_token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['discord_token', /\b[MNO][A-Za-z0-9_-]{23,27}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g],
  ['anthropic_key', /\bsk-ant-[A-Za-z0-9_-]{10,}/g],
  ['openai_key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g],
  ['google_key', /\bAIza[0-9A-Za-z_-]{35}/g],
  // a password written out: the word, then a value with a digit or a symbol in it (so "Password: never share it" is prose, not a hit)
  ['password', /\b(?:password|passwd|pwd|passcode)\s*[:=]\s*(?=\S*[0-9!@#$%^&*_])\S{6,}/gi],
];
export const SECRET_KINDS = SECRET_SHAPES.map((s) => s[0]);

export function secretHits(text) {
  const s = String(text || '');
  const out = [];
  for (const [kind, re] of SECRET_SHAPES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      out.push({ kind, start: m.index, end: m.index + m[0].length });
      if (re.lastIndex === m.index) re.lastIndex++;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// A title as the person typed it: spaces folded, 1 to 80 characters (the library's CHECK).
export function cleanTitle(t) {
  return String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
}

// Everything a publish must be before the database sees it. The file is the Box's own copy, read by the function, never a text the
// page sends; the page sends the skill's name, the title, the statement and, after it was shown the marks, personal_ok.
export function checkPublish(input) {
  const o = input || {};
  const skill = String(o.skill == null ? '' : o.skill).trim();
  if (!SLUG_RE.test(skill)) return { ok: false, error: 'bad_name' };
  const title = cleanTitle(o.title);
  const n = Array.from(title).length;
  if (n < 1 || n > TITLE_MAX) return { ok: false, error: 'bad_title', max: TITLE_MAX };
  if (o.adult !== true) return { ok: false, error: 'adult_required' };
  const content = typeof o.content === 'string' ? o.content : '';
  const b = checkBlueprint({ slug: skill, title, content });
  if (!b.ok) { const { ok, ...rest } = b; return { ok: false, ...rest }; }
  const secrets = secretHits(content);
  if (secrets.length) return { ok: false, error: 'looks_secret', secrets };
  const personal = personalHits(content, []).map((h) => ({ kind: h.kind, start: h.start, end: h.end, text: h.text }));
  if (personal.length && o.personal_ok !== true) return { ok: false, error: 'looks_personal', personal };
  return { ok: true, skill, title, content, done: b.done, personal_shared: personal.length };
}

// The database's refusals in plain words.
export const REFUSALS = {
  CL103: ['edition_retired', 409],
  CL106: ['adult_required', 400],
  CL107: ['no_such_skill', 404],
  CL108: ['not_yours', 409],
  CL109: ['skill_changed', 409],
  P0002: ['not_found', 404],
  '22023': ['bad_value', 400],
  '23514': ['bad_value', 400],
  '23505': ['try_again', 409],
};
export function refusal(code) {
  return Object.prototype.hasOwnProperty.call(REFUSALS, code) ? REFUSALS[code] : null;
}

// One edition as the page reads it (from cwp_editions_read): the database's own fields, named, nothing else.
export function editionPublic(e) {
  const x = e || {};
  const w = x.waiting && typeof x.waiting === 'object' ? x.waiting : null;
  const p = x.people && typeof x.people === 'object' ? x.people : {};
  return {
    id: x.id || null, title: String(x.title || ''), skill: x.skill || null, status: x.status === 'retired' ? 'retired' : 'live',
    version: Number(x.version) || null, version_at: x.version_at || null,
    done_when: Array.isArray(x.done_when) ? x.done_when.map(String) : [],
    waiting: w ? { id: w.id || null, app: w.app || null, passed: w.passed === true, at: w.at || null } : null,
    answer: x.answer === true ? true : x.answer === false ? false : null, answered_at: x.answered_at || null,
    ready: x.ready === true,
    people: { asked: Number(p.asked) || 0, answered: Number(p.answered) || 0, yes: Number(p.yes) || 0 },
    created_at: x.created_at || null,
  };
}
