# Hyperdrive Character Import — Implementation Plan (v6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a Hyperdrive Generator character JSON into a Foundry `starwarsffg` world as a `character` actor — matching content to compendia where possible (match-then-fallback for content *and* equipment), building it in-place with real synthesized Active Effects **attached to the items themselves** where not, and never failing silently.

**Architecture:** A pure, fixture-tested `parse → resolve → to-actor` pipeline through the shared `assembleCharacterSource`. Characteristics/skills use a **build-items-only residual model** (equipment mods apply on top as items). Talents/powers → `learnedKeys` tree nodes. **Item modifiers/qualities/attachment-mods live inside their item** (`system.itemmodifier[]` / `system.itemattachment[]`) and their synthesized Active Effects are attached to the **item's** `effects` — reaching the actor only via normal owned-item effect transfer; the importer never materializes a second owner/character-level copy. **XP is derived.** Equipment resolves against the sources enabled in the PC creator settings; **matches** use the compendium snapshot + `overlayInstance`; **misses** are built in-place. A per-actor ApplicationV2 dialog handles Override/Copy/Cancel and a full report.

**Tech Stack:** ES modules; `node:test` + `tests/node/_stub/foundry-stub.mjs`; ApplicationV2; dependency injection (`build-deps.js`).

---

## Review response (round 5)

v5 was graded **READY** (0 Blockers). These 6 Majors are polish; none introduces a Blocker. Everything the reviewer verified as retained (B1 async, species/career/armour inherent effects, build-items-only residual → base Brawn 0, M4/M5/M6/M7, resolver, XP, check-imports gate) is carried forward unchanged.

**Major 1 — attachment-derived double-apply (USER DIRECTIVE, implemented exactly).** The user's rule: *"The modifiers belonging to items should be embedded into the items themselves, not applied to the character — this way double-apply won't happen."* v5 already attaches synthesized effects to the **item's** `source.effects` (owned-item transfer), not a character-level copy — that part stands. The remaining double-apply is the fixture's flattening: the first 12 Defender carries the Combat Tested Discipline boost **both** as a top-level `Qualities` entry with `FromAttachment:true` **and** inside `Attachments[COMBTEST].BaseMods`. **Fix (Task 4.3):** `buildModifierEffects` **excludes `FromAttachment` mods** from owner-level materialization (the attachment is the single source), and a **shared item-wide namer** gives every synthesized effect a unique `attr` name across all builder calls (the real lifecycle finds effects by name — `import-helpers.js:3150`). New full `buildWeaponSource` golden test asserts **exactly one** `{key:"system.skills.Discipline.boost", mode:ADD, value:1}` and all-unique effect names.

**Major 2 — complete `processModsData` reproduction (ACCEPTED, CONFIRMED).** Verified real `processModsData` also handles **keyed skill** modifiers (`import-helpers.js:2771-2776` → `processSkillMod`, `:2591`), and `processDieMod` (`:2666`) supports **`SkillChar`** and **`SkillType`**, not only `SkillKey` (`:2681-2715`). v5's `buildAttachmentEffects` also dropped every keyless `AddedMod` before normalization. **Fix (Tasks 4.3/4.3b):** `normalizeMods` adds the keyed-skill branch (via injected `skillMap`) and `SkillChar`/`SkillType` die-mod branches (via injected `skillMeta`); `buildAttachmentEffects` gates keyless AddedMods on the `-undefined` `ModStates` convention (`${inv}-${att.Key}-undefined`) so installed keyless die modifiers pass. Exact tests per branch.

**Major 3 — ARMINS complete multiset (ACCEPTED).** **Fix (Task 4.3b):** the ARMINS test now projects **all** returned changes to `{key,mode,value}`, sorts them, and `deepEqual`s against the exact **six-entry** multiset (SOAKSET+SOAKADD soak ×2, DEFADD base+installed melee ×2 / ranged ×2). The `failed:[true]` and non-unit-`Count` cases are kept.

**Major 4 — matched-cybernetic preservation tested (ACCEPTED).** **Fix (Tasks 3.8/4.4):** the matched-CYLEGII resolver fake is seeded with its exact Brawn effect and the test asserts it **survives `overlayInstance` unchanged**; a new matched-armour/ARMINS overlay test proves the installed effects are emitted **exactly once**.

**Major 5 — restored regression tests (ACCEPTED).** **Fix (Task 3.8):** re-add v4's three explicit tests — (a) present-but-unmatched-key name-fallback **prevention**, (b) matched-career extra `careerskill` effects, (c) routed Dedication node grants — every restored `prepareFinal` fake returns all six characteristics.

**Major 6 — unmatched equipment in the report (ACCEPTED, CONFIRMED).** Verified v5's equipment miss branch recorded warnings but never `report.unmatched`. **Fix (Task 3.8):** every equipment miss appends `{kind, key: it.Key ?? it.Name}` to `report.unmatched`; the test asserts unmatched armour/gear appear (honors "never fail silently").

**Carried-forward, confirmed-resolved (do not re-litigate):** B1 async; species/career/armour inherent effects; `careerSkillGrants`; build-items-only residual + Brawn drift; M4/M5/M6/M7; resolver; XP; check-imports registration/gate.

---

## Conventions

- **All Node tests:** `npm test`. **One file:** `node --test tests/node/<file>.test.mjs`. **Import gate:** `node tools/check-imports.mjs` (exit 0 = pass).
- Live collaborators injected. Pure modules never import `actors/actor-ffg.js` or construct an `Actor`.
- Node test files begin `import "./_stub/foundry-stub.mjs";` before the module under test.
- Golden fixture: `tests/node/_fixtures/hyperdrive/mandalorian-warrior.json`.
- **Frozen dependency contracts** (identical in fakes and live bindings):
  - `assemble(args) -> { actorData, warnings }`
  - `buildInPlace(kind, entry, options) -> { source, warnings }`
  - `preparePreview(buildItems) -> Promise<{ characteristics, skills }>` *(build items only)*
  - `prepareFinal(actorData) -> Promise<{ characteristics, wounds, strain, soak }>` *(all six characteristics)*
  - `toItemData(ref, options) -> itemSource`
  - `resolve` = `buildImportIndex(entries)` → `{ getByKey(type,key), getByName(type,name), ambiguities }`
  - `skillMap` (SkillKey→display), `skillMeta` (`[{skill, characteristic, type}]`), `itemmodifierIndex` (Key→snapshot), `attachmentIndex` (Key→attachment w/ effects)

---

## File map

**New under `modules/importer/hyperdrive/`:** `parse.js`, `resolve.js`, `to-actor.js`, `effect-builders.js`, `in-place.js`, `importer-app.js`.
**New shared:** `modules/char-creator/assemble-character-source.js` (import-clean; added to COVERED).
**Modified:** `modules/char-creator/apply-build.js`; `tools/check-imports.mjs`; `tests/node/check-imports-rules.test.mjs`; `modules/swffg-main.js`.
**New tests:** `hyperdrive-parse.test.mjs`, `hyperdrive-resolve.test.mjs`, `hyperdrive-grid.test.mjs`, `hyperdrive-xp.test.mjs`, `hyperdrive-to-actor.test.mjs`, `hyperdrive-effects.test.mjs`, `hyperdrive-inplace.test.mjs`, `assemble-character-source.test.mjs`.

---

# Phase 1 — Parser (`parse.js`) — pure-Node-testable *(carried from v5, unchanged)*

### Task 1.1: identity/accounting/species(+startingAttrs)/derived thresholds

**Files:** Create `parse.js`; Test `hyperdrive-parse.test.mjs`.

- [ ] Test + implement (per v5): `name`, `credits` (null/NaN→0), `biography`, `characteristics` (finals), `xp.source=-215`, `derived={wounds:18,strain:13,soak:4}`; `species={key,name,startingChars(all 2),startingXP:105,startingAttrs:{woundThreshold:11,strainThreshold:10},selectedSkills:["Brawl"]}`. Commit `feat(hyperdrive): parse identity + species + derived thresholds`.

### Task 1.2: specializations, force powers, **signature abilities**, skills, career *(carried)*

- [ ] Assert spec grids/costs/universal; `owns`/`paidCosts`; `signatureAbilities = raw.SignatureAbilities ?? []`; skills `value→rank`; `careerRanks`/`specRanks`/`career.careerSkills`/`extraCareerSkills`/`specSkills`. Never read flat `BoughtTalents`/`BoughtPowers`. Commit.

### Task 1.3: equipment, cybernetics, narrative(+descriptions/meta), vehicles, ModStates *(carried)*

- [ ] Keep `Attachments`/`Qualities`/`BaseMods`/`ModStates`/`inventoryID` intact; split cybernetics; normalize obligations/duties (`text`,`xp5`,`xp10`), morality (`score`,`xpc`,`xp10`,`strengthWeakness`), motivations (`text`), background (culture no-key → `name`); carry `notes`/`modifiers`/`title`/`source`/`dedications`/`vehicles`/`raw`. Commit.

### Task 1.4: ruleset inference + null-safety *(carried)*

- [ ] `rules = (raw.Morality || raw.Background?.Force?.Key) ? "fad" : (raw.Duties?.length ? "aor" : "eote")`; `parseHyperdrive({})` never throws. Commit.

---

# Phase 2 — Resolver (`resolve.js`) *(carried from v5, unchanged)*

### Task 2.1: `buildImportIndex` (key + name + ambiguity)

```js
export function normalizeName(name) { return String(name ?? "").replace(/<[^>]*>/g, "").trim().toLowerCase(); }
export function buildImportIndex(entries) {
  const byKey = new Map(), byName = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const e of entries) { if (e.ffgimportid) push(byKey, `${e.itemType} ${e.ffgimportid}`, e); if (e.ref?.name) push(byName, `${e.itemType} ${normalizeName(e.ref.name)}`, e); }
  const ambiguities = [];
  const pick = (m, kind, k, label) => { const l = m.get(`${kind} ${k}`); if (!l?.length) return null; if (l.length > 1) ambiguities.push({ itemType: kind, [label]: k, count: l.length }); return l[0]; };
  return { getByKey: (t, k) => pick(byKey, t, k, "key"), getByName: (t, n) => pick(byName, t, normalizeName(n), "name"), ambiguities };
}
```

- [ ] Test: key match; cross-type keys don't collide; name fallback; duplicate → first wins + ambiguity. Commit.

### Task 2.2: `entriesFromDocs` + `collectImportEntries` *(carried)*

- [ ] Keeps keyless docs (name fallback); consumes only sources enabled through the PC creator's
  configured packs and per-user source selection. Commit.

---

# Phase 3 — Shared assembler + actor builder

## 3A — Extract `assembleCharacterSource` *(carried from v5, unchanged; gate confirmed)*

### Task 3.1 / 3.1a / 3.2

- [ ] **3.1** Move `armorSoakValue`/`equipBestPurchasedArmor` + assembly body out of `apply-build.js:59-188` into an **import-nothing** `assemble-character-source.js` (`assembleCharacterSource({creationDefaults, applyCharacteristicDeltas}, {...}) -> {actorData, warnings}`). Node test asserts name-default, Brawn delta + wounds mirror, skill rank, experience, credits, obligation, highest-soak armour equipped. Commit.
- [ ] **3.1a** `check-imports.mjs COVERED` (`:52`) add `["modules/char-creator/assemble-character-source.js", []]`; append it to `apply-build.js`'s allowlist (`:67-70`); add meta-test to `check-imports-rules.test.mjs`. Run `node --test tests/node/check-imports-rules.test.mjs` + `node tools/check-imports.mjs` (exit 0 after 3.2). Commit.
- [ ] **3.2** Rewire `applyBuild` (identical add-order `:132-185`) → `assembleCharacterSource(...)`. **Regression gate:** `node --test tests/node/apply-build.test.mjs` all pass unchanged; then `attachment-purchases.test.mjs`, `node tools/check-imports.mjs`, `npm test`. Commit.

## 3B — Grid, Dedication, free-rank, XP *(carried from v5, unchanged)*

- [ ] **3.3** `learnedKeysForSpec`/`learnedKeysForPower` → Steel Hand `{talent2,3,7,10,11,14,18}`, Death Watch `{talent0,4,5}`, Conjure `{upgrade0}`, Alter `{upgrade2}`.
- [ ] **3.4** `invertDedications`/`dedicationGrantsForSpec` → stale `MARSHAL` dropped; grant only on learned `talent18`; not-learned → `{}`.
- [ ] **3.5** `rankGrantsForItems` → `{species:["Brawl"], career:["Athletics","Brawl","Cool"], spec:["Brawl","Coordination"]}`; `careerSkillGrantsForItems(p)={career:[]}`.
- [ ] **3.6** `deriveXp` → `{total:140, spent:435, available:-215}` with `{Brawn:1}`; over-budget and reconciliation warnings; unlearned Dedication never undercounts. Commit each.

## 3C — Residual model + async orchestrator

### Task 3.7: Residual deltas + over-grant warnings *(carried from v5, unchanged)*

```js
export function residualCharacteristicDeltas(finals, previewChars) {
  const deltas = {}, warnings = [];
  for (const [ch, final] of Object.entries(finals)) {
    const prepared = Number(previewChars?.[ch]?.value ?? 0), d = final - prepared;
    if (d < 0) warnings.push(`${ch}: export final ${final} below build-item-supplied ${prepared}; not baking negative residual.`);
    deltas[ch] = Math.max(0, d);
  }
  return { deltas, warnings };
}
export function residualSkillDeltas(parsedSkills) {
  const deltas = {}, warnings = [];
  for (const s of parsedSkills ?? []) {
    const purchased = Number(s.rank ?? 0);
    if (purchased < 0) warnings.push(`Skill ${s.skill}: invalid purchased rank ${purchased}; capping at 0.`);
    if (purchased > 0) deltas[s.skill] = purchased;
  }
  return { deltas, warnings };
}
```

- [ ] Test: fixture residual chars `{Brawn:0, Agility:2, Intellect:2, Cunning:1, Willpower:0, Presence:0}`; skill values persist directly as purchased ranks and item effects add the free ranks. Commit.

### Task 3.8: `hyperdriveToActorData` — equipment match-then-fallback + **unmatched-in-report (M6)** + restored regressions (M5) + matched-preservation (M4)

**Files:** Modify `to-actor.js`; extend `hyperdrive-to-actor.test.mjs`.

Same orchestrator as v5, with the **equipment miss branch now recording `report.unmatched`**:

```js
  // EQUIPMENT: resolve FIRST (design §8), separate list (excluded from residual preview)
  const eqOpts = { skillMap: deps.skillMap ?? {}, skillMeta: deps.skillMeta ?? [], itemmodifierIndex: deps.itemmodifierIndex ?? {}, attachmentIndex: deps.attachmentIndex ?? {} };
  for (const [kind, list] of [["weapon", parsed.weapons], ["armour", parsed.armour], ["gear", parsed.gear], ["gear", parsed.cybernetics]])
    for (const it of list ?? []) {
      const match = deps.resolve.getByKey(kind, it.Key);
      if (match) { const source = deps.toItemData(match.ref); overlayInstance(source, it, eqOpts); equipmentItems.push(source); }
      else {
        const { source, warnings } = deps.buildInPlace(kind, it, eqOpts);
        equipmentItems.push(source); report.warnings.push(...warnings);
        report.unmatched.push({ kind, key: it.Key ?? it.Name });   // M6: never fail silently
      }
    }
```

`driftReport` stays defensive (skips missing `prepared` entries). Everything else is unchanged from v5.

- [ ] **Step 1: Failing tests** (all `prepareFinal` fakes return six characteristics via `CHARS`).

```js
import { hyperdriveToActorData, driftReport } from "../../modules/importer/hyperdrive/to-actor.js";
import { assembleCharacterSource } from "../../modules/char-creator/assemble-character-source.js";
import { AE_MODES } from "../../modules/config/ffg-active-effect-modes.js";
// deps31 = deps() from assemble-character-source.test.mjs
const CHARS = (b) => ({ Brawn: { value: b }, Agility: { value: 4 }, Intellect: { value: 4 }, Cunning: { value: 3 }, Willpower: { value: 2 }, Presence: { value: 2 } });

test("matched cybernetic: compendium Brawn effect ROUTED and PRESERVED (M4)", async () => {
  const p = parseHyperdrive(RAW);
  const brawnEffect = { name: "(inherent)", changes: [{ key: "system.characteristics.Brawn.value", mode: AE_MODES.ADD, value: 1 }] };
  const calls = { inplace: [] };
  const deps = {
    resolve: {
      getByKey: (type, key) => {
        if (key === "MARSHAL") return null;
        if (key === "CYLEGII") return { ref: { uuid: "gear:CYLEGII", name: "Cybernetic Leg", type: "gear", snapshot: { type: "gear", system: {}, effects: [brawnEffect] } } };
        return { ref: { uuid: `${type}:${key}`, name: key, type, snapshot: { type, system: { talents: { talent18: { name: "Dedication" } } } } } };
      }, getByName: () => null, ambiguities: [],
    },
    skillMap: {}, skillMeta: [], itemmodifierIndex: {}, attachmentIndex: {},
    toItemData: (ref) => structuredClone(ref.snapshot),                       // preserves compendium effects
    buildInPlace: (kind, e) => { calls.inplace.push(e.Key ?? e.key); return { source: { name: e.Name ?? e.name ?? kind, type: kind }, warnings: [] }; },
    preparePreview: async () => ({ characteristics: CHARS(3), skills: {} }),
    prepareFinal: async () => ({ characteristics: CHARS(4), wounds: 17, strain: 13, soak: 4 }),
    assemble: (args) => assembleCharacterSource(deps31, args),
  };
  const { actorData, report } = await hyperdriveToActorData(p, deps);
  assert.equal(calls.inplace.includes("CYLEGII"), false);                     // routed to compendium, not in-place
  const cyber = actorData.items.find((i) => i.type === "gear" && i.effects);
  assert.deepEqual(cyber.effects[0], brawnEffect);                            // Brawn effect survives overlay unchanged
  assert.deepEqual(report.drift.find((d) => d.stat === "Brawn"), { kind: "characteristic", stat: "Brawn", exported: 3, prepared: 4 });
  assert.deepEqual(report.drift.find((d) => d.stat === "wounds"), { kind: "threshold", stat: "wounds", exported: 18, prepared: 17 });
});

test("unmatched equipment builds in-place AND is reported (M6)", async () => {
  const p = parseHyperdrive(RAW);
  const deps = {
    resolve: { getByKey: (type, key) => (type === "weapon" && key === "12DEFEND") ? { ref: { uuid: "weapon:12DEFEND", name: "12 Defender", type: "weapon", snapshot: { type: "weapon", system: { itemattachment: [] }, effects: [] } } } : null, getByName: () => null, ambiguities: [] },
    skillMap: {}, skillMeta: [], itemmodifierIndex: {}, attachmentIndex: {},
    toItemData: (ref) => structuredClone(ref.snapshot),
    buildInPlace: (kind, e) => ({ source: { name: e.Name ?? e.name ?? kind, type: kind, system: {}, effects: [] }, warnings: [] }),
    preparePreview: async () => ({ characteristics: CHARS(3), skills: {} }),
    prepareFinal: async () => ({ characteristics: CHARS(3), wounds: 18, strain: 13, soak: 4 }),
    assemble: (args) => assembleCharacterSource(deps31, args),
  };
  const { actorData, report } = await hyperdriveToActorData(p, deps);
  assert.equal(actorData.items.find((i) => i.type === "weapon").system.quantity.value, 1);   // matched weapon overlaid
  assert.ok(report.unmatched.some((u) => u.kind === "armour" && u.key === "HC"));             // unmatched armour reported
  assert.ok(report.unmatched.some((u) => u.kind === "gear"));                                 // unmatched gear/cybernetic reported
});

test("present-but-unmatched key → in-place, NOT name-matching (M5-a)", async () => {
  const p = parseHyperdrive({ ...RAW, Species: { ...RAW.Species, Key: "HOMEBREWSP" } });
  let nameLookups = 0;
  const deps = {
    resolve: { getByKey: () => null, getByName: () => { nameLookups++; return { ref: { uuid: "wrong", type: "species", snapshot: {} } }; }, ambiguities: [] },
    skillMap: {}, skillMeta: [], itemmodifierIndex: {}, attachmentIndex: {},
    toItemData: () => ({ type: "x" }),
    buildInPlace: (kind, e) => ({ source: { name: e.Name ?? e.name, type: kind, flags: { starwarsffg: { ffgimportid: e.Key ?? e.key } } }, warnings: [] }),
    preparePreview: async () => ({ characteristics: CHARS(3), skills: {} }),
    prepareFinal: async () => ({ characteristics: CHARS(3), wounds: 18, strain: 13, soak: 4 }),
    assemble: (args) => assembleCharacterSource(deps31, args),
  };
  const { actorData } = await hyperdriveToActorData(p, deps);
  assert.equal(nameLookups, 0);                                                                // key present → getByName never consulted
  assert.ok(actorData.items.some((i) => i.flags?.starwarsffg?.ffgimportid === "HOMEBREWSP"));
});

test("matched career with extra career-skill grants → appended flag effect (M5-b)", async () => {
  const p = parseHyperdrive(RAW); p.extraCareerSkills = ["Deception"];
  const captured = [];
  const deps = {
    resolve: { getByKey: (t, k) => ({ ref: { uuid: `${t}:${k}`, name: k, type: t, snapshot: { type: t, system: {} } } }), getByName: () => null, ambiguities: [] },
    skillMap: {}, skillMeta: [], itemmodifierIndex: {}, attachmentIndex: {},
    toItemData: (ref) => { const s = { name: ref.name, type: ref.type, effects: [] }; captured.push(s); return s; },
    buildInPlace: (kind, e) => ({ source: { name: e.Name ?? e.name ?? kind, type: kind }, warnings: [] }),
    preparePreview: async () => ({ characteristics: CHARS(3), skills: {} }),
    prepareFinal: async () => ({ characteristics: CHARS(3), wounds: 18, strain: 13, soak: 4 }),
    assemble: (args) => assembleCharacterSource(deps31, args),
  };
  await hyperdriveToActorData(p, deps);
  const career = captured.find((s) => s.type === "career");
  assert.deepEqual(career.effects.flatMap((e) => e.changes).find((c) => c.key === "system.skills.Deception.careerskill"), { key: "system.skills.Deception.careerskill", mode: AE_MODES.ADD, value: true });
});

test("Dedication node grants are routed to the owning specialization (M5-c)", async () => {
  const p = parseHyperdrive(RAW);
  const opts = [];
  const deps = {
    resolve: { getByKey: (t, k) => (k === "MARSHAL" ? null : { ref: { uuid: `${t}:${k}`, name: k, type: t, snapshot: { type: t, system: { talents: { talent18: { name: "Dedication" } } } } } }), getByName: () => null, ambiguities: [] },
    skillMap: {}, skillMeta: [], itemmodifierIndex: {}, attachmentIndex: {},
    toItemData: (ref, o) => { opts.push({ uuid: ref.uuid, o }); return { name: ref.name, type: ref.type }; },
    buildInPlace: (kind, e) => ({ source: { name: e.Name ?? e.name ?? kind, type: kind }, warnings: [] }),
    preparePreview: async () => ({ characteristics: CHARS(3), skills: {} }),
    prepareFinal: async () => ({ characteristics: CHARS(3), wounds: 18, strain: 13, soak: 4 }),
    assemble: (args) => assembleCharacterSource(deps31, args),
  };
  await hyperdriveToActorData(p, deps);
  const steel = opts.find((o) => o.uuid === "specialization:STEELHAND");
  assert.deepEqual(steel.o.nodeAttributeGrants.talent18.pcwDedication, { modtype: "Characteristic", mod: "Brawn", value: 1 });
});

test("driftReport defensive when prepared characteristics are missing", () => {
  const parsed = { characteristics: { Brawn: 3, Agility: 4 }, derived: { wounds: 18, strain: 13, soak: 4 } };
  assert.deepEqual(driftReport(parsed, { characteristics: {}, wounds: 18, strain: 13, soak: 4 }), []);
});
```

- [ ] **Step 2–4:** FAIL → implement (equipment miss records `report.unmatched`; otherwise per v5) → PASS; `npm test` + `node tools/check-imports.mjs`. **Step 5: Commit** `feat(hyperdrive): equipment match/fallback + report unmatched + restored regressions`.

---

# Phase 4 — In-place fallback with REAL, item-embedded effect synthesis

### Task 4.1: `buildItemEffects` (inherent + custom-attr, both passes) — no shipattachment *(carried from v5, unchanged)*

**Files:** Create `effect-builders.js`; Test `hyperdrive-effects.test.mjs`.

```js
import ModifierHelpers from "../../helpers/modifiers.js";
import { AE_MODES } from "../../config/ffg-active-effect-modes.js";
export const OG_CHARACTERISTIC = { BR: "Brawn", AG: "Agility", INT: "Intellect", CUN: "Cunning", WIL: "Willpower", PR: "Presence" };
export function explodeChanges(modtype, mod, value) {
  const out = [];
  for (const m of ModifierHelpers.explodeMod(modtype, mod)) { const key = ModifierHelpers.getModKeyPath(m.modType, m.mod); if (key) out.push({ key, mode: AE_MODES.ADD, value }); }
  return out;
}
export function careerSkillFlagEffect(skillKeys, img) {
  const changes = [];
  for (const s of skillKeys ?? []) if (s && s !== "(none)") changes.push(...explodeChanges("Career Skill", s, true));
  return changes.length ? { name: "(career-skills)", img, changes } : null;
}
export function buildItemEffects(itemSource) {
  const type = itemSource.type, sys = itemSource.system ?? {}, img = itemSource.img;
  const effects = []; let changes = [];
  if (type === "species") {
    for (const [attr, a] of Object.entries(sys.attributes ?? {})) { if (attr.startsWith("attr")) continue; changes.push(...explodeChanges(a.modtype, a.mod ?? attr, a.value)); }
    const brawn = Number(sys.attributes?.Brawn?.value ?? 0), will = Number(sys.attributes?.Willpower?.value ?? 0);
    for (const c of changes) { if (c.key === "system.stats.wounds.max") c.value = Number(c.value) + brawn; else if (c.key === "system.stats.strain.max") c.value = Number(c.value) + will; else if (c.key === "system.stats.encumbrance.max") c.value = Number(c.value) + 5; }
  } else if (type === "gear" || type === "weapon") { changes.push(...explodeChanges("Stat", "Encumbrance", Number(sys.encumbrance?.value ?? 0)));
  } else if (type === "armour") { changes.push(...explodeChanges("Stat", "Encumbrance", Number(sys.encumbrance?.value ?? 0)), ...explodeChanges("Stat", "Defence", Number(sys.defence?.value ?? 0)), ...explodeChanges("Stat", "Soak", Number(sys.soak?.value ?? 0)));
  } else if (type === "career") { for (let i = 0; i < 8; i++) changes.push(...(careerSkillFlagEffect([sys.careerSkills?.[`careerSkill${i}`]], img)?.changes ?? []));
  } else if (type === "specialization") { for (let i = 0; i < 5; i++) changes.push(...(careerSkillFlagEffect([sys.careerSkills?.[`careerSkill${i}`]], img)?.changes ?? [])); }
  if (changes.length) effects.push({ name: "(inherent)", img, changes });
  for (const [attr, a] of Object.entries(sys.attributes ?? {})) { if (!attr.startsWith("attr")) continue; const c = explodeChanges(a.modtype, a.mod, a.value); if (c.length) effects.push({ name: attr, img, changes: c }); }
  return effects;
}
```

- [ ] Test (exact `{key,mode,value}`): species Brawn +2 / soak 2 / wounds 13 / strain 12; armour soak 2 / defence.melee 1 / defence.ranged 1; gear encumbrance 2; career flag true; `shipattachment` → `[]`. Commit `feat(hyperdrive): buildItemEffects`.

### Task 4.2: In-place species/career builders *(carried from v5, unchanged)*

**Files:** Create `in-place.js`; Test `hyperdrive-inplace.test.mjs`.

- [ ] `buildSpeciesSource(species,{rankGrants})` (attributes from `startingChars` + `WoundThreshold{mod:"Wounds"}`/`StrainThreshold{mod:"Strain"}`; effects via `buildItemEffects`; append rank-grant skill-rank effects). `buildCareerSource(career,{careerSkillGrants})` (`careerSkills.careerSkillN`; effects via `buildItemEffects` + extra `careerSkillFlagEffect`). Test exact changes: species `characteristics.Brawn.value` +2, `stats.wounds.max` 13, `skills.Brawl.rank` +1; career `skills.Athletics.careerskill` true / `skills.Survival.careerskill` true. Commit.

### Task 4.3: `normalizeMods` + `buildModifierEffects` — **complete `processModsData` (M2)** + **`FromAttachment` exclusion & item-wide unique names (M1)**

**Files:** Modify `effect-builders.js`; Test `hyperdrive-effects.test.mjs`.

Reproduce `processModsData`/`processSkillMod`/`processDieMod`. Own-item mods with `FromAttachment` are **excluded** (the attachment is the single source). A **shared namer** yields item-wide-unique attribute/effect names.

```js
function toModArray(x) { if (!x) return []; if (Array.isArray(x)) return x; if (x.Mod || x.Quality) return toModArray(x.Mod ?? x.Quality); return [x]; }
export function makeNamer() { let n = 0; return () => `attr${n++}`; }
const DIE_MODTYPE = { BoostCount: "Skill Boost", SetbackCount: "Skill Remove Setback", AddSetbackCount: "Skill Setback", AdvantageCount: "Skill Add Advantage", ThreatCount: "Skill Add Threat", SuccessCount: "Skill Add Success", FailureCount: "Skill Add Failure", ForceCount: "Force Boost" };  // == processSkillMod

/** raw mods → { attrKey: {modtype, mod, value} } (== processModsData.output.attributes). */
export function normalizeMods(mods, { itemmodifierIndex = {}, skillMap = {}, skillMeta = [], namer = makeNamer() } = {}) {
  const attributes = {}; const put = (a) => { attributes[namer()] = a; };
  const skillCounts = (mod, skill) => { let matched = false; for (const [ck, modtype] of Object.entries(DIE_MODTYPE)) if (mod[ck] != null) { put({ modtype, mod: skill, value: modtype === "Force Boost" ? true : Number(mod[ck]) }); matched = true; } return matched; };
  for (const m of mods) {
    if (m?.Key && OG_CHARACTERISTIC[m.Key]) put({ modtype: "Characteristic", mod: OG_CHARACTERISTIC[m.Key], value: Number(m.Count ?? 1) });
    else if (m?.Key && itemmodifierIndex[m.Key]) { const count = Number(m.Count ?? 1); for (const a of Object.values(itemmodifierIndex[m.Key].system?.attributes ?? {})) put({ modtype: a.modtype, mod: a.mod, value: Number(a.value) * count }); }
    else if (m?.Key && skillMap[m.Key]) { const skill = skillMap[m.Key]; if (!skillCounts(m, skill) && m.Count != null) put({ modtype: "Skill Rank", mod: skill, value: Number(m.Count) }); }  // M2 keyed skill
    if (m?.DieModifiers) for (const dm of toModArray(m.DieModifiers)) {
      let skills = [];
      if (dm.SkillKey) skills = [skillMap[dm.SkillKey] ?? dm.SkillKey];
      else if (dm.SkillChar) skills = skillMeta.filter((s) => s.characteristic === OG_CHARACTERISTIC[dm.SkillChar]).map((s) => s.skill);   // M2 SkillChar
      else if (dm.SkillType) skills = skillMeta.filter((s) => String(s.type ?? "").toLowerCase() === String(dm.SkillType).toLowerCase()).map((s) => s.skill);  // M2 SkillType
      for (const skill of skills) skillCounts(dm, skill);
    }
  }
  return attributes;
}
export function effectsFromAttributes(attributes) {
  return Object.entries(attributes).map(([name, a]) => ({ name, changes: explodeChanges(a.modtype, a.mod, a.value) })).filter((e) => e.changes.length);
}
export function buildModifierEffects(rawItem, opts = {}) {
  const namer = opts.namer ?? makeNamer();
  const mods = [...toModArray(rawItem.BaseMods), ...toModArray(rawItem.Qualities)].filter((m) => !m?.FromAttachment);   // M1: attachment is the single source
  return effectsFromAttributes(normalizeMods(mods, { ...opts, namer }));
}
```

- [ ] **Step 1: Failing test — CYLEGII, non-unit Count, keyed-skill, SkillChar, SkillType, DieModifiers.**

```js
import { buildModifierEffects, normalizeMods, effectsFromAttributes, makeNamer } from "../../modules/importer/hyperdrive/effect-builders.js";
const flat = (eff) => eff.flatMap((e) => e.changes);
const IDX = { SOAKADD: { system: { attributes: { a: { modtype: "Stat", mod: "Soak", value: 1 } } } } };
const META = [{ skill: "Brawl", characteristic: "Brawn", type: "Combat" }, { skill: "Discipline", characteristic: "Willpower", type: "General" }, { skill: "Melee", characteristic: "Brawn", type: "Combat" }];

test("gear CYLEGII BR → exact Brawn +1, per-attribute name", () => {
  const p = parseHyperdrive(RAW);
  const eff = buildModifierEffects(p.cybernetics[0], { itemmodifierIndex: {} });
  assert.deepEqual(flat(eff).find((c) => c.key === "system.characteristics.Brawn.value"), { key: "system.characteristics.Brawn.value", mode: AE_MODES.ADD, value: 1 });
});
test("non-unit Count multiplies", () => {
  assert.deepEqual(flat(buildModifierEffects({ BaseMods: [{ Key: "SOAKADD", Count: "2" }] }, { itemmodifierIndex: IDX })).find((c) => c.key === "system.stats.soak.value"), { key: "system.stats.soak.value", mode: AE_MODES.ADD, value: 2 });
});
test("keyed skill modifier (M2): Key ∈ skillMap + BoostCount → skill boost", () => {
  const eff = effectsFromAttributes(normalizeMods([{ Key: "DISC", BoostCount: "1" }], { skillMap: { DISC: "Discipline" } }));
  assert.deepEqual(flat(eff), [{ key: "system.skills.Discipline.boost", mode: AE_MODES.ADD, value: 1 }]);
});
test("DieModifiers SkillKey / SkillChar / SkillType (M2)", () => {
  const byKey = flat(effectsFromAttributes(normalizeMods([{ DieModifiers: [{ SkillKey: "DISC", BoostCount: "1" }] }], { skillMap: { DISC: "Discipline" } })));
  assert.deepEqual(byKey, [{ key: "system.skills.Discipline.boost", mode: AE_MODES.ADD, value: 1 }]);
  const byChar = flat(effectsFromAttributes(normalizeMods([{ DieModifiers: [{ SkillChar: "BR", SetbackCount: "1" }] }], { skillMeta: META })));   // all Brawn skills
  assert.deepEqual(byChar.map((c) => c.key).sort(), ["system.skills.Brawl.remsetback", "system.skills.Melee.remsetback"]);
  const byType = flat(effectsFromAttributes(normalizeMods([{ DieModifiers: [{ SkillType: "Combat", BoostCount: "1" }] }], { skillMeta: META })));   // all Combat skills
  assert.deepEqual(byType.map((c) => c.key).sort(), ["system.skills.Brawl.boost", "system.skills.Melee.boost"]);
});
test("shared namer yields unique names across calls (M1)", () => {
  const namer = makeNamer();
  const a = normalizeMods([{ Key: "SOAKADD", Count: "1" }], { itemmodifierIndex: IDX, namer });
  const b = normalizeMods([{ Key: "SOAKADD", Count: "1" }], { itemmodifierIndex: IDX, namer });
  assert.deepEqual([...Object.keys(a), ...Object.keys(b)], ["attr0", "attr1"]);   // does NOT restart at attr0
});
```

*(`system.skills.<skill>.remsetback` / `.boost` come from `getModKeyPath` for `Skill Remove Setback` / `Skill Boost`, `modifiers.js:585-590`.)*

- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat(hyperdrive): complete modifier materializer (keyed skill, SkillChar/Type) + FromAttachment exclusion`.

### Task 4.3b: `buildAttachmentEffects` — keyless-installed (M2) + **complete ARMINS multiset (M3)** + failed/Count + matched dedup

**Files:** Modify `effect-builders.js`; Test `hyperdrive-effects.test.mjs`.

```js
export function buildAttachmentEffects(rawItem, opts = {}) {
  const { attachmentIndex = {}, itemmodifierIndex = {}, skillMap = {}, skillMeta = [] } = opts;
  const namer = opts.namer ?? makeNamer();
  const out = []; const inv = rawItem.inventoryID;
  for (const att of rawItem.Attachments ?? []) {
    if (attachmentIndex[att.Key]?.effects?.length) { out.push(...attachmentIndex[att.Key].effects); continue; }   // matched → copy (dedup: no synth)
    const active = [...toModArray(att.BaseMods)];                                                                  // base always active (incl. keyless DieModifiers)
    for (const m of toModArray(att.AddedMods)) {
      const modKey = m?.Key ?? "undefined";                                                                        // M2: keyless uses the `-undefined` ModStates convention
      const st = rawItem.ModStates?.[`${inv}-${att.Key}-${modKey}`];
      if (st?.installed?.[0] === true && st?.failed?.[0] !== true) active.push(m);                                 // installed && !failed
    }
    out.push(...effectsFromAttributes(normalizeMods(active, { itemmodifierIndex, skillMap, skillMeta, namer })));
  }
  return out;
}
```

- [ ] **Step 1: Failing test — full multiset (deepEqual), keyless installed, failed, Count.**

```js
import { buildAttachmentEffects } from "../../modules/importer/hyperdrive/effect-builders.js";
const project = (eff) => eff.flatMap((e) => e.changes).map((c) => ({ key: c.key, mode: c.mode, value: c.value })).sort((a, b) => (a.key + a.value).localeCompare(b.key + b.value));
const IDX = { SOAKSET: { system: { attributes: { a: { modtype: "Stat", mod: "Soak", value: 1 } } } }, SOAKADD: { system: { attributes: { a: { modtype: "Stat", mod: "Soak", value: 1 } } } }, DEFADD: { system: { attributes: { a: { modtype: "Stat", mod: "Defence", value: 1 } } } } };

test("ARMINS on HC: EXACT six-entry multiset (base + installed) — M3", () => {
  const p = parseHyperdrive(RAW);
  const got = project(buildAttachmentEffects(p.armour[0], { itemmodifierIndex: IDX }));
  assert.deepEqual(got, [
    { key: "system.stats.defence.melee", mode: AE_MODES.ADD, value: 1 },   // DEFADD base
    { key: "system.stats.defence.melee", mode: AE_MODES.ADD, value: 1 },   // DEFADD installed
    { key: "system.stats.defence.ranged", mode: AE_MODES.ADD, value: 1 },
    { key: "system.stats.defence.ranged", mode: AE_MODES.ADD, value: 1 },
    { key: "system.stats.soak.value", mode: AE_MODES.ADD, value: 1 },      // SOAKSET base
    { key: "system.stats.soak.value", mode: AE_MODES.ADD, value: 1 },      // SOAKADD installed
  ]);
});
test("keyless installed DieModifiers pass the `-undefined` ModStates gate (M2)", () => {
  const raw = { inventoryID: "X", Attachments: [{ Key: "A", BaseMods: [], AddedMods: [{ MiscDesc: "boost", DieModifiers: [{ SkillKey: "DISC", BoostCount: "1" }] }] }], ModStates: { "X-A-undefined": { installed: [true], failed: [false] } } };
  assert.deepEqual(buildAttachmentEffects(raw, { skillMap: { DISC: "Discipline" } }).flatMap((e) => e.changes), [{ key: "system.skills.Discipline.boost", mode: AE_MODES.ADD, value: 1 }]);
});
test("failed:[true] AddedMod → no installed effect", () => {
  const raw = { inventoryID: "X", Attachments: [{ Key: "A", BaseMods: [], AddedMods: [{ Key: "DEFADD", Count: "1" }] }], ModStates: { "X-A-DEFADD": { installed: [true], failed: [true] } } };
  assert.deepEqual(buildAttachmentEffects(raw, { itemmodifierIndex: IDX }), []);
});
test("non-unit installed Count multiplies", () => {
  const raw = { inventoryID: "X", Attachments: [{ Key: "A", BaseMods: [], AddedMods: [{ Key: "SOAKADD", Count: "2" }] }], ModStates: { "X-A-SOAKADD": { installed: [true], failed: [false] } } };
  assert.deepEqual(project(buildAttachmentEffects(raw, { itemmodifierIndex: IDX })), [{ key: "system.stats.soak.value", mode: AE_MODES.ADD, value: 2 }]);
});
test("matched attachment preserves its document while export mod state remains authoritative", () => {
  const raw = { inventoryID: "X", Attachments: [{ Key: "COMBTEST", BaseMods: [{ Key: "SOAKADD", Count: "1" }] }], ModStates: {} };
  const attachmentIndex = { COMBTEST: { effects: [{ name: "(pre)", changes: [{ key: "system.skills.Discipline.boost", mode: AE_MODES.ADD, value: 1 }] }] } };
  assert.deepEqual(project(buildAttachmentEffects(raw, { itemmodifierIndex: IDX, attachmentIndex })), [{ key: "system.stats.soak.value", mode: AE_MODES.ADD, value: 1 }]);
});
```

*(Fixture: `HC.inventoryID="HC_1785054992381"`; `ARMINS.BaseMods` has `{Key:"SOAKSET"}`+`{Key:"DEFADD"}`+a keyless MiscDesc; `ARMINS.AddedMods` has `{Key:"SOAKADD"}`+`{Key:"DEFADD"}`+a keyless MiscDesc; `ModStates["…-ARMINS-DEFADD"]` and `-SOAKADD` are installed. The keyless MiscDesc mods have no `Key`/`DieModifiers` → no change; the base keyless is inert; the added keyless is gated on `…-ARMINS-undefined` but also inert — so the multiset is exactly six.)*

- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat(hyperdrive): attachment effects (keyless-installed, full ARMINS multiset, dedup)`.

### Task 4.4: Equipment builders + `overlayInstance` — shared namer, **matched-preservation test (M4)**

**Files:** Modify `in-place.js`; extend `hyperdrive-inplace.test.mjs`.

Each equipment builder threads ONE `makeNamer()` through `buildModifierEffects` + `buildAttachmentEffects` so names are item-wide-unique; `buildItemEffects` supplies the inherent effect.

```js
import { buildItemEffects, buildModifierEffects, buildAttachmentEffects, makeNamer } from "./effect-builders.js";
export function buildWeaponSource(w, opts = {}) {
  const { skillMap = {}, itemmodifierIndex = {} } = opts; const namer = makeNamer(); const eopts = { ...opts, namer };
  const source = { name: w.Name, type: "weapon", flags: { starwarsffg: { ffgimportid: w.Key, inventoryID: w.inventoryID } }, system: {
    skill: { value: skillMap[w.SkillKey] ?? w.SkillKey ?? "" }, damage: { value: Number(w.Damage ?? w.DamageAdd ?? 0) }, crit: { value: Number(w.Crit ?? 0) }, range: { value: w.Range ?? "Engaged" },
    encumbrance: { value: Number(w.Encumbrance ?? 0) }, price: { value: Number(w.Price ?? 0) }, rarity: { value: Number(w.Rarity ?? 0) }, quantity: { value: Number(w.Quantity ?? 1) },
    itemmodifier: buildQualityModifiers(w.Qualities, itemmodifierIndex), itemattachment: (w.Attachments ?? []).map((a) => buildAttachmentSnapshot(a, w, itemmodifierIndex)) } };
  source.effects = [...buildItemEffects(source), ...buildModifierEffects(w, eopts), ...buildAttachmentEffects(w, eopts)];
  return { source, warnings: [] };
}
// buildArmourSource (adds soak/defence) + buildGearSource (basic) — same effect assembly with a shared namer.
export function overlayInstance(source, rawItem, opts = {}) {
  source.system ??= {};
  source.system.quantity = { ...(source.system.quantity ?? {}), value: Number(rawItem.Quantity ?? 1) };
  source.flags = { ...(source.flags ?? {}), starwarsffg: { ...(source.flags?.starwarsffg ?? {}), inventoryID: rawItem.inventoryID } };
  source.system.itemattachment = [...(source.system.itemattachment ?? []), ...(rawItem.Attachments ?? []).map((a) => buildAttachmentSnapshot(a, rawItem, opts.itemmodifierIndex ?? {}))];
  source.effects = [...(source.effects ?? []), ...buildAttachmentEffects(rawItem, opts)];   // preserves existing (compendium) effects
  return source;
}
```

- [ ] **Step 1: Failing test — full 12 Defender (M1), matched preservation (M4), stamped ids.**

```js
import { buildWeaponSource, buildArmourSource, buildGearSource, overlayInstance } from "../../modules/importer/hyperdrive/in-place.js";
import { assignWizardIdentity } from "../../modules/char-creator/build-item-schema.js";
const flat = (src) => src.effects.flatMap((e) => e.changes ?? []);
const IDX = { SOAKSET: { system: { attributes: { a: { modtype: "Stat", mod: "Soak", value: 1 } } } }, SOAKADD: { system: { attributes: { a: { modtype: "Stat", mod: "Soak", value: 1 } } } }, DEFADD: { system: { attributes: { a: { modtype: "Stat", mod: "Defence", value: 1 } } } } };

test("full 12 Defender: EXACTLY one Discipline boost + unique effect names (M1)", () => {
  const p = parseHyperdrive(RAW);
  const w = p.weapons.find((x) => x.inventoryID === "12DEFEND_1785054958137");
  const { source } = buildWeaponSource(w, { skillMap: { DISC: "Discipline" }, itemmodifierIndex: {} });
  const boosts = flat(source).filter((c) => c.key === "system.skills.Discipline.boost" && c.mode === AE_MODES.ADD && c.value === 1);
  assert.equal(boosts.length, 1);                                         // FromAttachment quality excluded; attachment is the single source
  const names = source.effects.map((e) => e.name);
  assert.equal(new Set(names).size, names.length);                        // all-unique effect names
});
test("in-place gear CYLEGII: Brawn +1 (cybernetics policy)", () => {
  const p = parseHyperdrive(RAW);
  const { source } = buildGearSource(p.cybernetics[0], { itemmodifierIndex: {} });
  assert.deepEqual(flat(source).find((c) => c.key === "system.characteristics.Brawn.value"), { key: "system.characteristics.Brawn.value", mode: AE_MODES.ADD, value: 1 });
});
test("matched armour: overlayInstance PRESERVES compendium effects and emits ARMINS once (M4)", async () => {
  const p = parseHyperdrive(RAW);
  const compendiumEffect = { name: "(inherent)", changes: [{ key: "system.stats.soak.value", mode: AE_MODES.ADD, value: 2 }] };
  const matched = { name: "Heavy Clothing", type: "armour", system: { itemattachment: [] }, effects: [compendiumEffect] };
  overlayInstance(matched, p.armour[0], { itemmodifierIndex: IDX });
  assert.ok(matched.effects.some((e) => e === compendiumEffect || (e.name === "(inherent)" && e.changes[0].value === 2)));   // base preserved
  const soak1 = matched.effects.flatMap((e) => e.changes ?? []).filter((c) => c.key === "system.stats.soak.value" && c.value === 1);
  assert.equal(soak1.length, 2);                                          // SOAKSET base + SOAKADD installed — exactly once each
  const def = matched.effects.flatMap((e) => e.changes ?? []).filter((c) => c.key === "system.stats.defence.melee" && c.value === 1);
  assert.equal(def.length, 2);
});
test("overlayInstance stamps nested attachment ids", async () => {
  const p = parseHyperdrive(RAW);
  const w = p.weapons.find((x) => x.inventoryID === "12DEFEND_1785054958137");
  const matched = { name: "12 Defender", type: "weapon", system: { itemattachment: [] }, effects: [] };
  overlayInstance(matched, w, { itemmodifierIndex: {}, skillMap: { DISC: "Discipline" } });
  assert.equal(matched.system.quantity.value, 1);
  assert.equal(matched.flags.starwarsffg.inventoryID, "12DEFEND_1785054958137");
  const actorData = { items: [matched] };
  await assignWizardIdentity(actorData, { userId: "u", commitId: "COMMIT0000000001" });
  assert.match(actorData.items[0].system.itemattachment[0]._id, /^[0-9A-Za-z]{16}$/);
});
```

- [ ] **Step 2–4:** FAIL → implement (`buildQualityModifiers` matches quality Key→snapshot, `Count`→`system.rank`, MiscDesc-only→freeform; `buildAttachmentSnapshot` emits without `_id` + records `ModStates`; `overlayInstance` per above) → PASS. **Step 5: Commit** `feat(hyperdrive): equipment builders (single Discipline boost, unique names) + overlay preservation`.

### Task 4.5: Tree stubs (talents-only) + `buildInPlace` dispatch *(carried from v5, unchanged)*

```js
export function buildStubSource(kind, entry) {
  return { source: { name: entry.Name ?? entry.name ?? kind, type: kind, flags: { starwarsffg: { ffgimportid: entry.Key ?? entry.key } }, system: { description: "" } },
    warnings: [`Unmatched ${kind} '${entry.Name ?? entry.Key ?? kind}' imported as a stub; install the compendium and import again for full fidelity (tree node effects are not in the export).`] };
}
export function buildInPlace(kind, entry, options = {}) {
  switch (kind) {
    case "species": return buildSpeciesSource(entry, options);
    case "career": return buildCareerSource(entry, options);
    case "weapon": return buildWeaponSource(entry, options);
    case "armour": return buildArmourSource(entry, options);
    case "gear": return buildGearSource(entry, options);
    default: return buildStubSource(kind, entry);   // specialization / forcepower / signatureability / motivation / background
  }
}
```

- [ ] Test: stub warning matches `/tree node effects are not in the export/`; `buildInPlace("species", …).source` has a real `system.stats.wounds.max` change; `buildInPlace` never receives `shipattachment`. Commit.

---

# Phase 5 — Import dialog + wiring — **needs-live-Foundry** *(carried from v5, unchanged)*

### Task 5.1: Dialog shell

- [ ] Port `SWAImporter` ApplicationV2 skeleton (`swa-importer.js:1-60`) → `modules/importer/hyperdrive/importer-app.js` + `templates/importer/hyperdrive-importer.html`; register the open control in `modules/swffg-main.js` (confirm `SWAImporter`'s host). Title "Import Hyperdrive Character". **Verify** (manual). Commit.

### Task 5.2: Live pipeline + async preview/final bindings — Blockers 1/6

- [ ] Import `applyCharacteristicDeltas`/`getActorCreationDefaults` as **named exports** from `modules/actors/actor-ffg.js` (`:929`/`:807`). Build live deps: `resolve` from the PC creator's enabled/configured sources; derive `itemmodifierIndex`/`attachmentIndex` by key and normalized name, `skillMap` + `skillMeta` from `CONFIG.FFG` skills; `toItemData` via `makeBuildDependencies(...)`; `assemble` binds explicit `{creationDefaults: getActorCreationDefaults("character"), applyCharacteristicDeltas}`; `preparePreview` (build items only) and `prepareFinal` construct `new CONFIG.Actor.documentClass(...)` (`prepareFinal` returns all six characteristics + wounds/strain/soak); `buildInPlace` = Phase-4 dispatcher. `const { actorData, report } = await hyperdriveToActorData(parsed, deps);`. **Verify** (manual). Commit.

### Task 5.3: Collision (Override/Copy/Cancel) + identity + report UI (incl. drift + unmatched)

- [ ] `commitId = foundry.utils.randomID(16)`. Create/Copy: `assignWizardIdentity` + `Actor.create(actorData, {keepId:true})` (Copy fresh `commitId`). Override: keep existing `_id`; `existing.update({system,flags,img})` + replace embedded Items with stamped ones. Collision keyed on **Name**. Report: **`report.unmatched` (content AND equipment)**, ambiguities, cybernetics, negative-XP + source/derived mismatch, **`report.drift` (characteristics + Wounds/Strain/Soak)**, notes-no-home, vehicles skipped, sig-abilities-empty, over-grant caps. **Verify** (manual): Override preserves `_id`/tokens; report lists unmatched armour/gear (when packs absent), a **Brawn** drift row, a **Wounds** drift row. Commit.

---

# Phase 6 — Live verification — **needs-live-Foundry** *(carried from v5; unchanged intent)*

- [ ] **Import the golden fixture.** No exceptions; report renders.
- [ ] **Preview (build items only):** prepared Brawn 3 (species 2 + Dedication 1); equipment excluded → residual base Brawn 0.
- [ ] **Item-embedded modifiers (M1):** the first 12 Defender's Combat Tested Discipline boost appears **once** on the weapon (not doubled by the `FromAttachment` flattening); the boost lives on the **item's** effects and reaches the actor only via owned-item transfer.
- [ ] **Equipment match-then-fallback:** with the weapon pack present, the `12 Defender`s use the **compendium** base + overlaid instance attachments/`ModStates`; remove the pack → in-place with real effects, and the miss appears in **`report.unmatched` (M6)**.
- [ ] **Matched cybernetic (M4/policy):** with packs present, `CYLEGII` uses the compendium item (carries Brawn +1, not disabled); base Brawn stays 0; report shows a **Brawn drift** row (final prepared 4 vs export 3) — no forced match.
- [ ] **In-place non-inert:** with packs removed, in-place species grants Brawn/Soak/Wounds, career sets `careerskill` flags; installed `ARMINS` `SOAKADD`/`DEFADD` raise soak/defence; Combat Tested Discipline boost present.
- [ ] **Characteristics/trees:** Agility 4 / Intellect 4 / Cunning 3 / Willpower 2 / Presence 2; STEELHAND talent2/3/7/10/11/14/18, DEATHWCOTR talent0/4/5, CONJURE/ALTER upgrade0/upgrade2; Toughened rank 2.
- [ ] **XP:** total 140, available −215 (preserved + warned); report shows spent 355; derived == raw.
- [ ] **Threshold drift (M5/B7):** `report.drift` compares recomputed vs export `Wounds:18`/`Strain:13`/`Soak:4`; **warns** on mismatch — never a gate.
- [ ] **Equipment fidelity:** two distinct `12 Defender`s each with their own `system.itemattachment`; qualities in `system.itemmodifier` with correct ranks; `ModStates` respected (uninstalled/failed inert); nested attachment `_id`s stamped; Heavy Clothing equipped.
- [ ] **Collision:** Override keeps `_id`/tokens; Copy → second actor fresh ids; Cancel aborts.
- [ ] **Second sample (hard gate):** non-overspent character WITH signature abilities, duplicate weapons with different attachments, homebrew unmatched tree.
- [ ] Commit fixes; open the PR against `YeNov/StarWarsFFG`.

---

## Self-review (coverage)

- **Round-5 Majors** all mapped: M1 (`FromAttachment` exclusion + item-wide unique names + full weapon golden test) → Tasks 4.3/4.4; M2 (keyed skill, `SkillChar`/`SkillType`, keyless-installed) → Tasks 4.3/4.3b; M3 (exact six-entry ARMINS multiset via `deepEqual`) → Task 4.3b; M4 (matched-cybernetic/armour preservation tests) → Tasks 3.8/4.4; M5 (restored M3/M4/Dedication regressions, six-char fakes) → Task 3.8; M6 (unmatched equipment in `report.unmatched`) → Task 3.8. ✔
- **All retained content preserved** — Phases 1–2, 3A/3B, 3.7, 4.1/4.2/4.5, 5, 6; B1/M4/M5/M6/M7, resolver, XP, check-imports untouched. ✔
- **User directive (M1) honored exactly:** item modifiers live in the item and its effects reach the actor only through owned-item transfer; the attachment is the single source; no second owner-level copy. ✔
- **No `.effects.length`-only assertions in the modifier paths** — exact `{key,mode,value}` (and full multiset for ARMINS). ✔
- **Import gate:** only `assemble-character-source.js` joins COVERED; hyperdrive modules (incl. `effect-builders.js` → `modifiers.js`) stay out so rule 7 permits it. ✔

---

## Known follow-ups (non-blocking hardening — from round-6 review)

The plan reached `Verdict: READY` (0 Blockers) at v5 and held it at v6. Two localized hardening
items remain; the reviewer confirmed neither requires rework nor blocks implementation. Close them
during the phases noted:

1. **Live `skillMap` / `skillMeta` wiring (Phase 5.2).** The `SkillChar` / `SkillType`
   die-modifier branches are unit-tested via injected metadata. The live binding must build
   `skillMap` from an import-keyed source (skill compendium entries / `CONFIG.temporary.skills`,
   with canonical-name fallback) and `skillMeta` from the selected `CONFIG.FFG.alternateskilllists`
   theme — NOT `CONFIG.FFG.skills` (which lacks import keys + characteristic/type metadata). Add a
   dependency-construction test covering `DISC`, `SkillChar:"BR"`, and `SkillType:"Combat"`.
2. **`overlayInstance` effect-namer (Task 4.4).** `overlayInstance` calls `buildAttachmentEffects`
   with a fresh namer, so a matched source already containing `attr0` could receive a duplicate
   `attr0` (the lifecycle resolves effects by name — import-helpers.js:3150). Seed the namer from
   the names already present in `source.effects` (or skip reserved names). Add an overlay test whose
   matched source already contains `attr0` and assert name uniqueness afterward.

### Importer hardening requirements (reported 2026-07-30)

1. **Null/empty values are non-fatal.** A Hyperdrive export may contain `null`, `{}`, or a
   placeholder array entry for optional content. The importer must continue importing the
   character and add a specific warning to the import report instead of constructing an invalid
   nameless item or rejecting the actor. This is especially important for narrative content such
   as backgrounds, obligations, and duties. Add regression coverage for empty
   `Background.Culture`, `Background.Adventure`, and `Background.Force` objects plus empty
   obligation/duty entries.
2. **Import linked images.** When the character or an embedded Hyperdrive entry supplies an image
   field or image URL, carry it into the corresponding Foundry `img` field. Support remote links
   emitted by Hyperdrive as well as normal Foundry asset paths, with the existing compendium or
   system image as the fallback. Add parser and actor-conversion coverage for character, build-item,
   and equipment image links.
3. **Resolve skill IDs from the export.** Build a fallback map from `Skills[].Key` to
   `Skills[].skill` so equipment still receives canonical Foundry skill names when the live skill
   compendium cache is missing or incomplete. A raw `BRAWL` value must become `Brawl`, never fall
   through to the first weapon-sheet option.
4. **Include earned XP.** Treat `EarnedXP` as additional lifetime XP on top of species starting XP
   and character-creation bonuses. Preserve exported `XP` as available XP and retain the existing
   reconciliation warning when visible purchases do not explain the source-authoritative totals.
5. **Preserve purchased skill ranks.** Hyperdrive stores purchased/manual ranks in
   `Skills[].value` and tracks free ranks separately in species, career, and specialization fields.
   Persist the exported skill value directly on the actor; imported item effects add the free ranks.
6. **Reconcile attachments and qualities from configured sources.** Build the import index only
   from sources enabled in the PC creator settings. Resolve attachments and item modifiers by
   import key, with normalized-name fallback for keyless configured documents. Preserve the matched
   compendium document while applying Hyperdrive's base/installed/failed mod state. Overlay missing
   owner qualities without duplicating attachment-flattened qualities. Treat the configured packs
   as the import catalog boundary, but do not apply purchase-time rarity/restricted gates when
   reconstructing an existing character. Reconcile states onto the matched attachment's existing
   modifier rows so technical export keys do not replace compendium names and descriptions.
