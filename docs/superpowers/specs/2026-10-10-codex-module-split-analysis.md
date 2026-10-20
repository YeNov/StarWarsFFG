# Codex II as a separate module: impact analysis

Analysis only; nothing in the system was changed. Based on `main` at e57c4512 (2.1.6 plus one fix) and Foundry V14 build 364, with V13 build 351 compared where it matters. Foundry core files are cited as `<fvtt-app>/…` and other installed packages as `<data>/modules/…`.

## 1. Summary

Codex II is not a stylesheet. It is a second sheet layer: three sheet classes that subclass the system's own sheets, 21 templates, 7 stylesheets, a language file, two socket protocols, six settings and a settings menu. The system reaches into it in about 60 places across nearly 30 of its own files. Since 2026-07-01, 47 of the 124 commits that changed Codex code also changed core system code in the same commit.

The move can be made without losing world data. Foundry keeps everything Codex stores and silently falls back to the classic sheets when the Codex classes are missing. That depends on the module keeping a short list of identifiers (§9.1) and on the system fixing a few things first (§9.2).

**A server updates the system and does not install the module** (details in §5.1):

- Every Codex sheet opens as the classic sheet. Nobody is told unless the system says so itself.
- Data stays: per-document sheet choices, colour schemes, flags, crit-recovery stamps. Installing and enabling the module later brings it all back.
- Four things go wrong unless handled:
  1. Each player's Codex theme choice is wiped by the existing `ready` self-heal.
  2. Gear marked "not carried" on a Codex sheet stays out of encumbrance, with its Active Effects disabled, and the classic sheet has no control to show or undo it.
  3. The Destiny Tracker's campaign-day text shows raw `SWFFG.Codex.CritTrauma.*` keys, or the tracker stops rendering if `campaignDay` leaves the system.
  4. The Replace Die dialogs lose their dice styling for every user, Codex or not.
- If the extraction leaves one static import of a Codex file, or one Codex template in the awaited preload, the whole system fails to start for everyone, with or without the module.

**Highest risks, in order**

1. Leftover links from the system into Codex files: the system doesn't load, or `init` aborts before any setting is registered (§3.1).
2. Version skew. The module subclasses the system's sheets and overrides or calls about 20 of their internal methods. A mismatched pair can write wrong values into documents when a sheet closes, not just fail (§5.5).
3. Sharing code across packages. Importing system files by path can load a second copy of the system code: duplicate hooks, split socket bridges (§5.8).
4. Players' theme choices silently lost, and hidden "not carried" items (§5.1).
5. Load order. The system's async `init` finishes after the module's `init`. The module must still register its sheets at a point where Foundry processes them, and load its CSS after `mandar.css` (§7, §9.2).

## 2. What would move

| Part | Files | Size |
|---|---|---|
| Sheet code | `codex-sheets.js` (1,926 lines), `codex-item-sheet.js` (349), `codex-fated-sigil.js` (555), `cdx-pill-stack.js` (140), `codex-talent-tiers.js` (119), `codex-popup-position.js` (21), `codex-item-labels.js` (20), `codex-xp-buy.js` (14), `codex-quantity.js` (11) | 3,155 lines |
| Templates | `templates/actors/codex/` (3), `templates/items/codex/` (12), `templates/parts/codex/` (6) | 21 files, 1,840 lines |
| Styles | `cdx.css` plus 6 scheme files; hand-written, no SCSS | 3,044 lines, about 202 KB |
| Strings | `lang/codex/en.json` (55 keys, English only); 10 `SWFFG.Settings.codex.*` keys and 7 generic keys in `lang/en.json` that only Codex uses | |
| Assets | Orbitron font; `images/codex/eldritch/*` (4 used, 1 unused webp); `images/sith-emblem.svg` | |
| Settings | Configure Codex menu; `gmDefaultSheetTheme`, `defaultSheetTheme`, `codexAdvantageHealsStrain`, `codexTalentTierSorting` (`campaignDay` and `vehicleCritWeeklyLimit`: see §9.2) | |
| System code that serves only Codex | `stat-step-bridge.js` and `stat-step-coordinator.js` (socket `ffgStatStep`); the crit-recovery branch of `gm-bridge.js` (socket `ffgCritRecovery`); `crit-availability.js`; `vehicle-hardpoints.js`; `sheet-theme.js`; Handlebars helpers `codexQuantity` and `critAvailability` | |

Only the two sheet files touch the system. The other seven Codex JS files are self-contained, and none of them is used by the classic sheets. `codex-quantity.js` is imported by `swffg-main.js` only to register a helper that Codex templates use.

Shared assets stay in the system: `ElektraMediumPro-Bold.otf` (also used by `mandar.css`), `images/dice/starwars/purple.png`, `images/generic-die.svg`.

## 3. Where the system touches Codex

### 3.1 Load-time links: each one is fatal or noisy if left behind

| Where | What | If the Codex file is gone |
|---|---|---|
| [swffg-main.js:23, 24, 29](../../../modules/swffg-main.js#L23) | Static imports of `CodexItemSheet`, `codexQuantityLabel`, `CodexActorSheet`/`CodexAdversarySheet` | The browser can't link `swffg-main.js`; the system does not load at all |
| [settings-helpers.js:10-12](../../../modules/settings/settings-helpers.js#L10) | Imports the `codexSettings` menu class and `refreshOpenCodexSheets` | Same |
| [item-editor.js:6](../../../modules/items/item-editor.js#L6) | Imports `cdxNormalizeScheme`, `cdxSchemeClasses` | Same. `item-sheet-ffg.js` imports `item-editor.js`, and ffg-star-wars-enhancements imports it dynamically |
| [swffg-main.js:421](../../../modules/swffg-main.js#L421) | `await loadTemplates([...])` with 15 Codex templates, inside `init` | `getTemplate` rejects and the rest of `init` never runs: no settings (`initLevelSettings` at :423), no sheets, no helpers. Every later `game.settings.get("starwarsffg", …)` throws |
| [partial-templates.js:4-9](../../../modules/helpers/partial-templates.js#L4) | Preloads 6 Codex partials | Unhandled rejection in the console; the other partials still register |
| [swffg-main.js:443-460](../../../modules/swffg-main.js#L443) | Appends `cdx.css` and 6 scheme `<link>`s, cache-busted with `Date.now()` | 7 × 404 |
| [swffg-main.js:185-195](../../../modules/swffg-main.js#L185) | `i18nInit` fetches `lang/codex/<lang>.json` | Skipped silently; the system strings kept in that file show raw keys (§3.3) |

`npm run check:imports` catches the static imports and plain `systems/starwarsffg/...` strings. It does not catch paths built with `${}`, such as the CSS links and the language fetch. A test asserting that no system file names a Codex path closes that gap.

### 3.2 Registration, routing and settings

| Where | What | Disposition |
|---|---|---|
| [swffg-main.js:1356-1381](../../../modules/swffg-main.js#L1356) | `registerSheet("ffg", Codex…)`; stored ids are `ffg.CodexActorSheet`, `ffg.CodexAdversarySheet`, `ffg.CodexItemSheet` | Module, with the same scope and class names |
| [swffg-main.js:1383-1390](../../../modules/swffg-main.js#L1383) | `CONFIG.FFG.codexSheets` | The module sets it. The system must stop setting it, because the system's line runs after the module's `init` and would overwrite it |
| [actor-ffg.js:15-32](../../../modules/actors/actor-ffg.js#L15), [item-ffg.js:19-36](../../../modules/items/item-ffg.js#L19), [sheet-theme.js](../../../modules/helpers/sheet-theme.js) | `_getSheetClass()` routes to Codex when the effective theme starts with `codex` and no per-document sheet is set. This is the only way to get per-user default sheets | Keep as a generic extension point (a registry plus a resolver) |
| [settings-helpers.js:100-111](../../../modules/settings/settings-helpers.js#L100), [ui-settings.js:319-340](../../../modules/settings/ui-settings.js#L319) | Configure Codex menu (`restricted: false`). `codexSettings` extends `ffgSettings`, which `ui-settings.js` does not export. That base class extends `FFGFormApplication` and supplies Save, Reset Defaults and the filter that hides world settings from players, and the menu renders the shared `templates/dialogs/ffg-ui-settings.html`. The menu also lists `vehicleCritWeeklyLimit`, which stays in the system | Module. Moving the class alone fails: either the system exports `ffgSettings` (and keeps the template) as API, or the module ships its own menu class and template |
| [settings-helpers.js:278-328](../../../modules/settings/settings-helpers.js#L278) | `gmDefaultSheetTheme` (world) and `defaultSheetTheme` (client) with hard-coded `codex-*` choices | Module, or system with module-contributed choices (§10) |
| [settings-helpers.js:443-465](../../../modules/settings/settings-helpers.js#L443) | `codexAdvantageHealsStrain`, `codexTalentTierSorting`; only Codex reads them | Module |
| [settings-helpers.js:467-492](../../../modules/settings/settings-helpers.js#L467) | `campaignDay`, `vehicleCritWeeklyLimit`; also read by the Destiny Tracker, gm-bridge, the `receivedDay` stamp and `critAvailability` | System (§9.2) |
| [swffg-main.js:1810-1829](../../../modules/swffg-main.js#L1810) | `ready` self-heal: resets any `defaultSheetTheme` value that is not among the choices to "Use the GM's default", which also reloads the page | Module, or make it skip `codex-*` values |
| [swffg-main.js:1407](../../../modules/swffg-main.js#L1407), [:1452-1457](../../../modules/swffg-main.js#L1452) | Handlebars helpers `codexQuantity` and `critAvailability`; only Codex templates use them | Module. The cooldown maths stays wherever Crit-Trauma lives |

### 3.3 System features that depend on Codex files

- **Replace Die dialogs.** Reroll, turn to face, add die and add result always add `.cdx-dice`, for every user ([replace-die.js:332, 379, 424](../../../modules/helpers/replace-die.js#L332)).
  - Their dark-dialog glyph colours, icon sizing and transparent pool background exist only in [cdx.css:839-868](../../../styles/cdx.css#L839). Without `cdx.css`, every user loses them.
  - The system already carries the footer part (`.cdx-dice .form-footer` in `starwarsffg.css`, `mandar.css` and the SCSS).
  - Fix: move the dice-pool rules into system CSS, in both hand-maintained files plus the SCSS twin.
- **Global tooltip rule.** [cdx.css:1647-1648](../../../styles/cdx.css#L1647) recolours dice glyphs in Foundry's body-level `#tooltip` for every user and every theme. Decide whether it belongs in the system (scoped to dark tooltips) or goes away.
- **Destiny Tracker campaign day.**
  - The readout, the GM's [+] control and the edit dialog use `SWFFG.Codex.CritTrauma.Day`, `EditDay`, `EditDayTitle`, `EditDayLabel` and `EditDaySet`. These keys exist only in `lang/codex/en.json`.
  - Users: [ffg-destiny-tracker.js:368, 410-415](../../../modules/ffg-destiny-tracker.js#L368), [ffg-destiny-tracker.html:20](../../../templates/ffg-destiny-tracker.html#L20), and the `campaignDay` setting name at [settings-helpers.js:471, 479](../../../modules/settings/settings-helpers.js#L471).
  - `_prepareContext` reads `campaignDay` with no guard ([ffg-destiny-tracker.js:94](../../../modules/ffg-destiny-tracker.js#L94)). If the setting moved to a module that is absent, the tracker would not render.
- **Crit received-day stamp.** Every new critical injury reads `campaignDay` ([swffg-main.js:135-141](../../../modules/swffg-main.js#L135)).

The Crit-Trauma weekly recovery feature only has UI on the Codex sheets, but its machinery is spread through the system: settings, schema fields, the stamp, the helper, a gm-bridge socket branch and the Destiny Tracker. It needs one owner (§10).

### 3.4 System code that only Codex uses

This code is dead without the module and is part of its API with it.

- **Stat-step protocol** ([stat-step-bridge.js](../../../modules/helpers/stat-step-bridge.js), [stat-step-coordinator.js](../../../modules/helpers/stat-step-coordinator.js)):
  - the `ffgStatStep` socket protocol on `system.starwarsffg`, registered at `ready` ([swffg-main.js:1833](../../../modules/swffg-main.js#L1833));
  - an allowlist for `flags.starwarsffg.codexShields.*`;
  - it paints the `.cdx-ratio` chips.
- **Crit recovery:** `applyCritRecoveryAttempt` and the GM's `ffgCritRecovery` handler ([gm-bridge.js:300-316, 357-375](../../../modules/helpers/gm-bridge.js#L300)).
- **Helpers only Codex imports:** `crit-availability.js`, `vehicle-hardpoints.js` (its only importer is `codex-sheets.js:35`), and `hullPoolSegments` in `minion-group.js`.
- **Base-sheet hooks only Codex implements:**
  - `_ffgConfirmDelete` ([actor-sheet-ffg.js:530](../../../modules/actors/actor-sheet-ffg.js#L530));
  - `_afterSkillDicePoolRendered` (:623);
  - `obligationTrackContext({forceUser})` (:502);
  - `_ffgPaintAmmo`, via [sheet-sync.js:39](../../../modules/helpers/sheet-sync.js#L39);
  - the weapon branch and `trackSources` option of `DiceHelpers.addSkillDicePool`.
- **`.cdx-*` selectors hard-coded in the base classes.** These are no-ops without Codex, but the module needs them, so they belong to the contract:
  - [ffg-actor-sheet.js:25](../../../modules/apps/ffg-actor-sheet.js#L25) (drag selector);
  - [actor-sheet-ffg.js:1546-1547, 1775, 1791-1792](../../../modules/actors/actor-sheet-ffg.js#L1546);
  - [item-sheet-ffg.js:1311-1334, 2235](../../../modules/items/item-sheet-ffg.js#L1311);
  - [ffg-document-sheet.js:203-213](../../../modules/apps/ffg-document-sheet.js#L203) (scroll preservation).
- **Roll builder:** [roll-builder.js:228-240](../../../modules/dice/roll-builder.js#L228) adds `.cdx-dice` when the actor's sheet class name contains "Codex".
- **Dice pool:** [pool.js:401-406](../../../modules/dice/pool.js#L401) sets `--ffg-die-mask` and `span.ffg-die-icon`, which only the Codex CSS reads.
- **Signature ability sheet size:** [item-sheet-ffg.js:611-617](../../../modules/items/item-sheet-ffg.js#L611) opens these sheets at 720×720 for the Codex tree, classic sheets included. This belongs in the Codex subclass.

### 3.5 What Codex needs from the system

- **Base classes.**
  - `CodexActorSheet extends CodexSchemeMixin(ActorSheetFFG)`, `CodexAdversarySheet extends CodexSchemeMixin(AdversarySheetFFG)`, `CodexItemSheet extends ItemSheetFFG`.
  - `class … extends` needs the real constructors when the module file is evaluated, and none of them is on `game.ffg` today.
- **Overridden system internals:** `_getLegacyRootClasses` (skips `super`), `_applyLegacyRootClasses`, `_preRender`, `_onRender`, `activateListeners` (jQuery), `getData`, `template`, `_buyCore`, `_ffgConfirmDelete`, `_createSkillColumns`, `_getHeaderControls`, `close`, `_minDimensions`, `VIEWER_CONTROLS`/`viewerControls`.
- **Called system internals:** `_buySkillRank`, `_itemDisplayDetails` (with a hand-made event object), `_itemDetailsElement`, `sheetoptions`, `obligationTrackContext`, `_onSubmit`, and the shape of the `getData` context.
- **DOM contract:** 141 `name="data.*"` inputs, plus about 29 of the 47 selectors that `ActorSheetFFG.activateListeners` binds (`.item-delete`, `.ffg-purchase`, `a.xp.refund`, …).
- **Helpers:** 23 symbols from 15 system files: `DicePoolFFG`, `DiceHelpers`, `killMinionGroup`, the minion-group trio, `availFor`, `applyCritRecoveryAttempt`, the ammo helpers, the hard-point helpers, `vehicleDefenceZones`, `ActorHelpers.isEditModeOwner`, the stat-step functions, `effectiveSheetTheme`.
- **Shared partials** (47 include sites, all hard-coded as `systems/starwarsffg/...`):
  - `parts/shared/ffg-{effects,modifiers,sources,tags}.html`;
  - `parts/ffg-mods.html`;
  - `parts/ffg-attachments.html`, which was split out for Codex and has no classic user, so it must not be pruned as dead;
  - `items/dialogs/ffg-modification.html`;
  - `dialogs/ffg-confirm-purchase.html`.
- **Shared Handlebars helpers:** `iff`, `selectFfg`, `contains`, `each_when`, `renderMultiple`, `calculateSpecializationTalentCost`, `calculateSignatureAbilityCost`, `object`.
- **Settings it reads:** `skillSorting`, the five label overrides, `useLimitedAmmoQuality`, and its own.
- **Settings menu base,** if the module keeps the current Configure Codex menu: `ffgSettings` (private to `ui-settings.js`) with its `FFGFormApplication` parent, and `templates/dialogs/ffg-ui-settings.html`.
- **Hard-coded skill keys:** `Cool`, `Discipline`, `Resilience` ([codex-sheets.js:1694-1695, 1817](../../../modules/actors/codex-sheets.js#L1694)).
- **Translation keys:** 143 base keys.

The planned [V2-full migration](../plans/2026-05-31-v2-full-migration.md) renames the V1 bridge methods that Codex overrides. Doing it after the split means changing both packages in lockstep.

## 4. Data in worlds

A byte-level grep of the local worlds found Codex data in them: `ffg.CodexActorSheet`, schemes, collapsed headers, inventory style, stat-step receipts, crit stamps, `gmDefaultSheetTheme`.

| Data | Written by | Read by | Without the module |
|---|---|---|---|
| `flags.core.sheetClass` = `ffg.Codex…` (actors, items, token deltas) | ⚙ Sheet dialog | Foundry `_getSheetClass`, roll-builder | Kept; the classic sheet opens. ⚙ Sheet then shows a blank choice, and saving it overwrites the Codex value |
| `core.sheetClasses` per-type default = Codex | GM, Default Sheets | Foundry | Kept; falls back to the first-registered sheet that can be a default |
| Client `defaultSheetTheme` = `codex-*` (localStorage) | Configure Codex | `sheet-theme.js` | **Wiped** by the self-heal if the system keeps the setting without Codex choices; kept if the system stops registering it |
| World `gmDefaultSheetTheme` = `codex-*` | GM | `sheet-theme.js` | Kept |
| `codexAdvantageHealsStrain`, `codexTalentTierSorting`, `vehicleCritWeeklyLimit` | GM | Codex (plus gm-bridge) | Kept as Setting documents |
| `flags.starwarsffg.carried = false` (weapons, armour, gear) | The Codex toggle only | [actor-ffg.js:674-676](../../../modules/actors/actor-ffg.js#L674) (encumbrance), [item-ffg.js:435-448](../../../modules/items/item-ffg.js#L435) (gear Active Effects) | **Kept and still applied** (see the note below the table) |
| `flags.starwarsffg.scheme` (actor, item) | Codex | Codex, item-editor | Inert. The legacy value `"eldritch"` must still be normalised |
| `flags.starwarsffg.codexAlignment` | The Codex select, plus a global `updateActor` hook | Codex | Inert; it stops following Morality |
| `flags.starwarsffg.codexHeaderCollapsed`, `config.codexInventoryStyle` | Codex | Codex | Inert |
| `flags.starwarsffg.codexShields.<zone>`, `statSteps` | Stat-step coordinator | Codex, coordinator | Inert; rolls use `system.stats.shields` |
| Critical injury `system.receivedDay`, `resilienceLastAttemptDay`, `medicineLastAttemptDay`; critical damage `mechanicsLastAttemptDay` | System stamp, Codex, gm-bridge | `critAvailability`, gm-bridge | Kept **only while the schema declares them**. Foundry prunes undeclared `system` keys on update |
| Chat flag `critTraumaRecovery` | Codex | Nobody | Harmless |
| Pack data in yehors-sw-ffg-shared-data (`scheme`, `codexInventoryStyle`) | — | Codex | Inert |

A `carried = false` item:
- silently drops out of encumbrance;
- keeps its gear Active Effects disabled;
- has nothing on the classic sheet that shows or undoes this;
- carries the flag with it when it is dragged or transferred to another actor.

Chat is unaffected: there is no Codex markup or handler in chat cards, so old cards look the same without the module. There are no Codex user flags.

## 5. Upgrade scenarios

### 5.1 The server updates the system and does not install the module

This assumes the system side was done right, with no leftover links (§3.1).

| Who | What they see |
|---|---|
| Everyone | Every Codex sheet opens as the classic sheet, with no message; Foundry warns about nothing. Per-document Codex choices and the GM's per-type defaults stay stored |
| Players who picked a Codex theme | With today's self-heal and a system that still registers `defaultSheetTheme`: the choice is reset to "Use the GM's default", with one forced reload, and is gone for good. If the system no longer registers the setting, the value stays in localStorage and each load logs a console warning |
| GM | Configure Codex disappears; `gmDefaultSheetTheme` stays stored |
| Characters | Items marked "not carried" stay out of encumbrance with their gear Active Effects off. The classic sheet shows nothing; the fix is `item.update({"flags.starwarsffg.carried": true})` |
| Everyone | The Destiny Tracker's campaign-day text shows raw keys unless the 5 strings move into `lang/en.json`. The tracker fails to render if `campaignDay` left the system |
| Everyone | The Replace Die dialogs lose their dice styling unless the `.cdx-dice` rules move into system CSS |
| Codex users | These exist only on Codex sheets, so they go: the crit weekly recovery buttons, the strain recovery card, XP-buy mode, the stat steppers and the scheme picker. Their data stays |
| Other modules | No errors. The special-ammo selector from ffg-star-wars-enhancements just doesn't appear on Codex cards |

**How a GM gets the module during the update.** List it in `system.json` under `relationships.recommends`, with a `manifest`. Foundry's Setup screen then offers it, pre-ticked, when the GM installs **or updates** the system: `installPackage` runs `installDependencies` for updates too.
- That only installs the module. The GM still has to enable it in each world's Manage Modules.
- Updates done outside the Setup screen, such as hosting panels or scripts, get no prompt.

### 5.2 The module is installed (and enabled) later

Everything comes back (sheets, defaults, schemes, settings) as long as the module keeps the identifiers in §9.1.

Not recoverable:
- client theme choices the self-heal already wiped;
- ⚙ Sheet choices someone re-saved in the meantime;
- alignment drift.

Installed but not enabled behaves like not installed. `game.modules.get(id)` exists with `active: false`, so the system can tell the GM "enable it" instead of "install it".

### 5.3 The module is disabled or uninstalled

Same as §5.1. Foundry never deletes a module's data. If the world still lists the module as enabled after it was uninstalled, there is no warning either.

### 5.4 Old system (2.1.6 or earlier, Codex built in) with the new module

Both packages then:
- register `ffg.CodexActorSheet` (the last one wins);
- add the `updateActor` alignment hook (double writes);
- inject the CSS;
- register the same settings (the last config wins, stored values are kept);
- add the menu twice.

Prevent it in two ways:
- Set the module's `relationships.systems` `minimum` to the first Codex-less release. Foundry then disables the module at launch on older systems.
- Add a runtime guard that stands down when the system's API object (§9.2) is missing; 2.1.6 has none. Checking `CONFIG.FFG.codexSheets` would not work: the old system sets it only after its `init` awaits, which is after the module's `init` has run.

### 5.5 New system with a mismatched module (either direction)

- **A failure before the module registers anything is safe.** For example, if a static import fails to resolve, the browser never evaluates the module, so nothing is registered. The classic sheets open and the data is intact.
- **A failure after registration is not safe.** Sheets, hooks, settings and socket handlers registered before the error stay registered. Documents can then route to a Codex sheet that fails to render, or that half-works (next bullet). So the compatibility check must run before any class extends a system class and before any registration (§9.3).
- **A partial mismatch is the dangerous case.**
  - Actor sheets submit the whole form on change and on close (`submitOnClose`, [ffg-actor-sheet.js:21-22](../../../modules/apps/ffg-actor-sheet.js#L21)).
  - Codex templates bind some inputs to derived values. The comment at [codex-sheets.js:1610-1614](../../../modules/actors/codex-sheets.js#L1610) records this hazard for vehicle ratings.
  - So a module built against different system internals can write blank, zero or wrong values into source fields, especially in Edit Mode.
- **Socket payload changes** (`ffgStatStep`, `ffgCritRecovery`): forwarded Medicine and Mechanics marks are silently dropped, and stat steps time out after 15 s with a warning.
- **Foundry's own compatibility check.**
  - A module whose `relationships.systems` range excludes the running system is disabled at launch, and stays disabled after the system is updated until a GM re-enables it.
  - Don't use a short `maximum` like `"2"`. The V14 UI reads it as major-only, but the server reads it as `2.0.0`, so the server disables the module at every launch.

### 5.6 Clients on different code in one session

If the bridges move to a module socket channel, clients still running the old code during that session drop the other side's messages. The same "reload every client" note applies as in 2.1.3.

### 5.7 World copied to a server without the module

Same as §5.1. Foundry shows no "missing module" warning.

### 5.8 Hosting

- **Route prefix.**
  - Foundry mounts everything under the configured route prefix and emits relative asset paths. Root-absolute `/systems/starwarsffg/...` URLs break there.
  - That already affects Codex today: `cdx-eldritch.css:40/74/102`, `cdx.css:1679`, `codex-fated-sigil.js:216`, and the `--ffg-die-mask` path.
  - Relative specifiers keep the prefix.
- **Same URL, same instance.**
  - If the module imports system files, each specifier must resolve to exactly the URL the system itself loaded.
  - A different URL loads a second copy of the system code. `actor-sheet-ffg.js` imports `swffg-main.js`, so every `init`/`ready` hook would register twice, the stat-step and gm-bridge state would be split, and `instanceof` checks would fail.
- **Hosted services.** A third-party module's issue tracker reports that The Forge sandboxes packages and blocks relative imports into `systems/`. This is not verified here. A global API object that the system sets at evaluation time avoids file imports altogether.

## 6. Other packages that use Codex

| Package | How it finds Codex | Relies on | Without the module | Change needed |
|---|---|---|---|---|
| ffg-star-wars-enhancements 3.1.1 | `renderCodexActorSheet` / `renderCodexAdversarySheet` hooks (named after the classes); DOM checks on `renderItemSheet` | `.cdx-card.weapon`/`.gear`, `.cdx-ammo*`, `.cdx-pane[data-tab]`, `.cdx-tabstrip`, the private `app._cdxTab`, about 30 `cdx.css` classes (including `.cdx-icheck`, which no system template uses any more), 8 `--cdx-*` variables | No errors; the ammo UI on Codex cards is missing | Add `recommends`. Fix `compatability` → `compatibility`; all its version bounds are ignored today. Prefer `renderActorSheetV2` plus a `.cdx` check over class-name hooks. Keep `.cdx-icheck` in `cdx.css`. Unrelated: `shop_sheet.js:1` imports the deprecated `actor-sheet-ffg-v2.js` alias |
| kelborns-swffg-force-presence 0.2.16 | The system-fired `renderActorSheetV2` plus `.cdx`/`.cdx-panel` checks; a class-name regex | `.cdx-bio-stats`, `.cdx-chip.derived.cdx-ratio.force` with `cdx-align-*`, `cdx-panel`, `--cdx-ink`/`--cdx-line`, the dark-scheme dice contrast | No errors | Add `recommends`. Its `border:none` rule (`main.css:173-177`) would start winning if the Codex CSS became layered |
| yehors-sw-ffg-shared-data | Pack data | `scheme`, `config.codexInventoryStyle` | Inert | None, as long as the flag keys stay |
| kelborns-easy-token, token-action-hud-ffgsw | — | Generic hooks; `sheet.getData()` | Fine | None |

Both code integrations keep working unchanged if the module keeps the class names, the base classes, the DOM and CSS names, and unlayered CSS.

## 7. Foundry behaviour this rests on

Checked in the V14 build 364 source. V13 build 351 behaves the same unless noted.

- **Missing sheet class.**
  - `_getSheetClass` ignores an unregistered `flags.core.sheetClass` and returns the default (`<fvtt-app>/client/documents/abstract/client-document.mjs:260-267`).
  - A stale per-type default leaves no sheet flagged as default. The fallback is then the first-registered sheet with `canBeDefault` (`document-sheet-config.mjs:449-450`), so registration order matters.
- **Sheet ids.**
  - An id is `${scope}.${cls.name}`, and the scope is not validated (`document-sheet-config.mjs:412`), so a module can register under `"ffg"`.
  - Registrations made before `initializeSheets()` are queued in call order and replayed there, after `setup` (`document-sheet-config.mjs:379-399, 419-423`).
  - A registration made after `initializeSheets()` but before `game.ready` is queued again and never replayed. `setupGame()` awaits the document index and the canvas between those two points (`client/game.mjs`, `setupGame`).
  - A registration made after `ready` is applied at once. But a document whose `sheet` was already created keeps its cached instance (`client-document.mjs:213-225`).
  - V14 adds a check that the class subclasses `Application` or `DocumentSheetV2`.
- **Render hooks.**
  - Foundry fires `render<ClassName>` for every named class in the chain (`application.mjs:1676-1678`).
  - `renderActorSheetV2` is not in that chain; the system re-fires it ([ffg-actor-sheet.js:64](../../../modules/apps/ffg-actor-sheet.js#L64)).
- **Flags.** `getFlag`/`setFlag` throw for any scope that is not core, world, the system id, or an active module (`common/abstract/document.mjs:955, 982`; `client-backend.mjs:646-652`). The system's own scope is always valid.
- **Settings.**
  - Any namespace is accepted (`client-settings.mjs:126-130`), and registering an id again overwrites it.
  - Unregistered keys stay stored, but `get`/`set` throw on them.
  - `type: String` settings never check `choices`.
- **Hook timing.**
  - `Hooks.callAll("init")` does not await its handlers (`client/game.mjs:652`).
  - The system's `init` is async. It awaits at [swffg-main.js:421](../../../modules/swffg-main.js#L421) and [:975](../../../modules/swffg-main.js#L975) before it registers most settings, the sheets, the helpers and the theme stylesheet. A module's `init` therefore runs before those.
  - System esmodules evaluate before module esmodules (unless the module is `library: true`).
  - Languages merge after `init`, in the order core, system, modules, world; later wins.
- **Dependencies.**
  - `relationships.recommends` in `system.json` gives an install prompt, pre-ticked, on install and on update from Setup.
  - In V14, if the entry has no `manifest` and the id is not listed on foundryvtt.com, that prompt throws and shows nothing. V13 showed a note.
  - `requires` makes every world on the system unlaunchable while the module is missing, and force-enables it, so don't use it for an optional module.
  - `conflicts` is not enforced.
- **Module compatibility.**
  - If the module's `relationships.systems` doesn't list the system, the module is hidden.
  - If the system version falls outside `minimum`/`maximum`, the module is disabled at launch, and that stays saved.
  - `verified` is informative only.
- **Enabled but not installed:** no warning anywhere; the module just isn't loaded.
- **Styles.**
  - `module.json` `styles` go into `@layer modules`. The system's runtime `mandar.css` is unlayered, so it beats them regardless of specificity.
  - Codex depends on being unlayered and after `mandar.css`. Today it gets that from a runtime `<link>` appended after mandar.
- **Cross-package files.**
  - Any package can load templates and static files from any other.
  - Manifest `esmodules` and `styles` must sit inside the package folder, but ES `import`s can reach anywhere.

## 8. Tests, CI, docs, licence

- **Tests.** `npm test` passes 1,011 tests today.
  - Of the 17 `tests/node/codex-*.test.mjs` files:
    - 10 move as they are;
    - 6 must be split, because they also pin system files;
    - 1 stays: `codex-talent-card-latency` tests system code only.
  - Nine more node tests need splitting: gm-default-sheet-theme, sheet-options-readonly, sheet-options-path, observer-sheet-access, vehicle-hardpoints, xp-refund-item, xp-refund-binding, obligation-type-refresh, stat-step-coordinator.
  - `lang-expansion` throws if `lang/codex` disappears (`readdirSync`).
  - The browser harness `tests/ffg-tests.js` imports `codex-schemes.test.js`, and two v2-migration suites have Codex cases.
  - A test that reads a moved file with `readFileSync` fails with ENOENT and takes its system tests down with it, so split them in the same change.
- **Contracts nobody would test after the split:**
  - the shared partials;
  - `a.xp.refund` and the `.specialization-talent` drop selector;
  - `_itemDetailsElement`, `viewerControls`, the scroll selectors;
  - `effectiveSheetTheme()`.

  Keep system-side tests for them, and give the module's CI a checkout of the system.
- **CI.**
  - `main.yml` zips whole folders, so Codex leaves `system.zip` on its own.
  - The module needs its own test and release workflows. `tools/set-release-manifest.mjs --file module.json` works as it is.
  - `tools/check-imports.mjs` hard-codes the system prefix, so the module needs a cut-down copy.
- **Docs.**
  - `CODEX.md` is the Codex readme, and it is out of date. It becomes the module README.
  - Move `docs/codex-ii-*.md`, `codex-force-tree-design.md`, `handoff-codex-special-ammo.md`, `design_handoff_codex_foundry/` and `svg-actor-sheet-layout-downsides.md`. Check the licences of the 6 fonts in the design handoff before publishing it.
  - Update `docs/project-hierarchy.md`.
- **Update notice.**
  - Replace the 2.1.6 line in [new_version.html](../../../templates/notifications/new_version.html).
  - `tests/node/new-version-notification.test.mjs` rejects links outside `github.com/YeNov/StarWarsFFG`. Either link to a page in this repo or its wiki, or change the test.
- **Wiki.**
  - Pages to edit: `Tutorial.md` (lines 6-9 and 43), Tutorial-05b, -07, -11, -12, -13 and -15. Tutorial-13 says crit recovery is "Codex sheets only" and puts Vehicle Crit Weekly Limit under Configure Codex.
  - Add an install entry to Extra-Modules.
  - No screenshot needs re-capturing as long as the markup stays the same.
- **Licence.**
  - Codex is CC BY-NC 4.0 and the system is MIT.
  - [LICENSE-CODEX](../../../LICENSE-CODEX) lists only 6 paths. It misses the scheme CSS files, 7 helper JS files, `lang/codex` and `images/codex`.
  - LICENSE-CODEX is also not in `system.zip`, so releases ship Codex with only the MIT text.
  - A module with one LICENSE covering everything, plus the OFL for Orbitron, fixes both.

## 9. Recommendations

### 9.1 Identifiers the module must keep

If any of these change, existing worlds lose their Codex setup.

1. Sheet scope `"ffg"` and the class names `CodexActorSheet`, `CodexAdversarySheet`, `CodexItemSheet`, with no bundler renaming (`keepNames`).
2. Flag scope `starwarsffg` and every flag key in §4.
3. Setting ids `starwarsffg.*`. Registering under the system's namespace works. The alternative is a one-time migration: world values via `game.settings.storage.get("world").getSetting(key)`, and client values from each browser's localStorage.
4. The base classes `ActorSheetFFG`, `AdversarySheetFFG` and `ItemSheetFFG`, so the hooks and selectors keep firing.
5. The DOM and CSS names `.cdx`, `.cdx-*`, `--cdx-*`. Two other modules depend on them.
6. CSS that stays unlayered and loads after `mandar.css`.

### 9.2 System changes, before or with the split

1. Cut every link in §3.1, and add a test that no system file names a Codex path, including paths built with `${}`.
2. Give the module a versioned API object instead of having it import system files by path. Set it when the system's scripts are evaluated, for example `globalThis.starwarsffg = { apiVersion, sheets: {…}, helpers: {…}, settingsMenu: ffgSettings }`. Include `settingsMenu` only if the module keeps the current menu (§3.2).
3. Register before the first `await` in `init`.
   - Move the sheet registrations, the settings Codex reads, the Handlebars helpers and the `mandar.css` link ahead of `await loadTemplates` ([swffg-main.js:421](../../../modules/swffg-main.js#L421)).
   - The skill-list setting can stay after `await gameSkillsList()` ([:975](../../../modules/swffg-main.js#L975)), because its choices come from the parsed lists.
   - The module then registers its sheets and appends its CSS synchronously in its own `init`. That puts its sheets after the system's in Foundry's queue, and its CSS after mandar.
   - Don't use a completion hook for sheet registration. A hook that fires after `initializeSheets()` but before `game.ready` queues the sheets where Foundry never replays them. Registering after `ready` leaves any document whose sheet already exists on the classic sheet (§7).
   - The system's own sheets are in the same race today. They register after two awaits, and nothing guarantees those finish before `initializeSheets()`. The `i18nInit` label hook already guards against settings that are not registered yet ([swffg-main.js:217-219](../../../modules/swffg-main.js#L217)).
4. Generalise `CONFIG.FFG.codexSheets` and `refreshOpenCodexSheets` into a sheet-theme registry and resolver, plus a hook.
5. Keep Crit-Trauma's system half in the system:
   - Keep `campaignDay`, `vehicleCritWeeklyLimit`, the crit schema fields and the `receivedDay` stamp.
   - Move the 5 `SWFFG.Codex.CritTrauma.*` strings into `lang/en.json`, ideally renamed out of the Codex namespace.
   - Guard the tracker's `campaignDay` read.
6. Move the `.cdx-dice` dice-pool rules into `starwarsffg.css`, `mandar.css` and the SCSS twin, and decide what happens to the `#tooltip` rule.
7. Don't let the self-heal destroy `codex-*` theme values.
8. Show "carried" on the classic sheet, since core still applies it. At minimum, list such items in the GM notice with a fix.
9. Add `relationships.recommends: [{id, type: "module", manifest, reason}]` to `system.json`.
10. Add notices. Neither may reset `sheetClass` or any flags.
    - A GM notice, with counts, while the world has Codex data but no working Codex module. Check on every GM load, not only on the upgrade, because a later system or module update can produce the last two states below. The instruction depends on the module's state:
      - **Not installed** (`game.modules.get(id)` is undefined): install it, then enable it in this world.
      - **Installed, inactive, and compatible:** enable it in Manage Modules.
      - **Installed, inactive, and outside its declared system range:** install a compatible version, since Foundry won't let a GM enable this one. Check the range the way Manage Modules does: take the `starwarsffg` entry of `relationships.systems` and compare with `foundry.utils.isNewerVersion` (`module-management.mjs:159-173`).
      - **Active but failed its runtime API check:** update the module. The module reports this itself (§9.3), and the system can tell because the module never registered its sheet theme.
    - A toast on each client whose stored theme is `codex-*`.
11. Move the Codex-only sizing out of [item-sheet-ffg.js:611-617](../../../modules/items/item-sheet-ffg.js#L611).

### 9.3 Module manifest and guards

- **Manifest:** `relationships.systems: [{id: "starwarsffg", type: "system", manifest, compatibility: {minimum: "<first Codex-less release>", verified}}]`. Only add a `maximum` as a full three-part version.
- **Runtime guard, first thing:**
  - Check the system's API version before any class extends a system class, and before registering any sheet, setting, hook, socket handler or stylesheet.
  - Declare the subclasses inside a function that runs only after the check passes. A top-level `class … extends api.sheets.ActorSheetFFG` would throw partway through evaluation, and anything registered above it would stay registered.
  - On failure, register nothing and post a GM notice.
  - A system without the API (2.1.6 and earlier, with Codex built in) fails the check.
- **Packaging:**
  - Load languages through `module.json`.
  - Rewrite template and partial paths to `modules/<codex-id>/...`.
  - Move the fonts and Codex images, and reference shared assets with relative paths.
- **Sockets:** if the stat-step and crit-recovery bridges move, set `"socket": true` and use the module's own channel.

### 9.4 Release order

1. Publish the module first. Its manifest URL must answer before the system points at it.
2. Release the system with the `recommends` entry, the notices, and a CHANGELOG sub-bullet: install the module and enable it in each world, ideally before players load the new version.
3. Update the wiki and the two dependent modules in the same sitting.

## 10. Decisions for you

1. **Repository.** A separate repository, or the same one releasing two packages. Since July, 47 of 124 Codex commits also changed the system, so expect frequent coordinated releases either way. One repo keeps one CI and one review per change; a separate repo makes the licence boundary obvious.
2. **Sheet-theme settings.** The module owns them (simplest: the system keeps a resolver hook), or the system keeps them with module-contributed choices.
3. **Crit-Trauma.** The system owns it (recommended, since the Destiny Tracker already shows the campaign day), or the module does, and the tracker part is injected through a render hook.
4. **Carried toggle.** Whether the classic sheets get one.
5. **Listing.** Whether to list the module on foundryvtt.com. This affects discovery and hosted-service catalogues; the `recommends` entry needs a `manifest` either way.
6. **Module id.**
