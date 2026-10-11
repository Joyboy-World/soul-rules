// cwp Soul rules — pure: no network, no Deno APIs. Imported by index.ts (Deno) and by
// tests/cwp-soul-rules.test.js (Node): ONE text for both, so the tested rules are the shipped rules.
// Soul Phase 1, slice 2 (2026-09-24, SOUL-RETURN-01; plan docs/soulcode-return-plan-2026-09-23.md § 5 row 1):
// goals as playlists, the items a card can be, and the person's own taps.

// Each set must match its CHECK in supabase/migrations/20260924_cwp_soul_goals_taps.sql (the test reads both).
export const GOAL_STATUSES = new Set(['live', 'done', 'archived']);
export const ITEM_KINDS = new Set(['video', 'link', 'lesson']);
export const TAP_VERBS = new Set(['saved', 'finished', 'skipped']);
export const TAP_PREFIXES = new Set(['pl', 'item', 'mod', 'tl', 'doc']);   // a playlist item · an ask · a crew card · a date · a file

export const MAX_GOALS_PER_BOX = 12;     // live + done; an archived goal does not count
export const MAX_ITEMS_PER_GOAL = 60;
export const MAX_GOAL_TITLE = 80;
export const MAX_ITEM_TITLE = 140;
export const MAX_URL = 600;
export const MAX_LESSON = 4000;          // a lesson's own text
export const MAX_NOTE = 280;             // the crew's one line: why this one

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TAP_KEY_RE = new RegExp('^(pl|item|mod|tl|doc)-(' + UUID + ')$');
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']);

// One line: control characters and runs of space become one space, trimmed, cut to max. '' for a non-string.
export function oneLine(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// A block of text: line breaks kept (normalised to \n), other control characters dropped, trimmed, cut to max.
export function textBlock(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, '').trim().slice(0, max);
}

// An address worth storing: https only, parsed by the URL parser, a dotted host, no name or password in it,
// at most MAX_URL. Returns the parser's own form of it, or null.
export function cleanUrl(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > MAX_URL) return null;
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  if (!u.hostname || u.hostname.indexOf('.') < 0) return null;
  const out = u.toString();
  return out.length <= MAX_URL ? out : null;
}

// The eleven-character id of a YouTube video, from any address people paste for one
// (watch?v=, youtu.be/, /shorts/, /embed/, /live/, the nocookie host); null when it is not one.
export function youtubeId(v) {
  const s = cleanUrl(v);
  if (!s) return null;
  const u = new URL(s);
  const host = u.hostname.toLowerCase();
  if (!YT_HOSTS.has(host)) return null;
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] || null;
  else if (u.pathname === '/watch') id = u.searchParams.get('v');
  else {
    const m = /^\/(embed|shorts|live|v)\/([^/]+)/.exec(u.pathname);
    if (m) id = m[2];
  }
  return id && YT_ID_RE.test(id) ? id : null;
}

// Where a video plays: YouTube's privacy-enhanced embed, and no related videos from other channels.
export function embedUrl(id) {
  return YT_ID_RE.test(String(id || '')) ? 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0' : null;
}

// An item from what the crew sent (later, what the person's own AI sends). Rebuilt field by field; nothing is
// stored as sent. Returns { item } or { error, field?, reason? }. A video with no title comes back with
// needs_title set, so the caller can ask YouTube for it (a network step, kept out of this file).
export function buildItem(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const kind = String(r.kind || '');
  if (!ITEM_KINDS.has(kind)) return { error: 'invalid_kind' };
  const item = { kind, title: oneLine(r.title, MAX_ITEM_TITLE), note: oneLine(r.note, MAX_NOTE) || null, url: null, youtube_id: null, body: null };
  if (kind === 'video') {
    const id = youtubeId(r.url);
    if (!id) return { error: 'invalid_url', field: 'url', reason: 'not_a_youtube_video' };
    item.youtube_id = id;
    item.url = 'https://www.youtube.com/watch?v=' + id;
  } else if (kind === 'link') {
    const url = cleanUrl(r.url);
    if (!url) return { error: 'invalid_url', field: 'url', reason: 'https_only' };
    item.url = url;
  } else {
    const body = textBlock(r.body, MAX_LESSON);
    if (!body) return { error: 'empty_body', field: 'body' };
    item.body = body;
  }
  if (!item.title) {
    if (kind === 'link') item.title = new URL(item.url).hostname.replace(/^www\./, '').slice(0, MAX_ITEM_TITLE);
    else if (kind === 'video') return { item, needs_title: true };
    else return { error: 'empty_title', field: 'title' };
  }
  return { item };
}

// A goal's title, or '' when there is none worth keeping.
export function goalTitle(v) { return oneLine(v, MAX_GOAL_TITLE); }

// The card a new goal puts on the person's board, so the crew is asked for its playlist in the place the crew
// already reads — without it, "the crew fills this" would be a promise with nothing behind it.
export function goalAskBody(title) { return 'Make me a playlist for my goal: ' + goalTitle(title); }

// A card a person can tap: its prefix and its uuid, or null.
export function parseTapKey(v) {
  const m = TAP_KEY_RE.exec(String(v == null ? '' : v));
  return m ? { prefix: m[1], id: m[2] } : null;
}

// What one tap changes. Finished and skipped exclude each other: you did it or you passed on it, never both.
// Saved stands on its own. Returns the rows to write, or null for a verb that is not a tap.
export function tapPlan(verb, on) {
  if (!TAP_VERBS.has(verb)) return null;
  const rows = [{ verb, is_on: !!on }];
  if (on && verb === 'finished') rows.push({ verb: 'skipped', is_on: false });
  if (on && verb === 'skipped') rows.push({ verb: 'finished', is_on: false });
  return rows;
}

// ── Tab tracking (the captain's call, 2026-09-27) ─────────────────────────────────────────────────────────────
// A browser may say which of Soul's five tabs a person opened, and nothing else. The list is the page's own VIEWS in
// workstation.html, in order (tests/cwp-soul-rules.test.js reads both), and 'tab_open' is in the cwp_events CHECK
// (supabase/migrations/20260928_cwp_events_tab_open.sql). tabOf answers the tab, or null for anything off the list.
export const SOUL_TABS = new Set(['home', 'play', 'channels', 'you', 'sky']);
export function tabOf(v) {
  const t = typeof v === 'string' ? v : '';
  return SOUL_TABS.has(t) ? t : null;
}

// ── Download my box (slice 3, 2026-09-24) ─────────────────────────────────────────────────────────────────────
// What the person's own download carries: every table their box has rows in, by NAMED columns only (the
// get_portal_data rule — never SELECT * into a response). Credentials and the crew's own read of the person stay
// out BY NAME, and tests/cwp-soul-rules.test.js holds three things: no list carries a never-column, the tables are
// the same set the deletion runbook's inventory names (docs/cwp-box-deletion-runbook.md — one surface list for
// "what we hold", read by both, so a table added to one and not the other goes red), and the theme loses its drawing.
export const EXPORT_NEVER = new Set([
  'access_token', 'slug', 'key_hash', 'storage_path',               // what opens a box, and a path that is ours
  'internal_notes', 'relationship', 'depth_signals', 'invited_by',  // the crew's own read of the person; another person's id
  'draft_return', 'floor_ref', 'assigned_to', 'laughtale_ref',      // the build floor's and the crew's working fields
  'ip_hash', 'extracted_text', 'parsed',                            // abuse control; unparsed by ruling
  'invitee', 'artifact',                                            // inside event details: a friend's box id; a build-floor path
  'hold_reason', 'idem_key',                                        // the crew's reason for holding a wallet; a coin line's key
  'reported_ws', 'crew_note', 'spend_entry',                        // the launch: whose pet a name report was about; the crew's note; our ledger line
  'code_hash', 'used_by',                                           // an invite's code (only its hash is kept) and the Box that used it (2026-09-30 night)
]);
// cwp_requests.ruling_note is the crew's private reason (the crew page says "kept on the row, never sent to them");
// cwp_work_items.ruling_note IS the answer sent to them. One column name, two meanings: the requests list leaves it out.
export const EXPORT_TABLES = [
  // [name in the file, table, columns, the column that picks this box's rows]
  ['workstation', 'cwp_workstations', 'person_name, email, label, status, intake_version, intake_started_at, intake_completed_at, last_seen_at, theme, added_channels, setup_done_at, pet_colour, pet_edge, pet_name, pet_named_at, soul_skin, pet_wear, card_frame, friend_share, friend_status, friend_status_at, created_at, updated_at', 'id'],
  ['intake_answers', 'cwp_intake_answers', 'question_key, question_text, answer_text, answered_at, revised_count', 'workstation_id'],
  ['setup_files', 'cwp_calibration_files', 'path, kind, version, content, generated_by, generated_at', 'workstation_id'],
  ['board', 'cwp_work_items', 'id, body, lane, kind, parent_id, status, source, app_label, app_from, ruling_note, ruled_at, playbook, playbook_at, replaces, return_document_id, floor_status, grade, room_id, order_id, created_at, updated_at, goal_title, goal_short', 'workstation_id'],   // app_label/app_from: who left a card through the door (2026-10-05); goal_title/goal_short: an app's idea for a goal (the first card, 2026-10-05); each migration ships before the function
  ['files', 'cwp_documents', 'id, original_name, mime_type, size_bytes, kind, label, uploaded_at', 'workstation_id'],
  ['cards', 'cwp_modules', 'id, kind, key, title, subtitle, body_md, config, written_by, status, created_at, updated_at', 'workstation_id'],
  ['dates', 'cwp_timeline', 'id, on_date, kind, label, note, weight, course_key, source, created_at, updated_at', 'workstation_id'],
  ['goals', 'cwp_goals', 'id, title, short, status, made_by, ask_item_id, sort, pinned, close_suggested_at, close_why, close_declined_at, parent_item_id, created_at, updated_at', 'workstation_id'],
  ['playlists', 'cwp_items', 'id, goal_id, routine_id, kind, title, url, youtube_id, body, note, position, source, starter_item_id, status, created_at, updated_at', 'workstation_id'],
  ['taps', 'cwp_taps', 'card_key, verb, is_on, first_at, changed_at', 'workstation_id'],
  // the room's hand, step 3 (2026-10-07): the cards they sent up to their Sky, and the rooms each went into
  ['sent_up', 'cwp_sent_up', 'id, card_key, body, sent_at, cleared_at, handed_at, report, reported_at, reported_by', 'workstation_id'],   // + the hand to their AI and its report (Phase 4, 2026-10-09)
  ['sent_up_places', 'cwp_sent_up_places', 'sent_id, room_id, item_id, placed_at', 'workstation_id'],
  // Soul's reminder (2026-10-09): their card-email switch and each mail it sent (the off link's token and the mail service's
  // reference are ours, so both stay out)
  ['card_emails', 'cwp_reminders', 'is_on, tz, send_hour, asked_at, switched_on_at, switched_off_at, off_via, last_sent_on, created_at, updated_at', 'workstation_id'],
  ['card_emails_sent', 'cwp_reminder_sends', 'sent_on, item_id, status, why, opened_at, created_at', 'workstation_id'],
  // the skills ladder (2026-10-09): their skill badges and the skills they ordered (the coin lines are in coins above)
  ['skill_badges', 'cwp_skill_badges', 'title, path, made_at, pinned_at, goal_id, kind', 'workstation_id'],
  ['skill_orders', 'cwp_skill_jobs', 'goal_id, kind, status, price, error, path, created_at, finished_at', 'workstation_id'],
  ['keys', 'cwp_box_keys', 'key_prefix, label, created_at, last_used_at, uses, revoked_at', 'workstation_id'],
  ['sky', 'cwp_bodies', 'id, kind, title, fx, fy, fw, sort, status, created_by, created_at, updated_at', 'workstation_id'],
  ['pet_card', 'cwp_cards', 'seeded_xp, session_xp, work_xp, xp, wins, losses, seeded_at, created_at, updated_at', 'workstation_id'],
  ['pet_sessions', 'cwp_card_xp', 'session_id, family, session_type, calls, fresh, cache_read, cache_write, output, weighted, xp, found_how, created_at', 'workstation_id'],
  ['pet_work_cards', 'cwp_work_cards', 'item_id, grade, kind, xp, collected_at', 'workstation_id'],
  ['rooms', 'cwp_room_members', 'room_id, role, status, presence, presence_at, seen_at, invited_at, joined_at', 'workstation_id'],
  ['votes', 'cwp_votes', 'room_id, item_id, verb, stance, value, via, cast_at', 'workstation_id'],
  // a room's chat (2026-10-11): the messages they wrote (kept 30 days), never anyone else's
  ['room_messages', 'cwp_room_messages', 'room_id, body, created_at, hidden_at', 'workstation_id'],
  ['request', 'cwp_requests', 'name, email, handle, ask, source, status, ruled_at, created_at', 'workstation_id'],
  ['activity', 'cwp_events', 'event_type, detail, created_at', 'workstation_id'],
  // the SoulCard market, phase one (2026-10-08): the first editions they published (each version's file is a skill among their
  // setup files above; their own runs of it are with the blueprint runs)
  ['editions', 'cwp_blueprints', 'id, title, author_skill, status, adult_at, created_at, updated_at', 'author_workstation_id'],
  // Soul, Phase 2 (2026-09-24): their games and every round of them, moves included (they are what the read is written from)
  ['games', 'cwp_plays', 'id, play_date, status, end_reason, current_round, rounds_solved, turns_allowed, turns_used, xp_rounds, xp_hidden, xp_stop, xp_six, xp_streak, xp_total, streak, started_at, ended_at', 'workstation_id'],
  ['game_rounds', 'cwp_play_rounds', 'play_id, round_index, word_a, word_b, pre_flipped, hidden, found, moves, turns_used, guesses, solved, solved_word, first_move_ms, last_move_ms, xp, xp_hidden, started_at, solved_at', 'workstation_id'],
  // Slice 2 (2026-09-24): their read, line by line, with the rule that wrote each line, their answer and their reason
  ['read', 'cwp_read_lines', 'play_id, seq, rule, family, round_index, move_index, line, verdict, why, shown_at, ruled_at, why_at, changed_verdict, changed_at', 'workstation_id'],
  // The friends list (2026-09-29): the friendships they asked for and the ones they were asked, by the friendship's own id
  // (never the other box's), and their friend links
  ['friends_you_asked', 'cwp_friends', 'id, via, status, created_at, decided_at', 'requester_id'],
  ['friends_who_asked_you', 'cwp_friends', 'id, via, status, created_at, decided_at', 'addressee_id'],
  ['friend_links', 'cwp_friend_links', 'code, created_at, revoked_at', 'workstation_id'],
  // Phase 3, the card loop (2026-09-29): the paths our AI proposed for their goals, as proposed, and what became of each
  ['path_proposals', 'cwp_path_proposals', 'id, goal_id, items, why, status, created_at, decided_at', 'workstation_id'],
  // Soul money, Step 2 (2026-09-29): their Soul Coins and every line that moved them. A line's note is ours (a crew
  // correction's reason, from Step 3 on) and its ref names our own rows, so the list leaves both out. After a deletion
  // both tables let go of the box and keep the amounts with no name (the runbook, step 5).
  ['wallet', 'cwp_wallets', 'id, earned, granted, bought, hold, created_at, updated_at', 'workstation_id'],
  ['coins', 'cwp_coin_ledger', 'id, d_earned, d_granted, d_bought, kind, for_day, reverses, created_at', 'workstation_id'],
  // Soul money, Step 3 (2026-09-30): the offers made at their closed branches (never the maker's reason, which is the crew's)
  // and their orders. An offer goes with the box; an order lets go of it and of its offer, and keeps its kind, price, dates and
  // status with no words and no name (the runbook, step 5).
  ['offers', 'cwp_offers', 'id, goal_id, kind, title, pitch, price, status, made_by, created_at, opened_at, decided_at', 'workstation_id'],
  ['orders', 'cwp_orders', 'id, offer_id, kind, price, status, due_at, refund_why, delivery, created_at, delivered_at, refunded_at', 'workstation_id'],
  // Soul money, Step 4a (2026-09-30): the routines we run for them (the crew's instructions are what the routine was asked
  // to do, and go in) and each day's run of them (the day, the model that ran, what landed; never the cost, which is ours).
  // A routine and its cards go with the box; a run lets go of it and of its routine, and keeps no words (the runbook, step 5).
  ['routines', 'cwp_routines', 'id, goal_id, title, instructions, cards_per_run, links, model, stepped_up_at, status, paused_why, starts_at, ends_at, created_at, updated_at', 'workstation_id'],
  ['routine_runs', 'cwp_routine_runs', 'id, routine_id, run_date, attempt, model, status, cards_proposed, cards_landed, started_at, finished_at', 'workstation_id'],
  // Soul money, Step 5 (2026-09-30): the coins they bought: the pack, the money, Stripe's reference for the payment (what their
  // receipt names), and where a refund or a dispute stands. Never the session or a code of ours. A purchase lets go of a deleted box
  // and stays with no name (the runbook, step 5); Stripe, the seller of record, keeps the buyer's own details.
  ['purchases', 'cwp_coin_checkouts', 'pack, coins, price_cents, currency, livemode, status, amount_subtotal, amount_tax, amount_total, payment_intent, paid_at, refunded_cents, refund_coins, dispute_status, created_at', 'workstation_id'],
  // Soul money, Step 6a (2026-09-30): their membership (where it stands, the month it is paid through, cancelling, the branch its
  // routine follows), each paid month (the money, the period, the coins it gave and anything taken back), and each month's coins
  // as a lot (how many are left, when they fade). Never the session, the subscription or the customer: those are Stripe's references
  // for the account, not the person's record here. All three let go of a deleted box and stay with no name (the runbook, step 5).
  ['membership', 'cwp_memberships', 'plan, livemode, status, paid_through, cancel_at_period_end, ended_at, goal_id, created_at', 'workstation_id'],
  ['member_months', 'cwp_member_invoices', 'status, billing_reason, amount_paid, subtotal, period_start, period_end, grant_coins, refunded_cents, taken_coins, dispute_status, created_at', 'workstation_id'],
  ['member_coins', 'cwp_grant_lots', 'amount, remaining, landed_at, fades_from, fade_days, faded', 'workstation_id'],
  // The launch (2026-09-30): the looks they bought (what, for how many coins, when; never our ledger line) and the reports they
  // filed (a bug, or a pet name they saw, as it was when they reported it; never whose pet it was, never the crew's own note).
  // Both go with the box (the runbook, step 1); a report about this box's pet name goes with it too.
  ['looks', 'cwp_unlocks', 'cosmetic_key, price, created_at', 'workstation_id'],
  ['reports', 'cwp_bug_reports', 'id, kind, body, view, browser, reported_name, status, created_at, updated_at', 'workstation_id'],
  // Invites as sign-up links (2026-09-30 night): the invites they made, by the name they typed, and what became of each; never the
  // code's hash and never whose Box used one. They go with the box (the runbook, step 1).
  ['invites', 'cwp_invites', 'id, name, status, created_at, expires_at, used_at, cancelled_at', 'workstation_id'],
  // The blueprint record, phase two (2026-10-01): each run of a blueprint they got that their AI reported (the version, the order,
  // the app, whether the AI said every Done when line came true) and their answer to it (the first beside a changed one). No words
  // are kept. A run lets go of a deleted box and stays with no name, as part of the blueprint's count (the runbook).
  ['blueprint_runs', 'cwp_blueprint_runs', 'id, version_id, order_id, source, app, app_from, passed, verdict, verdict_at, changed_verdict, changed_at, created_at', 'workstation_id'],
  // A room's playbook (rooms rethought, step 2, 2026-10-06): this person's own yes to each entry, and their AI's runs of the entries
  // with their own answers. Each goes with the Box (both tables cascade from it).
  ['playbook_uses', 'cwp_playbook_uses', 'id, item_id, is_on, set_at', 'workstation_id'],
  ['playbook_runs', 'cwp_playbook_runs', 'id, item_id, room_id, app, app_from, passed, verdict, verdict_at, changed_verdict, changed_at, created_at', 'workstation_id'],
];
export const EXPORT_ROW_CAP = 5000;       // per table; the busiest box held 907 activity rows on 2026-09-24

// ── Who came through the door (2026-10-05, the door plan pieces 2 and 3; docs/soul-door-plan-scope-2026-10-04.md) ─────────────
// The author a card through the door carries (cwp_work_items.app_label + app_from, 20261005_cwp_door_names.sql, whose CHECK wants
// it trimmed, 1 to 60 characters, no control character): oneLine cuts AFTER it trims, so a cut can end on a space, and the trim
// after the cut is what keeps the CHECK from refusing it. '' when nothing is left.
export const DOOR_LABEL_MAX = 60;
export function doorLabel(v) { return oneLine(v, DOOR_LABEL_MAX).trim(); }
// A key's author: the label the person gave it, else "key" and its prefix.
export function doorKeyLabel(label, prefix) {
  return doorLabel(typeof label === 'string' && label.trim() ? label : 'key ' + String(prefix || ''));
}
// What cwp_door_app answered, as an author: proven ('door') or the app's own word ('declared'); null for anything else.
export function doorAppAnswer(d) {
  const o = d && typeof d === 'object' && !Array.isArray(d) ? d : null;
  const label = o ? doorLabel(o.label) : '';
  const from = o && (o.from === 'door' || o.from === 'declared') ? o.from : null;
  return label && from ? { label, from } : null;
}
// What is new since this app's last full read, from that read's time and the board the read carries: the cards made after it
// and the cards answered after it that were already there. No time (no earlier read the Box can date): an honest empty answer.
export function doorSince(prevAt, items) {
  if (!prevAt) return { at: null, new_cards: [], answered_cards: [] };
  const t = Date.parse(prevAt);
  if (!Number.isFinite(t)) return { at: null, new_cards: [], answered_cards: [] };
  const list = Array.isArray(items) ? items : [];
  const when = (v) => Date.parse(String(v || ''));
  return {
    at: prevAt,
    new_cards: list.filter((w) => w && when(w.created_at) > t).map((w) => w.id),
    answered_cards: list.filter((w) => w && w.ruled_at && when(w.ruled_at) > t && when(w.created_at) <= t).map((w) => w.id),
  };
}

// A routine's cards on the page (Soul money, Step 4a, 2026-09-30): the routines a box has, and the newest of their cards,
// read on their own (index.ts routinesPayload) and never through the goal read, because a routine's cards hang on the
// routine and never on a goal (supabase/migrations/20260930_cwp_zzzzzzzz_runner.sql).
export const ROUTINE_COLUMNS = 'id, goal_id, title, status, starts_at, ends_at';
export const ROUTINE_LINES = 20;
export const ROUTINE_ITEM_LINES = 60;

// A deep copy with every EXPORT_NEVER key removed at ANY depth. The column lists keep the named fields out; this keeps
// them out of the json INSIDE a row too — an event's detail carried the floor's ticket number, a floor path and a
// friend's box id on the first real download (2026-09-24), because a column list cannot see into a jsonb value.
export function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const k of Object.keys(v)) if (!EXPORT_NEVER.has(k)) out[k] = scrub(v[k]);
  return out;
}

// The box's look, without a drawing's star data (a legacy theme.sky can run to half a megabyte; drawings stay on the page).
export function exportTheme(theme) {
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) return theme == null ? null : {};
  const out = {};
  for (const k of Object.keys(theme)) out[k] = k === 'sky' ? (theme.sky ? 'a drawing, kept on your page' : null) : theme[k];
  return out;
}

// The first thing in the file: what it is and what it leaves out, in plain words.
export function exportReadme(generatedAtIso) {
  return {
    what: 'Everything your Apeiron box holds about you, as of ' + generatedAtIso + '.',
    not_included: [
      'Your box\'s address and your keys: they are what open your box, so a file you might share never carries them. Your keys are listed by their first letters only.',
      'Your files themselves: they are listed under "files"; open each one from Files on your page.',
      'The star data of the drawings in your sky: they are listed under "sky" and stay on your page.',
      'Notes the crew keeps for its own work.',
    ],
    delete: 'To have your box deleted, email privacy@apeironweb.com (see python-visuals.com/legal/privacy#box).',
  };
}

// ── New cards reach the crew (captain AUQ 2026-09-28, "Discord ping"; docs/soul-review-2026-09-28.md). A Box request has
// always posted to the crew's Discord and a card on a board never did, so two playlist asks sat two days unseen. Only a
// card a person puts on their own board themselves pings: the page's ask form and a new goal's ask (page_submit) and the
// last setup answer (intake_final_box). Their own AI's cards (llm) are theirs to judge, the crew's cards are the crew's,
// and a card put in a room belongs to the room. The post names no one and quotes nothing, because the box privacy
// notice lists only a Box request's post to Discord; the crew page shows whose card it is.
export const PING_SOURCES = new Set(['page_submit', 'intake_final_box']);
export function pingsCrew(card) {
  return !!card && typeof card === 'object' && PING_SOURCES.has(card.source) && card.status === 'new' && !card.room_id;
}
export function cardPingText() {
  return '\u{1F5C2} **A new card on a Box board** · see it at apeironweb.com/workstation-crew';
}

// ── The small batch (docs/soul-checklist.md § Now; captain AUQ 2026-09-28, the second Soul review) ────────────────────
// Setup asks three questions and the rest are optional: a friend stopped at 8 of 11 on 9/27, before the one that matters most
// to us (what they want the page to do), which sat last. The three come first, in this order; the other eight keep
// their written order and are optional. The page takes "required" from the function, so this is the one switch.
export const INTAKE_FIRST = ['destination', 'call_you', 'work_ask'];
export const INTAKE_REQUIRED = new Set(INTAKE_FIRST);
export function withIntakeRules(questions) {
  const list = (questions || []).map((q) => Object.assign({}, q, { required: INTAKE_REQUIRED.has(q.key) }));
  const first = INTAKE_FIRST.map((k) => list.find((q) => q.key === k)).filter(Boolean);
  return first.concat(list.filter((q) => !INTAKE_REQUIRED.has(q.key)));
}
// A skipped question reads as skipped in the setup files their AI reads, never as a blank heading.
export function answerOr(v) {
  const s = (typeof v === 'string' ? v : '').replace(/\r\n/g, '\n').trim();
  return s || '*Not answered yet.*';
}

// A goal's short name for the pill row: two or three words, asked when the goal is made (captain: "channels need a cap
// on how long the title can be"); the full sentence stays as the heading inside. Too long is refused, never cut: a cut
// sentence is a fragment. '' when nothing was given, null when it is too long.
export const MAX_GOAL_SHORT = 24;
export function goalShort(v) {
  if (typeof v !== 'string') return '';
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > MAX_GOAL_SHORT ? null : s;
}

// An app's idea for a goal (his AUQ 2026-10-05, the first card: "a field on add_card", "3 waiting", "Save keeps it"). An app passes
// the goal and its short name together with its card (both or neither), held to the lengths of a goal the person makes; the card
// lands on their board as its ask, their own swipe starts the goal (goal_from_ask, behind the Box lock), and Soul grows its cards.
// The title is trimmed after its cut, so it never ends on a space (the database holds it trimmed). Rooms never carry one.
// The second set of control characters (U+0080 to U+009F) goes too: the database's [[:cntrl:]] refuses them and oneLine leaves them.
// null: no idea · { error }: refused, in the app's words · { title, short }: the idea.
export const MAX_WISHES_WAITING = 3;
export function wishOf(title, short) {
  const none = (v) => v === undefined || v === null || v === '';
  if (none(title) && none(short)) return null;
  const c1 = (v) => (typeof v === 'string' ? v.replace(/[\u0080-\u009f]+/g, ' ') : v);
  const t = goalTitle(c1(title)).trim(), s = goalShort(c1(short));
  if (s === null) return { error: 'goal_short_too_long' };
  if (!t || !s) return { error: 'goal_needs_both' };
  return { title: t, short: s };
}
// Crew work is never a goal idea (2026-10-11, his AUQ "Reword + server check", after three Gemini work cards landed as "Start a
// goal"): a card whose words open with a crew label in capitals (BUILD ASK, REPLY, VERDICT, CHECK-IN, STAGED FOR DEPLOY, ...),
// alone or after an addressee ("Claude: BUILD ASK |"), ended by "|" or ":", keeps its words and lands as a plain card; the goal
// fields are dropped, never refused, so the card itself is not lost. A person's own wording ("I want to get better at guitar",
// "NOTE: learn guitar") does not carry a crew word and keeps its idea.
const CREW_WORDS = /\b(?:ASK|REPLY|VERDICT|CHECK-?IN|CORRECTION|STAGED|REVIEW|LOG|WARNING|READ|CREW|REPORT|PROTOCOL|DEPLOY|BUILD|FILED|SPEC|STATUS|UPDATE|DRAFT|BRIEF|COUNT|RESULTS?)\b/;
export function crewWork(body) {
  const m = /^\s*(?:[A-Z][a-z]+:\s*)?([A-Z][A-Z0-9 ,'&/.-]{1,80}?)\s*[|:]/.exec(String(body == null ? '' : body));
  return !!m && CREW_WORDS.test(m[1]);
}
// A board card that can start a goal: an app's card on their own board carrying an idea, not finished or turned down.
export function wishStartable(item) {
  return !!item && typeof item === 'object' && item.source === 'llm' && !item.room_id
    && typeof item.goal_title === 'string' && item.goal_title.trim() !== ''
    && typeof item.goal_short === 'string' && item.goal_short.trim() !== ''
    && item.status !== 'done' && item.status !== 'declined';
}
// A goal from any card (the room's hand, step 5; his AUQs 2026-10-07): the card becomes the new goal's first step, as a card a
// goal's path can hold (cwp_items: video, link or lesson). A video or link from a path stays itself; anything else becomes a lesson
// carrying the card's own words. prefix is parseTapKey's; row is the card as its own table holds it. null when there is nothing
// to carry (an empty card, a prefix it does not know).
export function firstStepOf(prefix, row) {
  if (!row || typeof row !== 'object') return null;
  const title = (v) => oneLine(typeof v === 'string' ? v : '', MAX_ITEM_TITLE);
  const lesson = (t, b) => { const tt = title(t), bb = textBlock(typeof b === 'string' ? b : '', MAX_LESSON); return tt && bb ? { kind: 'lesson', title: tt, url: null, youtube_id: null, body: bb, note: null } : null; };
  if (prefix === 'pl') {
    const t = title(row.title), note = oneLine(typeof row.note === 'string' ? row.note : '', 280) || null;
    if (!t) return null;
    if (row.kind === 'video' && typeof row.youtube_id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(row.youtube_id)) return { kind: 'video', title: t, url: cleanUrl(row.url), youtube_id: row.youtube_id, body: null, note };
    if (row.kind === 'link' && cleanUrl(row.url)) return { kind: 'link', title: t, url: cleanUrl(row.url), youtube_id: null, body: null, note };
    if (row.kind === 'lesson') { const l = lesson(t, row.body); return l ? Object.assign(l, { note }) : null; }
    return null;
  }
  if (prefix === 'item') {
    const b = textBlock(typeof row.body === 'string' ? row.body : '', MAX_LESSON);
    return lesson(b.split('\n').map((x) => x.replace(/^[#>\s]+/, '').trim()).filter(Boolean)[0] || '', b);
  }
  if (prefix === 'mod') return lesson(row.title, [row.subtitle, row.body_md].filter((x) => typeof x === 'string' && x.trim()).join('\n\n') || row.title);
  if (prefix === 'tl') return lesson(row.label, 'On ' + String(row.on_date || '') + (typeof row.note === 'string' && row.note.trim() ? '\n\n' + row.note : ''));
  if (prefix === 'doc') { const n = (typeof row.label === 'string' && row.label.trim()) || (typeof row.original_name === 'string' && row.original_name.trim()) || 'A file'; return lesson(n, 'A file in your Box: ' + n + '. Open it from Files.'); }
  return null;
}
// How many of a Box's ideas still wait for the person: startable, no goal carries the card yet, and not passed on or finished
// by a tap (offKeys: the card keys, 'item-' + id, with a skipped or finished tap on). A saved idea still waits.
export function wishesWaiting(items, startedIds, offKeys) {
  const started = new Set(startedIds || []), off = new Set(offKeys || []);
  return (items || []).filter((it) => wishStartable(it) && !started.has(it.id) && !off.has('item-' + it.id)).length;
}

// A goal pinned to the left rail (captain AUQ 2026-09-28 18:56 ET, "Goals, in the box"): true or false, and nothing
// else; null refuses it. The pin is the person's own choice, kept on the goal; the crew's verbs never set it.
export function goalPinned(v) { return v === true ? true : v === false ? false : null; }

// Where a person is with a goal (2026-10-06, his ruling after one person found the cards "too generic for a person like her", another asked for more
// technique and his own read of his cards): one of four levels, asked when a goal starts, and an optional line on what they
// already tried. The card-writer reads both before the first card; a goal that never said (a starter's, the crew's, an older
// one) is asked on its next open, and the cards the person has not touched are picked again for the level.
export const GOAL_LEVELS = new Set(['new', 'dabbled', 'regular', 'good']);
export const MAX_GOAL_TRIED = 280;
// '' when nothing was given, null when it is not one of the four.
export function goalLevel(v) {
  if (v === undefined || v === null || v === '') return '';
  const s = typeof v === 'string' ? v.trim() : '';
  return GOAL_LEVELS.has(s) ? s : null;
}
// Their own line, one line, '' when nothing was given, null when it is too long (refused, never cut, like the short name).
export function goalTried(v) {
  if (typeof v !== 'string') return '';
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > MAX_GOAL_TRIED ? null : s;
}

// Channels a person adds (the 9/25 review, his words: "School can be an added thing upon a channel add, and even a
// suggested one we give initially"; captain AUQ 2026-09-28 19:27 ET, "In the box" and "Yes, one ask"). Learn took
// School's place among the fixed channels; School is now a channel a person adds, kept on the box
// (cwp_workstations.added_channels, which the database holds to this list, each at most once), so it follows them to any
// device. A box that already holds classes shows School without it. Adding it puts one ask on their board, the way a new
// goal does, so the crew knows to set up their classes.
export const ADDABLE_CHANNELS = ['school'];
export function channelKey(v) { return typeof v === 'string' && ADDABLE_CHANNELS.includes(v) ? v : null; }
export function channelOn(v) { return v === true ? true : v === false ? false : null; }
export function channelsAfter(current, key, on) {
  const have = new Set(Array.isArray(current) ? current : []);
  if (on) have.add(key); else have.delete(key);
  return ADDABLE_CHANNELS.filter((k) => have.has(k));                   // only what can be added, in the list's own order, each once
}
export function channelAskBody(key) { return key === 'school' ? 'Set up School for me: my classes and tests, from my syllabus.' : null; }

// Only a card someone else put in front of the person takes a verdict (the crew's cards, their AI's, a factory return):
// their own asks and the files they dropped are theirs, so a tap there would be housekeeping, not judgment. An ask that
// came back carries what came back, and that takes a verdict. The function reads these columns before a tap.
export const TAP_CARD_COLUMNS = { pl: 'id', item: 'id, source, ruling_note', mod: 'id', tl: 'id', doc: 'id, kind' };
export function tapAllowed(prefix, card) {
  if (!card || typeof card !== 'object' || !TAP_PREFIXES.has(prefix)) return false;
  if (prefix === 'item') return card.source === 'llm' || card.source === 'crew' || !!(card.ruling_note && String(card.ruling_note).trim());
  if (prefix === 'doc') return card.kind === 'delivery';
  return true;
}

// A person can take back an ask of their own until the factory has it: still waiting, or picked up and not started.
export const WITHDRAW_SOURCES = new Set(['page_submit', 'intake_final_box']);
export function canWithdraw(item) {
  return !!item && typeof item === 'object' && WITHDRAW_SOURCES.has(item.source) && !item.room_id && (item.status === 'new' || item.status === 'triaged');
}

// ── The Tinder setup, phase 1 (docs/soul-tinder-setup-plan-2026-09-28.md; captain AUQ 2026-09-28 20:54 ET) ───────────────
// A new person answers three prompts, picks one to three interests, swipes five starter cards (the swipe lesson, and their
// first judgment data), meets their pet and gives it a look. A box that already exists runs the second half once. Each
// list here has a CHECK beside it in supabase/migrations/20260929_cwp_tinder_setup.sql (tests/cwp-soul-rules.test.js reads
// both).

// The pet's look: the 9/23 sketch's five colours and four edges. The edge is exactly what they pick, and they can change it
// any time (his ruling); until they pick, the pet keeps today's look, where play draws the edge. The page holds the paint.
export const PET_COLOURS = ['blue', 'pink', 'mint', 'honey', 'lilac'];
export const PET_EDGES = ['smooth', 'wavy', 'spiky', 'fuzzy'];
export function petColour(v) { return typeof v === 'string' && PET_COLOURS.includes(v) ? v : null; }
export function petEdge(v) { return typeof v === 'string' && PET_EDGES.includes(v) ? v : null; }
// A room's sky (2026-09-29, captain AUQ "Colour, edge, size"): each joined member's pet rides the room's loop by its look only,
// its color and its edge, drawn at the size of the level the room already shows. The columns it reads name no play, no
// round, no habit and no answer, so nothing about how a person plays crosses into a room. The box page alone asks for it;
// the AIs' door and the desktop creatures read the room as before.
export const ROOM_PET_COLUMNS = 'id, pet_colour, pet_edge';
export function roomPetOf(row) {
  if (!row || typeof row !== 'object') return null;
  return { colour: petColour(row.pet_colour), edge: petEdge(row.pet_edge) };
}

// ── Phase 3, the card loop: a skill tree for your Soul (captain AUQs 2026-09-29; the money plan).
// Learn is one tree: the person at the root, each live goal a branch, each card a node in its order. Our AI (a routine on
// the crew's machine, never the box) grows a branch: a new goal's first path, and more whenever one card is left. These are
// its numbers; supabase/migrations/20260929_cwp_zzzz_card_loop.sql and builds/soul-card-loop/SKILL.md carry the same ones,
// and tests/cwp-soul-rules.test.js holds them equal.
export const LOOP_FIRST_PATH = 5;          // cards on a new goal's first branch
export const LOOP_GROW_BY = 3;             // more cards when a branch is running low
export const LOOP_LOW_AT = 1;              // a branch with at most this many cards neither done nor passed on is running low (the 9/29 migration's line; since 2026-10-09 the live line is cwp_coin_rates 'eve_low_deck', 2)
export const LOOP_LESSON_MAX = 600;         // a step our AI writes itself: a short "do this today", never an essay
export const LOOP_MAX_AT_ONCE = 12;        // cards in one proposal or one growth
// Closing a branch (the money plan, Step 1; captain AUQ 2026-09-29): the loop may suggest closing only once the branch holds
// this many finished cards, and, after the person chose Keep growing, only once this many more are finished. The database
// refuses a suggestion otherwise (cwp_suggest_close, 20260930_cwp_zzzzz_close_branch.sql) and the routine's instructions
// say the same; the test holds the three equal.
export const CLOSE_MIN_DONE = 5;
export const CLOSE_AFTER_KEEP = 3;

// ⟦tree-rules⟧ — shared word for word with workstation.html; change both, or the test goes red
// A branch's cards, in their order, each 'done', 'passed', 'next', 'open' or 'locked' (captain AUQ 2026-09-29, "Locked until
// the one before"): a card opens when it is the first, when the card before it is done or passed on, or when it already
// carries a save of its own (a card started before the lock keeps what it had). The first open card that is neither done
// nor passed on is next. tapOn(key, verb) answers whether that tap is on; a card's key is 'pl-' + its id.
function branchStates(items, tapOn) {
  var out = [], clear = true, nextGiven = false;
  for (var i = 0; i < items.length; i++) {
    var k = 'pl-' + items[i].id, done = !!tapOn(k, 'finished'), passed = !done && !!tapOn(k, 'skipped'), st;
    if (done) st = 'done';
    else if (passed) st = 'passed';
    else if (clear || !!tapOn(k, 'saved')) { st = nextGiven ? 'open' : 'next'; nextGiven = true; }
    else st = 'locked';
    out.push(st);
    clear = done || passed;
  }
  return out;
}
// ⟦/tree-rules⟧
export { branchStates };

// A starter is a playlist the crew made once and everyone who picks it shares (cwp_starters, cwp_starter_items). A pick is
// one to three live starters' keys, each once, in the order picked; anything else is refused whole (null).
export const MAX_STARTER_PICKS = 3;
export const STARTER_KEY_RE = /^[a-z][a-z0-9-]{0,23}$/;
export function starterKeys(v, live) {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_STARTER_PICKS) return null;
  const known = new Set(Array.isArray(live) ? live : []);
  const out = [];
  for (const k of v) {
    if (typeof k !== 'string' || !STARTER_KEY_RE.test(k) || !known.has(k) || out.includes(k)) return null;
    out.push(k);
  }
  return out;
}

// The second shelf (his rulings 2026-10-06 and 07; docs/soul-second-shelf-plan-2026-10-06.md). At setup each picked interest says
// where the person is with it: { key: level } for picked keys only, each one of the four goal levels. Absent (an older page) is {},
// so every pick starts on the first shelf with no level, as before; anything else is refused whole (null). School, which has no
// cards, is never asked.
export function starterLevels(v, keys) {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const picked = new Set(Array.isArray(keys) ? keys : []);
  const out = {};
  for (const k of Object.keys(v)) {
    if (!picked.has(k) || typeof v[k] !== 'string' || !GOAL_LEVELS.has(v[k])) return null;
    out[k] = v[k];
  }
  return out;
}
// Someone who does it regularly or is good starts on the second shelf; new, dabbled or unsaid, on the first (his ruling: dabbled
// lands on today's cards).
export const SECOND_SHELF_LEVELS = new Set(['regular', 'good']);
export function starterShelf(level) { return SECOND_SHELF_LEVELS.has(level) ? 2 : 1; }
// One interest's live cards for a level: that shelf's; the first shelf's while the second has none (before it goes live). A card
// with no shelf is on the first.
export function starterShelfCards(items, level) {
  const all = Array.isArray(items) ? items : [];
  const on = (n) => all.filter((x) => (Number(x && x.shelf) || 1) === n);
  const want = starterShelf(level), got = on(want);
  return got.length ? { shelf: want, cards: got } : { shelf: 1, cards: on(1) };
}
// The goal's name: the second shelf's own when the second shelf starts it and both its parts exist, the interest's otherwise.
export function starterGoalName(s, shelf) {
  const own = shelf === 2 && s && typeof s.title_2 === 'string' && s.title_2.trim() && typeof s.short_2 === 'string' && s.short_2.trim();
  return own ? { title: s.title_2, short: s.short_2 } : { title: s && s.title, short: s && s.short };
}

// A starter's cards, copied into one box's new goal: the crew's cards (so a verdict on one is judgment data), in the
// library's order, each remembering the library card it came from. Rebuilt field by field: never the library's own id.
export const STARTER_ITEM_COLUMNS = 'id, kind, title, url, youtube_id, body, note, position';
export function starterCopy(items, wsId, goalId) {
  return (Array.isArray(items) ? items : []).slice()
    .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
    .slice(0, MAX_ITEMS_PER_GOAL)
    .map((x, n) => ({
      workstation_id: wsId, goal_id: goalId, kind: x.kind, title: x.title, url: x.url ?? null, youtube_id: x.youtube_id ?? null,
      body: x.body ?? null, note: x.note ?? null, position: n, source: 'crew', status: 'live', starter_item_id: x.id,
    }));
}

// The swipe lesson: five of their starter cards, one interest at a time in turn (the first card of each, then the second of
// each), the interests in the order their goals sit (a tie falls back to the goal's id), each card in its own order. rows:
// { id, goal_id, position, goal_sort } for the box's starter cards; answers their ids, at most LESSON_CARDS.
export const LESSON_CARDS = 5;
export function lessonDeal(rows) {
  const goals = new Map();
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!goals.has(r.goal_id)) goals.set(r.goal_id, { id: String(r.goal_id), sort: Number(r.goal_sort) || 0, cards: [] });
    goals.get(r.goal_id).cards.push(r);
  }
  const order = [...goals.values()].sort((a, b) => (a.sort - b.sort) || a.id.localeCompare(b.id));
  for (const g of order) g.cards.sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
  const out = [];
  for (let i = 0; out.length < LESSON_CARDS; i++) {
    const turn = order.filter((g) => g.cards[i]);
    if (!turn.length) break;
    for (const g of turn) if (out.length < LESSON_CARDS) out.push(g.cards[i].id);
  }
  return out;
}

// How many of the dealt cards have a verdict on them (saved, not for me, or done), each card once. taps: the rows that are
// on ({ card_key, verb }).
export const LESSON_VERBS = new Set(['saved', 'skipped', 'finished']);
export function lessonJudged(dealt, taps) {
  const keys = new Set((Array.isArray(dealt) ? dealt : []).map((id) => 'pl-' + id));
  const judged = new Set();
  for (const t of (Array.isArray(taps) ? taps : [])) if (t && keys.has(t.card_key) && LESSON_VERBS.has(t.verb)) judged.add(t.card_key);
  return judged.size;
}

// Where setup resumes: the interests until a starter is theirs (straight to the look when the library is empty), then the
// lesson until every dealt card has a verdict (five, or fewer when fewer exist), then the look, then done once marked.
export function setupStep({ doneAt, dealt, judged, library }) {
  if (doneAt) return 'done';
  if (!dealt) return library ? 'interests' : 'look';
  if ((Number(judged) || 0) < dealt) return 'lesson';
  return 'look';
}
