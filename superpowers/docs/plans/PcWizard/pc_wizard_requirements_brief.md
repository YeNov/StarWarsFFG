# PC Wizard rewrite — Requirements Brief

> **Revision history**
> - **2026-07-19 (v1)** — original brief. Scoped the rewrite as a standalone Foundry **module** consuming a new `game.system.api` surface (old D1), superseding the in-tree creator (old D8).
> - **2026-07-20 (v2, CURRENT — supersedes v1 entirely)** — **ARCHITECTURE PIVOT: the wizard is now built IN the `starwarsffg` fork, replacing the in-tree `CharacterCreator` in place.** No module, no system API surface, no adapter, no version handshake, no supersession mechanism. Reverses audit §14.0 and §14.5 and old decisions D1/D8. Adds D9 (commit observability) and D10 (xpLog untouched). All other decisions (D2–D7) stand. **Read only this revision; everything below is current.**

## 1. Goal

Rewrite the Star Wars FFG system's in-tree **`CharacterCreator`** ("PC Wizard") **in place, inside the
`starwarsffg` fork**. Keep the good skeleton, rebuild the bad engine, fix the known bugs, and add the
v2 product requirements. Priorities in order: (1) correctness of the character build, (2) performance
(kill the per-keystroke DB-actor churn), (3) maintainability (kill the duplication and imperative DOM
wiring), (4) new features (per-source checkbox pool, gear filters, draft resume).

**This is a single-repo change.** The old plan (standalone module + a versioned `game.system.api`
surface + an adapter + a supersession mechanism) is **cancelled** — it required users to run the fork
anyway, so the module boundary was pure overhead. Deleting it removes roughly a third of the design's
complexity and makes several helpers direct calls instead of "pure wrapper" API operations.

## 2. Repo & VCS

**Implementation repo (the only one that changes):**
`D:\SW FFG\Portable FVTT\Data\systems\starwarsffg` — git `main`, remote `YeNov/StarWarsFFG` (the product
owner's fork; upstream push disabled). **Git, not Perforce** — no `p4`. Do not commit or push unless
instructed; during implementation, commit per-stage, never push.

Key files:
- Main class to rewrite (~1846 lines): `modules\helpers\character-creator.js`
- Entry button (`#ffgCharacterWizard`, `renderActorDirectory`), GM socket bridge, per-type
  `<type>Compendiums` settings: `modules\swffg-main.js` (~1438-1465, ~2052-2126, ~567-652)
- Creator config: `modules\config\ffg-character-creator.js` (already global via
  `CONFIG.FFG.characterCreator`, assigned in `modules\swffg-config.js`)
- AE modes: `modules\config\ffg-active-effect-modes.js`
- XP log helpers: `modules\helpers\actor-helpers.js` (`xpLogEarn` :258, `xpLogSpend` :211 — both write
  the `starwarsffg.xpLog` flag; `notifyXpSpend` :235 creates a ChatMessage)
- Dice pools: `modules\helpers\dice-helpers.js` (`DiceHelpers.addSkillDicePool` :145)
- Sheet helpers: `modules\actors\actor-sheet-ffg.js` (`_createSkillColumns` :2324 — verified `this`-free,
  `sortDataBy` :2921, `addIfNotExist` :2939)
- Actor hooks: `modules\actors\actor-ffg.js` (`create` :38-107 applies character prototypeToken defaults
  only when `data.system` is absent; `_preCreate` :111-126 sets the character image; `_preUpdate`
  :131-231 adjusts wounds/soak/encumbrance/strain on Brawn/Willpower changes)
- Tree effects: `modules\helpers\item-helpers.js` (`syncTreeActiveEffects` :274-350, claim/same-name
  reconciliation :297-345)
- Templates: `templates\wizards\char_creator\`; i18n: `lang\en.json` (`SWFFG.CharacterCreator.*` 962-1103)
- Manifest: `system.json` (`"socket": true`; currently v2.0.3; `manifest`/`download` still point upstream)

**Planning docs** (this brief, the design doc, all reviews, and the forthcoming implementation plan)
live **inside this same fork** as of 2026-07-20:
`D:\SW FFG\Portable FVTT\Data\systems\starwarsffg\superpowers\docs\plans\PcWizard\`
The source spec sits one level up at
`D:\SW FFG\Portable FVTT\Data\systems\starwarsffg\superpowers\docs\pc-wizard-implementation-audit.md`.
Read them there — they were moved out of the old module repo when the architecture pivoted, so ignore
any older reference to a `modules\kelborns-swffg-pc-creator\...` docs path. These files are currently
**untracked** in this repo (not committed). The now-codeless `kelborns-swffg-pc-creator` repo still
holds a stale duplicate of the audit; its disposition (archive/repurpose) is the owner's call and is
NOT part of this work.

**Foundry v13 core source (read-only reference):** `D:\SW FFG\Portable FVTT\App\resources\app`

## 3. Architectural context (post-pivot)

The wizard is system code again, so it may **import system internals directly**
(`actor-helpers`, `dice-helpers`, `actor-sheet-ffg`, `item-helpers`, `config/ffg-active-effect-modes`,
`CONFIG.FFG`). There is **no** API contract, adapter, versioning, or handshake to design. Where earlier
revisions specified "pure fork-side API operations," those become **ordinary internal functions** —
still factored as pure/shared helpers where that aids testing and prevents drift (notably: share the
tree-effect reconciliation core with `syncTreeActiveEffects`, and extract the character
creation-defaults factory used by `ActorFFG.create`/`_preCreate`), but with no public surface.

## 4. Binding decisions

- **D1 — IN-SYSTEM (REVISED 2026-07-20).** Build the wizard inside the `starwarsffg` fork, **replacing**
  the existing `CharacterCreator`. No module, no `game.system.api`, no adapter, no version handshake.
  Direct imports. Single repo.
- **D2 — Preview = IN-MEMORY.** Unsaved in-memory `character` Actor built from `this.data` (items as an
  embedded array); construct at/after `ready` and rely on constructor preparation — do **not** call
  `prepareData()` a second time without `reset()`. **Never `.create()` for preview.** No DB writes, no
  socket, no orphans, no flicker.
- **D3 — Final commit = KEEP A MINIMAL GM SOCKET BRIDGE.** GM-run wizard creates directly. A non-GM
  player round-trips **one** socket request to the active GM for the **single final create**. Preview
  never uses the socket. Proper listener lifecycle (no leak).
- **D4 — Validation = SOFT-WARN ONLY.** Create is **never blocked**; per-step ✔/✘ status + warnings
  (incl. overspend/completeness) are purely **advisory**.
- **D5 — Draft resume = IN SCOPE.** Persist wizard state so a closed/reopened wizard resumes.
  Serializable schema (uuids + source data, never live Documents), schema versioning, clear/discard UX,
  and a true commit mutation barrier (no mid-commit edits; no clear-then-resave).
- **D6 — Gear filters** (price / rarity / isRestricted) operate **within** the GM-gated pool;
  `maxRarity`/`allowRestricted` still cap what is offered. No in-wizard reveal-restricted toggle.
- **D7 — Content pool = per-source checkbox list**, persisted, built on `getSources(type)` →
  `<type>Compendiums`. Content-source **only**. The standalone **`rules` tab is DROPPED**; the ruleset
  selector (fad/aor/eote) **folds into the starting-bonus/obligation tab**. Ruleset must resolve early
  (default `fad`) — it gates the background tab's Force-attitude field and the starting-bonus tables.
- **D8 — REPLACE, don't supersede (REVISED 2026-07-20).** The rewritten creator *is* the system's
  creator. The existing `#ffgCharacterWizard` entry button stays and simply opens the new
  implementation. No `_canRender` suppression, no defensive button-stripping, no dual-creator concerns.
- **D9 — Commit observability (NEW 2026-07-20).** The rare commit edge cases (see §6, R5-1) are handled
  by making them **visible and manually recoverable**, not by eliminating them:
  - **GM** gets a **whisper + log** when a player **starts** creating (de-duplicated: once per wizard
    session, not per render) and when a player **finishes** — the finish record must include a
    **clickable link to the created actor**.
  - **Player** gets a **whisper + toast**. The success toast is **green and gated on the GM's
    acknowledgement** — if no ACK arrives, the player stays in an honest "submitting / not confirmed"
    state and is never shown green.
  - These two records let the GM disambiguate: *started but never finished* → submission didn't
    complete (auto-retry usually fixes it; else re-submit); *finished/created but player can't see it*
    → the actor exists, tell the player to **reconnect/refresh** (owned actors re-sync on reconnect).
- **D10 — Do NOT change the `xpLog` data shape (NEW 2026-07-20).** `flags.starwarsffg.xpLog` stays as
  it is. Making it a keyed object (so Foundry merges keys instead of replacing an array) would fix the
  pre-existing concurrent-write race system-wide, but it is a breaking change requiring migration of
  every character in every world — **out of scope here, logged as a separate future improvement.**
  Instead, the wizard simply **does not become another writer**: commit-log reconciliation is
  **read-only** (verify + warn, never rewrite the array).

## 5. Keep (the good skeleton — audit §11)

1. `ApplicationV2` + `HandlebarsApplicationMixin` multi-tab shell (PARTS / TABS / tab-navigation).
2. **The `this.data` state model** — `grants / selected / available / purchases / initial`. Keep the
   shape; single source of truth; derive everything else; never store derived numbers.
3. `getSources(type)` abstraction — keep, but **de-duplicate the six copy-pasted loaders into one
   generic `loadSource(type, bucketer)`**.
4. Pure calculators `calcXp` / `calcCredits` / `calcObligation` — keep (fix `calcObligation`'s
   independent duty/obligation adjustment vs `grants.bonus`).
5. The **live-preview concept** — keep the idea, replace the mechanism (D2).
6. i18n keys (`SWFFG.CharacterCreator.*`) and the existing settings.
7. The tab flow (minus the dropped rules tab) and the review "✔/✘ per section" pattern.

## 6. Rebuild + fix

Original issue register (audit §12) — all must be resolved:

| ID | Problem | Disposition |
|---|---|---|
| A | Preview deletes+recreates a **DB Actor per keystroke** — root of the "trillion temp actors" bug | In-memory unsaved actor (D2) |
| B | jQuery + DataTables + SlimSelect imperative `_onRender`, re-instantiated each render; 15-col shop table by numeric index | ApplicationV2 `actions` + HBS; listener ownership scoped per-part (`_attachPartListeners`), NOT a whole-window rescan |
| C | `showCharacterStatus` vs `createActor` ~130 near-identical lines; 6 copy-paste loaders | One shared `applyBuild()`; one generic `loadSource()` |
| D | Mutates shared **cached Documents** (`.pill` monkey-patch; `islearned` flipped on loaded docs) | uuids/source data in `this.data`; clone before mutate; `.pill` in context |
| E | Skill ranks via `attr${Date.now()}` + one AE each | Deterministic single grant |
| F | Constructor `game.socket.on` with no `.off` → listener leak | Proper lifecycle |
| G | No draft/resume; review ✔/✘ cosmetic | D5 + advisory validation (D4) |
| H | Dead ends: `myFormHandler` undefined, `_preparePartContext` TODO, unused `footer.html`, no-op `.replace(" "," ")` | Delete |
| BUG-1 | Motivations mis-shaped (`{item:Doc}`; preview checks `item?.uuid`, commit pushes the wrapper) | Fix both paths |
| BUG-2 | AoR/EotE bonus writes `bonus[undefined]` (`grants.rules` doesn't exist) | Use `selected.rules` |
| BUG-3 | Force-power refund compares `specName` (string) `===` a Document | Compare `.name` |
| BUG-4 | Raw HTML shown via `.text(system.description)` | `TextEditor.enrichHTML` / strip for tooltips |

Defects found during code grounding (N-1..N-7) — also in scope: world careers never load
(`type === "careers"`), unfiltered socket broadcasts, bridge dies if first-ready GM logs out, gear has
no world-item fallback, extra purchased specs/Force powers never materialized, gear absent from
preview, and the wizard never syncs tree AEs after flipping `islearned`.

### Correctness constraints established during design review (must be honored)

- **Characteristic purchases** must reproduce the source-side consequences that `ActorFFG._preUpdate`
  performs (Brawn → base wounds/soak/encumbrance; Willpower → base strain), since the build constructs
  the Actor from source rather than issuing `update()` calls.
- **Tree purchases** must materialize with **synchronized ActiveEffects** using the same claim /
  same-name-fallback / no-delete reconciliation as `syncTreeActiveEffects` (skip empty change arrays;
  claim exact flagged tuple first, then one unclaimed same-name effect; patch in place; append only when
  unmatched) — flipping `islearned` alone is insufficient.
- **Embedded IDs**: give every embedded Item occurrence and nested ActiveEffect a **stable deterministic
  valid 16-char `_id`** (distinct per duplicate purchase, identical across repeated constructions of the
  same commit). Foundry assigns `randomID(16)` only when `_id` is absent.
- **Character defaults**: a complete source containing `system` bypasses `ActorFFG.create`'s prototype
  token block and `_preCreate`'s image — extract a shared creation-defaults factory and apply it.
- **One canonical item-source projection** used identically by preview and commit, preserving
  load-bearing fields: Item `flags.starwarsffg` (drives `enableAmmo`, `medicalType`) and ActiveEffect
  `changes[].priority` (preparation sorts by it), plus `description`, `tint`, `sort`, `flags.core.overlay`,
  `type`, `system`, `duration`, `statuses`, `transfer`. Strip only identity/ownership. Third-party flag
  scopes: explicitly unsupported (recorded limitation).
- **Commit model = deterministic-ID, overwrite-idempotent, best-effort** (NOT atomic exactly-once).
  Foundry's top-level Actor create is an **upsert** (`batch.put`; the create-only `u.has(id)` check runs
  only for *embedded* collections), so no primary-key collision arbitration exists. Derive the Actor
  `_id` from the authenticated `{userId, commitId}`; bind one **immutable payload** per `commitId` (a
  post-failure edit mints a NEW `commitId`); same-payload retries then converge on one record. The
  occupant stamp check is an explicit **best-effort preflight**, not a "never overwrite" guarantee.
  **Make no atomic/exactly-once claims.**
- **XP logs**: bake the two deterministic creation entries into the committed Actor source so an
  overwrite restores rather than erases them; suppress the wizard's whisper (the helper notifies
  unconditionally); reconciliation is **read-only** (D10). `xpLogEarn` picks `action` from `granter`
  (`"GM"` → `granted`, else `adjusted`) — any shared entry builder must carry `granter`/`action`.

### Accepted residual risk (documented, not eliminated)

Under the best-effort commit model, if a player's commit acknowledgement is lost and the retry is
handled by a **different** GM (failover), the character may be re-written with a slightly different
owner-GM entry / XP-log timestamp; and if the player edits and resubmits while a slow original attempt
also lands, **two** actors can result. Worst case is a **duplicate character the GM deletes** — never a
lost or corrupted build. This is **accepted for v1** and mitigated by the D9 observability layer. The
server-arbitrated embedded-ledger design (true exactly-once) stays documented as future hardening.

## 7. Non-goals

- Do **not** build a module, a `game.system.api` surface, an adapter, or a supersession mechanism.
- Do **not** change the world's actor-creation permission posture (keep the GM bridge, D3).
- Do **not** change the `xpLog` data shape or migrate existing logs (D10).
- Do **not** redesign the tab flow, the i18n keys, or the settings semantics.
- Do **not** re-introduce a per-keystroke persistence path of any kind.

## 8. Verification

**CORRECTION (2026-07-20):** an earlier revision of this brief wrongly stated that no automated test
harness exists. It does. The fork has **12 test files** under `tests\`, including a `tests\v2-migration\`
suite (`minimized-close`, `form-submit-coalesce`, `sheet-initial-size`, `sheet-skill-data`,
`sheet-tab-cache`) plus `common`, `modifiers`, `talent-tree`, `replace-die`, `crit-trauma-counter`,
`codex-schemes`, and `ffg-tests.js`. `package.json` provides **`npm run lint`** (eslint over `modules`)
and carries **Playwright** and **Cypress** as devDependencies, but defines **no `test` script** — the
implementation plan must determine and state the actual invocation before relying on it.

**Existing callers that the rewrite must not break** — exactly two files import the class by its current
path (`modules/helpers/character-creator.js`):
- `modules\swffg-main.js:58` — `import {CharacterCreator} from "./helpers/character-creator.js";`
  (constructed at :1458-1461). **Deleting that file without updating this import breaks ES-module
  resolution and the entire system fails to boot.**
- `tests\v2-migration\minimized-close.test.js:12` — imports the same path.
Either keep a compatibility shim at the old path re-exporting the new class, or update both importers.

Verification is by (a) static correctness against the actual code, (b) **`npm run lint` clean**,
(c) the existing test suite still passing — in particular `tests\v2-migration\minimized-close.test.js`,
(d) a **static import smoke check** (the system loads and hooks register) before any manual test,
(e) manual Foundry smoke steps enumerated per stage (open wizard as GM; build a character; confirm
**no `temp actor - …` documents** are created during preview; confirm final actor stats match preview;
run once as a **non-GM player** through the GM bridge and confirm the D9 notifications), (f) a
**canonical-projection parity fixture** (ammo-enabled weapon + medical gear + two order-sensitive
ActiveEffects + a tinted core-overlay effect) asserting preview and commit construct equivalent items,
and (g) a console-clean load. The implementation plan must state concrete, checkable verification for
every stage.
