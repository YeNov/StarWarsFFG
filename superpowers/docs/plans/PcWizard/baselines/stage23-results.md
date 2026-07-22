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

## Finding 2 — tab content context was not wired (blank Background / Starting-Bonus / XP-Spend)

- **Symptom:** pools loaded, but the Background sub-lists (culture/hook/attitude), the starting-bonus
  choices, and the XP-spend skills list were empty — the templates referenced context the shell
  didn't provide.
- **Owning stage:** 17 (`pc-wizard.js` `_prepareContext`).
- **Fix:** bucket the `background` pool by `snapshot.system.type` into culture/hook/forceAttitude;
  build `startingBonusChoices` from `CONFIG.FFG.characterCreator.startingBonusesRadio[rules]`; build a
  flat `xpSkills` list from the preview actor's skills.
- **Verified live:** Background/Species/Career/Gear/Obligation/Motivation lists render; Select updates
  the header reactively.

## Finding 3 — starting-bonus radios never rendered

- **Symptom:** the Starting-Bonus tab showed no controls, though the data was present.
- **Owning stage:** 16/17.
- **Fix:** replaced the radio markup with the legacy-proven `<select>` dropdown (a top-level
  `{{#each}}` + radio interaction was the problem), wired via a `change` PART binding using `@root`.
- **Verified live:** the dropdown lists the ruleset's options; selecting applies the bonus + persists.

## Finding 4 — purchased skill ranks did not stick (the big one)

- **Symptom:** clicking + logged the click and accumulated purchases (XP dropped), but the skill rank
  in the table never advanced, so cost never scaled.
- **Two owning defects:**
  1. **Un-clickable controls** — the +/- were bare `<i class="far fa-…">` icon glyphs that render
     0×0 without the FA glyph → no hit area. Replaced with real `<button>` elements (Stage 16/17).
  2. **Skill ranks dropped on construction** — root cause: `getActorCreationDefaults` (Stage 2) returned
     the throwaway actor's **prepared** `.system`; `applyBuild` (Stage 10) fed that whole prepared
     system into `new Actor()`, and re-preparing it makes the DataModel drop source skill ranks (even
     in `_source`). Proven with probes: minimal/partial skill source survives (rank kept), full
     **prepared** system resets it — regardless of partial vs full skills.
- **Fix:** `getActorCreationDefaults` now seeds from the clean `throwaway._source.system`; `applyBuild`
  applies skill purchases as a **partial** `system.skills` override (only purchased skills), letting
  `prepareDerivedData` re-add the rest from `CONFIG.FFG.skills`. Also: `#mutate` does a full re-render
  on click actions (targeted only for the gear-filter input) so the active tab refreshes.
- **Verified live:** + advances the rank (0→1→2), XP deducts the scaled cost (career ×5 / non-career
  ×5+5), + disables at the rank-2 creation cap, − refunds. Fixes the committed actor too, not just the
  preview.

## Still pending (Stage 23)

Free career/specialization skill-rank picker (unbuilt); species/career skill grants via AEs verified
against this same skills-prep path; preview↔final parity, effect transfer, tree materialization /
the DEV-16 binding, draft persistence + setFlag latency, the socket round-trip + R7-2 replay, the
single Cypress run, and the deferred CSS polish. (Stages 20/21 fold in here.)
