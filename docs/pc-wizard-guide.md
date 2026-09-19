# PC Wizard — user & GM guide

The **PC Wizard** is the guided character-creation flow. Open it with the **PC Wizard** button
(magic-wand icon) in the Actors directory header. Every user sees the button; players do **not**
need Foundry's "Create New Actors" permission to use it.

## GM setup — giving the wizard content

The wizard ships with no content. Each pool (species, careers, …) reads a list of compendium IDs
from a world setting and keeps only items of the matching type. The default IDs are exactly the
packs the **OggDude Dataset Importer** creates, so for most tables setup is:

1. **Import the OggDude dataset.** Compendium sidebar → footer **Importers** → **OggDude Dataset
   Importer**. Pick or upload the dataset `.zip` → **Load File** → **Select All** → **Start Import**.
   This creates `world.oggdude*` packs in an "OggDude Import" compendium folder.
2. **Check the pack settings.** Game Settings → System Settings → **XP Spending** → **Configure XP
   Spending**. The settings are comma-separated compendium IDs with no spaces:

   | Wizard pool | Setting | Default |
   |---|---|---|
   | Species | Species Compendiums | `world.oggdudespecies` |
   | Careers | Career Compendiums | `world.oggdudecareers` |
   | Specializations | Specialization Compendiums | `world.oggdudespecializations` |
   | Force powers | Force Power Compendiums | `world.oggdudeforcepowers` |
   | Background (culture, hook, Force attitude) | Background Compendiums | `world.oggdudebackgrounds` |
   | Obligation / Duty / Morality | Obligation Compendiums | `world.oggdudeobligations` |
   | Motivations | Motivation Compendiums | `world.oggdudemotivations` |
   | Gear | Item Compendiums | weapons, armour, gear, attachment and mod packs |
   | Skill hover hints | Skill Description Compendiums | `world.oggdudeskilldescriptions` |

   Only change these to add homebrew packs. Talent Compendiums is not used by the wizard, because
   talents come from each specialization's tree. It *is* used by the Hyperdrive importer instead, so add
   `world.oggdudetalents` there if you use Hyperdrive.
3. **Set the gear gates and starting values** in the same menu:
   - **Max Rarity** (default 6) and **Allow Restricted Items** (default off) filter the Gear tab.
   - **Default Starting Credits** (500).
   - **Default Obligation / Duty / Morality** (20 / 20 / 50).

   There is no starting-XP setting. Starting XP comes from the chosen **species** item.
4. **Give players access.** Players need at least read (Limited/Observer) permission on the
   configured compendia, because the wizard loads them on the player's own client.
5. **Be online when players finish.** A player's **Create character** is carried out by the active
   GM's client. See [What happens on Create](#what-happens-on-create).

### Homebrew content rules

- A **species** needs a starting XP value, or the character starts with 0 XP.
- A **career** must list its specializations. In-career specializations are matched by name
  against that list.
- Items in the **Items sidebar** (world items) are **not** offered by default. Each user has to
  turn on **World items** for that pool in the Content sources panel (below). To make world items
  available to everyone without that step, put it in a compendium and add the compendium to the
  setting.

### Missing packs

If a setting is empty or names a pack that doesn't exist in the world, opening the wizard shows
**Missing PC Wizard content sources** with a **Proceed** button. The wizard still works, but those
sources are skipped. It's usually a sign that the OggDude import hasn't been run in this world.

## The tab flow

The wizard opens on **General** and has twelve tabs:

1. **General** — name, portrait and token image URLs, **Extra XP** / **Extra credits**, and
   "Allow starting skills above rank 2 (maximum rank 5)".
2. **Background** — culture, hook, and (Force and Destiny only) Force attitude.
3. **Starting Bonus** — the **Ruleset** (Force and Destiny / Age of Rebellion / Edge of the
   Empire, default Force and Destiny) and the per-ruleset starting-bonus choice.
4. **Obligation** — obligation / duty / morality entries for the ruleset.
5. **Species**.
6. **Career** — plus the free career skill ranks.
7. **Specialization**.
8. **XP Spend** — characteristics, skill ranks, talents, extra specializations.
9. **Force Power** — hidden unless the character has a Force rating.
10. **Inventory** — credit purchases, with filters (below).
11. **Motivation**.
12. **Review** — completeness checks, warnings, and the **Create character** button.

The header shows a running summary (species / career / specialization, XP, credits, and the active
obligation value) and the **Content sources** button. The character is built in memory as you go;
no actor exists in the world until you press **Create character**.

## Content sources panel

**Content sources** (header) opens a list of every compendium, plus **World items**, that can feed
each pool. Compendia are **on** by default; **World items is off** by default. Turning a
compendium off is stored per user as an exclusion, so a pack the GM adds later starts out on.

If you disable the source of something you had already selected, the selection stays in your draft
with a note; it is not silently dropped.

## Inventory filters

Text search, min/max price, "max rarity up to N" (capped by the GM's **Max Rarity**), a
restricted-item toggle (shown only when the GM allows restricted items), five category chips
(weapon / armour / gear / attachment / modification), and clear-filters. The GM's rarity and
restricted limits are applied when the pool loads; players can't reveal hidden items.

## Drafts — resume and discard

Your in-progress character is saved as a **draft** on your user (one slot per user). Reopening the
wizard offers **Resume draft** or **Discard draft**. On resume, each selection is refreshed from its
source where possible; anything that can no longer be found is kept as-is with a warning. Drafts
from a newer version, or ones that can't be read, are never resumed; you're offered a discard
instead.

## What happens on Create

- **Warnings don't block.** If the Review tab has warnings, a dialog lets you create anyway or go
  back.
- **GM presses Create:** the actor is created on the GM's client.
- **Player presses Create:** the request is sent to the **active GM**, whose client creates the
  actor with that player as **Owner**. The GM and the player get a whispered chat link, and the new
  sheet opens.
- **No GM online:** the wizard opens and works normally, but Create waits about 15 seconds and then
  shows "Submitting… — not confirmed". The draft is kept; press Create again once a GM is online.

## For the GM — the chat trail

The wizard whispers the GMs a **start** notice when a player opens it, and a **finish** record with
a clickable link when a character is created. Both are informational.

### When something looks wrong | Troubleshooting

- **"A player started but I never saw a finish record."** The submission didn't complete (often:
  no GM was online). Ask the player to press **Create character** again. The draft is intact, and a
  retry reuses the same commit identity.
- **"I see the finish record, but the player can't see the character."** The actor exists. Have
  the player **reconnect or refresh**. Don't re-create it; that risks a duplicate.
- **Telling duplicates apart.** Every wizard-created actor has a `flags.starwarsffg.pcWizardCommit`
  stamp (`{commitId, userId, xp, date}`). Two actors with the **same** `commitId` are duplicates of
  one submission: keep one, delete the other. Different `commitId`s are separate attempts.
- **Multiple GMs online.** The start notice and finish record can be posted more than once, once
  per GM. The `pcWizardCommit` stamp tells you whether there is really more than one actor.

## Known limitations

- **Other modules' flags on items are dropped.** The wizard normalizes each item and keeps only the
  `starwarsffg` flag scope (plus `flags.core.overlay` on effects). This is deliberate.
- **Create is best-effort, not exactly-once.** The worst case is a duplicate character the GM
  deletes, never a lost or corrupted build.

---

## Owner hand-off / flag-back

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
