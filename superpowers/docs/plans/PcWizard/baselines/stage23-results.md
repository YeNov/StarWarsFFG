# Stage 23 — live verification results

Running log of Stage 23 findings. Each entry: symptom → owning implementation stage → fix →
verification.

## Finding 1 — content pools returned empty (loader could not read the compendium setting)

- **Symptom (live, F12 probe):** `loadSource("species"|"career"|"obligation"|"motivation")` all
  returned 0; only `gear` returned items (12) — and those were world items, not compendium items.
- **Owning stage:** Stage 8 (`modules/char-creator/load-source.js`).
- **Root cause:** the `<type>Compendiums` world settings store a **comma-separated string** (the
  legacy `getSources` did `.split(",")` at character-creator.js:850). The loader treated the value
  as an array and did `for (const packId of value)`, which iterates a **string character by
  character**, so every `game.packs.get(<char>)` missed. Compendium content never loaded for any
  pool; only the world-item half worked (hence gear's 12).
- **Fix:** split the setting string (tolerating an array for future migrations), trim + skip empty
  ids. `load-source.js` compendium read.
- **Verification (live, after hard reload):** species 0→**117**, career 0→**22**, gear 12→**1111**,
  obligation 0→**188**, motivation 0→**265**. Settings confirmed populated
  (`speciesCompendiums = "world.oggdudespecies"`, etc.). GATE-NODE 201/201, GATE-IMPORTS --cutover
  PASS, load-source lint 0/0.

_(Stages 20/21 fold in here: two-client player smoke, draft lifecycle, XP-log on a real actor,
ruleset/pool/filter, console-clean. Still pending: preview↔final parity, effect transfer, tree
materialization / the DEV-16 binding, draft persistence + setFlag latency, the socket round-trip +
R7-2 replay, the single Cypress run, and the deferred CSS + preview context-shape polish.)_
