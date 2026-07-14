# template.json → System Data Model Migration — Technical Plan

> **Status: proposal, not started.** No code has been written against this plan.
> This is a distinct effort from the Foundry-version compatibility work in
> [2026-07-04-v14-migration.md](2026-07-04-v14-migration.md) — that plan makes
> the *existing* template.json-based system run on Foundry V14; this plan
> replaces the template.json schema mechanism itself with System Data Models
> (`DataModel`/`TypeDataModel`). They touch overlapping files. **Recommend
> sequencing this after the V14-compat plan lands**, so the two efforts don't
> land conflicting changes to the same sheets/classes at the same time.

**Goal:** Replace [template.json](../../../template.json)'s schema-less type
definitions with per-sub-type `TypeDataModel` classes, gaining field
validation, automatic default backfill on old documents, and computed getters
on `system` — without changing any on-disk data shape or breaking existing
worlds' Active Effects, compendia, or the OggDude importer.

**Non-goals:**
- Not fixing gameplay logic or renaming any field. The migration should be a
  pure schema-mechanism swap; every `system.foo.bar` path an Active Effect,
  macro, or sheet template currently references must resolve to the exact same
  path afterward.
- Not required for V14 compatibility. `template.json` works fine on V13 and
  V14. This is a code-quality/maintainability initiative, not a compat fix.
- Not tackling the remaining pre-existing template.json quirk unless a stage
  specifically calls for it (see Risks): the fully-undocumented inner shape of
  tree "slot" objects (`upgrades`, `talents`).

## Current state (audited 2026-07-04)

- `system.json` declares no `documentTypes`; `template.json` is the sole
  schema source for both `Actor` (6 types) and `Item` (20 types).
- No `TypeDataModel`/`DataModel` subclass, `defineSchema()`, or
  `CONFIG.Actor.dataModels`/`CONFIG.Item.dataModels` registration exists
  anywhere in `modules/`.
- All derived-stat computation is manual, in
  [ActorFFG#prepareDerivedData](../../../modules/actors/actor-ffg.js) and
  [ItemFFG#prepareDerivedData](../../../modules/items/item-ffg.js).
- All structural migrations are manual, in
  [modules/helpers/migration.js](../../../modules/helpers/migration.js).
- Full proposed field-level class structure for every sub-type (mixin-based
  `defineSchema()` drafts for all 6 Actor + 20 Item types) was worked out in
  chat on 2026-07-04 — not yet committed anywhere. Reconstruct from this plan's
  Stage 1 output rather than re-deriving from template.json by hand.

## Architecture

Foundry has no native "template" mixin concept — the replacement is a plain
function that takes a base class and returns a subclass with merged schema,
composed via a small `mix()` helper:

```js
function mix(Base, ...mixins) {
  return mixins.reduce((acc, mixin) => mixin(acc), Base);
}
```

Each of template.json's shared `templates` blocks (`meta_only`, `biography`,
`stats`, `characteristics`, `skills`, `core`, `basic`, `hardpoints`,
`equippable`, `itemattachments`, `qualities`, etc.) becomes one such mixin
function, and each sub-type composes the mixins it currently lists in its
`templates` array plus its own fields.

**Coexistence during migration:** `template.json` and `CONFIG.*.dataModels`
can both be registered at once — Foundry uses the DataModel for any sub-type
that has one, and falls back to template.json defaults for the rest. This is
what makes a type-by-type staged migration possible instead of a single
big-bang rewrite.

**Field-type decisions carried over from the draft:**
- `skills` on every Actor type stays a `TypedObjectField`, not named fields —
  GMs can add custom skills via `CONFIG.FFG`, so the outer key set isn't fixed.
  The *inner* value shape matters too: template.json declares only
  `rank`/`characteristic`/`groupskill`/`careerskill`/`type`/`max`, but the
  system's dice-modifier status effects write seven more per-skill keys via
  Active Effects — `boost`, `setback`, `upgrades`, `success`,
  `upgradeDifficulty`, `difficulty`, `advantage` (see
  [swffg-main.js](../../../modules/swffg-main.js) `allSkillChanges`). So each
  skill value must be a freeform `ObjectField`, or a `SchemaField` that
  declares those seven with numeric `initial: 0` alongside the native keys —
  a strict schema listing only the template.json keys would break every
  skill-modifier effect.
- `characteristics` gets explicit named fields (always exactly Brawn/Agility/
  Intellect/Cunning/Willpower/Presence).
- `attributes` (present on every Actor and Item) stays a plain untyped
  `ObjectField` — it's a freeform bag populated by Active Effects/modifiers,
  not a fixed schema.
- Tree "slot" dictionaries (`upgrades`, `talents` on forcepower/specialization/
  signatureability) stay `TypedObjectField(new ObjectField())` — known keys
  (`upgrade0..15` etc.), unknown inner shape (see Risks).

## Compatibility constraint (read before writing any schema)

Every existing world has Active Effects, macros, and possibly the OggDude
importer's compendium data referencing `system.<path>` strings by exact
dotted path (e.g. `system.stats.wounds.value`, `system.skills.Brawl.rank`).
**A DataModel's field names and nesting must reproduce today's shape exactly**
— this migration is schema-mechanism-only, not a data-shape refactor. Any
stage that would change a path (e.g. renaming a field or flattening a nested
block to "tidy" the schema) must be called out and decided separately, never
silently folded in.

> **CORRECTION (2026-07-14) — "today's shape" is NOT template.json.** Every
> stage below reproduced template.json and treated that as done. It wasn't:
> template.json only ever supplied *defaults*, and merged them onto stored data
> without pruning, so the schemaless system happily persisted paths it never
> declared — and sheets, importers and dice helpers read them. A DataModel that
> matches template.json therefore still drops real, read data. Measured
> examples: `rarity.isrestricted` (written by every OggDude importer, read by
> ~10 sheets), `weapon.status` (drives Setback / too-damaged rolls),
> `shipweapon.skill` (rollItem resolves it; template.json's shipweapon has no
> `skill` block at all), `rival.stats.strain` (the rival token's bar2 binds it;
> template.json's rival has no `strain`).
>
> The right contract is **what the running system persists and reads**, which
> only a raw-data audit reveals — not what template.json declared. See
> [2026-07-14-datamodel-undeclared-paths-fix.md](2026-07-14-datamodel-undeclared-paths-fix.md).
> Dropping such a path does not erase it (the server keeps writing the full
> record) but makes it invisible, which silently kills the behaviour that reads
> it.

## Bulk rewrite tool (pre-migration data verification)

> **BUILT as a report-only reporter (2026-07-09) — but the result below was
> INVALID. See [2026-07-14-datamodel-undeclared-paths-fix.md](2026-07-14-datamodel-undeclared-paths-fix.md).**
>
> ~~**Full live run: CLEAN across 17,925 documents** (world actors/items +
> embedded inventory + unlinked-token deltas + every OggDude compendium pack) —
> 0 dropped/changed, 0 invalid.~~ **Retracted (2026-07-14).** The reporter
> compared `doc._source.system` against `doc.system.toObject()`. With the models
> registered that is an object against its own clone — construction has already
> cleaned `_source`, and `toObject(true)` returns `deepClone(this._source)` — so
> `dropped`/`changed` were empty **by construction**. The run could not have
> reported anything, on any world. The corpus it scanned carries
> `rarity.isrestricted` on essentially every OggDude weapon, a path no schema
> declared; a real diff flags that thousands of times.
>
> Re-running the check properly (construct each model from raw source; offline
> LevelDB read, no Foundry) across **17,696 documents** found **2,088 dropped
> paths**, including data the sheets and dice helpers actually read —
> `weapon.status`, `shipweapon.skill`, `rival.stats.strain`,
> `rarity.isrestricted`. Those are now declared; see the fix plan for the
> full classification (much of the 2,088 is derived junk that *should* drop).
>
> The premise that made this reporter look unnecessary — *"because the
> DataModels reproduce template.json's exact shape, there is nothing to
> conform"* — is the actual root error, and it is upstream of the tool: **the
> schemas were audited against template.json, which was never the real
> contract.** The schemaless system also persisted paths template.json never
> declared, and code read them. Note the reporter's conclusion (that stored data
> is safe) turned out to be *true*, but for an unrelated reason it never
> tested: the Foundry server runs no system JS, resolves no model, and keeps
> writing the full record.
>
> [conformance-report.js](../../../modules/data/conformance-report.js) is now
> probe-based and reports real drops. It still never writes, so the write-back
> half remains unbuilt; the design below is retained for that contingency.

**Purpose.** Before a sub-type's DataModel is registered in
`CONFIG.Actor.dataModels`/`CONFIG.Item.dataModels`, walk every existing
document of that type, re-derive what its `system` data *would* look like
under the new schema, and — only if nothing existing would be lost or
changed — write that derived shape back now. If anything would be lost or
changed, skip the write and log it for a human to look at. Run this once per
type, right before that type's stage in the Staged Plan below flips the
registration switch, so the cutover itself is a data non-event: by the time
the DataModel goes live, every stored document already conforms to it.

**Key implementation insight: no need to register anything to test it.** A
`TypeDataModel` subclass can be constructed directly —
`new WeaponDataModel(rawData, { parent: doc })` — without ever touching
`CONFIG.Item.dataModels`. That instance's `.toObject()` gives you exactly what
Foundry *would* produce if the class were registered, entirely independent of
whether it actually is. That means capture → migrate → verify → save can all
happen in one macro, in one pass, with zero risk to documents that fail
verification (nothing is registered globally, so a bad schema draft can never
affect a live document until you deliberately flip the switch in Stage-plan
code).

**What "identical" has to mean in practice.** A strict deep-equal between old
and new data will never pass — every document will legitimately gain
newly-declared default fields it didn't have before (that's the entire point
of adding a schema). The check that actually matters:
- **No key present in the old data may be missing from the new data** (a
  silent drop — the schema doesn't declare a field the document actually had,
  or mis-named it).
- **No key present in both may have a different value** (the schema coerced
  or defaulted over real data — e.g. a `NumberField` silently replacing an
  out-of-range value, or a field's `initial` overriding a stored value it
  shouldn't have).
- A key present in the *new* data but absent from the *old* data is fine and
  expected (a freshly-declared field getting its default) — log it as
  informational, don't block on it.

**Do not trust `diffObject` to detect drops.** An earlier draft classified
keys via `foundry.utils.diffObject(oldData, newData, {deletionKeys: true})`,
assuming removed keys come back as `"-=fieldName"` markers. That behavior is
version-specific and unverified — `diffObject` primarily reports keys in
`other` that *differ from* `original`, so a key present in `oldData` but
**absent** from `newData` (exactly the silent-drop a schema typo causes) can
slip through and be reported "safe", after which `doc.update(...)` persists the
loss. A false "safe" here means permanent data loss, so the drop check must not
depend on that option. Instead, flatten *both* sides and assert every old leaf
path still exists in new — an explicit, version-independent check (see
`classifyDiff` below).

**Detecting the full target list — "any layer of recursion".** For this
system specifically, the real recursion is only two levels deep, not
open-ended:
1. **Top-level world collections** — `game.actors`, `game.items`.
2. **Embedded items owned by an actor** — `actor.items`, for every world
   actor (this is the "inventory" layer).
3. **Unlinked tokens on scenes** — an unlinked token carries its own
   `TokenDocument#delta` (an `ActorDelta`) that overrides the base actor's
   data independently; every scene's tokens need checking, and an unlinked
   token's delta has its own embedded items too (same shape as #2, one level
   down). **A delta is *sparse* — its `_source.system` holds only the
   overridden paths, not a full actor.** So a delta must never go through the
   same capture→`toObject()`→write-back path as a real document: a full
   `TypeDataModel` backfills every declared default, and writing that back
   would inflate the sparse delta into a full snapshot that overrides
   everything and stops tracking its base actor. For deltas, **validate only** —
   run `classifyDiff` to confirm the new schema drops none of the delta's
   *existing* override paths, then report; do not materialize. Once the base
   actors are migrated and the model is registered, deltas get cleaned on load
   like everything else. (`token.actor` gives the synthetic applied actor if
   you need the resolved shape for a cross-check.)
4. **Compendium packs** — any `Actor`- or `Item`-type pack, plus (for Actor
   packs) the embedded items on each compendium actor — mirrors #1+#2 inside
   a pack instead of the world.

What does **not** need separate traversal: this system's `itemattachment` and
`itemmodifier` arrays (weapon/armour attachments and quality modifiers) are
**plain duplicated-object snapshots stored inside the parent item's own
`system` data** (see [template.json](../../../template.json)'s
`itemattachments`/`qualities` templates — `ArrayField(ObjectField)` in the
proposed schema), not real Foundry embedded Documents with their own `_id`
collection. They migrate automatically as part of migrating whatever item
contains them; they are not a third recursion level.

**Sketch (illustrative — validate constructor options and `pack.configure`
against the live instance before relying on this):**

```js
function classifyDiff(oldData, newData) {
  // Explicit, version-independent classification. Do NOT rely on
  // diffObject/deletionKeys to surface drops (see note above) — flatten both
  // sides and compare leaf-path sets directly.
  const flatOld = foundry.utils.flattenObject(oldData);
  const flatNew = foundry.utils.flattenObject(newData);
  const dropped = [], changed = [], added = [];
  for (const key of Object.keys(flatOld)) {
    if (!(key in flatNew)) { dropped.push(key); continue; }               // old path gone from new
    if (!foundry.utils.objectsEqual(flatOld[key], flatNew[key])) changed.push(key);
  }
  for (const key of Object.keys(flatNew)) {
    if (!(key in flatOld)) added.push(key);                               // freshly-declared default
  }
  return { dropped, changed, added, safe: dropped.length === 0 && changed.length === 0 };
}

async function migrateDocument(doc, DataModelClass) {
  const oldData = foundry.utils.deepClone(doc._source.system);
  let probe;
  try {
    probe = new DataModelClass(foundry.utils.deepClone(oldData), { parent: doc });
  } catch (err) {
    console.error(`[Migration] SKIP ${doc.documentName} "${doc.name}" (${doc.uuid}) — construction threw`, err);
    return { uuid: doc.uuid, ok: false };
  }
  const diff = classifyDiff(oldData, probe.toObject());
  if (!diff.safe) {
    console.warn(`[Migration] SKIP ${doc.documentName} "${doc.name}" (${doc.uuid}, type "${doc.type}")`, diff);
    return { uuid: doc.uuid, ok: false, diff };
  }
  // A sparse ActorDelta is validated (above) but never written back as a full
  // object — probe.toObject() is fully backfilled and would inflate the delta
  // into a total override (see "Unlinked tokens on scenes"). Report only.
  if (doc.documentName === "ActorDelta") {
    return { uuid: doc.uuid, ok: true, deltaValidateOnly: true };
  }
  await doc.update({ system: probe.toObject() });
  return { uuid: doc.uuid, ok: true, added: diff.added };
}

async function collectWorldTargets(docClass, type) {
  const targets = [];
  const collection = docClass === "Actor" ? game.actors : game.items;
  for (const doc of collection) if (doc.type === type) targets.push(doc);
  if (docClass === "Item") {
    for (const actor of game.actors) for (const item of actor.items) if (item.type === type) targets.push(item);
  }
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.delta) continue;
      if (docClass === "Actor" && token.delta.type === type) targets.push(token.delta);
      if (docClass === "Item") for (const item of token.delta.items ?? []) if (item.type === type) targets.push(item);
    }
  }
  return targets;
}

// --- World macro ---
async function runWorldMigration(docClass, type, DataModelClass) {
  const results = [];
  for (const doc of await collectWorldTargets(docClass, type)) {
    results.push(await migrateDocument(doc, DataModelClass));
  }
  const failed = results.filter((r) => !r.ok).length;
  console.warn(`[Migration] World ${docClass}.${type}: ${results.length - failed}/${results.length} saved, ${failed} flagged.`);
  return results;
}

// --- Compendium macro ---
async function runCompendiumMigration(docClass, type, DataModelClass) {
  const results = [];
  for (const pack of game.packs.filter((p) => p.documentName === docClass)) {
    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false }); // unlock for the pass
    try {
      for (const doc of await pack.getDocuments()) {
        if (doc.type === type) results.push(await migrateDocument(doc, DataModelClass));
        if (docClass === "Actor") {
          for (const item of doc.items) if (item.type === type) results.push(await migrateDocument(item, DataModelClass));
        }
      }
    } finally {
      if (wasLocked) await pack.configure({ locked: true }); // restore only if we changed it
    }
  }
  return results;
}
```

**Recommended addition beyond the spec above:** a `dryRun` flag that skips the
`doc.update(...)` call and only reports — run once dry, review the console
output, then run for real. Cheap to add, meaningfully de-risks the first run
against a real world.

**The comparison logic is generic, not per-type.** `classifyDiff`/
`migrateDocument` above take no knowledge of which sub-type they're looking
at — they just structurally compare whatever keys exist in `oldData` vs
`newData`, which only works because field names/paths are required to stay
identical (see Compatibility Constraint). The only per-type input is the
`DataModelClass` argument itself. Do not write a bespoke comparator per
sub-type — call the same function 26 times with a different class.

One caveat: `flattenObject` recurses into plain nested objects (so
`skills.Brawl.rank` surfaces as its own leaf path) but treats **arrays as
opaque values** — `itemattachment`/`itemmodifier` (both arrays) compare as
"whole array same or different," not element-by-element. Still safe (any real
change still blocks the save), just coarser-grained reporting for those two
fields specifically.

## Staged plan

Ordered low-risk/low-coupling → high-risk/high-coupling, so a mistake in a
later stage doesn't block everything landed so far. Each stage is independently
shippable (per the coexistence property above) and should include: schema
class, `documentTypes` + `CONFIG.*.dataModels` registration for just that
type, and a manual sheet smoke-test (open the sheet, edit a field, confirm
save/reload round-trips, confirm any Active Effect targeting that type still
applies).

- [x] **Stage 0 — Infrastructure. DONE (2026-07-09).** Added `mix()` helper +
      base models ([modules/data/mix.js](../../../modules/data/mix.js)), the
      shared `metadata`/`meta_only` field
      ([shared-fields.js](../../../modules/data/shared-fields.js)), all 9 Actor
      mixins ([actor-templates.js](../../../modules/data/actor-templates.js):
      `BiographyTemplate`, `SpeciesRefTemplate`, `CareerRefTemplate`,
      `SpecialisationRefTemplate`, `StatsTemplate`, `CharacteristicsTemplate`,
      `SkillsTemplate`, `AttributesTemplate`, `GeneralTemplate`) and all 6 Item
      mixins ([item-templates.js](../../../modules/data/item-templates.js):
      `CoreTemplate`, `BasicTemplate`, `HardpointsTemplate`,
      `EquippableTemplate`, `ItemAttachmentsTemplate`, `QualitiesTemplate`),
      plus the shared `MetaOnlyTemplate`. `registerSystemDataModels()`
      ([index.js](../../../modules/data/index.js)) is wired into
      [swffg-main.js](../../../modules/swffg-main.js) `init` but registers ZERO
      types — pure scaffolding. Decisions carried over: every legacy inline
      `type`/`label`/`abrev` key is declared (no silent drop); rich-text fields
      (`biography`, `general.features`, item `description`) use `HTMLField`;
      `skills` is a `TypedObjectField` of freeform `ObjectField` defaulting to
      the stock starwars list; `attributes` stays a freeform `ObjectField`. All
      field construction is lazy (inside `defineSchema()`), so with nothing
      registered the system boots identically. Open TODOs left in-code for their
      registration stage: `specialisation.list` element type (Stage 8) and
      new-actor skill defaulting vs. custom `arraySkillList` (Stage 7). ESM
      syntax-checked; **live boot confirmed clean on V14 (2026-07-09) — no
      data-related errors on load.**
- [x] **Stage 1 — Proof of concept on the simplest types. DONE + VERIFIED on
      V14 (2026-07-09).** `HomesteadUpgradeDataModel` (`meta_only`) and
      `AbilityDataModel` (`core`), both no own fields, one file per type under
      [modules/data/models/item/](../../../modules/data/models/item/),
      registered via `CONFIG.Item.dataModels` in
      [index.js](../../../modules/data/index.js#registerSystemDataModels).
      **Coexistence confirmed:** `CONFIG.Item.dataModels` registration alone
      applies the model with template.json still present — `system.json`
      `documentTypes` was NOT needed. Verified live by creating a throwaway item
      of each type: `system.constructor.name` was the DataModel class,
      `toObject()` reproduced the template.json defaults exactly (ability →
      `{description:"", attributes:{}, metadata:{tags:[],sources:[]}}`,
      homesteadupgrade → `{metadata:{tags:[],sources:[]}}`), no
      `DataModelValidationError` on load. NOTE for later stages: registering a
      DataModel does not rewrite stored `_source` on load — it only cleans the
      in-memory view — so on-disk data is safe until an item is edited+saved.
- [x] **Stage 2 — Small leaf Item types. DONE + VERIFIED on V14 (2026-07-09).**
      `CriticalInjuryDataModel`, `CriticalDamageDataModel`,
      `BackgroundDataModel`, `ObligationDataModel`, `MotivationDataModel`,
      `ItemModifierDataModel` — one file per type under
      [modules/data/models/item/](../../../modules/data/models/item/),
      registered in
      [index.js](../../../modules/data/index.js#registerSystemDataModels). Small
      field counts, no dynamic dictionaries. The duplicate `description` on
      background/obligation/motivation is **resolved, not an open decision**
      (see Risks): declared once on the `CoreTemplate` mixin (as `HTMLField`),
      NOT redeclared on these three types — zero shape change, already merges to
      one `system.description` on disk. `type`/`magnitude`/`subtype`/`rank`/
      `min`/`max`/`severity` are top-level `system.*` category/number fields.
      **Refactor landed alongside:** concrete models split one-file-per-type
      under `models/item/` (was a single `item-models.js`). **Verified live:**
      no `DataModelValidationError` on load with real data present (30
      criticalinjury + 19 criticaldamage + background/motivation/3 itemmodifier
      all loaded as their DataModel class, `invalidDocumentIds` empty);
      throwaway-item `toObject()` reproduced template.json defaults exactly for
      all six; sheet edit→save→reload round-trip held.
- [x] **Stage 3 — Equipment items. DONE + VERIFIED on V14 (2026-07-09).**
      `GearDataModel`, `WeaponDataModel`, `ArmourDataModel`,
      `ShipWeaponDataModel`, `ShipAttachmentDataModel`, `ItemAttachmentDataModel`
      under [models/item/](../../../modules/data/models/item/), registered in
      [index.js](../../../modules/data/index.js#registerSystemDataModels).
      `weapon`/`shipweapon` share `damage`/`crit`/`range`/`special` via
      [_combat-fields.js](../../../modules/data/models/item/_combat-fields.js);
      `special.value` is `HTMLField` (rich text). `shipweapon`/`shipattachment`
      carry a top-level `system.label` string as template.json does; weapon has
      `skill`/`ammo`, shipweapon has `firingarc` instead. First stage with heavy
      real-data exposure (weapons/armour), so verified by a **live drop/change
      diff of `_source.system` vs `system.toObject()`** on existing docs.
      **Result:** `invalidDocumentIds` empty, and across all existing equipment
      (6 gear, 3 weapon, 2 armour, 2 shipweapon, 3 itemattachment) every
      `dropped` and `changed` list was empty — no silent field loss, no
      NumberField coercion (stored types were already correct). weapon + armour
      edit→save→reload round-trip held.
- [~] **Stage 4 — Talent and Species. IMPLEMENTED 2026-07-09, pending live
      smoke-test.** `TalentDataModel` + `SpeciesDataModel` under
      [models/item/](../../../modules/data/models/item/), registered in
      [index.js](../../../modules/data/index.js#registerSystemDataModels). Talent
      `trees` = `ArrayField(StringField)` (specialization id strings, confirmed
      from `system.trees.includes(specialization.id)`); `longDesc` = `HTMLField`;
      `activation`/`ranks` are SchemaFields; `isForceTalent`/`isConflictTalent`/
      `tier` top-level. Species `talents`/`abilities`/`species` are freeform
      `ObjectField`s (dynamic id-keyed dicts the importer writes) — nothing
      stripped; `startingXP` a number. Verify via the same `_source` drop/change
      diff plus a round-trip on a talent (check tree membership survives) and the
      Codex force-tree widget still renders (memory `cdx-force-tree-design`).
- [x] **Stage 5 — Tree types with dynamic numbered slots. DONE + VERIFIED on
      V14 (2026-07-09), incl. tree-editor round-trip.**
      `ForcePowerDataModel`,
      `SpecializationDataModel`, `CareerDataModel`, `SignatureAbilityDataModel`
      under [models/item/](../../../modules/data/models/item/).
      **Runtime-shape audit done (unblocks this stage):** dumped a populated
      `forcepower.upgrades.upgrade0` from a live world — inner shape is genuinely
      freeform (hyphenated link keys `links-top-1`/`links-right`, a *string*
      `cost:"5"`, nested `attributes`, assorted booleans/`size`). So slot values
      stay untyped `ObjectField` (drop-proof); numbered containers are
      `TypedObjectField` seeded with the template.json defaults via
      [_tree-fields.js](../../../modules/data/models/item/_tree-fields.js)
      (`slotDictField`/`stringSlotField`/`boolSlotField`). Slots: forcepower
      `upgrade0..15`, signatureability `upgrade0..7`, specialization
      `talent0..19`; dicts: careerSkills (`stringSlotField`, `"(none)"`),
      uplink_nodes (`boolSlotField`), career specializations/signatureabilities
      (freeform). `required_force_rating`/`base_cost` are NumberFields (watch the
      forcepower diff in case costs are string-stored). **Result:** forcepower
      `_source` diff empty `dropped`/`changed` (base_cost/required_force_rating
      were already numbers — no coercion), `invalidDocumentIds` 0; throwaway
      shapes exact for all four (16/20/0/8 slots, careerSkills, uplink_nodes).
      Two findings, both benign: (1) a floating "Item … does not exist" rejection
      during the throwaway create was a create-then-immediately-delete **race in
      the diagnostic snippet** (async `_onCreate` deep-setup + inherent-AE
      creation fire after delete), not a system/DataModel bug; (2)
      `_prepareTalentTrees` returns `{system:{collection: talents}}` (a literal
      `collection` key — pre-existing bug), now stripped by the schema —
      confirmed **no code or template reads `system.collection`**, so stripping
      is safe/cleaner. Tree editor reads `system.upgrades[id]`/`talents[id]` +
      nested `attributes` (freeform-preserved). Tree-editor round-trip on a live
      force power (Ebb/Flow) held — upgrade toggle saved and persisted on reopen.
- [x] **Stage 6 — Actor types, simple first. DONE + data-VERIFIED on V14
      (2026-07-09).** `VehicleDataModel` + `HomesteadDataModel` under a new
      [models/actor/](../../../modules/data/models/actor/) dir, registered in
      `CONFIG.Actor.dataModels` (first Actor-side registration — exercises
      `BaseActorDataModel` + Biography/Attributes/MetaOnly mixins from Stage 0).
      Both use `templates: ["biography", "attributes", "meta_only"]`; homestead
      adds `cost`/`consumables`, vehicle adds its own large inline `stats` block
      (silhouette/speed/shields/hull/systemStrain/… with all legacy inline
      type/label/min/max keys declared), `spaceShip`, `silhouetteImage`. Vehicle
      `stats.crew` is a freeform `ObjectField`. No shared Stats/Characteristics/
      Skills. **Verified live:** `_source` diff on 13 real vehicles came back
      empty `dropped`/`changed` (big stats block + freeform `crew` reproduce
      exactly, no coercion), `invalidDocumentIds` 0, `appliedClass`
      VehicleDataModel. No homesteads in world to diff (schema follows
      template.json). **Sheet fix required + verified:** opening a vehicle sheet
      first threw `Cannot read properties of undefined (reading 'map')` at
      [actor-sheet-ffg.js:362](../../../modules/actors/actor-sheet-ffg.js) —
      `getData` reads `effects` off `this.actor.toObject(false)`, but `effects`
      is derived data attached to `system` in `prepareDerivedData`
      ([actor-ffg.js:316](../../../modules/actors/actor-ffg.js)), not a schema
      field, so a registered DataModel's `toObject()` drops it (template.json's
      plain object retained it). Fixed to read the list off the live
      `this.actor.system.effects` (`?? []` guarded). Shared base `getData`, so it
      also pre-empts the same crash for Stages 7–8. Vehicle sheet then opened,
      threshold display correct (other dropped derived props like
      `stats.*OverThreshold` aren't consumed by the template).
- [x] **Stage 7 — Actor types sharing Stats/Characteristics/Skills. DONE +
      VERIFIED on V14 (2026-07-09).** `MinionDataModel`, `RivalDataModel`,
      `NemesisDataModel` under [models/actor/](../../../modules/data/models/actor/),
      registered in `CONFIG.Actor.dataModels`. minion = Biography+Stats+
      Characteristics+Skills+Attributes+MetaOnly + quantity/unit_wounds; nemesis
      = +SpeciesRef+General (no own fields); rival = SpeciesRef+Characteristics+
      Skills+Attributes+General+MetaOnly + its OWN inline stats (no `strain`, so
      NOT the shared StatsTemplate). Skills stay freeform `TypedObjectField`
      (preserves custom skills + the 7 AE per-skill keys); characteristics is a
      strict SchemaField. **Verified live:** `_source` diff on 108 real
      adversaries (33 minion, 49 rival, 26 nemesis) all empty `dropped`/`changed`,
      `invalidDocumentIds` 0, correct `appliedClass`. **Second derived-data-drop
      crash, fixed generally:** opening a nemesis threw at `_createSkillColumns`
      ([codex-sheets.js:726](../../../modules/actors/codex-sheets.js)) reading
      `data.data.skilltypes.map` — `skilltypes` is derived
      ([actor-ffg.js:259](../../../modules/actors/actor-ffg.js)), dropped by
      DataModel `toObject()`. Rather than patch each reader, `getData` now
      overlays ALL top-level derived props from the live system onto the
      `toObject` copy ([actor-sheet-ffg.js:219](../../../modules/actors/actor-sheet-ffg.js)),
      skipping `effects` (live Documents, handled separately at :362). All three
      sheets then opened. This general overlay also pre-empts Stage 8 (character).
- [x] **Stage 8 — CharacterDataModel. DONE + VERIFIED on V14 (2026-07-09).**
      All 10 shared actor mixins (Biography/SpeciesRef/CareerRef/
      SpecialisationRef/Stats/Characteristics/Skills/Attributes/General/MetaOnly)
      + character-only `encumbrance`/`obligation`/`duty`/`morality`/`conflict`/
      `experience`, in [models/actor/character.js](../../../modules/data/models/actor/character.js).
      Completes all 26 sub-types (20 Item + 6 Actor). Pre-audit for the
      derived-drop pattern: `_prepareCharacterData` sets `talentList` on the
      actor (read live at getData:222, not via toObject) and guards
      obligations/duty on `obligationlist`/`dutylist`; the general getData
      overlay (Stage 7) covers top-level derived system props. `specialisation.list`
      is `ArrayField(StringField)` — vestigial (`[]`, no code reads it).
      **Verified live:** `_source` diff on 11 real characters — empty
      `DROPPED`/`CHANGED`, `invalidDocumentIds` 0, `appliedClass`
      CharacterDataModel; character sheet opens fine (derived overlay carried it).
- [x] **Stage 9 — End state: template.json removed. DONE + VERIFIED on V14
      (2026-07-09).** Deleted `template.json` and moved the sub-type
      declarations into a `documentTypes` block in
      [system.json](../../../system.json) (6 Actor + 20 Item, verified to match
      template.json's `types` arrays exactly — the schema still comes from the
      registered DataModels). Pre-audit: no runtime code reads template.json /
      `game.system.model` / `game.model` (only comments in `modules/data/`);
      `migration.js` is independent of it (its "template" is an HTML
      notification). **Upgrade-path note (answering the transition question):**
      an old template.json-era world loads clean on this build because the
      DataModels reproduce the exact stored shape and interpret old `_source`
      directly — template.json is not a migration intermediary. The only failure
      mode is deleting it *without* `documentTypes` (types go undeclared → all
      docs invalid); done together here, and a system update replaces the folder
      atomically so there's no partial state. **Verified live:** world launched
      clean, `invalidDocumentIds` empty for actors AND items, every world/embedded
      document resolved to its `…DataModel` class, `documentTypes` counts correct
      (base + 6 Actor, base + 20 Item). template.json is now fully retired.

## Verification approach (every stage)

1. Open every sheet for the migrated type(s); confirm all fields render and
   round-trip through save/reload with the same values.
2. Apply an Active Effect targeting a field on the migrated type; confirm it
   still applies (this is the sharpest regression risk — see Compatibility
   Constraint above).
3. For Item types embedded in Actors (weapon, armour, talent, etc.), confirm
   embedded-item update flows still work (`ItemHelpers.itemUpdate` /
   `ActorHelpers.updateActor` render-suppression behavior, per the V2-port
   compat notes in
   [2026-05-31-v2-full-migration.md](2026-05-31-v2-full-migration.md)).
4. Run the OggDude importer end to end for any migrated Actor/Item type.
5. Open one compendium pack entry of the migrated type to confirm compendium
   data (not just world data) still loads.

## Risks / open questions

- **Tree slot inner shape is undocumented.** `upgrades`/`talents` are stored
  as `{}` in template.json — the real shape is written at runtime by
  [item-editor.js](../../../modules/items/item-editor.js) and never declared.
  Stage 5 must capture actual slot data from a live document (e.g.
  `console.log(item.system.upgrades)` on a purchased force power) before
  writing a schema, or risk silently dropping fields DataModel doesn't know
  about.
- **Duplicate `description` field — resolved (audited 2026-07-05).**
  `background`/`obligation`/`motivation` declare `description` twice in
  template.json: once via the `core` template, once in the type body. It's a
  redundant *declaration*, not duplicate *data* — both are the identical `""`,
  so template.json merges them into a single `system.description` and every
  document on disk already has exactly one. All three sheets bind that one path
  (`system.description`); no `.js` reads a second copy. Confirmed a benign
  authoring artifact inherited from upstream — introduced with the three
  narrative types in `4c274207` ("feat(wizard): character creator"), and the
  only 3 of 20 Item types that redeclare a `core` field. **Action (Stage 2):**
  declare `description` once on `CoreTemplate`, don't redeclare it on the type
  (a DataModel schema can't hold two same-named fields anyway). No data
  migration, no path change.
- **`skills` extensibility — two layers.** (1) *Outer keys:* must stay
  `TypedObjectField`, not hardcoded named fields — custom skills added via
  `CONFIG.FFG` would silently fail validation / be stripped if the schema only
  declared the stock skill list. (2) *Inner value:* Active Effects write seven
  per-skill keys absent from template.json — `boost`, `setback`, `upgrades`,
  `success`, `upgradeDifficulty`, `difficulty`, `advantage`
  ([swffg-main.js](../../../modules/swffg-main.js) `allSkillChanges`, one
  change per key per skill). Keep each skill value freeform (`ObjectField`) or
  declare those seven with `initial: 0` next to the native fields, or every
  dice-modifier status effect silently no-ops.
- **Rich-text fields must be `HTMLField`, not `StringField`.** A ProseMirror
  editor audit (`engine="prosemirror"` across `templates/`) finds these HTML
  paths: `system.biography` (all Actor sheets), `system.description` (most Item
  types), `system.longDesc` (shared sources partial), `system.special.value`
  (weapon/shipweapon), and the nested `upgrades.*.description` /
  `talents.*.description` inside tree items. Declare each as
  `foundry.data.fields.HTMLField` (a `StringField` subclass with HTML-safe
  defaults) so stored markup round-trips — a plain `StringField` with its
  default `trim`/`blank` handling can mangle content. The sheets already run
  these through `TextEditor.enrichHTML`, so no new sanitizer is needed; the
  field-type is the gap. *(The reviewer's "manifest `htmlFields`" note is not a
  confirmed V13/V14 manifest key — treat `HTMLField` in the schema as the
  mechanism and verify any manifest-level declaration against the live API
  before adding it.)*
- **Existing-world data migration.** Registering a DataModel makes Foundry
  run `migrateData()`/backfill defaults on read, but this should still be
  smoke-tested against a copy of a real, long-lived world (not just fresh
  test documents) before rollout, since those are most likely to have drifted
  data shapes from years of incremental template.json changes.
- **Sequencing with the V14-compat plan.** Both plans touch actor/item sheet
  code. Recommend finishing
  [2026-07-04-v14-migration.md](2026-07-04-v14-migration.md) first so this
  migration starts from a clean, V14-verified baseline rather than chasing two
  moving targets at once.
- **Branch.** Not yet assigned — `V14-migration` is currently in active use
  for the unrelated V14-compat effort (see
  [2026-07-04-v14-migration.md](2026-07-04-v14-migration.md); ~half its
  checklist had landed as of 2026-07-05, branch HEAD `64eb515e`). That branch
  rebases on `main`, so its commit hashes churn — don't pin to specific ones.
  This work should land on its own branch once started.
