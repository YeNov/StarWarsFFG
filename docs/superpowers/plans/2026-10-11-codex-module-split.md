# Codex II Module Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Codex II out of the Star Wars FFG system into its own Foundry module, `kelborns-swffg-codex-ii`, without losing any world data, and ship them as system 2.2.0 and module 1.0.0.

**Architecture:** The work has three parts.
- **Part 1, this repository.** Codex becomes a self-contained package in a `codex/` folder. It loads as a second system script after `swffg-main.js` and reaches the system only through a versioned public API on `globalThis.starwarsffg`. It registers its own sheets, settings, menu, styles, strings and templates, and the system stops importing or naming Codex.
- **Part 2, the new repository.** `codex/` is copied into the new repository as a module, with its own manifest, tests, CI and docs.
- **Part 3, this repository.** `codex/` is deleted from the system, `system.json` recommends the module, and GMs whose worlds still hold Codex data are told what to do.

**Tech Stack:** Foundry VTT 13 (minimum) and 14 build 364 (verified); browser ES modules; ApplicationV2 with Handlebars; Node 24 `node:test`; GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-10-codex-module-split-analysis.md`. Section numbers (§) in this plan refer to it.

## Decisions this plan rests on

- **Repository and naming.** The module lives in its own repository, `YeNov/kelborns-swffg-codex-ii`. Its package id is `kelborns-swffg-codex-ii`, and its title is "Kelborn's SWFFG Codex II", matching Kelborn's SWFFG Force Presence.
- **Gear left "not carried".** It is handled by a GM notice with a fix button. The classic sheets get no carried toggle in this work.
- **What stays in the system.**
  - Crit-Trauma (spec §10.3).
  - The stat-step and crit-recovery socket bridges. Codex calls them through the public API, so no wire protocol changes.
- **Theme settings.** The module owns the sheet-theme settings and the Configure Codex menu. It registers them under their existing `starwarsffg.*` ids, so stored values keep working and the menu stays under Star Wars FFG in Configure Settings.
- **Listing.** The module is not listed on foundryvtt.com. Both packages install from GitHub release manifests.
- **Deliberately left out:**
  - Guarding the Destiny Tracker's `campaignDay` read (spec §9.2 item 5). The setting stays registered by the system, so there is nothing to guard against.
  - Moving the Codex-only signature-ability sizing out of `modules/items/item-sheet-ffg.js:611-617` (spec §9.2 item 11). It changes how classic sheets open; do it as a follow-up.
  - Making the root-absolute `/systems/...` URLs in the Codex CSS work under a Foundry route prefix. This is a pre-existing problem; do it as a follow-up.
- **The global `#tooltip` dice-glyph rule (`cdx.css:1642-1648`).** It stays in `cdx.css` and leaves with the module, so module users see no change. Classic-only users lose it, which may well read better on mandar's light tooltip (spec §3.3). If anyone wants it back, put it into the system scoped to dark tooltips, as a follow-up.

## Global Constraints

- **Ids and versions.**
  - Module id `kelborns-swffg-codex-ii`; repository `YeNov/kelborns-swffg-codex-ii`.
  - System release `2.2.0` is the first without Codex; module release `1.0.0`.
  - Both packages: Foundry compatibility minimum `13`, verified `14`.
- **Manifests.**
  - The module's `relationships.systems` entry for `starwarsffg` has minimum `2.2.0` and no `maximum`.
  - The system's `relationships.recommends` entry carries `manifest` and `reason`. Never use `requires`.
- **Identifiers that must not change (§9.1):**
  - sheet registration scope `"ffg"`;
  - class names `CodexActorSheet`, `CodexAdversarySheet`, `CodexItemSheet` (no bundler, no minifier);
  - flag scope `starwarsffg` and every flag key in §4;
  - setting ids `starwarsffg.<key>` and the menu id `starwarsffg.codexSettings`;
  - DOM and CSS names `.cdx`, `.cdx-*`, `--cdx-*`, and the `.cdx-dice` marker;
  - base classes `ActorSheetFFG`, `AdversarySheetFFG`, `ItemSheetFFG`.
- **Codex CSS.** It is appended as unlayered `<link>` elements in Codex's own `init`, after the system's theme stylesheet. It never goes through manifest `styles`.
- **The boundary.**
  - Codex reaches the system only through `globalThis.starwarsffg` (`apiVersion` 1).
  - From Task 8 on, the system never imports, preloads, styles or names a Codex file. The one exception, during Part 1 only, is the `codex/scripts/codex-main.js` entry in `system.json` `esmodules`.
- **Tests.** Node tests may not stub `Hooks`, `ui`, the DOM or `foundry.applications`; `tests/node/stub-boundary.test.mjs` enforces this. Put logic in pure modules and keep the Foundry glue thin.
- **CSS edits.** A system CSS rule goes into `styles/mandar.css`, `styles/starwarsffg.css` and its SCSS partial. Never commit `npm run compile` output.
- **CLAUDE.md rules.**
  - Tracked files carry no absolute local paths, emails, LAN addresses or secrets. Use the placeholders below.
  - The CHANGELOG entry is written before pushing.
  - The wiki is updated in the same sitting as a user-facing change.
  - GitHub writes go only to `YeNov/*` repositories, from the `YeNov` account. Check with `gh auth status` before each write.

Placeholders used below:
- `<fvtt-root>`: the portable Foundry folder that holds `App/` and `Data/`.
- `<system-repo>`: `<fvtt-root>/Data/systems/starwarsffg`, this repository.
- `<module-repo>`: `<fvtt-root>/Data/modules/kelborns-swffg-codex-ii`.
- `<wiki-clone>`: a scratch clone of `https://github.com/YeNov/StarWarsFFG.wiki.git`.

## Review Focus

These inputs are the most likely to bite a GM or player and are not exercised by the feature tests themselves. Each is pinned by a test in the task named.

1. **A user's own Codex theme.**
   - **It survives the module's absence.** A player's browser stored a Codex sheet theme, they load 2.2.0 without the module, and later the GM installs it: their theme is still set. Nothing in the system may register, write or self-heal `defaultSheetTheme`. *Task 6:* "no system script registers, reads or writes the Codex theme settings".
   - **It counts as Codex use.** A GM who used Codex only through their own theme (no document flags, table default "default") still gets the notice, and their stored theme is left as it is. *Task 15:* "a GM who used Codex only through their own sheet theme still gets the notice".
2. **An old system plus the new module.** System 2.1.6 has Codex built in. If the new module is installed with it, the module registers nothing (no duplicate sheets, hooks, settings or CSS). *Task 7:* `api-check` "a system without the public API is refused".
3. **Two copies of Codex.** A system that still ships Codex (the Part 1 state) plus the module: exactly one copy runs. *Task 7:* `api-check` "a second copy stands down".
4. **The GM gets the fix that actually works.** A module installed but outside its system range cannot be enabled. If the module needs a newer system, the GM is told to update the system. If the module is too old for the system, or active but failed its API check, the GM is told to update the module. The same holds for the module's own startup error. *Task 15:* the `codexModuleState` and `handoffInstruction` cases; *Task 7:* the two API-version cases.5. **Fixing "not carried" gear.** In a world without the module, the fix brings the items back into encumbrance and switches the gear's Active Effects back on. The update must set `flags.starwarsffg.carried` to `true`: unsetting it skips `ItemFFG#_onUpdate`'s gear branch. *Task 15:* "the fix sets carried to true, per actor, including world items".

## File Structure

**System, created:**

| File | Responsibility |
|---|---|
| `modules/helpers/sheet-resolvers.js` | Registry of per-user default-sheet resolvers that sheet packages register; `ActorFFG`/`ItemFFG` ask it. |
| `modules/api/public-api.js` | `PUBLIC_API_VERSION`, `PUBLIC_API_SHAPE`, and `buildPublicApi()`, which validates and freezes the object published on `globalThis.starwarsffg`. |
| `modules/helpers/codex-handoff.js` | Pure rules for the "Codex II moved" notice: module state, Codex data found, the carried-fix updates. |
| `modules/helpers/codex-handoff-notice.js` | Foundry glue: gathers world data, shows the GM dialog, applies the fix, shows the player toast. |
| `tests/node/init-order.test.mjs`, `sheet-resolvers.test.mjs`, `public-api.test.mjs`, `public-api-surface.test.mjs`, `campaign-day-strings.test.mjs`, `dice-window-styles.test.mjs`, `codex-theme-owner.test.mjs`, `codex-boundary.test.mjs`, `system-manifest.test.mjs`, `codex-handoff.test.mjs` | Tests named in the tasks. |

**Codex package, created by Part 1 under `codex/` and copied whole to the module repository root in Part 2:**

| File | Responsibility |
|---|---|
| `scripts/codex-main.js` | Entry point: registers sheets, the resolver, settings, helpers, hooks, stylesheets, templates and strings. |
| `scripts/api-check.js` | Pure check of the system's public API and of a duplicate Codex copy. |
| `scripts/system-api.js` | Runs the check first. On failure it throws, so nothing registers; on success it exports `systemApi`. |
| `scripts/codex-paths.js` | `CODEX_PACKAGE_ID`, `CODEX_ROOT` (where the files are served from), and `codexVersion()`. |
| `scripts/settings.js` | Theme settings, house-rule settings, the Configure Codex menu, and the stale-theme self-heal. |
| `scripts/integrations.js` | Hooks into system windows: setting-change redraws, the item-editor skin, and the roll-dialog marker. |
| `scripts/sheet-theme.js` | Moved from `modules/helpers/sheet-theme.js`: `FOLLOW_GM_SHEET_THEME`, `effectiveSheetTheme()`. |
| `scripts/codex-sheets.js`, `codex-item-sheet.js`, `cdx-pill-stack.js`, `codex-fated-sigil.js`, `codex-talent-tiers.js`, `codex-popup-position.js`, `codex-xp-buy.js`, `codex-quantity.js`, `codex-item-labels.js` | Moved from `modules/actors/` and `modules/items/`. |
| `templates/actors/*.html`, `templates/items/*.html`, `templates/parts/*.html` | Moved from `templates/{actors,items,parts}/codex/`. |
| `styles/cdx*.css` (7 files) | Moved from `styles/`. |
| `lang/en.json` | Moved from `lang/codex/en.json`, plus 8 `SWFFG.Settings.codex.*` keys from `lang/en.json`. |
| `fonts/Orbitron-VariableFont_wght.woff2` | Moved from `fonts/`. |
| `images/eldritch/*`, `images/sith-emblem.svg` | Moved from `images/codex/eldritch/` and `images/`. |
| `tests/node/*.test.mjs`, `tests/node/_stub/foundry-stub.mjs`, `tests/browser/*.js` | Codex tests and Codex halves of split tests. |
| `package.json` | `{"type": "module"}` so Node treats the `.js` files as ES modules. |

**System, modified:** `modules/swffg-main.js`, `modules/actors/actor-ffg.js`, `modules/items/item-ffg.js`, `modules/items/item-editor.js`, `modules/dice/roll-builder.js`, `modules/settings/settings-helpers.js`, `modules/settings/ui-settings.js`, `modules/helpers/partial-templates.js`, `modules/ffg-destiny-tracker.js`, `templates/ffg-destiny-tracker.html`, `lang/en.json`, `styles/mandar.css`, `styles/starwarsffg.css`, `scss/global/_v2_layout.scss`, `system.json`, `package.json`, `tools/check-imports.mjs`, `.github/workflows/main.yml`, `tests/ffg-tests.js`, the split test files, `templates/notifications/new_version.html`, `CHANGELOG.md`, READMEs, `CLAUDE.md`, `AGENTS.md`, `LICENSE-CODEX`, `docs/project-hierarchy.md`.

## How to check a change in Foundry

Several tasks end with an in-Foundry check. Run it against the `test` world only; the other worlds are campaign worlds.

```bash
node "<fvtt-root>/App/resources/app/main.js" --dataPath="<fvtt-root>" --port=30000 --noupnp --world=test
```

- **Before starting.** If startup says the data directory is locked, the owner's own Foundry is running. Do not kill it; ask them to close it.
- **Joining.** Open `http://localhost:30000` and join as Gamemaster; it has no password.
- **Player checks.** Create a throwaway Player user and the fixtures as GM, run `game.logOut()`, and join as that player. Afterwards, log back in as GM and delete the user and fixtures.
- **Shutting down.**
  - Stop the server with Ctrl+C.
  - If `Config/options.json.lock` is left behind, remove it once port 30000 is free.
  - Launching migrates the `test` world's recorded system version. That is expected.

---

# Part 1 — Codex as a package inside the system

Branch `codex-module/prepare` from `main`.
- Part 1 changes nothing a user can see, so it needs no CHANGELOG entry and merges without a release.
- Nothing is pushed until Task 9.

```bash
git switch main
git pull --ff-only
git switch -c codex-module/prepare
npm ci --ignore-scripts
npm test
```

Expected: every test passes (1011 at the time of writing).

## Task 1: Register the system's sheets, settings and theme stylesheet before `init`'s first await

**Background:**
- Foundry does not await `init` handlers (`<fvtt-app>/client/game.mjs:652`). The system's `init` handler is async, so every module's `init` runs as soon as the system handler first awaits.
- Today that first await is the template preload at `modules/swffg-main.js:421`. So the settings, the theme stylesheet (`mandar.css`) and the sheet registrations are all still missing when a module's `init` runs.
- Worse, a sheet registered after Foundry has processed its sheet queue is dropped (spec §7). That queue is processed in `initializeSheets()`, before `game.ready` becomes true.

**Files:**
- Modify: `modules/swffg-main.js:420-421`, and move `:1341-1390` to just above `:975`.
- Test: `tests/node/init-order.test.mjs` (create).

**Interfaces:**
- Consumes: nothing.
- Produces: the system's `init` registers `SettingsHelpers.initLevelSettings()`, the theme `<link>` and every `registerSheet("ffg", …)` before its first top-level `await`. Later tasks rely on this ordering for Codex's own registrations and stylesheet.

- [ ] **Step 1: Write the failing test**

Create `tests/node/init-order.test.mjs`:

```js
/**
 * Foundry runs every module's `init` hook as soon as the system's async `init` handler reaches
 * its first `await` -- it does not wait for it. Anything the system registers after that await is
 * missing for modules, and a sheet registered after Foundry has processed its sheet queue is
 * dropped. So the system registers its settings, its theme stylesheet and its sheets first.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../../modules/swffg-main.js", import.meta.url), "utf8");
const start = source.indexOf('Hooks.once("init", async function () {');
const end = source.indexOf('Hooks.on("canvasInit"', start);
const init = source.slice(start, end);
// Statements directly in the init body are indented two spaces; nested functions sit deeper.
const firstAwait = init.search(/\n  await /);

test("the init hook was found and still awaits something", () => {
  assert.ok(start >= 0 && end > start, "init hook not found");
  assert.ok(firstAwait > 0, "no top-level await in init");
});

test("system settings are registered before the first await", () => {
  const at = init.indexOf("SettingsHelpers.initLevelSettings();");
  assert.ok(at >= 0 && at < firstAwait);
});

test("the theme stylesheet is added before the first await", () => {
  const at = init.indexOf("styles/mandar.css");
  assert.ok(at >= 0 && at < firstAwait);
});

test("the system's sheets are registered before the first await", () => {
  for (const call of ['registerSheet("ffg", ActorSheetFFG', 'registerSheet("ffg", ItemSheetFFG']) {
    const at = init.indexOf(call);
    assert.ok(at >= 0 && at < firstAwait, call);
  }
});

test("the template preload does not hold up init", () => {
  assert.doesNotMatch(init, /await foundry\.applications\.handlebars\.loadTemplates/);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/node/init-order.test.mjs`
Expected: these cases FAIL:
- "system settings are registered before the first await";
- "the theme stylesheet is added before the first await";
- "the system's sheets are registered before the first await";
- "the template preload does not hold up init".

- [ ] **Step 3: Stop awaiting the template preload**

In `modules/swffg-main.js`, replace the comment on line 420:

```js
  // Load character templates so that dynamic skills lists work correctly
```

with:

```js
  // Preload the character templates (dynamic skills lists need them) without holding up init:
  // Foundry runs every module's init hook as soon as this handler first awaits, so an await
  // here left the settings, sheets and theme stylesheet below unregistered for modules.
```

On line 421, change the start of the statement from `  await foundry.applications.handlebars.loadTemplates([` to `  foundry.applications.handlebars.loadTemplates([`. Then change its end from:

```js
"systems/starwarsffg/templates/items/codex/codex-signatureability.html"]);
```

to:

```js
"systems/starwarsffg/templates/items/codex/codex-signatureability.html"])
    .catch((err) => CONFIG.logger.error("template preload failed", err));
```

Leave the 17 paths in the array as they are.

- [ ] **Step 4: Move the sheet registrations above the next await**

Cut the block that starts with the line `  // Register sheet application classes` (currently line 1341). It ends with the `  };` that closes `CONFIG.FFG.codexSheets = {` (currently line 1390).

Paste it immediately above the line `  await gameSkillsList();` (currently line 975), with one blank line before and after.

The block reads only imported classes and `CONFIG.FFG`, which is assigned near line 279. Nothing between lines 975 and 1341 feeds it.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, including all 5 cases of `init-order.test.mjs`.

Run: `npm run check:imports`
Expected: exit 0.

- [ ] **Step 6: Check in Foundry**

Follow "How to check a change in Foundry" and check:
- A classic character sheet and a Codex character sheet both open.
- Configure Settings → Star Wars FFG lists every menu button, including Configure Codex.
- The browser console shows no errors from `starwarsffg`.

- [ ] **Step 7: Commit**

```bash
git add modules/swffg-main.js tests/node/init-order.test.mjs
git commit -m "Register sheets, settings and the theme stylesheet before init's first await"
```

## Task 2: Per-user sheet resolvers replace `CONFIG.FFG.codexSheets` in the document classes

**Background:**
- Foundry's own default sheet is per world. Codex lets each user pick a sheet style for themselves, so `ActorFFG#_getSheetClass` and `ItemFFG#_getSheetClass` route to Codex by reading `CONFIG.FFG.codexSheets` and the theme setting.
- After the split the system must not know about Codex. So the document classes ask a registry of resolvers that sheet packages register, and Codex registers its own.

**Files:**
- Create: `modules/helpers/sheet-resolvers.js`.
- Modify:
  - `modules/actors/actor-ffg.js:7` and `:15-32`;
  - `modules/items/item-ffg.js:12` and `:19-36`;
  - `modules/swffg-main.js` (imports, and after the `CONFIG.FFG.codexSheets` assignment);
  - `tests/node/gm-default-sheet-theme.test.mjs:41-47`.
- Test: `tests/node/sheet-resolvers.test.mjs` (create).

**Interfaces:**
- Consumes: nothing.
- Produces, in `modules/helpers/sheet-resolvers.js`:
  - `registerSheetResolver(packageId: string, resolver: (document) => SheetClass|null): void` (throws `TypeError` on bad arguments);
  - `hasSheetResolver(packageId: string): boolean`;
  - `resolveSheetClass(document): SheetClass|null`.
- Codex's resolver is registered under the package id `"kelborns-swffg-codex-ii"`. Task 15 checks that id.

- [ ] **Step 1: Write the failing test**

Create `tests/node/sheet-resolvers.test.mjs`:

```js
/**
 * Per-user default sheets. Foundry's own default sheet is per world; a sheet package (the Codex II
 * module) registers a resolver that picks a sheet from the user's own choice, and ActorFFG/ItemFFG
 * ask the resolvers whenever a document has no explicit ⚙ Sheet choice.
 */
import "./_stub/foundry-stub.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { registerSheetResolver, hasSheetResolver, resolveSheetClass } = await import("../../modules/helpers/sheet-resolvers.js");
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

class CharacterSheet {}
class OtherSheet {}
const character = { documentName: "Actor", type: "character" };
const vehicle = { documentName: "Actor", type: "vehicle" };

// The registry is module state shared by the cases below, so they build on each other in order.
test("with no resolver registered, no document gets a package sheet", () => {
  assert.equal(resolveSheetClass(character), null);
  assert.equal(hasSheetResolver("pkg-a"), false);
});

test("a package's resolver picks the sheet for the documents it claims", () => {
  registerSheetResolver("pkg-a", (document) => (document.type === "character" ? CharacterSheet : null));
  assert.equal(hasSheetResolver("pkg-a"), true);
  assert.equal(resolveSheetClass(character), CharacterSheet);
  assert.equal(resolveSheetClass(vehicle), null);
});

test("a resolver that throws is skipped instead of breaking every sheet", () => {
  registerSheetResolver("pkg-broken", () => { throw new Error("boom"); });
  assert.equal(resolveSheetClass(character), CharacterSheet);
  assert.equal(resolveSheetClass(vehicle), null);
});

test("registering a package again replaces its resolver", () => {
  registerSheetResolver("pkg-a", () => OtherSheet);
  assert.equal(resolveSheetClass(vehicle), OtherSheet);
});

test("a resolver needs a package id and a function", () => {
  assert.throws(() => registerSheetResolver("", () => null), TypeError);
  assert.throws(() => registerSheetResolver("pkg-c", null), TypeError);
});

test("actors and items ask the resolvers only when no sheet was picked for the document", () => {
  for (const path of ["modules/actors/actor-ffg.js", "modules/items/item-ffg.js"]) {
    const source = read(path);
    const method = source.slice(source.indexOf("_getSheetClass() {"), source.indexOf("super._getSheetClass()"));
    assert.match(method, /if \(!this\.getFlag\("core", "sheetClass"\)\)/, path);
    assert.match(method, /resolveSheetClass\(this\)/, path);
    assert.doesNotMatch(source, /codexSheets|effectiveSheetTheme/, path);
  }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/node/sheet-resolvers.test.mjs`
Expected: FAIL, because `modules/helpers/sheet-resolvers.js` is not found.

- [ ] **Step 3: Write the registry**

Create `modules/helpers/sheet-resolvers.js`:

```js
/**
 * Per-user default sheets for optional sheet packages.
 *
 * Foundry's own default sheet is per world (core.sheetClasses). A package such as the Codex II
 * module lets each user pick a sheet style for themselves, so it registers a resolver here.
 * ActorFFG/ItemFFG._getSheetClass ask the resolvers whenever a document has no explicit ⚙ Sheet
 * choice (flags.core.sheetClass) and fall back to Foundry's default when none answers.
 */
const resolvers = new Map();

/**
 * Register, or replace, a package's resolver.
 * @param {string} packageId                        The registering package's id.
 * @param {(document: object) => Function|null} resolver  The sheet class for a document, or null.
 */
export function registerSheetResolver(packageId, resolver) {
  if (typeof packageId !== "string" || !packageId) throw new TypeError("registerSheetResolver: packageId must be a non-empty string");
  if (typeof resolver !== "function") throw new TypeError("registerSheetResolver: resolver must be a function");
  resolvers.set(packageId, resolver);
}

/** Whether a package has registered a resolver, i.e. whether it started. */
export function hasSheetResolver(packageId) {
  return resolvers.has(packageId);
}

/**
 * The first sheet class a resolver picks for this document, or null.
 * A resolver that throws is skipped: one broken package must not stop every sheet from opening.
 */
export function resolveSheetClass(document) {
  for (const [packageId, resolver] of resolvers) {
    try {
      const cls = resolver(document);
      if (cls) return cls;
    } catch (err) {
      CONFIG.logger?.warn?.(`sheet resolver "${packageId}" failed`, err);
    }
  }
  return null;
}
```

- [ ] **Step 4: Ask the resolvers from the document classes**

In `modules/actors/actor-ffg.js`, replace line 7, `import { effectiveSheetTheme } from "../helpers/sheet-theme.js";`, with:

```js
import { resolveSheetClass } from "../helpers/sheet-resolvers.js";
```

Then replace the JSDoc and `_getSheetClass()` method, lines 15-32, with:

```js
  /**
   * Ask the optional sheet packages (e.g. the Codex II module) for this user's default sheet,
   * unless this actor has an explicit per-document sheet: the ⚙ Sheet picker writes
   * flags.core.sheetClass, which always wins. @override
   */
  _getSheetClass() {
    if (!this.getFlag("core", "sheetClass")) {
      const cls = resolveSheetClass(this);
      if (cls) return cls;
    }
    return super._getSheetClass();
  }
```

In `modules/items/item-ffg.js`, replace line 12, `import { effectiveSheetTheme } from "../helpers/sheet-theme.js";`, with:

```js
import { resolveSheetClass } from "../helpers/sheet-resolvers.js";
```

Then replace the JSDoc and `_getSheetClass()` method, lines 19-36, with:

```js
  /**
   * Ask the optional sheet packages (e.g. the Codex II module) for this user's default sheet,
   * unless this item has an explicit per-document sheet: the ⚙ Sheet picker writes
   * flags.core.sheetClass, which always wins. @override
   */
  _getSheetClass() {
    if (!this.getFlag("core", "sheetClass")) {
      const cls = resolveSheetClass(this);
      if (cls) return cls;
    }
    return super._getSheetClass();
  }
```

- [ ] **Step 5: Register the Codex resolver**

In `modules/swffg-main.js`, add two imports after the line `import { vehicleItemRefusal } from "./helpers/vehicle-items.js";`:

```js
import { registerSheetResolver } from "./helpers/sheet-resolvers.js";
import { effectiveSheetTheme } from "./helpers/sheet-theme.js";
```

Directly after the `CONFIG.FFG.codexSheets = { … };` statement, add:

```js
  // Per-user default sheet: this user's sheet theme picks the Codex II sheets for the types
  // they cover.
  const codexSheetFor = { Actor: [CodexActorSheet, CODEX_ACTOR_TYPES], Item: [CodexItemSheet, CODEX_ITEM_TYPES] };
  registerSheetResolver("kelborns-swffg-codex-ii", (document) => {
    const [cls, types] = codexSheetFor[document.documentName] ?? [];
    return cls && types.includes(document.type) && effectiveSheetTheme().startsWith("codex") ? cls : null;
  });
```

Leave `CONFIG.FFG.codexSheets` in place for now: `modules/items/item-editor.js` still reads it until Task 6.

- [ ] **Step 6: Update the theme-reader test**

In `tests/node/gm-default-sheet-theme.test.mjs`, replace the case "every reader of the theme goes through the resolver" (lines 41-47) with:

```js
test("every reader of the theme goes through the resolver", () => {
  const codex = read("modules/actors/codex-sheets.js");
  assert.match(codex, /effectiveSheetTheme\(\)/);
  assert.doesNotMatch(codex, /game\.settings\.get\("starwarsffg", "defaultSheetTheme"\)/);
  const main = read("modules/swffg-main.js");
  const at = main.indexOf('registerSheetResolver("kelborns-swffg-codex-ii"');
  assert.ok(at >= 0, "the Codex sheet resolver is registered");
  assert.match(main.slice(at, main.indexOf("});", at)), /effectiveSheetTheme\(\)\.startsWith\("codex"\)/);
});
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS.

Run: `npm run check:imports`
Expected: exit 0.

- [ ] **Step 8: Check in Foundry**

1. Configure Codex → Default Sheet Theme set to "Codex II — Dark": a character without a ⚙ Sheet choice opens as Codex.
2. Set it back to "Default (system sheets)": the character opens classic.
3. ⚙ Sheet → Codex II Sheet on one actor: that actor opens Codex whatever the theme.

- [ ] **Step 9: Commit**

```bash
git add modules/helpers/sheet-resolvers.js modules/actors/actor-ffg.js modules/items/item-ffg.js modules/swffg-main.js tests/node/sheet-resolvers.test.mjs tests/node/gm-default-sheet-theme.test.mjs
git commit -m "Route per-user default sheets through a resolver registry"
```

## Task 3: Publish the system's public API on `globalThis.starwarsffg`

**Background:**
- A module must not import system files by path (spec §5.8). If the URL differs from the one the system loaded, the browser loads a second copy of the system code, with its own hooks and socket state. Some hosts also block cross-package imports.
- So the system publishes what Codex needs on a global, set while `swffg-main.js` is evaluated. That is before any module script runs, so a module can extend the system's sheet classes.

**Files:**
- Create: `modules/api/public-api.js`.
- Modify:
  - `modules/settings/ui-settings.js:4`;
  - `modules/swffg-main.js` (imports, plus one statement after the imports).
- Test: `tests/node/public-api.test.mjs` and `tests/node/public-api-surface.test.mjs` (create).

**Interfaces:**
- Consumes: `registerSheetResolver`, `hasSheetResolver` and `resolveSheetClass` (Task 2).
- Produces: `globalThis.starwarsffg`, frozen, with this shape:

```
{
  apiVersion: 1,
  sheets: { ActorSheetFFG, AdversarySheetFFG, ItemSheetFFG },
  apps: { FFGFormApplication, ffgSettings },
  helpers: {
    DiceHelpers, DicePoolFFG, ActorHelpers,
    killMinionGroup, groupTrack, hullPoolSegments, stepUnits,
    availFor, applyCritRecoveryAttempt,
    isAmmoTracked, getAmmoMax, getAmmoValue,
    vehicleHardpoints, vehicleHardpointSourceRating, vehicleShieldSourceRatings, vehicleDefenceZones,
    adjustCodexStat, bindStatStepPrediction, predictedCodexStat,
  },
  sheetResolvers: { register, has, resolve },
}
```

`modules/api/public-api.js` exports `PUBLIC_API_VERSION = 1`, `PUBLIC_API_SHAPE` and `buildPublicApi(parts)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/node/public-api.test.mjs`:

```js
/**
 * The public API (modules/api/public-api.js) is the only door optional packages -- the Codex II
 * module first -- use into the system. Its shape is fixed by PUBLIC_API_SHAPE and versioned.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PUBLIC_API_SHAPE, PUBLIC_API_VERSION, buildPublicApi } from "../../modules/api/public-api.js";

const fullParts = () => Object.fromEntries(Object.entries(PUBLIC_API_SHAPE).map(
  ([group, names]) => [group, Object.fromEntries(names.map((name) => [name, () => name]))],
));

test("the API carries its version and every listed name", () => {
  const api = buildPublicApi(fullParts());
  assert.equal(api.apiVersion, PUBLIC_API_VERSION);
  for (const [group, names] of Object.entries(PUBLIC_API_SHAPE)) {
    assert.deepEqual(Object.keys(api[group]).sort(), [...names].sort(), group);
  }
});

test("a missing name is refused", () => {
  const parts = fullParts();
  delete parts.helpers.availFor;
  assert.throws(() => buildPublicApi(parts), /helpers\.availFor is missing/);
});

test("an unlisted name is refused", () => {
  const parts = fullParts();
  parts.sheets.SomethingElse = class {};
  assert.throws(() => buildPublicApi(parts), /sheets has unlisted SomethingElse/);
});

test("the API and its groups are frozen", () => {
  const api = buildPublicApi(fullParts());
  assert.ok(Object.isFrozen(api));
  for (const group of Object.keys(PUBLIC_API_SHAPE)) assert.ok(Object.isFrozen(api[group]), group);
});

test("swffg-main.js publishes the API before any hook, with every listed name", () => {
  const source = fs.readFileSync(new URL("../../modules/swffg-main.js", import.meta.url), "utf8");
  const at = source.indexOf("globalThis.starwarsffg = buildPublicApi({");
  assert.ok(at > 0, "the API is not published");
  assert.ok(at < source.indexOf('Hooks.on("setup"') && at < source.indexOf('Hooks.once("init"'));
  const call = source.slice(at, source.indexOf("});", at));
  for (const [group, names] of Object.entries(PUBLIC_API_SHAPE)) {
    for (const name of names) {
      const given = group === "sheetResolvers" ? new RegExp(`\\b${name}:`) : new RegExp(`\\b${name}\\b`);
      assert.match(call, given, `${group}.${name} is not handed to buildPublicApi`);
    }
  }
});
```

Create `tests/node/public-api-surface.test.mjs`:

```js
/**
 * Public API v1 also covers what the Codex II sheets inherit from the system's sheet classes and
 * the system partials their templates include. Renaming any of these breaks the module: bump
 * PUBLIC_API_VERSION in modules/api/public-api.js and update the module in the same change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const SURFACE = {
  "modules/apps/ffg-document-sheet.js": [
    "_getLegacyRootClasses(", "_applyLegacyRootClasses(", "async _preRender(", "async _onRender(",
    "async _onSubmit(", "_scrollPreservationSelectors(", "_minDimensions(", "static VIEWER_CONTROLS",
    "get viewerControls(",
  ],
  "modules/apps/ffg-actor-sheet.js": ["_getHeaderControls(", 'Hooks.callAll("renderActorSheetV2"'],
  "modules/actors/actor-sheet-ffg.js": [
    "async getData(", "activateListeners(html)", "async _buyCore(", "async _buySkillRank(",
    "_createSkillColumns(", "async _itemDisplayDetails(", "async _itemDetailsElement(",
    "async _ffgConfirmDelete(", "static obligationTrackContext(", "this.sheetoptions = new ActorOptions(",
    "this._afterSkillDicePoolRendered?.(",
  ],
  "modules/helpers/sheet-sync.js": ["sheet._ffgPaintAmmo?.("],
  // The settings menu Codex's Configure Codex extends (Task 6 sorts the rows by entry id).
  "modules/settings/ui-settings.js": [
    "export class ffgSettings extends FFGFormApplication", "closeOnSubmit: true",
    "html.find(\"button[name='reset']\").click(this._onResetDefaults.bind(this));", "_onResetDefaults(event) {",
    "_buildSettingsContext(acceptableSettings) {", "const s = foundry.utils.duplicate(setting[1]);",
    "s.isCheckbox = ", "s.isSelect = ", "s.isRange = ", "s.isFilePicker = ",
    "system: {title: game.system.title, menus: [], settings: includeSettings}",
    "async _updateObject(event, formData) {",
  ],
  "modules/apps/ffg-form-application.js": ["handler: FFGFormApplication._formSubmitHandler,", "async _onSubmit("],
  "templates/dialogs/ffg-ui-settings.html": [
    "{{#each data.system.settings}}", "this.namespace", "this.key", 'name="reset"', 'class="filepicker"',
  ],
};

for (const [path, needles] of Object.entries(SURFACE)) {
  test(`${path} keeps the members public API v1 covers`, () => {
    const source = read(path);
    for (const needle of needles) assert.ok(source.includes(needle), `${path} no longer has ${needle}`);
  });
}

const SHARED_PARTIALS = [
  "templates/parts/shared/ffg-effects.html",
  "templates/parts/shared/ffg-modifiers.html",
  "templates/parts/shared/ffg-sources.html",
  "templates/parts/shared/ffg-tags.html",
  "templates/parts/ffg-mods.html",
  "templates/parts/ffg-attachments.html",
  "templates/items/dialogs/ffg-modification.html",
];

test("the system partials Codex templates include exist and are preloaded", () => {
  const preload = read("modules/helpers/partial-templates.js");
  for (const path of SHARED_PARTIALS) {
    assert.ok(fs.existsSync(new URL(`../../${path}`, import.meta.url)), `${path} is missing`);
    assert.ok(preload.includes(`"systems/starwarsffg/${path}"`), `${path} is not preloaded`);
  }
});

test("the templates Codex renders directly exist", () => {
  for (const path of ["templates/dialogs/ffg-ui-settings.html", "templates/dialogs/ffg-confirm-purchase.html"]) {
    assert.ok(fs.existsSync(new URL(`../../${path}`, import.meta.url)), `${path} is missing`);
  }
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test tests/node/public-api.test.mjs tests/node/public-api-surface.test.mjs`
Expected:
- `public-api.test.mjs` FAILS, because `modules/api/public-api.js` is not found.
- `public-api-surface.test.mjs` FAILS only on `modules/settings/ui-settings.js no longer has export class ffgSettings…`, which Step 4 adds. Everything else it pins already exists.

- [ ] **Step 3: Write the API module**

Create `modules/api/public-api.js`:

```js
/**
 * The system's public API for optional packages (first user: the Codex II module).
 *
 * Published on `globalThis.starwarsffg` while swffg-main.js is evaluated, i.e. before any module
 * script runs, so a module can extend the system's sheet classes at its own top level. A module
 * must not import system files by path instead: a different URL loads a second copy of the
 * system code, with its own hooks and socket state.
 *
 * apiVersion is the contract number. Bump it, and update the Codex II module in the same change,
 * whenever a name in PUBLIC_API_SHAPE changes, or one of the members below changes its name,
 * arguments or meaning. Besides the names in PUBLIC_API_SHAPE, apiVersion 1 covers what the
 * Codex sheets inherit and override:
 *   FFGDocumentSheet: _getLegacyRootClasses, _applyLegacyRootClasses, _preRender, _onRender,
 *     _onSubmit, _scrollPreservationSelectors, _minDimensions, VIEWER_CONTROLS, viewerControls,
 *     and the V1 bridge (getData, activateListeners(html), the `template` getter);
 *   FFGActorSheet: _getHeaderControls, and the re-fired renderActorSheetV2 hook;
 *   ActorSheetFFG: _buyCore, _buySkillRank, _createSkillColumns, _itemDisplayDetails,
 *     _itemDetailsElement, _ffgConfirmDelete, sheetoptions, static obligationTrackContext,
 *     and the callbacks it invokes by name: _afterSkillDicePoolRendered, _ffgPaintAmmo;
 *   the system partials the Codex templates include;
 *   the settings menu Codex's Configure Codex extends:
 *     ffgSettings (settings/ui-settings.js): _buildSettingsContext(acceptableSettings) returns
 *       { data: { system: { title, menus, settings } } }; each settings entry is a copy of the
 *       setting's registered config (id, namespace, key, choices, range) plus name, hint, value,
 *       type, isCheckbox, isSelect, isRange, isFilePicker. _onRender wires the Reset and
 *       file-picker buttons, _onResetDefaults refills the form, _updateObject saves every
 *       changed setting, and the window closes on submit;
 *     FFGFormApplication: the form handler that feeds _onSubmit -> _updateObject;
 *     templates/dialogs/ffg-ui-settings.html: renders data.system.settings, names each input
 *       "<namespace>.<key>", and carries the Reset and file-picker buttons.
 * tests/node/public-api-surface.test.mjs pins those.
 */
export const PUBLIC_API_VERSION = 1;

export const PUBLIC_API_SHAPE = Object.freeze({
  sheets: ["ActorSheetFFG", "AdversarySheetFFG", "ItemSheetFFG"],
  apps: ["FFGFormApplication", "ffgSettings"],
  helpers: [
    "DiceHelpers", "DicePoolFFG", "ActorHelpers",
    "killMinionGroup", "groupTrack", "hullPoolSegments", "stepUnits",
    "availFor", "applyCritRecoveryAttempt",
    "isAmmoTracked", "getAmmoMax", "getAmmoValue",
    "vehicleHardpoints", "vehicleHardpointSourceRating", "vehicleShieldSourceRatings", "vehicleDefenceZones",
    "adjustCodexStat", "bindStatStepPrediction", "predictedCodexStat",
  ],
  sheetResolvers: ["register", "has", "resolve"],
});

/**
 * Freeze the parts into the public API object. A missing or unlisted name throws, so the
 * published shape cannot drift from PUBLIC_API_SHAPE unnoticed.
 * @param {Record<string, Record<string, unknown>>} parts
 * @returns {Readonly<object>}
 */
export function buildPublicApi(parts) {
  const api = { apiVersion: PUBLIC_API_VERSION };
  for (const [group, names] of Object.entries(PUBLIC_API_SHAPE)) {
    const given = parts?.[group] ?? {};
    const extra = Object.keys(given).filter((name) => !names.includes(name));
    if (extra.length) throw new Error(`starwarsffg public API: ${group} has unlisted ${extra.join(", ")}`);
    for (const name of names) {
      if (given[name] === undefined) throw new Error(`starwarsffg public API: ${group}.${name} is missing`);
    }
    api[group] = Object.freeze({ ...given });
  }
  return Object.freeze(api);
}
```

- [ ] **Step 4: Export the settings-menu base class**

In `modules/settings/ui-settings.js`, change line 4 from `class ffgSettings extends FFGFormApplication {` to:

```js
export class ffgSettings extends FFGFormApplication {
```

- [ ] **Step 5: Import the published members in `swffg-main.js`**

In `modules/swffg-main.js`, change these existing import lines:

| From | To |
|---|---|
| `import { registerGMBridge } from "./helpers/gm-bridge.js";` | `import { applyCritRecoveryAttempt, registerGMBridge } from "./helpers/gm-bridge.js";` |
| `import { registerStatStepBridge } from "./helpers/stat-step-bridge.js";` | `import { adjustCodexStat, bindStatStepPrediction, predictedCodexStat, registerStatStepBridge } from "./helpers/stat-step-bridge.js";` |
| `import { isMinionVehicle } from "./helpers/minion-group.js";` | `import { groupTrack, hullPoolSegments, isMinionVehicle, stepUnits } from "./helpers/minion-group.js";` |
| `import {xpLogUndo} from "./helpers/actor-helpers.js";` | `import ActorHelpers, { xpLogUndo } from "./helpers/actor-helpers.js";` |
| `import { computeCritAvailability } from "./helpers/crit-availability.js";` | `import { availFor, computeCritAvailability } from "./helpers/crit-availability.js";` |
| `import { registerSheetResolver } from "./helpers/sheet-resolvers.js";` | `import { hasSheetResolver, registerSheetResolver, resolveSheetClass } from "./helpers/sheet-resolvers.js";` |

Add these after the last import line:

```js
import { buildPublicApi } from "./api/public-api.js";
import { FFGFormApplication } from "./apps/ffg-form-application.js";
import { ffgSettings } from "./settings/ui-settings.js";
import { killMinionGroup } from "./helpers/minions.js";
import { getAmmoMax, getAmmoValue, isAmmoTracked } from "./helpers/ammo-helpers.js";
import { vehicleHardpointSourceRating, vehicleHardpoints, vehicleShieldSourceRatings } from "./helpers/vehicle-hardpoints.js";
import { vehicleDefenceZones } from "./helpers/vehicle-defence.js";
```

- [ ] **Step 6: Publish the API object**

After the last import line and before `async function parseSkillList() {`, add:

```js
// The system's public API for optional packages (the Codex II module): see
// modules/api/public-api.js. Set while this file is evaluated, before any module script runs.
globalThis.starwarsffg = buildPublicApi({
  sheets: { ActorSheetFFG, AdversarySheetFFG, ItemSheetFFG },
  apps: { FFGFormApplication, ffgSettings },
  helpers: {
    DiceHelpers, DicePoolFFG, ActorHelpers,
    killMinionGroup, groupTrack, hullPoolSegments, stepUnits,
    availFor, applyCritRecoveryAttempt,
    isAmmoTracked, getAmmoMax, getAmmoValue,
    vehicleHardpoints, vehicleHardpointSourceRating, vehicleShieldSourceRatings, vehicleDefenceZones,
    adjustCodexStat, bindStatStepPrediction, predictedCodexStat,
  },
  sheetResolvers: { register: registerSheetResolver, has: hasSheetResolver, resolve: resolveSheetClass },
});
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS.

Run: `npm run check:imports`
Expected: exit 0.

- [ ] **Step 8: Check in Foundry**

1. In the browser console, `Object.keys(globalThis.starwarsffg.helpers).length` returns `19`.
2. `starwarsffg.sheets.ActorSheetFFG === CONFIG.Actor.sheetClasses.character["ffg.ActorSheetFFG"].cls` returns `true`, which shows the system code is not loaded twice.

- [ ] **Step 9: Commit**

```bash
git add modules/api/public-api.js modules/settings/ui-settings.js modules/swffg-main.js tests/node/public-api.test.mjs tests/node/public-api-surface.test.mjs
git commit -m "Publish a versioned public API for optional packages"
```

## Task 4: The campaign-day strings belong to the system

**Background:**
- The Destiny Tracker and the `campaignDay` setting stay in the system, but they use five keys that live only in `lang/codex/en.json` (spec §3.3).
- Move those keys into the system's English catalog, renamed out of the Codex namespace.

**Files:**
- Modify:
  - `lang/en.json` (after line 632, `"SWFFG.Settings.codex.VehicleCritWeeklyLimit.Hint"`);
  - `lang/codex/en.json` (delete 5 keys);
  - `modules/ffg-destiny-tracker.js:368, 410, 411, 415`;
  - `templates/ffg-destiny-tracker.html:20`;
  - `modules/settings/settings-helpers.js:471, 479`.
- Test: `tests/node/campaign-day-strings.test.mjs` (create).

**Interfaces:**
- Produces these keys, in system `lang/en.json`:
  - `SWFFG.CampaignDay.Day`
  - `SWFFG.CampaignDay.Edit`
  - `SWFFG.CampaignDay.EditTitle`
  - `SWFFG.CampaignDay.EditLabel`
  - `SWFFG.CampaignDay.EditSet`

- [ ] **Step 1: Write the failing test**

Create `tests/node/campaign-day-strings.test.mjs`:

```js
/**
 * The campaign day (Destiny Tracker readout, its edit dialog, the campaignDay setting) is a system
 * feature, so its strings live in the system's catalog -- not in the Codex II one, which a world
 * without the Codex II module never loads.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const english = JSON.parse(read("lang/en.json").replace(/^﻿/, ""));

const KEYS = {
  "SWFFG.CampaignDay.Day": "Day",
  "SWFFG.CampaignDay.Edit": "Edit",
  "SWFFG.CampaignDay.EditTitle": "Set Campaign Day",
  "SWFFG.CampaignDay.EditLabel": "Day number",
  "SWFFG.CampaignDay.EditSet": "Set",
};

test("the campaign-day strings are in the system's English catalog", () => {
  for (const [key, text] of Object.entries(KEYS)) assert.equal(english[key], text, key);
});

test("the Destiny Tracker and the campaignDay setting use them", () => {
  const tracker = read("modules/ffg-destiny-tracker.js");
  for (const key of ["SWFFG.CampaignDay.Edit\"", "SWFFG.CampaignDay.EditTitle", "SWFFG.CampaignDay.EditLabel", "SWFFG.CampaignDay.EditSet"]) {
    assert.ok(tracker.includes(key), key);
  }
  assert.ok(read("templates/ffg-destiny-tracker.html").includes('"SWFFG.CampaignDay.Day"'));
  assert.equal(read("modules/settings/settings-helpers.js").split("SWFFG.CampaignDay.Day").length - 1, 2);
});

test("no system file still uses the Codex keys for the campaign day", () => {
  for (const path of ["modules/ffg-destiny-tracker.js", "templates/ffg-destiny-tracker.html", "modules/settings/settings-helpers.js"]) {
    assert.doesNotMatch(read(path), /SWFFG\.Codex\.CritTrauma\.(Day|EditDay)/, path);
  }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/node/campaign-day-strings.test.mjs`
Expected: all three cases FAIL.

- [ ] **Step 3: Move the strings**

In `lang/en.json`, after the line `"SWFFG.Settings.codex.VehicleCritWeeklyLimit.Hint": "…",`, insert:

```json
  "SWFFG.CampaignDay.Day": "Day",
  "SWFFG.CampaignDay.Edit": "Edit",
  "SWFFG.CampaignDay.EditTitle": "Set Campaign Day",
  "SWFFG.CampaignDay.EditLabel": "Day number",
  "SWFFG.CampaignDay.EditSet": "Set",
```

In `lang/codex/en.json`, delete the five lines whose keys are `SWFFG.Codex.CritTrauma.Day`, `.EditDay`, `.EditDayTitle`, `.EditDayLabel` and `.EditDaySet`.

Then replace the keys where they are used:

| File:line | From | To |
|---|---|---|
| `modules/ffg-destiny-tracker.js:368` | `"SWFFG.Codex.CritTrauma.EditDay"` | `"SWFFG.CampaignDay.Edit"` |
| `modules/ffg-destiny-tracker.js:410` | `"SWFFG.Codex.CritTrauma.EditDayTitle"` | `"SWFFG.CampaignDay.EditTitle"` |
| `modules/ffg-destiny-tracker.js:411` | `"SWFFG.Codex.CritTrauma.EditDayLabel"` | `"SWFFG.CampaignDay.EditLabel"` |
| `modules/ffg-destiny-tracker.js:415` | `"SWFFG.Codex.CritTrauma.EditDaySet"` | `"SWFFG.CampaignDay.EditSet"` |
| `templates/ffg-destiny-tracker.html:20` | `"SWFFG.Codex.CritTrauma.Day"` | `"SWFFG.CampaignDay.Day"` |
| `modules/settings/settings-helpers.js:471` | `"SWFFG.Codex.CritTrauma.Day"` | `"SWFFG.CampaignDay.Day"` |
| `modules/settings/settings-helpers.js:479` | `"SWFFG.Codex.CritTrauma.Day"` | `"SWFFG.CampaignDay.Day"` |

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, including `lang-expansion.test.mjs` for both catalogs.

- [ ] **Step 5: Check in Foundry**

1. The Destiny Tracker reads "Day N".
2. As GM, right-click it: the menu shows "Edit".
3. The dialog is titled "Set Campaign Day", with "Day number" and a "Set" button.
4. [+] still advances the day.

- [ ] **Step 6: Commit**

```bash
git add lang/en.json lang/codex/en.json modules/ffg-destiny-tracker.js templates/ffg-destiny-tracker.html modules/settings/settings-helpers.js tests/node/campaign-day-strings.test.mjs
git commit -m "Move the campaign-day strings into the system catalog"
```

## Task 5: The dice-window styles belong to the system

**Background:**
- The Replace Die dialogs (reroll, turn to face, add a die, add a result) add `.cdx-dice` for every user (`modules/helpers/replace-die.js:332, 379, 424`). The styles that marker selects live only in `styles/cdx.css:833-868`, so every user would lose them along with the Codex CSS (spec §3.3).
- The system already owns the footer part (`.cdx-dice .form-footer`), so move the rest beside it.
- The rules go at the end of `mandar.css`: like `cdx.css` today, they must come after mandar's own `.dice-pool` rules.

**Files:**
- Modify:
  - `styles/cdx.css` (cut lines 833-868);
  - `styles/mandar.css` (append at end of file);
  - `styles/starwarsffg.css` (append at end of file);
  - `scss/global/_v2_layout.scss` (insert after the `.cdx-dice .form-footer` rule ending at line 174).
- Test: `tests/node/dice-window-styles.test.mjs` (create).

- [ ] **Step 1: Write the failing test**

Create `tests/node/dice-window-styles.test.mjs`:

```js
/**
 * `.cdx-dice` marks the dice windows drawn on the dark dialog: the Replace Die dialogs always, and
 * the roll builder when the rolling actor uses a Codex II sheet. Their styling is the system's --
 * every user sees the Replace Die dialogs -- so it lives in the system stylesheets (mandar.css for
 * the default theme, starwarsffg.css and its SCSS for the retired Default theme), not in cdx.css.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const SELECTORS = [
  ".cdx-dice .dice-pool { background:transparent !important; }",
  ".cdx-dice .dice-pool .ffg-die-icon {",
  ".cdx-dice .dice-pool .ffg-die-icon img {",
  ".cdx-dice .dice-pool-dialog span.dietype.setback, .cdx-dice .dice-pool-dialog span.dietype.dark {",
  ".cdx-dice .dice-pool-dialog span.dietype:is(",
  ".cdx-dice .pool-additional-container {",
  ".cdx-dice .pool-additional-container td:nth-child(3n+1) {",
  ".cdx-dice .pool-additional-container td:nth-child(3n+2) {",
  ".cdx-dice .pool-additional-container td:nth-child(3n) {",
  '.cdx-dice .pool-additional-container input[type="button"] {',
  '.cdx-dice .dice-pool img[src*="black.png"], .cdx-dice .dice-pool img[src*="black-minus"], .cdx-dice .dice-pool img[src*="darkpip"] {',
  ".cdx-dice .dice-pool img:is(",
  '.cdx-dice .pool-dice-pool img[src*="black.png"] {',
];

for (const path of ["styles/mandar.css", "styles/starwarsffg.css", "scss/global/_v2_layout.scss"]) {
  test(`${path} styles the dice windows`, () => {
    const css = read(path);
    for (const selector of SELECTORS) assert.ok(css.includes(selector), `${path} lacks ${selector}`);
  });
}

test("the Codex stylesheet no longer carries the dice-window rules", () => {
  assert.doesNotMatch(read("styles/cdx.css"), /^\.cdx-dice /m);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/node/dice-window-styles.test.mjs`
Expected: all four cases FAIL.

- [ ] **Step 3: Move the rules**

1. **Cut the block.** In `styles/cdx.css`, cut from the line `/* === Codex dice roll window ===` (currently 833) through the line `.cdx-dice .pool-dice-pool img[src*="black.png"] { filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff); }` (currently 868).
2. **Replace its first comment.** In the cut text, replace the first comment (the six lines from `/* === Codex dice roll window ===` through `…The adversary preview is also a \`.dice-pool\` → covered. */`) with:

   ```css
   /* Dice windows drawn on the dark dialog. `.cdx-dice` marks them: the Replace Die dialogs
      (reroll, turn to face, add a die, add a result) always, and the roll builder when the
      rolling actor uses a Codex II sheet. Drop the white dice-pool background and give the
      glyphs and result icons the dark-dialog treatment so the pool reads. The adversary
      preview is also a `.dice-pool`, so it is covered. */
   ```

3. **Paste it in three places.** Paste the edited block, unchanged otherwise, here:
   - at the very end of `styles/mandar.css`, after one blank line;
   - at the very end of `styles/starwarsffg.css`, after one blank line;
   - in `scss/global/_v2_layout.scss`, directly after the closing `}` of the `.cdx-dice .form-footer, … { background: transparent; }` rule (line 174), after one blank line. The block is plain CSS, so it is valid SCSS as it stands.

Do not run `npm run compile`. `styles/starwarsffg.css` is maintained by hand.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Check in Foundry**

1. Roll a skill from a classic sheet and right-click a die in the posted roll → Reroll. The Replace Die dialog's pool keeps its transparent background, and its result icons stay white with outlined setback dice, as before.
2. Repeat from a Codex sheet's actor, and open the roll builder from that actor. It looks the same as before the change.

- [ ] **Step 6: Commit**

```bash
git add styles/cdx.css styles/mandar.css styles/starwarsffg.css scss/global/_v2_layout.scss tests/node/dice-window-styles.test.mjs
git commit -m "Move the dice-window styles into the system stylesheets"
```

## Task 6: Codex owns its settings, menu and window integrations

**Background:**
- Today the system registers the theme settings, the Codex house-rule settings and the Configure Codex menu, and self-heals the theme at `ready`. It also skins the item editor for Codex, marks the roll dialog for Codex actors, and calls `refreshOpenCodexSheets` from three setting `onChange` handlers.
- All of that moves into Codex-owned files. For now those files stay next to the other Codex files in `modules/actors/`; Task 7 moves them all together.
- The registrations keep their ids, so stored values and the menu's place in Configure Settings do not change.
- The menu button moves to the end of the Star Wars FFG menu list, because it is now registered after the system's menus. That is the only visible difference.

**Files:**
- Create:
  - `modules/actors/codex-settings.js`
  - `modules/actors/codex-integrations.js`
- Move: `modules/helpers/sheet-theme.js` → `modules/actors/codex-sheet-theme.js` (`git mv`, contents unchanged).
- Modify:
  - `modules/settings/settings-helpers.js`
  - `modules/settings/ui-settings.js:319-340`
  - `modules/items/item-editor.js:6, 29-41, 140-146`
  - `modules/dice/roll-builder.js:228-240`
  - `modules/swffg-main.js`
  - `modules/actors/codex-sheets.js:40`
- Test: create `tests/node/codex-theme-owner.test.mjs` and `tests/node/codex-integrations.test.mjs`; rewrite `tests/node/gm-default-sheet-theme.test.mjs`.

**Interfaces:**
- Consumes: `ffgSettings`, exported in Task 3.
- Produces:
  - `modules/actors/codex-settings.js`:
    - `registerCodexSettings(): void`, called during `init`;
    - `healStaleThemeChoice(): Promise<void>`, called at `ready`.
  - `modules/actors/codex-integrations.js`: `registerCodexIntegrations(): void`, called during `init`.
  - `modules/actors/codex-sheet-theme.js`: `FOLLOW_GM_SHEET_THEME`, `effectiveSheetTheme()`, unchanged.

- [ ] **Step 1: Write the failing tests**

Create `tests/node/codex-theme-owner.test.mjs`:

```js
/**
 * The sheet-theme settings, the Codex house rules and the Configure Codex menu belong to Codex II,
 * which registers them itself. The system must never register, read or write them: a player whose
 * browser stored a Codex theme must still have it when the Codex II module comes back after a load
 * without it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CODEX_FILE = /^(codex|cdx)-/;

function systemScripts(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) systemScripts(full, out);
    else if (entry.name.endsWith(".js") && !CODEX_FILE.test(entry.name)) out.push(full);
  }
  return out;
}

test("no system script registers, reads or writes the Codex theme settings", () => {
  // Reading the raw stored value (game.settings.storage…getItem) stays allowed: the Part 3
  // hand-off notice does that to tell a player their theme needs the module.
  for (const file of systemScripts(path.join(ROOT, "modules"))) {
    const source = fs.readFileSync(file, "utf8");
    const where = path.relative(ROOT, file);
    assert.doesNotMatch(source, /game\.settings\.(register|get|set)\(\s*"starwarsffg",\s*"(gmD|d)efaultSheetTheme"/, where);
    assert.doesNotMatch(source, /settings\.settings\.get\("starwarsffg\.(gmD|d)efaultSheetTheme"\)/, where);
  }
});

test("no system script registers the Configure Codex menu or the Codex house rules", () => {
  for (const file of systemScripts(path.join(ROOT, "modules"))) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /"codexSettings"|"codexAdvantageHealsStrain"|"codexTalentTierSorting"/, path.relative(ROOT, file));
  }
});
```

Create `tests/node/codex-integrations.test.mjs`:

```js
/**
 * Codex II reaches into system windows through hooks instead of the system reaching into Codex:
 * open Codex sheets redraw when a setting they show changes, the embedded item editor takes the
 * Codex skin, and the roll dialog gets the dark dice marker for an actor on a Codex sheet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const INTEGRATIONS = "modules/actors/codex-integrations.js";

test("Codex hooks the setting changes, the item editor and the roll dialog", () => {
  const source = read(INTEGRATIONS);
  for (const hook of ["createSetting", "updateSetting", "renderitemEditor", "renderRollBuilderFFG"]) {
    assert.match(source, new RegExp(`Hooks\\.on\\("${hook}"`), hook);
  }
  for (const key of ["starwarsffg.campaignDay", "starwarsffg.vehicleCritWeeklyLimit", "starwarsffg.codexTalentTierSorting"]) {
    assert.ok(source.includes(`"${key}"`), key);
  }
});

test("the system's windows no longer know about Codex", () => {
  assert.doesNotMatch(read("modules/items/item-editor.js"), /codex|cdx/i);
  assert.doesNotMatch(read("modules/dice/roll-builder.js"), /codex|cdx-dice/i);
  assert.doesNotMatch(read("modules/settings/settings-helpers.js"), /refreshOpenCodexSheets|codex-sheets\.js/);
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test tests/node/codex-theme-owner.test.mjs tests/node/codex-integrations.test.mjs`
Expected: FAIL. Both theme-owner cases report `modules/settings/settings-helpers.js`, and `codex-integrations.js` is not found.

- [ ] **Step 3: Move the theme resolver next to the other Codex files**

```bash
git mv modules/helpers/sheet-theme.js modules/actors/codex-sheet-theme.js
```

In `modules/actors/codex-sheets.js`, change line 40 from `import { effectiveSheetTheme } from "../helpers/sheet-theme.js";` to:

```js
import { effectiveSheetTheme } from "./codex-sheet-theme.js";
```

In `modules/swffg-main.js`, change `import { effectiveSheetTheme } from "./helpers/sheet-theme.js";`, added in Task 2, to:

```js
import { effectiveSheetTheme } from "./actors/codex-sheet-theme.js";
```

- [ ] **Step 4: Create the Codex settings file**

Create `modules/actors/codex-settings.js`:

```js
/**
 * Codex II settings: each user's sheet theme, the GM's default theme for the table, the Codex house
 * rules, and the Configure Codex menu that edits them (with the system's vehicleCritWeeklyLimit).
 * Codex registers them itself, under the system's namespace, so the values stored while Codex was
 * part of the system keep working and the menu stays under Star Wars FFG in Configure Settings.
 */
import { ffgSettings } from "../settings/ui-settings.js";
import { FOLLOW_GM_SHEET_THEME } from "./codex-sheet-theme.js";

/** The settings Configure Codex shows, in this order. */
const CODEX_MENU_SETTINGS = [
  "starwarsffg.gmDefaultSheetTheme",
  "starwarsffg.defaultSheetTheme",
  "starwarsffg.codexAdvantageHealsStrain",
  "starwarsffg.codexTalentTierSorting",
  "starwarsffg.vehicleCritWeeklyLimit",
];

class codexSettings extends ffgSettings {
  static DEFAULT_OPTIONS = {
    id: "codex-settings",
    classes: ["starwarsffg", "codex-settings"],
    window: { title: "SWFFG.Settings.codex.Title" },
  };

  static PARTS = {
    content: { root: true, template: "systems/starwarsffg/templates/dialogs/ffg-ui-settings.html" },
  };

  async _prepareContext(_options) {
    const context = this._buildSettingsContext(CODEX_MENU_SETTINGS);
    // The system registers vehicleCritWeeklyLimit before Codex registers the rest, so order the
    // rows by the list rather than by registration.
    context.data.system.settings.sort((a, b) => CODEX_MENU_SETTINGS.indexOf(a.id) - CODEX_MENU_SETTINGS.indexOf(b.id));
    return context;
  }
}

/** Register the Codex settings and the Configure Codex menu. Call during init. */
export function registerCodexSettings() {
  // Not GM-restricted: the menu holds the per-client Default Sheet Theme, which every user sets
  // for themselves. World-scoped (GM-only) settings inside it — e.g. the strain house rule — are
  // filtered out for non-GMs in _buildSettingsContext, so players see only what they can change.
  game.settings.registerMenu("starwarsffg", "codexSettings", {
    name: game.i18n.localize("SWFFG.Settings.codex.Name"),
    hint: game.i18n.localize("SWFFG.Settings.codex.Hint"),
    label: game.i18n.localize("SWFFG.Settings.codex.Label"),
    icon: "fa-solid fa-book-sparkles",
    type: codexSettings,
    restricted: false,
  });

  // The sheet themes a user or the GM can pick. The value is `codex-<scheme>` for Codex, so one
  // selector sets both the sheet style and the default Codex colour scheme.
  const sheetThemes = {
    default: "Default (system sheets)",
    "codex-republic": "Codex II — Republic",
    "codex-empire": "Codex II — Empire",
    "codex-dark": "Codex II — Dark",
    "codex-light": "Codex II — Light",
    "codex-mercenary": "Codex II — Mercenary",
    "codex-eldritch-scholar": "Codex II — Eldritch Horror - Scholar",
    "codex-eldritch-fate": "Codex II — Eldritch Horror - Fate",
  };

  // The GM's default sheet theme for the table: what every user gets while their own Default
  // Sheet Theme (below) is on "Use the GM's default", the value each browser starts with.
  // A change reloads only the browsers that follow it.
  game.settings.register("starwarsffg", "gmDefaultSheetTheme", {
    name: "GM's Default Sheet Theme",
    hint: "The sheet style (and Codex II colour scheme) for everyone whose own Default Sheet Theme is Use the GM's default, which is what every user starts with. A user who picked their own keeps it. Reloads their browsers on change.",
    scope: "world",
    config: false,
    default: "default",
    type: String,
    choices: sheetThemes,
    onChange: () => {
      if (game.settings.get("starwarsffg", "defaultSheetTheme") === FOLLOW_GM_SHEET_THEME) foundry.utils.debouncedReload();
    },
  });

  // Default sheet theme — client-scoped (per world, local to each user). Picks which sheet style
  // new/unconfigured documents open with, and the default Codex colour scheme. Starts on
  // FOLLOW_GM_SHEET_THEME, which defers to the GM's setting above. Documents with an explicit
  // per-document sheet (the ⚙ Sheet button, flags.core.sheetClass) or scheme flag keep their own
  // choice. Resolved through effectiveSheetTheme() in the Codex sheet resolver and cdxDefaultScheme.
  game.settings.register("starwarsffg", "defaultSheetTheme", {
    name: "Default Sheet Theme",
    hint: "Which sheet style (and Codex II colour scheme) to use by default. Stored locally per client; Use the GM's default follows the GM's choice. Documents with an explicitly chosen sheet/scheme keep that choice. Reloads on change.",
    scope: "client",
    config: false,
    default: FOLLOW_GM_SHEET_THEME,
    type: String,
    choices: {
      [FOLLOW_GM_SHEET_THEME]: "Use the GM's default",
      ...sheetThemes,
    },
    onChange: foundry.utils.debouncedReload,
  });

  // Codex house rule: whether advantages recover strain during Post-Encounter strain recovery
  // (every 2 advantages = 1 strain). On by default. Read by the codex sheet's
  // _cdxApplyStrainRecovery.
  game.settings.register("starwarsffg", "codexAdvantageHealsStrain", {
    name: game.i18n.localize("SWFFG.Settings.codex.AdvantageHealsStrain.Name"),
    hint: game.i18n.localize("SWFFG.Settings.codex.AdvantageHealsStrain.Hint"),
    scope: "world",
    config: false,
    default: true,
    type: Boolean,
  });

  // Codex talents tab: group the talent cards under "Tier N" headings instead of one flat list.
  // On by default. Read by the codex sheet's _prepareContext; open sheets redraw on a change from
  // the setting hook in codex-integrations.js.
  game.settings.register("starwarsffg", "codexTalentTierSorting", {
    name: game.i18n.localize("SWFFG.Settings.codex.TalentTierSorting.Name"),
    hint: game.i18n.localize("SWFFG.Settings.codex.TalentTierSorting.Hint"),
    scope: "world",
    config: false,
    default: true,
    type: Boolean,
  });
}

/**
 * Self-heal a stale `defaultSheetTheme` client value. Call at ready.
 *
 * The setting originally offered a bare "codex" option; the scheme-fold replaced it with
 * per-scheme keys ("codex-<scheme>") and dropped "codex" from the choices. A client left on the
 * legacy "codex" (or any value no longer in the choices) still routes to the Codex sheet
 * (startsWith("codex")), yet the settings dropdown can't render the missing value — so it shows
 * "Default (system sheets)" as selected while sheets still open as Codex II, and re-picking
 * Default fires no change. Reset any out-of-choices value to the setting's default ("Use the GM's
 * default") so the effective sheet and the dropdown agree. Runs once: after the reset the value is
 * a valid choice.
 */
export async function healStaleThemeChoice() {
  try {
    const cfg = game.settings.settings.get("starwarsffg.defaultSheetTheme");
    const current = game.settings.get("starwarsffg", "defaultSheetTheme");
    if (cfg?.choices && !(current in cfg.choices)) {
      await game.settings.set("starwarsffg", "defaultSheetTheme", cfg.default);
    }
  } catch (err) {
    CONFIG.logger?.warn?.("defaultSheetTheme normalization skipped", err);
  }
}
```

- [ ] **Step 5: Create the Codex integrations file**

Create `modules/actors/codex-integrations.js`:

```js
/**
 * Codex II's hooks into system windows it does not own. Open Codex sheets redraw when a setting
 * they show changes; the embedded item editor opened from a Codex item sheet takes its scheme; the
 * roll dialog for an actor on a Codex sheet gets the dark dice marker (its styles are the system's).
 */
import { CodexItemSheet } from "../items/codex-item-sheet.js";
import { cdxNormalizeScheme, cdxSchemeClasses, refreshOpenCodexSheets } from "./codex-sheets.js";

/**
 * World settings an open Codex sheet shows. World settings are Setting documents, so a change
 * fires createSetting (first write) or updateSetting on every client.
 */
const REDRAW_ON = new Set([
  "starwarsffg.campaignDay",
  "starwarsffg.vehicleCritWeeklyLimit",
  "starwarsffg.codexTalentTierSorting",
]);

/** Register the hooks. Call during init. */
export function registerCodexIntegrations() {
  const redraw = (setting) => {
    if (REDRAW_ON.has(setting.key)) refreshOpenCodexSheets();
  };
  Hooks.on("createSetting", redraw);
  Hooks.on("updateSetting", redraw);
  // Fires for itemEditor and its talentEditor / forcePowerEditor subclasses alike.
  Hooks.on("renderitemEditor", skinItemEditor);
  Hooks.on("renderRollBuilderFFG", markCodexDiceWindow);
}

/**
 * Skin the embedded item editor ONLY when its host item resolves to the Codex item sheet (a
 * stock-sheet weapon keeps the stock editor): `cdx` + `cdx-embed` on the window so the palette
 * vars resolve, and the host item's (or its actor's) scheme class on the content form.
 */
function skinItemEditor(app) {
  const host = app.data?.sourceObject;
  if (!app.element || host?._getSheetClass?.() !== CodexItemSheet) return;
  const stored = host.getFlag?.("starwarsffg", "scheme") ?? host.actor?.getFlag?.("starwarsffg", "scheme");
  app.element.classList.add("cdx", "cdx-embed");
  app.form?.classList?.add(...cdxSchemeClasses(cdxNormalizeScheme(stored) ?? "republic"));
}

/**
 * Give the roll dialog the dark dice treatment ONLY when the rolling actor uses a Codex sheet.
 * A dedicated marker (`.cdx-dice`), not `.cdx`, whose broad `.cdx form input,…button` rules would
 * restyle the stock dialog controls.
 */
function markCodexDiceWindow(app) {
  try {
    const rollActor = app.roll?.item?.actor
      ?? (app.roll?.data?.actor?._id ? game.actors.get(app.roll.data.actor._id) : null);
    const sheetClass = rollActor?.getFlag?.("core", "sheetClass") ?? "";
    const isCodex = sheetClass.includes("Codex")
      || (rollActor?._sheet?.constructor?.name ?? "").startsWith("Codex");
    app.element?.classList?.toggle("cdx-dice", !!isCodex);
  } catch (e) { /* on any detection error, leave the stock dialog styling */ }
}
```

- [ ] **Step 6: Remove the Codex settings from `settings-helpers.js`**

In `modules/settings/settings-helpers.js`:

1. In the import list at the top, delete these lines:
   - `  codexSettings,`
   - `import { refreshOpenCodexSheets } from "../actors/codex-sheets.js";`
   - `import { FOLLOW_GM_SHEET_THEME } from "../helpers/sheet-theme.js";`
2. Delete the block that starts with the comment `    // Not GM-restricted: the menu holds the per-client Default Sheet Theme, which`. It ends with the `    });` that closes `game.settings.registerMenu("starwarsffg", "codexSettings", {`.
3. Delete the block that starts with the comment `    // The sheet themes a user or the GM can pick. The value is \`codex-<scheme>\``. It ends with the `    });` that closes `game.settings.register("starwarsffg", "defaultSheetTheme", {`.
4. Delete the block that starts with `    // Codex house rule: whether advantages recover strain during Post-Encounter`. It ends with the `    });` that closes `game.settings.register("starwarsffg", "codexTalentTierSorting", {`.
5. In `game.settings.register("starwarsffg", "campaignDay", { … })`, replace the whole `onChange` property with:

   ```js
      // Rewrite the Destiny Tracker's readout in place (null-guarded). Open Codex II sheets
      // redraw from Codex's own setting hook.
      onChange: () => {
        const el = document.querySelector("#ffg-campaign-day .ffg-campaign-day-value");
        if (el) el.textContent = `${game.i18n.localize("SWFFG.CampaignDay.Day")} ${Math.floor(Number(game.settings.get("starwarsffg", "campaignDay")) || 0)}`;
      },
   ```

6. In `game.settings.register("starwarsffg", "vehicleCritWeeklyLimit", { … })`, delete the line `      onChange: () => refreshOpenCodexSheets(),`.

In `modules/settings/ui-settings.js`, delete the whole `export class codexSettings extends ffgSettings { … }` block (lines 319-340).

- [ ] **Step 7: Remove the Codex code from the item editor and the roll builder**

In `modules/items/item-editor.js`:
1. Delete line 6, `import { cdxNormalizeScheme, cdxSchemeClasses } from "../actors/codex-sheets.js";`.
2. In the constructor, delete the block from `    // Codex skin — applied ONLY when the host item's resolved sheet is the Codex` through `    } catch (e) { this._cdx = false; }`.
3. In `_onRender`, delete the block from `    // Apply the Codex scope when the host uses a Codex sheet: \`cdx\` (+ \`cdx-embed\`)` through the closing `    }` of `if (this._cdx && this.element) {`.

In `modules/dice/roll-builder.js`, delete the block from `    // Codex-style the dice window (drop the white pool background + apply the` through `    } catch (e) { /* on any detection error, leave the stock dialog styling */ }`.

Then check that nothing else in those two files mentions Codex:

Run: `grep -n -i "codex\|cdx" modules/items/item-editor.js modules/dice/roll-builder.js`
Expected: no output.

- [ ] **Step 8: Call the Codex registrations from `swffg-main.js`**

In `modules/swffg-main.js`:

1. Add the imports below. They are a system → Codex link that Task 7 cuts.

   ```js
   import { healStaleThemeChoice, registerCodexSettings } from "./actors/codex-settings.js";
   import { registerCodexIntegrations } from "./actors/codex-integrations.js";
   ```

2. Directly after `  SettingsHelpers.initLevelSettings();`, add:

   ```js
     registerCodexSettings();
     registerCodexIntegrations();
   ```

3. In the `ready` hook, replace the block from `  // Self-heal a stale \`defaultSheetTheme\` client value.` through the closing `  }` of its `try … catch` with:

   ```js
     await healStaleThemeChoice();
   ```

4. Delete the `CONFIG.FFG.codexSheets = { … };` statement and the comment above it (`  // Stash the Codex sheet classes + the types they cover…`). Nothing reads it any more: the resolver replaced it in the document classes, and the item editor no longer looks for Codex.

- [ ] **Step 9: Rewrite the theme test for its new home**

Replace the whole of `tests/node/gm-default-sheet-theme.test.mjs` with:

```js
/**
 * The GM can set the table's default sheet theme. Each browser's own Default Sheet Theme starts on
 * "Use the GM's default" and follows the world setting; a player who picks a theme of their own
 * keeps it. Codex II owns these settings.
 */
import { setSetting, resetSettings } from "./_stub/foundry-stub.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const { effectiveSheetTheme, FOLLOW_GM_SHEET_THEME } = await import("../../modules/actors/codex-sheet-theme.js");

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const SETTINGS = "modules/actors/codex-settings.js";

/** Seed this browser's choice and the GM's world default, then resolve. */
function themeFor(client, world) {
  resetSettings();
  if (client !== undefined) setSetting("starwarsffg", "defaultSheetTheme", client);
  if (world !== undefined) setSetting("starwarsffg", "gmDefaultSheetTheme", world);
  return effectiveSheetTheme();
}

test("a browser on Use the GM's default gets the GM's theme", () => {
  assert.equal(themeFor(FOLLOW_GM_SHEET_THEME, "codex-empire"), "codex-empire");
  assert.equal(themeFor(FOLLOW_GM_SHEET_THEME, "default"), "default");
});

test("a theme the player picked wins over the GM's", () => {
  assert.equal(themeFor("default", "codex-empire"), "default");
  assert.equal(themeFor("codex-dark", "default"), "codex-dark");
  assert.equal(themeFor("codex", "default"), "codex", "the legacy bare value still reads as Codex");
});

test("with nothing set anywhere the system sheets are used", () => {
  assert.equal(themeFor(FOLLOW_GM_SHEET_THEME, undefined), "default");
  assert.equal(themeFor(undefined, undefined), "default");
});

test("every reader of the theme goes through the resolver", () => {
  const codex = read("modules/actors/codex-sheets.js");
  assert.match(codex, /effectiveSheetTheme\(\)/);
  assert.doesNotMatch(codex, /game\.settings\.get\("starwarsffg", "defaultSheetTheme"\)/);
  const main = read("modules/swffg-main.js");
  const at = main.indexOf('registerSheetResolver("kelborns-swffg-codex-ii"');
  assert.ok(at >= 0, "the Codex sheet resolver is registered");
  assert.match(main.slice(at, main.indexOf("});", at)), /effectiveSheetTheme\(\)\.startsWith\("codex"\)/);
});

test("each browser starts on Use the GM's default, and the GM's setting is world-wide", () => {
  const source = read(SETTINGS);
  const gm = source.indexOf('game.settings.register("starwarsffg", "gmDefaultSheetTheme"');
  const client = source.indexOf('game.settings.register("starwarsffg", "defaultSheetTheme"');
  assert.ok(gm >= 0 && client > gm);
  const gmBlock = source.slice(gm, client);
  assert.match(gmBlock, /scope: "world"/);
  assert.match(gmBlock, /default: "default"/, "nothing changes until the GM picks a theme");
  const clientBlock = source.slice(client, source.indexOf("});", client));
  assert.match(clientBlock, /scope: "client"/);
  assert.match(clientBlock, /default: FOLLOW_GM_SHEET_THEME/);
  assert.match(clientBlock, /\[FOLLOW_GM_SHEET_THEME\]: /, "the follow choice is offered, so the startup self-heal keeps it");
});

test("a GM change reloads only the browsers that follow it", () => {
  const source = read(SETTINGS);
  const gm = source.indexOf('game.settings.register("starwarsffg", "gmDefaultSheetTheme"');
  const gmBlock = source.slice(gm, source.indexOf('game.settings.register("starwarsffg", "defaultSheetTheme"'));
  assert.match(gmBlock, /if \(game\.settings\.get\("starwarsffg", "defaultSheetTheme"\) === FOLLOW_GM_SHEET_THEME\) foundry\.utils\.debouncedReload\(\);/);
});

test("Configure Codex lists the GM's setting first", () => {
  const source = read(SETTINGS);
  const start = source.indexOf("const CODEX_MENU_SETTINGS = [");
  const list = source.slice(start, source.indexOf("];", start));
  const gm = list.indexOf('"starwarsffg.gmDefaultSheetTheme"');
  assert.ok(gm >= 0 && gm < list.indexOf('"starwarsffg.defaultSheetTheme"'));
});

test("a legacy theme value is reset to follow the GM, not to an explicit pick", () => {
  // An explicit "default" would stop that browser following the GM for good.
  assert.match(read(SETTINGS), /game\.settings\.set\("starwarsffg", "defaultSheetTheme", cfg\.default\)/);
});

test("the settings modules still parse", () => {
  // No Node test imports them (they need Foundry), so a syntax slip would only show up as a
  // broken world load.
  for (const path of [SETTINGS, "modules/settings/settings-helpers.js"]) {
    execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../../${path}`, import.meta.url))]);
  }
});
```

- [ ] **Step 10: Run the tests**

Run: `npm test`
Expected: PASS.

Run: `npm run check:imports`
Expected: exit 0.

- [ ] **Step 11: Check in Foundry**

1. Configure Settings → Star Wars FFG → Configure Codex opens and lists five settings, in this order: GM's Default Sheet Theme, Default Sheet Theme, Advantages Heal Strain, Sort Talents by Tier, Vehicle Crit Weekly Limit. Each change is saved.
2. With a Codex character sheet open, the GM presses [+] on the Destiny Tracker. The sheet's crit-recovery countdowns redraw.
3. Toggle Sort Talents by Tier: the open Codex sheet regroups its talents.
4. Open a weapon on the Codex item sheet, then its embedded item editor: the editor carries the Codex skin in the weapon's scheme. A weapon on the classic sheet opens the stock editor.
5. The roll dialog from a Codex actor has the dark dice treatment; from a classic actor it does not.
6. As a throwaway player whose stored theme is the legacy `"codex"` value, run `game.settings.set("starwarsffg","defaultSheetTheme","codex")` and reload. The theme is reset to "Use the GM's default" once.

- [ ] **Step 12: Commit**

```bash
git add -A modules tests/node/codex-theme-owner.test.mjs tests/node/codex-integrations.test.mjs tests/node/gm-default-sheet-theme.test.mjs
git commit -m "Let Codex register its own settings, menu and window hooks"
```

## Task 7: Load Codex as its own script, through the public API only

**Background:**
- This task makes the cut. The Codex scripts move to `codex/scripts/`, and `system.json` loads `codex/scripts/codex-main.js` as a separate script after `swffg-main.js`, exactly as Foundry will load the module.
- Codex reaches the system only through `globalThis.starwarsffg`. The system drops every import of a Codex file, plus the Codex sheet registrations, the resolver and the `codexQuantity` helper.
- Templates, styles and strings stay where they are until Task 8.

**Files:**
- Move with `git mv`, from `modules/` to `codex/scripts/`:
  - `actors/codex-sheets.js`
  - `items/codex-item-sheet.js`
  - `actors/codex-fated-sigil.js`
  - `actors/cdx-pill-stack.js`
  - `actors/codex-talent-tiers.js`
  - `actors/codex-popup-position.js`
  - `actors/codex-xp-buy.js`
  - `actors/codex-quantity.js`
  - `items/codex-item-labels.js`
  - `actors/codex-settings.js` → `settings.js`
  - `actors/codex-integrations.js` → `integrations.js`
  - `actors/codex-sheet-theme.js` → `sheet-theme.js`
- Create:
  - `codex/package.json`
  - `codex/scripts/api-check.js`
  - `codex/scripts/system-api.js`
  - `codex/scripts/codex-paths.js`
  - `codex/scripts/codex-main.js`
- Modify:
  - `modules/swffg-main.js`
  - `system.json`
  - `package.json`
  - `tools/check-imports.mjs:392-395`
  - the test files listed in Step 9
- Test: create `codex/tests/node/api-check.test.mjs` and `tests/node/codex-boundary.test.mjs`.

**Interfaces:**
- Consumes: `globalThis.starwarsffg` (Task 3); `registerCodexSettings`, `healStaleThemeChoice` and `registerCodexIntegrations` (Task 6).
- Produces:
  - `codex/scripts/api-check.js`:
    - `REQUIRED_API_VERSION = 1`;
    - `LOADED_MARK = Symbol.for("kelborns-swffg-codex-ii.loaded")`;
    - `checkSystemApi(api, loadedFrom) → {ok: true} | {ok: false, reason: "duplicate"|"missing"|"version", detail?}`;
    - `apiProblemMessage(result) → string`.
  - `codex/scripts/system-api.js`: `systemApi`, which is the frozen `globalThis.starwarsffg`.
  - `codex/scripts/codex-paths.js`: `CODEX_PACKAGE_ID = "kelborns-swffg-codex-ii"`.
  - `codex/scripts/codex-main.js`: `CODEX_ACTOR_TYPES`, `CODEX_ITEM_TYPES`.

- [ ] **Step 1: Write the failing tests**

Create `codex/tests/node/api-check.test.mjs`:

```js
/**
 * Codex II starts only on a system that publishes the public API version it was written for, and
 * only once: a second copy (the module next to a system that still ships Codex) stands down.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { REQUIRED_API_VERSION, apiProblemMessage, checkSystemApi } from "../../scripts/api-check.js";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const api = { apiVersion: REQUIRED_API_VERSION };

test("a system with the expected API version is accepted", () => {
  assert.deepEqual(checkSystemApi(api, undefined), { ok: true });
});

test("a system without the public API is refused", () => {
  // Star Wars FFG 2.1.6 and earlier: Codex built in, no globalThis.starwarsffg.
  const result = checkSystemApi(undefined, undefined);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing");
  assert.match(apiProblemMessage(result), /needs Star Wars FFG 2\.2\.0 or later/);
});

test("a system with a newer API is refused, and the module is the one to update", () => {
  const result = checkSystemApi({ apiVersion: REQUIRED_API_VERSION + 1 }, undefined);
  assert.equal(result.reason, "version");
  assert.match(apiProblemMessage(result), /Update the Codex II module/);
});

test("a system with an older API is refused, and the system is the one to update", () => {
  const result = checkSystemApi({ apiVersion: REQUIRED_API_VERSION - 1 }, undefined);
  assert.equal(result.reason, "version");
  assert.match(apiProblemMessage(result), /Update the system/);
  assert.doesNotMatch(apiProblemMessage(result), /Update the Codex II module/);
});

test("an API object without a version counts as no API", () => {
  assert.equal(checkSystemApi({}, undefined).reason, "missing");
});

test("a second copy stands down", () => {
  const result = checkSystemApi(api, "https://example.invalid/systems/starwarsffg/codex/scripts/system-api.js");
  assert.equal(result.reason, "duplicate");
  assert.match(apiProblemMessage(result), /loaded twice/);
});

test("the check runs before any other Codex script, and a failure stops them all", () => {
  // codex-main.js imports system-api.js first; system-api.js throws when the check fails, which
  // stops every later import from being evaluated, so nothing gets registered.
  const firstImport = read("scripts/codex-main.js").match(/^import\s[^;]*?from\s+"([^"]+)";/m)?.[1];
  assert.equal(firstImport, "./system-api.js");
  assert.match(read("scripts/system-api.js"), /if \(!result\.ok\) \{[\s\S]*throw new Error\(/);
});
```

Create `tests/node/codex-boundary.test.mjs`:

```js
/**
 * Until Codex II leaves for its own module it ships inside the system under codex/, and the two
 * sides meet only through the public API (modules/api/public-api.js): no system script imports a
 * Codex script, and Codex scripts import only each other.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");

function walk(dir, keep, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, keep, out);
    else if (keep(entry.name)) out.push(full);
  }
  return out;
}

/** Every import / export-from / dynamic import specifier in a script. */
function specifiers(source) {
  const found = [];
  for (const match of source.matchAll(/(?:^|[;\s])(?:import|export)\s[^'"]*?\sfrom\s*["']([^"']+)["']/g)) found.push(match[1]);
  for (const match of source.matchAll(/(?:^|[;\s])import\s*["']([^"']+)["']/g)) found.push(match[1]);
  for (const match of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) found.push(match[1]);
  return found;
}

test("no system script imports a Codex script", () => {
  for (const file of walk(path.join(ROOT, "modules"), (name) => name.endsWith(".js"))) {
    for (const spec of specifiers(fs.readFileSync(file, "utf8"))) {
      assert.doesNotMatch(spec, /(^|\/)codex\//, `${rel(file)} imports ${spec}`);
    }
  }
});

test("Codex scripts import only each other", () => {
  const scripts = walk(path.join(ROOT, "codex", "scripts"), (name) => name.endsWith(".js"));
  assert.ok(scripts.length > 0, "codex/scripts holds no scripts");
  for (const file of scripts) {
    for (const spec of specifiers(fs.readFileSync(file, "utf8"))) {
      assert.match(spec, /^\.\/[\w.-]+\.js$/, `${rel(file)} imports ${spec}, outside codex/scripts`);
    }
  }
});

test("the system loads Codex as its own script, after its own", () => {
  const { esmodules } = JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"));
  assert.ok(esmodules.indexOf("codex/scripts/codex-main.js") > esmodules.indexOf("modules/swffg-main.js"));
});
```

Add the Codex test folder to the `test` script in `package.json`:

```json
    "test": "node --test \"tests/node/**/*.test.mjs\" \"codex/tests/node/**/*.test.mjs\"",
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npm test`
Expected: FAIL. `api-check.js` is not found, and "Codex scripts import only each other" reports that `codex/scripts holds no scripts`.

- [ ] **Step 3: Move the Codex scripts**

```bash
mkdir -p codex/scripts
git mv modules/actors/codex-sheets.js codex/scripts/codex-sheets.js
git mv modules/items/codex-item-sheet.js codex/scripts/codex-item-sheet.js
git mv modules/actors/codex-fated-sigil.js codex/scripts/codex-fated-sigil.js
git mv modules/actors/cdx-pill-stack.js codex/scripts/cdx-pill-stack.js
git mv modules/actors/codex-talent-tiers.js codex/scripts/codex-talent-tiers.js
git mv modules/actors/codex-popup-position.js codex/scripts/codex-popup-position.js
git mv modules/actors/codex-xp-buy.js codex/scripts/codex-xp-buy.js
git mv modules/actors/codex-quantity.js codex/scripts/codex-quantity.js
git mv modules/items/codex-item-labels.js codex/scripts/codex-item-labels.js
git mv modules/actors/codex-settings.js codex/scripts/settings.js
git mv modules/actors/codex-integrations.js codex/scripts/integrations.js
git mv modules/actors/codex-sheet-theme.js codex/scripts/sheet-theme.js
```

Create `codex/package.json`. Node then treats the `.js` files as ES modules, as `modules/package.json` does for the system:

```json
{
  "type": "module",
  "private": true
}
```

- [ ] **Step 4: Write the API check, the guard and the package constants**

Create `codex/scripts/api-check.js`:

```js
/**
 * Whether Codex II can run on the system it was loaded into. Pure, so Node tests can call it;
 * system-api.js acts on the answer.
 */

/** The public API version (modules/api/public-api.js in the system) this Codex was written for. */
export const REQUIRED_API_VERSION = 1;

/** Set on globalThis by the first Codex copy to start, so a second copy can stand down. */
export const LOADED_MARK = Symbol.for("kelborns-swffg-codex-ii.loaded");

/**
 * @param {object|undefined} api         globalThis.starwarsffg
 * @param {string|undefined} loadedFrom  The URL of a Codex copy that already started, if any.
 * @returns {{ok: true} | {ok: false, reason: "duplicate"|"missing"|"version", detail?: unknown}}
 */
export function checkSystemApi(api, loadedFrom) {
  if (loadedFrom) return { ok: false, reason: "duplicate", detail: loadedFrom };
  if (!api || typeof api !== "object" || typeof api.apiVersion !== "number") return { ok: false, reason: "missing" };
  if (api.apiVersion !== REQUIRED_API_VERSION) return { ok: false, reason: "version", detail: api.apiVersion };
  return { ok: true };
}

/** The GM-facing explanation of a failed check. */
export function apiProblemMessage(result) {
  switch (result.reason) {
    case "duplicate":
      return "Codex II is loaded twice: this Star Wars FFG version still includes it. Disable the Codex II module in Manage Modules.";
    case "missing":
      return "Codex II needs Star Wars FFG 2.2.0 or later. Update the system, or disable the Codex II module.";
    case "version":
      // Which side is behind decides the fix: updating the module cannot help an older system.
      return result.detail < REQUIRED_API_VERSION
        ? `This Codex II version needs a newer Star Wars FFG (system API ${result.detail}, Codex II needs ${REQUIRED_API_VERSION}). Update the system, or install an older Codex II version.`
        : `This Codex II version is too old for this Star Wars FFG (system API ${result.detail}, Codex II needs ${REQUIRED_API_VERSION}). Update the Codex II module.`;
    default:
      return "Codex II could not start.";
  }
}
```

Create `codex/scripts/system-api.js`:

```js
/**
 * The one door from Codex II into the Star Wars FFG system. codex-main.js imports this module
 * first, so when the check fails the throw below stops every other Codex script from being
 * evaluated: no sheet, setting, hook or stylesheet is registered, and Foundry keeps the classic
 * sheets. The GM is told why at ready.
 */
import { LOADED_MARK, apiProblemMessage, checkSystemApi } from "./api-check.js";

const result = checkSystemApi(globalThis.starwarsffg, globalThis[LOADED_MARK]);
if (!result.ok) {
  Hooks.once("ready", () => {
    if (game.user?.isGM) ui.notifications.error(apiProblemMessage(result), { permanent: true });
  });
  throw new Error(`Codex II did not start: ${result.reason}`);
}
globalThis[LOADED_MARK] = import.meta.url;

/** The system's public API (modules/api/public-api.js in the system), frozen. */
export const systemApi = globalThis.starwarsffg;
```

Create `codex/scripts/codex-paths.js`:

```js
/** This package's id; also the id of its per-user sheet resolver in the system. */
export const CODEX_PACKAGE_ID = "kelborns-swffg-codex-ii";
```

- [ ] **Step 5: Take the system's classes and helpers from the API**

In `codex/scripts/codex-sheets.js`, replace the import block (the 19 lines starting at `import { ActorSheetFFG } from "./actor-sheet-ffg.js";` and ending at `import { effectiveSheetTheme } from "./codex-sheet-theme.js";`) with:

```js
import { systemApi } from "./system-api.js";
import { CdxPillStack } from "./cdx-pill-stack.js";
import { getFatedSigilMask } from "./codex-fated-sigil.js";
import { buildTalentTierMap, groupTalentsByTier } from "./codex-talent-tiers.js";
import { placeCodexPopup } from "./codex-popup-position.js";
import { codexXpBuyActive } from "./codex-xp-buy.js";
import { effectiveSheetTheme } from "./sheet-theme.js";

const { ActorSheetFFG, AdversarySheetFFG } = systemApi.sheets;
const {
  DiceHelpers, DicePoolFFG, ActorHelpers, killMinionGroup, groupTrack, hullPoolSegments, stepUnits,
  availFor, applyCritRecoveryAttempt, isAmmoTracked, getAmmoMax, getAmmoValue,
  vehicleHardpoints, vehicleHardpointSourceRating, vehicleShieldSourceRatings, vehicleDefenceZones,
  adjustCodexStat, bindStatStepPrediction, predictedCodexStat,
} = systemApi.helpers;
```

In `codex/scripts/codex-item-sheet.js`, replace the four import lines (19-22) with:

```js
import { systemApi } from "./system-api.js";
import { cdxDefaultScheme, cdxBuildNotchOutlines, cdxNormalizeScheme, cdxSchemeClasses, CDX_SCHEME_STRIP, cdxPickScheme } from "./codex-sheets.js";
import { codexItemTypeLabelKey } from "./codex-item-labels.js";

const { ItemSheetFFG } = systemApi.sheets;
const { getAmmoMax, getAmmoValue } = systemApi.helpers;
```

In `codex/scripts/settings.js`, replace the two import lines with:

```js
import { systemApi } from "./system-api.js";
import { FOLLOW_GM_SHEET_THEME } from "./sheet-theme.js";

const { ffgSettings } = systemApi.apps;
```

In `codex/scripts/integrations.js`, replace the two import lines with:

```js
import { CodexItemSheet } from "./codex-item-sheet.js";
import { cdxNormalizeScheme, cdxSchemeClasses, refreshOpenCodexSheets } from "./codex-sheets.js";
```

- [ ] **Step 6: Write the Codex entry point**

Create `codex/scripts/codex-main.js`:

```js
/**
 * Codex II — entry point. Loaded as its own script after the Star Wars FFG system's.
 */
import { systemApi } from "./system-api.js";   // keep first: it stops Codex starting on an incompatible system
import { CODEX_PACKAGE_ID } from "./codex-paths.js";
import { CodexActorSheet, CodexAdversarySheet } from "./codex-sheets.js";
import { CodexItemSheet } from "./codex-item-sheet.js";
import { codexQuantityLabel } from "./codex-quantity.js";
import { effectiveSheetTheme } from "./sheet-theme.js";
import { healStaleThemeChoice, registerCodexSettings } from "./settings.js";
import { registerCodexIntegrations } from "./integrations.js";

export const CODEX_ACTOR_TYPES = ["character", "rival", "nemesis", "minion", "vehicle"];

// Types left out keep the stock sheet: career, itemmodifier and species.
export const CODEX_ITEM_TYPES = [
  "weapon", "armour", "gear", "talent", "forcepower", "specialization", "signatureability", "shipweapon",
  "itemattachment", "ability", "criticalinjury", "criticaldamage", "obligation", "motivation", "background",
  "shipattachment", "homesteadupgrade",
];

Hooks.once("init", () => {
  registerCodexSettings();

  // Scope "ffg", not this package's id: worlds store a chosen sheet as "ffg.CodexActorSheet",
  // "ffg.CodexAdversarySheet" or "ffg.CodexItemSheet", and the id is `${scope}.${class name}`.
  // Codex never takes makeDefault: the stock sheets stay the default.
  const { Actors, Items } = foundry.documents.collections;
  Actors.registerSheet("ffg", CodexActorSheet, { types: CODEX_ACTOR_TYPES, label: "Codex II Sheet" });
  Actors.registerSheet("ffg", CodexAdversarySheet, { types: ["character"], label: "Codex II Adversary Sheet" });
  Items.registerSheet("ffg", CodexItemSheet, { types: CODEX_ITEM_TYPES, label: "Codex II Item Sheet" });

  // Per-user default sheet: this user's sheet theme picks the Codex sheets for the types they cover.
  const sheetFor = { Actor: [CodexActorSheet, CODEX_ACTOR_TYPES], Item: [CodexItemSheet, CODEX_ITEM_TYPES] };
  systemApi.sheetResolvers.register(CODEX_PACKAGE_ID, (document) => {
    const [cls, types] = sheetFor[document.documentName] ?? [];
    return cls && types.includes(document.type) && effectiveSheetTheme().startsWith("codex") ? cls : null;
  });

  Handlebars.registerHelper("codexQuantity", codexQuantityLabel);
  registerCodexIntegrations();
});

Hooks.once("ready", healStaleThemeChoice);
```

- [ ] **Step 7: Remove Codex from `swffg-main.js`**

In `modules/swffg-main.js`:

1. Delete these imports:
   - `import { CodexItemSheet } from "./items/codex-item-sheet.js";`
   - `import { codexQuantityLabel } from "./actors/codex-quantity.js";`
   - `import { CodexActorSheet, CodexAdversarySheet } from "./actors/codex-sheets.js";`
   - `import { effectiveSheetTheme } from "./actors/codex-sheet-theme.js";`
   - `import { healStaleThemeChoice, registerCodexSettings } from "./actors/codex-settings.js";`
   - `import { registerCodexIntegrations } from "./actors/codex-integrations.js";`
2. In the sheet-registration block that Task 1 moved, delete:
   - the four comment lines that start `  // CODEX II — bespoke, opt-in sheets selected per-actor…`, the `CODEX_ACTOR_TYPES` constant, and the two `registerSheet("ffg", CodexActorSheet…)` / `registerSheet("ffg", CodexAdversarySheet…)` calls;
   - the comment `  // Codex II item sheet — opt-in, per item, via the ⚙ Sheet config…`, the `CODEX_ITEM_TYPES` constant and the `Items.registerSheet("ffg", CodexItemSheet, { … });` call;
   - the `// Per-user default sheet…` comment, the `codexSheetFor` constant and the `registerSheetResolver("kelborns-swffg-codex-ii", …)` call (added in Task 2).
3. Delete the line `  Handlebars.registerHelper("codexQuantity", codexQuantityLabel);`.
4. Delete the two lines `  registerCodexSettings();` and `  registerCodexIntegrations();`.
5. Delete the line `  await healStaleThemeChoice();` in the `ready` hook.

Leave these in place; Task 8 moves them:
- the Codex stylesheet `<link>`s (`:443-460`);
- the `i18nInit` hook that fetches `lang/codex/`;
- the Codex template paths in the preload list and in `modules/helpers/partial-templates.js`.

- [ ] **Step 8: Load the Codex entry from `system.json` and teach the checker the new folder**

In `system.json`, change `esmodules` to:

```json
  "esmodules": ["modules/dice-pool-ffg.js", "modules/swffg-main.js", "codex/scripts/codex-main.js", "lib/datatables/datatables.min.js"],
```

In `tools/check-imports.mjs`, extend the `jsFiles` list (lines 392-395) to:

```js
  const jsFiles = [
    ...walk(path.join(root, "modules"), (n) => n.endsWith(".js")),
    ...walk(path.join(root, "tests"), (n) => n.endsWith(".js") || n.endsWith(".mjs")),
    ...walk(path.join(root, "codex", "scripts"), (n) => n.endsWith(".js")),
    ...walk(path.join(root, "codex", "tests"), (n) => n.endsWith(".js") || n.endsWith(".mjs")),
  ];
```

- [ ] **Step 9: Point the existing tests at the moved scripts**

```bash
grep -rlE "modules/(actors|items)/(codex-[a-z-]+|cdx-pill-stack)\.js" tests | xargs sed -i -E \
  -e 's#modules/actors/codex-(sheets|fated-sigil|talent-tiers|popup-position|xp-buy|quantity)\.js#codex/scripts/codex-\1.js#g' \
  -e 's#modules/items/codex-(item-sheet|item-labels)\.js#codex/scripts/codex-\1.js#g' \
  -e 's#modules/actors/cdx-pill-stack\.js#codex/scripts/cdx-pill-stack.js#g' \
  -e 's#modules/actors/codex-settings\.js#codex/scripts/settings.js#g' \
  -e 's#modules/actors/codex-integrations\.js#codex/scripts/integrations.js#g' \
  -e 's#modules/actors/codex-sheet-theme\.js#codex/scripts/sheet-theme.js#g'
```

Then make these edits by hand:

1. **`tests/node/codex-quantity.test.mjs`.** In the case "Codex gear and cargo cards use the shortened count with the full one as a tooltip", the helper is now registered by Codex. Change `read("modules/swffg-main.js")` to `read("codex/scripts/codex-main.js")`.
2. **`tests/node/gm-default-sheet-theme.test.mjs`.** In "every reader of the theme goes through the resolver", the resolver now lives in Codex:
   - change `read("modules/swffg-main.js")` to `read("codex/scripts/codex-main.js")`;
   - change `'registerSheetResolver("kelborns-swffg-codex-ii"'` to `"sheetResolvers.register(CODEX_PACKAGE_ID"`.
3. **`tests/node/codex-integrations.test.mjs`.** `INTEGRATIONS` should now read `"codex/scripts/integrations.js"`; the sed above already did this, so check it.
4. **`tests/node/codex-theme-owner.test.mjs`.** `modules/` no longer holds Codex files, so drop the exclusion:
   - delete the `CODEX_FILE` constant;
   - change `else if (entry.name.endsWith(".js") && !CODEX_FILE.test(entry.name)) out.push(full);` to `else if (entry.name.endsWith(".js")) out.push(full);`.

   From now on the test scans every system script.

Run: `grep -rnE "modules/(actors|items)/(codex|cdx)-|modules/helpers/sheet-theme" tests`
Expected: no output.

- [ ] **Step 10: Run the tests**

Run: `npm test`
Expected: PASS, including `codex-boundary` and the 7 `api-check` cases.

Run: `npm run check:imports`
Expected: exit 0.

- [ ] **Step 11: Check in Foundry**

1. Restart the world, because `system.json` changed. The browser console shows no errors.
2. `CONFIG.Actor.sheetClasses.character["ffg.CodexActorSheet"].cls.name` returns `"CodexActorSheet"`.
3. An actor whose ⚙ Sheet was set to Codex before this change still opens as Codex.
4. Theme routing still works for actors and items.
5. These still behave as before:
   - Codex buttons: XP buy, stat steppers, crit Medicine/Mechanics markers (as a player and as GM), strain recovery;
   - the embedded item editor skin;
   - the roll-dialog marker.
6. In the console, `starwarsffg.sheetResolvers.has("kelborns-swffg-codex-ii")` returns `true`.

- [ ] **Step 12: Commit**

```bash
git add -A codex modules tests system.json package.json tools/check-imports.mjs
git commit -m "Load Codex II as its own script that reaches the system only through the public API"
```

## Task 8: Codex's templates, styles, strings, fonts and images move into `codex/`

**Background:**
- Codex's remaining files move into the package, and Codex loads them itself:
  - it appends its stylesheets in `init`, after the system's theme stylesheet;
  - it merges its strings at `i18nInit`;
  - it preloads its templates.
- The system stops naming any Codex path.
- The tests split, so that each file reads only one side. Codex tests then use package-relative paths, and Part 2 copies them unchanged.
- Codex's in-Foundry browser suites register through a hook in the system's test harness.

**Files:**
- Move with `git mv`:
  - `templates/actors/codex/*` → `codex/templates/actors/`
  - `templates/items/codex/*` → `codex/templates/items/`
  - `templates/parts/codex/*` → `codex/templates/parts/`
  - `styles/cdx*.css` → `codex/styles/`
  - `lang/codex/en.json` → `codex/lang/en.json`
  - `fonts/Orbitron-VariableFont_wght.woff2` → `codex/fonts/`
  - `images/codex/eldritch` → `codex/images/eldritch`
  - `images/sith-emblem.svg` → `codex/images/sith-emblem.svg`
- Modify:
  - in Codex: `codex/scripts/codex-paths.js`, `codex-main.js`, `codex-sheets.js:295`, `codex-item-sheet.js:86`, `codex-fated-sigil.js:216`, and the template includes and CSS URLs inside `codex/`;
  - in the system: `modules/swffg-main.js` (Codex stylesheets, the Codex `i18nInit` hook, the Codex preload paths), `modules/helpers/partial-templates.js:4-9`, `lang/en.json:623-630`, `LICENSE-CODEX`, `.github/workflows/main.yml`, `tools/check-imports.mjs:396`, `tests/ffg-tests.js`;
  - tests, as listed in Step 9.
- Test: create `codex/tests/node/asset-paths.test.mjs`, and extend `tests/node/codex-boundary.test.mjs`.

**Interfaces:**
- Consumes: `CODEX_PACKAGE_ID` (Task 7).
- Produces:
  - `codex/scripts/codex-paths.js`: `CODEX_ROOT = "systems/starwarsffg/codex"`, which Part 2 changes to `"modules/kelborns-swffg-codex-ii"`, and `codexVersion(): string`.
  - The system's test harness fires `Hooks.callAll("starwarsffg.functionalTests", packageSuites)`, where `packageSuites` is an array of `async (suite, suiteInstance, Test, chai) => void`.

- [ ] **Step 1: Write the failing tests**

Create `codex/tests/node/asset-paths.test.mjs`:

```js
/**
 * Every path Codex II serves or includes resolves: its own files under CODEX_ROOT, and the system
 * files it borrows (shared partials, dice images, the Elektra font). The system is the parent
 * folder while Codex ships inside it, or SWFFG_SYSTEM_DIR for the module (its CI checks the
 * system out); with neither, the borrowed paths are skipped.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE = fileURLToPath(new URL("../../", import.meta.url));
const CODEX_ROOT = fs.readFileSync(path.join(PACKAGE, "scripts", "codex-paths.js"), "utf8")
  .match(/export const CODEX_ROOT = "([^"]+)";/)?.[1];
const SYSTEM = fs.existsSync(path.join(PACKAGE, "..", "system.json"))
  ? path.join(PACKAGE, "..")
  : process.env.SWFFG_SYSTEM_DIR ?? null;

function walk(dir, keep, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, keep, out);
    else if (keep(entry.name)) out.push(full);
  }
  return out;
}

/** A served path as a file on disk; undefined for a system file when no system is at hand. */
function fileFor(served) {
  const clean = decodeURI(served.replace(/^\//, "").replace(/[?#].*$/, ""));
  if (clean.startsWith(`${CODEX_ROOT}/`)) return path.join(PACKAGE, clean.slice(CODEX_ROOT.length + 1));
  if (clean.startsWith("systems/starwarsffg/")) return SYSTEM ? path.join(SYSTEM, clean.slice("systems/starwarsffg/".length)) : undefined;
  return null;
}

function assertServed(served, where) {
  const file = fileFor(served);
  if (file === undefined) return;
  assert.ok(file, `${where}: ${served} is neither Codex's nor the system's`);
  assert.ok(fs.existsSync(file), `${where}: ${served} does not exist`);
}

test("CODEX_ROOT is declared", () => {
  assert.ok(CODEX_ROOT, "codex-paths.js does not export CODEX_ROOT");
});

test("every template include resolves", () => {
  for (const file of walk(path.join(PACKAGE, "templates"), (name) => name.endsWith(".html"))) {
    const html = fs.readFileSync(file, "utf8");
    for (const match of html.matchAll(/\{\{#?>\s*"([^"]+)"/g)) assertServed(match[1], path.relative(PACKAGE, file));
  }
});

test("every stylesheet url resolves", () => {
  for (const file of walk(path.join(PACKAGE, "styles"), (name) => name.endsWith(".css"))) {
    const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      const url = match[1];
      if (url.startsWith("data:")) continue;
      // Resolve the way the browser does: against the stylesheet's own served URL.
      const served = new URL(url, `https://foundry.invalid/${CODEX_ROOT}/styles/${path.basename(file)}`).pathname;
      assertServed(served, path.relative(PACKAGE, file));
    }
  }
});

test("every image a script loads resolves", () => {
  for (const file of walk(path.join(PACKAGE, "scripts"), (name) => name.endsWith(".js"))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/`\/?\$\{CODEX_ROOT\}\/([^`]+)`/g)) {
      if (match[1].includes("${")) continue;
      assertServed(`${CODEX_ROOT}/${match[1]}`, path.relative(PACKAGE, file));
    }
  }
});
```

In `tests/node/codex-boundary.test.mjs`, add this case at the end:

```js
test("no system script, template or stylesheet names a Codex file", () => {
  const files = [
    ...walk(path.join(ROOT, "modules"), (name) => name.endsWith(".js")),
    ...walk(path.join(ROOT, "templates"), (name) => name.endsWith(".html")),
    ...walk(path.join(ROOT, "styles"), (name) => name.endsWith(".css")),
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /systems\/starwarsffg\/codex\/|templates\/(actors|items|parts)\/codex\/|styles\/cdx[\w-]*\.css|lang\/codex\//, rel(file));
  }
  assert.equal(fs.existsSync(path.join(ROOT, "lang", "codex")), false, "lang/codex still exists");
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npm test`
Expected: FAIL:
- "CODEX_ROOT is declared";
- "no system script, template or stylesheet names a Codex file", which reports `modules/swffg-main.js`.

- [ ] **Step 3: Move the files**

```bash
mkdir -p codex/templates/actors codex/templates/items codex/templates/parts codex/styles codex/lang codex/fonts codex/images
git mv templates/actors/codex/* codex/templates/actors/
git mv templates/items/codex/* codex/templates/items/
git mv templates/parts/codex/* codex/templates/parts/
git mv styles/cdx.css styles/cdx-republic.css styles/cdx-empire.css styles/cdx-dark.css styles/cdx-light.css styles/cdx-mercenary.css styles/cdx-eldritch.css codex/styles/
git mv lang/codex/en.json codex/lang/en.json
git mv fonts/Orbitron-VariableFont_wght.woff2 codex/fonts/
git mv images/codex/eldritch codex/images/eldritch
git mv images/sith-emblem.svg codex/images/sith-emblem.svg
```

Run: `ls templates/actors/codex templates/items/codex templates/parts/codex lang/codex images/codex 2>&1`
Expected: "No such file or directory" for each folder. If any is listed as empty, remove it with `rmdir`.

- [ ] **Step 4: Rewrite the paths inside the package**

```bash
sed -i 's#systems/starwarsffg/templates/parts/codex/#systems/starwarsffg/codex/templates/parts/#g' codex/templates/*/*.html
sed -i -e 's#/systems/starwarsffg/images/codex/eldritch/#/systems/starwarsffg/codex/images/eldritch/#g' \
       -e 's#/systems/starwarsffg/images/sith-emblem\.svg#/systems/starwarsffg/codex/images/sith-emblem.svg#g' codex/styles/*.css
sed -i 's#url("../fonts/ElektraMediumPro-Bold.otf")#url("../../fonts/ElektraMediumPro-Bold.otf")#' codex/styles/cdx-eldritch.css
```

Leave these alone:
- the Orbitron URL `../fonts/Orbitron-VariableFont_wght.woff2`, which still resolves inside the package;
- the two shared dice images, which stay in the system: `/systems/starwarsffg/images/dice/starwars/purple.png` and `/systems/starwarsffg/images/generic-die.svg`.

Replace the whole of `codex/scripts/codex-paths.js` with:

```js
/** This package's id; also the id of its per-user sheet resolver in the system. */
export const CODEX_PACKAGE_ID = "kelborns-swffg-codex-ii";

/**
 * Where this package's files are served from, relative to Foundry's data folder: the system's
 * codex/ folder while Codex ships inside the system, the module's own folder once it is a module.
 */
export const CODEX_ROOT = "systems/starwarsffg/codex";

/** The version stylesheet links carry, so a new release is not served from the browser cache. */
export function codexVersion() {
  return game.modules?.get?.(CODEX_PACKAGE_ID)?.version ?? game.system.version;
}
```

Then update the three scripts that name Codex files:

| File | From | To |
|---|---|---|
| `codex/scripts/codex-sheets.js:295` | `const CDX_TEMPLATES = "systems/starwarsffg/templates/actors/codex";` | ``const CDX_TEMPLATES = `${CODEX_ROOT}/templates/actors`;`` |
| `codex/scripts/codex-item-sheet.js:86` | `const base = "systems/starwarsffg/templates/items/codex";` | ``const base = `${CODEX_ROOT}/templates/items`;`` |
| `codex/scripts/codex-fated-sigil.js:216` | `const GRUNGE_URL = "/systems/starwarsffg/images/codex/eldritch/grunge-wear-seamless.webp";` | ``const GRUNGE_URL = `/${CODEX_ROOT}/images/eldritch/grunge-wear-seamless.webp`;`` |

Each of those three files also needs `import { CODEX_ROOT } from "./codex-paths.js";`. Add it as the last import line of `codex-sheets.js` and `codex-item-sheet.js`, and as the first line of `codex-fated-sigil.js`, which has no imports yet.

- [ ] **Step 5: Move the Codex menu strings**

Cut these eight lines from `lang/en.json` (currently 623-630):
- `"SWFFG.Settings.codex.Title"`
- `"SWFFG.Settings.codex.Name"`
- `"SWFFG.Settings.codex.Hint"`
- `"SWFFG.Settings.codex.Label"`
- `"SWFFG.Settings.codex.AdvantageHealsStrain.Name"` and `.Hint`
- `"SWFFG.Settings.codex.TalentTierSorting.Name"` and `.Hint`

Insert them, unchanged, as the first entries of `codex/lang/en.json`.

Keep `SWFFG.Settings.codex.VehicleCritWeeklyLimit.Name` and `.Hint` in `lang/en.json`: that setting stays in the system.

- [ ] **Step 6: Let Codex load its own stylesheets, strings and templates**

In `codex/scripts/codex-main.js`, change the `codex-paths.js` import to:

```js
import { CODEX_PACKAGE_ID, CODEX_ROOT, codexVersion } from "./codex-paths.js";
```

Add these constants after `CODEX_ITEM_TYPES`:

```js
const CODEX_STYLESHEETS = ["cdx", "cdx-republic", "cdx-empire", "cdx-dark", "cdx-light", "cdx-mercenary", "cdx-eldritch"];

const CODEX_TEMPLATES = [
  "templates/actors/codex-character.html", "templates/actors/codex-minion.html", "templates/actors/codex-vehicle.html",
  "templates/items/codex-item.html", "templates/items/codex-gear.html", "templates/items/codex-weapon.html",
  "templates/items/codex-armour.html", "templates/items/codex-talent.html", "templates/items/codex-crit.html",
  "templates/items/codex-shipweapon.html", "templates/items/codex-itemattachment.html",
  "templates/items/codex-shipattachment.html", "templates/items/codex-forcepower.html",
  "templates/items/codex-specialization.html", "templates/items/codex-signatureability.html",
  "templates/parts/cdx-skills.html", "templates/parts/cdx-combat.html", "templates/parts/cdx-gear.html",
  "templates/parts/cdx-talents.html", "templates/parts/cdx-injuries.html", "templates/parts/cdx-ratio-chip.html",
];

/**
 * Append the Codex stylesheets as unlayered links. Called from init, which runs after the system
 * added its theme stylesheet (mandar.css): Codex must come after it to win equal-specificity
 * rules, and must not go through manifest `styles`, which Foundry puts in `@layer modules` --
 * below the unlayered theme whatever the specificity.
 */
function addCodexStylesheets() {
  const version = encodeURIComponent(codexVersion());
  for (const name of CODEX_STYLESHEETS) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.media = "all";
    link.href = `${CODEX_ROOT}/styles/${name}.css?v=${version}`;
    document.head.append(link);
  }
}

// Merge Codex's strings into the translation table: English first as the fallback, then the active
// language when it differs. While Codex ships inside the system nothing else loads codex/lang;
// the module lists lang/en.json in module.json instead and drops this hook.
Hooks.on("i18nInit", async () => {
  const langs = game.i18n.lang && game.i18n.lang !== "en" ? ["en", game.i18n.lang] : ["en"];
  for (const lang of langs) {
    try {
      const json = await foundry.utils.fetchJsonWithTimeout(`${CODEX_ROOT}/lang/${lang}.json`);
      foundry.utils.mergeObject(game.i18n.translations, foundry.utils.expandObject(json));
    } catch (e) {
      // No file for this language: English covers it.
    }
  }
});

// The system's in-Foundry test harness (GM, localhost, test flag) asks packages for their suites.
Hooks.on("starwarsffg.functionalTests", (packageSuites) => {
  packageSuites.push(async (suite, suiteInstance, Test, chai) => {
    const { CodexBrowserTests } = await import("../tests/browser/index.js");
    CodexBrowserTests(suite, suiteInstance, Test, chai);
  });
});
```

Inside the `Hooks.once("init", () => { … })` handler, add these as its first two statements, before `registerCodexSettings();`:

```js
  addCodexStylesheets();
  foundry.applications.handlebars.loadTemplates(CODEX_TEMPLATES.map((path) => `${CODEX_ROOT}/${path}`))
    .catch((err) => console.error("Codex II | template preload failed", err));
```

- [ ] **Step 7: Remove the Codex files from the system's startup**

In `modules/swffg-main.js`:

1. **Strings hook.** Delete the comment block that starts `// Merge the Codex localization file into the translation table.` and the `Hooks.on("i18nInit", async function () { … })` after it, which fetches `lang/codex/${lang}.json`.
2. **Stylesheets.** Delete the comment block that starts `  // CODEX II stylesheet — appended LAST in <head>`. Also delete the `$("head").append(…cdx.css…)` line, the scheme comment, and the `for (const scheme of […]) { $("head").append(…) }` loop after it.
3. **Preload list.** In the template preload list (line 421), delete the 15 paths that contain `/codex/`. Keep only:

   ```js
   ["systems/starwarsffg/templates/actors/ffg-character-sheet.html", "systems/starwarsffg/templates/actors/ffg-minion-sheet.html"]
   ```

In `modules/helpers/partial-templates.js`, delete the six lines (4-9) that name `templates/parts/codex/cdx-*.html`.

- [ ] **Step 8: Ship and check the new folder**

1. **`LICENSE-CODEX`.** Replace the list of paths (lines 9-14) with:

   ```
     - codex/ (every file in it, except codex/fonts/Orbitron-VariableFont_wght.woff2,
       which is the Orbitron font by Matt McInerney under the SIL Open Font License 1.1)
   ```

2. **`.github/workflows/main.yml`.** In the "Create Module Archive" step, add these lines before `CHANGELOG.md                         \`, aligned with the other entries:

   ```
                       codex/fonts/                         \
                       codex/images/                        \
                       codex/lang/                          \
                       codex/package.json                   \
                       codex/scripts/                       \
                       codex/styles/                        \
                       codex/templates/                     \
                       LICENSE-CODEX                        \
   ```

3. **`tools/check-imports.mjs`.** Change `htmlFiles` (line 396) to:

   ```js
     const htmlFiles = [
       ...walk(path.join(root, "templates"), (n) => n.endsWith(".html")),
       ...walk(path.join(root, "codex", "templates"), (n) => n.endsWith(".html")),
     ];
   ```

- [ ] **Step 9: Split the tests so each side reads only its own files**

Codex tests live in `codex/tests/node/` and name files relative to the package root (`scripts/…`, `templates/…`, `styles/…`, `lang/…`), so they run unchanged in the module repository. A Codex test file that reads files uses this helper:

```js
// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
```

When a case moves, copy its body verbatim and rewrite each path:

| Old path (after Task 7) | New, package-relative path |
|---|---|
| `codex/scripts/X` | `scripts/X` |
| `templates/actors/codex/X` | `templates/actors/X` |
| `templates/items/codex/X` | `templates/items/X` |
| `templates/parts/codex/X` | `templates/parts/X` |
| `styles/cdx*.css` | `styles/cdx*.css` |
| `lang/codex/en.json` | `lang/en.json` |

A split leaves its system half in `tests/node/`. If the old file name started with `codex-`, the system half is renamed as shown below.

**Move whole files** with `git mv tests/node/<file> codex/tests/node/<file>`, then fix paths as described:

| File | Path fix |
|---|---|
| `codex-button-defence.test.mjs` | `TEMPLATE_DIRS` becomes `["actors","items","parts"].map((d) => join(ROOT, "templates", d))`. `ROOT` (two levels up) is now the package root, so the `styles` reads already point at `codex/styles`. |
| `codex-item-adjusted-refresh.test.mjs`, `codex-item-size.test.mjs` | `new URL("../../scripts/codex-item-sheet.js", import.meta.url)` |
| `codex-portrait-preserve.test.mjs` | `new URL("../../scripts/codex-sheets.js", import.meta.url)` |
| `codex-item-labels.test.mjs`, `codex-popup-position.test.mjs`, `codex-talent-tiers.test.mjs`, `codex-xp-buy.test.mjs` | import `"../../scripts/<file>.js"` |
| `codex-quality-sigil-colors.test.mjs` | `root` (two levels up) is now the package root, so `path.join(root, "styles")` is correct as is. |
| `codex-quantity.test.mjs` | import `"../../scripts/codex-quantity.js"`; reads `scripts/codex-main.js`, `templates/parts/cdx-gear.html`, `templates/actors/codex-vehicle.html` |
| `gm-default-sheet-theme.test.mjs` → `codex/tests/node/sheet-theme.test.mjs` | import the stub from `"./_stub/foundry-stub.mjs"`; import `"../../scripts/sheet-theme.js"`; `SETTINGS = "scripts/settings.js"`; reads `scripts/codex-sheets.js` and `scripts/codex-main.js`; `--check` only `scripts/settings.js` |

Create `codex/tests/node/_stub/foundry-stub.mjs` for the sheet-theme test:

```js
/**
 * The one Foundry surface Codex's pure modules read in Node: game.settings.get, seeded per test.
 */
const settings = new Map();

globalThis.game = {
  settings: { get: (namespace, key) => settings.get(`${namespace}.${key}`) },
};

/** Test helper: seed a setting value. */
export function setSetting(namespace, key, value) {
  settings.set(`${namespace}.${key}`, value);
}

/** Test helper: clear every seeded value. */
export function resetSettings() {
  settings.clear();
}
```

**Split files.** "Codex cases" move into a new file of the same name under `codex/tests/node/`, with the read helper and package-relative paths. System cases stay, keeping their own helpers.

| File | Codex cases (move) | System file after the split |
|---|---|---|
| `codex-ammo-ui.test.mjs` | all except "quality-driven ammo mode shows the manual Enable Ammo option disabled, with a note" | `tests/node/ammo-quality-mode.test.mjs` (`git mv`, keep only that case and its reads) |
| `codex-expanded-cards-preserve.test.mjs` | "Codex actor renders remember which cards were expanded"; "expanded cards reopen before listeners and the scroll restore run"; from "a reopened item card rebuilds its details from the current item", only the `this._itemDetailsElement(item).then((fresh) => {` assertion | `tests/node/item-details-rebuild.test.mjs`: one case, "the actor sheet rebuilds an item card's details from the current item", with that case's two `actorSheetSource` assertions (`async _itemDetailsElement(item) {` and `li.append(div.hide())`) |
| `codex-quality-provenance.test.mjs` | "Codex styles all provenance as the same dim secondary line" (reads `styles/cdx.css`) | `tests/node/quality-provenance.test.mjs` (`git mv`; drop the `codexCss` read and that case) |
| `codex-scroll-preservation.test.mjs` | new case "Codex containers opt out of scroll anchoring" with the `overflow-anchor:none` assertion from "restoration changes a position only when the new content requires clamping" | `tests/node/sheet-scroll-preservation.test.mjs` (`git mv`; drop the `codexCss` read and that one assertion) |
| `codex-sheet-local-actions.test.mjs` | "Codex-specific actor and item sheets do not fetch compendiums for UI interactions" | `tests/node/item-sheet-local-editors.test.mjs` (`git mv`; keep "shared item-sheet Codex editors use their live Item instead of resolving their own UUID") |
| `codex-specialization-dragdrop.test.mjs` | "Codex specialization slots preserve the vanilla drop contract" | `tests/node/specialization-dragdrop.test.mjs` (`git mv`; keep "specialization talent drops bind to the currently rendered sheet") |
| `codex-talent-card-latency.test.mjs` | none: all five cases are system | `git mv` to `tests/node/talent-card-latency.test.mjs` |
| `lang-expansion.test.mjs` | the per-file case and the guard, for `["lang"]` relative to the package (copy `SKIPPED_PROPERTIES` and `setProperty`; write the BOM as `\uFEFF`) | keeps `["lang"]` only |
| `obligation-type-refresh.test.mjs` | "the Codex Obligation card swaps Magnitude for Subtype on the type", plus `assert.match(template, /<select[^>]*name="data\.type"/)` | keeps "changing an Obligation entry's type redraws the sheet" |
| `observer-sheet-access.test.mjs` | "Codex actor sheets let viewers use tabs and the header toggle"; "the crit-failure markers stay usable only where the click can be forwarded to the GM"; "Codex item sheets let viewers switch tabs"; "a viewer's header collapse is kept on the sheet, not saved to the actor" (with `viewerControls()`) | keeps the other three |
| `sheet-options-path.test.mjs` | new case "the Codex vehicle sheet carries no zone picker": `templates/actors/codex-vehicle.html` has no `name="data.stats.defenceZones"` | "neither vehicle sheet carries its own zone picker any more" checks `templates/actors/ffg-vehicle-sheet.html` and `actor-sheet-ffg.js` only |
| `sheet-options-readonly.test.mjs` | "a read-only Codex sheet offers no Scheme picker, which saves to the document" (with `method()`) | keeps the other three |
| `stat-step-coordinator.test.mjs` | "predicted current inputs cannot leak into whole-form submissions" | keeps the other 18 |
| `vehicle-hardpoints.test.mjs` | "the Codex vehicle sheet shows used-of-rating and edits the rating"; the `cdxVehHpMax = vehicleHardpointSourceRating(this.actor)` assertion from "the sheet error fallback preserves the stored hull rating", as its own case "the Codex vehicle fallback reads the stored hull rating" | keeps the rest |
| `xp-refund-binding.test.mjs` | new cases "the Codex XP log renders a refund anchor the handler can match" and "the Codex XP log marks adjustment entries", from the `codexTemplate` halves | keeps the system halves |
| `xp-refund-item.test.mjs` | "the Codex XP log hides the refund button for entries with no purchase id" | keeps the other 19 |
| `codex-integrations.test.mjs` (Task 6) | "Codex hooks the setting changes, the item editor and the roll dialog", reading `scripts/integrations.js`, in `codex/tests/node/integrations.test.mjs` | `tests/node/system-windows-codex-free.test.mjs` (`git mv`; keep "the system's windows no longer know about Codex") |
| `dice-window-styles.test.mjs` (Task 5) | "the Codex stylesheet no longer carries the dice-window rules", reading `styles/cdx.css` | keeps the three system-stylesheet cases |

One system test reads Codex files on purpose and stays as it is: `tests/node/codex-boundary.test.mjs` checks the boundary between the two sides. Part 3 rewrites it.

**Browser suites.**

1. Move the scheme suite:

   ```bash
   mkdir -p codex/tests/browser
   git mv tests/codex-schemes.test.js codex/tests/browser/codex-schemes.test.js
   ```

   In the moved file, its imports become `"../../scripts/codex-sheets.js"` and `"../../scripts/codex-item-sheet.js"`.

2. Create `codex/tests/browser/sheet-initial-size.test.js`. It exports `CodexSheetInitialSizeTests(suite, suiteInstance, Test, chai)` with suite title "Codex II — Actor Sheet Initial Size". Give it:
   - the five "Codex sheet keeps its size across re-renders — <type>" cases from `tests/v2-migration/sheet-initial-size.test.js`;
   - one case, "Codex adversary sheet keeps its size across re-renders", made of the `CodexAdversarySheet` half of "adversary sheets keep their size across re-renders — legacy + Codex";
   - copies of `makeActor` and `assertSizeSurvives`, and `import { CODEX_ACTOR_TYPES } from "../../scripts/codex-main.js";` in place of the local `CODEX_TYPES`.

   Delete those cases from the system file, and rename its "… legacy + Codex" case to "adversary sheets keep their size across re-renders — legacy".

3. Create `codex/tests/browser/sheet-skill-data.test.js`. It exports `CodexSheetSkillDataTests` with the case "Codex actor sheet keeps prepared skill rows" and copies of `makeActor` and `assertSkillRows`. Delete that case and the Codex import from `tests/v2-migration/sheet-skill-data.test.js`.

4. Create `codex/tests/browser/index.js`:

   ```js
   /** Codex II's in-Foundry suites, collected by the system's test harness (tests/ffg-tests.js). */
   import { CodexSchemeTests } from "./codex-schemes.test.js";
   import { CodexSheetInitialSizeTests } from "./sheet-initial-size.test.js";
   import { CodexSheetSkillDataTests } from "./sheet-skill-data.test.js";

   export function CodexBrowserTests(suite, suiteInstance, Test, chai) {
     CodexSchemeTests(suite, suiteInstance, Test, chai);
     CodexSheetInitialSizeTests(suite, suiteInstance, Test, chai);
     CodexSheetSkillDataTests(suite, suiteInstance, Test, chai);
   }
   ```

5. In `tests/ffg-tests.js`:
   - delete `import { CodexSchemeTests } from "./codex-schemes.test.js";` and `CodexSchemeTests(suite, suiteInstance, Test, chai);`;
   - add this after `CritTraumaCounterTests(suite, suiteInstance, Test, chai);`:

   ```js
       // Optional packages (the Codex II module) add their own suites.
       const packageSuites = [];
       Hooks.callAll("starwarsffg.functionalTests", packageSuites);
       for (const addSuites of packageSuites) await addSuites(suite, suiteInstance, Test, chai);
   ```

Run: `grep -rlE "codex/(scripts|templates|styles|lang)|templates/(actors|items|parts)/codex|styles/cdx" tests`
Expected: `tests/node/codex-boundary.test.mjs` only.

Some system tests still name `.cdx-*` classes, because those classes are part of the contract the system keeps:
- the scroll selectors in `sheet-scroll-preservation.test.mjs`;
- the `codexShields` flag path in `stat-step-coordinator.test.mjs`.

They read only system files, so they stay.

- [ ] **Step 10: Run the tests**

Run: `npm test`
Expected: PASS.
- Before Step 3, note the total that `npm test` reported. After this step, the total should be that number plus the cases added in this task: the 4 `asset-paths` cases, 1 boundary case, and 1 extra case for each split that turned a combined case into two.
- A lower number means a case was lost in a split. Compare the titles with `git show HEAD:tests/node/<file>`.

Run: `npm run check:imports`
Expected: exit 0.

- [ ] **Step 11: Check in Foundry**

Restart the world, because `system.json` is cached until a restart. Then go through this list:
1. **Network tab.** No 404s. `cdx.css` and the six scheme files load after `mandar.css`, with `?v=` set to the system version.
2. **Schemes and fonts.** Each of the seven schemes renders on a character:
   - Eldritch Scholar shows paper grain, and Eldritch Fate shows marble and the fated sigil;
   - Orbitron and the Eldritch display font load;
   - the Sith emblem shows on a Conflict talent in a Force tree.
3. **Codex texts.** Tab labels, strain recovery and crit labels show their texts, not keys. Configure Codex shows its title and setting names.
4. **Classic sheets** are unchanged.
5. **Browser suites.** As GM on localhost with the test flag, run the Functional Testing macro. The Codex suites run and pass alongside the system's.

- [ ] **Step 12: Commit**

```bash
git add -A codex templates styles lang fonts images modules tests LICENSE-CODEX .github/workflows/main.yml tools/check-imports.mjs
git commit -m "Move Codex's templates, styles, strings and images into its package"
```

## Task 9: Review and merge Part 1

**Files:** none new.

- [ ] **Step 1: Review the branch against the spec**

Run: `git diff --stat main...HEAD`
Expected: every change is one this plan names.

Run: `git diff main...HEAD | grep -nE "^\+.*([A-Za-z]:\\\\|/home/|/Users/|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|\b(192\.168|10\.[0-9]+)\.[0-9]+)"`
Expected: no output. These are the private-information rules in CLAUDE.md: no absolute paths, emails or LAN addresses.

- [ ] **Step 2: Run the full check in Foundry**

Follow "How to check a change in Foundry". Repeat the checks from Tasks 1-8 in one session, then add these:
1. **A player's view.** With a throwaway Player user who owns a character:
   - the player's own Default Sheet Theme still applies;
   - Codex buttons work: XP buy, stat steppers with a second client, Medicine/Mechanics marker forwarding to the GM;
   - Observer access to a shared character still allows tabs and card expansion.
2. **Third-party modules.** With the ffg-star-wars-enhancements and kelborns-swffg-force-presence modules enabled:
   - the special-ammo selector appears on Codex weapon cards;
   - the Force Presence panel sits under Morality on the Codex Bio tab.

- [ ] **Step 3: Push and open the pull request**

1. Check the account: `gh auth status` must show `YeNov`. If it shows any other account, stop and switch to `YeNov`.
2. Push and open the pull request:

   ```bash
   git push -u origin codex-module/prepare
   gh pr create --repo YeNov/StarWarsFFG --base main --head codex-module/prepare \
     --title "Make Codex II a self-contained package inside the system" \
     --body-file <scratch>/pr-part1.md
   ```

3. `pr-part1.md` should cover:
   - what moved, the public API, and the init reordering;
   - that nothing changes for users except the Configure Codex button now being listed last;
   - that there is no CHANGELOG entry for that reason;
   - the in-Foundry checks run.

   End the body with the attribution line this session uses for pull requests.

- [ ] **Step 4: Merge**

After review, merge with a merge commit (`gh pr merge <n> --repo YeNov/StarWarsFFG --merge`), as this repository does. No release follows: Part 3 ships it.

---

# Part 2 — The module repository

Part 2 starts from the system's `main` after Part 1 has merged.

Every GitHub write in this part creates or changes a public repository. Before each one:
- `gh auth status` must show `YeNov`;
- confirm with the repository owner before running it.

## Task 10: Create `YeNov/kelborns-swffg-codex-ii` and turn the package into a module

**Background:**
- `codex/` already behaves like a module: it loads after the system, reaches it only through the public API, and registers its own files.
- What is left for the module:
  - the manifest;
  - the folder it is served from;
  - letting Foundry load its strings;
  - the repository's own licence, readme, changelog and instructions.
- History stays in the system repository. The module starts with a single import commit that names the system commit it came from. This also avoids carrying the system's history, which predates the private-information rules, into a new public repository.

**Files (in `<module-repo>`):**
- Create:
  - `module.json`, `LICENSE`, `fonts/OFL.txt`, `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `AGENTS.md`, `.gitignore`;
  - everything copied from the system's `codex/`.
- Modify:
  - `package.json`;
  - `scripts/codex-paths.js`;
  - `scripts/codex-main.js`;
  - `templates/*/*.html`;
  - `styles/*.css`.

**Interfaces:**
- Consumes: the system's public API `apiVersion` 1 (Task 3), and the `codex/` package (Tasks 7-8).
- Produces: a module with id `kelborns-swffg-codex-ii`, entry `scripts/codex-main.js`, and `CODEX_ROOT = "modules/kelborns-swffg-codex-ii"`.

- [ ] **Step 1: Create the repository and clone it beside the system**

Confirm with the owner first. Then:

```bash
gh auth status
gh repo create YeNov/kelborns-swffg-codex-ii --public --description "Kelborn's SWFFG Codex II: alternative actor and item sheets for the Star Wars FFG system for Foundry VTT"
git clone https://github.com/YeNov/kelborns-swffg-codex-ii.git "<module-repo>"
cd "<module-repo>"
git config user.name YeNov
git config user.email "$(git -C "<system-repo>" config user.email)"
```

The last line copies the commit identity this machine uses for the system repository. A fresh clone otherwise inherits the global identity, which belongs to unrelated work.

- [ ] **Step 2: Copy the package from the system**

```bash
git -C "<system-repo>" fetch origin
SHA=$(git -C "<system-repo>" rev-parse origin/main)
git -C "<system-repo>" archive "$SHA" codex | tar -x --strip-components=1
echo "$SHA"
```

Keep the printed commit hash for the import commit message (Step 9).

Run: `ls`
Expected: `fonts images lang package.json scripts styles templates tests`.

- [ ] **Step 3: Serve it from the module folder**

```bash
sed -i 's#export const CODEX_ROOT = "systems/starwarsffg/codex";#export const CODEX_ROOT = "modules/kelborns-swffg-codex-ii";#' scripts/codex-paths.js
sed -i 's#systems/starwarsffg/codex/templates/#modules/kelborns-swffg-codex-ii/templates/#g' templates/*/*.html
sed -i 's#/systems/starwarsffg/codex/#/modules/kelborns-swffg-codex-ii/#g' styles/*.css
sed -i 's#url("../../fonts/ElektraMediumPro-Bold.otf")#url("../../../systems/starwarsffg/fonts/ElektraMediumPro-Bold.otf")#' styles/cdx-eldritch.css
```

Run: `grep -rn "systems/starwarsffg/codex" .`
Expected: no output.

Run: `grep -rnoh "systems/starwarsffg/[^\"' )]*" templates styles scripts | sort -u`
Expected: only system files Codex borrows:
- the shared partials;
- `templates/dialogs/ffg-ui-settings.html`;
- the two dice images;
- the Elektra font.

In `scripts/codex-main.js`, delete the comment block that starts `// Merge Codex's strings into the translation table` and the `Hooks.on("i18nInit", async () => { … });` after it. Foundry loads `lang/en.json` from the manifest instead.

- [ ] **Step 4: Write the manifest**

Create `module.json`:

```json
{
  "id": "kelborns-swffg-codex-ii",
  "title": "Kelborn's SWFFG Codex II",
  "description": "Alternative actor and item sheets for the Star Wars FFG system: notched panels, per-actor colour schemes and purpose-built widgets. Part of the system up to 2.1.6; install it to keep using Codex II sheets on 2.2.0 and later.",
  "version": "1.0.0",
  "compatibility": { "minimum": "13", "verified": "14" },
  "authors": [{ "name": "YeNov" }],
  "relationships": {
    "systems": [
      {
        "id": "starwarsffg",
        "type": "system",
        "manifest": "https://github.com/YeNov/StarWarsFFG/releases/latest/download/system.json",
        "compatibility": { "minimum": "2.2.0", "verified": "2.2.0" }
      }
    ]
  },
  "esmodules": ["scripts/codex-main.js"],
  "languages": [{ "lang": "en", "name": "English", "path": "lang/en.json" }],
  "url": "https://github.com/YeNov/kelborns-swffg-codex-ii",
  "manifest": "https://github.com/YeNov/kelborns-swffg-codex-ii/releases/latest/download/module.json",
  "download": "https://github.com/YeNov/kelborns-swffg-codex-ii/releases/download/v1.0.0/module.zip",
  "readme": "https://github.com/YeNov/kelborns-swffg-codex-ii/blob/main/README.md",
  "changelog": "https://github.com/YeNov/kelborns-swffg-codex-ii/blob/main/CHANGELOG.md",
  "bugs": "https://github.com/YeNov/kelborns-swffg-codex-ii/issues",
  "license": "LICENSE"
}
```

The manifest deliberately has:
- **no `styles`.** The stylesheets are appended at runtime so they stay unlayered and come after `mandar.css` (spec §7).
- **no `maximum`.** Foundry switches a module off at launch when the system is above it (spec §5.5).
- **no `socket`.** Codex uses the system's bridges through the API.

Replace `package.json` with:

```json
{
  "name": "kelborns-swffg-codex-ii",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"tests/node/**/*.test.mjs\""
  }
}
```

Create `.gitignore` containing `node_modules/`.

- [ ] **Step 5: License it**

1. Copy the system's licence notice: `git -C "<system-repo>" show "$SHA":LICENSE-CODEX > LICENSE`.
2. In `LICENSE`, set the title to `Kelborn's SWFFG Codex II — License`.
3. Replace the paragraph that lists the files, which starts `This license applies to the original Codex II UI work`, with:

   ```
   Everything in this repository is licensed under the Creative Commons
   Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0), except
   fonts/Orbitron-VariableFont_wght.woff2, the Orbitron font by Matt McInerney,
   which is licensed under the SIL Open Font License 1.1 (see fonts/OFL.txt).
   ```

4. Replace the final section, after the last `---`, with:

   ```
   This module extends the Star Wars FFG system, which is licensed under the MIT
   License (https://github.com/YeNov/StarWarsFFG/blob/main/LICENSE.txt). It uses
   the system's classes and files at runtime and copies none of them; nothing here
   re-licenses, supersedes, or restricts the system's MIT License.
   ```

Fetch the Orbitron licence:

```bash
curl -fsSL https://raw.githubusercontent.com/google/fonts/main/ofl/orbitron/OFL.txt -o fonts/OFL.txt
head -5 fonts/OFL.txt
```

Expected: a copyright line naming the Orbitron project authors, followed by "This Font Software is licensed under the SIL Open Font License, Version 1.1."

- [ ] **Step 6: Write the readme and the changelog**

Create `README.md`:

````markdown
# Kelborn's SWFFG Codex II

Alternative actor and item sheets for the [Star Wars FFG](https://github.com/YeNov/StarWarsFFG) system for
Foundry VTT: a notched "panel" look, per-actor colour schemes, and purpose-built widgets for skills, gear,
talent trees, injuries and vehicles. The rules stay the system's; Codex II changes how the sheets look and
how you work with them.

Codex II was part of the system up to 2.1.6 and became this module with 2.2.0. A world that used it loses
nothing: install and enable the module, and every Codex sheet, colour scheme and setting comes back as it was.

## Requirements

- Foundry VTT 13 or 14.
- Star Wars FFG 2.2.0 or later.

## Installing

1. In Foundry's Setup screen, open **Add-on Modules → Install Module**, paste this manifest URL and press
   Install:
   ```
   https://github.com/YeNov/kelborns-swffg-codex-ii/releases/latest/download/module.json
   ```
   Updating Star Wars FFG to 2.2.0 from the Setup screen also offers to install it.
2. Launch your world and enable **Kelborn's SWFFG Codex II** in **Game Settings → Manage Modules**.

## Using it

- **Game Settings → Configure Settings → Star Wars FFG → Configure Codex**:
  - **GM's Default Sheet Theme** (GM): the sheet style and colour scheme for everyone who follows the GM.
  - **Default Sheet Theme**: your own choice, kept in your browser. *Use the GM's default* follows the GM.
  - **Advantages Heal Strain**, **Sort Talents by Tier**, **Vehicle Crit Weekly Limit**: house rules.
- One actor or item can use a Codex sheet whatever the theme: **⚙ Sheet** in its header → **Codex II Sheet**.
- Each actor picks its own colour scheme from the scheme button in its sheet's header.

Schemes: Republic, Empire, Dark, Light, Mercenary, Eldritch Horror – Scholar, Eldritch Horror – Fate.

## Without the module

Star Wars FFG works without Codex II: every sheet opens as the system's classic sheet, and nothing Codex
stored is removed, so enabling the module again brings it all back. If gear was marked *not carried* on a
Codex sheet, the system offers to mark it carried again, because the classic sheet cannot show that setting.

## Licence

CC BY-NC 4.0, see [LICENSE](LICENSE). The Orbitron font is under the SIL Open Font License 1.1
([fonts/OFL.txt](fonts/OFL.txt)).
````

Create `CHANGELOG.md`:

```markdown
# Changelog

`1.0.0`
Codex II as its own module. It was part of the Star Wars FFG system up to 2.1.6.

* Changed — **Codex II is now a separate module.** Install it next to Star Wars FFG 2.2.0 or later, then enable it in each world that uses Codex sheets.
  * Every Codex sheet, colour scheme and setting stored while Codex was part of the system comes back as it was; there is nothing to migrate.
```

- [ ] **Step 7: Give the repository its working rules**

Create `CLAUDE.md`, and an identical `AGENTS.md` whose first heading reads `# Agent Instructions`:

```markdown
# Claude Instructions

Foundry VTT module **Kelborn's SWFFG Codex II**: alternative actor and item sheets for the `starwarsffg`
system. It was part of the system up to 2.1.6.

The system is a separate repository, `YeNov/StarWarsFFG`. Codex II reaches it only through the system's
public API, `globalThis.starwarsffg` (see `modules/api/public-api.js` there). Never import system files by
path: a different URL loads a second copy of the system code. `scripts/system-api.js` checks the API
version before any other Codex script runs.

## GitHub And Account Safety

- Work only in the `YeNov/kelborns-swffg-codex-ii` repository for GitHub write actions.
- Never post comments, reviews, issues, or pull requests in `StarWarsFoundryVTT/StarWarsFFG`.
- Before any GitHub write action, verify the active GitHub account is `YeNov`.
- Commit with the YeNov identity configured in this clone, never the global one.

## Private Information

This repository is public, and anything committed stays in its history. Never commit emails or real-world
identities, absolute local paths (use `<fvtt-root>`, `<system-repo>`), LAN addresses or personal host names
(use `<foundry-host>`), secrets of any kind, or offensive content. Sanitize pasted tool output first.

## What existing worlds depend on

Never change these without a migration:

- sheet scope `"ffg"` and the class names `CodexActorSheet`, `CodexAdversarySheet`, `CodexItemSheet`;
- flag scope `starwarsffg` and its keys;
- setting ids `starwarsffg.*`;
- the `.cdx`, `.cdx-*` and `--cdx-*` names, which other modules use.

Stylesheets are appended at runtime from `scripts/codex-main.js`, after the system's theme stylesheet; do
not list them under `styles` in `module.json`.

## Tests

`npm test` runs the Node tests. Set `SWFFG_SYSTEM_DIR` to a checkout of the system to also check the API
names and system paths Codex borrows; CI does.

## Changelog

`CHANGELOG.md` describes a change before it is pushed: one or two user-facing lines, with a sub-bullet only
when the user must act. Changes nobody can observe need no entry.
```

- [ ] **Step 8: Run the tests**

Run: `npm test`
Expected: PASS. The asset-path checks for system files are skipped because no system is at hand.

Run: `SWFFG_SYSTEM_DIR="<system-repo>" npm test`
Expected: PASS, with every borrowed system path checked.

- [ ] **Step 9: Commit and push the import**

```bash
git add -A
git commit -m "Import Codex II from YeNov/StarWarsFFG at <SHA from Step 2>"
git push -u origin main
```

Use the attribution lines this session uses for commits.

## Task 11: Contract test and CI for the module

**Background:**
- A module change that drifts from the system breaks at runtime, not in the system's CI. So the module's CI checks the system out and verifies two things:
  - the API version and every API name Codex uses;
  - every system path Codex borrows.
- A release workflow builds `module.zip` the way the system's builds `system.zip`.

**Files (in `<module-repo>`):**
- Create:
  - `tests/node/system-contract.test.mjs`
  - `.github/workflows/tests.yml`
  - `.github/workflows/release.yml`
  - `tools/set-release-manifest.mjs`

**Interfaces:**
- Consumes: the system's `modules/api/public-api.js` exports `PUBLIC_API_VERSION` and `PUBLIC_API_SHAPE`, and `scripts/api-check.js` exports `REQUIRED_API_VERSION`.

- [ ] **Step 1: Write the contract test**

Create `tests/node/system-contract.test.mjs`:

```js
/**
 * Codex II against the system it runs on: the system publishes the API version Codex needs, and
 * every API name Codex takes from it exists. Runs only with SWFFG_SYSTEM_DIR set (CI checks the
 * system out); the asset-path test covers the system files Codex borrows.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { REQUIRED_API_VERSION } from "../../scripts/api-check.js";

const SYSTEM = process.env.SWFFG_SYSTEM_DIR;
const PACKAGE = new URL("../../", import.meta.url);

function codexScripts() {
  const dir = new URL("scripts/", PACKAGE);
  return fs.readdirSync(dir).filter((name) => name.endsWith(".js")).map((name) => fs.readFileSync(new URL(name, dir), "utf8"));
}

/** Every name Codex takes from the API, as {group: Set(names)}. */
function usedApiNames() {
  const used = { sheets: new Set(), apps: new Set(), helpers: new Set(), sheetResolvers: new Set() };
  for (const source of codexScripts()) {
    for (const match of source.matchAll(/const\s*\{([^}]+)\}\s*=\s*systemApi\.(sheets|apps|helpers)\s*;/g)) {
      for (const name of match[1].split(",").map((part) => part.trim()).filter(Boolean)) used[match[2]].add(name);
    }
    for (const match of source.matchAll(/systemApi\.sheetResolvers\.(\w+)/g)) used.sheetResolvers.add(match[1]);
  }
  return used;
}

test("the system publishes the API version Codex needs", { skip: !SYSTEM && "SWFFG_SYSTEM_DIR not set" }, async () => {
  const { PUBLIC_API_VERSION } = await import(pathToFileURL(path.join(SYSTEM, "modules", "api", "public-api.js")).href);
  assert.equal(PUBLIC_API_VERSION, REQUIRED_API_VERSION);
});

test("every API name Codex uses is published", { skip: !SYSTEM && "SWFFG_SYSTEM_DIR not set" }, async () => {
  const { PUBLIC_API_SHAPE } = await import(pathToFileURL(path.join(SYSTEM, "modules", "api", "public-api.js")).href);
  const used = usedApiNames();
  assert.ok(used.sheets.size && used.helpers.size, "no API use found; the destructuring pattern changed");
  for (const [group, names] of Object.entries(used)) {
    for (const name of names) assert.ok(PUBLIC_API_SHAPE[group]?.includes(name), `${group}.${name} is not in the system's public API`);
  }
});
```

- [ ] **Step 2: Run it against the system**

Run: `SWFFG_SYSTEM_DIR="<system-repo>" node --test tests/node/system-contract.test.mjs`
Expected: PASS (2 cases).

Then temporarily rename one destructured name in `scripts/codex-item-sheet.js`, for example `getAmmoMax` to `getAmmoMaxX`. The second case must FAIL with `helpers.getAmmoMaxX is not in the system's public API`. Undo the rename.

- [ ] **Step 3: Add the CI workflows**

Create `.github/workflows/tests.yml`:

```yaml
# Runs the Node tests on every push and pull request, against the system's main branch so a change
# that drifts from the system's public API fails here rather than in someone's world.
name: Tests

on:
    push:
        branches: ["**"]
    pull_request:

concurrency:
    group: tests-${{ github.ref }}
    cancel-in-progress: true

jobs:
    test:
        runs-on: ubuntu-latest
        steps:
            - name: Checkout Repository
              uses: actions/checkout@v4

            - name: Checkout The System
              uses: actions/checkout@v4
              with:
                  repository: YeNov/StarWarsFFG
                  path: system

            - name: Set Up Node
              uses: actions/setup-node@v4
              with:
                  node-version: "24"

            - name: Run Tests
              env:
                  SWFFG_SYSTEM_DIR: ${{ github.workspace }}/system
              run: npm test
```

Copy the manifest tool unchanged: `git -C "<system-repo>" show origin/main:tools/set-release-manifest.mjs > tools/set-release-manifest.mjs`. It takes `--file module.json`.

Create `.github/workflows/release.yml`:

```yaml
# Builds module.zip and attaches it, with the stamped module.json, to a published release.
name: Create Release

env:
    project_url: "https://github.com/${{github.repository}}"
    latest_manifest_url: "https://github.com/${{github.repository}}/releases/latest/download/module.json"
    release_module_url: "https://github.com/${{github.repository}}/releases/download/${{github.event.release.tag_name}}/module.zip"

on:
    release:
        types: [published]

jobs:
    test:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: actions/checkout@v4
              with:
                  repository: YeNov/StarWarsFFG
                  path: system
            - uses: actions/setup-node@v4
              with:
                  node-version: "24"
            - name: Run Tests
              env:
                  SWFFG_SYSTEM_DIR: ${{ github.workspace }}/system
              run: npm test

    build:
        needs: test
        runs-on: ubuntu-latest
        # Attaching files to the release writes to the repository. A new repository's GITHUB_TOKEN
        # is read-only for contents by default, so without this the release would go out with no
        # module.json or module.zip for Foundry to install.
        permissions:
            contents: write
        steps:
            - uses: actions/checkout@v4

            - name: Extract Version From Tag
              id: get_version
              uses: battila7/get-version-action@v2

            - name: Stamp The Manifest
              env:
                  VERSION: ${{ steps.get_version.outputs.version-without-v }}
                  URL: ${{ env.project_url }}
                  MANIFEST: ${{ env.latest_manifest_url }}
                  DOWNLOAD: ${{ env.release_module_url }}
              run: node tools/set-release-manifest.mjs --file module.json

            - name: Create Module Archive
              run: zip --recurse-paths ./module.zip fonts/ images/ lang/ scripts/ styles/ templates/ CHANGELOG.md LICENSE README.md module.json

            - name: Update Release With Files
              uses: ncipollo/release-action@v1
              with:
                  allowUpdates: true
                  name: ${{ github.event.release.name }}
                  draft: ${{ github.event.release.unpublished }}
                  prerelease: ${{ github.event.release.prerelease }}
                  token: ${{ secrets.GITHUB_TOKEN }}
                  artifacts: "./module.json, ./module.zip"
                  tag: ${{ github.event.release.tag_name }}
                  body: ${{ github.event.release.body }}
```

- [ ] **Step 4: Commit, push and watch CI**

```bash
git switch -c ci-and-contract
git add tests/node/system-contract.test.mjs .github tools
git commit -m "Check Codex against the system's public API in CI, and build releases"
git push -u origin ci-and-contract
gh pr create --repo YeNov/kelborns-swffg-codex-ii --base main --head ci-and-contract --title "Contract test and CI" --body-file <scratch>/pr-module-ci.md
```

The pull request's Tests check must pass. Merge with `gh pr merge <n> --repo YeNov/kelborns-swffg-codex-ii --merge`.

## Task 12: Move the Codex docs into the module repository

**Files (in `<module-repo>`):** create `docs/` from the system's Codex docs.

- [ ] **Step 1: Copy the docs**

```bash
mkdir -p docs/design-handoff
for f in docs/codex-ii-theme-features.md docs/codex-ii-roll-in-guide.md docs/codex-ii-roll-in-guide-ua.md \
         docs/codex-force-tree-design.md docs/handoff-codex-special-ammo.md svg-actor-sheet-layout-downsides.md \
         docs/superpowers/plans/2026-07-10-eldritch-horror-color-scheme.md; do
  git -C "<system-repo>" show "origin/main:$f" > "docs/$(basename "$f")"
done
git -C "<system-repo>" archive origin/main docs/design_handoff_codex_foundry | tar -x --strip-components=2 -C docs/design-handoff
```

- [ ] **Step 2: Check the font files in the design handoff**

Run: `find docs/design-handoff -iname "*.woff*" -o -iname "*.ttf" -o -iname "*.otf"`

1. For each font file, find its licence; Google Fonts publishes one per family.
2. Keep a font only if its licence allows redistribution, and add that licence file next to it.
3. Delete every other font file, and note in `docs/design-handoff/README.md` which fonts the prototype expects.

- [ ] **Step 3: Bring the docs up to date**

1. **Roll-in guides** (`docs/codex-ii-roll-in-guide.md` and `-ua.md`):
   - Replace the statement that the system build includes Codex II with the install steps from `README.md`.
   - The menu path (Configure Settings → Star Wars FFG → Configure Codex) is unchanged.
   - Add the GM's Default Sheet Theme step to the Ukrainian guide, which lacks it.
2. **`docs/codex-force-tree-design.md`:** change file paths `modules/actors/…` and `modules/items/…` to `scripts/…`. References to system handlers in `item-sheet-ffg.js` become `YeNov/StarWarsFFG:modules/items/item-sheet-ffg.js`.
3. **`docs/codex-ii-theme-features.md`:** replace its loading and menu sections with a pointer to `README.md`, and add the GM's Default Sheet Theme.
4. **Private information:** run `grep -rnE "[A-Za-z]:\\\\|/home/|/Users/|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|\b(192\.168|10\.[0-9]+)\.[0-9]+" docs`. Expected: no output; fix any hit before committing.

- [ ] **Step 4: Commit through a pull request**

```bash
git switch main && git pull --ff-only && git switch -c docs
git add docs
git commit -m "Bring the Codex II docs over from the system"
git push -u origin docs
gh pr create --repo YeNov/kelborns-swffg-codex-ii --base main --head docs --title "Codex II docs" --body-file <scratch>/pr-module-docs.md
```

Merge once the Tests check passes.

---

# Part 3 — Release the system without Codex

Branch `codex-module/remove` from the system's `main` after Part 1 has merged:

```bash
git -C "<system-repo>" switch main
git -C "<system-repo>" pull --ff-only
git -C "<system-repo>" switch -c codex-module/remove
```

## Task 13: Remove Codex from the system

**Files:**
- Delete: `codex/`.
- Modify:
  - `system.json`
  - `package.json`
  - `tools/check-imports.mjs`
  - `.github/workflows/main.yml`
  - `tests/node/codex-boundary.test.mjs`

- [ ] **Step 1: Rewrite the boundary test for a system without Codex**

Replace the whole of `tests/node/codex-boundary.test.mjs` with:

```js
/**
 * Codex II left the system in 2.2.0 for the Kelborn's SWFFG Codex II module. The system loads,
 * imports, preloads, styles and names none of its files; the module reaches the system only through
 * the public API (modules/api/public-api.js).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");

function walk(dir, keep, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, keep, out);
    else if (keep(entry.name)) out.push(full);
  }
  return out;
}

test("the system no longer ships Codex II", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "codex")), false, "codex/ still exists");
  const { esmodules } = JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"));
  assert.deepEqual(esmodules.filter((entry) => entry.startsWith("codex/")), []);
});

test("no system script, template or stylesheet names a Codex file", () => {
  const files = [
    ...walk(path.join(ROOT, "modules"), (name) => name.endsWith(".js")),
    ...walk(path.join(ROOT, "templates"), (name) => name.endsWith(".html")),
    ...walk(path.join(ROOT, "styles"), (name) => name.endsWith(".css")),
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /(^|["'`/])codex\/|templates\/(actors|items|parts)\/codex\/|styles\/cdx[\w-]*\.css|lang\/codex\//, rel(file));
  }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/node/codex-boundary.test.mjs`
Expected: "the system no longer ships Codex II" FAILS (`codex/ still exists`).

- [ ] **Step 3: Delete Codex and unhook it**

```bash
git rm -r -q codex
```

Then make these edits:

1. **`system.json`.** Remove `"codex/scripts/codex-main.js"` from `esmodules`. It goes back to:

   ```json
     "esmodules": ["modules/dice-pool-ffg.js", "modules/swffg-main.js", "lib/datatables/datatables.min.js"],
   ```

2. **`package.json`.** Change `test` back to:

   ```json
       "test": "node --test \"tests/node/**/*.test.mjs\"",
   ```

3. **`tools/check-imports.mjs`.** Delete the two `codex` lines from `jsFiles` and the `codex` line from `htmlFiles`, and set `htmlFiles` back to:

   ```js
     const htmlFiles = walk(path.join(root, "templates"), (n) => n.endsWith(".html"));
   ```

4. **`.github/workflows/main.yml`.** Delete the eight lines added in Task 8: the seven `codex/…` lines and `LICENSE-CODEX`.

`tests/ffg-tests.js` keeps the `starwarsffg.functionalTests` hook. The module uses it.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

Run: `npm run check:imports`
Expected: exit 0.

- [ ] **Step 5: Check in Foundry, without the module**

1. **Keep the module off.** `<module-repo>` requires system 2.2.0 while `system.json` still says 2.1.6, so Foundry keeps the module disabled. That is the state to check.
2. **Restart and check the console.** Restart the world. The browser console shows no 404s and no errors.
3. **Codex actors open classic.** An actor whose ⚙ Sheet is Codex opens the classic sheet. Its ⚙ Sheet dialog shows a blank choice; close it without saving.
4. **System windows are unchanged.** Configure Settings has no Configure Codex button. The Destiny Tracker shows "Day N". A Replace Die dialog keeps its dice styling.
5. **Public API is still published.** `starwarsffg.apiVersion` returns `1`.

- [ ] **Step 6: Commit**

```bash
git add -A codex system.json package.json tools/check-imports.mjs .github/workflows/main.yml tests/node/codex-boundary.test.mjs
git commit -m "Remove Codex II from the system"
```

## Task 14: Recommend the module in `system.json`

**Background:**
- With a `recommends` entry, Foundry's Setup screen offers the module, pre-ticked, whenever a GM installs or updates the system (`installPackage` runs `installDependencies` for updates too).
- The entry needs a `manifest`. Without one, V14 throws inside that prompt for a package that is not listed on foundryvtt.com, and the prompt never appears.
- Never use `requires`: it would make every world on the system unlaunchable while the module is missing.

**Files:**
- Modify: `system.json`.
- Test: `tests/node/system-manifest.test.mjs` (create).

- [ ] **Step 1: Write the failing test**

Create `tests/node/system-manifest.test.mjs`:

```js
/**
 * The system recommends the Codex II module, so Foundry's Setup screen offers it when the system is
 * installed or updated. It must never require it: a required module that is missing makes every
 * world on the system unlaunchable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync(new URL("../../system.json", import.meta.url), "utf8"));

test("the system recommends the Codex II module, with a manifest Foundry can install from", () => {
  const entry = manifest.relationships?.recommends?.find((related) => related.id === "kelborns-swffg-codex-ii");
  assert.ok(entry, "no recommends entry for kelborns-swffg-codex-ii");
  assert.equal(entry.type, "module");
  assert.equal(entry.manifest, "https://github.com/YeNov/kelborns-swffg-codex-ii/releases/latest/download/module.json");
  assert.ok(entry.reason && entry.reason.length > 20, "the prompt should say why");
});

test("nothing is required", () => {
  assert.deepEqual(manifest.relationships?.requires ?? [], []);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/node/system-manifest.test.mjs`
Expected: the first case FAILS.

- [ ] **Step 3: Add the relationship**

In `system.json`, after the `"documentTypes": { … },` block, add:

```json
  "relationships": {
    "recommends": [
      {
        "id": "kelborns-swffg-codex-ii",
        "type": "module",
        "manifest": "https://github.com/YeNov/kelborns-swffg-codex-ii/releases/latest/download/module.json",
        "reason": "Codex II, the alternative actor and item sheets that were part of this system up to 2.1.6. Install it to keep using Codex II sheets."
      }
    ]
  },
```

Run: `node -e "JSON.parse(require('fs').readFileSync('system.json','utf8'))"`
Expected: no output.

- [ ] **Step 4: Run the tests and commit**

Run: `npm test`
Expected: PASS.

```bash
git add system.json tests/node/system-manifest.test.mjs
git commit -m "Recommend the Codex II module in the system manifest"
```

## Task 15: Tell the GM what to do when the world still uses Codex

**Background:**
- Foundry warns about nothing when a module is missing, and a world can hold Codex data with no working Codex module.
- In that case, every time a GM loads the world they get a dialog:
  - what was found;
  - one instruction picked from the module's state: install it, enable it, update it, or update the system;
  - for gear marked "not carried", a button that marks those items carried again.
- The classic sheets keep applying the not-carried flag but cannot show or change it (spec §4).
- A player whose own theme is a Codex one gets a short notice instead.
- Nothing here resets `flags.core.sheetClass` or any Codex flag: installing the module later must find them as they were.
- The rules live in a pure module that Node can test; the Foundry glue stays thin.

**Files:**
- Create:
  - `modules/helpers/codex-handoff.js`
  - `modules/helpers/codex-handoff-notice.js`
- Modify:
  - `modules/settings/settings-helpers.js`, adding one setting;
  - `modules/swffg-main.js`, the import and the `ready` hook;
  - `lang/en.json`.
- Test: `tests/node/codex-handoff.test.mjs` (create).

**Interfaces:**
- Consumes: `hasSheetResolver` (Task 2).
- Produces:
  - `codexSystemRange(module) → {minimum, maximum}`;
  - `codexModuleState(module, systemVersion, started, isNewerVersion) → "ready"|"missing"|"inactive"|"system-too-old"|"module-too-old"|"failed"`;
  - `handoffInstruction(state, {version, minimum, maximum, manifest}) → {key, data}`;
  - `findCodexData({actors, items, defaultSheets, gmDefaultTheme, ownTheme}) → {codexSheets, codexDefaults, gmTheme, ownTheme, notCarried, any}`;
  - `carriedFixUpdates(notCarried) → Array<{actorUuid: string|null, updates}>`;
  - `parseStoredSetting(raw)`;
  - `showCodexHandoff(): Promise<void>`;
  - the world setting `starwarsffg.codexHandoffDismissed` (String).

- [ ] **Step 1: Write the failing test**

Create `tests/node/codex-handoff.test.mjs`:

```js
/**
 * The Codex II hand-off: when a world still holds Codex data but has no working Codex II module,
 * the GM is told what to do -- install, enable or update it -- and can mark "not carried" items
 * carried again, since the classic sheets keep applying that flag without showing it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  carriedFixUpdates, codexModuleState, findCodexData, handoffInstruction, parseStoredSetting,
} from "../../modules/helpers/codex-handoff.js";

/** Foundry's isNewerVersion, for the dotted versions these cases use. */
function isNewerVersion(v1, v0) {
  const a = String(v1).split(".").map(Number);
  const b = String(v0).split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}
const installed = (active, compatibility) => ({ active, relationships: { systems: [{ id: "starwarsffg", compatibility }] } });

test("no module installed: install it", () => {
  assert.equal(codexModuleState(undefined, "2.2.0", false, isNewerVersion), "missing");
});

test("installed, not enabled, and within its system range: enable it", () => {
  assert.equal(codexModuleState(installed(false, { minimum: "2.2.0" }), "2.2.0", false, isNewerVersion), "inactive");
});

test("installed but needing a newer system: the system is too old", () => {
  assert.equal(codexModuleState(installed(false, { minimum: "2.3.0" }), "2.2.0", false, isNewerVersion), "system-too-old");
});

test("installed but capped below this system: the module is too old", () => {
  assert.equal(codexModuleState(installed(false, { minimum: "2.2.0", maximum: "2.2.5" }), "2.3.0", false, isNewerVersion), "module-too-old");
});

test("enabled and started: nothing to say", () => {
  assert.equal(codexModuleState(installed(true, { minimum: "2.2.0" }), "2.2.0", true, isNewerVersion), "ready");
});

test("enabled but did not start, e.g. it failed its API check: update it", () => {
  assert.equal(codexModuleState(installed(true, { minimum: "2.2.0" }), "2.2.0", false, isNewerVersion), "failed");
});

test("a module that declares no system range counts as compatible", () => {
  assert.equal(codexModuleState({ active: false, relationships: { systems: [] } }, "2.2.0", false, isNewerVersion), "inactive");
});

const facts = { version: "2.2.0", minimum: "2.3.0", maximum: "2.1.9", manifest: "https://example.invalid/module.json" };

test("a system too old for the module says to update the system, not the module", () => {
  assert.deepEqual(handoffInstruction("system-too-old", facts), { key: "SWFFG.CodexHandoff.SystemTooOld", data: { minimum: "2.3.0", version: "2.2.0" } });
});

test("a module too old for the system says to update the module", () => {
  assert.deepEqual(handoffInstruction("module-too-old", facts), { key: "SWFFG.CodexHandoff.ModuleTooOld", data: { maximum: "2.1.9", version: "2.2.0" } });
});

test("the other states each get their own instruction", () => {
  assert.deepEqual(handoffInstruction("missing", facts), { key: "SWFFG.CodexHandoff.Missing", data: { manifest: facts.manifest } });
  assert.equal(handoffInstruction("inactive", facts).key, "SWFFG.CodexHandoff.Inactive");
  assert.equal(handoffInstruction("failed", facts).key, "SWFFG.CodexHandoff.Failed");
});

test("the English instructions name the right fix", () => {
  const english = JSON.parse(fs.readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8").replace(/^﻿/, ""));
  assert.match(english["SWFFG.CodexHandoff.SystemTooOld"], /Update the system/);
  assert.doesNotMatch(english["SWFFG.CodexHandoff.SystemTooOld"], /Update it in Setup/);
  assert.match(english["SWFFG.CodexHandoff.ModuleTooOld"], /Update it in Setup/);
  for (const key of ["Title", "Intro", "Found", "GmTheme", "OwnTheme", "Missing", "Inactive", "SystemTooOld", "ModuleTooOld",
    "Failed", "NotCarried", "MarkCarried", "Later", "Dismiss", "Fixed", "PlayerNotice"]) {
    assert.equal(typeof english[`SWFFG.CodexHandoff.${key}`], "string", key);
  }
});

const world = {
  actors: [
    {
      uuid: "Actor.a", name: "Kira", sheetClass: "ffg.CodexActorSheet",
      items: [
        { id: "i1", name: "Blaster", sheetClass: "", carried: false },
        { id: "i2", name: "Medpac", sheetClass: "ffg.CodexItemSheet", carried: true },
      ],
    },
    { uuid: "Scene.s.Token.t.Actor.b", name: "Trooper", sheetClass: "", items: [{ id: "i3", name: "Rations", sheetClass: "" }] },
  ],
  items: [{ id: "w1", name: "Spare Armour", sheetClass: "", carried: false }],
  defaultSheets: { Actor: { character: "ffg.CodexActorSheet", vehicle: "ffg.ActorSheetFFG" }, Item: {} },
  gmDefaultTheme: "codex-dark",
};

test("Codex data is counted across actors, token actors, world items and default sheets", () => {
  const found = findCodexData(world);
  assert.equal(found.codexSheets, 2);
  assert.deepEqual(found.codexDefaults, ["Actor.character"]);
  assert.equal(found.gmTheme, true);
  assert.deepEqual(found.notCarried.map((entry) => entry.itemName), ["Blaster", "Spare Armour"]);
  assert.equal(found.any, true);
});

test("a GM who used Codex only through their own sheet theme still gets the notice", () => {
  const found = findCodexData({ actors: [], items: [], defaultSheets: {}, gmDefaultTheme: "default", ownTheme: "codex-dark" });
  assert.equal(found.ownTheme, true);
  assert.equal(found.any, true);
});

test("following the GM does not count as a Codex theme of one's own", () => {
  const found = findCodexData({ gmDefaultTheme: "default", ownTheme: "gm" });
  assert.equal(found.ownTheme, false);
  assert.equal(found.any, false);
});

test("a world that never used Codex gets no notice", () => {
  const found = findCodexData({
    actors: [{ uuid: "Actor.c", name: "C", sheetClass: "ffg.ActorSheetFFG", items: [{ id: "x", name: "X", sheetClass: "" }] }],
    items: [],
    defaultSheets: {},
    gmDefaultTheme: "default",
  });
  assert.equal(found.any, false);
});

test("the fix sets carried to true, per actor, including world items", () => {
  // true, not removal: ItemFFG#_onUpdate re-enables gear Active Effects only when `carried` is in the update.
  assert.deepEqual(carriedFixUpdates(findCodexData(world).notCarried), [
    { actorUuid: "Actor.a", updates: [{ _id: "i1", "flags.starwarsffg.carried": true }] },
    { actorUuid: null, updates: [{ _id: "w1", "flags.starwarsffg.carried": true }] },
  ]);
});

test("stored setting values read the same whether serialized or not", () => {
  assert.equal(parseStoredSetting('"codex-dark"'), "codex-dark");
  assert.equal(parseStoredSetting("codex-dark"), "codex-dark");
  assert.equal(parseStoredSetting(undefined), null);
});

test("the ready hook shows the notice without waiting for it", () => {
  const main = fs.readFileSync(new URL("../../modules/swffg-main.js", import.meta.url), "utf8");
  assert.match(main, /showCodexHandoff\(\)\.catch\(/);
  assert.doesNotMatch(main, /await showCodexHandoff\(\)/);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/node/codex-handoff.test.mjs`
Expected: FAIL, because `modules/helpers/codex-handoff.js` is not found.

- [ ] **Step 3: Write the rules**

Create `modules/helpers/codex-handoff.js`:

```js
/**
 * Codex II left the system in 2.2.0 for the Kelborn's SWFFG Codex II module. When a world still
 * holds Codex data but has no working Codex module, the GM is told what to do, and offered a fix
 * for the one Codex setting the classic sheets keep applying without showing it: weapons, armour
 * and gear marked "not carried", which drop out of encumbrance (gear also keeps its Active Effects
 * off).
 *
 * Pure: everything Foundry-specific is passed in, so these rules run in Node tests.
 * codex-handoff-notice.js is the Foundry side.
 */
export const CODEX_PACKAGE_ID = "kelborns-swffg-codex-ii";
export const CODEX_MANIFEST_URL = "https://github.com/YeNov/kelborns-swffg-codex-ii/releases/latest/download/module.json";

/** The Star Wars FFG version range an installed Codex II module declares, as {minimum, maximum}. */
export function codexSystemRange(module) {
  const entry = [...(module?.relationships?.systems ?? [])].find((system) => system.id === "starwarsffg");
  return { minimum: entry?.compatibility?.minimum, maximum: entry?.compatibility?.maximum };
}

/**
 * The Codex II module's state in this world.
 * @param {object|undefined} module  game.modules.get(CODEX_PACKAGE_ID); undefined when not installed.
 * @param {string} systemVersion     game.system.version
 * @param {boolean} started          Whether the module registered its sheet resolver.
 * @param {Function} isNewerVersion  foundry.utils.isNewerVersion
 * @returns {"ready"|"missing"|"inactive"|"system-too-old"|"module-too-old"|"failed"}
 */
export function codexModuleState(module, systemVersion, started, isNewerVersion) {
  if (!module) return "missing";
  if (module.active) return started ? "ready" : "failed";
  // Foundry will not enable a module whose system range excludes this version (Manage Modules greys
  // it out, and a launch switches it off), so "enable it" would be the wrong advice -- and which end
  // of the range is missed decides what needs updating. Same test as Manage Modules.
  const { minimum, maximum } = codexSystemRange(module);
  if (minimum && isNewerVersion(minimum, systemVersion)) return "system-too-old";
  if (maximum && isNewerVersion(systemVersion, maximum, { majorOnly: Number.isInteger(Number(maximum)) })) return "module-too-old";
  return "inactive";
}

/**
 * What to tell the GM in a state, as an i18n key and its format data.
 * @param {string} state  A codexModuleState result other than "ready".
 * @param {{version: string, minimum?: string, maximum?: string, manifest: string}} facts
 * @returns {{key: string, data: object}}
 */
export function handoffInstruction(state, { version, minimum, maximum, manifest }) {
  switch (state) {
    case "missing": return { key: "SWFFG.CodexHandoff.Missing", data: { manifest } };
    case "inactive": return { key: "SWFFG.CodexHandoff.Inactive", data: {} };
    // The module wants a newer system: updating the module again would not help.
    case "system-too-old": return { key: "SWFFG.CodexHandoff.SystemTooOld", data: { minimum, version } };
    case "module-too-old": return { key: "SWFFG.CodexHandoff.ModuleTooOld", data: { maximum, version } };
    default: return { key: "SWFFG.CodexHandoff.Failed", data: {} };
  }
}

const isCodexSheet = (sheetClass) => typeof sheetClass === "string" && sheetClass.startsWith("ffg.Codex");

/**
 * The Codex II data in a world.
 * @param {object} world
 * @param {Array<{uuid: string, name: string, sheetClass?: string, items?: Array<{id: string, name: string, sheetClass?: string, carried?: boolean}>}>} [world.actors]
 *   World actors and unlinked token actors.
 * @param {Array<{id: string, name: string, sheetClass?: string, carried?: boolean}>} [world.items]  World items.
 * @param {Record<string, Record<string, string>>} [world.defaultSheets]  The core.sheetClasses setting.
 * @param {unknown} [world.gmDefaultTheme]  The stored starwarsffg.gmDefaultSheetTheme value, if any.
 * @param {unknown} [world.ownTheme]  This browser's stored starwarsffg.defaultSheetTheme value, if any.
 */
export function findCodexData({ actors = [], items = [], defaultSheets = {}, gmDefaultTheme = null, ownTheme = null } = {}) {
  let codexSheets = 0;
  const notCarried = [];
  const visitItem = (item, actor) => {
    if (isCodexSheet(item.sheetClass)) codexSheets += 1;
    if (item.carried === false) {
      notCarried.push({ actorUuid: actor?.uuid ?? null, actorName: actor?.name ?? null, itemId: item.id, itemName: item.name });
    }
  };
  for (const actor of actors) {
    if (isCodexSheet(actor.sheetClass)) codexSheets += 1;
    for (const item of actor.items ?? []) visitItem(item, actor);
  }
  for (const item of items) visitItem(item, null);

  const codexDefaults = [];
  for (const [documentName, byType] of Object.entries(defaultSheets ?? {})) {
    for (const [type, sheetClass] of Object.entries(byType ?? {})) {
      if (isCodexSheet(sheetClass)) codexDefaults.push(`${documentName}.${type}`);
    }
  }
  const gmTheme = typeof gmDefaultTheme === "string" && gmDefaultTheme.startsWith("codex");
  // This browser's own choice; following the GM ("gm") is already covered by gmTheme.
  const ownCodexTheme = typeof ownTheme === "string" && ownTheme.startsWith("codex");
  const any = codexSheets > 0 || codexDefaults.length > 0 || gmTheme || ownCodexTheme || notCarried.length > 0;
  return { codexSheets, codexDefaults, gmTheme, ownTheme: ownCodexTheme, notCarried, any };
}

/**
 * The updates that mark the not-carried items carried again, one batch per owning actor
 * (actorUuid null = world items). Sets the flag to true rather than removing it: ItemFFG#_onUpdate
 * re-enables a gear item's own Active Effects only when `carried` is in the update.
 */
export function carriedFixUpdates(notCarried) {
  const batches = new Map();
  for (const { actorUuid, itemId } of notCarried) {
    if (!batches.has(actorUuid)) batches.set(actorUuid, []);
    batches.get(actorUuid).push({ _id: itemId, "flags.starwarsffg.carried": true });
  }
  return [...batches].map(([actorUuid, updates]) => ({ actorUuid, updates }));
}

/** A stored setting value read straight from storage: serialized JSON or the value itself. */
export function parseStoredSetting(raw) {
  if (typeof raw !== "string") return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
```

- [ ] **Step 4: Write the Foundry side**

Create `modules/helpers/codex-handoff-notice.js`:

```js
/**
 * The Foundry side of the Codex II hand-off; the rules are in codex-handoff.js. At ready, a GM whose
 * world still holds Codex data without a working Codex module gets a dialog saying what to do, with
 * a fix for "not carried" items; a player whose own sheet theme is a Codex one gets a short notice.
 * Settings Codex registered are read raw from storage: with the module off they are unregistered.
 */
import { hasSheetResolver } from "./sheet-resolvers.js";
import {
  CODEX_MANIFEST_URL, CODEX_PACKAGE_ID, carriedFixUpdates, codexModuleState, codexSystemRange, findCodexData,
  handoffInstruction, parseStoredSetting,
} from "./codex-handoff.js";

const escape = (text) => Handlebars.escapeExpression(String(text ?? ""));

function storedSetting(scope, key) {
  try {
    return parseStoredSetting(game.settings.storage.get(scope)?.getItem(key));
  } catch {
    return null;
  }
}

function itemInfo(item) {
  return { id: item.id, name: item.name, sheetClass: item.getFlag("core", "sheetClass") ?? "", carried: item.flags?.starwarsffg?.carried };
}

function gatherWorld() {
  const tokenActors = game.scenes.contents
    .flatMap((scene) => scene.tokens.contents)
    .filter((token) => !token.actorLink && token.actor)
    .map((token) => token.actor);
  const actorDocs = [...game.actors.contents, ...tokenActors];
  const world = findCodexData({
    actors: actorDocs.map((actor) => ({
      uuid: actor.uuid, name: actor.name, sheetClass: actor.getFlag("core", "sheetClass") ?? "", items: actor.items.map(itemInfo),
    })),
    items: game.items.contents.map(itemInfo),
    defaultSheets: game.settings.get("core", "sheetClasses"),
    gmDefaultTheme: storedSetting("world", "starwarsffg.gmDefaultSheetTheme"),
    // The GM may use Codex only through their own sheet theme. Read, never written: installing the
    // module later must find it as it was.
    ownTheme: storedSetting("client", "starwarsffg.defaultSheetTheme"),
  });
  return { actorDocs, world };
}

function instruction(state, module) {
  const { minimum, maximum } = codexSystemRange(module);
  const { key, data } = handoffInstruction(state, { version: game.system.version, minimum, maximum, manifest: CODEX_MANIFEST_URL });
  return game.i18n.format(key, Object.fromEntries(Object.entries(data).map(([name, value]) => [name, escape(value)])));
}

async function markCarried(actorDocs, notCarried) {
  const actors = new Map(actorDocs.map((actor) => [actor.uuid, actor]));
  for (const { actorUuid, updates } of carriedFixUpdates(notCarried)) {
    if (actorUuid) await actors.get(actorUuid)?.updateEmbeddedDocuments("Item", updates);
    else await Item.updateDocuments(updates);
  }
}

/** Show the hand-off notice where it applies. Not awaited by the ready hook: the GM's dialog would hold it up. */
export async function showCodexHandoff() {
  const module = game.modules.get(CODEX_PACKAGE_ID);
  const state = codexModuleState(module, game.system.version, hasSheetResolver(CODEX_PACKAGE_ID), foundry.utils.isNewerVersion);
  if (state === "ready") return;

  if (!game.user.isGM) {
    const own = storedSetting("client", "starwarsffg.defaultSheetTheme");
    const theme = !own || own === "gm" ? storedSetting("world", "starwarsffg.gmDefaultSheetTheme") : own;
    if (typeof theme === "string" && theme.startsWith("codex")) {
      ui.notifications.info(game.i18n.localize("SWFFG.CodexHandoff.PlayerNotice"));
    }
    return;
  }

  // A dismissal holds only for the state and system version it was given for.
  const seen = `${state}@${game.system.version}`;
  if (game.settings.get("starwarsffg", "codexHandoffDismissed") === seen) return;
  const { actorDocs, world } = gatherWorld();
  if (!world.any) return;

  const found = game.i18n.format("SWFFG.CodexHandoff.Found", {
    sheets: world.codexSheets,
    defaults: world.codexDefaults.length,
    gmTheme: world.gmTheme ? game.i18n.localize("SWFFG.CodexHandoff.GmTheme") : "",
    ownTheme: world.ownTheme ? game.i18n.localize("SWFFG.CodexHandoff.OwnTheme") : "",
  });
  let content = `<p>${game.i18n.localize("SWFFG.CodexHandoff.Intro")}</p><p>${found}</p><p><strong>${instruction(state, module)}</strong></p>`;
  if (world.notCarried.length) {
    const list = world.notCarried
      .map((entry) => `<li>${escape(entry.itemName)}${entry.actorName ? ` (${escape(entry.actorName)})` : ""}</li>`)
      .join("");
    content += `<p>${game.i18n.format("SWFFG.CodexHandoff.NotCarried", { count: world.notCarried.length })}</p><ul>${list}</ul>`;
  }
  const buttons = [
    ...(world.notCarried.length ? [{ action: "fix", icon: "fa-solid fa-suitcase", label: game.i18n.localize("SWFFG.CodexHandoff.MarkCarried") }] : []),
    { action: "later", label: game.i18n.localize("SWFFG.CodexHandoff.Later"), default: true },
    { action: "dismiss", label: game.i18n.localize("SWFFG.CodexHandoff.Dismiss") },
  ];
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("SWFFG.CodexHandoff.Title") },
    position: { width: 520 },
    content,
    buttons,
    rejectClose: false,
  });
  if (choice === "fix") {
    await markCarried(actorDocs, world.notCarried);
    ui.notifications.info(game.i18n.format("SWFFG.CodexHandoff.Fixed", { count: world.notCarried.length }));
  } else if (choice === "dismiss") {
    await game.settings.set("starwarsffg", "codexHandoffDismissed", seen);
  }
}
```

- [ ] **Step 5: Register the setting, the strings and the call**

1. **The dismissal setting.** In `modules/settings/settings-helpers.js`, inside `initLevelSettings()`, directly after the `systemMigrationVersion` registration, add:

   ```js
       // The Codex II hand-off notice (helpers/codex-handoff-notice.js) the GM chose not to see again,
       // as "<module state>@<system version>": a new state or a system update shows it once more.
       game.settings.register("starwarsffg", "codexHandoffDismissed", {
         name: "Codex II notice dismissed",
         scope: "world",
         config: false,
         default: "",
         type: String,
       });
   ```

2. **The strings.** In `lang/en.json`, after the `SWFFG.CampaignDay.*` keys, add:

   ```json
     "SWFFG.CodexHandoff.Title": "Codex II is now a separate module",
     "SWFFG.CodexHandoff.Intro": "This world uses Codex II sheets. Since Star Wars FFG 2.2.0 they come from the Kelborn's SWFFG Codex II module, so they open as classic sheets until it runs. Nothing was lost: once the module runs, every Codex sheet, colour scheme and setting comes back as it was. Until then, leave the ⚙ Sheet choice of those actors and items alone: saving it would replace their Codex sheet.",
     "SWFFG.CodexHandoff.Found": "Found: {sheets} documents set to a Codex II sheet and {defaults} default sheet types set to Codex II{gmTheme}{ownTheme}.",
     "SWFFG.CodexHandoff.GmTheme": ", a Codex II theme as the table's default",
     "SWFFG.CodexHandoff.OwnTheme": ", and a Codex II theme as your own sheet theme",
     "SWFFG.CodexHandoff.Missing": "Install it in Setup → Add-on Modules → Install Module with the manifest URL {manifest}, then enable it in this world's Manage Modules.",
     "SWFFG.CodexHandoff.Inactive": "It is installed but not enabled in this world. Enable it in Manage Modules.",
     "SWFFG.CodexHandoff.SystemTooOld": "The installed version needs Star Wars FFG {minimum} or later and this world runs {version}, so Foundry will not enable it. Update the system, or install a Codex II version that supports {version}.",
     "SWFFG.CodexHandoff.ModuleTooOld": "The installed version supports Star Wars FFG up to {maximum} and this world runs {version}, so Foundry will not enable it. Update it in Setup → Add-on Modules, then enable it in Manage Modules.",
     "SWFFG.CodexHandoff.Failed": "It is enabled but could not start; its error notice says why. Update it in Setup → Add-on Modules.",
     "SWFFG.CodexHandoff.NotCarried": "{count} items were marked \"not carried\" on a Codex II sheet. They do not count toward encumbrance, and gear among them keeps its Active Effects off, but the classic sheet cannot show or change this:",
     "SWFFG.CodexHandoff.MarkCarried": "Mark them carried",
     "SWFFG.CodexHandoff.Later": "Remind me next time",
     "SWFFG.CodexHandoff.Dismiss": "Don't show again",
     "SWFFG.CodexHandoff.Fixed": "{count} items are carried again.",
     "SWFFG.CodexHandoff.PlayerNotice": "Your Codex II sheets now come from the Kelborn's SWFFG Codex II module, which this world is not running. Ask your GM to install and enable it; your sheet theme is kept.",
   ```

3. **The call.** In `modules/swffg-main.js`:
   - add `import { showCodexHandoff } from "./helpers/codex-handoff-notice.js";`;
   - in the `ready` hook, directly after the `try { await handleUpdate(); } catch …` block, add:

   ```js
     // Codex II moved to its own module in 2.2.0: tell a GM whose world still uses it what to do.
     // Not awaited: the GM's dialog must not hold up the rest of ready.
     showCodexHandoff().catch((err) => CONFIG.logger.error("Codex II hand-off notice failed", err));
   ```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, including:
- the 18 `codex-handoff` cases;
- `codex-theme-owner`, which still passes because the notice only reads raw storage;
- `codex-boundary`, which passes because no Codex path is named.

- [ ] **Step 7: Check in Foundry**

The module needs system 2.2.0, so set that version locally first. Do not commit it; revert it in item 8.

```bash
sed -i 's#"version": "2.1.6"#"version": "2.2.0"#' system.json
```

Then, in the `test` world as GM (Task 18 covers the full run):
1. **Set up Codex data** while the module is enabled. Give an actor a Codex ⚙ Sheet, and toggle a gear item to not carried.
2. **Missing module.** Disable the module and reload. The dialog lists 1 document and the gear item.
3. **Fix.** "Mark them carried" restores the item's encumbrance and re-enables its own Active Effects. The next load still shows the dialog for the Codex sheet, without the fix list.
4. **Dismiss.** "Don't show again" hides the dialog on the next load.
5. **New state.** Uninstall the module (move its folder out of `Data/modules`) and reload. The dialog returns with the install instruction, because the state changed.
6. **Player notice.** A player whose stored theme is `codex-…` gets the notice; a player on "default" does not.
7. **Restore** the module folder.
8. **Revert the version:** `git checkout system.json`.

- [ ] **Step 8: Commit**

```bash
git add modules/helpers/codex-handoff.js modules/helpers/codex-handoff-notice.js modules/settings/settings-helpers.js modules/swffg-main.js lang/en.json tests/node/codex-handoff.test.mjs
git commit -m "Tell the GM how to bring Codex II back, and offer to un-hide not-carried gear"
```

## Task 16: Update the notice, changelog, readmes, instructions, docs and wiki

**Files:**
- Modify:
  - `templates/notifications/new_version.html:4-5`
  - `tests/node/new-version-notification.test.mjs`
  - `CHANGELOG.md`
  - `README.md`, `README-fr.md`, `README-ca.md`
  - `CLAUDE.md`, `AGENTS.md`
  - `docs/project-hierarchy.md`
- Delete:
  - `CODEX.md`, `LICENSE-CODEX`, `svg-actor-sheet-layout-downsides.md`
  - `docs/codex-ii-theme-features.md`, `docs/codex-ii-roll-in-guide.md`, `docs/codex-ii-roll-in-guide-ua.md`
  - `docs/codex-force-tree-design.md`, `docs/handoff-codex-special-ammo.md`
  - `docs/design_handoff_codex_foundry/`
  - `docs/superpowers/plans/2026-07-10-eldritch-horror-color-scheme.md`

  All of these were copied to the module repository in Task 12.
- Wiki: `Tutorial.md`, `Tutorial-05b`, `-07`, `-11`, `-12`, `-13`, `-15`, `Extra-Modules.md`.

- [ ] **Step 1: Write the failing notice test**

Add to `tests/node/new-version-notification.test.mjs`:

```js
test("the 2.2.0 notice says where Codex II went", () => {
  // Delete this case together with the notice, in the release after 2.2.0.
  const html = fs.readFileSync(TEMPLATE, "utf8");
  assert.match(html, /Codex II is now a separate module/);
  assert.doesNotMatch(html, /will be moved to a separate module/);
});
```

Run: `node --test tests/node/new-version-notification.test.mjs`
Expected: the new case FAILS.

- [ ] **Step 2: Replace the notice**

In `templates/notifications/new_version.html`, replace lines 4-5 (the `{{!-- Advance notice for 2.1.6…--}}` comment and the `<p>` after it) with:

```html
  {{!-- Codex II left the system in 2.2.0. Remove this notice in the release after it. --}}
  <p><i class="fas fa-triangle-exclamation"></i> <strong>Codex II is now a separate module, Kelborn's SWFFG Codex II.</strong>
    Updating the system from the Setup screen offers to install it; then enable it in Manage Modules. Until then Codex sheets open as classic sheets, and nothing stored is lost.
    <a href="https://github.com/YeNov/StarWarsFFG/wiki/Extra-Modules">How to install it</a></p>
```

Run: `node --test tests/node/new-version-notification.test.mjs`
Expected: PASS. All links are distinct and inside `github.com/YeNov/StarWarsFFG`.

- [ ] **Step 3: Write the changelog entry**

In `CHANGELOG.md`, add these to the top of the existing `` `Unreleased` `` block. Use the pull request number once Task 19 opens the PR, and amend this commit with it before pushing.

```markdown
* Changed — **Codex II is now a separate module, Kelborn's SWFFG Codex II** ([#PR](https://github.com/YeNov/StarWarsFFG/pull/PR)). The Codex sheets, colour schemes and Configure Codex menu come from the module; without it every sheet opens as the classic sheet, and nothing Codex stored is lost.
  * Install the module (updating the system from the Setup screen offers it) and enable it in Manage Modules in every world that uses Codex sheets. Players keep their own sheet theme.
* Added — **a notice for a GM whose world uses Codex II without a working Codex II module** ([#PR](https://github.com/YeNov/StarWarsFFG/pull/PR)). It says whether to install, enable or update the module, and offers to mark gear left "not carried" on a Codex sheet as carried again: the classic sheet cannot show that setting, yet those items stay out of encumbrance.
```

- [ ] **Step 4: Point the readmes at the module**

Add one paragraph at the end of each readme's install section:
- `README.md`: after the line `5. Click Install, after a few seconds the system should be installed.`, before `# Getting Started`.
- `README-fr.md`: at the end of `# Installation`, before `# Contribuer`.
- `README-ca.md`: at the end of `# Instal·lació del sistema de joc Star Wars FFG`, before `# Començar`.

`README.md`:

```markdown
**Codex II sheets** are an optional module since 2.2.0: install *Kelborn's SWFFG Codex II* from
`https://github.com/YeNov/kelborns-swffg-codex-ii/releases/latest/download/module.json`.
```

`README-fr.md`:

```markdown
**Les fiches Codex II** sont un module optionnel depuis la version 2.2.0 : installez *Kelborn's SWFFG Codex II*
depuis `https://github.com/YeNov/kelborns-swffg-codex-ii/releases/latest/download/module.json`.
```

`README-ca.md`:

```markdown
**Les fitxes Codex II** són un mòdul opcional des de la versió 2.2.0: instal·leu *Kelborn's SWFFG Codex II*
des de `https://github.com/YeNov/kelborns-swffg-codex-ii/releases/latest/download/module.json`.
```

- [ ] **Step 5: Tell future sessions about the public API**

Add this section to both `CLAUDE.md` and `AGENTS.md`, after "## Private Information":

```markdown
## Public API for the Codex II module

Codex II is a separate module (`YeNov/kelborns-swffg-codex-ii`) that extends this system's sheets. It
reaches the system only through `globalThis.starwarsffg`, built in `modules/api/public-api.js`.
Renaming or changing anything that file covers — the names in `PUBLIC_API_SHAPE` and the sheet and settings-menu members
listed in its header comment — breaks the module. In that case bump `PUBLIC_API_VERSION` and update the
module in the same sitting. `tests/node/public-api-surface.test.mjs` names the members it covers.
```

- [ ] **Step 6: Remove the Codex docs the module now holds**

```bash
git rm -q CODEX.md LICENSE-CODEX svg-actor-sheet-layout-downsides.md docs/codex-ii-theme-features.md \
  docs/codex-ii-roll-in-guide.md docs/codex-ii-roll-in-guide-ua.md docs/codex-force-tree-design.md \
  docs/handoff-codex-special-ammo.md docs/superpowers/plans/2026-07-10-eldritch-horror-color-scheme.md
git rm -r -q docs/design_handoff_codex_foundry
```

Then update the project map:

Run: `grep -n -i "codex\|cdx" docs/project-hierarchy.md`

1. Delete each listed line that names a file that left: paths under `templates/*/codex`, `styles/cdx*`, `modules/*/codex-*`, `lang/codex`, `images/codex`, or the docs above.
2. Add `- Codex II sheets: a separate module, YeNov/kelborns-swffg-codex-ii.` to the top-level overview list.

Leave the historical plans and specs under `docs/superpowers/`; they record how things were.

- [ ] **Step 7: Update the wiki**

```bash
git clone https://github.com/YeNov/StarWarsFFG.wiki.git <wiki-clone>
git -C <wiki-clone> config user.name YeNov
git -C <wiki-clone> config user.email "$(git -C "<system-repo>" config user.email)"
```

The line numbers below are from 2026-10-06; find each by its text.

1. **`Tutorial.md`.** Lines 6-9 say the system has two sheet themes. Say instead that the system ships its classic sheets, and the Codex II sheets come from the Kelborn's SWFFG Codex II module, with a link to its README. Point the roll-in guide links (around line 43) at `https://github.com/YeNov/kelborns-swffg-codex-ii/blob/main/docs/codex-ii-roll-in-guide.md`.
2. **`Tutorial-13.md`.**
   - Line 73: "Codex sheets only" becomes "Codex II sheets only (the Kelborn's SWFFG Codex II module)".
   - Line 93: the Vehicle Crit Weekly Limit stays under Configure Codex, which exists while the module is enabled.
3. **`Tutorial-05b.md`, `Tutorial-07.md`, `Tutorial-11.md`, `Tutorial-12.md`, `Tutorial-15.md`.** Wherever a page says to switch to a Codex theme or sheet, add "with the Kelborn's SWFFG Codex II module enabled".
4. **`Extra-Modules.md`.** Add an entry for Kelborn's SWFFG Codex II:
   - what it is;
   - its manifest URL;
   - "updating the system offers it";
   - "enable it in each world".

   Its existing line 26 mentions Codex; make it consistent.
5. **Screenshots.** No screenshot changes: the Codex markup and the menu path are the same.

Before pushing, confirm the wiki diff with the owner:

```bash
git -C <wiki-clone> add -A
git -C <wiki-clone> commit -m "Codex II is a separate module from 2.2.0"
git -C <wiki-clone> push
```

- [ ] **Step 8: Run the tests and commit**

Run: `npm test`
Expected: PASS.

Run: `npm run check:imports`
Expected: exit 0.

```bash
git add -A templates/notifications/new_version.html tests/node/new-version-notification.test.mjs CHANGELOG.md README.md README-fr.md README-ca.md CLAUDE.md AGENTS.md docs
git add -u .
git commit -m "Point the update notice, changelog, readmes and docs at the Codex II module"
```

## Task 17: Update the two modules that integrate with Codex

**Background:**
- `ffg-star-wars-enhancements` and `kelborns-swffg-force-presence` keep working unchanged, because the class names, DOM names and unlayered CSS are kept (spec §6).
- Each should recommend the Codex module.
- The enhancements module also has the misspelled key `compatability`, so Foundry ignores all its version bounds today.
- Each is its own repository with its own changelog and release. Do each through a pull request in that repository, and confirm with the owner before pushing.

**Files:**
- In `<fvtt-root>/Data/modules/ffg-star-wars-enhancements` (repository `YeNov/StarWarsFFG-Enhancements`): `module.json`, its changelog.
- In `<fvtt-root>/Data/modules/kelborns-swffg-force-presence` (repository `YeNov/kelborns-swffg-force-presence`): `module.json`, `README.md` (lines 88 and 142).

- [ ] **Step 1: Check what fixing `compatability` would start enforcing**

Run, from `<fvtt-root>/Data/modules`:

```bash
python -c "import json;[print(m, json.load(open(m+'/module.json',encoding='utf-8'))['version']) for m in ['fxmaster','lib-wrapper','statuscounter']]"
```

The enhancements module requires fxmaster ≥ 7.4.2, lib-wrapper ≥ 1.13.4.0 and statuscounter ≥ 3.0.4. Once the key is spelled right, Manage Modules refuses to enable it below those versions.
- If an installed version is lower, ask the owner whether to lower that minimum to the installed, known-working version.
- Otherwise keep the minimums.

- [ ] **Step 2: Update ffg-star-wars-enhancements**

1. In `module.json`, rename every `compatability` key to `compatibility`.
2. Add to `relationships`:

   ```json
       "recommends": [
         {
           "id": "kelborns-swffg-codex-ii",
           "type": "module",
           "manifest": "https://github.com/YeNov/kelborns-swffg-codex-ii/releases/latest/download/module.json",
           "reason": "Adds the special-ammo controls to Codex II weapon and gear cards."
         }
       ]
   ```

   If the module already has a `recommends` list (JB2A_DnD5e, tokenmagic), append this entry to it rather than adding a second key.
3. Add a changelog line in that repository's format. For example: "Fixed — the module's version requirements are applied again; recommends the Codex II module, which Star Wars FFG 2.2.0 no longer includes."
4. Bump the version and open a pull request there.

- [ ] **Step 3: Update kelborns-swffg-force-presence**

1. In `module.json` `relationships`, add a `recommends` entry for `kelborns-swffg-codex-ii` with the same `manifest`, and `"reason": "Draws the Force Presence panel in the Codex II sheet style."`.
2. In `README.md`, lines 88 and 142 describe Codex support. Add that it needs the Kelborn's SWFFG Codex II module from Star Wars FFG 2.2.0.
3. Add a changelog line, bump the version, and open a pull request there.

Merge both pull requests after Task 18 passes, and release them after the system release (Task 19).

## Task 18: Rehearse the upgrade in Foundry

This task runs the scenarios from spec §5 on the `test` world, with a player. It changes no tracked file.

**Prerequisites:**
- Tasks 13-17 are committed on `codex-module/remove`.
- `<module-repo>` holds module 1.0.0's content.
- The system repository's working tree is clean.

- [ ] **Step 1: Back up the world and seed Codex data on 2.1.6**

```bash
cp -r "<fvtt-root>/Data/worlds/test" "<scratch>/test-world-backup"
mv "<module-repo>" "<scratch>/codex-module-parked"
git -C "<system-repo>" switch --detach v2.1.6
```

If `v2.1.6` is missing locally, fetch just that tag with `git -C "<system-repo>" fetch origin refs/tags/v2.1.6:refs/tags/v2.1.6`. A plain `git fetch --tags` fails here because of the local `v2.1.0` tag.

Launch the `test` world (see "How to check a change in Foundry"). Then, as GM:
1. Set GM's Default Sheet Theme to "Codex II — Dark".
2. Give one character ⚙ Sheet → Codex II Sheet.
3. In Configure Settings → Core → Default Sheets, set the vehicle default to "Codex II Sheet".
4. On the Codex sheet, toggle a gear item that carries an Active Effect to not carried. Note the encumbrance, and that the effect is off.
5. Create a Player user who owns that character.
6. As that player, set Default Sheet Theme to "Codex II — Empire".

Stop the server.

- [ ] **Step 2: Update the system without the module**

```bash
git -C "<system-repo>" switch codex-module/remove
sed -i 's#"version": "2.1.6"#"version": "2.2.0"#' "<system-repo>/system.json"
```

Do not commit the version change; the release pull request sets it.

Launch the world. Expected:
1. **GM.**
   - Every sheet is classic.
   - The 2.2.0 update card is in chat.
   - The hand-off dialog shows "missing", 1 document, the vehicle default, the table's Codex theme, and the not-carried gear item.
   - Pressing "Remind me next time" leaves the gear still out of encumbrance.
2. **Player.**
   - The player gets the notice.
   - `localStorage.getItem("starwarsffg.defaultSheetTheme")` still returns `"\"codex-empire\""`.

- [ ] **Step 3: Install and enable the module**

```bash
mv "<scratch>/codex-module-parked" "<module-repo>"
```

Restart the server, launch, and enable Kelborn's SWFFG Codex II in Manage Modules. Expected:
1. **GM.**
   - Characters open Codex in Dark; the ⚙ Sheet character opens Codex; vehicles open Codex.
   - There is no dialog.
   - Configure Codex is back under Star Wars FFG, with the same five values as before.
2. **Player.** Their sheets use Empire, and there is no notice.
3. **Console.** No errors.
   - `Object.keys(CONFIG.Actor.sheetClasses.character).filter((k) => k.includes("Codex"))` lists `ffg.CodexActorSheet` and `ffg.CodexAdversarySheet` once each.

- [ ] **Step 4: Disabled, fixed and dismissed**

1. Disable the module and reload. The dialog shows "inactive".
2. Press "Mark them carried". The gear counts toward encumbrance again, and its Active Effect is back on.
3. Reload. The dialog still shows for the Codex sheet and defaults. Press "Don't show again".
4. Reload. No dialog.

- [ ] **Step 5: Incompatible**

1. **System too old for the module.** Edit `<module-repo>/module.json` locally: set `"minimum": "9.9.9"` in its `starwarsffg` relationship. Do not commit.
2. Launch. Manage Modules greys the module out. The dialog returns, because the state changed and the earlier dismissal no longer applies. It says the module needs Star Wars FFG 9.9.9 and tells the GM to update the system or install a Codex II version that supports 2.2.0, not to update the module.
3. **Module too old for the system.** Set the relationship to `"minimum": "2.0.0", "maximum": "2.1.9"` instead, and launch. The dialog says the module supports up to 2.1.9 and tells the GM to update the module.
4. Revert the edit with `git -C "<module-repo>" checkout module.json`.

- [ ] **Step 6: Old system with the new module**

```bash
git -C "<system-repo>" stash
git -C "<system-repo>" switch --detach v2.1.6
```

Launch. Expected:
- Manage Modules shows the module as incompatible (minimum 2.2.0) and Foundry keeps it off.
- Codex works from the built-in 2.1.6 copy.
- `Object.keys(CONFIG.Actor.sheetClasses.character).filter((k) => k.includes("Codex"))` lists each Codex sheet once.

- [ ] **Step 7: Restore**

```bash
git -C "<system-repo>" switch codex-module/remove
git -C "<system-repo>" stash pop
git -C "<system-repo>" checkout system.json
rm -rf "<fvtt-root>/Data/worlds/test"
cp -r "<scratch>/test-world-backup" "<fvtt-root>/Data/worlds/test"
```

The `stash pop` restores the local 2.2.0 version edit, and the `checkout` reverts it. Delete the throwaway Player user if it survived the restore. Any failure above goes back to the task that owns the behaviour; fix it there before Task 19.

## Task 19: Release the module, then the system

**Background:**
- The module goes first: the system's `recommends` entry points at the module's manifest URL, which must answer before the system release is published.
- The system release follows this repository's release process: a release pull request, a GitHub release on the merge commit, and the workflow attaching `system.zip`.

- [ ] **Step 1: Release module 1.0.0**

Check:
- `module.json` has `"version": "1.0.0"`;
- `CHANGELOG.md` has its `1.0.0` block;
- the Tests check on `main` is green.

Then, with the owner's go-ahead and `gh auth status` showing `YeNov`:

```bash
gh release create v1.0.0 --repo YeNov/kelborns-swffg-codex-ii --target main --title 1.0.0 --notes-file <scratch>/codex-1.0.0-notes.md
```

The notes should give:
- the summary line;
- the install steps;
- "requires Star Wars FFG 2.2.0".

After the "Create Release" workflow finishes:

Run: `curl -sL https://github.com/YeNov/kelborns-swffg-codex-ii/releases/latest/download/module.json | python -c "import json,sys; d=json.load(sys.stdin); print(d['version'], d['download'])"`
Expected: `1.0.0 https://github.com/YeNov/kelborns-swffg-codex-ii/releases/download/v1.0.0/module.zip`

Run: `curl -sIL https://github.com/YeNov/kelborns-swffg-codex-ii/releases/download/v1.0.0/module.zip | grep -i "^HTTP" | tail -1`
Expected: `HTTP/2 200`.

- [ ] **Step 2: Open and merge the Part 3 pull request**

```bash
gh auth status
git -C "<system-repo>" push -u origin codex-module/remove
gh pr create --repo YeNov/StarWarsFFG --base main --head codex-module/remove \
  --title "Codex II becomes the Kelborn's SWFFG Codex II module" --body-file <scratch>/pr-part3.md
```

1. Put the PR number into the two `[#PR]` links in `CHANGELOG.md`, amend, and push again.
2. The PR body should describe:
   - what left the system;
   - the `recommends` entry;
   - the hand-off notice;
   - the rehearsal in Task 18;
   - the user action from the changelog.

   End it with this session's PR attribution line.
3. Merge with `gh pr merge <n> --repo YeNov/StarWarsFFG --merge`.

- [ ] **Step 3: Cut 2.2.0**

Follow the fork's release process:
1. Create branch `release-2.2.0` from `main` with one commit, "Release 2.2.0":
   - `system.json`: `version` `2.2.0`, `download` `https://github.com/YeNov/StarWarsFFG/releases/download/v2.2.0/system.zip`;
   - `CHANGELOG.md`: rename the `` `Unreleased` `` heading to `` `2.2.0` `` and add a one-line summary under it, for example: "Codex II becomes its own module, Kelborn's SWFFG Codex II, with a notice for worlds that still use it."
2. Run `npm test`.
3. Open the pull request "Release 2.2.0" and merge it with a merge commit.
4. Create the release:

   ```bash
   gh release create v2.2.0 --repo YeNov/StarWarsFFG --target <merge sha> --title 2.2.0 --notes-file <scratch>/system-2.2.0-notes.md
   ```

The release notes lead with the user action: **Install Kelborn's SWFFG Codex II and enable it in every world that uses Codex sheets.**

After the workflow:

Run: `curl -sL https://github.com/YeNov/StarWarsFFG/releases/latest/download/system.json | python -c "import json,sys; d=json.load(sys.stdin); print(d['version'], d['relationships']['recommends'][0]['id'])"`
Expected: `2.2.0 kelborns-swffg-codex-ii`

- [ ] **Step 4: Check the install prompt on a throwaway Foundry**

Never run Foundry's Update on the portable install whose `systems/starwarsffg` is this git checkout: it would overwrite the working tree.

Instead, start Foundry on an empty scratch data folder:

```bash
node "<fvtt-root>/App/resources/app/main.js" --dataPath="<scratch>/fvtt-data" --port=30001 --noupnp
```

1. Install the system from `https://github.com/YeNov/StarWarsFFG/releases/download/v2.1.6/system.json`.
2. Press Update on it.
3. Expected: Foundry offers "Kelborn's SWFFG Codex II", pre-ticked, with the reason text; installing it succeeds.

Afterwards, stop the server and delete `<scratch>/fvtt-data`.

- [ ] **Step 5: Release the dependent modules and close out**

1. Merge and release the Task 17 pull requests in their repositories.
2. Delete the 2.1.6 notice's leftovers, if any remain in open branches.
3. Update the memory note about the release process if anything in it changed.


