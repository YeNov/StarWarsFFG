# DataModel Undeclared Paths — Fix Plan (rev. 6)

> **Status (2026-07-14): Stages 1–2 landed and verified offline; Stage 3 (live
> V13+V14 verification) is the open work.** Commits: `6196265e` (plan +
> evidence), `0f4b9b50` (declarations), `bedaa51b` (reporter), `8863ddcb`
> (real_value migration), plus the correction notes in the migration plan.
> Nothing is pushed.
>
> Rev. 6 is a **premise correction, not a refinement**: revs. 1–5 were
> built on the belief that the DataModel cutover *permanently erases* undeclared
> `system.*` paths from the database. **Measurement disproved that.** The data is
> intact; the defect is narrower. Stages 0 and 5 of rev. 5 (emergency freeze,
> forensic recovery, restoration manifests) are **deleted as unnecessary**. See
> "What changed in rev. 6" and the evidence appendix.
>
> **For agentic workers:** checkbox (`- [ ]`) tracking. Land on `V14-migration`;
> push convention `gh auth switch --user YeNov` then back to `yehornovakov`
> (memory `push-as-yenov-account`). The audit here runs **offline** — no Foundry
> boot required (see Tooling).

**Goal:** Registered DataModels reproduce *template.json* exactly, but the
schemaless system also persisted a set of ad-hoc `system.*` paths template.json
never declared. Those paths are now **invisible to sheets and code**, which
silently disables real behaviour (item damage-status setback, restricted-gear
flags, stimpack counters). **Declare the missing fields** so the already-intact
stored data becomes readable again, fix the verification tooling that failed to
catch this, and repair one genuinely-broken legacy migration.

## Corrected root cause (measured against Foundry 13.351 + 14.364, 2026-07-14)

1. **The prepared view cannot see undeclared paths — CONFIRMED.**
   `SchemaField.initialize()` builds `system` from *declared fields only*, so
   `item.system.rarity.isrestricted` / `item.system.status` read `undefined`
   regardless of what is stored. Verified by constructing the system's real
   `WeaponDataModel` against real stored data offline: stored
   `rarity.isrestricted: true` → `toObject().rarity` = `{value,type,label,adjusted}`
   (pruned), prepared `system.status` = `undefined`. **This is the whole defect.**
2. **The database is NOT modified — the earlier claim was wrong.**
   `TypeDataField._cleanType` prunes **only if `getModelForType()` resolves a
   class**; otherwise it "cleans as an object field" and keeps every key
   (`common/data/fields.mjs`). `CONFIG.Item.dataModels` is populated by the
   system's **client-side esmodule** (`registerSystemDataModels()`); the
   **Foundry server never executes system esmodules**, so server-side no model
   resolves, the server's `_source` is never pruned, and
   `_updateDocuments` → `batchWrite(this._source)` writes the **complete**
   record. The client only ever ships a diff.
3. Consequence: undeclared values persist untouched and **reappear intact the
   moment the field is declared**. No migration, no recovery, no data at risk.

**Evidence (offline, raw LevelDB, no Foundry):** pre-cutover backup
(2026-07-04, sidecar note `"pre-14"`) vs the live world after **10 days of play
on the registered-models build** — **1655 documents compared, exactly 1 lost
path**, and that one is inside `attributes` (a freeform `ObjectField` the model
*cannot* prune) = a user deleting a modifier on 07-10, i.e. the `-=attr` flow
working correctly. Docs **saved** post-cutover retain their fields (45/47;
newest = "Holdout Blaster", saved today 16:02, field intact). Docs **created**
post-cutover retain them too (9/11; the 2 exceptions are blank hand-made items
that never had the key — template.json's `rarity` has no `isrestricted`).
The OggDude weapons pack is **fully intact** (120/120 keep `isrestricted`).

**Why every prior verification said "clean":**
[conformance-report.js](../../../modules/data/conformance-report.js) compares
`doc._source.system` vs `doc.system.toObject()`. On a registered build that is an
object versus its own clone — `dropped`/`changed` are empty **by construction**.
The "CLEAN across 17,925 documents" claim verified nothing. (Note it would have
been *right* about data safety, but for entirely the wrong reason.)

## Findings inventory (measured, not inferred)

Confirmed by raw DB counts. "Stored" = the path exists in real persisted data,
so declaring it makes intact data visible again.

| # | Path | Types | Stored? (raw evidence) | Impact of non-declaration |
|---|------|-------|------------------------|---------------------------|
| F1 | `rarity.isrestricted` | all `basic` items | **Yes** — 120/120 OggDude weapons; 197 world gear; 46 armour | Restricted flag reads false everywhere; char-creator shop filter ([character-creator.js:667](../../../modules/helpers/character-creator.js)) stops filtering |
| F2 | `status` (item condition) | weapon, armour, shipweapon | **Yes** — 120/120 OggDude weapons; 6 world armour | **Gameplay**: [dice-helpers.js:305-315](../../../modules/helpers/dice-helpers.js) Setback / "too damaged" silently no-ops |
| F3 | `stats.medical.uses` | character, minion, nemesis, rival | **Yes** — 6 characters, 2 nemesis | Stimpack counter reads 0 |
| F5 | `general.{age,build,eyes,gender,hair,height}` + `motivation1/2` | character, nemesis, rival | **Yes** — 86/86 actors carry age/build/eyes/gender/hair/height; motivation1/2 on 74 | Bio fields blank on sheets |
| F6 | `obligationlist` | character | **Yes** — 3 characters | Group Manager obligation table empty ([groupmanager-ffg.js:86](../../../modules/groupmanager-ffg.js)); derived totals never compute |
| F7 | `stats.hyperdrive.backup` | vehicle | to confirm in audit | Backup hyperdrive blank |
| F8 | `description`, `attributes`, `price.value`, `rarity.isrestricted` | homesteadupgrade | to confirm in audit | Model is `meta_only`; description editor / modifiers / price all dead |
| F9 | `isEditing` | forcepower, specialization, signatureability | **Yes** — 43/43 forcepowers | Stock tree-editor edit mode |
| F10 | `stats.wounds/strain.real_value` | character, minion | **No** — 0/44, absent pre-cutover too | Field moot; **but the migration is independently broken — see 2.6** |

**Dropped as non-findings** (measured absent in the *pre-cutover* backup as well,
so never stored — they were false positives from reading templates rather than
data):
- **F4 `system.motivation.{strength,flaw,desire,fear}`** — 0 present across
  11 characters / 26 nemesis / 49 rivals, *before and after* the cutover. The
  sheet markup exists but nothing ever wrote it; motivation is an **Item** type.
  Rev. 1–5 rated this "Critical — user-authored prose blanked & erased". It was
  never stored. **Do not declare on the strength of the template binding alone.**
- **`general.notes`** — 0/86, same reasoning.
- `real_value` — 0/44 (see F10; the migration bug is separate and real).

## Tooling — offline audit (replaces the whole raw-boot apparatus)

Rev. 5 specified a `?ffgRawBoot=1` flag, migration suppression, and twin
disposable environments so the reporter could see raw source. **None of that is
needed.** The database can be read directly, with no Foundry process:

- **Raw DB read**: Foundry ships its own driver —
  `require("D:/SW FFG/Portable FVTT 14/App/resources/app/node_modules/classic-level")`
  under system node (v24). Keys are `!items!<id>`; values are the true DB record.
  Always work on **copies** (opening LevelDB can trigger recovery writes).
- **Real model probe**: import `common/primitives/_module.mjs` **first**
  (required — `filterJoin` etc.), then `common/data/fields.mjs`,
  `common/abstract/data.mjs`, `common/abstract/type-data.mjs`; shim
  `globalThis.foundry = {data:{fields}, abstract:{DataModel,TypeDataModel}, utils}`;
  then `new WeaponDataModel(storedSystem)` and diff `toObject()` against stored.
- **Backups**: `.bak` is a **zip** (`PK`) + a `.json` sidecar; extract
  `data/<collection>/*` and read as above.
- Scripts (working, used to produce the evidence above):
  [artifacts/2026-07-14-datamodel-evidence/](artifacts/2026-07-14-datamodel-evidence/)
  — `audit.js` (per-path present/absent), `compare.js` (full-subtree backup vs
  live), `model-probe.mjs` (real model vs real data), `decisive.js`,
  `newdocs.js`.

This is strictly better than raw boot: deterministic, no writes, no Foundry, and
it can read backups and packs the same way.

## Stage 1 — Complete the audit (offline; gates Stage 2)

> **1.1/1.2 RUN 2026-07-14 — and the hand-built F-table was badly incomplete.**
> Generic model-diff across **17,696 documents** (world items/actors for V13+V14,
> plus all 17 OggDude Actor/Item packs) found **2,088 distinct dropped paths**,
> not 10. Full output:
> [artifacts/2026-07-14-datamodel-evidence/generic-audit-out.txt](artifacts/2026-07-14-datamodel-evidence/generic-audit-out.txt).
> They fall in three groups, and 1.3's classification is now the real work:
>
> **(a) Real stored data the F-table MISSED** — must be declared:
> `weapon.skill.useBrawn` (3018), `weapon.characteristic.value` (1285),
> `shipweapon.skill.value`/`useBrawn` (1026/988 — the shipweapon model has
> `firingarc` but **no `skill` block at all**, yet every shipweapon stores one),
> `rival.stats.strain.value`/`.min` (708 — rival's inline stats omit `strain`
> per template.json, but real rivals store it), `vehicle.itemmodifier` /
> `itemattachment` (448 each), `weapon.hardpoints.current` (329),
> `specialization.careerskills` (300), `shipattachment.type` (210).
> **`weapon.adjusteditemmodifier` (329) is a data-integrity finding in its own
> right**: the schema declares only the *misspelled* `adjusteditemmodifer`
> (preserved deliberately), but 329 documents store the *correctly*-spelled
> variant — i.e. both spellings exist on disk. Decide explicitly; do not
> silently pick one.
>
> **(b) Derived/transient junk that leaked into stored data** — correctly
> dropped, must NOT be declared: `renderedDesc`, `enrichedDescription`,
> `enrichedSpecial`, `hasLongDesc`, `doNotSubmit.qualities`, `isReadOnly`, and
> the `collection.talentN.*` / `collection.upgradeN.*` trees (~1,700 of the
> 2,088 paths; the known `_prepareTalentTrees` `{system:{collection}}` bug the
> migration plan already flagged as safe to strip). Their being dropped is a
> *benefit* of the migration.
>
> **(c) Confirmed from the F-table**: `rarity.isrestricted` across
> weapon/gear/shipweapon/armour/itemattachment (1272/1142/1024/245/212),
> `weapon.status` (896), `vehicle.stats.hyperdrive.backup` (457),
> `specialization.isEditing` (303), `rival.general.*` (159 each).
>
> Remaining: finish 1.3 classification for every path in group (a)/(b), then
> Stage 2 declares only group (a) + (c).

- [x] **1.1 — Extend `audit.js` coverage. DONE.** to every collection and pack that
      matters: world `items`/`actors` (done), unlinked-token deltas in `scenes`,
      **all 8 OggDude Actor/Item packs** (`yn-weapons` done — add `yn-armor`,
      `yn-gear`, `yn-items`, `yn-actors`, `yn-adversaries`, `yn-vehicles`,
      `yn-attachments`, `yn-mods`, `yn-careers`, `yn-specializations`,
      `yn-species`, `yn-talents`, `yn-force-powers`, `yn-signature-abilities`,
      `v12-export-*`), plus the V14 world copy.
- [x] **1.2 — Discover, don't assume. DONE.** The F-table came from reading templates
      and JS; F4 proved that unreliable in both directions. Run the **generic**
      check: for every doc, construct its real model class (model-probe recipe)
      and diff `toObject()` against the stored `system`. **Every path the model
      drops is a finding**, including ones no template mentions (module- and
      macro-written data). This supersedes the hand-built list.
- [x] **1.3 — Classify each dropped path. DONE 2026-07-14.** Criterion applied:
      **declare iff something reads the path for that type** (grep of
      `modules/` + `templates/`). Outcome — every remaining dropped path is a
      deliberate ignore, with the reason recorded:
      - **Declared** (readers confirmed): see Stage 2, all landed.
      - **Derived, recreated by `ItemFFG.prepareData`** → ignoring is correct
        (they only leaked into storage on save): `hardpoints.current` and
        `adjusteditemmodifier` (both assigned inside `prepareData`, verified by
        locating their enclosing method), `renderedDesc`, `enrichedDescription`,
        `enrichedSpecial`, `hasLongDesc`, `doNotSubmit.*`, `isReadOnly`,
        `collection.talentN.*` / `collection.upgradeN.*` (~1,700 of the 2,088).
        **Resolves the "both spellings on disk" alarm**: `adjusteditemmodifer`
        (misspelled) is the *stored* field; `adjusteditemmodifier` (correct) is
        *derived*. Not a data-integrity fork — nothing to decide.
      - **Dead — written, never read**: `skill.useBrawn` (3018 docs; exactly 4
        hits in the tree, all importer writes), `specialization.careerskills`
        (300; importer typo for the declared `careerSkills`, written as `{}`),
        `morality.weakness`/`strength` (no readers).
      - **Importer type-leakage no sheet binds**: `minion.species.*` /
        `minion.general.*` (ffg-minion-sheet.html binds neither),
        `rival.quantity.*` / `rival.unit_wounds.*` (minion fields on a rival),
        `stats.Brawn`/`stats.Willpower` (characteristics written under `stats`),
        `vehicle.itemmodifier`/`itemattachment` (448 each — every reader is
        `ownedItem`/`parentItem`.system.itemattachment, i.e. items, never the
        actor's own), `shipattachment.type`/`rank` (the sheet binds neither; the
        shipattachment case sets a derived `data.modTypeSelected` instead),
        `talent.<id>` (an id-keyed empty string).
- [~] **1.4 — `changed`-path policy.** No coercions surfaced in the audit, but
      it did surface **6 armour documents whose stored `defence.value` is not a
      number** ("Armoured clothing", "Woven reed armour", …) — they throw on
      strict construction. **Pre-existing** (identical before the schema
      changes). Foundry loads documents non-strict with `fallback`, so they
      resolve to `0` + a console warning rather than going invalid; under
      template.json the raw `""` passed through and rendered as blank. Left
      alone: it is a data-cleanup task, not a schema one. Worth a follow-up.

## Stage 2 — Declare the fields + fix the tooling

- [x] **2.1 — F1. DONE.**: `isrestricted: new f.BooleanField({initial:false})` inside
      `BasicTemplate.rarity` ([item-templates.js](../../../modules/data/item-templates.js)).
      Vehicle already declares its own copy.
- [x] **2.2 — F2. DONE.**: `status: new f.StringField({initial:"None"})` on
      [weapon.js](../../../modules/data/models/item/weapon.js),
      [armour.js](../../../modules/data/models/item/armour.js),
      [shipweapon.js](../../../modules/data/models/item/shipweapon.js). Confirm
      `"None"` against `CONFIG.FFG.itemstatus`; check stored values (the live DB
      has real ones) so the default matches reality.
- [x] **2.3 — F3. DONE.**: `medical: new f.SchemaField({uses: new f.NumberField({initial:0})})`
      on `StatsTemplate` **and** rival's inline `stats`
      ([rival.js](../../../modules/data/models/actor/rival.js) — rival does not
      use the shared template).
- [x] **2.4 — F5. DONE.**: on `GeneralTemplate`, add `age`/`build`/`eyes`/`gender`/
      `hair`/`height` as `StringField({initial:""})`, and `motivation1`/
      `motivation2` as freeform `ObjectField()` (nemesis/rival write
      `category`/`type`/`description` under them). **Do not add `notes` or actor
      `motivation`** — measured never-stored (see Dropped).
- [x] **2.5 — F6/F7/F8/F9. DONE.**: `obligationlist` (+`dutylist` only if 1.3 finds it
      stored anywhere) as `ObjectField()` on
      [character.js](../../../modules/data/models/actor/character.js);
      `stats.hyperdrive.backup` NumberField on
      [vehicle.js](../../../modules/data/models/actor/vehicle.js);
      homesteadupgrade → `CoreTemplate` + `price`/`rarity`;
      `isEditing: BooleanField({initial:false})` on the three tree models
      (**stored on 43/43 forcepowers — declare it, keep it**; correct the
      forcepower.js comment calling it transient).
- [x] **2.6 — F10. DONE (code); live run still pending.: fix the migration (independent of all the above).** At
      [swffg-main.js:1546-1561](../../../modules/swffg-main.js) the legacy
      wounds/strain `real_value` transfer has **never worked**: it assigns to
      *initialized* data (`SchemaField.initialize` builds a separate prepared
      object — the write never reaches `_source`) and then updates only
      `real_value: null`. Also `game.actors.forEach(async …)` is fire-and-forget,
      so the runner never awaits it. Rewrite as `for...of` + `await`, **one
      combined update per actor** carrying both the transferred value and the
      clear. Declare `real_value` (`required:false, initial:undefined,
      nullable:true`) so the read works. *No actor currently has `real_value`
      (0/44), so this is future-proofing for ancient worlds, not a live fix —
      test on a doctored copy with a distinctive sentinel (e.g. 7, never 0).*
- [x] **2.7 — Fix the conformance reporter. DONE.** Move the type→class maps into a
      dependency-free `modules/data/models-registry.js` (index.js already
      re-exports the reporter → circular-import risk), have `checkDocument`
      construct the model class from raw `_source` rather than comparing a live
      doc to its own clone, and make it **refuse to run** when models are
      registered unless forced. Port the offline `compare.js`/`model-probe.mjs`
      approach as the reference implementation.
- [x] **2.8 — Prove it offline. DONE.** Re-run the Stage-1 audit with the new schemas
      against copies of: the live world, the V14 world, and every pack.
      Expected: zero dropped paths except those classified *ignore* in 1.3, and
      `changed` only per the 1.4 accepted list.

## Stage 3 — Live verification (V14 + V13)

The system must work on **both**: `system.json` declares `minimum: 13`, the V13
instance is the **daily driver** (world `the-old-republic-dark-amber-shadow`,
played through 2026-07-14) and V13 prunes identically.

- [ ] **3.1** Deploy to the V13 instance (this repo *is* its system folder) and
      to `Portable FVTT 14/Data/systems/starwarsffg` (separate copy, last synced
      2026-07-10 — it is stale and must be re-synced).
- [ ] **3.2** Per-finding checks: F1 restricted flag renders + toggles and
      **persists**; F2 status round-trips and a damaged weapon adds Setback;
      F3 stimpack counter; F5 bio fields render **with their pre-existing values**
      (the strongest proof the data was never lost); F6 Group Manager obligation
      table repopulates; F7 vehicle backup hyperdrive; F8 homesteadupgrade
      description/modifiers/price; F9 stock tree-editor edit mode.
- [ ] **3.3 — Write-path check (the one unmeasured behaviour).** Reads are
      proven broken and the DB proven intact, but whether a *sheet edit* to an
      undeclared path was being silently dropped pre-fix was never confirmed
      (client cleans the diff with `prune`, yet post-cutover **creates** did
      persist these fields — 9/11). Post-fix this is moot; just confirm each
      declared field now saves and survives reload.

## Stage 4 — Follow-ups

- [x] **4.1 — Correct the record. DONE.** In
      [2026-07-04-template-json-to-datamodel-migration.md](2026-07-04-template-json-to-datamodel-migration.md):
      mark the "Full live run: CLEAN across 17,925 documents" claim invalid
      (tautological method — it was right about data safety by luck, not
      measurement), link this plan, and record the offline methodology.
- [ ] **4.2 — Migration-plan Stage 4 is still `[~]`**: talent/species live
      smoke-test (talent round-trip, tree membership, Codex force-tree renders —
      memory `cdx-force-tree-design`).
- [ ] **4.3 — `-=` deletion-key deprecation (V16-proofing).** V14 warns per
      legacy `-=` key (works until V16); fires on user edits, so load-log
      captures missed them. Sites: [actor-helpers.js:67](../../../modules/helpers/actor-helpers.js),
      item-helpers.js:25/82, modifiers.js:769, item-editor.js ×6,
      [actor-sheet-ffg.js:2106](../../../modules/actors/actor-sheet-ffg.js),
      :1628, item-sheet-ffg.js:1141+. Feature-detect
      `foundry.data.operators.ForcedDeletion` on V14, legacy on V13. Not urgent.
- [ ] **4.4 — Close the V14-compat plan's open verify boxes** (it is stamped
      `verified: 14` while these remain): roll visibility 2.10/2.11
      (public/gm/blind/self), owned-weapon hotbar macro, OggDude import with
      obligations + add-duty, wrap-up smoke + push.
- [x] **4.5 — Release note. DONE** (CHANGELOG.md, 2.0.4).** System data is now schema-validated: ad-hoc
      `system.*` paths written by **modules/macros are invisible to the system**
      (though still stored). Point at `attributes` as the sanctioned freeform
      extension bag. Note this is a *visibility* contract change, not data loss.
- [ ] **4.6 — Open questions carried over:** custom `arraySkillList` worlds (new
      actors seed the stock list; Stage-0 TODO in
      [actor-templates.js](../../../modules/data/actor-templates.js) unresolved);
      stock-skill backfill no longer happens on old actors (TypedObjectField
      keeps the stored dict wholesale). Accept + document, or add a one-shot
      reconcile.

## Verification approach

1. **Measure, don't infer.** F4 was rated "Critical — user prose erased" for four
   revisions on the strength of a template binding; the DB showed 0/86 stored,
   before *and* after the cutover. Template markup ≠ persisted data. Every
   finding here carries a raw-DB count.
2. Never trust `_source`-vs-`toObject()` on a registered live document (object vs
   its own clone), and never trust registered-build `_source` to prove DB
   presence (it materializes declared defaults). Read the DB offline.
3. The pre-cutover backup is the baseline for "was this ever stored"; it is
   **valid** here (2026-07-04, sidecar `"pre-14"`, predates the cutover) — but
   validate any such source before trusting it, since this repo *is* the V13
   instance's system folder and V13 prunes identically.
4. Test on **both** V13 and V14 — V13 is the live daily driver.

## Completion contract

Done means: the offline audit (Stage 1) enumerated dropped paths by construction
rather than by hand, with a stored-count justification per path; declared fields
land and the intact data becomes visible on both V13 and V14 (Stage 3, F5 bio
values being the clearest proof); the reporter is probe-based and refuses to run
registered; the F10 migration is rewritten and exercised with a sentinel; the
migration-plan correction note is in place; each Stage-4 item is done or
explicitly deferred with a reason. Report unverified behaviour honestly.

## What changed in rev. 6 (and why revs. 1–5 were wrong)

The first review of this branch concluded — and four rounds of increasingly
detailed review *refined rather than questioned* — that the cutover was
"permanently erasing" data, "destroying data now", requiring an emergency freeze,
forensic snapshots, provenance-classified recovery and restoration manifests.
**All of that rested on one unverified inference**: that because the server's
`_updateDocuments` calls `batchWrite(this._source)`, the pruned `_source` was
what got written. It never checked whether the *server* has the model. It does
not — the system's models are registered by a client-side esmodule the server
never runs. One `compare.js` run against the backup (1655 docs, 1 explainable
diff) would have caught this at any point in the first four revisions.

Retained from rev. 1–5 (still correct): the undeclared-path inventory as a
*read* problem, the tautological-reporter finding, the circular-import fix, the
F9 keep-the-field decision, the F10 loop/initialize bugs, the `changed`-vs-
`dropped` policy split, and the "validate your recovery source" instinct.

Deleted as unnecessary: emergency freeze; damage windows and `modifiedTime`
forensics; recovery-source validation; provenance classes; restoration manifests
and unrecoverable reports; twin audit/smoke environments; the `?ffgRawBoot=1`
flag and migration suppression (superseded by offline reads).

Kept anyway as cheap insurance: the forensic snapshot at
`D:\SW FFG\_forensic-snapshot-2026-07-14` (read-only; world DBs for both
instances + the 22 OggDude packs). Not needed on current evidence — but it cost
minutes and it is the reason the 1655-document comparison could be run at all.
