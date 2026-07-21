# PC Wizard rewrite — Design Document v7 (in-system, consolidated, self-contained)

| | |
|---|---|
| **Status** | Draft v7 — final design artifact. In-system architecture (2026-07-20 pivot) confirmed sound by review round 6; this revision closes the three remaining mechanical findings R6-1 (entry-point wiring), R6-2 (deterministic embedded ids in preview), R6-3 (D9 notification lifecycle), and adopts the corrected brief §8 (the fork **has** a test harness). R5-1's cross-GM residual remains accepted product policy. Supersedes v1–v6 entirely. |
| **Date** | 2026-07-20 |
| **Author** | Design session (Claude), for product owner YeNov |
| **Inputs** | [Requirements brief **v2** (2026-07-20, §8 corrected)](pc_wizard_requirements_brief.md) — BINDING; the pre-pivot implementation audit (its issue register A–H / N-1..N-7 is fully carried into §6 here — the audit itself was the cancelled module-architecture spec and was removed in Phase 4 cleanup); design reviews rounds 1–6 (removed with the bounce scratch); the `starwarsffg` fork source; the installed Foundry v13 core source |
| **Successor doc** | A separate step-by-step implementation plan (not this document) |

## 0. Grounding & verification status

Every code claim in this document was verified **first-hand** during design rounds 1–6 against:

- **The system fork** `D:\SW FFG\Portable FVTT\Data\systems\starwarsffg` (v2.0.3): the whole of
  `modules/helpers/character-creator.js` (1846 lines, incl. the minimized-close guard in
  `close()` `:199-202`); `modules/swffg-main.js` (old-class import `:58`, entry button
  `:1438-1465` constructing it at `:1458-1461`, GM socket bridge `:2052-2126`, compendium
  settings `:567-652`, `CONFIG.FFG = FFG` `:234`, `CONFIG.ActiveEffect.legacyTransferral =
  false` `:218`, hooks `init :178` / `ready :1553`); `modules/config/ffg-character-creator.js`
  (full) and its global exposure (`swffg-config.js:45`);
  `modules/config/ffg-active-effect-modes.js:18-25` (frozen numeric `AE_MODES`);
  `modules/helpers/actor-helpers.js` (`xpLogSpend :211-227`, `notifyXpSpend :235-245`,
  `xpLogEarn :258-279` — entry shape, `statusId` → entry `id`, `granter` → `action` selection,
  unconditional notify from `xpLogSpend`); `modules/helpers/dice-helpers.js`
  (`addSkillDicePool :145-228` — `{data: system}` holder, `data-ability`, `.roll-button`,
  receiver-dependent branches `:157-158,:221-223`, `enableAmmo` flag read `:76-80`);
  `modules/actors/actor-sheet-ffg.js` (`_createSkillColumns :2324-2381` — verifiably
  `this`-free; `sortDataBy :2921`, `addIfNotExist :2939`; `medicalType` flag read
  `:1165-1168`; `_buyCore` shared purchase dialog `:2383+`); `modules/actors/actor-ffg.js`
  (`create :38-108` — per-type prototypeToken blocks applied **only when `data.system` is
  absent** `:42-44`; `_preCreate :111-128` — default image map; `_preUpdate :131-234` — Brawn →
  wounds/soak/encumbrance, Willpower → strain source math);
  `modules/helpers/item-helpers.js` (`syncAEStatus :240-268` dispatch,
  `syncTreeActiveEffects :284-352` claim/same-name/no-delete reconciliation,
  `buildActiveEffectChanges :361-393` pure); `modules/helpers/modifiers.js`
  (`explodeMod :471-545` — Brawn expands to Brawn+EncumbranceMax+Soak, **not wounds**;
  Willpower to itself only); `modules/items/item-ffg.js:777-781` (enableAmmo display);
  `modules/items/item-sheet-ffg.js` (post-purchase `islearned` + `syncAEStatus`
  `:1776-1777`; log-failure swallow `:1760-1766`); `system.json` (v2.0.3, `"socket": true`,
  documentTypes, upstream-pointing `manifest`/`download` `:5,92-94`); the
  `templates/wizards/char_creator/` tree; `lang/en.json` (flat `SWFFG.CharacterCreator.*`
  keys from `:962`).
- **The fork's test harness (verified 2026-07-20, correcting earlier revisions of the brief):**
  12 test files under `tests\` — `tests\v2-migration\{minimized-close, form-submit-coalesce,
  sheet-initial-size, sheet-skill-data, sheet-tab-cache}.test.js` plus `common.test.js`,
  `modifiers.test.js`, `talent-tree.test.js`, `replace-die.test.js`,
  `crit-trauma-counter.test.js`, `codex-schemes.test.js`, `ffg-tests.js`. `package.json`
  defines `"lint": "npx eslint modules"` and carries Playwright + Cypress as devDependencies
  but **no `test` script** — the implementation plan must determine the actual invocation.
  **Exactly two files import the old class path** `modules/helpers/character-creator.js`:
  `modules\swffg-main.js:58` and `tests\v2-migration\minimized-close.test.js:12` (grep-verified;
  all other hits are markdown docs).
- **Foundry v13 core** `D:\SW FFG\Portable FVTT\App\resources\app`:
  `client/documents/abstract/client-document.mjs:57-64` (construction runs `_safePrepareData`
  once `game._documentsReady`); `client/documents/actor.mjs:206-229` (`applyActiveEffects`
  sorts changes by `priority ?? mode*10`); `common/documents/actor.mjs:93-97`
  (`_initializeSource` fills `prototypeToken.name`/`texture.src` from the source's own
  name/img); `common/documents/active-effect.mjs:40-72` (full AE schema incl.
  `changes[].priority`, `description`, `tint`, `sort`, `statuses`, `transfer`, `flags`,
  `_stats`); `client/canvas/placeables/token.mjs:1685-1694` (`flags.core.overlay` +
  `effect.tint` are rendered behavior); `common/documents/user.mjs:204-220` (players may
  update their own User doc; `flags` unrestricted); `common/data/validators.mjs:8-10`
  (document-id shape `/^[a-zA-Z0-9]{16}$/`); `common/abstract/document.mjs:684-688`
  (`Document.create` async) and `:933-949` (`setFlag` = whole-value update);
  `common/abstract/embedded-collection.mjs:114-165` (duplicate embedded `_id` returns the
  already-indexed doc; **`randomID(16)` assigned only when `_id` is absent** `:156`);
  `common/abstract/_types.mjs:81-88` (`keepId=false`, `keepEmbeddedIds=true` defaults);
  `client/data/client-backend.mjs:127-157` (create responses applied via Map-replacing
  `collection.set` `:143`); `client/applications/api/application.mjs` (`_canRender` gate
  `:466-473`; `_onRender` fires app-wide after every render `:522-525`);
  `client/applications/api/handlebars-application.mjs` (PART `forms` registry `:26-27`;
  partial renders replace only requested parts and invoke per-part `_attachPartListeners`
  `:191-206,:270-284`); **the server database path** (minified `dist/database/backend/`):
  `server-backend.mjs` duplicate-id check `u?.has(t._id)` throws only for a **parent
  (embedded) collection** — `u` is undefined for world Actors; `server-document.mjs`
  `batchWrite` ends in LevelDB `put` (replace); `sublevel-database.mjs` `put` delegates to
  LevelDB `put`; `server-document.mjs` `_preCreate` runs
  `_generateEmbeddedDocumentIds(keepEmbeddedIds)` and **adds the requesting user at OWNER when
  absent from the source ownership map** — for bridge commits, the processing GM.
  **Conclusion carried throughout: a top-level Actor create with `keepId: true` is an UPSERT;
  no primary-key rejection exists.**

**Remaining runtime-only verification** (all in §11): numeric preview/final stat parity
(incl. the canonical-projection and identity fixtures), measured draft size in user flags,
AppV2 part-render performance tuning, the actual test-suite invocation (no `test` script
exists), and the D9 notification flow end-to-end as a non-GM player.

---

## 1. Problem statement

The Star Wars FFG system ships an in-tree guided character creator — the `CharacterCreator`
class in `modules/helpers/character-creator.js` (1846 lines), an
`ApplicationV2` + `HandlebarsApplicationMixin` window launched from the `#ffgCharacterWizard`
button the system injects into the Actors directory (`swffg-main.js:1438-1465`).

Its **skeleton is good**: a multi-tab AppV2 shell; a clean `this.data` state model
(`grants / selected / available / purchases / initial`); a GM-configurable content-source
abstraction (`getSources(type)` → `<type>Compendiums` settings ∪ world items); pure
XP/credits/obligation calculators; and a live preview showing real derived stats.

Its **engine is bad**:

- The preview **deletes and recreates a database Actor on every mutation**
  (`showCharacterStatusShim :1059-1081`) — non-GM players do it via a GM socket round-trip per
  keystroke (`swffg-main.js:2052-2126`). This is the root of the historical "trillion temp
  actors" bug (#2183): DB churn, orphaned `temp actor - <user>` documents, name-collision
  hazards, latency, flicker.
- All interactivity is wired imperatively in `_onRender` (`:205-508`) with jQuery + DataTables +
  SlimSelect, re-instantiated on every render, including a 15-column shop table whose columns
  are toggled by numeric index 0–14 (`:363-481`).
- The temp-preview build (`showCharacterStatus :1083-1205`) and the final build
  (`createActor :1697-1845`) are ~130 near-duplicated lines; six source loaders (`:660-841`)
  are the same copy-pasted loop.
- Cached compendium Documents are mutated in place: `.pill` monkey-patched on (`:677` et al.),
  `islearned` flipped on loaded docs (`:1434`, `:1461-1468`), obligation fields edited directly
  on the loaded doc (`:1017-1021`).
- Career/spec skill ranks are granted via `attr${Date.now()}` item attributes plus one
  ActiveEffect per rank (`:1151-1200`, `:1791-1839`) — same-millisecond collisions are real.
- The constructor registers a socket listener with no `.off` (`:189-195`) — one leak per open.
- Closing the window loses all work; the review tab's ✔/✘ marks are cosmetic.
- Dead ends: an undefined `form.handler: CharacterCreator.myFormHandler` (`:102`), a
  `_preparePartContext` TODO branch (`:625-637`), unused `footer.html`, no-op-looking
  `.replace(" ", " ")` normalizations (`:582`, `:1232`).
- Concrete bugs BUG-1..4 and code-grounding discoveries N-1..N-7 (§6.2/§6.3) — including two
  where **XP is charged for purchased extra specializations/Force powers that never reach the
  actor at all**.

Per the **2026-07-20 pivot** (brief v2), the rewrite happens **in place, inside the
`starwarsffg` fork** — a single-repo change. The earlier module + `game.system.api` + adapter +
supersession architecture (design rounds 1–5) is cancelled: it required users to run the fork
anyway, so the module boundary was pure overhead. The wizard is system code and imports system
internals directly. Decisions D2–D7 stand; D1/D8 are revised (in-system; replace, don't
supersede); D9 (commit observability) and D10 (xpLog untouched) are new and binding. Review
round 6 confirmed the in-system architecture is feasible and that the shared-helper factoring
preserves existing sheet/system behavior.

## 2. Goals

In priority order (brief §1):

1. **Correctness of the character build.** The final actor exactly matches the previewed build;
   BUG-1..4 and N-1..N-7 fixed; one shared build path so preview and commit cannot drift; the
   source-construction rules reproduce the system's update-hook and effect-reconciliation
   semantics explicitly (§5.5).
2. **Performance and best-effort idempotent persistence.** Editing and preview perform **no**
   actor or socket persistence of any kind. Commit is a **deterministic-id upsert,
   best-effort**: one immutable normalized payload is bound per `{userId, commitId}`, so in the
   normal path exactly one final Actor record (one world key) results and same-payload retries
   on the same GM are byte-identical no-op overwrites. The two initial XP-log entries are part
   of the committed Actor source; the wizard's log verification is **read-only** (D10) and its
   initial entries emit **no chat whisper** (deliberate change, §5.8.4). No atomicity,
   exactly-once, or never-overwrite claim is made anywhere; the accepted residuals are §9 and
   are mitigated by the D9 observability layer (§5.9). Draft saves are debounced writes to the
   player's own User document.
3. **Maintainability.** One `applyBuild`, one `loadSource`, one commit service for GM-local and
   player commits, one wizard-identity layer for preview and commit, declarative AppV2
   `actions` + per-part listener attachment, shared pure cores for the semantics that would
   otherwise drift (`reconcileTreeEffects`, `getActorCreationDefaults`,
   `applyCharacteristicDeltas`, the XP entry builders).
4. **New features.** Per-source checkbox content pool (D7), gear price/rarity/restricted
   filters (D6), draft resume (D5), commit observability (D9).

## 3. Non-goals

Binding (brief §7):

- **No module, no `game.system.api`, no adapter, no supersession mechanism** — those concepts
  no longer exist in this design.
- **No change to the world's actor-creation permission posture** — the minimal GM bridge stays
  (D3); the request sanitizer narrows what a request can *express*, not who may build.
- **No change to the `xpLog` data shape and no migration of existing logs** (D10). The
  keyed-object xpLog refactor that would fix the system-wide whole-array write race is logged
  as a separate future system improvement (§7).
- **No redesign** of the tab flow (minus the dropped rules tab), the i18n keys, or the settings
  semantics.
- **No per-keystroke persistence path of any kind.**
- Also out of scope: NPC/vehicle creation, mid-campaign advancement flows, localization beyond
  the existing `en` keys.

## 4. Architecture overview

Everything lands in the `starwarsffg` fork (git `YeNov/StarWarsFFG`); the
`kelborns-swffg-pc-creator` repo ships no code (its disposition is the owner's call, outside
this work).

**Entry-point wiring contract (R6-1 — normative).** The old class path stays alive as a
**compatibility shim**: `modules/helpers/character-creator.js` is reduced to a one-line
re-export —

```js
export { CharacterCreator } from "../char-creator/pc-wizard.js";
```

— so **both** existing importers (`swffg-main.js:58`, which constructs the class at
`:1458-1461`, and `tests/v2-migration/minimized-close.test.js:12`) keep working **unchanged**.
The entry button therefore opens the new implementation with zero churn to `swffg-main.js`'s
import section, and the migration test continues to exercise the (preserved) minimized-close
behavior (§5.1). A **static import smoke check** — the system boots, hooks register, every
import specifier resolves — is the first verification step of the wiring stage (§11-1).

```
starwarsffg/modules/
  char-creator/                     (NEW directory — the rewritten wizard)
    pc-wizard.js                    AppV2 shell: PARTS/TABS/actions, _attachPartListeners,
                                    #mutate funnel + commit mutation barrier; exports
                                    CharacterCreator
    wizard-state.js                 this.data factory + mutators (identity, commitId,
                                    grants/selected/available/purchases/initial/spendingCredits)
    draft-store.js                  D5: user-flag drafts; scheduleSave/saveNow/idle/clear/lock;
                                    schema versioning + migrations
    load-source.js                  generic loader + isSourceEnabled pool predicate (D7) + cache
    sources-panel.js                D7 checkbox pool UI
    starting-bonus.js               the single ruleset/bonus grant table (fixes BUG-2)
    calculators.js                  calcXp / calcCredits / calcObligation (pure)
    apply-build.js                  ONE build path: draft → {actorData, warnings}
    to-item-data.js                 SelectionRef → canonical item source (clone-before-mutate,
                                    tree materialization, deterministic rank grants)
    build-item-schema.js            the canonical projection (projectItemSource) + the shared
                                    wizard-identity layer (assignWizardIdentity) — §5.5.7/§5.5.8
    preview.js                      D2 in-memory preview actor
    validate.js                     D4 advisory validation
    commit-service.js               deterministic-id best-effort commit (§5.8)
    socket-bridge.js                D3 transport: sanitizer, sender auth, listener lifecycle
    notify.js                       D9 observability (start/finish notices, ACK-gated toast)
    enrich.js                       enrichHTML / stripHtml helpers (BUG-4)
    constants.js                    ids, socket event names, draft schema version
  helpers/character-creator.js      KEPT as the one-line compatibility shim above (R6-1) —
                                    the 1846-line implementation is deleted, the path is not
  helpers/item-helpers.js           + pure reconcileTreeEffects core (extracted from
                                    syncTreeActiveEffects, which becomes a thin applier)
                                    + materializeTreePurchases (internal, uses the core)
  helpers/actor-helpers.js          + pure buildXpEarnEntry / buildXpSpendEntry (factored out of
                                    xpLogEarn/xpLogSpend, which delegate to them)
  actors/actor-ffg.js               + getActorCreationDefaults(type) factory (extracted from
                                    create/_preCreate, which consume it)
                                    + pure applyCharacteristicDeltas(systemSource, deltas)
  swffg-main.js                     UNTOUCHED import (:58) and entry button (:1438-1465); the
                                    old pcWizard bridge block (:2052-2126) is DELETED, replaced
                                    by socket-bridge registration at ready; settings untouched
                                    (:567-652)
templates/wizards/char_creator/     rewritten in place: tabs/ minus rules.html, new
                                    parts/{pickable-table,gear-filters,sources-panel,
                                    draft-banner}.hbs, preview/ kept, footer.html deleted
lang/en.json                        existing SWFFG.CharacterCreator.* keys kept; new keys added
                                    (draft UX, filters, sources panel, D9 notifications)
tests/                              existing suite kept green (the shim keeps
                                    v2-migration/minimized-close.test.js importing successfully;
                                    the new wizard preserves the behavior it asserts)
system.json                         no dependency work (single repo). If the fork is distributed
                                    to other worlds, it still needs fork-owned release
                                    url/manifest/download endpoints (today they point upstream,
                                    system.json:5,92-94) — an owner release-process decision,
                                    flagged but not part of this feature (§10).
```

Data flow:

```
DOM event ─→ action / part listener ─→ #mutate(fn)   [rejected unless phase === "editing"]
                                     │      └─→ mutate this.data ─→ scheduleSave ─→ render(parts)
                                     ├─→ applyBuild(this.data) ─→ assignWizardIdentity
                                     │        (pure, shared)      (deterministic _ids, §5.5.8)
                                     │              └─→ actorData ─→ new Actor(actorData)
                                     │                              (in-memory preview)
                                     └─→ validateDraft(this.data) ─→ ✔/✘/⚠ (advisory, D4)
Commit (terminal lifecycle §5.7; mutation barrier engaged):
  first attempt freezes draft.commit = {commitId, firstAttemptAt, xp:{total,available}, fingerprint}
  (any later edit mints a NEW commitId — one immutable payload per {userId, commitId})
  ─→ await draftStore.saveNow(data)
  ─→ commitService (GM-local directly; players via the sanitized socket bridge)
        └─→ validate inputs ─→ normalizeCommitSource: reapply assignWizardIdentity (same
            helper, same ids as preview), baked XP entries, commit stamp
            ─→ best-effort stamp preflight (loud error on mismatch; no guarantee claimed)
            ─→ Actor.create({...normalized}, {keepId: true})     // UPSERT
            ─→ verifyCommitLog (READ-ONLY, D10) ─→ {actorUuid, warnings}
        └─→ D9: finish notice (de-duplicated per {sender, commitId}); response = player's ACK
  ─→ success: green toast (ACK-gated) ─→ clear draft ─→ close (write-free) ─→ open sheet
  ─→ failure/timeout: honest "submitting — not confirmed" state; draft intact; retry reuses
     the frozen commit identity
```

## 5. Detailed design

### 5.1 Shell & UI layer (issues B, H; BUG-4)

`char-creator/pc-wizard.js` keeps the audited AppV2 pattern: `static PARTS` (header, the core
`templates/generic/tab-navigation.hbs` part the creator already uses, one part per tab, a
`preview` sidebar part), `static TABS` in the **verified visual order minus the dropped `rules`
tab**: `background, startingBonus, obligation, species, career, xp_spend, gear, motivation,
review` (current TABS `:49-97`; note PARTS order differs — TABS is authoritative), initial tab
`background`, `tag: "form"` **without** a form handler (the phantom `myFormHandler :102` is not
ported; Enter-key submit is prevented). Window chrome/position as today (950×800, classes
`starwarsffg wizard charCreator`, `:99-114`). The existing `selectRules` static action
(`:106-108,:856-860`) shows the AppV2 `actions` pattern the rewrite generalizes. The current
`close()` minimized-animation guard (`:199-202`) is **preserved** — it is the behavior
`tests/v2-migration/minimized-close.test.js` asserts against the class the shim now resolves
to.

**Listener-ownership rule (normative).** Verified: partial renders replace only requested
parts, but `_onRender` fires for the whole app after every render (`application.mjs:522-525`;
`handlebars-application.mjs:191-206`) — a whole-window rescan would stack listeners on
untouched parts. Therefore:

- **Clicks** route exclusively through `DEFAULT_OPTIONS.actions` (`data-action` + static
  handlers) — AppV2's delegated click handling is attached once at the frame and is
  partial-render-proof. Actions: `pick`/`unpick` (generic pickable-table selection),
  `adjustCharacteristic`, `adjustSkill`, `learnTalent`, `learnUpgrade`,
  `purchaseSpecialization`, `purchaseForcePower`, `removeSpecialization`, `removeForcePower`,
  `buyItem`, `refundItem`, `editObligation`, `saveObligation`, `removeObligation`,
  `addMotivation`, `removeMotivation`, `sortTable`, `setGearCategory`, `clearGearFilters`,
  `openSources`, `toggleSource`, `resumeDraft`, `discardDraft`, `createActor`,
  `prevTab`/`nextTab`. Handlers read identity from `data-uuid` / `data-table` / `data-field` —
  uuid-keyed, never name- or index-keyed.
- **Change/input bindings** (selects, filter inputs, the character-name field) are attached in
  an override of the mixin's per-part hook **`_attachPartListeners(partId, htmlElement,
  options)`** — invoked exactly once per (re)rendered part with that part's fresh root element
  (`handlebars-application.mjs:204,:270-284`). Bindings are declared per part
  (`PART_BINDINGS[partId] = [{selector, event, handler}]`) and query only within
  `htmlElement`. `_onRender` binds **nothing**. The PART `forms` registry
  (`handlebars-application.mjs:26-27`) is the fallback if a tab ever needs whole-form submit
  semantics.
- Mutation → targeted re-render: `this.render({parts: [<currentTab>, "preview"]})` (plus
  `review` when open). Never a full-window re-render per keystroke. The current behavior of
  force-refreshing when entering the review tab (`_onClickTab :959-965`) is preserved via the
  tab-change hook.

**The reusable pickable table** (`templates/.../parts/pickable-table.hbs` + the shared `pick`/
`sortTable` actions): one partial taking `{tableId, columns[], rows[], selectedUuid,
searchable, sortState, editable?}` rendering a sortable, searchable, single- or multi-select
HTML table (the `editable` variant carries the obligation magnitude edit). It replaces all
seven per-render DataTables instances (`#obligations`, `#species`, `#careers`,
`#specializations`, `#buy_gear`, `#selected_motivations`, `#motivations`). Sorting uses
`sortDataBy` (in-place single-key, `actor-sheet-ffg.js:2921`) on copies of context rows;
searching is a substring filter in `_prepareContext`; state lives in `this.ui.tables[tableId]`.
The gear table's five category buttons become filter chips selecting **declarative
per-category column sets** — replacing the numeric index 0–14 visibility toggles and
hidden-column search terms (`:363-481`). Native `<select>` elements replace SlimSelect
(`#culture`/`#hook`/`#force_attitude`/`#startingBonus`, `:213-256`).

**Collapsibles** (career sections, today jQuery sibling-chained `.toggle('slow')` keyed off
`_openCareerSection`, `:10,:299-308`): plain `<details>/<summary>` or a `data-action` class
toggle; open state in `this.ui`.

**Rich text (BUG-4).** Every description rendered as content — culture/hook/force-attitude
descriptions (today `.text(selectedItem.system.description)` into `#cultured_esc` /
`#hook_desc` / `#force_attitude_desc`, `:922,:938,:954`), review/preview description areas —
is enriched in `_prepareContext` via
`foundry.applications.ux.TextEditor.implementation.enrichHTML` (the call the creator already
uses for pills, `:677`) and rendered with triple-stache into sanitized containers;
tooltips/plain contexts use a `stripHtml()` helper (DOMParser → `textContent`).
`char-creator/enrich.js` owns both. Never raw HTML into text sinks; never enriched HTML into
attributes.

**Deleted, not ported (issue H):** `myFormHandler` (`:102`); `_preparePartContext`'s
`another_tab`/TODO branch (`:625-637` — the new implementation only stamps `context.tab` and
per-part context); `footer.html` (PARTS entry already commented out, `:45`); the
`.replace(" ", " ")` normalizations (`:582,:1232` — moot once identity comes from `data-*`
attributes).

**Skill dice pools & skill columns (preview consumption, unchanged patterns).** The preview
part renders skill rows with `data-ability` and a `.roll-button` child; per-part listeners call
`DiceHelpers.addSkillDicePool({data: foundry.utils.deepClone(previewActor.system)}, elem)` —
the exact verified holder shape and DOM contract (`dice-helpers.js:145-149,:225-226`; wizard
call site `:318-323`). `_prepareContext` builds the skills panel with
`previewActor.sheet._createSkillColumns({data: deepClone(previewActor.system)})` — the
verified `this`-free instance method (`actor-sheet-ffg.js:2324-2381`; wizard call site
`:555-559`). Being system code, direct calls suffice; no extraction is required.

### 5.2 State & data model (issue D; BUG-1/2/3 by construction)

`this.data` keeps the audited shape (constructor `:118-173`) with **no live Documents
anywhere, ever**, plus two additions:

```js
this.data = {
  identity: {                     // the build's name/img — a defined state source
    name: `${game.user.name}'s new PC!`,   // the current fallback (:1684; bridge :2107),
                                           // editable via a header name input
    img: null,                             // null → getActorCreationDefaults("character").img
  },
  commitId: randomID(16),         // durable commit key (§5.8); re-minted on edit-after-attempt.
                                  // Together with the owning user's id, it is ALSO the
                                  // persisted stability source for every deterministic wizard
                                  // id — the preview actor id and all embedded ids derive from
                                  // it (§5.5.8), so they are stable across renders and
                                  // sessions of one commit identity.
  grants:   { gm: {credits}, bonus: {xp, credits, duty, obligation, morality, conflict},
              species: {}, career: {}, specialization: {} },
  selected: { background: {culture, hook, forceAttitude},   // SelectionRefs or null
              startingBonus, obligations: [], species, career,
              careerCareerSkillRanks: [], specialization,
              specializationCareerSkillRanks: [], rules: "fad", motivations: [] },
  available:{ specializations: [] },       // DERIVED — rebuilt from the career snapshot
  purchases:{ xp: { characteristics: [], skills: [],
                    talents: [],           // {parentUuid, parentType, key, cost}
                    specializations: [],   // {ref: SelectionRef, cost}
                    forcePowers: [] },     // {ref: SelectionRef, cost}
              credits: [] },               // {ref: SelectionRef, cost} — dupes allowed
  initial:  { duty, obligation, morality },   // from world defaults (:168-170)
  spendingCredits: /* d100, rolled once at draft creation */,
};
```

(Transient, **not** in `this.data` and never persisted: `this.ui` view state, the commit phase,
and the per-open D9 `sessionNoticeId`, §5.9.)

**SelectionRef** — the only representation of picked content:

```js
{ uuid, name, type, img, snapshot /* doc.toObject() clone taken at selection time */ }
```

- Snapshots are taken once with `toObject()`; the cached compendium Document is never
  referenced again. This kills every in-place mutation in the current code: the `.pill`
  monkey-patch (`:677` et al. — `.pill` becomes a context-computed value), `islearned` flips on
  cached docs (`:1434,:1461-1468` — flips happen on clones at build time, §5.5), and the
  obligation inline-edit writing into the loaded doc (`:1017-1021` — the edit/save/deselect
  feature is kept, writing into the ref's own `snapshot.system`).
- **All matching is by uuid.** Purchase refunds compare `purchase.parentUuid === ref.uuid` —
  BUG-3 (`:1443-1444`, string `===` Document, so force-power un-learns never refund) is
  unrepresentable.
- **Motivations are plain SelectionRefs** flowing through the same `toItemData()` as everything
  else — BUG-1's `{item: Doc}` wrapper (`:1654-1656`) and its two inconsistent consumers
  (preview `:1142-1146`, commit `:1757-1761`) cannot recur: one shape, one code path.
- `selected.rules` is the only ruleset field (default `"fad"`, `:149`). BUG-2 —
  `selectStartingBonus` reading the nonexistent `this.data.grants.rules` so AoR/EotE bonuses
  land in `bonus[undefined]` (`:894,:897,:900,:903`) — dies with the single starting-bonus
  table (§5.4).
- `spendingCredits` (the FFG RAW d100 pocket money — rolled at `:172`, added to final credits
  at `:1775-1779`, today never previewed): rolled once at draft creation, persisted in the
  draft, shown in the preview, applied in `applyBuild` — preview and commit agree.
- `available.specializations` is derived: rebuilt from the selected career snapshot's
  `system.specializations` entries (`{name, source: uuid}`, resolved via `fromUuid` —
  `:987-997`) on career change or draft resume, then **filtered through the same source-pool
  predicate as every other specialization** (§5.3).
- Transient UI state (gear filters, table sort, open career section, search strings) lives in
  `this.ui` — neither build input nor draft content.

**All mutations funnel through one method** (§5.7's barrier depends on it):

```js
#mutate(fn) {
  if (this.#commitPhase !== "editing") return false;
  if (this.draft.commitFrozen) this.#remintCommitId();   // edit after an attempt ⇒ NEW commit
                                                         // identity (§5.8.2)
  fn(this.data);
  this.draftStore.scheduleSave(this.data);
  return true;                       // caller performs the targeted re-render
}
```

`wizard-state.js` owns `createInitialData()` (seeding identity, commitId, `grants.gm.credits`
and `initial.*` from the `defaultCredits`/`defaultDuty`/`defaultObligation`/`defaultMorality`
world settings exactly as today, `:122,:168-170`) and the plain mutator functions the action
handlers call.

### 5.3 Sources & the per-source content pool (issue C loaders; N-1/N-4; D7)

**One generic loader** replaces the six copy-pasted loaders (`getItems :660-683`,
`getBackgrounds :689-729`, `getAvailableMoralities :735-757`, `getAvailableSpecies :763-785`,
`getAvailableCareers :791-813`, `getAvailableMotivations :819-841`):

```js
/** @returns {Promise<{refs: SelectionRef[], buckets?: any}>} */
async function loadSource(type, pool, bucketer) { … }
```

- **Composition** (audited semantics kept): packs named in
  `game.settings.get("starwarsffg", `${type}Compendiums`).split(",")` (the `getSources` read,
  `:849-851`; registered settings `swffg-main.js:567-652`) ∪ **world items of the correct
  type** — with an explicit world-type map fixing **N-1** (today world careers filter on the
  nonexistent type `"careers"`, `:807`, vs `system.json` `documentTypes.Item` `career` — world
  careers silently never appear) and **N-4** (today gear scans packs only; it gains the same
  world ∪ packs union as every other type). Falsy pack ids are skipped.
- **Gear GM gates apply at load**, before any interactive filter sees the data:
  `item.system.rarity.value > maxRarity` excluded; restricted items excluded unless
  `allowRestricted` (`:663-676` semantics).
- Results map to `SelectionRef`s (snapshots taken here) and are **cached per type** for the
  app's lifetime (the audited `compendiumData` behavior, `:537-544`); the cache invalidates
  when the pool selection changes.
- `bucketer` covers type-specific grouping: backgrounds split culture/hook/attitude by
  `item.system.type` (`:703-709`); extra-spec purchase buckets In-Career / Out-of-Career /
  Universal (`:1290-1315`); force powers group by `system.required_force_rating`
  (`:1346-1364`).

**The pool predicate (D7).** `isSourceEnabled(type, sourceId)` — `sourceId` is a pack id or
the `"world"` pseudo-source, derivable from any uuid — is the ONE function deciding whether a
source participates:

- `loadSource` applies it to every pack and the world bucket.
- **Career-scoped specializations go through the same predicate**: the
  `available.specializations` rebuild filters each career-referenced spec by
  `isSourceEnabled("specialization", sourceIdOf(uuid))`. The Sources panel's specialization
  group lists the union of configured `specializationCompendiums` packs ∪ packs referenced by
  the currently selected career ∪ "World items" — each independently toggleable, all
  default-on — so a career-referenced pack that is not in settings is visible and controllable
  rather than silently bypassing the pool.
- A selected ref whose source is later disabled stays in the draft as data and raises an
  advisory validation note (D4) — the predicate governs what is *offered*, never destroys
  choices.

**The Sources panel** (`sources-panel.js` + partial): opened from a wizard-header button (not a
tab — source composition is meta-configuration, and the rules tab is dropped). Groups by
consumed type (Species, Careers, Specializations, Backgrounds, Obligations, Motivations, Gear,
Force Powers); one checkbox per resolvable source; default all-on. Persisted **per user** as
`game.user.setFlag("starwarsffg", "pcWizardSourceSelection", {schemaVersion: 1, byType:
{<type>: {excluded: [sourceId,…]}}})` — stored as *exclusions* so newly-added GM packs default
on; independent of the draft (survives discard). Content-source only; the ruleset selector is
NOT here (§5.4). Changing a checkbox invalidates that type's cache and re-renders affected
parts.

### 5.4 Calculators, the starting-bonus table, and the ruleset fold-in (KEEP-4; BUG-2; D7)

**Calculators** (`calculators.js`) — ported pure from the verified originals: `calcXp`
(`:1529-1552` — species `startingXP` + `bonus.xp` minus the five purchase buckets),
`calcCredits` (`:1633-1645` — `grants.gm.credits + grants.bonus.credits` minus credit
purchases), `calcObligation` (`:1554-1600` — per-ruleset base from `initial.*`, adjusted by
the starting-bonus choice).

**One grant table** (`starting-bonus.js`): `STARTING_BONUS[rules][choice] = {xp, credits,
morality, dutyDelta, obligationDelta}`, transcribed exactly from `selectStartingBonus`
(`:865-908`) and the `calcObligation` branches — including the preserved quirk that
`2k_credits` grants 2500 (`:884,:902` — Q-2, owner decision pending §10). This table is the
**only** source for both the `grants.bonus` display and the obligation math — fixing BUG-2 and
the audited coupling defect (KEEP-4: `calcObligation` currently re-derives the adjustment
independently of `grants.bonus`).

**Ruleset fold-in (D7).** The standalone rules tab is dropped; the wizard opens on
`background`. The ruleset selector (fad/aor/eote; labels from
`CONFIG.FFG.characterCreator.rules` — already global, `swffg-config.js:45`) renders at the top
of the **startingBonus** tab, whose options come from
`CONFIG.FFG.characterCreator.startingBonusesRadio[rules]` (consumed today via
`startingBonusForHTML`, `:643-654`); the obligation tab shows the active ruleset read-only.
`selected.rules` defaults to `"fad"` (`:149`), so the background tab's Force-attitude field —
rendered only for fad (`:233-244`) — is well-defined on first render even though the selector
lives on a later tab. **On ruleset change:** `selected.startingBonus` and the derived
`grants.bonus` are cleared (matching `:872-876`'s zeroing); startingBonus/obligation/
background/preview parts re-render; the Force-attitude selection is retained in state but
excluded from the build and hidden while ruleset ≠ fad (flipping back restores it);
obligation/motivation picks are kept and revalidated — advisory, never destructive.

### 5.5 The build path: `applyBuild`, `toItemData`, the canonical projection, and the wizard-identity layer (issues C/D/E; BUG-1; N-5/N-6/N-7)

**`apply-build.js` — the single shared builder:**

```js
/** Pure and synchronous: consumes only data (snapshots present — no fromUuid, no awaits).
 *  @returns {{actorData: object, warnings: string[]}} */
function applyBuild(data) { … }
```

1. **Base + identity.** Start from `getActorCreationDefaults("character")` (§5.10) — the
   default `system` source, the default image
   (`systems/starwarsffg/images/defaults/actors/character.png`, `actor-ffg.js:112-118`), and
   the **partial** character prototypeToken block (`actorLink: true`, FRIENDLY, bar1
   `stats.wounds`, bar2 `stats.strain`, `actor-ffg.js:56-67`) with **no** `name`/`texture.src`
   — core `_initializeSource` fills both from the actor's own final name/img
   (`common/documents/actor.mjs:93-97`), for preview and commit alike. Then
   `name = data.identity.name`, `img = data.identity.img ?? defaults.img`. This is required
   because a complete source containing `system` bypasses `ActorFFG.create`'s token block
   entirely (verified `:42-44`) and constructor-built actors never run `create`/`_preCreate`.
2. **Characteristic purchases with their update-hook consequences.** The current paths buy
   characteristics through sequential `Actor.update` calls (`:1103-1112,:1718-1727`) whose
   `_preUpdate` also adjusts base stats (`actor-ffg.js:148-231`), and species effects do NOT
   cover this (`explodeMod` expands Brawn to Brawn+EncumbranceMax+Soak but never wounds;
   Willpower only to itself — `modifiers.js:517-538`). `applyBuild` therefore computes
   per-characteristic purchase counts and calls `applyCharacteristicDeltas(system, counts)`
   (§5.10): each +N adds N to the characteristic value, and Brawn additionally adds N to
   `stats.wounds.max`, `stats.soak.value`, `stats.encumbrance.max`; Willpower adds N to
   `stats.strain.max`. ("Default + count" reproduces the sequential updates exactly because
   the temp actor is always fresh when the current purchase loop runs.) The `_preUpdate`
   mirror-writes into `stats.Brawn`/`stats.Willpower` (`:156-158,:213-215`) target keys
   outside the character template and are deliberately not reproduced (parity fixture
   re-confirms inertness). Skill purchases write `system.skills.<key>.rank` directly (no hook
   side effects exist for skills). Costs ported exactly: characteristic `newValue * 10`
   (`:1218`); career skill `newValue * 5`, non-career `newValue * 5 + 5` (`:1258-1262`).
3. **Other system fields:** `system.experience.{total, available}` from `calcXp` (today
   post-create updates, `:1092-1099,:1710-1715`); `system.stats.credits.value =
   calcCredits().available + data.spendingCredits` (`:1775-1779`);
   `system.<morality|obligation|duty>.value = calcObligation().available` per the verified key
   selection (`:1784-1789`).
4. **Items via `toItemData()`** — one mapping for every category: background
   culture/hook/forceAttitude (forceAttitude only when `rules === "fad"`), obligations (edited
   snapshots), species, career, selected specialization, motivations — the set both current
   paths embed (`:1114-1149,:1729-1764`) — **plus, as intentional fixes:** purchased extra
   specializations and Force powers (**N-5**: today *neither* path embeds
   `purchases.xp.specializations`/`forcePowers` — the item loops end at motivations, so XP is
   charged for content that never reaches the actor) and credit-purchased gear in **both**
   preview and commit (**N-6**: today only the final path embeds gear, `:1766-1774`).
5. **Tree purchases materialize with synchronized ActiveEffects (N-7).**
   `materializeTreePurchases(itemSource, learnedKeys)` (§5.10) deep-clones the snapshot, sets
   `islearned` for the purchased keys (specialization → `system.talents`; forcepower →
   `system.upgrades` — the `syncAEStatus` dispatch, `item-helpers.js:242-247`), and reconciles
   the clone's `effects` array with the **same shared pure core** as `syncTreeActiveEffects`
   (verified algorithm, `item-helpers.js:297-345`): skip attributes whose
   `buildActiveEffectChanges` result is empty; for each desired effect claim an unclaimed
   **exact flag tuple** first, else one unclaimed **same-name** effect (legacy/imported
   effects are adopted, not duplicated), patching only `changes`/`disabled`
   (= `!islearned`)/tree-`flags` in place and preserving every other field; append an id-less
   effect only when unmatched; **never delete** unclaimed effects. Flipping `islearned` alone
   is insufficient — learned state and effect state are separate, and the sheet's purchase
   path explicitly re-syncs (`item-sheet-ffg.js:1776-1777`) while the current wizard never
   does (N-7).
6. **Career/spec free skill-rank grants — deterministic (issue E).** The timestamp-keyed
   attribute + per-rank ActiveEffect pairs (`:1151-1200,:1791-1839`) become deterministic
   `pcwRank<n>_<skillSlug>` attributes plus effects
   `{key: "system.skills.<skill>.rank", mode: AE_MODES.ADD, value: 1}` (AE_MODES verified
   frozen, `ffg-active-effect-modes.js:18-25`), baked into the career/spec item source by
   `toItemData()`. Sound for the in-memory preview because
   `CONFIG.ActiveEffect.legacyTransferral = false` (`swffg-main.js:218`): item-embedded
   effects apply during actor preparation, saved or not.
7. **The canonical projection** (`build-item-schema.js` — `projectItemSource(raw)`), applied by
   `toItemData()` as its final mapping step, and re-applied by the GM bridge to incoming player
   payloads (§5.8.3) — so preview and commit construct **equivalent items by construction**:
   - **Item keys kept:** `name`; `type` (∈ the system's `documentTypes.Item`, incl. the shop
     five `weapon/armour/gear/itemattachment/itemmodifier`); `img`; `system` (deep clone);
     `effects` (each via the effect projection below); `flags` → **only the `starwarsffg`
     scope**, deep-cloned — load-bearing, verified: `flags.starwarsffg.config.enableAmmo`
     gates rolls and display (`dice-helpers.js:76-80`, `item-ffg.js:777-781`);
     `flags.starwarsffg.config.medicalType` selects healing behavior
     (`actor-sheet-ffg.js:1165-1168`).
   - **Item keys stripped:** `_id`, `folder`, `sort`, `ownership`, `_stats`, unknown keys,
     non-`starwarsffg` flag scopes.
   - **Effect keys kept — the enumerated behavior-bearing core AE field set**
     (`active-effect.mjs:40-72`): `name`, `img`, `type`, `system`, `changes[]` as
     `{key, value, mode, priority}` (**priority preserved** — preparation sorts by
     `priority ?? mode*10`, `client actor.mjs:214-222`), `disabled`, `duration`, `statuses`,
     `transfer`, `description`, `tint`, `sort` (core fields, `:64-69`), `flags.starwarsffg`
     (the tree-effect claim tuple lives here), and `flags.core` restricted to the explicit
     allowlist `{overlay}` (**rendered behavior** — token overlay selection + tint,
     `token.mjs:1685-1694`).
   - **Effect keys stripped:** `_id`, `origin` (a dangling doc reference on fresh embeds;
     unused for application under `legacyTransferral = false` — a deliberate normalization
     applied identically everywhere), `_stats`, other `flags.core` keys (e.g. `sourceId` —
     provenance), unknown keys.
   - **Third-party flag scopes are UNSUPPORTED — recorded product limitation:** effects/items
     relying on other modules' flags lose them through the wizard; they must be added to the
     created actor manually afterward. (No claim that such flags are mere provenance.)
   - The projection is deterministic, idempotent, and pure.

8. **The wizard-identity layer (R6-2) — `assignWizardIdentity`, shared by preview and
   commit.** **Projection strips SOURCE identity first (step 7); this layer adds WIZARD
   identity afterward.** One pure helper in `build-item-schema.js`:

   ```js
   /** Assigns deterministic wizard identity to a projected build. Idempotent: same
    *  {userId, commitId} + same projected arrays ⇒ same ids, every construction.
    *  @returns {Promise<actorData>} (async only for the cached actor-id digest) */
   async function assignWizardIdentity(actorData, { userId, commitId }) {
     actorData._id = await deriveCommitActorId(userId, commitId);       // cached per pair
     actorData.items.forEach((item, i) => {
       item._id = embedId16(`item|${commitId}|${i}`);
       (item.effects ?? []).forEach((fx, j) => {
         fx._id = embedId16(`fx|${commitId}|${i}|${j}`);
       });
     });
     return actorData;
   }
   ```

   - **Actor id** = `deriveCommitActorId(userId, commitId)` — SHA-256 over
     `"swffg-pcwizard|commit|v1|" + userId + "|" + commitId`, mapped as base-62 onto 16
     characters of the full document-id alphabet (`/^[a-zA-Z0-9]{16}$/`,
     `validators.mjs:8-10`); computed once per `{userId, commitId}` and cached (the digest is
     async; everything else is synchronous). The **cryptographic** digest is required here
     because this id is a **world collection key** (§5.8).
   - **Embedded ids** = `embedId16(seed)` — a documented, deterministic, synchronous
     non-cryptographic fold (e.g. double FNV-1a-64 → base-62) of the seed string into 16
     alphabet characters. Cheap hashing is sufficient and deliberate: these ids only need
     uniqueness **within one parent document** across at most a few hundred slots, and they
     are never used as world keys. Duplicate purchases occupy distinct indices → distinct
     ids; repeated constructions of the same commit identity yield **identical** ids.
   - **Used by both paths:** `applyBuild` output is passed through `assignWizardIdentity`
     before **every preview construction** (the wizard's context prep is async, so the one
     cached digest await is free), and `normalizeCommitSource` (§5.8.2) **reapplies the same
     helper** — it defines no second formula. Preview and commit therefore carry identical
     ids for one commit identity, and the §11 fixtures comparing them are implementable.
   - **Verified basis:** Foundry randomizes only **absent** embedded `_id`s
     (`embedded-collection.mjs:156`) and retains provided ones on create
     (`keepEmbeddedIds=true` default, `_types.mjs:85-88`; server
     `_generateEmbeddedDocumentIds(keepEmbeddedIds)`). Giving the **unsaved preview actor**
     the final commit id is safe — it is never persisted and never enters
     `game.actors` — and its **stability source is persisted state**: the owning user's id
     plus `data.commitId` (in the draft). Re-minting the commitId (edit-after-attempt,
     §5.8.2) intentionally re-keys every wizard id.

### 5.6 The in-memory preview engine (D2; issue A)

```js
const { actorData } = applyBuild(this.data);
await assignWizardIdentity(actorData, { userId: game.user.id, commitId: this.data.commitId });
const previewActor = new CONFIG.Actor.documentClass(actorData);   // UNSAVED. Never .create().
```

- The wizard only constructs preview actors **at/after `ready`** (it opens from the directory
  button). Verified: `ClientDocumentMixin._initialize` runs `_safePrepareData()` during
  construction once `game._documentsReady` (`client-document.mjs:57-64`), preparing embedded
  items and applying transferred item effects (`legacyTransferral = false`). **Construction IS
  the preparation.** The implementation must **never call `prepareData()` a second time** on a
  preview actor — un-reset re-preparation re-applies ADD-mode effects onto already-modified
  values; if manual re-preparation were ever needed, `reset()` must precede it. The design's
  rebuild-per-render model never needs it: each render constructs a fresh actor from fresh
  `applyBuild` output and discards the old one — with **identical deterministic ids** each
  time (§5.5.8), so nothing about the preview churns across renders.
- `_prepareContext` reads the prepared `previewActor.system` for the stats column
  (wounds/strain/soak/characteristics/XP/credits/obligation) and builds skill columns; part
  listeners decorate dice pools — both via the verified consumption patterns (§5.1).
- **No DB writes, no sockets, no orphan actors, no flicker** during editing. The
  `temp actor - <user>` mechanism, its GM round-trips, and the `deleteCharacter` cleanup
  events are deleted with no successor.

### 5.7 Draft persistence and the commit mutation barrier (D5; issue G)

**Storage: a flag on the player's own User document** —
`game.user.setFlag("starwarsffg", "pcWizardDraft", draft)`. Verified permission basis: non-GM
users may update their own User document and `flags` is not restricted (`user.mjs:204-220`).
Rejected alternatives: world settings (GM-writable only — player drafts would need a socket
round-trip per save), client settings/localStorage (not per-world, lost across machines), a
placeholder actor (the orphan pattern D2 forbids).

**Schema (v1):**

```js
{
  schemaVersion: 1,
  systemVersion: "…",                    // informational
  savedAt: "2026-07-20T…Z",
  characterName: "…",                    // mirror of data.identity.name, for the banner
  commit: null | {                       // frozen commit identity — §5.8.2
    commitId, firstAttemptAt,            // ISO; baked XP dates derive from it
    xp: { total, available },            // immutable creation-log inputs
    fingerprint,                         // digest16 of the normalized source (minus _stats)
  },
  data: { identity, commitId, grants, selected, purchases, initial, spendingCredits },
  // `available` and all this.ui state are EXCLUDED (derivable / transient)
}
```

**Draft store** (`draft-store.js`): `scheduleSave(data)` (debounced ~1 s), `saveNow(data)`
(cancel any pending timer and write immediately; returns the write promise), `idle()`
(resolves when no write is in flight), `clear()`, `load()`, `lock()`/`unlock()` (while locked,
`scheduleSave` is a no-op — defense in depth behind the UI barrier), and a `MIGRATIONS[n]`
map (empty at v1). Older schema → migrate; newer schema → refuse resume, offer discard;
unreadable → offer discard; never crash on a bad draft.

**Lifecycle:**

- **Save:** every `#mutate` schedules a save; `close()` in any non-committed phase runs
  `unlock()` + one final `await saveNow(data)`.
- **Resume:** on open with a readable draft → banner *"Resume '<name>' (saved <date>)?"* with
  Resume / Start fresh (explicit confirm deletes the flag); a Discard-draft control lives in
  the header. Rehydration: per `SelectionRef`, `fromUuid` → refresh the snapshot (except
  user-edited obligation fields, preserved over the refresh); unresolvable → keep the stored
  snapshot + advisory warning; then rebuild derived state.
- **The commit mutation barrier** (`#commitPhase ∈ {"editing", "committing", "committed"}`):
  1. Guard: `createActor` returns unless phase is `"editing"` (idempotent re-click; the
     button is disabled while committing).
  2. Phase → `"committing"`; `draftStore.lock()`; the window content gets a disabled/spinner
     state. From this instant `#mutate` rejects — **no mutation and no new save can be
     scheduled mid-commit**.
  3. First attempt only: freeze the commit identity (`draft.commit`, §5.8.2).
  4. `await draftStore.saveNow(this.data)` — the current state (including a <1 s-old edit) is
     durably persisted **before** creation starts; nothing is ever dropped.
  5. Await the commit (§5.8). **Success:** phase → `"committed"` → `await draftStore.idle()`
     → `await draftStore.clear()` → `await this.close()` (committed `close()` performs **no**
     draft I/O — no clear-then-resave) → open the new actor's sheet. **Failure/timeout:**
     phase → `"editing"`, `unlock()`, UI re-enabled, one honest notification (§5.9); the
     draft on disk already equals the submitted state, so nothing is lost; a retry without
     edits reuses the frozen identity.
  6. **Browser/connection loss mid-commit:** the draft (with its frozen commit identity) was
     persisted in step 4. If the create landed, the resumed wizard's retry converges on the
     same actor (§5.8); if not, the retry performs it. Either way the player is never
     silently left without their build.

### 5.8 Final commit: deterministic-id, overwrite-idempotent, best-effort (D3; D10; issue F; N-2/N-3)

#### 5.8.1 The model, stated plainly

Foundry v13 gives primary documents **upsert** writes — verified: the create-only duplicate
check runs solely for embedded parent collections; the server batch-writes the Actor key with
LevelDB `put`; the client replaces the Map entry (§0). Additionally, server `_preCreate` adds
the **requesting user** (the processing GM, for bridge commits) to `ownership` at OWNER when
absent (§0). The commit design therefore claims exactly this:

- Every attempt for an authenticated `{userId, commitId}` addresses **one deterministic world
  Actor key** carrying **one immutable normalized payload** (frozen at first attempt; an edit
  afterwards mints a new commitId). Same-payload retries handled by the **same GM** are
  byte-identical no-op overwrites (deterministic ids make the source equal; `_stats` excluded
  from semantic equality).
- **Normal path: exactly one final Actor record.** Under lost-ACK + GM failover, a same-key
  overwrite may differ in the processing-GM ownership entry and `_stats`/XP-entry dates;
  after an edit-and-resubmit races a slow original attempt, **two** actors can briefly exist.
  Worst case is a **duplicate character the GM deletes, or a differing owner-GM/XP-timestamp
  entry — never a lost or corrupted build.** These residuals are accepted for v1 (§9), made
  visible by D9 (§5.9). **No atomic, exactly-once, or never-overwrite claim is made.**

#### 5.8.2 Commit identity, freezing, and normalization

- `data.commitId` is minted at draft creation (`randomID(16)`).
- **First attempt freezes** `draft.commit = {commitId, firstAttemptAt: <ISO now>,
  xp: {total, available} /* from calcXp at freeze time */, fingerprint}` — persisted by the
  pre-commit `saveNow`. The `xp` values and `firstAttemptAt` are the **immutable creation-log
  inputs**: they parameterize the baked XP entries and let any later verifier know exactly
  what the entries should contain, independent of post-create experience changes.
- **Any successful `#mutate` while `draft.commit` exists mints a fresh `commitId` and clears
  `draft.commit`** — editing after a failed/unacknowledged attempt re-keys the commit (and
  with it every wizard id, §5.5.8). It is impossible, by construction, to submit two
  different payloads under one `{userId, commitId}`. (The stray-actor consequence when a slow
  original attempt still lands is residual §9-a; the wizard logs a warning naming the
  superseded commitId when it re-keys.)
- **`normalizeCommitSource(actorData, {userId, commitId, firstAttemptAt, xp})`** — pure aside
  from the cached digest, identical for GM-local and bridge commits:
  1. **Reapply the shared identity layer:** `await assignWizardIdentity(actorData, {userId,
     commitId})` (§5.5.8) — the same helper and formulas as preview; commit defines **no
     second formula**. (For an honest same-user payload this is a no-op reassignment of the
     identical ids; for the bridge it is what guarantees the persisted ids are the wizard's,
     not the sender's.)
  2. **Baked XP log (D10-compatible):** `flags.starwarsffg.xpLog = [spendEntry, earnEntry]`
     (newest-first, matching the helpers' prepend order), built with the pure builders
     (§5.10): earn = `buildXpEarnEntry({grant: xp.total, available: xp.total,
     total: xp.total, note: "Initial State", granter: "GM",
     statusId: "pcw:"+commitId+":earn", date: firstAttemptAt.slice(0,10)})`; spend =
     `buildXpSpendEntry({action: "Character Creation Changes", cost: xp.total - xp.available,
     available: xp.available, total: xp.total, statusId: "pcw:"+commitId+":spend",
     date: same})`. Because the entries ride the source, **any same-key overwrite restores
     the intended log state instead of erasing it**. Writing them as source (never via
     `xpLogEarn/Spend`) also suppresses the whisper — `xpLogSpend` unconditionally calls
     `notifyXpSpend` → ChatMessage when the world setting is on
     (`actor-helpers.js:226,235-245`) and offers no bypass; the wizard's own D9 notifications
     replace it (§5.9). This is the **only** place the wizard writes xpLog content, and it
     writes it as part of a **fresh actor source**, never as a flag update to a live actor —
     the wizard is not a second writer to the contested array (D10).
  3. **Commit stamp:** `flags.starwarsffg.pcWizardCommit = {commitId, userId,
     xp: {total, available}, date: firstAttemptAt.slice(0,10)}` — clock-free apart from the
     frozen date; carries the immutable creation inputs for later verification.
  4. **Fingerprint** (stored in `draft.commit`): `digest16` over the JSON of the normalized
     source. **Semantic-equality exclusions, normative:** `_stats` at every level (core
     stamps creation/modification metadata on write) and — across GM failover only — the
     server-added processing-GM `ownership` entry (§5.8.1). All other volatility is
     engineered out (frozen dates, clock-free stamp, deterministic ids). A retry whose
     recomputed fingerprint mismatches the stored one indicates non-determinism (a bug): the
     wizard mints a fresh commitId and warns.

#### 5.8.3 The commit service and the socket bridge

**`commit-service.js` — one implementation for both user classes:**

```js
const inFlight = new Map();   // `${userId}:${commitId}` → Promise; same-client coalescing only

async function commitBuild({ normalizedSource, userId, commitId }) {
  assertIdShape(userId, commitId);
  const key = `${userId}:${commitId}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const run = (async () => {
    const id = normalizedSource._id;
    let actor = game.actors.get(id);
    if (actor && !stampMatches(actor, userId, commitId))
      throw new CommitCollisionError(id);     // BEST-EFFORT PREFLIGHT on the local snapshot:
                                              // loud when observed; NOT a "never overwrite"
                                              // guarantee (upsert + check/write race, §9-b).
                                              // Recovery: mint a fresh commitId (safe — a
                                              // mismatched occupant proves this commit never
                                              // landed at that key).
    if (!actor) actor = await Actor.implementation.create(normalizedSource, { keepId: true });
    const warnings = verifyCommitLog(actor, commitId);       // READ-ONLY (§5.8.4)
    return { actorUuid: actor.uuid, warnings };
  })();
  inFlight.set(key, run);
  try { return await run; } finally { inFlight.delete(key); }
}
```

**GM-local path:** a GM user's wizard calls `commitBuild` directly with its own normalized
source (`userId = game.user.id`). Same stamping, dedup, preflight, and verification as the
bridge — no separate racy path exists.

**Player path — the socket bridge** (`socket-bridge.js`), replacing
`swffg-main.js:2052-2126`:

- Channel `system.starwarsffg` (`"socket": true` verified in `system.json`), `eventType:
  "pcWizard"`, events: `commitRequest`, `commitResponse`, `startNotice`, `startNoticeAck`
  (§5.9). The legacy `createCharacterRequest`/`createFinalActorRequest`/`deleteCharacter`
  events are deleted with the temp-actor mechanism.
- **Protocol:**

```js
// player → active GM
{ eventType: "pcWizard", event: "commitRequest",
  requestId,                       // per attempt (randomID)
  commitId, firstAttemptAt,        // the frozen commit identity (validated GM-side)
  xp: { total, available },        // frozen creation-log inputs (validated finite)
  build: { name, img, system, items } }
// GM → broadcast (requester correlates by requestId AND authenticates the sender)
{ eventType: "pcWizard", event: "commitResponse",
  requestId, ok: true,  actorUuid, warnings: [] }
{ eventType: "pcWizard", event: "commitResponse",
  requestId, ok: false, error: "<i18n key>" }
```

- **Listener lifecycle (issue F, N-3):** registered **once** in the system's `ready` hook on
  every client — GM clients process `commitRequest`/`startNotice` only where
  `game.user === game.users.activeGM` (deterministic single processor; survives the
  first-ready-GM logout that kills today's bridge, `:2052`); all clients process
  `commitResponse`/`startNoticeAck` against session-lifetime maps. The wizard instance
  registers **nothing** and `close()` has no socket duty — the per-open constructor listener
  leak (`:189-195`) has no successor.
- **Sender authentication:** the requesting user id comes exclusively from the socket layer's
  trailing sender argument — the mechanism the current bridge already trusts
  (`const requestor = args[1]`, `:2056`) — never from the payload. Responses are accepted only
  when the `requestId` matches a pending request **and** the response's socket sender is a GM
  user (channel messages are broadcasts; without this, any client observing a requestId could
  spoof success — N-2's cross-user interference is closed by correlation + authentication
  together).
- **GM-side sanitization — the GM builds a fresh source; the payload is quarry.** Allowed
  quarry fields: `name` (string, length-clamped), `img` (string path), `system` (object),
  `items` (array — **rebuilt** by applying `projectItemSource` (§5.5.7) to each entry; `null`
  projections dropped with warnings), plus the validated commit metadata
  (`commitId`/`firstAttemptAt` shapes, finite `xp`). Everything else — payload `_id`,
  `folder`, `ownership`, `flags`, `prototypeToken`, actor-level `effects`, unknown keys — is
  ignored. The fresh source gets: `type: "character"`; `prototypeToken` from
  `getActorCreationDefaults("character")`; `ownership` **replaced** with
  `{[sender]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER}` (the server will add the processing
  GM's own entry — accepted, §9-a); then `normalizeCommitSource(…, {userId: sender, commitId,
  firstAttemptAt, xp})` — which reapplies the shared identity layer — and `commitBuild`.
  GM-local and player commits therefore persist identical sources for identical payloads *on
  the same GM*.
- Timeout ~15 s on the requester → the §5.7 failure path (honest un-confirmed state, §5.9);
  retries reuse the frozen commit identity with a fresh `requestId`.

#### 5.8.4 Read-only commit-log verification (D10)

```js
function verifyCommitLog(actor, commitId) {          // READ-ONLY — never writes the flag
  const log = actor.getFlag("starwarsffg", "xpLog") ?? [];
  const missing = ["earn", "spend"]
    .map(k => `pcw:${commitId}:${k}`)
    .filter(id => !log.some(e => e?.id === id));
  return missing.length ? [`xp-log-entries-missing:${missing.join(",")}`] : [];
}
```

Per **D10**, the `xpLog` flag keeps its array shape, whole-array `setFlag` writes remain
last-writer-wins (`document.mjs:933-949`; the system's own helpers use the same
read-modify-write pattern, `actor-helpers.js:211-225,258-278`), and the wizard **declines to
be another writer to that contested field**: the two intended entries are baked into the
creation source (§5.8.2.2) — the only write is the actor create itself — and post-create
verification only **reads and warns**. Consequences, stated plainly:

- The erase hazard of any rewrite-based reconciliation is **gone, not merely accepted** —
  there is no reconciliation write to race anything.
- If verification finds an expected entry missing (possible only after an external rewrite of
  the flag), the warning surfaces in the commit response and the D9 finish record; the remedy
  is manual/GM-side. The stamp (`pcWizardCommit` — commitId, xp totals, date) carries
  everything needed to re-add the entries by hand or by a future tool; read-only verification
  needs only the `commitId` (it checks entry presence by deterministic id, not byte
  equality).
- The keyed-object xpLog refactor that would fix the system-wide race is a separate future
  improvement (§7), out of scope (D10).

### 5.9 D9 — Commit observability (R6-3 lifecycle)

The rare commit edge cases (§9) are handled by making them **visible and manually
recoverable**. Implemented in `notify.js`; all strings via i18n keys (below). Scope: non-GM
player commits (a GM running the wizard sees everything already; GM-local commits write the
log line only).

**Session identity.** Each wizard **open** mints a transient
`sessionNoticeId = randomID(16)` on the app instance — not persisted, not derived from
`commitId`. Closing and reopening a persisted draft keeps its `commitId` but gets a **new**
`sessionNoticeId`; this is deliberately the D9 "session" identity.

- **Start notice (GM: whisper + log) — pending-until-acknowledged.** The wizard tracks
  `#startNoticeState ∈ {"pending", "delivered"}` (initially pending). It emits
  `startNotice {sessionNoticeId, commitId}` and stays **pending until an authenticated GM
  `startNoticeAck {sessionNoticeId}` arrives** — emission alone never marks delivery (a
  transient socket message has no processor when no GM is active, and
  `game.users.activeGM`-style lookups return null then). Emission triggers while pending:
  (a) first render; (b) any subsequent render where an active GM exists and ≥30 s have
  passed since the last emission; (c) **unconditionally, immediately before the first commit
  attempt**. The processing GM de-duplicates starts by authenticated
  **`(sender, sessionNoticeId)`** — NOT by commitId, so reopening a draft (same commitId, new
  session) notices again, matching the required "once per wizard session" semantics — posts
  one ChatMessage whispered to all GM users (*"⚙ {player} started creating a character"*)
  plus a `CONFIG.logger.info` line, and broadcasts the ack. Duplicate emissions from the
  pending-loop are absorbed by the GM-side de-dup key.
- **Finish record (GM: whisper + log, with actor link) — de-duplicated per commit.** After a
  successful `commitBuild`, the processing client posts one ChatMessage whispered to all GM
  users **and the requesting player**: *"✅ {player} finished creating {name} —
  @UUID[Actor.{id}]{name}"* (the `@UUID[…]` content link renders clickable in chat) plus a
  log line; `verifyCommitLog` warnings are appended. The processing client keeps a
  session-lifetime set of finish keys **`(sender, commitId)`** and posts at most one finish
  record per key — a same-commit retry after a lost ACK returns the existing actor without a
  second record **on that client**. **Cross-GM duplication remains possible** under the
  accepted failover model (a different GM processing the retry has no shared finish set;
  there is no durable notification ledger by design) — documented in §9-a. This message is
  also the **player's whisper** (they are a recipient).
- **Player toast, ACK-gated.** The wizard shows the **green success toast only upon
  receiving the authenticated GM `commitResponse {ok: true}`** — the response *is* the
  acknowledgement. Until then the player sees an honest **"Submitting… — not confirmed"**
  state (spinner on the Create button, amber status line); on timeout the state becomes
  **"Not confirmed — will retry / Retry"** with the draft intact. **The player is never shown
  green without the ACK.** GM-local commits show the toast on local success.
- **The GM's disambiguation procedure** (documented in the fork's user docs and summarized in
  the start-notice tooltip):
  - *Started, never finished* → the submission didn't complete. Auto-retry usually resolves
    it; otherwise have the player press Retry (the frozen commit identity makes the retry
    converge on the same actor).
  - *Finished/created, but the player can't see the actor* → the actor exists (the finish
    record links it); have the player **reconnect/refresh** — owned actors re-sync on
    reconnect. Do not re-create.
  - Duplicate actors (residual §9-a) are identifiable by their `pcWizardCommit` stamps (same
    `userId`, different `commitId`); delete the superseded one.
- **i18n keys** (added to `lang/en.json`, flat, alongside the existing block):
  `SWFFG.CharacterCreator.Notify.StartedGM` ("{user} started creating a character"),
  `.Notify.FinishedGM` ("{user} finished creating {actor}"),
  `.Notify.FinishedPlayer` ("Your character {actor} was created"),
  `.Notify.SubmitPending` ("Submitting character… awaiting GM confirmation"),
  `.Notify.SubmitUnconfirmed` ("Not confirmed yet — the request will be retried"),
  `.Notify.SubmitRetry` ("Retry submission"),
  `.Notify.SubmitFailed` ("Character submission failed: {error}"),
  `.Notify.LogWarning` ("XP-log verification warning: {detail}"),
  `.Notify.NoGm` ("A GM must be connected to finalize character creation"),
  `.Notify.StrayCommit` ("A previous submission may also have created an actor (commit
  {short}); ask your GM to check"),
  `.Notify.CollisionError` ("Commit id collision detected — retrying with a fresh id").

### 5.10 Shared internal helpers (ordinary functions post-pivot; factored to prevent drift)

These were "pure fork-side API operations" in the module-era design; they are now ordinary
internals, **kept factored as shared cores** so wizard and sheet/system semantics cannot
drift (round 6 confirmed each factoring preserves existing behavior):

1. **`reconcileTreeEffects(effectSources, tree, nodeLabel, fallbackImg)`** — the pure
   reconciliation core **extracted from `syncTreeActiveEffects`**
   (`item-helpers.js:284-352`), which becomes a thin document-applying wrapper (update/create
   the returned patches; the sheet purchase flow is unchanged). `materializeTreePurchases`
   (§5.5.5) applies the same core to cloned source arrays. One algorithm — empty-changes
   skip, exact-flag-tuple claim, same-name fallback, in-place patch of
   `changes`/`disabled`/`flags` only, id-less append when unmatched, no deletion — two
   appliers.
2. **`getActorCreationDefaults(type)`** — the per-type prototypeToken blocks currently
   inlined in static `ActorFFG.create` (`actor-ffg.js:46-106`, incl. rival's runtime
   `RivalTokenPrepend` setting read `:80`) and the default-image map inlined in `_preCreate`
   (`:112-118`), extracted into one factory consumed by `create`, `_preCreate`, **and**
   `applyBuild` (§5.5.1) — preserving `create`'s only-when-`system`-absent condition and
   `_preCreate`'s conditional image for existing callers. Returns `{img, prototypeToken
   (partial — no name/texture), system (type defaults)}` as fresh clones; the `system`
   member may be obtained from a throwaway `new Actor.implementation({type, name})` whose
   prototypeToken/name/img are discarded (a bare constructor runs neither `create` nor
   `_preCreate` — verified — so token and image must come from the factory tables, never the
   throwaway).
3. **`applyCharacteristicDeltas(systemSource, deltas)`** — the pure source-level equivalent
   of `_preUpdate`'s characteristic math (§5.5.2), placed next to `_preUpdate` in
   `actor-ffg.js` with cross-referencing comments; `_preUpdate` itself is retained unchanged
   for ordinary updates.
4. **`buildXpEarnEntry({grant, available, total, note, statusId, date, granter = "GM"})` /
   `buildXpSpendEntry({action, cost, available, total, statusId, date})`** — pure entry
   builders factored out of `xpLogEarn`/`xpLogSpend`, which delegate to them (behavior
   identical). `buildXpEarnEntry` derives `action = granter === "GM" ? "granted" :
   "adjusted"` — exactly the real helper's selection (`actor-helpers.js:261-266`); `date`
   defaults to today inside the persisting helpers but is **explicit** for the wizard's
   frozen entries. Entry shape (verified `:214-224,:267-277`):
   `{action, id: statusId, xp: {cost, available, total}, date, description}`.

Also retained as-is and simply imported: `AE_MODES` (`ffg-active-effect-modes.js:18-25`),
`sortDataBy`/`addIfNotExist` (`actor-sheet-ffg.js:2921,:2939`),
`DiceHelpers.addSkillDicePool`, `_createSkillColumns`, `CONFIG.FFG.characterCreator` (global
config incl. rules / startingBonusesRadio / background / obligation / motivation type tables
— shared with item sheets and the OggDude importer, so it survives the old implementation's
deletion).

### 5.11 Advisory validation (D4; issue G)

`validate.js` — pure, **never blocks anything**:

```js
validateDraft(data, ctx) → {
  steps: Record<"background"|"startingBonus"|"obligation"|"species"|"career"
               |"xpSpend"|"gear"|"motivation",
               {status: "complete"|"incomplete"|"warning", notes: string[]}>,
  totals: { xp: {total, available}, credits: {total, available},
            obligation: {starting, available, key} },
  warnings: string[],
}
```

Checks: per-step completeness mirroring the wizard's own review copy (en.json `:962-973`);
the expected free-rank counts (4 career / 2 specialization — the numbers the wizard's labels
state, en.json `:967,:969`) as warnings when short or over; affordability (XP ≥ 0,
credits ≥ 0 — overspend **warns, never gates**); unspent-XP notice; cross-cutting notes
(force-attitude while ruleset ≠ fad; selection from a disabled source; unresolvable draft
uuid). The review tab renders ✔/✘/⚠ from `steps` with per-step notes — data-driven, not
cosmetic. **Create is always enabled**; if warnings exist, one confirm dialog lists them with
"Create anyway" (default) / "Go back" — information, not a gate. Purchase-time dialogs keep
today's in-flow affordability behavior (extra-spec dialog refuses to open when base cost
exceeds available XP and hides unaffordable out-of-career specs, `:1318-1324`) — existing
semantics, not a new gate.

### 5.12 Gear filters (D6)

GM gates stay exactly as audited — `maxRarity`/`allowRestricted` filter the pool **at load**
inside `loadSource("item", …)` (`:663-676`); nothing rendered can exceed them; **no reveal
toggle**. The interactive filter bar (state in `this.ui.gear`, transient, not drafted):
**price** min/max inputs against `system.price.value` (the field the purchase path reads,
`:1611`); **rarity** "up to N" select whose options run 0…GM `maxRarity` (the control's own
ceiling is the gate, making containment visible); **restricted** tri-state (All /
Unrestricted / Restricted only) against `system.rarity.isrestricted`, rendered **only when**
`allowRestricted` is true; the five category chips; text search; clear-filters. Filtering is
pure in `_prepareContext` over cached refs with a targeted `render({parts: ["gear"]})`.

## 6. Coverage matrices

### 6.1 KEEP items (audit §11 / brief v2 §5)

| # | Keep item | Where preserved |
|---|---|---|
| 1 | AppV2 + Handlebars multi-tab shell (PARTS/TABS/tab-navigation) | §5.1 — same pattern, rebuilt wiring; minimized-close behavior preserved |
| 2 | `this.data` model, single source of truth, derive-don't-store | §5.2 — shape kept verbatim + identity/commitId; SelectionRefs inside |
| 3 | `getSources(type)` abstraction (packs ∪ world items) | §5.3 — one generic `loadSource` + corrected world-type map |
| 4 | Pure calculators (fix `calcObligation` coupling) | §5.4 — ported pure; single starting-bonus table feeds both display and math |
| 5 | Live-preview concept | §5.6 — same idea, in-memory mechanism (D2) with stable wizard identity |
| 6 | i18n keys + settings | §5.1/§5.3/§5.9 — existing keys and settings kept; new keys added |
| 7 | Tab flow (minus rules) + review ✔/✘ pattern | §5.1/§5.11 — 9 tabs in verified TABS order; validation-driven review |

### 6.2 Issue register A–H and BUG-1..4 (brief v2 §6) — all verified in code

| ID | Verified at | Resolution | § |
|---|---|---|---|
| A | `:1059-1081`; bridge `:2059-2086` | In-memory unsaved preview; create only on Confirm via the commit service | §5.6/§5.8 |
| B | `:205-508`; `:363-481` | Delegated `actions` + per-part `_attachPartListeners`; pickable-table; declarative column sets; native selects | §5.1 |
| C | `:1083-1205` vs `:1697-1845`; `:660-841` | One `applyBuild`; one `loadSource` | §5.5/§5.3 |
| D | `:677` et al.; `:1434,:1461-1468`; `:1017-1021` | SelectionRef snapshots; clone-before-mutate; `.pill` in context; obligation edits on the snapshot | §5.2/§5.5 |
| E | `:1151-1200`; `:1791-1839` | Deterministic `pcwRank<n>_<skillSlug>` attrs + effects baked into item sources (sound: `legacyTransferral = false`, `swffg-main.js:218`) | §5.5.6 |
| F | `:189-195` | Session-lifetime listeners registered once at `ready`; the wizard registers nothing | §5.8.3 |
| G | absent draft code; cosmetic review | D5 drafts + commit mutation barrier; D4 advisory validation | §5.7/§5.11 |
| H | `:102`; `:625-637`; `footer.html`; `:582,:1232` | Deleted, not ported | §5.1 |
| BUG-1 | `:1654-1656`; `:1142-1146`; `:1757-1761` | One SelectionRef shape through one `toItemData` | §5.2/§5.5 |
| BUG-2 | `:894,:897,:900,:903` | Single starting-bonus table keyed by `selected.rules` | §5.4 |
| BUG-3 | `:1443-1444` | uuid matching everywhere; Documents unrepresentable in state | §5.2 |
| BUG-4 | `:922,:938,:954` | `enrichHTML` (the namespaced call already used at `:677`) + `stripHtml`, centralized | §5.1 |

### 6.3 Code-grounding defects N-1..N-7 and preserved quirks

| ID | Found at | Problem | Resolution |
|---|---|---|---|
| N-1 | `:807` vs `system.json` | World careers filtered as nonexistent type `"careers"` — never offered | `loadSource` world-type map — §5.3 |
| N-2 | `:189-195`; `swffg-main.js:2082-2086,2118-2122` | Socket responses are unfiltered broadcasts — concurrent wizards consume each other's actor ids | requestId correlation + GM-sender authentication — §5.8.3 |
| N-3 | `swffg-main.js:2052` | Bridge binds only on the first active GM at ready — GM logout silently kills it | all-GM registration + activeGM dispatch + timeout + frozen-identity retry — §5.8.3 |
| N-4 | `:660-683` | Gear loader has no world-items fallback, unlike every other loader | uniform world ∪ packs — §5.3 |
| N-5 | `:1729-1774`; `:1114-1149` | Purchased extra specs/Force powers never embedded by either path — XP charged for lost content | `toItemData` embeds them, materialized, in both paths (intentional fix; parity case) — §5.5.4 |
| N-6 | `:1114-1149` vs `:1766-1774` | Credit-purchased gear absent from preview, present in final | embedded in both paths — §5.5.4 |
| N-7 | wizard `:1434,:1461-1468` vs sheet `item-sheet-ffg.js:1776-1777` | Wizard never syncs tree AEs after `islearned` flips — purchased nodes stat-inert | `materializeTreePurchases` via the shared reconciliation core — §5.5.5/§5.10.1 |
| Q-1 | `:172,:1775-1779` | d100 `spendingCredits` applied at commit only, never previewed | kept (FFG RAW pocket money); persisted in draft; previewed — §5.2 |
| Q-2 | `:884,:902` | `2k_credits` grants 2500 | ported verbatim; owner decision pending — §5.4/§10 |

### 6.4 New features

| Feature | § |
|---|---|
| D5 draft resume (user-flag storage, schema v1 + migrations, resume/discard UX, commit mutation barrier, browser-loss recovery) | §5.7 |
| D6 gear filters (price/rarity/restricted within GM gates; no reveal toggle) | §5.12 |
| D7 per-source checkbox pool (Sources panel, exclusion persistence, one `isSourceEnabled` predicate incl. career-scoped specs; rules tab dropped, ruleset folded into startingBonus) | §5.3/§5.4 |
| D9 commit observability (session-keyed, ack-gated start notices; per-commit de-duplicated finish records with actor link; ACK-gated green toast; disambiguation procedure; i18n keys) | §5.9 |

## 7. Alternatives considered

| Alternative | Why not |
|---|---|
| **Standalone module + versioned `game.system.api` + adapter + supersession** (the rounds-1–5 architecture) | **Tried in design and cancelled by the owner (brief v2)**: users must run the fork anyway, so the module boundary was pure overhead — an API contract, version handshake, distribution matrix, and supersession mechanism protecting a boundary nobody crosses. Its correctness results are carried into this design; the boundary machinery is deleted. |
| **DB temp actor for preview** (status quo) | The audited root cause (issue A); rejected by D2. |
| **Keep DataTables for the shop tab** | Sort + search + category columns + three filters are covered by the pickable-table partial and pure context filtering; dropping the vendored lib removes the whole re-instantiation bug class. |
| **World setting / journal / placeholder actor for drafts** | Write permissions (world settings are GM-only), wrong scope (client settings), or orphan documents (placeholder actor) — §5.7. |
| **Hard validation gate on Confirm** | Overridden by product decision D4 (advisory only). |
| **Update both old-path importers instead of a shim** (R6-1 option 2) | Works, but touches `swffg-main.js` and the migration test for zero benefit; the one-line shim keeps both importers untouched and preserves the test's intent. Chosen: the shim. |
| **Server-arbitrated exactly-once commit via a GM-owned ledger document with deterministic EMBEDDED commit records** | **Documented future hardening — deliberately not built.** It is genuinely atomic (the embedded duplicate check `u?.has(t._id)` throws inside the DB semaphore — verified), but needs a provisioned ledger, pending/completed states, winner publication, loser wait/refetch, stale-pending recovery, and missing-ledger handling — beyond D3's minimal bridge. Would close residuals §9-a/b and give D9 a durable notification ledger. Revisit only if they are observed in practice. |
| **Keyed-object `xpLog` refactor** (object keyed by entry id, so Foundry merges keys instead of replacing an array) | Would fix the system-wide concurrent-write race the array shape has today — but it is a breaking data-shape change requiring migration of every character in every world. **Out of scope per D10; logged as a separate future system improvement.** The wizard's read-only stance (§5.8.4) is the v1 answer. |
| **Per-request idempotency key (no commitId)** | A request that succeeded GM-side but lost its response would retry under a new key and duplicate the actor; only a draft-lifetime key converges retries. |
| **Chasing byte-equal persisted sources across GM failover** | Rejected by the owner (best-effort decision): the server adds the processing GM to `ownership` (verified §0) and stamps `_stats` per write; eliminating that variance requires the ledger design. Accepted instead as residual §9-a with D9 visibility. |
| **Cryptographic digests for embedded ids too** | Unnecessary: embedded ids need uniqueness only within one parent across a few hundred slots and are never world keys; a documented deterministic fold is sufficient and synchronous (§5.5.8). The crypto digest is reserved for the world-key actor id. |

## 8. Risks

1. **Preview/final numeric stat parity** — the load-bearing correctness spike. The
   preparation *mechanism* is verified (construction prepares; item effects transfer with
   `legacyTransferral = false`); what remains is end-to-end numeric equality, exercised by
   the §11 fixtures (characteristic-delta math, tree materialization with legacy-effect
   fixtures, priority-ordered effects, tinted overlay rendering, the deliberately-inert
   `stats.Brawn`/`stats.Willpower` mirror writes, and the stable-identity comparisons).
2. **Shared-core drift** — `reconcileTreeEffects` and `getActorCreationDefaults` are
   extracted so wizard and sheet/system consume one implementation;
   `applyCharacteristicDeltas` mirrors `_preUpdate` (co-located, cross-commented); the XP
   entry builders are the single source of the entry shape. Residual: `_preUpdate` itself
   must not drift silently — noted for fork maintenance.
3. **Draft size in user flags** — spec/force-power snapshots can be tens of KB and ride
   every debounced User-doc update. Measure with a maxed draft (§11); designed fallback:
   uuid-only refs for compendium-resolvable items, snapshots only for world items and edited
   obligations.
4. **Sanitization depth** — `system` passes as an object after scalar validation of the XP
   inputs; a hostile client can still write junk into *its own* PC's fields — the same power
   any OWNER has post-create. Accepted (permission posture unchanged, D3/non-goals).
5. **AppV2 part-render granularity/perf** — tune part grouping during implementation; the
   design requires "never full-window per keystroke" and per-part listener scoping.
6. **Fork release story** — not part of this feature, but if the fork is distributed beyond
   the owner's own world, `system.json`'s `manifest`/`download` still point at upstream
   (`:5,92-94`) and would deliver a wizard-less system to updaters. Flagged to the owner
   (§10-4).
7. **Test-suite invocation unknown** — the fork has 12 test files but no `test` script
   (verified); Playwright and Cypress are devDependencies. The implementation plan must
   determine and pin the real invocation before relying on the suite (§11-1).

## 9. Accepted residual risks (documented, not eliminated — mitigated by D9)

Accepted by the product owner (brief v2 §6). The server-arbitrated embedded-ledger design
(§7) would close a and b (and give notifications a durable ledger); the keyed-object xpLog
refactor (§7) would close the system-wide log race that c inherits. Worst case across all
three: **a duplicate character the GM deletes, or a differing owner-GM/XP-timestamp entry —
never a lost or corrupted build.**

| # | Residual | Mechanism | Visibility / remedy |
|---|---|---|---|
| a | **Lost-ACK + GM-failover variance; edit-and-resubmit strays; notification gaps.** A same-payload retry processed by a different GM re-upserts the same key with a different processing-GM `ownership` entry (server `_preCreate` adds the requesting user at OWNER — verified §0) and different `_stats`/date metadata; an edit-after-unacknowledged-attempt mints a new commitId, and if the slow original attempt still lands, **two** actors exist. D9 start/finish records bracket commits **on a best-effort basis**: start delivery requires an active GM (pending-until-ack, §5.9), finish de-dup is per processing client — cross-GM failover can duplicate a finish record, and a session whose GM never connects can end without a start record. | Primary-document upsert + no server arbitration (§5.8.1); transient socket notices with no durable ledger. | D9 records + ACK-gated player state; every wizard actor carries a `pcWizardCommit` stamp (`userId`, `commitId`, xp, date) — strays are identifiable and GM-deletable; the wizard warns when it re-keys (`Notify.StrayCommit`). |
| b | **Stamp-preflight race / digest collision.** The occupant check reads a client-local snapshot; a write can interpose before this request's server write; a SHA-256→16-char collision with an unrelated actor is theoretically possible and an upsert would overwrite it. | Check-then-write on an upserting store; finite id space. | Collision probability ≈ 2⁻⁹⁵ per pair — cryptographically negligible; when the preflight *does* observe a mismatch it errors loudly (`CommitCollisionError`) and re-keys; world backups; commit stamps identify any wizard write after the fact. **No "never overwrite" guarantee is claimed.** |
| c | **xpLog whole-array writes elsewhere.** The wizard bakes its two entries into the creation source and never rewrites the array (D10), so it neither erases nor duplicates anything — but the system-wide last-writer-wins array race (any two concurrent `xpLogEarn/Spend` writers) predates this feature and remains. A same-key failover overwrite (a) restores the baked entries but reverts *unrelated* post-create log additions made in the window, along with any other post-create edits. | Array-shaped flag + `setFlag` whole-value writes (`document.mjs:933-949`); upsert window. | Read-only verification warns when the baked entries are missing (`Notify.LogWarning`); the stamp carries the data to restore them manually; the window is seconds-wide and failover-only. The systemic fix is the keyed-object refactor (§7, future). |

## 10. Open questions (non-blocking; defaults chosen)

1. **Sources panel placement** — header-button overlay (chosen) vs a tab; revisit on playtest
   feedback.
2. **Multiple named drafts** — one slot per user in v1; the schema's `characterName` supports
   a list in v2 without migration pain.
3. **Q-2** — `2k_credits` grants 2500 (label/value mismatch, ported verbatim): owner may fix
   label or value; one line either way, but visibly behavior-changing, so it needs an
   explicit decision.
4. **Fork release endpoints** — if the fork is ever distributed, `system.json` needs
   fork-owned `url`/`manifest`/`download` and a release archive (today they point upstream).
   Owner decision, outside this feature (§8-6).
5. **GM-absent flow** — the current wizard hard-errors at construct when no GM is active
   (`:184-187`). Default here: the wizard **opens** without a GM (building and drafting are
   local; the D9 start notice stays pending until a GM acks, §5.9), and "a GM must be
   connected to finalize" surfaces at review + commit (`Notify.NoGm`). Flagged in case the
   owner prefers the old hard gate.
6. **Warnings-dialog suppression** ("don't ask again") — not in v1.

## 11. Verification plan

**The fork has a real harness** (verified, §0): 12 test files under `tests\` including the
`tests\v2-migration\` suite, `npm run lint` (`eslint modules`), and Playwright/Cypress
devDependencies — but **no `test` script**; the implementation plan's first task is to
determine and pin the actual suite invocation. Every stage must state concrete, checkable
verification; at minimum:

1. **Wiring stage — static import smoke check (R6-1) + harness:** with the shim in place and
   the old implementation removed, the system **boots** (all import specifiers resolve —
   in particular `swffg-main.js:58` through the shim), hooks register, and the entry button
   opens the new wizard; `npm run lint` is clean; the existing test suite passes — in
   particular `tests/v2-migration/minimized-close.test.js`, which imports the shim path and
   asserts the preserved minimized-close behavior (§5.1). This check precedes every manual
   test.
2. **No-churn smoke:** open the wizard as GM; build a full character while watching the
   Actors directory and server log — **zero `temp actor - …` documents**, zero socket
   traffic, zero actor writes before Confirm.
3. **Preview/final parity:** a representative build (species + career + spec + purchased
   talents + extra spec + force power + upgrades + characteristic/skill purchases + gear +
   obligations + motivations) — every derived stat of the preview actor equals the committed
   actor; both equal a hand-built control character created through the current sheet flows.
   Includes: Brawn/Willpower purchases (wounds/soak/encumbrance/strain math, §5.5.2);
   `stats.Brawn`/`stats.Willpower` mirror writes confirmed inert; free-rank AEs applying in
   preview.
4. **Canonical-projection parity fixture:** an ammo-enabled weapon
   (`flags.starwarsffg.config.enableAmmo`), medical gear (`…config.medicalType`), two
   same-key ActiveEffects with different `priority` values, and a **tinted
   `flags.core.overlay` effect** — assert projected item sources are equivalent between
   preview and commit, derived stats match, ammo/medical behaviors work on the created
   actor, and the token renders the overlay/tint.
5. **Identity fixtures (R6-2):** (a) render the preview repeatedly for one draft — embedded
   Item/effect `_id`s and the preview actor `_id` are **identical across renders**; (b) the
   same gear item bought twice → two embedded items with **distinct** deterministic ids in
   preview and in the committed actor; (c) commit, then compare — committed embedded ids
   equal the preview's; (d) repeat the commit (same GM, no edits) → byte-equal persisted
   source apart from `_stats` (fingerprint passes; ids identical); (e) re-mint (edit after a
   failed attempt) → all wizard ids change together with the commitId.
6. **Tree materialization fixtures:** a compendium spec with flagged tree effects; a
   legacy-style spec with an unflagged same-name effect (adopted, not duplicated); un-learn
   refund by uuid (BUG-3 regression).
7. **Non-GM player smoke (D3 + D9 / R6-3):** player builds and commits through the bridge —
   verify: the GM start whisper appears **once per wizard session** (re-render does not
   repeat it; closing and reopening the same draft **does** produce a new one); opening with
   **no GM connected** leaves the start pending and it is delivered when a GM connects or at
   latest immediately before the first commit attempt; the finish whisper (with a working
   actor link) reaches GMs + player exactly once per commit on the processing client, and a
   same-commit retry does not repeat it there; the ACK-gated green toast appears only on the
   authenticated response; the honest unconfirmed state shows when the GM is disconnected
   (then retry convergence on reconnect); the created actor is owned by the player.
8. **Draft lifecycle:** close mid-build → reopen → resume banner → identical state (incl.
   `spendingCredits` and edited obligations); discard; commit success clears the draft with
   no resurrection (watch the User doc); browser kill mid-commit → resume → retry converges
   on one actor.
9. **XP-log verification (read-only):** created actor has exactly the two
   `pcw:<commitId>:*` entries with the frozen date and correct totals; `granted` action on
   the earn entry (builder `granter` default; also test a non-GM `granter` yields
   `adjusted`); externally delete one entry → re-run a dedup commit → warning surfaced,
   **log not rewritten** (D10).
10. **Ruleset/pool/filter checks:** BUG-2 regression (AoR/EotE bonuses land in
    duty/obligation); ruleset switch clears starting bonus and hides force-attitude; world
    careers appear (N-1); gear world items appear (N-4); disabling a source removes
    offerings but preserves selections with an advisory note (incl. career-scoped specs);
    gear filters never exceed GM gates.
11. **Console-clean load** of the fork with the rewritten creator; no references to deleted
    socket events remain; the old implementation file contains only the shim.
12. **Draft-size measurement** (risk 3) with a maxed draft; trigger the uuid-only fallback
    decision if needed.

## 12. Review response

### Round-6 findings (this revision)

| # | Severity | Finding | Outcome |
|---|---|---|---|
| R6-1 | Blocker | v6 deleted `modules/helpers/character-creator.js` while claiming an export from the new module keeps the old import working — `swffg-main.js:58` (and the migration test at `tests/v2-migration/minimized-close.test.js:12`) would fail ES-module resolution and the system would never boot | **FIXED** — wiring contract chosen and stated normatively (§4): the old path is **kept as a one-line compatibility shim** re-exporting `CharacterCreator` from `../char-creator/pc-wizard.js`; both verified importers stay untouched; the file map no longer contradicts itself (implementation deleted, path kept); the minimized-close behavior the test asserts is explicitly preserved (§5.1); a static import smoke check is verification step 1 (§11-1). |
| R6-2 | Major | Deterministic embedded ids existed only at commit; preview ids were randomized every construction (`embedded-collection.mjs:146-159`), the "stable random" preview actor id had no stability source, and the §11 fixture was unimplementable | **FIXED** — one shared pure identity layer `assignWizardIdentity` (§5.5.8), applied after canonical projection by **both** `applyBuild` (before every preview construction, §5.6) and `normalizeCommitSource` (which reapplies the same helper — no second formula, §5.8.2.1). Ordering stated: projection strips SOURCE identity, the identity layer adds WIZARD identity. The preview actor carries the final commit-derived `_id` (safe unsaved); its stability source is persisted state (`data.commitId` + owning user). Embedded ids use a documented synchronous fold (within-parent uniqueness domain); the actor id keeps the crypto digest (world key). Identity fixtures added (§11-5). |
| R6-3 | Major | D9 lifecycle gaps: start de-dup keyed by `(sender, commitId)` wrongly suppressed reopened-draft sessions; a no-GM start emission was marked delivered and never re-sent; finish records had no de-dup key across retries | **FIXED** — per-open transient `sessionNoticeId`; starts de-duplicated by authenticated `(sender, sessionNoticeId)` (reopening notices again); start state is **pending-until-GM-ack** with re-emission while pending (renders with an active GM, ≥30 s spacing, and unconditionally before the first commit attempt); finishes de-duplicated by authenticated `(sender, commitId)` on the processing client, with cross-GM duplication explicitly documented as part of the accepted failover model (no durable notification ledger); §9-a's "bracket every commit" softened to the resulting best-effort guarantee. §5.9, §9-a, §11-7. |

### Round-5 findings (resolved in v6, confirmed by round 6, carried unchanged)

R5-1 (failover determinism) — resolved under the binding best-effort decision: frozen
`firstAttemptAt`/xp travel in the request; cross-GM ownership/metadata variance and
edit-vs-slow-attempt duplicates are accepted residual §9-a; no atomic/exactly-once/
never-overwrite claims exist. R5-2 (log erase hazard) — resolved by read-only verification
(D10, §5.8.4). R5-3 (entry-builder inputs) — resolved by `granter`-aware builders and the
frozen creation inputs in `draft.commit` + the actor stamp (§5.10.4, §5.8.2).

### Findings mooted by the 2026-07-20 pivot (explicitly, not silently dropped)

| Former finding | Status after the pivot |
|---|---|
| The **D1 API-contract** findings (document types & creator config inside the versioned surface; adapter as sole consumer; return-contract annotations) | **MOOT** — no API, adapter, or version marker exists. The substance survives as direct imports and §5.10's shared internals; `CONFIG.FFG.characterCreator` is consumed directly as the global it already is. |
| The **module ↔ system package compatibility / fork distribution** finding (module relationship matrix, API-less-package hazard) | **MOOT as a module concern** — no module, no relationship. The *fork's own* release story (upstream-pointing `manifest`/`download`, `system.json:5,92-94`) still needs owner attention **if the fork is distributed** — carried as §8-6/§10-4, not as a feature requirement. |
| The **`_canRender` supersession gate**, defensive button-stripping, hook-ordering analysis (old D8) | **MOOT** — the rewritten creator *is* the system's creator (D8-revised); the entry button simply opens it via the shim. No dual-creator scenario exists. |
| The **module socket namespace** work (`module.…`, module `"socket": true`) | **MOOT** — the bridge lives on the system channel (`system.starwarsffg`, already `"socket": true`), with the same authentication/sanitization/lifecycle substance (§5.8.3). |
| The module-era **i18n key copy** (self-sufficiency against system-side deletion) | **MOOT** — single repo; keys are edited in place. |
| Everything else from rounds 1–6 | **Carried forward, not mooted** — the correctness results are §5 of this document, enumerated in §6's matrices and the brief v2 §6 constraints. |
