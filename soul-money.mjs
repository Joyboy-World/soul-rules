// Soul money (the money plan, its first section; his AUQs 2026-09-29):
// the rules the box function and its tests share, ONCE here (the soul-rules.mjs pattern). The database holds the numbers
// (cwp_coin_rates, his to change at SQL speed) and enforces every change (20260930_cwp_zzzzzz_wallet.sql); this module
// only names what the function reads and shapes what the page sees. Step 2: the wallet and coins earned by play. Step 3
// (20260930_cwp_zzzzzzz_offers.sql): offers at a closed branch, paid with coins, and the orders they open. Step 5
// (20260930_cwp_zzzzzzzzz_buy_coins.sql): packs of coins bought through the Soul Stripe account (the Stripe side is
// stripe-rules.mjs in this folder, a copy of soul-stripe's). Step 6a (20260930_cwp_zzzzzzzzzz_membership.sql): the membership, a
// monthly subscription through the same account and its monthly coins (a lot that fades after 45 days); redesigned the same day
// (20260930_cwp_zzzzzzzzzzz_member_routines.sql): the routine at the end of a closed branch, included for members up to 2 at once.

// A game earns only when the person played it to an end: they stopped after a solve, or ran out of turns. A game left open
// and closed the next day earns nothing. The migration's cwp_coin_earn_game holds the same two (the test holds them equal).
export const EARN_ENDS = new Set(['stopped', 'out_of_turns']);

// Spending takes granted coins first, then earned, then bought (the plan: bought coins last, since they cost money).
export const SPEND_ORDER = ['granted', 'earned', 'bought'];

// What the function reads. Never the hold's reason (the crew's own note), a line's key or its reference.
export const WALLET_COLUMNS = 'earned, granted, bought, hold';
export const LEDGER_COLUMNS = 'id, d_earned, d_granted, d_bought, kind, for_day, created_at';
export const RATE_KEYS = ['game', 'game_day_cap', 'game_month_cap', 'welcome'];
export const WALLET_LINES = 30;                   // the newest lines wallet_read sends

const whole = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : 0; };

// A wallet as the page sees it: the three buckets and their sum, and the numbers that earn, so the page's words follow the
// database when he changes a rate. No wallet yet reads as zero (every box in use has one; a new box gets one as it is made).
export function walletPublic(row, rates) {
  const w = row && typeof row === 'object' ? row : {};
  const earned = whole(w.earned), granted = whole(w.granted), bought = whole(w.bought);
  const r = {};
  for (const x of Array.isArray(rates) ? rates : []) if (x && RATE_KEYS.includes(x.key)) r[x.key] = whole(x.amount);
  return {
    total: earned + granted + bought, earned, granted, bought, hold: w.hold === true,
    rates: { game: r.game ?? null, day_cap: r.game_day_cap ?? null, month_cap: r.game_month_cap ?? null },
  };
}

// One ledger line as the page sees it: how many coins it moved, in plain words, the day a game's coins count for (its end,
// in New York) and when the line was written. The page shows the day when there is one, else the time by its own clock.
export const KIND_WORDS = {
  game: 'A game you finished',
  welcome: 'Welcome to Soul',
  grant: 'A gift',
  purchase: 'Coins you bought',
  spend: 'Spent',
  reverse: 'Undone',
  adjust: 'A correction',
  refund: 'A payment refunded',            // Step 5: coins a refunded or reversed purchase took back
  fade: 'Monthly coins faded',             // Step 6a: what is left of a month's coins after its 45 days, fading
};
export const BACK_WORDS = 'Coins back';   // a reversal that puts coins back (an order refunded) says so; one that takes them is Undone
export function ledgerLine(row) {
  const x = row && typeof row === 'object' ? row : {};
  const delta = (Number(x.d_earned) || 0) + (Number(x.d_granted) || 0) + (Number(x.d_bought) || 0);
  const day = typeof x.for_day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.for_day) ? x.for_day : null;
  const at = typeof x.created_at === 'string' && x.created_at ? x.created_at : null;
  const words = x.kind === 'reverse' && delta > 0 ? BACK_WORDS : KIND_WORDS[x.kind] || KIND_WORDS.adjust;   // a refund reads as coins back
  return { id: x.id ?? null, delta, kind: x.kind || 'adjust', words, day, at };
}

// What a finished game's answer carries about coins: what this game earned (0 when the day or month was full, or the game
// ended before coins began) and the wallet after it, when the database sent one. Anything else is dropped.
export function coinsAnswer(d) {
  if (!d || typeof d !== 'object' || d.ok !== true) return null;
  const out = { play: typeof d.play === 'string' ? d.play : null, earned: whole(d.earned) };
  if (typeof d.why === 'string') out.why = d.why;
  if (d.repeat === true) out.repeat = true;
  const w = d.wallet;
  if (w && typeof w === 'object') {
    const earned = whole(w.earned), granted = whole(w.granted), bought = whole(w.bought);
    out.wallet = { total: earned + granted + bought, earned, granted, bought };
  }
  return out;
}

// ── Step 3: offers at a closed branch, paid with coins (his AUQs 2026-09-29 ~22:50 ET) ─────────────────────────────────────
// A closed branch can become a blueprint (a file their own AI follows), a routine (something we run for them daily) or a build
// (a thing the factory makes). The database holds the prices (cwp_coin_rates), decides every buy (cwp_offer_buy) and refuses
// what cannot be bought yet; this module names what the function reads and shapes what the page sees.
export const OFFER_KINDS = ['blueprint', 'routine', 'build'];
// What can be bought now: all three (a routine since the runner exists and the membership redesign of 2026-09-30 took away the
// database's refusal, CL062; a test holds the two equal).
export const OPEN_KINDS = { blueprint: true, routine: true, build: true };
// Kinds only granted and bought coins pay for: play coins never buy a build (his ruling; cwp_coin_spend_paid).
export const PAID_ONLY = new Set(['build']);
// What the function reads. Never the maker's reason (the crew's), an order's ledger lines, or a box id.
export const OFFER_COLUMNS = 'id, goal_id, kind, title, pitch, price, status, opened_at';
export const ORDER_COLUMNS = 'id, offer_id, kind, price, status, due_at, refund_why, delivery, created_at, delivered_at, refunded_at, included_by';
export const OFFER_RATE_KEYS = ['offer_blueprint', 'offer_routine', 'offer_build_min', 'blueprint_days', 'build_days', 'routine_days'];
export const OFFER_LINES = 30;                     // the open offers a payload carries
export const ORDER_LINES = 20;                     // the newest orders a payload carries
export const BLUEPRINT_TEXT_MAX = 16000;          // a delivered blueprint's text rides with its order, at most a skill file's size

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const uuid = (v) => (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null);

// One open offer as the page sees it.
export function offerPublic(row) {
  const x = row && typeof row === 'object' ? row : {};
  if (!OFFER_KINDS.includes(x.kind) || !uuid(x.id)) return null;
  const price = whole(x.price);
  return { id: x.id, goal_id: uuid(x.goal_id), kind: x.kind, title: text(x.title, 80), pitch: text(x.pitch, 600), price: price > 0 ? price : null, opened_at: typeof x.opened_at === 'string' ? x.opened_at : null };
}

// One order as the page sees it: its title from its offer (gone with a deleted box), and what came back: a blueprint's text,
// or the document a build was handed back as. Never the ledger's lines. The blueprint record, phase two (2026-10-01): a fourth
// argument, by order id, carries a delivered blueprint's library version (index.ts blueprintOrderExtras, shaped by
// soul-blueprints.mjs orderExtra); with it the text is the version that was delivered, never the Box's own newer copy of the
// file, and its Done when lines, its path and the last run its AI reported ride along. Without it, nothing changes.
export function orderPublic(row, titles, blueprints, extras) {
  const x = row && typeof row === 'object' ? row : {};
  if (!OFFER_KINDS.includes(x.kind) || !uuid(x.id)) return null;
  const d = x.delivery && typeof x.delivery === 'object' ? x.delivery : {};
  const out = {
    id: x.id, kind: x.kind, title: (titles && x.offer_id && typeof titles[x.offer_id] === 'string') ? titles[x.offer_id] : null,
    price: whole(x.price), status: ['open', 'delivered', 'refunded'].includes(x.status) ? x.status : 'open',
    due_at: typeof x.due_at === 'string' ? x.due_at : null, created_at: typeof x.created_at === 'string' ? x.created_at : null,
    delivered_at: typeof x.delivered_at === 'string' ? x.delivered_at : null, refunded_at: typeof x.refunded_at === 'string' ? x.refunded_at : null,
    refund_why: x.refund_why === 'late' || x.refund_why === 'crew' ? x.refund_why : null,
    included: !!uuid(x.included_by),                // a member's included routine: no coins spent (the membership's id never leaves)
  };
  if (out.status === 'delivered' && x.kind === 'blueprint' && typeof d.skill_path === 'string' && blueprints && typeof blueprints[d.skill_path] === 'string')
    out.blueprint = blueprints[d.skill_path].slice(0, BLUEPRINT_TEXT_MAX);
  if (out.status === 'delivered' && uuid(d.document_id)) out.document_id = d.document_id;
  const ex = extras && typeof extras === 'object' && Object.prototype.hasOwnProperty.call(extras, x.id) ? extras[x.id] : null;
  if (ex && typeof ex === 'object' && out.status === 'delivered' && x.kind === 'blueprint') {
    if (typeof ex.content === 'string') out.blueprint = ex.content.slice(0, BLUEPRINT_TEXT_MAX);
    out.version = whole(ex.version) || null;
    out.done_when = Array.isArray(ex.done_when) ? ex.done_when.filter((s) => typeof s === 'string') : [];
    out.path = typeof d.skill_path === 'string' ? d.skill_path : null;
    out.run = ex.run && typeof ex.run === 'object' ? ex.run : null;
  }
  return out;
}

// The days an order takes, from the table, for the page's words ("ready within 3 days").
export function offerDays(rates) {
  const r = {};
  for (const x of Array.isArray(rates) ? rates : []) if (x && OFFER_RATE_KEYS.includes(x.key)) r[x.key] = whole(x.amount);
  return { blueprint: r.blueprint_days || null, build: r.build_days || null, routine: r.routine_days || null };
}

// Whether a wallet can pay for an offer, and with how many coins it counts: a build counts only granted and bought coins. A routine
// a member has a free slot for (routineFree, from cwp_member_routines) costs nothing and needs no coins; the database decides again
// when it is bought.
export function canBuy(wallet, offer, routineFree) {
  const w = wallet && typeof wallet === 'object' ? wallet : {};
  const o = offer && typeof offer === 'object' ? offer : {};
  const need = whole(o.price);
  const have = PAID_ONLY.has(o.kind) ? whole(w.granted) + whole(w.bought) : whole(w.earned) + whole(w.granted) + whole(w.bought);
  if (!OPEN_KINDS[o.kind] || need <= 0) return { ok: false, why: 'not_open', have, need };
  if (o.kind === 'routine' && routineFree === true) return { ok: true, included: true, have, need: 0 };
  if (w.hold === true) return { ok: false, why: 'on_hold', have, need };
  return have >= need ? { ok: true, have, need } : { ok: false, why: 'short', have, need };
}

// A refused buy or pass, in the words the page answers: the database's own codes, and nothing else leaks.
export const REFUSALS = { CL031: 'on_hold', CL032: 'not_enough', CL061: 'not_open', CL062: 'not_yet', P0002: 'not_found' };
export function refusalOf(code) { return Object.prototype.hasOwnProperty.call(REFUSALS, code) ? REFUSALS[code] : null; }
// The crew's refusals, each with its answer's status: the database's codes, in words the crew page can show.
export const CREW_REFUSALS = {
  P0002: ['not_found', 404], CL061: ['not_waiting', 409], CL063: ['quote_too_low', 400], CL064: ['already_settled', 409],
  CL065: ['past_its_date', 409], CL066: ['not_late_yet', 409], CL071: ['over_the_cap', 400], CL094: ['membership_ended', 409], 22023: ['bad_value', 400],
  23514: ['too_long', 400], 23505: ['already_there', 409],
};
export function crewRefusal(code) { return Object.prototype.hasOwnProperty.call(CREW_REFUSALS, code) ? CREW_REFUSALS[code] : null; }

// The post an order makes where the crew looks (#leads, like a new card): the kind of thing and nothing else, no name and no
// words of theirs, so it describes no one (the box privacy notice lists the post).
const KIND_NAMES = { blueprint: 'a blueprint', routine: 'a routine', build: 'a build' };
export function orderPingText(kind) {
  return 'An order came in on Soul: ' + (KIND_NAMES[kind] || 'something') + '. It is on the crew page, with its date.';
}

// A card bought with coins, as the person sees it on their board: no grade and no factory badge (his plan: no grade is ever
// shown on a bought item). Every other card is unchanged.
export function soldItem(item) {
  return item && typeof item === 'object' && item.order_id ? { ...item, grade: null, floor_status: null } : item;
}

// ── Step 5: buying Soul Coins (the money plan § Step 5 and its build notes, 2026-09-30) ─────────────────────────────────────
// The database decides who may buy now and credits each purchase once (cwp_coin_shop_gate, cwp_coin_checkout_paid: a test key sells
// to crew boxes only); this module shapes what the page and the crew page see. No key, no amount of Stripe's, ever passes here.
export const PACK_RE = /^pack_[0-9]{1,7}$/;
// A checkout as its buyer's return reads it: which pack, how many coins, where it stands. Never a session id or a buyer's detail.
export const CHECKOUT_COLUMNS = 'id, pack, coins, status, livemode, paid_at';
// A purchase as the crew page reads it: amounts, a status, dates, where a refund or a dispute stands. Stripe keeps the buyer's
// details; nothing here names a buyer.
export const PURCHASE_COLUMNS = 'id, workstation_id, pack, coins, price_cents, livemode, status, fail_code, amount_total, paid_at, refunded_cents, refund_coins, short_coins, dispute_status, created_at';
export const PURCHASE_LINES = 40;

// The shop as the page sees it: the packs this box can buy now in this key's mode, and the refund days for its words. Null when the
// database says this box cannot buy now, or when nothing in the answer reads as a pack.
export function shopPublic(d, mode) {
  if (!d || typeof d !== 'object' || d.open !== true || (mode !== 'live' && mode !== 'test')) return null;
  const packs = (Array.isArray(d.packs) ? d.packs : []).map((p) => {
    const x = p && typeof p === 'object' ? p : {};
    const coins = whole(x.coins), cents = whole(x.price_cents);
    return PACK_RE.test(String(x.key || '')) && coins > 0 && cents > 0 && x.currency === 'usd' ? { key: x.key, coins, price_cents: cents, currency: 'usd' } : null;
  }).filter(Boolean);
  if (!packs.length) return null;
  const days = whole(d.refund_days);
  return { mode, packs, refund_days: days > 0 ? days : null };
}

// A refused checkout, in the words the page answers, with its status: the database's own codes, and nothing else leaks.
export const SHOP_REFUSALS = { CL031: ['on_hold', 409], CL081: ['too_many', 429], CL082: ['shop_closed', 409], P0002: ['not_found', 404], 22023: ['bad_value', 400] };
export function shopRefusal(code) { return Object.prototype.hasOwnProperty.call(SHOP_REFUSALS, code) ? SHOP_REFUSALS[code] : null; }

// What the page hears when a buyer comes back from Stripe: the database's word on the checkout, never Stripe's. Paid is credited;
// made or open is on its way (Stripe sends a buyer back only after the payment, so an open one is still settling); expired or failed
// was not paid; an orphan or a mismatch is the crew's to sort out.
export function returnAnswer(row) {
  const x = row && typeof row === 'object' ? row : {};
  const status = x.status === 'paid' ? 'credited'
    : x.status === 'expired' || x.status === 'failed' ? 'not_paid'
    : x.status === 'orphan' || x.status === 'mismatch' ? 'checking'
    : 'pending';
  return { status, coins: whole(x.coins), pack: PACK_RE.test(String(x.pack || '')) ? x.pack : null };
}

// One purchase for the crew page: the box's name, the pack, the money, where a refund or a dispute stands, the box's bought coins
// now, whether they still hold the pack (bought coins are spent last, so a pack is unspent while they do), and whether it is inside
// the refund days. The page answers a refund request from Stripe's email with these.
export function purchaseForCrew(row, names, bought, days, nowMs) {
  const x = row && typeof row === 'object' ? row : {};
  const ws = typeof x.workstation_id === 'string' ? x.workstation_id : null;
  const coins = whole(x.coins), taken = whole(x.refund_coins);
  const have = ws && bought && Number.isInteger(bought[ws]) ? bought[ws] : null;
  const paidAt = typeof x.paid_at === 'string' ? Date.parse(x.paid_at) : NaN;
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  return {
    id: x.id, box: ws ? (names && typeof names[ws] === 'string' ? names[ws] : '') : null, pack: x.pack, coins,
    price_cents: whole(x.price_cents), amount_total: x.amount_total == null ? null : whole(x.amount_total), live: x.livemode === true,
    status: typeof x.status === 'string' ? x.status : null, fail_code: typeof x.fail_code === 'string' ? x.fail_code : null,
    paid_at: typeof x.paid_at === 'string' ? x.paid_at : null, created_at: typeof x.created_at === 'string' ? x.created_at : null,
    refunded_cents: whole(x.refunded_cents), coins_taken_back: taken, coins_short: whole(x.short_coins),
    dispute: typeof x.dispute_status === 'string' ? x.dispute_status : null, box_bought: have,
    unspent: x.status === 'paid' && taken === 0 && have !== null ? have >= coins : null,
    in_refund_days: Number.isFinite(paidAt) && whole(days) > 0 ? now - paidAt <= whole(days) * 86400000 : null,
  };
}

// ── Step 6a: the membership (the money plan § Step 6 and its build notes, 2026-09-30) ─────────────────────────────────────────
// The database decides who may join (cwp_member_gate: the switch, held at crew boxes until the routine trial reads; a test key
// sells to crew boxes only), grants each paid month once (cwp_member_invoice_paid) and counts the end-of-branch routines it includes
// (cwp_member_routines: his cap of 2, 2026-09-30); this module shapes what the page and the crew page see. The page shows the card
// while the box can join, and always to a box that has been a member.
const iso = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? v : null);
export function memberPublic(d, mode) {
  if (!d || typeof d !== 'object' || (mode !== 'live' && mode !== 'test')) return null;
  const m = d.member && typeof d.member === 'object' ? d.member : null;
  if (d.can_join !== true && !m) return null;
  const rt = m && m.routines && typeof m.routines === 'object' ? m.routines : null;
  const f = d.fade && typeof d.fade === 'object' ? d.fade : null;
  return {
    mode, can_join: d.can_join === true, price_cents: whole(d.price_cents) || null, grant: whole(d.grant) || null,
    fade_after: whole(d.fade_after) || null, fade_days: whole(d.fade_days) || null, routine_cap: whole(d.routine_cap) || null,
    member: m ? {
      status: ['active', 'past_due', 'ended'].includes(m.status) ? m.status : 'active', active: m.active === true,
      paid_through: iso(m.paid_through), until: iso(m.until), cancelling: m.cancel_at_period_end === true, manage: m.manage === true,
      routines: rt ? { cap: whole(rt.cap), used: whole(rt.used) } : null,
    } : null,
    fade: f && whole(f.coins) > 0 ? { coins: whole(f.coins), from: iso(f.from), now: f.now === true } : null,
  };
}
// A refused join, branch or manage, in the words the page answers, with its status: the database's own codes, and nothing else.
export const MEMBER_REFUSALS = {
  CL091: ['already_member', 409], CL092: ['member_closed', 409], CL093: ['not_a_member', 409], CL081: ['too_many', 429],
  P0002: ['not_found', 404], 22023: ['bad_value', 400],
};
export function memberRefusal(code) { return Object.prototype.hasOwnProperty.call(MEMBER_REFUSALS, code) ? MEMBER_REFUSALS[code] : null; }
// A refused look (the launch, 2026-09-30: the market's skins, pet colours, things to wear and the pet's name; soul-looks.mjs), in the
// words the page answers, with its status: the database's own codes (cwp_look_buy, cwp_skin_set, cwp_pet_wear_set, cwp_pet_rename).
// ⛔ Its own map: the shop's functions use CL081 and CL082 for other things (SHOP_REFUSALS), so a code means what its function says.
export const LOOK_REFUSALS = {
  CL031: ['on_hold', 409], CL032: ['not_enough', 409], CL080: ['not_for_sale', 409], CL081: ['already_yours', 409],
  CL082: ['not_yours', 409], CL083: ['same_name', 409], CL084: ['bad_name', 400], CL085: ['price_changed', 409], P0002: ['not_found', 404], 22023: ['bad_value', 400],
};
export function lookRefusal(code) { return Object.prototype.hasOwnProperty.call(LOOK_REFUSALS, code) ? LOOK_REFUSALS[code] : null; }
// A join as its member's return reads it (never a session id, a subscription or a customer).
export const MEMBERSHIP_RETURN_COLUMNS = 'id, status, livemode, paid_through';
export function memberReturnAnswer(row) {
  const x = row && typeof row === 'object' ? row : {};
  const status = x.status === 'active' || x.status === 'past_due' || x.status === 'ended' ? 'joined'
    : x.status === 'expired' || x.status === 'failed' ? 'not_paid'
    : x.status === 'orphan' || x.status === 'mismatch' ? 'checking'
    : 'pending';
  return { status, paid_through: iso(x.paid_through) };
}
// The memberships the crew page reads: status, the month, cancelling, the months paid and taken back; no Stripe customer.
export const MEMBER_CREW_COLUMNS = 'id, workstation_id, livemode, status, fail_code, paid_through, cancel_at_period_end, ended_at, created_at';
export const MEMBER_CREW_LINES = 40;
export function memberForCrew(row, names, months) {
  const x = row && typeof row === 'object' ? row : {};
  const ws = typeof x.workstation_id === 'string' ? x.workstation_id : null;
  const mo = months && typeof months === 'object' && months[x.id] ? months[x.id] : { paid: 0, refunded_cents: 0, disputed: false };
  return {
    id: x.id, box: ws ? (names && typeof names[ws] === 'string' ? names[ws] : '') : null, live: x.livemode === true,
    status: typeof x.status === 'string' ? x.status : null, fail_code: typeof x.fail_code === 'string' ? x.fail_code : null,
    paid_through: iso(x.paid_through), cancelling: x.cancel_at_period_end === true, ended_at: iso(x.ended_at),
    created_at: iso(x.created_at),
    months_paid: whole(mo.paid), refunded_cents: whole(mo.refunded_cents), disputed: mo.disputed === true,
  };
}

// What a buy answers: the order and the wallet after it (the wallet only when the buy spent something).
export function buyAnswer(d) {
  if (!d || typeof d !== 'object' || d.ok !== true) return null;
  const o = d.order && typeof d.order === 'object' ? d.order : {};
  const out = { order: { id: uuid(o.id), kind: OFFER_KINDS.includes(o.kind) ? o.kind : null, price: whole(o.price), status: o.status === 'open' ? 'open' : String(o.status || ''), due_at: typeof o.due_at === 'string' ? o.due_at : null, included: o.included === true } };
  if (d.repeat === true) out.repeat = true;
  const w = d.wallet;
  if (w && typeof w === 'object') {
    const earned = whole(w.earned), granted = whole(w.granted), bought = whole(w.bought);
    out.wallet = { total: earned + granted + bought, earned, granted, bought };
  }
  return out;
}
