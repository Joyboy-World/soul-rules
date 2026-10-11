// Starting a room, and a room's seats (2026-10-08, his rulings for PHANES): a person names a room and owns it; two rooms free (five
// for a member), one more 1,500 Soul Coins paid once and kept; six seats in a room, twelve in a member's. The numbers are
// cwp_coin_rates rows and the decisions are the database's (cwp_room_allowance, cwp_room_start, the cwp_room_seat_cap trigger,
// migration 20261008_cwp_room_start.sql); this file holds only what the function checks before it asks and how it answers.
// Imported by cwp/index.ts and by tests/soul-room-start.test.js.

export const ROOM_TITLE_MAX = 60;

// A room's name as the person typed it: trimmed, spaces run together, 1 to 60 characters, no control characters; else null.
export function roomTitle(v) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= 1 && t.length <= ROOM_TITLE_MAX ? t : null;
}

// What the page is told before it asks: rooms owned and allowed, whether the next one costs, its price, and a room's seats.
export function allowanceAnswer(d) {
  const x = d && typeof d === 'object' ? d : {};
  const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  return { member: x.member === true, owned: n(x.owned), allowed: n(x.allowed), next_costs: x.next_costs === true, price: n(x.price), seats: n(x.seats) };
}

// The database's answer to a start, as the page is told it (the room's id and name, what it cost, whether it was a repeat press).
export function startAnswer(d) {
  if (!d || typeof d !== 'object' || d.ok !== true || typeof d.room_id !== 'string') return null;
  return { room_id: d.room_id, title: typeof d.title === 'string' ? d.title : null, paid: Number.isInteger(d.paid) ? d.paid : 0, repeat: d.repeat === true };
}

// A refusal in plain words, never a database message: the room full (CL086), a price that moved (CL087), the coins short or on hold,
// a bad name or key, no box.
export const ROOM_REFUSALS = {
  CL086: ['room_full', 409], CL087: ['price_changed', 409], CL031: ['on_hold', 409], CL032: ['not_enough', 409],
  P0002: ['not_found', 404], 22023: ['bad_value', 400],
};
export function roomRefusal(code) { return Object.prototype.hasOwnProperty.call(ROOM_REFUSALS, code) ? ROOM_REFUSALS[code] : null; }

// ── A room's goal (2026-10-08 evening, his rulings: docs/soul-room-goals-plan-2026-10-08.md). Any joined member proposes one; it is
// a card the room votes on: Ship starts it, Done finishes it, Decline turns a proposal down. One live goal at a time (CL088). Cards
// put in the room while it is live are its steps; Soul's grower suggests the next one. The database decides (20261008_cwp_room_goals).
export const GOAL_TITLE_MAX = 80;
export function goalTitle(v) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= 1 && t.length <= GOAL_TITLE_MAX ? t : null;
}
// The live goal as a member is told it, or null: its id, its card, its name, steps done of total, the next step's first line.
export function goalSummary(d) {
  if (!d || typeof d !== 'object' || typeof d.id !== 'string' || typeof d.title !== 'string') return null;
  const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  return { id: d.id, item_id: typeof d.item_id === 'string' ? d.item_id : null, title: d.title, done: n(d.done), total: n(d.total), next: typeof d.next === 'string' ? d.next : null };
}
// What a resolved vote on a goal's own card does, by the goal's state: [the database function, or null when the verb does not fit].
// The room's own yes starts a goal ('take', "Make it our goal"; 2026-10-08 evening); Send to Apeiron spends the pot, so it never
// touches a goal.
export function goalVerb(verb, status) {
  if (verb === 'take' && status === 'proposed') return 'cwp_room_goal_start';
  if (verb === 'done' && status === 'live') return 'cwp_room_goal_finish';
  if (verb === 'declined' && status === 'proposed') return 'cwp_room_goal_decline';
  return null;
}
export const GOAL_REFUSALS = { CL088: ['goal_live', 409], P0002: ['not_found', 404], 22023: ['bad_value', 400] };
export function goalRefusal(code) { return Object.prototype.hasOwnProperty.call(GOAL_REFUSALS, code) ? GOAL_REFUSALS[code] : null; }

// ── A room's pot and a review from Apeiron (2026-10-08 evening, his rulings: docs/soul-room-review-plan-2026-10-08.md). A joined
// member puts their own bought or granted coins in the room's pot, by name; Send to Apeiron, once the room agrees, pays for a review
// from it (500 coins, answered on the card within 3 days with what a build would cost, or the coins go back). The numbers are rates
// and the decisions the database's (20261008_cwp_room_review.sql); here, what cwp checks before it asks and how it answers.
export const POT_ADD_MAX = 100000;
// coins a person asks to put in: a whole number from 1 to POT_ADD_MAX, else null
export function potAmount(v) {
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v;
  return Number.isInteger(n) && n >= 1 && n <= POT_ADD_MAX ? n : null;
}
// The pot as a member is told it: what it holds, who put what in (by their name in the room, never a Box id), the review's price
// and days. names: Box id -> name; me: this person's Box id.
export function potAnswer(d, names, me) {
  const x = d && typeof d === 'object' ? d : {};
  const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  const by = Array.isArray(x.by) ? x.by : [];
  return {
    total: n(x.total), price: n(x.price), days: n(x.days),
    by: by.filter((b) => b && n(b.amount) > 0).map((b) => ({ called: (names && names[b.ws]) || 'someone who left', you: !!me && b.ws === me, amount: n(b.amount) })),
  };
}
// A review on a card as a member is told it: open (with its date), answered, or given back.
export function reviewAnswer(o) {
  if (!o || typeof o !== 'object' || !['open', 'delivered', 'refunded'].includes(o.status)) return null;
  return { status: o.status, price: Number.isInteger(o.price) ? o.price : 0, due_at: typeof o.due_at === 'string' ? o.due_at : null };
}
// The database's refusals in plain words: not in the room, a card that cannot be sent (a goal, a page change, one already out), a
// price that moved, a pot or wallet short or on hold, no room, a bad value.
export const POT_REFUSALS = {
  CL095: ['not_joined', 403], CL096: ['not_sendable', 409], CL087: ['price_changed', 409], CL032: ['not_enough', 409],
  CL031: ['on_hold', 409], P0002: ['not_found', 404], 22023: ['bad_value', 400],
};
export function potRefusal(code) { return Object.prototype.hasOwnProperty.call(POT_REFUSALS, code) ? POT_REFUSALS[code] : null; }

// ── A room's chat (2026-10-11, his AUQs: "Invite-only rooms, ours", "30 days", "All three", "No, people only"; migration
// 20261011_cwp_room_chat.sql). Joined members only, from the page only: no AI door says, reads or reports. The words are kept
// 30 days (the database's job); deleting your own takes the row; the owner hides; anyone reports a copy to the crew.
export const CHAT_MAX = 500;           // characters a message may hold (the table's CHECK)
export const CHAT_READ = 60;           // the newest messages a read returns
export const CHAT_PER_MINUTE = 12;     // messages a seat may send in a minute, counted in the table
export const CHAT_DAYS = 30;           // what the privacy notice says and the expiry job does

// A message as typed: control characters out (a line break stays), runs of blank lines folded, trimmed; 1 to 500, else null.
export function chatBody(v) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
  return t.length >= 1 && t.length <= CHAT_MAX ? t : null;
}

// One message as a member sees it: the seat that wrote it (never a Box id), whether it is theirs, when, and its words, or none
// when the owner hid it. The owner sees that it was hidden; nobody but the crew, through a report, sees hidden words.
export function chatPublic(row, mySeat) {
  const hidden = !!row.hidden_at;
  return { id: row.id, member: row.member_id, mine: row.member_id === mySeat, at: row.created_at, hidden: hidden, words: hidden ? null : row.body };
}

// What a member may do to a message: delete it if it is theirs; hide it if they own the room and it is not already hidden.
export function chatMay(verb, row, me) {
  if (!row || !me) return false;
  if (verb === 'unsay') return row.member_id === me.id;
  if (verb === 'hide') return me.role === 'owner' && !row.hidden_at && row.member_id !== me.id;
  if (verb === 'report') return row.member_id !== me.id && !row.hidden_at;
  return false;
}
// The crew's heads-up in #leads (at most once every few minutes, as a name report's): never the words, never who.
export function chatPingText() { return 'A message in a room was reported. It is in the crew inbox.'; }
