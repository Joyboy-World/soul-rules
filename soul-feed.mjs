// soul-feed.mjs — the realtime feed's one rule (his direction 2026-10-09: distribution lands on scrolling and swiping, realtime
// first; the feed answers each swipe, so the very next card already reflects it). Phase 1 of docs/soul-realtime-feed-plan-2026-10-09.md:
// tags read from what a card already has, and nextCard(), which re-sorts the deck on every swipe with no model and no server.
// Pure: no imports, no network, no clock, no randomness, so the page and the tests run the same thing. Written once here; lifted
// into the pages when the feed reaches them (Phase 2, the public page; Phase 5, inside the Box).

// The knobs, in one place (Claude's first numbers, his to move):
export const FEED = {
  KEEP: 1,              // a right swipe (keep, save or done) raises its tags
  PASS: -1,             // a left swipe lowers them
  DECAY: 0.8,           // each older swipe counts this much less than the one after it, so the latest swipes steer most
  FIRST_MAKE_AT: 3,     // no make card before the fourth card a person sees (never in a stranger's first few flicks)
  MAKE_EVERY: 4,        // after that, a make card at most every fourth card, and at least that often when one fits
  MAX_SAME_KIND: 2,     // never three cards of one kind in a row while another kind is left
  TAG: { interest: 1, kind: 0.5, shelf: 0.25 },   // what a swipe teaches: the topic most, the kind half as much, the shelf a quarter
};

// A card's tags, read from what a library or path card already carries: its interest, its shelf, and its kind. A video is
// watch, a link is read, a lesson whose last line starts "You keep:" is make (the two-minute cards of 2026-10-09), any other
// lesson is read. card: { interest, shelf, kind ('video' | 'link' | 'lesson'), body?, keep? } — keep, when given, says whether
// it is a make card without the body.
export function cardTags(card) {
  const c = card || {};
  const make = c.kind === 'lesson' && (c.keep === true || (typeof c.body === 'string' && /\nYou keep: \S[^\n]*$/.test(c.body)));
  const kind = c.kind === 'video' ? 'watch' : make ? 'make' : 'read';
  return { interest: String(c.interest || ''), shelf: Number(c.shelf) === 2 ? 2 : 1, kind };
}
const tagKeys = (t) => [['interest:' + t.interest, FEED.TAG.interest], ['shelf:' + t.shelf, FEED.TAG.shelf], ['kind:' + t.kind, FEED.TAG.kind]];

// What the swipes so far say this person likes: a weight per tag, the newest swipe at full strength. swipes: [{ id, keep }] in
// the order they happened; byId: id -> card.
export function tagWeights(swipes, byId) {
  const w = new Map();
  const list = Array.isArray(swipes) ? swipes : [];
  for (let i = 0; i < list.length; i++) {
    const card = byId.get(list[i] && list[i].id);
    if (!card) continue;
    const strength = (list[i].keep ? FEED.KEEP : FEED.PASS) * Math.pow(FEED.DECAY, list.length - 1 - i);
    for (const [k, part] of tagKeys(cardTags(card))) w.set(k, (w.get(k) || 0) + strength * part);
  }
  return w;
}

const scoreOf = (w, card) => tagKeys(cardTags(card)).reduce((s, [k]) => s + (w.get(k) || 0), 0);
const round = (x) => Math.round(x * 1e6) / 1e6;   // so a tie between equal scores is a tie, never float noise

// The next card: the best score among the cards not yet seen, with three rules on top. A make card's turn comes from the fourth
// card on, every MAKE_EVERY cards, and only with a make card from an interest they have kept more than passed (the best such
// interest first); with none, the turn waits; no make card shows
// before its turn; never a third card of one kind in a row while another kind is left. Ties keep the deck's own order. deck:
// [{ id, interest, shelf, kind, ... }] in its own order; swipes: [{ id, keep }] in order. Answers { card, why } or null when every
// card has been seen. why: 'make_turn' | 'best' | 'variety' | 'first' (no swipes yet).
export function nextCard(deck, swipes) {
  const cards = Array.isArray(deck) ? deck.filter((c) => c && c.id != null) : [];
  const done = Array.isArray(swipes) ? swipes : [];
  const byId = new Map(cards.map((c) => [c.id, c]));
  const seen = new Set(done.map((s) => s && s.id));
  const pool = cards.map((c, i) => ({ c, i })).filter((x) => !seen.has(x.c.id));
  if (!pool.length) return null;
  const w = tagWeights(done, byId);
  const shown = done.map((s) => byId.get(s && s.id)).filter(Boolean);
  const n = shown.length;
  const kindAt = (j) => cardTags(shown[j]).kind;
  let lastMake = -Infinity;
  for (let j = 0; j < n; j++) if (kindAt(j) === 'make') lastMake = j;
  const ranked = pool.map((x) => ({ ...x, s: round(scoreOf(w, x.c)), t: cardTags(x.c) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i));
  const makeTurn = n >= FEED.FIRST_MAKE_AT && n - lastMake >= FEED.MAKE_EVERY;
  if (makeTurn) {
    const liked = (x) => w.get('interest:' + x.t.interest) || 0;
    const make = ranked.filter((x) => x.t.kind === 'make' && liked(x) > 0).sort((a, b) => (liked(b) - liked(a)) || (b.s - a.s) || (a.i - b.i))[0];
    if (make) return { card: make.c, why: 'make_turn' };
  }
  let open = ranked.filter((x) => x.t.kind !== 'make');                     // a make card shows only on its turn, above
  if (!open.length) open = ranked;                                           // only make cards are left: show them
  const run = n >= FEED.MAX_SAME_KIND && Array.from({ length: FEED.MAX_SAME_KIND }, (_, k) => kindAt(n - 1 - k)).every((k, _, a) => k === a[0]);
  if (run) {
    const other = open.find((x) => x.t.kind !== kindAt(n - 1));
    if (other) return { card: other.c, why: other === open[0] ? 'best' : 'variety' };
  }
  return { card: open[0].c, why: n ? 'best' : 'first' };
}

// ── Phase 2 (his go 2026-10-09: the public page first, shelf one, the tour mixed in, a video's words first)

// The public deck holds the first shelf only: a stranger has no level, and the starter rule gives no level the first shelf.
export const FEED_SHELF = 1;

// What the public page may show of one library card, rebuilt field by field (never the row): the library is nobody's data, and
// only these fields leave the server. row: a live cwp_starter_items row with its interest's key and short name (topic). A video
// keeps its 11-character id (the picture loads only when the visitor taps to watch); a link keeps its https address; a lesson
// keeps its body (the back of the card). Anything malformed is left out (null).
export function feedCard(row) {
  const r = row || {};
  if (r.status !== undefined && r.status !== 'live') return null;
  if (!['video', 'link', 'lesson'].includes(r.kind) || typeof r.id !== 'string' || !/^[a-z][a-z0-9-]{0,23}$/.test(String(r.key || ''))) return null;
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, 140) : '';
  if (!title) return null;
  const card = { id: r.id, interest: r.key, topic: String(r.topic || '').slice(0, 40), shelf: Number(r.shelf) === 2 ? 2 : 1, kind: r.kind, title,
    note: typeof r.note === 'string' ? r.note.slice(0, 280) : '' };
  if (r.kind === 'video') { if (!/^[A-Za-z0-9_-]{11}$/.test(String(r.youtube_id || ''))) return null; card.youtube_id = r.youtube_id; }
  if (r.kind === 'link') { if (!/^https:\/\/[^\s]{4,600}$/.test(String(r.url || ''))) return null; card.url = r.url; }
  if (r.kind === 'lesson') { if (typeof r.body !== 'string' || !r.body.trim()) return null; card.body = r.body.slice(0, 4000); card.keep = cardTags(r).kind === 'make'; }
  return card;
}

// The next few cards: the first is exactly nextCard's answer; the rest are the rule's picks after it with the same swipes (a
// preview, drawn again after the next swipe). count: how many, at most the cards left.
export function queue(deck, swipes, count) {
  const cards = Array.isArray(deck) ? deck : [];
  const want = Math.max(0, Math.min(Number(count) || 0, 20));
  const picked = new Set(), out = [];
  while (out.length < want) {
    const p = nextCard(cards.filter((c) => c && !picked.has(c.id)), swipes);
    if (!p) break;
    out.push(p); picked.add(p.card.id);
  }
  return out;
}

// ── The carry (Phase 2b, his call 2026-10-09: "their kept cards become their first goals"). Making a Box from the deck carries the
// cards a visitor kept: their ids only (library cards, nobody's data), held a day under a code, then used once their Box exists.

export const CARRY_MAX_CARDS = 50;
export const CARRY_MAX_KEYS = 3;                // the setup's own limit on interests picked at once (soul-rules.mjs MAX_STARTER_PICKS)
const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The kept cards a page handed over: each a live library card's id (live: a Map id -> card), each once, in order, at most
// CARRY_MAX_CARDS. Anything that is not a list of such ids is refused whole (null); an empty list is refused too.
export function carryCards(v, live) {
  if (!Array.isArray(v) || v.length < 1 || v.length > CARRY_MAX_CARDS) return null;
  const out = [];
  for (const id of v) {
    if (typeof id !== 'string' || !UUIDISH.test(id) || !(live instanceof Map) || !live.has(id) || out.includes(id)) return null;
    out.push(id);
  }
  return out;
}

// The interests the kept cards lean to: each card's interest counted, the most kept first, a tie to the one kept first; at most
// CARRY_MAX_KEYS. byId: a Map id -> card with its interest.
export function carryKeys(ids, byId) {
  const count = new Map(), first = new Map();
  (Array.isArray(ids) ? ids : []).forEach((id, i) => {
    const c = byId instanceof Map ? byId.get(id) : null;
    if (!c || typeof c.interest !== 'string') return;
    count.set(c.interest, (count.get(c.interest) || 0) + 1);
    if (!first.has(c.interest)) first.set(c.interest, i);
  });
  return [...count.keys()].sort((a, b) => (count.get(b) - count.get(a)) || (first.get(a) - first.get(b))).slice(0, CARRY_MAX_KEYS);
}
