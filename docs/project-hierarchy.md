# Project Hierarchy — `starwarsffg`

> Structural map of the Star Wars FFG Foundry VTT system. Generated 2026-07-05
> from a repo audit. Describes *where things live and how they wire together*,
> not gameplay rules. Line-count/version figures are point-in-time; treat the
> layout as the durable part.

- **System id:** `starwarsffg` · **Title:** Star Wars FFG · **Version:** 2.0.3
- **Foundry compatibility:** `minimum 13`, `verified 13` (no `maximum` —
  see [plans/2026-07-04-v14-migration.md](superpowers/plans/2026-07-04-v14-migration.md))
- **Framework:** ApplicationV2 / DocumentSheetV2 / DialogV2 throughout (V2-full
  migration complete). Schema still defined via legacy `template.json`
  (migration to DataModel is proposed, not started —
  [plans/2026-07-04-template-json-to-datamodel-migration.md](superpowers/plans/2026-07-04-template-json-to-datamodel-migration.md)).

---

## Top-level layout

| Path | Role |
|---|---|
| `system.json` | Foundry manifest — entry points, compatibility, languages, grid |
| `template.json` | Legacy schema: 6 Actor types + 19 Item types (see DataModel plan) |
| `modules/` | All system JavaScript (the codebase) |
| `templates/` | Handlebars (`.html`) sheet/dialog/chat templates |
| `styles/` | **Hand-maintained** compiled CSS (see note below) |
| `scss/` | SCSS sources — **drifted from CSS, reference-only** |
| `lang/` | i18n JSON (7 languages) + `checkdiff.js` audit helper |
| `lib/` | Bundled third-party vendors (not npm deps) |
| `fonts/`, `images/` | Static assets |
| `tests/`, `e2e/`, `cypress/`, `playwright/` | Test suites (unit + E2E) |
| `docs/` | Design/plan/verification docs (incl. `superpowers/`) |
| `node_modules/` | Dev dependencies (build/lint/test only — not shipped) |

> ⚠️ **CSS is hand-edited.** Never run `gulp css` / `npm run compile`. Both
> `styles/starwarsffg.css` and `styles/mandar.css` are hand-maintained; the
> SCSS has drifted. The active theme is **mandar** (`mandarBeskarAstromech`
> default disables `starwarsffg.css` entirely), so sheet + global CSS fixes
> must land in *both* `starwarsffg.css` and `mandar.css`.

### Manifest entry points (`system.json`)

- **esmodules:** `modules/dice-pool-ffg.js`, `modules/swffg-main.js`,
  `lib/slimselect/slimselect.js`, `lib/datatables/datatables.min.js`
- **scripts:** `lib/jszip`, `lib/jxon`, `lib/slimselect` (classic globals)
- **styles:** `styles/starwarsffg.css` + pure-grids + slimselect + datatables
- **languages:** en, de, fr, es, pt-BR, ca, ua
- **primaryTokenAttribute:** `wounds` · **grid:** 5 ft

---

## `modules/` — codebase

Entry point is `swffg-main.js`. Directory roles:

### Root orchestration
| File | Role |
|---|---|
| `swffg-main.js` (~2200 lines) | **Bootstrap.** All `Hooks` (init/setup/ready + document/chat/token/combat hooks), document-class + sheet registration, settings registration, dice-so-nice, macro creation |
| `swffg-config.js` | Aggregates the `config/` modules into the `CONFIG.FFG` object |
| `swffg-migration.js` (~436 lines) | World data-migration runner (version-to-version) |
| `dice-pool-ffg.js` | Dice-pool model (esmodule entry, loaded early) |
| `combat-ffg.js` | `CombatFFG` / `CombatantFFG` / `CombatTrackerFFG` — initiative + tracker |
| `groupmanager-ffg.js` | `GroupManager` (FFGFormApplication) — party obligation/duty/destiny/XP |
| `ffg-destiny-tracker.js` | Destiny pool tracker UI |
| `popout-editor.js`, `popout-modifiers.js` | Detached ProseMirror editor / modifier windows |

### `modules/config/` (14 files)
Static data tables assembled by `swffg-config.js` into `CONFIG.FFG`:
characteristics, skills, weapons, armor, vehicles, dice, difficulty, ranges,
modifiers, talents, item-status, character-creator, sheet-defaults.

### `modules/actors/` (8 files)
| File | Role |
|---|---|
| `actor-ffg.js` | `ActorFFG extends Actor` — data prep / derived stats |
| `actor-sheet-ffg.js` | `ActorSheetFFG extends FFGActorSheet` — primary sheet |
| `adversary-sheet-ffg.js` | `AdversarySheetFFG extends ActorSheetFFG` (character-type adversary view) |
| `actor-sheet-ffg-v2.js`, `adversary-sheet-ffg-v2.js` | Thin deprecated-alias subclasses (registered as "…v2 (deprecated)") |
| `actor-ffg-options.js` | Sheet-options dialog logic |
| `codex-sheets.js` | `CodexActorSheet` / `CodexAdversarySheet` — opt-in bespoke "Codex II" sheets |
| `cdx-pill-stack.js` | `CdxPillStack` reusable collapsible widget (Codex) |

### `modules/items/` (7 files)
| File | Role |
|---|---|
| `itembase-ffg.js` | `ItemBaseFFG` base class |
| `item-ffg.js` | `ItemFFG extends ItemBaseFFG` — data prep for all 19 item types |
| `item-sheet-ffg.js` | `ItemSheetFFG extends FFGDocumentSheet` — largest sheet, all item types |
| `item-sheet-ffg-v2.js` | Deprecated-alias subclass |
| `item-editor.js` | `itemEditor`/`talentEditor`/`forcePowerEditor` (FFGFormApplication) — tree/upgrade editors |
| `item-ffg-options.js` | Item sheet-options dialog |
| `codex-item-sheet.js` | `CodexItemSheet extends ItemSheetFFG` |

### `modules/apps/` (3 files) — shared base classes
| File | Role |
|---|---|
| `ffg-document-sheet.js` | `FFGDocumentSheet extends HandlebarsApplicationMixin(DocumentSheetV2)` — base for all actor/item sheets |
| `ffg-actor-sheet.js` | `FFGActorSheet extends FFGDocumentSheet` |
| `ffg-form-application.js` | `FFGFormApplication extends HandlebarsApplicationMixin(ApplicationV2)` — base for non-document dialogs (group manager, editors, settings) |

### `modules/dice/` (+ `dice/dietype/`)
| Path | Role |
|---|---|
| `dice/roll.js` | `RollFFG extends Roll` |
| `dice/roll-builder.js` | `RollBuilderFFG` roll dialog (ApplicationV2) |
| `dice/pool.js` | Dice pool logic |
| `dice/dietype/*.js` (7) | `AbilityDie`, `BoostDie`, `ChallengeDie`, `DifficultyDie`, `ForceDie`, `ProficiencyDie`, `SetbackDie` — each `extends foundry.dice.terms.DiceTerm` |

### `modules/helpers/` (21 files) — cross-cutting utilities
`actor-helpers.js`, `item-helpers.js`, `embeddeditem-helpers.js` (update flows
w/ render-suppression), `dice-helpers.js`, `modifiers.js`, `effects.js`,
`macros.js` (hotbar macro generation), `migration.js`,
`flag-migration-helpers.js`, `talent-tree.js`, `character-creator.js`,
`apply-crit.js`, `apply-damage.js`, `gm-bridge.js` (GM socket bridge),
`crew.js`, `minions.js`, `journal.js`, `token.js`, `tours.js`, `common.js`,
`partial-templates.js`.

### `modules/importer/`
| Path | Role |
|---|---|
| `data-importer.js` | OggDude data-set import UI |
| `import-helpers.js` (~3000 lines) | Core import/merge logic |
| `swa-importer.js` | Star Wars Adversaries importer |
| `skills-list-importer.js` | Custom skill-list import |
| `oggdude/oggdude.js` | OggDude format entry |
| `oggdude/importers/*.js` (16) | Per-type importers (weapons, armor, talents, species, careers, vehicles, force-powers, specializations, signature-abilities, gear, backgrounds, motivations, obligation, skills, item-attachments, item-descriptors) |

### `modules/settings/`, `modules/active-effects/`, `modules/tokens/`
- `settings/` — `ui-settings.js` (ruleset/UI/combat/actor/xp/localization/group
  settings dialogs), `crew-settings.js`, `settings-helpers.js`
- `active-effects/active-effect-ffg.js` — `ActiveEffectFFG extends ActiveEffect`
- `tokens/token-ffg.js` — `TokenFFG extends foundry.canvas.placeables.Token`

---

## Class inheritance summary

```
Foundry Actor        → ActorFFG
Foundry Item         → ItemBaseFFG → ItemFFG
Foundry ActiveEffect → ActiveEffectFFG
Foundry Combat       → CombatFFG   (+ CombatantFFG, CombatTrackerFFG)
Foundry Roll         → RollFFG
Foundry Token        → TokenFFG
DiceTerm             → {Ability,Boost,Challenge,Difficulty,Force,Proficiency,Setback}Die

HandlebarsApplicationMixin(DocumentSheetV2) → FFGDocumentSheet
   ├─ FFGActorSheet → ActorSheetFFG → AdversarySheetFFG
   │                                → ActorSheetFFGV2 / AdversarySheetFFGV2 (deprecated aliases)
   │                                → CodexActorSheet / CodexAdversarySheet (via CodexSchemeMixin)
   └─ ItemSheetFFG → ItemSheetFFGV2 (deprecated) / CodexItemSheet

HandlebarsApplicationMixin(ApplicationV2) → FFGFormApplication
   ├─ GroupManager
   ├─ itemEditor → talentEditor / forcePowerEditor
   └─ ffgSettings → {ruleset,ui,combat,actor,xpSpending,localization,groupManager}Settings
```

Registered in `swffg-main.js` init: `CONFIG.Actor/Item/ActiveEffect.documentClass`,
core sheets unregistered, FFG sheets registered (`makeDefault: true` for the
primary actor/item sheets; Codex + adversary + deprecated-v2 variants alongside).

---

## `templates/` — Handlebars views (~130 files)

| Subdir | Contents |
|---|---|
| `actors/` | 7 actor sheets (character/minion/rival/nemesis/adversary/vehicle/homestead) + `dialogs/` + `codex/` |
| `items/` | 20 item-type sheets + `dialogs/` (attachments/modifiers/talents/upgrades) + `codex/` (12) |
| `parts/` | Reusable partials: `actor/` (13), `shared/` (6), `codex/` (6), qualities/mods/attachments |
| `wizards/char_creator/` | Character-creator wizard (tabs, previews, pills) |
| `chat/` | Chat cards (item / force-power / weapon / vehicle roll cards) |
| `combat/` | Combat-tracker header/body/footer |
| `dialogs/` | Crew, initiative, sheet-options, UI-settings, confirm-purchase, grant-xp |
| `dice/`, `importer/`, `notifications/` | Roll UI, import UIs, notification cards |

Naming: `ffg-*` = standard sheets/parts; `codex-*` / `cdx-*` = Codex II sheets.

---

## Styling

- **Shipped CSS (hand-edited):** `styles/starwarsffg.css` (default theme),
  `styles/mandar.css` (active theme), `styles/mandarBeskarAstromech.css`,
  `styles/cdx.css` (Codex II).
- **SCSS (`scss/`, 53 files):** `components/`, `global/`, `utils/` — drifted
  reference only; `scss/global/_v2_layout.scss` records V2 layout rules.

---

## Tooling & tests

- **package.json scripts:** `lint` (`eslint modules`), `compile`/`watch` (gulp
  CSS — **do not run**, CSS is hand-maintained).
- **Unit tests** (`tests/`): `common.test.js`, `modifiers.test.js`,
  `talent-tree.test.js`, `ffg-tests.js`, `v2-migration/`.
- **E2E:** `e2e/` (Playwright specs, e.g. `activeEffects.spec.js`),
  `cypress/e2e/` (init / create-entities / test-items), `playwright/` fixtures.

---

## `docs/`

- `docs/superpowers/` — working docs by phase:
  - `plans/` — implementation plans (V2 migration, V14 migration, DataModel
    migration, feature plans)
  - `specs/` — design specs (paired with plans)
  - `reports/` — analysis reports
  - `verification/` — stage checklists + UI sweeps
- `docs/design_handoff_codex_foundry/` — Codex II design handoff + prototype
- `docs/project-hierarchy.md` — this file

---

## Notes for navigation

- **"Where is X registered?"** → `swffg-main.js` (hooks + document/sheet/settings).
- **"Where is the schema?"** → `template.json` today; DataModel plan pending.
- **"Base sheet behavior?"** → `modules/apps/` (three base classes).
- **"Config data table?"** → `modules/config/*` → surfaced on `CONFIG.FFG`.
- **"Import logic?"** → `modules/importer/` (OggDude core in `import-helpers.js`).
- **Two sheet families coexist:** standard (`ffg-*`) and opt-in Codex II
  (`codex-*`/`cdx-*`), selectable per actor.
