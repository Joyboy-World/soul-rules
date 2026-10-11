// Soul looks (the launch, 2026-09-30; his rulings that afternoon): the market's skins, pet colours and things to wear, what a
// box owns and uses, the pet's name, and the reports a person can file. ONCE here, imported by index.ts and by
// tests/cwp-soul-looks.test.js (the soul-rules.mjs pattern). The database holds the catalog and its prices (cwp_cosmetics) and
// decides every buy, skin, wear and rename (cwp_look_buy, cwp_skin_set, cwp_pet_wear_set, cwp_pet_rename, cwp_pet_colour_ok in
// supabase/migrations/20260930_cwp_zzzzzzzzzzzz_launch.sql); this module names what the function reads, shapes what the page
// sees, and refuses a pet name off the rule or on the blocklist before the database is asked. It imports nothing on purpose:
// the mutation control copies this file alone into a temporary folder.

// ── The catalog ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const COSMETIC_KINDS = ['skin', 'pet_colour', 'pet_wear', 'card_frame'];
export const WEAR_SLOTS = ['head', 'eyes', 'glasses', 'cheeks'];
export const COSMETIC_KEY_RE = /^[a-z0-9_]{2,40}$/;
export const SKIN_KEY_RE = /^skin_[a-z0-9_]{2,34}$/;
// The Onibee card's borders (2026-10-08, his rulings "Eclipse free, rest to buy" and "500 each"; supabase/migrations/
// 20261008_cwp_card_frames.sql): Eclipse is every card's and has no key (a box's card_frame null); these eight are sold.
export const FRAME_KEYS = ['frame_constellation', 'frame_lunar', 'frame_solar', 'frame_orbit', 'frame_nebula', 'frame_aurora', 'frame_celestial', 'frame_void'];
// The pet's colours: the five free ones (soul-rules.mjs PET_COLOURS; the test holds the two equal) and the five sold in the market.
export const FREE_COLOURS = ['blue', 'pink', 'mint', 'honey', 'lilac'];
export const PAID_COLOURS = ['chrome_silver', 'chrome_gold', 'chrome_rose', 'off_white', 'off_black'];
export const EDGES = ['smooth', 'wavy', 'spiky', 'fuzzy'];            // soul-rules.mjs PET_EDGES
// A rename costs this many Soul Coins (the first name is free). The payload reads the rate from cwp_coin_rates; this is its seed.
export const RENAME_COST = 3000;
export const RENAME_RATE_KEY = 'pet_rename';
export const CATALOG_LINES = 200;

// What the migration seeds, his list: [key, kind, slot, value, title, price]. The test compares it with the migration when the
// migration is in the tree.
export const CATALOG = [
  ['skin_ember', 'skin', null, 'skin_ember', 'Ember', 300],
  ['skin_tide', 'skin', null, 'skin_tide', 'Tide', 300],
  ['skin_aurora', 'skin', null, 'skin_aurora', 'Aurora', 300],
  ['skin_dawn', 'skin', null, 'skin_dawn', 'Dawn', 300],
  ['skin_frost', 'skin', null, 'skin_frost', 'Frost', 300],
  ['colour_chrome_silver', 'pet_colour', null, 'chrome_silver', 'Silver chrome', 300],
  ['colour_chrome_gold', 'pet_colour', null, 'chrome_gold', 'Gold chrome', 300],
  ['colour_chrome_rose', 'pet_colour', null, 'chrome_rose', 'Rose chrome', 300],
  ['colour_off_white', 'pet_colour', null, 'off_white', 'Off-white', 50],
  ['colour_off_black', 'pet_colour', null, 'off_black', 'Off-black', 50],
  ['wear_crown', 'pet_wear', 'head', 'crown', 'Crown', 50],
  ['wear_wizard_hat', 'pet_wear', 'head', 'wizard_hat', 'Wizard hat', 50],
  ['wear_bow', 'pet_wear', 'head', 'bow', 'Bow', 50],
  ['wear_halo', 'pet_wear', 'head', 'halo', 'Halo', 50],
  ['wear_glasses', 'pet_wear', 'glasses', 'glasses', 'Glasses', 50],
  ['wear_blush', 'pet_wear', 'cheeks', 'blush', 'Blush', 50],
  ['wear_star_eyes', 'pet_wear', 'eyes', 'star', 'Star eyes', 50],
  ['wear_heart_eyes', 'pet_wear', 'eyes', 'heart', 'Heart eyes', 50],
  ['wear_sleepy_eyes', 'pet_wear', 'eyes', 'sleepy', 'Sleepy eyes', 50],
  ['wear_sparkle_eyes', 'pet_wear', 'eyes', 'sparkle', 'Sparkle eyes', 50],
];
// The borders, seeded by their own migration (20261008_cwp_card_frames.sql), the same shape.
export const FRAME_CATALOG = [
  ['frame_constellation', 'card_frame', null, 'frame_constellation', 'Constellation', 500],
  ['frame_lunar', 'card_frame', null, 'frame_lunar', 'Lunar', 500],
  ['frame_solar', 'card_frame', null, 'frame_solar', 'Solar', 500],
  ['frame_orbit', 'card_frame', null, 'frame_orbit', 'Orbit', 500],
  ['frame_nebula', 'card_frame', null, 'frame_nebula', 'Nebula', 500],
  ['frame_aurora', 'card_frame', null, 'frame_aurora', 'Aurora', 500],
  ['frame_celestial', 'card_frame', null, 'frame_celestial', 'Celestial', 500],
  ['frame_void', 'card_frame', null, 'frame_void', 'Void', 500],
];

// What the function reads. Never an unlock's ledger line (spend_entry) or its row id. The status comes with the catalog so a look
// the market stopped selling still reaches the box that owns it (terms: a look stays on your Box even if we stop selling it).
export const COSMETIC_COLUMNS = 'key, kind, slot, value, title, price, sort, status';
export const UNLOCK_COLUMNS = 'cosmetic_key';
export const LOOK_BOX_COLUMNS = 'soul_skin, pet_colour, pet_edge, pet_name, pet_wear';     // this box's own look
export const FRAME_COLUMNS = 'card_frame';                                                  // the card's border, read on its own so a function ahead of its migration loses only the border
export const DRESS_COLUMNS = 'id, pet_colour, pet_edge, pet_name, pet_wear';                // another box's pet, for a friend or a room

const whole = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : 0; };
const VALUE_RE = /^[a-z0-9_]{1,40}$/;

export function cosmeticKey(v) { return typeof v === 'string' && COSMETIC_KEY_RE.test(v) ? v : null; }
export function skinKey(v) { return typeof v === 'string' && SKIN_KEY_RE.test(v) ? v : null; }
export function frameKey(v) { return typeof v === 'string' && FRAME_KEYS.includes(v) ? v : null; }
export function wearSlot(v) { return typeof v === 'string' && WEAR_SLOTS.includes(v) ? v : null; }
export function paidColour(v) { return typeof v === 'string' && PAID_COLOURS.includes(v) ? v : null; }
// Any colour a pet can wear: a free one or one from the market (the database holds a paid one to a box that owns it).
export function anyColour(v) { return typeof v === 'string' && (FREE_COLOURS.includes(v) || PAID_COLOURS.includes(v)) ? v : null; }
export function edgeOf(v) { return typeof v === 'string' && EDGES.includes(v) ? v : null; }
// What the pet wears: only the four slots, each the cosmetic's VALUE the database stores there (crown, star: cwp_pet_wear_set takes a
// key and writes its value, and the ownership trigger refuses anything else); anything else is dropped.
export function wearOf(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const s of WEAR_SLOTS) if (typeof v[s] === 'string' && COSMETIC_KEY_RE.test(v[s])) out[s] = v[s];
  return out;
}

// One catalog row as the page sees it, or null: a known kind, a slot exactly when it is something to wear, a price above zero,
// and whether the market still sells it (for_sale; a row read without its status is for sale, as it was before).
export function catalogItem(row) {
  const x = row && typeof row === 'object' ? row : {};
  if (!cosmeticKey(x.key) || !COSMETIC_KINDS.includes(x.kind)) return null;
  const slot = x.kind === 'pet_wear' ? wearSlot(x.slot) : null;
  if (x.kind === 'pet_wear' ? !slot : x.slot != null) return null;
  const title = typeof x.title === 'string' ? x.title.trim() : '';
  const price = whole(x.price);
  if (!title || title.length > 40 || price <= 0 || typeof x.value !== 'string' || !VALUE_RE.test(x.value)) return null;
  return { key: x.key, kind: x.kind, slot, value: x.value, title, price, for_sale: x.status === undefined || x.status === 'live' };
}

// The market as a payload carries it: the catalog in its order (what is for sale, and what this box owns even after the market
// stopped selling it, marked for_sale false), the keys this box owns, its skin, what a rename costs, and the card's border (null is
// Eclipse, everyone's).
export function looksPublic(catalogRows, ownedRows, skin, rateRows, frame) {
  const owned = [];
  for (const r of Array.isArray(ownedRows) ? ownedRows : []) {
    const k = cosmeticKey(r && r.cosmetic_key);
    if (k && !owned.includes(k)) owned.push(k);
  }
  const catalog = (Array.isArray(catalogRows) ? catalogRows : []).map(catalogItem).filter((x) => x && (x.for_sale || owned.includes(x.key)));
  let cost = RENAME_COST;
  for (const r of Array.isArray(rateRows) ? rateRows : []) if (r && r.key === RENAME_RATE_KEY && whole(r.amount) > 0) cost = whole(r.amount);
  return { catalog, owned, skin: skinKey(skin), rename_cost: cost, frame: frameKey(frame) };
}

// ── The pet's name ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// The first name is free and a rename costs RENAME_COST (the database charges it). A name is trimmed, 1 to 20 characters, and only
// letters A to Z, digits, spaces, apostrophes, dots and hyphens, with a letter or a digit (the database's own rule, CL084, which is
// ASCII: an accented letter is refused there, so it is refused here first); it shows to its owner, their Soul Ties
// and the people in their rooms, so a name on the blocklist below is refused here, before the database is asked.
export const PET_NAME_MAX = 20;
export const REPORTED_NAME_MAX = 24;
const NAME_CHARS = /^[A-Za-z0-9 '.\-]+$/;
const HAS_ALNUM = /[A-Za-z0-9]/;
export function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim();
  if (!s || [...s].length > PET_NAME_MAX || !NAME_CHARS.test(s) || !HAS_ALNUM.test(s)) return null;
  return s;
}

// The blocklist: slurs and obvious profanity. The words are kept in ROT13 so the file does not read as a list of them; the
// matcher folds case, accents, spaces, dots, hyphens and apostrophes, common letter swaps (0 o, 1 i or l, 3 e, 4 a, 5 s, 6 g,
// 7 t, 8 b, 9 g; and, tried as a second reading, l as i and q as g) and look-alike Cyrillic and Greek letters, and lets a letter
// repeat ("fuuun" still matches "fun"). The SLUR group (racial and homophobic words, which rarely sit inside innocent words)
// is also read across the whole name with every space, dot and hyphen gone, so a slur split into two words is still caught;
// the rest of the list is read piece by piece, so "Sushi Tiger" stays a name. ANYWHERE
// words match inside a longer word; WHOLE words only as a whole word (they sit inside innocent ones: "Cassie", "Dickens",
// "grape"); ALLOW words are innocent words that hold an ANYWHERE word ("shiitake"). Words split by spaces or dots are read
// joined when a piece is one or two letters long ("f u n" reads "fun"), never across two whole words ("Sushi Tiger").
const unrot = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
const ANYWHERE = unrot('avtt snttbg phag shpx cuhpx fuvg ovgpu ovngpu juber fyhg ergneq jrgonpx genaal genaavr gjng qvyqb cravf intvan uvgyre cbea wvmm nffubyr nefrubyr onfgneq obyybpx pbpxfhpx qvpxurnq jnaxre zbyrfg crqbcuvy cnrqbcuvy qhzonff ovtqvpx').split(' ');
const WHOLE = unrot('nff nefr phz pbpx qvpx chffl gvg gvgf gvggl gvggvrf obbo obbof nany nahf frk encr encvfg anmv xxx xvxr fcvp fcvpx puvax snt sntt pbba tbbx qlxr ubzb cvff cevpx fynt gubg jnax shx spx sphx sipx fulg arteb phpx zvys crqb cnrqb ceba encre xhag').split(' ');
// the slur group: matched anywhere in the name read whole, and as a whole name read whole
const SLUR_ANY = unrot('avtt snttbg jrgonpx genaal genaavr xarrteb').split(' ');
const SLUR_WHOLE = unrot('xvxr fcvp fcvpx puvax snt sntt pbba tbbx qlxr arteb ubzb xxx').split(' ');
const ALLOW = unrot('fuvvgnxr fuvgnxr zngfhfuvgn fphagubecr cravfgbar').split(' ');
const runs = (w) => w.replace(/([a-z])\1*/g, (m, c) => (m.length > 1 ? c + '{' + m.length + ',}' : c + '+'));
const ANYWHERE_RE = new RegExp(ANYWHERE.map(runs).join('|'));
const WHOLE_RE = new RegExp('^(?:' + WHOLE.map(runs).join('|') + ')(?:e?s)?$');
const SLUR_ANY_RE = new RegExp(SLUR_ANY.map(runs).join('|'));
const SLUR_WHOLE_RE = new RegExp('^(?:' + SLUR_WHOLE.map(runs).join('|') + ')(?:e?s)?$');
const LOOKALIKE = {
  'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x',
  'і': 'i', 'ї': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o',
  'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x',
};
const SWAPS = { 0: 'o', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g' };
const LETTER_SWAPS = { l: 'i', q: 'g' };                                     // the second reading: "Nlgger", "Niqqa"
function folded(name, one, letters) {
  const s = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  return [...s].map((c) => LOOKALIKE[c] || (c === '1' ? one : SWAPS[c]) || (letters && LETTER_SWAPS[c]) || c).join('');
}
function pieces(f) {
  const t = f.split(/[^a-z]+/).filter(Boolean);
  const out = new Set(t);
  for (let i = 0; i + 1 < t.length; i++) if (Math.min(t[i].length, t[i + 1].length) <= 2) out.add(t[i] + t[i + 1]);
  let run = '';
  for (const x of t.concat([''])) {
    if (x && x.length <= 2) { run += x; continue; }
    if (run.length > 2) out.add(run);
    run = '';
  }
  return [...out];
}
export function nameBlocked(name) {
  if (typeof name !== 'string' || !name.trim()) return false;
  for (const one of ['i', 'l']) {
    for (const letters of [false, true]) {
      const f = folded(name, one, letters);
      const joined = f.replace(/[^a-z]+/g, '');                               // the slur group, read across the whole name
      if (SLUR_ANY_RE.test(joined) || SLUR_WHOLE_RE.test(joined)) return true;
      for (let p of pieces(f)) {
        if (WHOLE_RE.test(p)) return true;
        for (const a of ALLOW) p = p.split(a).join('');
        if (ANYWHERE_RE.test(p)) return true;
      }
    }
  }
  return false;
}
// A name the person asked for: { name } to send to the database, or { error } ('bad_name' off the rule, 'blocked_name' on the list).
export function petName(v) {
  const s = cleanName(v);
  if (!s) return { error: 'bad_name' };
  if (nameBlocked(s)) return { error: 'blocked_name' };
  return { name: s };
}
// A stored name as its owner sees it (as kept), and as anyone else sees it (only when it passes the rule and the list today; a
// name that did not is simply not shown).
export function ownName(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && [...s].length <= PET_NAME_MAX ? s : null;
}
export function nameShown(v) {
  const s = ownName(v);
  return s && cleanName(s) === s && !nameBlocked(s) ? s : null;
}

// The owner's own pet look (the payload's pet_look, which gains name and wear) and another box's pet as a friend or a room
// member sees it. Neither carries the box's id.
export function petLookOf(row) {
  const x = row && typeof row === 'object' ? row : {};
  return { colour: anyColour(x.pet_colour), edge: edgeOf(x.pet_edge), name: ownName(x.pet_name), wear: wearOf(x.pet_wear) };
}
export function dressOf(row) {
  const x = row && typeof row === 'object' ? row : {};
  return { colour: anyColour(x.pet_colour), edge: edgeOf(x.pet_edge), name: nameShown(x.pet_name), wear: wearOf(x.pet_wear) };
}
// What a Soul Tie sees of a friend's pet: its name and what it wears, and nothing else of it (privacy #box-friends). A room
// member's pet keeps the whole dress, because the room's sky draws it.
export function tieDress(d) {
  const x = d && typeof d === 'object' ? d : {};
  return { name: typeof x.name === 'string' ? x.name : null, wear: x.wear && typeof x.wear === 'object' && !Array.isArray(x.wear) ? x.wear : {} };
}

// ── What the verbs answer ────────────────────────────────────────────────────────────────────────────────────────────────────
// The page makes a key per press (a double press answers once). Letters, digits, _ and - only, 8 to 100 of them: the database's own
// rule (cwp_look_buy, cwp_pet_rename), so a key it would refuse is refused here as bad_value, before it is asked.
export function idemOf(v) { return typeof v === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(v) ? v : null; }
// The price a buy was shown (above zero) or the cost a name was shown (zero for a first name), as the page sends it: a whole
// number, or null. The database compares it with what it would charge and refuses a price that moved (CL085).
export function shownPrice(v, zeroOk) {
  return typeof v === 'number' && Number.isInteger(v) && v <= 1000000 && (zeroOk ? v >= 0 : v > 0) ? v : null;
}
export function buyAnswer(d) {
  if (!d || typeof d !== 'object' || d.ok !== true) return null;
  return { key: cosmeticKey(d.key), price: whole(d.price), repeat: d.repeat === true };
}
export function skinAnswer(d) { return { skin: skinKey(d && d.skin) }; }
export function frameAnswer(d) { return { frame: frameKey(d && d.frame) }; }
export function wearAnswer(d) { return { wear: wearOf(d && d.wear) }; }
export function renameAnswer(d) {
  if (!d || typeof d !== 'object' || d.ok !== true) return null;
  return { name: ownName(d.name), paid: d.paid === true, cost: whole(d.cost), repeat: d.repeat === true };
}

// ── Reports (a bug, or a pet name someone saw) ───────────────────────────────────────────────────────────────────────────────
// A person files a bug report from the Settings screen of the friends panel, or reports the pet name of a friend or someone in
// their room. Both land in the crew's own inbox (cwp_bug_reports) and ping the crew with no name and no words.
export const REPORT_KINDS = ['bug', 'name'];
export const REPORT_STATUSES = ['new', 'seen', 'fixed', 'cleared'];
export const BUG_BODY_MAX = 2000;
export const NOTE_MAX = 500;
export const VIEW_MAX = 20;
export const BROWSER_MAX = 200;
export const REPORT_CREW_LINES = 100;
// One box cannot flood the inbox or the crew's channel: at most REPORT_OPEN_MAX of its reports of one kind waiting ('new') and
// REPORT_HOUR_MAX in an hour (refused as too_many_reports, 429), and #leads is pinged only when no report of any kind came in
// the REPORT_PING_QUIET_MINUTES before it (the inbox holds the rest).
export const REPORT_OPEN_MAX = 3;
export const REPORT_HOUR_MAX = 5;
export const REPORT_PING_QUIET_MINUTES = 5;
export const REPORT_CREW_COLUMNS = 'id, workstation_id, kind, body, view, browser, reported_ws, reported_name, status, crew_note, created_at, updated_at';
const block = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, '').trim().slice(0, max) : '');
export function viewOf(v) { return typeof v === 'string' && /^[a-z0-9_-]{1,20}$/.test(v) ? v : null; }
export function browserOf(v) {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, BROWSER_MAX) : '';
  return s || null;
}
// A bug report as sent: { body, view, browser }, or { error }. Too long is refused, never cut: a cut report loses its end.
export function bugReport(b) {
  const x = b && typeof b === 'object' ? b : {};
  const raw = typeof x.body === 'string' ? x.body.replace(/\r\n?/g, '\n').trim() : '';
  if (!raw) return { error: 'empty_body' };
  if (raw.length > BUG_BODY_MAX) return { error: 'body_too_long' };
  return { body: block(raw, BUG_BODY_MAX), view: viewOf(x.view), browser: browserOf(x.browser) };
}
// A note with a name report (optional), and the crew's own note on a report: at most 500 characters, null when empty.
export function reportNote(v) { return block(v, NOTE_MAX) || null; }
export function reportStatus(v) { return typeof v === 'string' && REPORT_STATUSES.includes(v) ? v : null; }
// One report for the crew page: who filed it, the name reported (as it was, and the pet's name now), where it stands.
export function reportForCrew(row, names, current) {
  const x = row && typeof row === 'object' ? row : {};
  const ws = typeof x.workstation_id === 'string' ? x.workstation_id : null;
  const rep = typeof x.reported_ws === 'string' ? x.reported_ws : null;
  const name = (id) => (id && names && typeof names[id] === 'string' ? names[id] : null);
  return {
    id: x.id, kind: REPORT_KINDS.includes(x.kind) ? x.kind : null, body: typeof x.body === 'string' ? x.body : null,
    view: typeof x.view === 'string' ? x.view : null, browser: typeof x.browser === 'string' ? x.browser : null,
    status: reportStatus(x.status), crew_note: typeof x.crew_note === 'string' ? x.crew_note : null,
    created_at: typeof x.created_at === 'string' ? x.created_at : null, updated_at: typeof x.updated_at === 'string' ? x.updated_at : null,
    from: name(ws), workstation_id: ws,
    reported: rep ? { workstation_id: rep, box: name(rep), name_then: typeof x.reported_name === 'string' ? x.reported_name : null,
      name_now: current && typeof current[rep] === 'string' ? current[rep] : null } : null,
  };
}
// Where the crew looks (#leads, like a new card): that a report came in, and nothing about who or what it says.
export function bugPingText() { return '\u{1F41E} **A bug report came in on Soul** · see it at apeironweb.com/workstation-crew'; }
export function namePingText() { return '\u{1F6A9} **An Onibee name was reported on Soul** · see it at apeironweb.com/workstation-crew'; }
