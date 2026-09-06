# Merging duplicate talents into ranks

**Date:** 2026-09-06
**Status:** approved, ready for an implementation plan

## Problem

A ranked talent added to an actor more than once is stored as several embedded
talent items with the same name, instead of one item whose
`system.ranks.current` goes up.

Live evidence — actor Nyxara (`oegLCkSYQ8DGLsZZ`) carries two `Precise Aim`
items: `y7Z07Qzy8lE0jFlM` (`system.tier` 2, `ranks.current` 1) and
`tObiPHSlp6aJxGiK` (`system.tier` 1, `ranks.current` 1).

The sheets hide this: `ActorFFG#_prepareCharacterData` merges same-named ranked
talents into one `talentList` entry and sums their ranks, so the card reads
"Precise Aim 2". The items underneath stay separate and drift apart — their
`tier` fields already disagree, which is what broke Codex tier grouping (fixed
separately in `modules/actors/codex-talent-tiers.js`, commit `649cdb95`, by
letting the most recently edited copy decide).

Consequences of the duplication:

- editing a talent (tier, description, activation, modifiers) changes one copy
  and leaves the others stale;
- the copies are separate documents in the Items tab and in exports;
- nothing keeps their data consistent.

## Goals

1. Adding a ranked talent an actor already has increases the existing item's
   rank instead of creating a second item — on every add path.
2. Adding a non-ranked talent an actor already has is refused, with a
   notification.
3. Removing ranks (XP refund, species removal) takes back exactly what was
   added, deleting the item only when its rank reaches zero.
4. Actors that already carry duplicates can be repaired on demand by a GM.

## Non-goals

- Merging talents across actors, or in compendia and the world Items directory.
- Changing how `talentList` is built, or how the sheets display talents.
- Changing XP costs. The buy dialog already prices the next rank correctly
  (`actor-sheet-ffg.js`: `worldItem.system.tier * 5 + 5 * purchasedItem.rank`);
  only the storage is wrong.
- Reconciling anything other than talents (abilities, gear, force powers).

## Decisions taken

| Question | Decision |
| --- | --- |
| Which duplicates merge? | **All of them**, including species-granted copies. |
| Non-ranked talent already present? | **Refuse** the second copy with a warning. |
| Existing actors | **GM helper with a dry run**, not an automatic migration. |

## Design

### 1. Interception point

`ItemFFG._preCreate` (`modules/items/item-ffg.js:36`) already runs exactly once,
on the initiating client only — the property the effect-planning code there
depends on. It gains a talent branch:

```
if type === "talent" and parent is an Actor:
    existing = actor's talent item with the same (trimmed) name
    if no existing            -> proceed as today
    if existing not ranked    -> warn, return false (cancel)
    else                      -> add the incoming ranks to existing, return false
```

`return false` cancels the creation in Foundry v11+, so no second item appears.
"Incoming ranks" is `system.ranks.current` of the item being created, floored at
1 for a ranked talent.

This one point covers the XP buy path, drag-and-drop, compendium drops, the
species grant hook, the adversary importer, and any macro or module that creates
a talent on an actor. No add site has to be edited to get the merge — only to
get its *bookkeeping* right (§3).

Name matching is case-sensitive on the trimmed name. `talentList` merges on the
raw name (`obj.name === item.name`), so this matches everything the sheet
already merges, plus names that differ only by surrounding whitespace.

### 2. Batch creates

Two copies of the same *new* talent inside one `createEmbeddedDocuments` call
each see an actor that does not have it yet, so `_preCreate` would let both
through. `ActorFFG._preCreateDescendantDocuments` (parent, collection, data[],
options, userId) collapses same-name talents within the incoming batch first:
the first entry keeps the summed rank, the rest are dropped from the array.
Per-item `_preCreate` then merges what remains against the actor.

### 3. Provenance

Merging species grants means one item's rank can be part bought, part granted.
The talent item records who contributed what:

```
flags.starwarsffg.grantedRanks = { <grantingItemId>: <ranks> }
```

Written whenever a grantor supplies ranks - both when they are folded into an
existing item and when the grant creates the item - and read when a grant is
withdrawn. A talent bought with XP records nothing here; its ranks are accounted
for by the XP log's undo descriptors instead (§4). The existing
`flags.starwarsffg.fromSpecies` boolean stays as it is — `ActorFFG` uses it for
the talent's source label.

### 4. Removal mirrors addition

Both current removal paths delete the whole item, which after merging would
discard ranks nobody gave back.

**XP refund** (`modules/actors/actor-sheet-ffg.js:2150`, planned by
`modules/helpers/xp-refund.js`). A purchase that incremented an existing item
logs a new undo descriptor:

```
{ type: "talent-rank", itemId: <existing item id>, ranks: 1 }
```

`resolveRefundTarget` resolves it to `{kind: "talent-rank", itemId, ranks, cost}`;
the refund decrements `system.ranks.current` and deletes the item only when the
result is 0. Purchases that created a fresh item keep logging
`{type: "item", itemId}` and keep deleting, so every entry already in an actor's
XP log means exactly what it meant before.

**Species removal** (`modules/swffg-main.js:2050`) currently deletes
`actor.items.find(i => i.name === speciesTalent.name && i.type === "talent")` —
by name, with no provenance check, so it already deletes a *bought* talent that
happens to share the species talent's name. It becomes: give back
`grantedRanks[<species item id>]` ranks (default 1 when the flag is absent, which
is what a pre-repair actor looks like), deleting only at 0. This fixes that bug
as a side effect.

### 5. Repair helper

`game.starwarsffg.repairDuplicateTalents({dryRun = false} = {})`, registered in
`swffg-main.js` beside `repairModifierEffects` and `repairCareerSkillEffects`,
and implemented next to them. For every actor the current user can update:

- group talent items by trimmed name;
- for each group of two or more: keep the oldest copy (lowest
  `_stats.createdTime`, falling back to document order), set its rank to the sum
  of the group's ranks, take the highest `system.tier` in the group, merge each
  member's `flags.starwarsffg.grantedRanks`, and delete the rest;
- a group where any member is non-ranked is reported but left alone — summing
  ranks on a talent that has none would invent data. The GM decides.

Returns and logs a report: `{scanned, actors: [{actor, merged: [{name, from, to}]}], skipped}`.
`dryRun: true` computes and reports without writing.

Active Effects need no repair: a ranked talent's numeric modifiers are scaled at
application time by `ModifierHelpers.rankMultiplier` (`modules/helpers/modifiers.js:651`),
so one item at rank 2 grants exactly what two items at rank 1 granted.

### 6. New module

`modules/helpers/talent-stacking.js`, pure (no Foundry globals), holding the
decisions so they can be unit-tested and reused by all four call sites:

- `planTalentGrant(existingTalents, incoming)` →
  `{action: "create"}` | `{action: "increment", itemId, ranks, total}` | `{action: "refuse", reason: "not-ranked", itemId}`
- `collapseTalentBatch(dataArray)` → the batch with same-name talents folded together
- `planTalentRevoke(talent, ranks)` → `{action: "decrement", total}` | `{action: "delete"}`
- `planDuplicateRepair(talentItems)` → `{keep, rank, tier, grantedRanks, delete: [ids]}` | `null`

The Foundry-side wiring (`_preCreate`, `_preCreateDescendantDocuments`, the
refund branch, the species hook, the repair helper) stays thin enough to read at
a glance.

## Data flow

```
create a talent on an actor
  └─ ActorFFG._preCreateDescendantDocuments  → collapseTalentBatch
       └─ ItemFFG._preCreate                 → planTalentGrant
            ├─ create   → normal creation (effects planned as today)
            ├─ increment→ existing.update(ranks + grantedRanks), cancel
            └─ refuse   → warn, cancel

remove ranks
  ├─ XP refund      → resolveRefundTarget → planTalentRevoke → decrement or delete
  └─ species delete → grantedRanks[speciesId] → planTalentRevoke → decrement or delete
```

## Error handling

- A talent whose `ranks.current` is `null` or absent counts as 1 incoming rank
  (`rankMultiplier` already treats a cleared rank as 1 rather than 0).
- An increment that fails to write leaves the create cancelled; the failure is
  reported through `ui.notifications.error` and logged, and no partial item is
  left behind.
- A refund whose target item is already gone falls back to today's behaviour:
  warn, and give the XP back anyway.
- `repairDuplicateTalents` skips actors the user cannot update, and reports them.

## Testing

Node tests (`tests/node/talent-stacking.test.mjs`), covering:

- create / increment / refuse for ranked and non-ranked talents, absent and
  cleared ranks, name trimming;
- batch collapse for two new copies, and for a copy the actor already has;
- revoke: decrement, delete at zero, revoke of more ranks than the item holds;
- repair planning: rank sum, highest tier kept, oldest copy kept, `grantedRanks`
  merged, non-ranked group skipped, single-copy group produces no plan.

Extended `tests/node/xp-refund.test.mjs`: the new `talent-rank` descriptor
resolves, and an old `item` descriptor still resolves to a delete.

Live verification by the user: buy a ranked talent twice on Nyxara (one item at
rank 2), refund one rank (back to rank 1, item kept), drop a duplicate from a
compendium (rank goes up), add and remove a species that grants a talent the
character bought (its bought ranks survive), and run
`repairDuplicateTalents({dryRun: true})` then for real on the existing
`Precise Aim` pair.

## Risks

- **A module or macro that deliberately creates two copies** of one talent stops
  being able to. That is the point of the change, and the warning says so.
- **Merging a species grant into a bought item** makes the item's identity
  partly species-owned. `grantedRanks` is what keeps that reversible; an actor
  repaired before ever having a species grant simply has no flag, and removal
  falls back to one rank.
- **Name-based matching** merges two genuinely different talents that share a
  name. `talentList` already merges them for display, so this only aligns the
  storage with what the sheet has always shown.
