# PC Wizard rewrite — maintainer hand-off

Moved out of `docs/pc-wizard-guide.md` on 2026-09-19. These are the rewrite's (July 2026)
decisions and follow-ups for the repo maintainer; they are not user documentation.


Decisions and follow-ups the owner should be aware of:

1. **Q-2 — `2k_credits` grants 2500** (not 2000), ported verbatim from the legacy table (Stage 7).
2. **Sources-panel placement** — design default: a header-button overlay (not a tab).
3. **GM-absent flow** — the wizard **opens** without a GM online. The planned "No GM" notice
   (`SWFFG.CharacterCreator.Notify.NoGm`) is **not wired up**; the player only sees the
   "Submitting… — not confirmed" state after the timeout.
4. **Fork release endpoints** — `system.json` `url` / `manifest` / `download` now point at
   `YeNov/StarWarsFFG`. Resolved.
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
