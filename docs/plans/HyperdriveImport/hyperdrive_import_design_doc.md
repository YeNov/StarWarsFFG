# Hyperdrive Generator → Foundry Character Import — Design Doc (v2)

**Status:** Design, post-review + post-sample. Not implemented.
**Author:** Claude (Opus 4.8) — v1 2026-07-26, **v2 2026-07-26**
**System:** `starwarsffg` (Foundry VTT), branch context: `PC-Wizard-UX-Improvements-pass`

**What changed v1 → v2 (see §14 for detail):**
- A **real export** is now committed as a golden fixture:
  [`tests/node/_fixtures/hyperdrive/mandalorian-warrior.json`](../../../tests/node/_fixtures/hyperdrive/mandalorian-warrior.json).
  The §3 schema is **confirmed**, not reverse-engineered.
- **Both original blockers are resolved** (per-spec talent grids; characteristic residual model).
- A **gpt-5.6 review** (see `review-gpt56-high-2026-07-26.md`) reshaped the architecture:
  assemble via a **shared `assembleCharacterSource` extracted under `applyBuild`**, a
  **PC-creator-settings-scoped import index**, **source-authoritative XP**, and **in-place fallback via
  extracted OggDude effect-builders** (not `projectItemSource` alone).

---

## 1. Goal

Import a **Hyperdrive Generator** (https://hyperdrivegenerator.com) character sheet into a Foundry
`starwarsffg` world as a `character` actor.

> Match content to compendium items when we can (reconstruct with full fidelity); fall back to
> building the item **in-place** from the exported data when we can't. Never fail silently on an
> unmatched item — every gap goes into an import report.

## 2. Scope

**In scope (v1):** one character JSON → one `character` actor: characteristics, skills, XP,
credits, species/career/specialization(s), force powers, signature abilities, talents (as tree
nodes), obligations/duties/morality, motivations, backgrounds, and carried
gear/weapons/armour/attachments.

**Out of scope (v1):** vehicles/starfighters (present in the export — `Vehicles[]` — but deferred);
bulk import; round-trip export.

## 3. Source format — CONFIRMED from the golden fixture

Hyperdrive is a client-side React SPA. **Save** (on the Character Sheet tab) serializes the whole
character-state object to one JSON file: `JSON.stringify({ ...k, BoughtTalents, BoughtPowers })`.
**Load** re-parses it. (The separate **Export Local Data** button dumps the homebrew *dataset* as
`LocalData.zip` — not a character.)

The fixture has **48 top-level keys**. Everything referencing content carries an OggDude-style
`Key`, which equals the system's `flags.starwarsffg.ffgimportid` (§4). Key structures:

### 3.1 Identity / progression
- `Name` — string, **may be `""`** (importer must default it).
- `Species` — `{Key, Name, StartingChars:{Brawn…Presence as strings}, StartingAttrs:{WoundThreshold,
  StrainThreshold, Experience}, OptionChoices:{…, Selected}, SelectedSkills:[…], Source, imageUrl}`.
- `Career` — `{Key, Name, CareerSkills:[…], Specializations:[…], Attributes:{ForceRating}, FreeRanks}`.
- `Characteristics` — **final** numbers `{Brawn:3, Agility:4, …}`.
- `Skills` — **array** of `{Key, skill, characteristic, type, value?}`; `value` is the
  purchased/manual rank count and is present only when nonzero. Free ranks are separate.
- `CareerRanks` / `SpecRanks` — the skills that received a **free career / spec rank**.
- `SelectedCareerSkills` / `ExtraCareerSkills` — extra career-skill selections.
- `XP` — **remaining** XP; **can be negative** (overspend is a legal Hyperdrive state — fixture is `-215`).
- `UsedStartingXP` — a partial counter (does not cleanly reconcile; not authoritative).
- `Credits` — number **or `null`** (fixture is `null`; UI showed "Credits: NaN"). Handle null → 0.
- `Dedications` — **`{ characteristicName: [specKey, …] }`** — records each Dedication's chosen
  characteristic and its owning spec. **May contain stale entries** (fixture lists `MARSHAL`, a spec
  the character no longer has) — do NOT trust wholesale; cross-check against purchased DEDI nodes.

### 3.2 Specializations & talents — the tree grid (resolves Blocker 2)
`Specializations[]`, each: `{Key, Name, CareerSkills:[…], TalentRows:[{Cost, Talents:[4 keys],
Directions:[…]}], BoughtTalents:[[bool×4]×rows], Universal?}`.

- `TalentRows[r].Talents[c]` = the content key at grid cell (r,c). Always **4 columns**.
- `BoughtTalents[r][c]` = whether that cell is **purchased**.
- The **top-level flat `BoughtTalents`** (array of `{key,data,count}`) is a *convenience aggregate*
  (its `count` sums a ranked talent across trees). **Use the per-spec 2-D grids, never the flat list.**

### 3.3 Force powers & signature abilities — same grid, offset
`ForcePowers` — `{ POWERKEY: { "0":[bool], "1":[bool…], … "4":[bool…], PaidCosts:{"row-col":cost} } }`.
- Row `"0"` = the **basic power** (owning the item). Rows `"1".."4"` = upgrade cells.
- `PaidCosts` corroborates cells (fixture: Alter `"1-2":10` = row1 col2 = Control: Concealment).
- `MentorBonuses:{POWERKEY:true}` = a free basic power grant.
- `SignatureAbilities` — **empty in the fixture** (structure assumed to mirror force powers; UNVERIFIED — §13).

### 3.4 Equipment — instance-scoped with nested attachments (resolves Blocker 6)
`Weapons[]` / `Armor[]` / `Gear[]`, each carrying:
- a unique **`inventoryID`** (`<Key>_<timestamp>`), so two identical items are distinct;
- `Attachments[]` **nested per instance** (`{Key, Name, BaseMods, AddedMods, Source}`);
- `ModStates` keyed by **`"{inventoryID}-{attachKey}-{modKey}"`** (install/failed state);
- `Qualities[]` (`{Key, Count?, MiscDesc?, FromAttachment?}`), `BaseMods`, `Quantity`, `HPUsed`.
- Cybernetics live in `Gear[]` with `Type:"Cybernetics"` (fixture: Cybernetic Leg, `BaseMods:{Key:"BR",Count:"1"}`).

### 3.5 Derived stats — present, but counter-intuitively named (use as VERIFICATION only)
- `Wounds` = wound **threshold** (fixture 18 = 11 + Brawn 3 + 2×Toughened).
- `Strain` = strain **threshold** (fixture 13 = 10 + Willpower 2 + Grit 1).
- `Soak` (fixture 4), `Defense:{Ranged,Melee}`.
- `WoundThreshold` / `StrainThreshold` / `EncumbranceThreshold` = `0` (unused/current — **ignore**).

### 3.6 Narrative
- `Background` — `{Text (story), Culture:{Name,…}, Force:{Key,Name}, Adventure:{Key,Name}}`.
  ⚠️ **Culture has no `Key`** in the fixture (only `Name`) — culture matching may need name-fallback.
- `Morality` — `{Score, StrengthWeakness:[{Strength:{Key,Name,WeakKey}, Weakness:{Key,Name}}], toggles}`.
- `Obligations[]` / `Duties[]` — `{Name, Key, Starting, Total, Text, XP5, XP10, C1, C2, Source}`.
- `Motivations[]` — `{Motivation:{Key,Name}, SpecificMotivation:{Key,Name}, Text}`.

## 4. The key insight

The system's compendia store the OggDude `Key` as `flags.starwarsffg.ffgimportid` (populated by the
OggDude data importer, `import-helpers.js:2281`). Matching is a direct
**`Hyperdrive Key → ffgimportid`** lookup. The deprecated `characterImport` (`import-helpers.js:1529`)
already proves this linkage (though it targets the dead `.data` schema, so it's a mapping blueprint only).

## 5. Existing infrastructure to reuse

| Piece | File | Role |
|---|---|---|
| `applyBuild` | `modules/char-creator/apply-build.js` | Wizard actor assembler. **Extract a shared `assembleCharacterSource` beneath it** (§6) and use it for both. |
| `toItemData(ref,{learnedKeys,rankGrants,nodeAttributeGrants,materializeTree})` | `modules/char-creator/to-item-data.js` | Shapes a compendium item → embedded actor item; bakes learned tree nodes + free ranks + node attribute grants. |
| `materializeTreePurchases(source, learnedKeys)` | `modules/helpers/item-helpers.js:441` | Flips `islearned` on nodes whose **grid key** ∈ learnedKeys and re-syncs effects. Inject via `build-deps.js` (`makeBuildDependencies`). |
| `applyCharacteristicDeltas(system, deltas)` | `modules/actors/actor-ffg.js:929` | Adds char deltas + Brawn/Willpower derived-stat mirrors. |
| item DataModels + OggDude per-type importers | `modules/data/models/item/*`, `modules/importer/oggdude/importers/*` | **In-place fallback** — extract their pure translators/effect-builders (§8). |
| `findCompendiumEntityByImportId` | `modules/importer/import-helpers.js:235` | Reference for pack scanning (but see §8 — build a dedicated ungated index; this one skips locked packs on its cached path). |
| `SWAImporter` (ApplicationV2 dialog) | `modules/importer/swa-importer.js` | UI template: file drop + progress + log. |
| `SOURCE_DESCRIPTORS` | `modules/char-creator/source-descriptors.js` | Pool taxonomy reference (has **no talent/signature pool** — do not call `loadSource` for those). |

### 5.1 Talents are tree nodes, not items
Purchased talents become **`learnedKeys` on the reconstructed spec/forcepower/signatureability tree
item**, consumed by `materializeTreePurchases`. We do **not** create standalone `talent` items.
(Directly-embedded `talent` items *are* supported by the actor as a degraded fallback —
`actor-ffg.js:428` — but that's a last resort when a tree can't be reconstructed.)

## 6. Architecture

**Final-state importer, assembled through a shared source-builder.** We reproduce the finished
sheet — not a fictional purchase history — but we do **not** hand-roll actor assembly.

1. **Extract `assembleCharacterSource(baseValues, items, accounting)`** from the guts of
   `applyBuild`. The wizard adapter feeds it purchase-derived base values; the Hyperdrive adapter
   feeds it normalized persisted values + accounting overrides. This keeps imported actors identical
   in shape to wizard/native actors and avoids duplicating token defaults, full skill dicts,
   attachment nesting, and equipment rules (review Major 1).
2. **Characteristics & skills use the residual model, not raw finals** (Blocker 1). The actor's base
   holds only what no item supplies; species/dedication/free-rank effects supply the rest, and they
   **add on top of the base**. So:
   - Build the items first (species + career + specs with materialized trees + baked Dedication
     characteristic grants).
   - Construct an **unsaved preview `Actor`**, read its prepared characteristics/skills.
   - Set `base = HyperdriveFinal − preview`. If any base < 0, **report a mismatch** (don't bake it).
3. **Derived stats (Soak/Wounds/Strain/Defence) are verification only** — recompute from
   items+characteristics; compare against the export's `Wounds`/`Strain`/`Soak` and warn on drift.
   (Note: `_calculateDerivedValues`, `actor-ffg.js:612`, only recomputes encumbrance — thresholds
   come from base + item effects, which is exactly why the residual model in (2) is required.)

Rejected: (B) reversing into a wizard *draft* + `applyBuild` unchanged — needs purchase-history
reconstruction and XP reconciliation, and `applyBuild` only special-cases the starting spec, omits
signature abilities, and invents wizard credit semantics. (C) reviving `characterImport` — dead
`.data` schema.

## 7. Talent / tree mapping (the resolved core)

Per specialization, convert its own `BoughtTalents[r][c]` grid → Foundry node keys:

```
learnedKeys(spec) = { `talent${r*4 + c}` : for every BoughtTalents[r][c] === true }
```

Force powers / signature abilities (row 0 = basic power = owning the item; rows 1..4 = upgrades):

```
create the item        when ForcePowers[KEY]["0"][0] === true
learnedKeys(power) = { `upgrade${(r-1)*4 + c}` : for every ForcePowers[KEY][r][c] === true, r ≥ 1 }
```

These formulas mirror the OggDude importer exactly (`specializations.js:123` `talent${i*4+index}`;
`forcepowers.js:146` `upgrade${(i-1)*4+index}`). Consequences:
- **Owning tree is explicit** (per-spec / per-power grids) — no inference.
- **Cross-tree ranked talents work for free**: each occurrence is its own learned node in its own
  spec; the actor aggregates ranks (`actor-ffg.js:394-410`). Fixture proof: `Toughened count:2` =
  one cell in Steel Hand + one in Death Watch.
- **Dedication characteristic choice**: for each purchased DEDI node, look up the owning spec in the
  `Dedications` map to get the characteristic, then pass it as `nodeAttributeGrants` on that node
  (the same `{pcwDedication:{modtype:"Characteristic", mod, value:1}}` shape `apply-build.js:31`
  uses). Ignore `Dedications` entries whose spec isn't imported (handles the stale `MARSHAL`).
  ⚠️ `applyBuild` currently applies `nodeAttributeGrants` only to the *starting* spec — the shared
  assembler must apply them to **every** spec (review Blocker 3).

## 8. Compendium match → in-place fallback

**Resolver.** Build a read-only index from the sources enabled in the PC creator settings. Reuse
`loadSource` for its normal pools so pack configuration, per-user source selection, rarity, and
restricted-item gates stay consistent with character creation. Load the configured talent and
signature-ability packs explicitly because those settings are not represented in
`SOURCE_DESCRIPTORS`. Match by `(itemType, ffgimportid)` and fall back to normalized name for
keyless configured content such as some attachments. Duplicate matches → **report ambiguity**,
don't last-match-win.

**On match** → `toSelectionRef` → `toItemData(ref, {learnedKeys, rankGrants, nodeAttributeGrants})`.

**On miss → in-place.** Build the item source from the export's embedded data, but route it through
**shared pure translators + Active-Effect builders extracted from
`modules/importer/oggdude/importers/*`** — NOT `projectItemSource` alone. `projectItemSource` only
whitelists/clones; it synthesizes no effects, and embedded-on-actor items skip `_onCreateAEs`
(`item-ffg.js:93`), so a stub with `attributes` but no prebuilt `effects` would be **inert**
(grant no characteristics/skills/soak). Tag `flags.starwarsffg.ffgimportid = Key` for later re-link.
Validate every in-place item by constructing a temporary Item/Actor and checking prepared data.

**Fidelity (be honest in the report):**
- **Gear / weapon / armour / attachment → high** — full stats embedded (fixture confirms damage,
  crit, enc, price, rarity, qualities, nested attachments).
- **Species / career / spec / forcepower / signatureability → low** — the export carries the tree
  *grid layout* per spec, but an unmatched tree still lacks the node effect definitions; treat as a
  **user-confirmed partial import** and warn "install the compendium and import again for full fidelity."

**Equipment routing** (fixture-confirmed shapes):
- `Attachments[]` → `system.itemattachment[]`; `Qualities`/`BaseMods`/mods → `system.itemmodifier[]`
  (`item-templates.js:120/135`) — they are **different arrays**.
- Attachment→item ownership is unambiguous via `inventoryID` nesting (no `attachTo` guess needed).
- Generate stable `_id`s for nested snapshots (`build-item-schema.js:337`; item editor needs them,
  `item-editor.js:303`).

## 9. Field mapping (Hyperdrive → actor)

| Hyperdrive | Target | Notes |
|---|---|---|
| `Name` (may be `""`) | `name` | default to "New Character" if empty |
| `Background.Text` | `system.biography` | the story block |
| `Background.Culture/Force/Adventure` | `background` items | Force/Adventure by `Key`; **Culture has no Key → name-fallback** |
| `Characteristics.*` | `system.characteristics.*.value` | **residual** = final − preview (§6.2), not raw |
| `Skills[].value` | `system.skills.*.rank` | direct purchased/manual base; free ranks add from items |
| `Skills` career flags / `CareerRanks` / `SpecRanks` / `SelectedSkills` | career-skill flags + free-rank effects on items | union from career/spec items; add separately from the purchased base |
| `XP` + grants | `system.experience.{total,available}` | derive (§10); preserve negative available + warn |
| `Credits` (may be `null`) | `system.stats.credits.value` | null → 0 |
| `Species.Key` | `species` item | compendium → in-place |
| `Career.Key` (+ `Attributes.ForceRating`) | `career` item | FR comes from the career item → do **not** also write `stats.forcePool.max` |
| `Specializations[]` (+ grids) | `specialization` items w/ `learnedKeys` + Dedication `nodeAttributeGrants` | §7 |
| `ForcePowers` / `SignatureAbilities` | `forcepower` / `signatureability` items w/ `learnedKeys` | §7 |
| `Obligations` / `Duties` / `Morality` | `system.obligationlist` / `dutylist` / `morality` | strength/weakness keys from Morality |
| `Motivations[]` | `motivation` items | compendium → in-place |
| `Weapons`/`Armor`/`Gear` (+ `inventoryID`, `Attachments`, `ModStates`) | `weapon`/`armour`/`gear` items | §8 equipment routing |
| Cybernetics (`Gear` `Type:"Cybernetics"`) | `gear` item | **no `CyberCap`/`CyberCurrent` actor field → carry in an import flag + report** |
| `Notes` (if present) | — | ⚠️ `system.general.notes` is **undeclared** (`actor-templates.js:229/240`) — won't persist; pick a declared home or surface in report |
| `Title`, `Source`, `Modifiers`, `Dedications`(meta) | import flags / report | no clean model home |
| `Wounds`/`Strain`/`Soak`/`Defense` | — (verification) | compare vs recomputed; warn on drift |
| `Vehicles`/`StarFighters` | — (v1 out of scope) | present in fixture; defer |

## 10. XP accounting

No single "total earned" field exists. Derive:
- `total` = `Species.StartingAttrs.Experience` + Σ(Obligation/Duty/Morality XP toggles: `XP5`+`XP10`+`XPC`).
  (Fixture: 105 + (5+10)+(5+10)+5 = **140**.)
- `available` = `total − Σ(spend)`, where spend = purchased talent costs (`TalentRows[r].Cost` per
  purchased cell) + `ForcePowers[*].PaidCosts` + characteristic-purchase costs + extra-spec costs.
  (Fixture: 140 − 355 = **−215**, matching the export's `XP`.)
- Treat the export's `XP` as a **cross-check** on our derived `available`; a mismatch flags a costing bug.
- **Preserve a negative `available` + warn** ("source was N XP over budget"); do not clamp
  (overspend is intentional user data; `experience.available` is a plain number field, `character.js:52`).

## 11. Components

- `modules/importer/hyperdrive/parse.js` — validate + normalize raw JSON → stable internal shape. Pure.
- `modules/importer/hyperdrive/resolve.js` — the ungated `(itemType, ffgimportid)` index + fallback.
- `modules/importer/hyperdrive/to-actor.js` — grid→learnedKeys, Dedication grants, residual base,
  equipment routing; calls the shared `assembleCharacterSource`. Pure, fixture-tested.
- `modules/char-creator/assemble-character-source.js` (or similar) — extracted from `applyBuild`,
  used by both wizard and importer.
- `modules/importer/hyperdrive/importer-app.js` — ApplicationV2 dialog (file drop, progress, report).
- `tests/node/hyperdrive-*.test.mjs` — driven by the golden fixture.

## 12. Phased plan

- **Phase 0 — DONE.** Real export captured + committed as the golden fixture
  (`tests/node/_fixtures/hyperdrive/mandalorian-warrior.json`); §3 schema confirmed; both blockers resolved.
- **Phase 1 — Parser** (`parse.js`) + fixture-driven Node tests; handle `null`/empty/`[]`/stale cases.
- **Phase 2 — Resolver** (`resolve.js`): ungated index + ambiguity reporting.
- **Phase 3 — Shared assembler + actor builder**: extract `assembleCharacterSource`; `to-actor.js`
  with grid mapping + residual/preview; fixture assertions (Brawn 3, Toughened rank 2, learned nodes).
- **Phase 4 — In-place fallback**: extract OggDude translators/effect-builders; live-validate items.
- **Phase 5 — Import dialog** + report UI + menu wiring.
- **Phase 6 — Live verification**: import the fixture (and a second, non-overspent, sig-ability sample)
  into a real world; confirm characteristics, learned tree nodes, equipment attachments, and that
  recomputed thresholds match the export's `Wounds`/`Strain`/`Soak`.

## 13. Open risks / still-unverified

- **Signature abilities** — empty in the fixture; the `upgrade` mapping is *assumed* to match force
  powers. Get one sample before Phase 3 finalizes.
- **In-place tree fidelity** — an unmatched spec/power can't fully reconstruct; partial-import policy
  needs sign-off.
- **Force-power irregular columns** — some upgrade rows have fewer than 4 visible cells; confirm the
  Hyperdrive col index aligns with Foundry's padded 4-wide grid for every real power.
- **Cybernetic characteristic mods** — the fixture's Cybernetic Leg (`BaseMods BR+1`) is **not**
  reflected in `Characteristics.Brawn` and `CyberCurrent:0`; decide whether the item's effect should
  re-apply it (risking a mismatch vs the export final) or be left inert + reported.
- **Culture background** — no `Key`; name-based matching only.

## 14. Decisions (confirmed 2026-07-26)

1. **Vehicles:** characters only for v1. ✅
2. **Existing-actor collision:** on import, if an actor with matching identity exists, **open a
   dialog — Override / Save as copy / Cancel. Never silently override.** ✅
   - The export has **no character-level id** (only `Name`, which may be `""`), so the collision
     check keys on **`Name`** (optionally + species/career). Empty name or no match → create directly.
   - **"Override" = update the existing actor in place** (preserve actor id / ownership / tokens;
     replace embedded items + system), NOT delete-and-recreate.
3. **Trigger:** dedicated "Import Hyperdrive Character" dialog (per-actor). ✅
4. **Negative XP:** preserve + warn (don't clamp). ✅
5. **Cybernetics:** carry in an import flag + report (no actor field); revisit a real field later. ✅
6. **Homebrew / unmatched Keys:** in-place fallback (§8) for v1 — build the item from the export's
   embedded data. Do **not** parse `LocalData.zip` as a lookup source (later enhancement). ✅
