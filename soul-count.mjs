// The Soul page's live count (2026-10-05 evening, his AUQ: three totals, each in a box, joined by a very small infinity loop):
// Souls, Connections, AIs. The database counts them (cwp_soul_counts, migration 20261005_cwp_zzz_soul_counts.sql, the server
// only); cwp's public soul_count answers the page with these three numbers and nothing else, and holds them a minute, so a busy
// page asks the database at most once a minute per instance. Written once here, imported by cwp and by tests/soul-count.test.js.

export const COUNT_KEYS = ['souls', 'connections', 'ais'];
export const COUNT_HOLD_MS = 60000;

// The database's row, or null: three whole numbers, none below zero, and nothing else carried.
export function countsOf(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const out = {};
  for (const k of COUNT_KEYS) {
    const v = row[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return null;
    out[k] = v;
  }
  return out;
}

// Whether a held answer is still fresh at `now`.
export function stillHeld(held, now) {
  return !!held && typeof held.at === 'number' && now - held.at >= 0 && now - held.at < COUNT_HOLD_MS;
}
