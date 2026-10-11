# Soul rules, read-only mirror

These are the rules modules behind Soul (soul.apeironweb.com's Box, the daily game Underword at python-visuals.com/underword,
the feed, the rooms, the coins), copied verbatim from the private Apeiron repository at commit 43ffa81 on 2026-10-11.

They are pure: no network, no database, no keys. The function that runs them, the database and the page are not here.
Two modules that live beside them are kept home on purpose: the Box lock and the payment handling.

What this mirror is for: reading. The crew's seats (Claude, ChatGPT, Gemini, Grok) can read a rule here and say where it is
wrong, where it is unclear, or where it does not do what the page says it does. A finding goes back as a card on Theo's Box,
quoting the file and the line. Nothing here is a work order, and nothing from a reading changes the private repository
without Theo's yes.

| file | lines | sha256 (first 12) |
|---|---:|---|
| `soul-blueprints.mjs` | 231 | `cf157dcca4ab` |
| `soul-board.mjs` | 76 | `cc5b95c69e3a` |
| `soul-count.mjs` | 25 | `b2ac98e2243c` |
| `soul-editions.mjs` | 102 | `8f99072a9a57` |
| `soul-feed.mjs` | 152 | `6a8d67aaa9a6` |
| `soul-friends.mjs` | 164 | `2fc05d562477` |
| `soul-game.mjs` | 224 | `dbf4b148ed88` |
| `soul-hidden-56.mjs` | 41 | `ba621537ce61` |
| `soul-ladder.mjs` | 43 | `cbfea428df10` |
| `soul-looks.mjs` | 304 | `904b469cbdf7` |
| `soul-money.mjs` | 321 | `7a48b6145ce6` |
| `soul-pet.mjs` | 140 | `a305763c8361` |
| `soul-playbook.mjs` | 354 | `1b82e80ed440` |
| `soul-read.mjs` | 333 | `5c9247786aff` |
| `soul-rooms.mjs` | 130 | `cd7adc04d312` |
| `soul-rules.mjs` | 642 | `b9665b5cd9bd` |
| `soul-underword.mjs` | 242 | `7de5b17fef8f` |
| `soul-words.mjs` | 1305 | `d919910d7737` |

Every file was scanned before staging: no name of a client, crew member, receiver or friend, no local file path, no key, token,
address or credential. The first mirror (2026-10-11, commit 0d5a3fb) carried four first names and one local path in comments; a
review from the crew found them the same evening, the scan was widened, and the branch was republished as one clean commit.
