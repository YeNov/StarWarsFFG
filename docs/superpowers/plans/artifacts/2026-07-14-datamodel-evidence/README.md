# DataModel undeclared-paths — offline evidence & tooling (2026-07-14)

Reads Foundry world/pack LevelDB **directly** and constructs the system's real
model classes in node. No Foundry boot, no writes, and it works on backups and
packs the same way. This is what established that the cutover causes no data
loss, and what should be re-run instead of trusting the in-client reporter.

## Prerequisites

System node (v24 works). Foundry ships the driver and the field/DataModel
classes; both are loaded straight out of the install:

- `<app>/node_modules/classic-level` — LevelDB driver.
- `<app>/common/primitives/_module.mjs` — **must be imported first**; the field
  classes call `Array#filterJoin` etc. and throw without it.
- `<app>/common/data/fields.mjs`, `common/abstract/data.mjs`,
  `common/abstract/type-data.mjs` — shim onto
  `globalThis.foundry = {data:{fields}, abstract:{DataModel,TypeDataModel}, utils}`.

**Always run against COPIES.** Opening a LevelDB can trigger recovery writes.
Stop Foundry before copying.

## Scripts

| script | what it answers |
|---|---|
| `probe.js <db>` | key layout / smoke test (keys look like `!items!<id>`) |
| `audit.js <db>…` | per-path present/absent counts for a hand-listed path set |
| `generic-audit.mjs <label>=<db>…` | **the useful one** — constructs every doc against its real model and reports every dropped leaf path, by construction rather than by hand |
| `compare.js <bakDir> <liveDir>` | full-subtree diff of a pre-cutover backup vs live: the data-loss test |
| `decisive.js <db>…` | do docs saved AFTER the cutover still carry undeclared fields? |
| `newdocs.js <db>…` | same question for docs CREATED after the cutover |
| `model-probe.mjs` | what one model does to one synthetic stored payload |
| `prove-fix.mjs` | end-to-end: does the prepared view now show the stored value? |
| `import-test.mjs` | index.js → conformance-report → models-registry resolves, no cycle |
| `rv2.mjs` | `real_value` semantics: not invented, doesn't persist, guard stays false |

## Reading a backup

`.bak` is a zip (`PK`) with a `.json` sidecar; extract `data/<collection>/*`
and point the scripts at it. The 2026-07-04 backup's sidecar is noted `pre-14`.

## Results (2026-07-14)

- `compare.js` backup(2026-07-04) vs live after 10 days on the registered build:
  **1655 docs, 1 lost path** — inside `attributes`, a freeform ObjectField the
  model cannot prune (a user deleting a modifier). **No data loss.**
- `generic-audit.mjs` across **17,696 docs** (V13+V14 worlds, 17 OggDude packs):
  **2088 dropped paths**, vs the 10 a hand-built list assumed. ~1700 are derived
  junk that *should* drop; the rest are now declared. See the fix plan for the
  classification.
- `decisive.js`: 45/47 docs saved post-cutover kept their fields;
  `newdocs.js`: 9/11 created post-cutover kept them.

## Why not the in-client reporter

`conformance-report.js` used to compare `_source.system` with
`system.toObject()` — with models registered that is an object against its own
clone, so it always said CLEAN. It is now probe-based, but note the client's
`_source` is itself already cleaned and materializes declared defaults, so it
still cannot prove what the **database** holds. For that, read it offline.
