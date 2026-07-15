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
> ~~`rival.stats.strain.value`/`.min` (708 — rival's inline stats omit `strain`
> per template.json, but real rivals store it)~~ **← WRONG, reverted; see
> below**, `vehicle.itemmodifier` /
> `itemattachment` (448 each), `weapon.hardpoints.current` (329),
> `specialization.careerskills` (300), `shipattachment.type` (210).
> ~~**`weapon.adjusteditemmodifier` (329) is a data-integrity finding in its own
> right**: the schema declares only the *misspelled* `adjusteditemmodifer`
> (preserved deliberately), but 329 documents store the *correctly*-spelled
> variant — i.e. both spellings exist on disk. Decide explicitly; do not
> silently pick one.~~ **← Dissolved in 1.3:** the misspelled one is the
> *stored* field, the correct-spelled one is *derived* in `prepareData`. Not a
> fork; nothing to decide.
>
> **REVERTED — `rival.stats.strain` (2026-07-14).** Declared here on the
> strength of "708 rivals store it" plus `ActorFFG._onCreate` binding the rival
> token's bar2 to `stats.strain`; corrected on the user's rules call ("rivals
> don't have strain"). **Both justifications were bad.** Of the 711 stored
> copies, **684 are `{value: 0, min: 0, max: undefined}`** — an empty shell the
> adversary importer writes, never authored; and a token bar needs a `max` to
> render, so that bar2 was never displaying regardless. Meanwhile rival's inline
> `stats` block differs from the shared `StatsTemplate` in **strain and nothing
> else** — omitting it is the entire reason the block exists — and the rival
> sheet has no strain UI, and `strainOverThreshold` is character/nemesis-only.
> Three signals say no strain; only bar2 said yes, and **minion, in the same
> rules position, correctly has no bar2 at all** (see 4.7).
>
> **Lesson for the classification criterion:** "something reads it" and "it is
> stored" are both necessary and neither is sufficient. A path stored on 711
> documents whose values are 96% empty is *leakage*, and a reader that cannot
> function (bar2 with no max) is not a reader. **Count the values, not the
> documents.**
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
- [x] **1.4 — `changed`-path policy. DONE 2026-07-14 — and the earlier claim
      here was wrong.** This previously read "no coercions surfaced in the
      audit". They never could have: `generic-audit.mjs` reports **dropped**
      paths only and never compared values. Same blind-spot family as the
      tautological reporter — an audit that cannot fail at something is not
      evidence about it. Written and run
      [changed-audit.mjs](artifacts/2026-07-14-datamodel-evidence/changed-audit.mjs)
      (loads each model the way Foundry does — non-strict + `fallback`) over
      16,427 docs. **22 changed paths.** All **accepted**, none widened:

      **(a) Prose trim — 9 paths, 2811 docs.** `HTMLField` trims, so
      `description` / `biography` / `longDesc` / `special.value` lose leading
      whitespace (`"      Please see page 230…"` → `"Please see page 230…"`).
      Insignificant in HTML and ProseMirror normalises it anyway. Accepted.
      Note it *does* mean those docs rewrite their prose field on next save.

      **(b) Type normalisation — 13 paths.** template.json enforced no types,
      so the OggDude importers stored numbers and booleans as strings. Every
      distinct before→after pair was enumerated (`coercion-detail.mjs`), not
      sampled, so nothing lossy could hide behind a representative row:

      - **~1,010 docs — clean string→number, zero information change.**
        `armour.soak.value` (686: `"1"`→`1` ×414, `"2"` ×257, `"3"` ×14,
        `"4"` ×1), `armour.defence.value` (189: `"1"` ×171, `"2"` ×18),
        `forcepower.base_cost` (93: `"10"`/`"15"`/`"20"`/`"5"`/`"0"`),
        `required_force_rating` (90), `criticalinjury.severity` (71),
        `criticaldamage.severity` (39), `signatureability.base_cost` (37: all
        `"30"`→`30`), `character.stats.credits.value` (4, e.g. `"12175"`→
        `12175`), `weapon.ammo.max`/`value` (1 each).
      - **311 docs — string→boolean**: `vehicle.stats.navicomputer.value`
        (`"true"`→`true` ×197, `"false"`→`false` ×114).
      - **3 docs** — `armour.soak.value` `" "`→`0`. Blank soak reading as 0 is
        the intended meaning; accepted.
      - **2 docs** — `character.general.age` / `.build`: **not** a number
        coercion (an earlier note here said so, wrongly) — `StringField` trims
        a trailing space (`"15 випуску "`→`"15 випуску"`). Cosmetic.
      - **6 docs — genuinely lossy**, see 1.5: garbage single characters
        (`"d"`, `","`, `"e"`, `"g"`) → `0`. The only entries where the coerced
        value does not represent the stored one.

      **Accepted, not widened — but the reason differs per path, and the
      earlier blanket claim ("widening would preserve the bug") overstated it:**
      - For the **numbers**, the system already defends itself: item soak /
        defence go through `parseInt` before use
        ([item-ffg.js:486-487](../../../modules/items/item-ffg.js) computing
        `adjusted`, and again at
        [modifiers.js:40/47](../../../modules/helpers/modifiers.js)). So the
        strings were tolerated and the coercion is a **tidy-up, not a fix** —
        it just means the stored type finally matches the declared one.
      - For **`navicomputer`, it is a real fix**: nothing defends that read.
        [codex-vehicle.html:59](../../../templates/actors/codex/codex-vehicle.html)
        does `{{#if data.stats.navicomputer.value}}Yes{{else}}No{{/if}}` and
        `{{checked …}}`, and the **string `"false"` is truthy in JS** — so
        **114 vehicles displayed "Yes" (and a ticked box) for a navicomputer
        they do not have.** Widening to a `StringField` here really would
        preserve the bug.

      **Also disproves a second "verified" claim.** The migration plan's Stage 5
      states forcepower `base_cost`/`required_force_rating` "were already
      numbers — no coercion", from the same tautological `_source`-vs-
      `toObject()` diff. 93 and 90 documents respectively coerce.

- [x] **1.5 — 6 armour records with a non-numeric defence/soak. WON'T FIX
      (decided 2026-07-14).** In `yehors-sw-ffg-shared-data.v12-export-actors`,
      six armour items embedded in adversary actors store a stray character
      where a number belongs — unlike the ~1,010 `"1"`-style strings these
      cannot coerce, so they fall back to `0` and log a warning. Pre-existing
      and identical before any of the schema work; the schema only made them
      visible.

      | armour (item id) | parent actor (actor id) | stored |
      |---|---|---|
      | Armoured clothing `qr2ChUGJW7QhOscB` | Gerk, Houk Supervisor `8DyzOlcxVQ47susL` | `defence.value = ","` |
      | Woven reed armour `BrPz3XyYLYLEFjej` | Mimbanese Resistance Sniper `AHh91U7S5RciAVe4` | `defence.value = "d"` |
      | Custom crimson ISB uniform … `2FlbWgVrKSbRFiR0` | Commander Abyss `UyT2mXEiy0xZI4du` | `soak.value = "g"` |
      | Personal deflector shield `TNxr4AeinM9J4yeD` | CSA Viceprex `gR2gxRMFEapf5fpT` | `defence.value = "d"` |
      | Woven reed armour `MmiXQZISy504KeCA` | Mimbanese Resistance Fighter `h56i3BtvWZot8fi9` | `defence.value = "d"` |
      | Scales `9aPAyqD6dELegntv` | Joopa Worm `mcH6LSe098GaWdXU` | `defence.value = "e"` |

      **Reason for not fixing: we do not know the correct values.** Each record
      has exactly one mangled field with its sibling intact and no description,
      which looks like a stat-block parse artifact — but the *intended* number
      is not recoverable. Cross-referencing every other copy in every pack:
      Personal deflector shield has 8 siblings that agree on `2`; Armoured
      clothing's siblings **disagree** (29× `"1"`, 6× `0`); both Woven reed
      armour copies are themselves the corrupt ones; Scales and the ISB uniform
      are unique. `adjusted` is `0` on all six, so nothing is recoverable there
      either.

      There is also an untested hypothesis that some adversary armour is zeroed
      **on purpose**, the adversary's own `stats.soak`/`stats.defence` being the
      authoritative numbers — in which case the `0` fallback already lands on
      the intended value and a "fix" would be the regression. Flagged as a
      hypothesis, not a finding: nobody has verified it, and it is not a
      prerequisite for the decision. Skipping is justified by the uncertainty
      alone, on a legacy archive pack with no live impact.

      (They surface as "failed" in `changed-audit.mjs` only because the probe
      harness does not shim Foundry's `logger` global that the fallback path
      logs through — they are not fatal in Foundry.)

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
- [x] **4.2 — Migration-plan Stage 4. DONE 2026-07-14** (was the only stage never verified; its prescribed `_source` diff was the tautological one. Verified offline instead: 3318 talents, `trees` all string arrays, 303 non-empty round-trip with 0 failures and `.includes(spec.id)` intact; talent/species drop only derived props. Codex force-tree confirmed by the user.) ~~: talent/species live
      smoke-test (talent round-trip, tree membership, Codex force-tree renders —
      memory `cdx-force-tree-design`).~~
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
- [x] **4.7 — Rival prototype token bar2 pointed at a stat rivals don't have.
      DONE 2026-07-14.** [ActorFFG.create](../../../modules/actors/actor-ffg.js)
      gave the rival prototype token `bar2.attribute = "stats.strain"`, but
      rivals have no strain threshold (no sheet UI, no `strainOverThreshold`,
      and the inline `stats` block exists precisely to omit it). **Minion — same
      rules position — already had `bar1` only**, so this was a copy-paste from
      the `character`/`nemesis` cases directly below. Dropped the `bar2` block;
      rival now matches minion. `prependAdjective` kept.

      Surfaced by the `rival.stats.strain` revert: the empty stored shell had
      been papering over it. Cosmetic either way — a token bar needs a `max` to
      render and rival strain never had one, so nothing displayed before or
      after. **Applies to newly created rivals only**: `create` bails early for
      actors that already have `system` data
      (`if (!(typeof data.system === "undefined")) return super.create(...)`),
      so existing rivals keep the token config baked in at their creation.
      Cleaning those up would need a migration and is not worth it for a bar
      that does not render — explicitly not doing it.

      **NOT TESTED.** Unlike the schema work, this has no offline verification:
      the audit harness constructs DataModels against stored data and never runs
      `ActorFFG.create` (which needs the live Actor class, `game.settings` and
      `super.create`). Evidence is a code read plus lint parity. It wants a live
      check — create a rival, confirm no strain bar.

      **Two things the review of this turned up, both worth knowing:**
      - **"No bar2" is not what omitting `bar2` does.** V14's TokenDocument
        schema defaults `bar2.attribute` to `game.system.secondaryTokenAttribute`.
        So a new rival gets `bar2 = "strain"` from
        [system.json](../../../system.json) — which is **not a real path** (the
        data is at `stats.strain`), so no bar renders. The fix works *because*
        the manifest value is stale, and minion has always relied on the same
        accident. If anyone ever "fixes" `secondaryTokenAttribute` to
        `stats.strain`, a strain bar returns on **both** minion and rival. A
        manifest-proof alternative is `bar2: { attribute: null }` on both.
      - **`primaryTokenAttribute: "wounds"` / `secondaryTokenAttribute: "strain"`
        in system.json are stale** — every actor's data lives at `stats.wounds` /
        `stats.strain`, which is precisely why `1e4bd0db` had to set the bars
        explicitly per type. Stored proof: the actors that got pure manifest
        defaults have `bar1="wounds" bar2="strain"` (1 rival, 1 nemesis) and
        show no bars. Pre-existing; out of scope.
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
