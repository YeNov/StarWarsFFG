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
   "Allow starting skills above rank 2 (maximum rank 5)". The token image only survives when a GM
   presses Create: a player's request is stripped to name, portrait, system data and items, so the
   prototype token keeps the portrait and has to be set afterwards.
2. **Background** — culture, hook, and (Force and Destiny only) Force attitude.
3. **Starting Bonus** — the **Ruleset** (Force and Destiny / Age of Rebellion / Edge of the
   Empire, default Force and Destiny) and the per-ruleset starting-bonus choice.
4. **Obligation** — obligation / duty / morality entries for the ruleset.
5. **Species**.
6. **Career**.
7. **Specialization**.
8. **XP Spend** — four views: **Characteristics**, **Bonus skills**, **Buy skills** and
   **Talents**. **Bonus skills** is where the free career and specialization ranks are claimed;
   they are not on the Career tab, and a player who skips it can spend XP on ranks they would have
   had for free. The starting specialization is chosen on the Specialization tab; the wizard has no
   extra-specialization purchase.
9. **Force Power** — hidden unless the character has a Force rating.
10. **Inventory** — credit purchases, with filters (below).
11. **Motivation**.
12. **Review** — completeness checks, warnings, and the **Create character** button.

The header shows a running summary (species / career / specialization, XP, credits, and the active
obligation value) and the **Content sources** button. The character is built in memory as you go;
no actor exists in the world until you press **Create character**.

## Content sources panel

**Content sources** (header) lists, for each pool, the compendia configured in the settings above,
plus **World items**. It is a filter, not a way to add content: a pack the GM hasn't put in the
matching setting can't be switched on here. Compendia are **on** by default; **World items is off**
by default. Turning a compendium off is stored per user as an exclusion, so a pack the GM adds to
the settings later starts out on.

If you disable the source of something you had already selected, the selection stays in your draft
with a note; it is not silently dropped.

## Inventory filters

**Weapons** / **Armor** / **Gear** buttons, a name search, **Min** and **Max** price, and
**Reset**. Attachments aren't a category: buy the item first, then use the wrench on it, which
lists the attachments that fit (with a **Show only available** toggle).

The GM's **Max Rarity** and **Allow Restricted Items** limits are applied when the pool loads, so
gear the GM has ruled out never appears and there is no player-facing toggle for it.

## Drafts — resume and discard

Your in-progress character is saved as a **draft** on your user (one slot per user). Reopening the
wizard offers **Resume draft** or **Discard draft**. On resume, each selection is refreshed from its
source where possible; anything that can no longer be found is kept as-is with a warning. Drafts
from a newer version, or ones that can't be read, are never resumed; you're offered a discard
instead.

**Two exceptions.**

- A draft that would exceed the size budget is compacted: items that can be found again in a
  compendium are stored as a reference only, and re-read on resume. If such a pack is deleted or
  rebuilt in between — an OggDude re-import with **Delete Existing Compendiums** does exactly that
  — those selections come back empty, and creating from them can fail. Tell players to finish a
  draft before you rebuild the compendia.
- Edits made to a purchased item inside the wizard are not part of the draft. A resumed draft
  re-reads gear from its compendium, so an attachment's activated modifications come back inactive,
  with no warning. Re-apply them after resuming, or finish the build in one sitting.

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
- **Multiple GMs online.** Only the **active GM** handles a player's request, and both notices are
  de-duplicated, so one submission is one notice and one actor. If you do see a duplicate actor,
  compare the `pcWizardCommit` stamps.

## Known limitations

- **Other modules' flags on items are dropped.** The wizard normalizes each item and keeps only the
  `starwarsffg` flag scope (plus `flags.core.overlay` on effects). This is deliberate.
- **Create is best-effort, not exactly-once.** The worst case is a duplicate character the GM
  deletes, never a lost or corrupted build.
