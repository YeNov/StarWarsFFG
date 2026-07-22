# PC Wizard — user & GM guide (rewritten wizard)

The **PC Wizard** (`CharacterCreator`) is the guided character-creation flow, opened from the
Actors directory header button. This guide covers the rewritten wizard (branch
`pc-wizard-rewrite`): the tab flow, the Sources panel and gear filters, draft resume/discard,
the GM's duplicate-disambiguation procedure, and the recorded limitations and accepted residuals.

> Status: the wizard **boots and renders** (GATE-CUTOVER-BOOT passed, 2026-07-21). Visual styling,
> the live preview panel, and content-pool loading against your compendia are finalized/verified in
> the Stage 23 live pass — see "Known limitations" below.

## The tab flow

The wizard opens on **Background** and has **nine tabs** (there is no longer a separate *Rules*
tab — the ruleset selector folds into the starting-bonus/obligation flow):

1. **Background** — culture, hook, and (Force and Destiny only) Force attitude.
2. **Starting Bonus** — the per-ruleset starting-bonus choice (extra XP, credits, or an
   obligation/morality/duty shift).
3. **Obligation** — obligation / duty / morality entries per the ruleset.
4. **Species**.
5. **Career** — plus the 4 free career skill ranks.
6. **XP Spend** — characteristics, skill ranks, talents, extra specializations, Force powers.
7. **Gear** — credit purchases, with filters (below).
8. **Motivation**.
9. **Review** — per-step completeness, warnings, and the **Create** button.

The header shows a running summary (species / career / specialization, XP, credits, and the active
obligation value) and a **Content sources** button. A live **preview** of the character-in-progress
is built in memory as you go — no database actor is ever created until you press **Create** (this
replaces the old "temp actor" churn that spawned throwaway actors on every keystroke).

## Sources panel (content selection)

The **Content sources** button (header) opens an overlay listing every compendium and *World items*
that can feed each pool (species, careers, specializations, Force powers, backgrounds, obligations,
motivations, gear). **Everything is enabled by default.** Turning a source off is stored as an
*exclusion* per user, so a source the GM adds later defaults **on**. The specialization group lists
configured packs ∪ packs referenced by the selected career ∪ World items.

If you had selected something whose source is later disabled, **the selection stays in your draft**
with an advisory note — it is not silently dropped.

## Gear filters

On the **Gear** tab: text search, min/max price, "max rarity up to N" (bounded by the GM's
`maxRarity` setting), a restricted-item toggle (**shown only when** the GM allows restricted items),
five category chips (weapon / armour / gear / attachment / modification), and clear-filters. GM rarity
and restricted gates are applied **when the pool loads** — there is no player-facing reveal toggle.

## Drafts — resume and discard

Your in-progress character is auto-saved as a **draft** on your own user (one draft slot per user).
Re-opening the wizard offers to **Resume** or **Discard** it. On resume, each stored selection is
refreshed from its source where possible; anything that can no longer be found is kept as-is with an
advisory warning. Newer-version or unreadable drafts are never resumed blindly — you are offered a
clean discard instead.

## For the GM — the observability chat trail

The wizard whispers the GMs a **start** notice when a player begins, and a **finish** record with a
clickable `@UUID` link when a character is created. These are informational.

### Disambiguation procedure (when something looks wrong)

- **"A player started but I never saw a finish record."** The submission did not complete. Ask the
  player to try **Create** again — the draft is intact and a retry reuses the same commit identity.
- **"I see the finish record / the character was created, but the player can't see it."** **The actor
  exists.** Have the player **reconnect or refresh** — do **not** re-create it. Re-creating risks a
  duplicate.
- **Telling duplicates apart.** Every wizard-created actor carries a `flags.starwarsffg.pcWizardCommit`
  stamp (`{commitId, userId, xp, date}`). Two actors with the **same** `commitId` are duplicates of one
  submission — keep one and delete the other. Different `commitId`s are genuinely separate attempts.

## Known limitations (recorded)

- **Third-party module flag scopes are dropped.** The wizard normalizes each item to a canonical
  shape that keeps only the `starwarsffg` flag scope (plus `flags.core.overlay` on effects). Flags
  written by *other* modules onto an item do not survive creation through the wizard. This is a
  deliberate, recorded trade-off.

## Accepted residuals (best-effort commit model)

- **Commit is best-effort, not exactly-once.** A top-level actor create with a kept id is an
  **upsert**; there is no atomic, exactly-once, or never-overwrite guarantee. **Worst case is a
  duplicate character the GM deletes — never a lost or corrupted build.**
- **Cross-GM duplication.** With multiple GMs online, both the **start** notice and the **finish**
  record can be posted more than once. This is by design (each GM authenticates independently); the
  `pcWizardCommit` stamp lets you collapse duplicates.

---

## Owner hand-off / flag-back

Decisions and follow-ups the owner should be aware of:

1. **Q-2 — `2k_credits` grants 2500** (not 2000), ported verbatim from the legacy table (Stage 7).
2. **Sources-panel placement** — design default: a header-button overlay (not a tab).
3. **GM-absent flow** — design default: the wizard **opens** without a GM online; a "No GM" notice
   appears at review/commit.
4. **Fork release endpoints still point upstream** — `system.json` `url` / `manifest` / `download`
   (≈ lines 92–94) reference `StarWarsFoundryVTT/StarWarsFFG`. Repoint before any fork release.
5. **One draft slot per user** in v1 (no multiple named drafts).
6. **Warnings dialog** — no "don't ask again" in v1; Create is never blocked, only warned (D4).
7. **Draft-size budget** — **≤ 64 KiB (65 536 UTF-8 bytes)**, owner-confirmed. A normal draft is well
   within it; a maximum-content draft that exceeds it is compacted by the **uuid-only-ref fallback**
   (compendium-resolvable items reduced to a uuid, rehydrated on resume). Both are asserted in the
   Node tier. The **≤ 150 ms median `setFlag` latency** half is a Stage 23 live measurement.
8. **Legacy lint debt (DEV-7, unchanged baselines).** Per-file, do-not-clean: `actor-ffg.js` 0e/8w,
   `item-helpers.js` 2e/4w, `actor-helpers.js` 1e/4w, `partial-templates.js` 0e/0w,
   `swffg-main.js` 7e/26w, `character-creator.js` (now the shim) 0e/0w. Repo-wide ceiling after the
   cutover: **86 errors / 490 warnings** (down from 97/511).
9. **Cypress + the DEV-9 guard** — the fail-closed `baseUrl` guard is committed and copied into any
   Path-B worktree; every Cypress invocation obeys the ordering invariant. The e2e specs themselves
   fail in setup (tracked as #30) and are inert until repaired. Decide: upstream the guard, keep it
   fork-local, or rework it.
10. **`modules/package.json` (DEV-11)** — the `{"type":"module"}` ESM boundary for the Node tier;
    keep, or narrow to a `modules/char-creator/` scope.
11. **The §0.2 trade** — Stages 2–17 were committed with only static verification; GATE-CUTOVER-BOOT
    (passed) proved the system runs; build correctness is still Stage 23.
12. **The injected seams (DEV-15/DEV-16).** `getActorCreationDefaults` / `applyCharacteristicDeltas`
    / `materializeTreePurchases` / `toItemData` are injected because their home modules are
    Node-unimportable ("poisoned"). If that chain is ever fully untangled, the injections could
    collapse back into plain imports.
13. **Deliberately NOT built** — a server-arbitrated exactly-once commit (a GM-owned ledger), and a
    keyed-object `xpLog` refactor (out of scope per D10). The current `xpLog` array shape is unchanged.
