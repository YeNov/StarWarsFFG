# Review — Hyperdrive Import Design Doc

**Reviewer:** gpt-5.6-sol (high reasoning effort) via Codex CLI, read-only against the repo
**Date:** 2026-07-26
**Target:** hyperdrive_import_design_doc.md

**Verified by Claude against source:** BLOCKER 1 confirmed — `_calculateDerivedValues` (actor-ffg.js:612) only recomputes encumbrance, not wounds/strain/soak/defence. BLOCKER 2 confirmed — `materializeTreePurchases` (item-helpers.js:456) matches grid node keys `talent${i*4+index}` / `upgradeN` (specializations.js:123), NOT OggDude content keys.

---

## BLOCKER

1. **The design confuses prepared totals with persisted actor source values, which will double-count characteristics and skills while leaving some thresholds wrong.**

Evidence — `applyBuild` begins with clean creation defaults, stores only purchased characteristic/skill deltas in the actor source, and lets species, free ranks, and learned-tree effects supply the rest ([apply-build.js:84](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/apply-build.js:84>), [apply-build.js:96](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/apply-build.js:96>), [apply-build.js:139](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/apply-build.js:139>)). Matched compendium items retain their Active Effects through `toItemData` and `projectItemSource` ([to-item-data.js:84](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/to-item-data.js:84>), [build-item-schema.js:104](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/build-item-schema.js:104>)). Species effects include starting characteristics and thresholds; Brawn modifiers also expand into soak and encumbrance ([import-helpers.js:3071](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/importer/import-helpers.js:3071>), [modifiers.js:502](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/helpers/modifiers.js:502>)).

Therefore, writing Hyperdrive’s final Brawn and then embedding a species with its normal effects adds starting Brawn again. Writing final skill ranks and also baking species/career/spec free-rank effects similarly adds ranks twice.

The claimed automatic recomputation is also false. `prepareDerivedData` does not reconstruct wounds, strain, soak, or defence from final characteristics; `_calculateDerivedValues` only recomputes current encumbrance ([actor-ffg.js:183](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/actors/actor-ffg.js:183>), [actor-ffg.js:612](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/actors/actor-ffg.js:612>)). Purchased Brawn’s wound/soak/encumbrance source deltas are explicitly added by `applyCharacteristicDeltas` ([actor-ffg.js:929](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/actors/actor-ffg.js:929>)).

Fix — Redefine “final-state importer” to mean “produce the correct persisted source plus embedded effects,” not “copy prepared totals.” Normalize each characteristic and skill into:

- persisted/base contribution;
- species/career/spec/free-rank contribution;
- learned-node/Dedication contribution.

Then construct an unsaved Actor and compare its prepared totals against Hyperdrive’s exported totals. Differences should be reported, not silently baked into both layers.

2. **`BoughtTalents[].Key` and `BoughtPowers[].Key` are not valid `learnedKeys`; the materializer requires exact tree-node keys scoped to an owning tree.**

Evidence — `materializeTreePurchases` compares `learnedKeys` directly against keys such as `talent0` or `upgrade3`, then overwrites every node’s `islearned` state ([item-helpers.js:441](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/helpers/item-helpers.js:441>), [item-helpers.js:456](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/helpers/item-helpers.js:456>)). OggDude specialization import creates `talent${row*4+column}` node keys independently from the talent’s OggDude content key ([specializations.js:80](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/importer/oggdude/importers/specializations.js:80>), [specializations.js:123](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/importer/oggdude/importers/specializations.js:123>)). Force-power and signature-ability nodes similarly become `upgradeN` ([forcepowers.js:146](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/importer/oggdude/importers/forcepowers.js:146>), [signature-abilities.js:133](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/importer/oggdude/importers/signature-abilities.js:133>)).

The design simultaneously says `BoughtTalents[].Key` is an OggDude talent key and proposes passing it as a node key. Those are different identifiers. For force and signature upgrades, the imported Foundry node does not even retain the original ability key, only name/description/cost, so reliable reverse lookup from ability key may be impossible.

Fix — Phase 0 must prove that each purchase can yield `{owningTreeKey, nodeKey}` or equivalent row/column coordinates. Prefer purchased state nested under each `Specializations`, `ForcePowers`, and `SignatureAbilities` entry. If only flat content keys exist, require an explicit, ambiguity-detecting conversion; never guess ownership.

3. **A flat purchase list is insufficient for Dedication choices, ranked duplicates, and cross-tree occurrences.**

Evidence — Dedication is represented by a characteristic-specific attribute injected into the exact purchased node before materialization ([apply-build.js:31](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/apply-build.js:31>), [to-item-data.js:51](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/to-item-data.js:51>)). `learnedKeys` alone cannot express that characteristic choice.

Ranked talents are counted by learning each concrete occurrence. Actor preparation aggregates same-named ranked nodes across specializations ([actor-ffg.js:394](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/actors/actor-ffg.js:394>), [actor-ffg.js:410](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/actors/actor-ffg.js:410>)). A content key appearing twice in one tree or across multiple trees cannot identify which occurrences are learned. Force-power and signature-ability trees both use `upgradeN`, so node keys are meaningful only with their owning item.

The current `applyBuild` also handles Dedication choices only on the selected starting specialization; extra specializations receive `learnedKeys` but no `nodeAttributeGrants` ([apply-build.js:145](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/apply-build.js:145>), [apply-build.js:156](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/apply-build.js:156>)).

Fix — Normalize purchases as per-tree node records, for example `{treeType, treeKey, nodeKey, characteristicChoice}`. Preserve duplicate occurrences. Extend the common materialization path so every specialization—not only the starting one—can receive per-node attribute grants.

4. **The in-place fallback path will create semantically inert items because DataModels and `projectItemSource` do not synthesize required Active Effects.**

Evidence — `projectItemSource` merely whitelists and deep-clones `name/type/img/system/effects/flags`; it performs no validation, normalization, or effect generation ([build-item-schema.js:94](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/build-item-schema.js:94>)). The OggDude import pipeline creates a temporary document and then explicitly runs effect synchronization after importing it ([import-helpers.js:2324](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/importer/import-helpers.js:2324>), [import-helpers.js:2340](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/importer/import-helpers.js:2340>)).

Embedded items created as part of an Actor normally skip `_onCreateAEs` because `options.parent` is true ([item-ffg.js:93](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/items/item-ffg.js:93>)). Consequently, a fallback species/career/specialization containing attributes but no prebuilt effects will not grant characteristics, skills, career flags, or modifiers. A tree stub with no grid also has nowhere to represent learned nodes.

Fix — Do not call the current OggDude `Import` methods directly; they are XML/zip/UI/compendium-writing orchestration ([weapons.js:16](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/importer/oggdude/importers/weapons.js:16>)). Extract shared pure translators and effect-source builders from those importers, then use them for both OggDude and Hyperdrive. Validate the final item through a temporary Item/Actor construction and a live prepared-data test. Unmatched tree items should be a user-confirmed partial import unless enough data exists to build the actual grid.

## MAJOR

1. **Rejecting the entire wizard pipeline is too broad, although routing through the current `applyBuild` unchanged is also wrong.**

Evidence — `applyBuild` owns important native semantics: clean actor defaults and token data, purchased-vs-effect separation, full skill dictionaries, free-rank effects, attachment nesting, and equipment handling ([apply-build.js:84](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/apply-build.js:84>), [apply-build.js:104](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/apply-build.js:104>), [apply-build.js:167](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/apply-build.js:167>)). Duplicating those rules in `to-actor.js` invites divergence from wizard/native-sheet actors.

But current `applyBuild` is not a complete Hyperdrive target: it assumes purchase-history arrays, handles only one selected specialization specially, omits signature abilities, invents wizard credit semantics, and lacks arbitrary fallback item support.

Fix — Extract a lower-level shared `assembleCharacterSource` used by both `applyBuild` and Hyperdrive. The wizard adapter supplies purchase-history-derived base values; Hyperdrive supplies normalized persisted values and accounting overrides. Reuse unsaved-Actor preview and item identity/projection helpers. Generalize commit normalization if used: its current XP log and `pcWizardCommit` stamp explicitly describe character creation, not an external import ([commit-normalize.js:71](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/commit-normalize.js:71>)).

2. **XP must be source-authoritative, but the proposed `EarnedXP → total` mapping is not justified.**

Evidence — The actor model stores only `experience.total` and `available`; it derives neither ([character.js:52](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/data/models/actor/character.js:52>)). Wizard total means species starting XP plus bonus/extra grants, while available subtracts priced purchases ([calculators.js:22](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/calculators.js:22>)). The design inventory lists `XP` and `EarnedXP` but does not identify an actual “used XP” key or establish whether `EarnedXP` includes species starting XP.

Fix — Do not reprice the finished character from items. After sample capture, define exactly which exported field is lifetime total, remaining XP, and/or spent XP. Prefer explicit total and remaining values; otherwise derive only arithmetically as `total - exportedUsed`. Reject non-finite values and warn on impossible invariants. Credits should remain the exported current balance; deriving them from gear prices would be incorrect for gifts, sales, rewards, or discarded gear.

3. **The resolver design does not work reliably across the advertised sources.**

Evidence — `SOURCE_DESCRIPTORS` contains no talent or signature-ability pool; it explicitly calls those settings “not consumed” ([source-descriptors.js:12](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/source-descriptors.js:12>), [source-descriptors.js:33](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/source-descriptors.js:33>)). Calling `loadSource` for such a pool throws. `loadSource` also applies rarity/restricted gates inappropriate for resolving gear already owned by an imported character ([load-source.js:58](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/load-source.js:58>), [load-source.js:66](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/load-source.js:66>)).

The claimed broad lookup ignores locked packs in its cached path ([import-helpers.js:243](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/importer/import-helpers.js:243>), [import-helpers.js:246](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/importer/import-helpers.js:246>)).

Fix — Build a dedicated, ungated, read-only import index keyed by `(itemType, ffgimportid)`, across configured packs, readable installed packs, and world items. Do not reuse shop eligibility filters. Treat duplicate matches as reportable ambiguity rather than last-match-wins.

4. **Section 7 leaves several actor-model fields unmapped or relies on fields that do not exist.**

Evidence:

- Force rating belongs at persisted `stats.forcePool.max`, while effective rating also includes active item effects ([actor-templates.js:140](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/data/actor-templates.js:140>), [actor-ffg.js:751](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/actors/actor-ffg.js:751>)). Copying final Force Rating into the base and embedding Force-rating effects double-counts it.
- Current encumbrance is recomputed from carried item quantity/equipment state, but only when the relevant calculation setting invokes `_calculateDerivedValues` ([actor-ffg.js:271](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/actors/actor-ffg.js:271>), [actor-ffg.js:617](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/actors/actor-ffg.js:617>)).
- There is no declared cybernetics-cap/current field in `CharacterDataModel`; `Cybernetics` elsewhere is merely a legacy custom skill.
- `system.general.notes` is explicitly undeclared and will not persist under the DataModel ([actor-templates.js:229](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/data/actor-templates.js:229>), [actor-templates.js:240](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/data/actor-templates.js:240>)).
- `Title`, `Source`, `XP`, `Dedications`, `Modifiers`, `BaseMods`, `ModStates`, `EncumbranceCapacity`, and possibly morality strength/weakness have no precise home in section 7.

Fix — Replace the broad biography/general row with explicit target paths. Decide whether cybernetics requires a new actor field or is preserved under an import flag/report. Map Force Rating as a residual base after resolved item effects. Preserve Hyperdrive totals as verification values. Define a durable home for Notes, Title, Source, and unmappable metadata.

5. **Career-skill and free-rank provenance is underspecified and risks another double count.**

Evidence — Native items grant career-skill flags through inherent effects ([item-helpers.js:103](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/helpers/item-helpers.js:103>), [item-helpers.js:125](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/helpers/item-helpers.js:125>)). Wizard free ranks are separate item effects, while only XP-purchased ranks are stored directly on the actor ([to-item-data.js:27](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/to-item-data.js:27>), [apply-build.js:104](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/apply-build.js:104>)).

Fix — Define how `CareerSkills`, `SelectedCareerSkills`, `ExtraCareerSkills`, and `SpecSkills` map to owning items and free rank grants. Store only the residual purchased/manual rank directly. Let career/spec effects form the union of career-skill flags; do not redundantly bake the final flag into every layer.

6. **Equipment ownership and modifier routing are incomplete.**

Evidence — `Attachments`, `UsedQualities`, and `WeaponModifiers` are not all `itemattachment[]`. Qualities/modifiers live in `system.itemmodifier[]`; attachments live in `system.itemattachment[]` ([item-templates.js:120](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/data/item-templates.js:120>), [item-templates.js:135](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/data/item-templates.js:135>)). Attachment application also needs a concrete target item; native wizard purchases use an explicit `attachTo` identifier ([apply-build.js:167](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/apply-build.js:167>)). A flat weapon key is ambiguous when the actor owns two copies with different modifications.

Nested attachments require stable `_id` values for later editing ([item-editor.js:303](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/items/item-editor.js:303>)); the wizard identity helper explicitly assigns them ([build-item-schema.js:337](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/build-item-schema.js:337>)).

Fix — Phase 0 must prove attachment-to-item-copy ownership. Normalize base modifiers, qualities, installed attachments, installed mods, quantity, carried state, and equipped state separately. Generate IDs for nested snapshots. If target ownership is ambiguous, report it and require confirmation.

7. **“Install the compendium and re-import to upgrade” is not implemented by setting `ffgimportid`.**

Evidence — `ffgimportid` supports lookup, but no cited code automatically replaces an embedded stub. The design also chooses “create new actor” rather than update existing, so re-import would produce another actor rather than upgrade the stub.

Fix — Reword this as “install the compendium and import again to create a higher-fidelity actor,” or add an explicit embedded-item replacement/update design with preservation rules.

## MINOR

1. **“Talents are not actor items” is too absolute.**

Evidence — Actor preparation explicitly supports directly embedded `talent` items and aggregates them with specialization talents ([actor-ffg.js:428](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/actors/actor-ffg.js:428>)). Purchased specialization talents should normally remain tree nodes, but standalone talent items are a supported fallback representation.

Fix — Say “tree-purchased talents should be represented as learned tree nodes when ownership is known.” Consider standalone talent items as an explicitly degraded fallback when a tree cannot be reconstructed.

2. **`toItemData` will not materialize trees unless the real materializer is injected.**

Evidence — It calls the materializer only when `options.materializeTree` is a function ([to-item-data.js:91](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/to-item-data.js:91>)). The wizard gets that binding from `makeBuildDependencies` ([build-deps.js:43](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/char-creator/build-deps.js:43>)), but section 8’s proposed call omits it.

Fix — Specify that Hyperdrive uses the bound adapter or injects `ItemHelpers.materializeTreePurchases` explicitly.

3. **Several external-schema claims remain unverifiable from this repository.**

The repository confirms only the Foundry side of `ffgimportid`: OggDude base objects store `obj.Key` there ([import-helpers.js:2281](<D:/SW FFG/Portable FVTT/Data/systems/starwarsffg/modules/importer/import-helpers.js:2281>)). It cannot confirm:

- Hyperdrive’s exact casing and null/array shapes;
- whether every object uses the same OggDude identifier namespace;
- purchase ownership or node coordinates;
- duplicate/ranked talent representation;
- Dedication choice representation;
- attachment target ownership;
- `XP`/`EarnedXP` semantics;
- the claimed gear fallback fidelity;
- whether tree grids truly are absent.

Fix — Make Phase 0 a hard architecture exit gate, with fixtures covering multiple specs, duplicate ranked talents, Dedication, force and signature upgrades, duplicate weapons with different attachments, species free skills, Force Rating sources, and a homebrew unmatched tree.

## VERDICT

The compendium-first direction and reuse of wizard item primitives are sound, but the design is not ready for an implementation plan. Its central actor assembly model writes prepared totals into persisted fields that will also receive item effects, and its core `BoughtTalents/BoughtPowers → learnedKeys` mapping uses the wrong identifier shape without proven tree ownership. First lock the real Hyperdrive schema, replace flat purchases with per-tree node records, define persisted-versus-effect accounting, and refactor a shared actor-source assembler beneath `applyBuild`. The fallback must also use shared OggDude translation/effect builders rather than DataModel projection alone. Once those changes are made, a final-state import adapter is preferable to reconstructing a fictional XP purchase history, while the wizard’s common assembly, preview, identity, and generalized commit primitives should still be reused.