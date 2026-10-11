// The blueprint library's rules (2026-10-01, phase one of docs/soul-blueprint-record-plan-2026-10-01.md), ONCE here, imported by
// cwp/index.ts and by tests/cwp-soul-blueprints.test.js. A blueprint is a SKILL.md the crew keeps in a shared library, version by
// version; every version must say what the person will have when it worked, in a "## Done when" section of one to six plain
// lines. The database (20261001_cwp_zz_blueprints.sql) computes each version's hash, holds the Done when list's shape by CHECK and
// refuses a retired blueprint; this file reads the list out of the file and words every refusal. Import-free, so a mutated copy
// runs on its own (tools/soul/blueprints-mutants.cjs).

// A blueprint's slug is the folder its file lands in on a Box (skills/<slug>/SKILL.md): the same rule as a skill's name
// (index.ts SKILL_NAME_RE; the test holds the two the same).
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const SLUG_RULE = 'a-z, 0-9 and - only, 1-40 characters';
export const MAX_BYTES = 16000;           // index.ts MAX_SKILL_BYTES, and the database's CHECK
export const TITLE_MAX = 80;              // the database's CHECK, and an offer's title
export const DONE_MIN = 1;
export const DONE_MAX = 6;
export const DONE_LINE_MAX = 200;         // characters, as the database counts them
export const DONE_RULE = 'a "## Done when" section of 1 to 6 lines, each starting "- " and at most 200 characters';
export const STATUSES = ['live', 'retired'];
export const LIST_MAX = 200;              // blueprints the crew list reads at once (one past it is read, so more: true is never a silent cut)

// The file's --- block and its name: line (index.ts skillFrontmatterName, the same expressions; the test holds them the same).
const FRONT_RE = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;
const NAME_RE = /^name:\s*(\S.*)$/m;
export function frontmatterName(content) {
  const m = String(content || '').match(FRONT_RE);
  if (!m) return null;
  const n = m[1].match(NAME_RE);
  return n ? n[1].trim() : null;
}

const HEADING_RE = /^##\s+done when:?\s*$/i; // the section's own heading, in any case, a colon allowed, nothing else after it
const NEXT_HEADING_RE = /^#{1,6}\s/;         // the section runs to the next heading or the end
const ITEM_RE = /^-\s+(\S.*)$/;              // a top-level "- " line with something on it

// The Done when list, read out of the file. Outside the --- block, exactly one "## Done when" heading; under it, up to the next
// heading, every line that is not blank is one "- " line; one to six of them, each at most 200 characters once trimmed.
export function doneWhen(content) {
  const text = String(content || '').replace(/\r\n?/g, '\n');
  const fm = text.match(/^---\n[\s\S]*?\n---(\n|$)/);
  const lines = (fm ? text.slice(fm[0].length) : text).split('\n');
  const heads = [];
  lines.forEach((l, i) => { if (HEADING_RE.test(l)) heads.push(i); });
  if (!heads.length) return { ok: false, error: 'no_done_when' };
  if (heads.length > 1) return { ok: false, error: 'done_when_twice' };
  const out = [];
  for (let i = heads[0] + 1; i < lines.length; i++) {
    const l = lines[i];
    if (NEXT_HEADING_RE.test(l)) break;
    if (!l.trim()) continue;
    const m = ITEM_RE.exec(l);
    if (!m) return { ok: false, error: 'done_when_bad_line' };
    const item = m[1].trim();
    if (Array.from(item).length > DONE_LINE_MAX) return { ok: false, error: 'done_when_line_too_long', max: DONE_LINE_MAX };
    out.push(item);
  }
  if (out.length < DONE_MIN) return { ok: false, error: 'done_when_empty' };
  if (out.length > DONE_MAX) return { ok: false, error: 'done_when_too_many', max: DONE_MAX };
  return { ok: true, lines: out };
}

// Everything a blueprint must be before the database sees it. A title is optional (a new blueprint takes its slug, an old one
// keeps its own); the file's bytes are kept exactly as given.
export function checkBlueprint(input) {
  const o = input || {};
  const slug = String(o.slug == null ? '' : o.slug).trim();
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'bad_name', rule: SLUG_RULE };
  const title = o.title == null ? '' : String(o.title).trim();
  if (Array.from(title).length > TITLE_MAX) return { ok: false, error: 'title_too_long', max: TITLE_MAX };
  const content = typeof o.content === 'string' ? o.content : '';
  if (!content.trim()) return { ok: false, error: 'empty_content' };
  if (new TextEncoder().encode(content).length > MAX_BYTES) return { ok: false, error: 'content_too_long', max_bytes: MAX_BYTES };
  if (!frontmatterName(content)) return { ok: false, error: 'no_frontmatter_name', rule: 'a SKILL.md opens with a --- block that carries name:' };
  const d = doneWhen(content);
  if (!d.ok) return { ok: false, error: d.error, rule: DONE_RULE, ...(d.max ? { max: d.max } : {}) };
  return { ok: true, slug, title: title || null, content, done: d.lines };
}

// A refusal's body for the page: the check's answer without its ok.
export function refusalBody(check) {
  const { ok, ...rest } = check || {};
  return rest;
}

// The database's refusals in plain words (a delivery's own, CL064 and CL065, are the money refusals and are read there).
export const REFUSALS = {
  CL101: ['not_a_blueprint', 409],
  CL102: ['offer_settled', 409],
  CL103: ['blueprint_retired', 409],
  CL104: ['not_delivered', 404],          // phase two: no blueprint delivered to this Box under that name (a crew Box: no such blueprint)
  CL105: ['unknown_app', 400],            // phase two: a floor run typed for an app the list does not name
  P0002: ['not_found', 404],
  '22023': ['bad_value', 400],
  '23514': ['bad_value', 400],
  '23505': ['try_again', 409],
};
export function refusal(code) {
  return Object.prototype.hasOwnProperty.call(REFUSALS, code) ? REFUSALS[code] : null;
}
// The library not there yet (the function landed before its migration): a table, a function or a column it does not know.
export const MISSING_CODES = ['42P01', 'PGRST205', '42883', 'PGRST202', '42703'];
export function missing(code) {
  return MISSING_CODES.includes(String(code || ''));
}

// ── Phase two: runs (20261001_cwp_zzz_blueprint_runs.sql). A run is one time an AI followed one library version and said, by its
// own check, whether every Done when line came true. A person's run asks them one thing on their Box, did it do what it promised,
// and only their answer counts for people; a crew Box's run, or one typed on the crew page, is a floor run, counted by app. The
// database decides everything (which version, which order, floor or person, which app); this file checks what the AI sent,
// shapes every answer, and words the two new refusals.

// The path an AI names a delivered blueprint by: the file it read it from, skills/<slug>/SKILL.md (crew_order_deliver writes it so).
export const PATH_RE = /^skills\/([a-z0-9][a-z0-9-]{0,39})\/SKILL\.md$/;
export const PATH_RULE = "the blueprint's file in the Box: skills/<name>/SKILL.md";
export const APP_SAID_MAX = 40;           // what an AI says it is, cut; the database matches it to an app by key or label
export const APP_RE = /^[a-z][a-z0-9-]{0,30}$/;   // an app's key in the list (the database's CHECK on cwp_blueprint_apps.app)

// What the AI sent, checked: the path, whether every Done when line came true (true or false, nothing else), and what it says it is.
export function checkRun(input) {
  const o = input || {};
  const m = PATH_RE.exec(String(o.path == null ? '' : o.path).trim());
  if (!m) return { ok: false, error: 'bad_path', rule: PATH_RULE };
  if (o.passed !== true && o.passed !== false) return { ok: false, error: 'bad_passed', rule: 'passed is true when every Done when line came true, false when one did not' };
  const said = o.app == null ? '' : String(o.app).replace(/\s+/g, ' ').trim();
  return { ok: true, slug: m[1], passed: o.passed, app: said ? Array.from(said).slice(0, APP_SAID_MAX).join('') : null };
}

// The door's answer, from cwp_blueprint_run_add: recorded or not, counted as floor or person, and whether their person is asked.
// While a question waits on that blueprint, nothing of a new report is kept (the review, 2026-10-01): the answer then describes
// the run that is waiting (its id, its app and its check), says recorded: false, and says why.
export function runAnswer(r) {
  const x = r || {};
  const floor = x.source === 'floor';
  const waiting = !floor && x.repeat === true;
  const out = {
    ok: true, recorded: !waiting, run_id: x.run_id || null, version: Number(x.version) || null, app: x.app || 'other', app_from: x.app_from || null,
    counted: floor ? 'floor' : 'person', asked: !floor, already_waiting: waiting,
    say: floor ? 'Recorded as a test run from a crew Box. Nobody is asked.'
      : waiting ? 'Not added. Their Box is still asking about an earlier run of this blueprint, and their answer to that one is what counts. Report again after they answer.'
      : 'Recorded. Their Box now asks them one thing: did it do what it promised? Only their answer counts.',
  };
  if (waiting && (x.passed === true || x.passed === false)) out.waiting_passed = x.passed;
  return out;
}

// The app list's labels by key, from cwp_blueprint_apps (never two names in code: the table is the list).
export function appLabels(rows) {
  const out = {};
  for (const r of rows || []) if (r && typeof r.app === 'string' && typeof r.label === 'string') out[r.app] = r.label;
  return out;
}
// The app list for the crew page, in the table's order.
export function appsFromRows(rows) {
  return (rows || []).filter((r) => r && typeof r.app === 'string')
    .sort((a, c) => (Number(a.sort) || 0) - (Number(c.sort) || 0) || String(a.app).localeCompare(String(c.app)))
    .map((r) => ({ app: r.app, label: String(r.label || r.app), family: String(r.family || 'unknown') }));
}

// The columns a person's run is read by (never the Box it belongs to, which the read is already scoped to).
export const RUN_COLUMNS = 'id, order_id, app, passed, verdict, verdict_at, changed_verdict, changed_at, created_at';
// A person's last run as their page sees it: what their AI said, whether the question waits, and their answer (the first one
// beside it when they changed it).
export function runPublic(x, labels) {
  if (!x || typeof x !== 'object' || !x.id) return null;
  const first = x.verdict == null ? null : x.verdict === true;
  const now = x.changed_verdict == null ? first : x.changed_verdict === true;
  const label = labels && x.app !== 'other' && typeof labels[x.app] === 'string' ? labels[x.app] : null;
  return {
    id: x.id, app: label, passed: x.passed === true, at: x.created_at || null,
    waiting: x.verdict == null, answer: now,
    first: x.changed_verdict != null && first !== null && first !== now ? first : null,
    answered_at: x.verdict_at || null, changed_at: x.changed_at || null,
  };
}
// A delivered blueprint's version and last run, for its order (soul-money.mjs orderPublic's fourth argument).
export function orderExtra(ver, run, labels) {
  const v = ver || {};
  return {
    version: Number(v.version) || null,
    content: typeof v.content === 'string' ? v.content : null,
    done_when: Array.isArray(v.done_when)
      ? v.done_when.filter((s) => typeof s === 'string').slice(0, DONE_MAX).map((s) => Array.from(s).slice(0, DONE_LINE_MAX).join(''))
      : [],
    run: runPublic(run, labels),
  };
}
// The tap's answer, from cwp_blueprint_verdict: which of the three it was, and the run as the page shows it.
export function verdictAnswer(r) {
  const x = r || {};
  const run = x.run || {};
  const state = x.answered ? 'answered' : x.changed ? 'changed' : 'unchanged';
  return {
    ok: true, [state]: true,
    run: { id: run.id || null, answer: run.answer === true, first: run.first == null ? null : run.first === true,
      answered_at: run.answered_at || null, changed_at: run.changed_at || null },
  };
}

// The record of one version, from cwp_blueprint_records: the floor's runs and passes by app, and the people (asked, answered,
// said it worked: each person once, by their latest answer) with the apps behind those yeses.
export function recordFromRow(r) {
  const x = r || {};
  const fl = x.floor_runs && typeof x.floor_runs === 'object' && !Array.isArray(x.floor_runs) ? x.floor_runs : {};
  const floor = Object.keys(fl).sort().map((app) => ({ app, runs: Number(fl[app] && fl[app].runs) || 0, passed: Number(fl[app] && fl[app].passed) || 0 }));
  return {
    floor,
    floor_runs: floor.reduce((s, a) => s + a.runs, 0),
    floor_passed: floor.reduce((s, a) => s + a.passed, 0),
    people: { asked: Number(x.people_asked) || 0, answered: Number(x.people_answered) || 0, yes: Number(x.people_yes) || 0 },
    ran_on: Array.isArray(x.ran_on) ? x.ran_on.filter((s) => typeof s === 'string') : [],
  };
}
export function recordsByVersion(rows) {
  const out = {};
  for (const r of rows || []) if (r && r.version_id) out[r.version_id] = recordFromRow(r);
  return out;
}

// The crew's list, from cwp_blueprint_library's rows (each blueprint with how many versions it has and its newest version, read
// by the database in one statement): live ones first, then retired, each by title.
export function libraryFromRows(rows) {
  return (rows || []).map((r) => ({
    id: r.id, slug: r.slug, title: r.title, status: r.status, created_at: r.created_at, updated_at: r.updated_at,
    versions: Number(r.versions) || 0,
    current: r.current_id ? {
      id: r.current_id, version: Number(r.current_version), hash: r.current_hash, created_at: r.current_at,
      done_when: Array.isArray(r.current_done) ? r.current_done : [],
      content: typeof r.current_content === 'string' ? r.current_content : null,
    } : null,
  })).sort((a, c) => (a.status === c.status ? String(a.title).localeCompare(String(c.title)) : a.status === 'live' ? -1 : 1));
}
