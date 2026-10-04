# Parry and Reflect in Apply Damage: design

**Date:** 2026-10-04
**Branch:** `feature/parry-reflect-apply-damage`
**Builds on:** [Apply Damage chat button](2026-05-24-apply-damage-chat-button-design.md)

## Problem

Parry and Reflect are the commonest damage-reducing talents in the game, and Apply Damage
ignores them. When a target with Parry is hit in melee, whoever applies the damage has to
remember the talent, reduce the damage by hand, apply it, and then add the 3 strain by hand on
the target's sheet. A table that plays with the reSpecialized fan ruleset has different numbers
for the same idea.

## Goal

When the targeted actor holds a damage-reducing talent that fits the attack, the Apply Damage
dialog offers one toggle (**Apply Parry** for melee, **Apply Reflect** for ranged). Turning it
on reduces the hit before soak, and Apply writes both the reduced damage and the strain cost in
a single update. The toggle never reveals the talent's ranks or the size of the reduction. It
is greyed out when paying the cost would incapacitate the target.

A world setting chooses between the vanilla rules and the reSpecialized rules. The GM can edit
which talent names count as melee and as ranged damage reduction.

## Rules

### Vanilla (Edge of the Empire, Age of Rebellion, Force and Destiny)

> **Parry:** When hit by a melee attack, suffer 3 strain to reduce damage by 2 plus ranks in Parry.
> **Reflect:** When hit by a ranged attack, suffer 3 strain to reduce damage by 2 plus ranks in Reflect.

The reduction applies after damage is calculated and before soak, once per hit.

- **Supreme Parry / Supreme Reflect:** if the character made no combat check during their
  previous turn, they may suffer 1 strain instead of 3.
- **Unarmed Parry:** the character may Parry while unarmed, and the strain cost while unarmed
  drops by 1, to a minimum of 1.

### reSpecialized

The supported revision is **v.56** ("reSpecialized Project v.56 - The Force Update - Final
Part", 2026-07-06). Its [release
notes](https://forum.swrpgcommunity.com/t/respecialized-project-v-56-the-force-update-final-part/1628)
name Block and Deflect as the replacements for Parry and Reflect. The rules below were checked
against the talent text itself, in the reSpecialized design documents for the trees that carry
them. The implementation plan's Task 0 lists every source and what each one settled.

> **Block:** When hit by a melee attack, suffer 3 strain to reduce damage by 4.
> **Deflect:** When hit by a ranged attack, suffer 3 strain to reduce damage by 4.

Both are active incidentals with no ranks. Each applies after damage is calculated and before
soak, once per hit, while the character wields a suitable weapon or item at the GM's discretion
(for Deflect, a lightsaber counts only if the character is Force-sensitive). As in vanilla, the
system does not check the weapon.

- **Unarmed Block** (Martial Artist, Pit Fighter): the character may Block while unarmed, and
  the strain cost while unarmed drops by 1, to a minimum of 1. That is Unarmed Parry's effect
  under Block's name, so both names share the unarmed cost modifier.
- **Improved Unarmed Block** lets the character disarm an engaged attacker whose check
  generates threat or despair. It changes neither the reduction nor the cost, so no list
  includes it; like Improved Parry, it is out of scope.
- No source names a Supreme Block, a Supreme Deflect or an unarmed Deflect. The Supreme lists
  keep only the vanilla names.

reSpecialized removes Parry and Reflect from its trees rather than redefining them: Martial
Artist 1.5 swaps both ranks of Parry for Block and Unyielding, Pit Fighter 1.11 swaps its
Parry and Unarmed Parry for Block, Unarmed Block and Improved Unarmed Block, and the Arbiter
tree lists Parry and Reflect as replaced by Block and Deflect. A character built before the swap
may still hold the old names, so in a reSpecialized world **Parry works as Block and Reflect
works as Deflect**. Those aliases are this system's convention, not a reSpecialized rule.
Supreme Parry, Supreme Reflect and Unarmed Parry keep their vanilla cost effects in both modes.

Block's text is the same in the v.56 Martial Artist and Pit Fighter documents and in the later
Arbiter document. No v.56 tree adds Deflect, so its text was checked in the Arbiter design
document (Arbiter 1.0, released in v.58), the earliest released tree that carries it. The
Force & Destiny Primer that the v.56 notes link could not be read; see Task 0.

## Settings

A new **Parry & Reflect** settings menu (`defensiveTalentSettings`), registered next to
Combat settings with `restricted: true`. Every setting in it is `scope: "world"` and
`config: false`, so only a GM sees and changes it.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `defensiveTalentRuleset` | choice | `vanilla` | `vanilla` or `respecialized` |
| `meleeDefenceTalents` | string | `Parry, Block` | talents that reduce a melee hit |
| `rangedDefenceTalents` | string | `Reflect, Deflect` | talents that reduce a ranged hit |
| `meleeSupremeTalents` | string | `Parry (Supreme), Supreme Parry` | let a melee reduction cost 1 strain |
| `rangedSupremeTalents` | string | `Reflect (Supreme), Supreme Reflect` | let a ranged reduction cost 1 strain |
| `unarmedParryTalents` | string | `Unarmed Parry, Unarmed Block` | cut a melee reduction's cost by 1 |

A name list is split on commas. Each name is trimmed and compared whole and case-insensitively
against the target's talent names, so `Parry` never matches `Parry (Improved)` and
`Unarmed Block` never matches `Improved Unarmed Block`. An empty list turns that row off. The
defaults cover the OggDude import names (`Parry (Supreme)`), the book names (`Supreme Parry`)
and the reSpecialized v.56 names (`Block`, `Deflect`, `Unarmed Block`).

`Unarmed Block` sits in `unarmedParryTalents` because its verified effect is Unarmed Parry's
cost modifier. reSpecialized publishes no Supreme variant, so the Supreme lists hold the
vanilla names only, and `Improved Unarmed Block` is in no list.

## Behavior

### Which talent applies

1. **Attack type** comes from the weapon skill on the chat-embedded item
   (`message.rolls[0].data.system.skill.value`), using the lists that
   [defence-helpers.js](../../../modules/helpers/defence-helpers.js) already uses for defence dice:
   - `MELEE_DEFENCE_SKILLS` (Melee, Brawl, Lightsaber) → **melee**
   - `RANGED_DEFENCE_SKILLS` (Ranged: Light, Ranged: Heavy, Gunnery) → **ranged**
   - anything else (a custom skill) → no toggle.
2. **Target type:** characters, nemeses and rivals. Minions and vehicles never get a toggle.
   Minions cannot voluntarily suffer strain to activate a talent; converting inflicted strain
   to wounds does not allow it ([Under a Black Sun, page 11](https://images-cdn.fantasyflightgames.com/filer_public/18/ff/18ff8afe-bf19-47a3-97e5-a313ded3d6b3/under_a_black_sun_lores.pdf#page=11)).
   This feature adds no minion house-rule override in either mode; ordinary damage to minions
   is unchanged.
3. **Talents** are read from `actor.talentList`. `ActorFFG` builds it for each supported type, and it
   merges talents from specialization trees, standalone talent items, species grants and
   attachment "Innate Talent" modifiers. It is the same total the sheet shows.
4. The toggle appears when at least one talent in the category's list is present.

### Reduction

- **Vanilla:** `2 + ranks`. Ranks are summed over every matching entry in `talentList`. An
  unranked entry (rank `"N/A"`) counts as 1 rank.
- **reSpecialized:** a flat `4`, whichever matching talent is present and however many ranks it has.

The reduction comes off the damage before soak:

```
reduced = max(0, damage - reduction)
applied = max(0, reduced - effectiveSoak)
```

`effectiveSoak`, Pierce, Breach, Beskar and Cortosis behave exactly as they do today.

### Cost

| Selected | Cost |
|---|---|
| neither | 3 |
| Supreme | 1 |
| Unarmed (melee only) | 2 |
| Supreme and Unarmed | 1 |

Unarmed is `max(1, cost - 1)` applied after Supreme. **Characters and nemeses** pay the cost
in strain (`system.stats.strain.value`). **Rivals** have no strain pool, so they pay it in
wounds (`system.stats.wounds.value`). Minions cannot activate these talents.

### Incapacitation

Paying a cost would incapacitate the target when `current + cost > threshold`. For characters
and nemeses, current and threshold are `strain.value` and `strain.max`. For rivals they are
`wounds.value` and `wounds.max`. Reaching the threshold exactly is allowed, because the rules incapacitate only when
the threshold is *exceeded*. A threshold that is not a positive number is treated as unknown
and never disables anything.

Only the cost counts, not the hit itself.

- An unselected **talent toggle** is greyed out (`disabled`, no tooltip) when even the cheapest cost
  available to this target would incapacitate it. The cheapest cost is 1 with Supreme, 2 with
  Unarmed alone, and 3 otherwise.
- When the toggle is on and the cost currently selected would incapacitate the target (for
  example 3 strain is too much but Supreme's 1 is not), the dialog's **Apply** button is greyed
  out until the selection is cheap enough or the toggle is turned off. The dialog never selects
  Supreme by itself, because only the table knows whether the target made a combat check last turn.
- A selected talent stays selected when its cost becomes unaffordable. Apply is disabled;
  the main toggle stays enabled so the user can turn it off explicitly. Refresh never clears
  the choice or silently changes the application to ordinary damage.

The dialog re-reads the target's cost pool and threshold on each toggle change and immediately
before submitting. These checks guide the UI; the authoritative check runs inside the elected
writer's per-actor queue, immediately before the update, using that writer's live actor values.
It checks the selected talent cost alone, even when the cost and hit are merged into one delta.
For example, two dialogs opened at 7/10 strain may both offer a 3-strain Parry: the first queued
application reaches 10/10, and the second must be refused.

If the cost is no longer affordable, reject the entire application with an `ApplyRequestError`.
Write neither damage nor cost, post neither chat message, and show a localized warning that the
target can no longer pay the selected cost. The user can reopen Apply Damage and choose again;
the system never substitutes a cheaper modifier or applies the hit without the selected talent.

### Dialog

Below Damage and Pierce, only when a talent applies:

```
[ ⦿ Wounds   ○ Strain ]

Damage:  [  9 ]
Pierce:  [  2 ]

[ 🛡 Apply Parry ]           toggle (aria-pressed)
    [ Supreme: 1 strain ]    shown when the target has a Supreme talent for this category
    [ Unarmed: −1 strain ]   melee only, shown when the target has Unarmed Parry or Unarmed Block
    Costs 3 strain           "wounds" for rivals; follows the toggles

        [ Apply ]   [ Cancel ]
```

- The toggle reads **Apply Parry** / **Apply Reflect** in vanilla and **Apply Block** /
  **Apply Deflect** in reSpecialized.
- The Supreme and Unarmed toggles and the cost line appear only while the main toggle is on.
  Their wording follows the cost pool: "1 wound" and "−1 wound" for rivals.
- **Neither the ranks nor the reduction is ever shown in the dialog.** This holds for the GM as
  well. The GM gets the numbers in the whisper.
- The rest of the dialog is unchanged.

### Chat

- **Public line:** unchanged, plus a second paragraph when the talent was used:
  "{actorName} parries." (melee) or "{actorName} deflects." (ranged), in both rulesets. It
  carries no cost and no numbers.
- **GM whisper:** unchanged, with its damage and soak figures computed on the reduced damage,
  plus one line naming the matched talent, the reduction and how it was reached, and the cost.
  For example: "Parry: −4 damage (2 + 2 ranks); 1 strain, Supreme." Modifier names describe
  Supreme and Unarmed actually selected for this application, not talents merely possessed.
  In reSpecialized the explanation reads "flat 4".

### Write

The damage and the cost go to the target in **one** `actor.update`, through the existing
[GM bridge](../../../modules/helpers/gm-bridge.js) queue. A hit therefore never lands without
its cost being paid, and the cost is never paid without the hit landing.

The `damage` request gains an optional `changes` form:

```js
{
  type: "damage",
  changes: [{ path, delta }, { path, delta }],
  defenceCost: { path: costPath, delta: cost },
  gmChat,
}
```

- One or two entries. Each `path` must be in `DAMAGE_PATHS` and each `delta` a finite number,
  under the same rules the single form already enforces. Duplicate paths are refused.
- When the damage pool and the cost pool are the same path (strain damage on a character, or
  any hit on a rival), the planner merges them into one entry before sending.
- A talent application also carries `defenceCost`, preserving the cost separately from a
  merged hit. Its path must be the target type's cost pool, its delta an integer from 1 to 3,
  and the corresponding `changes` entry must include at least that delta. The writer derives
  the threshold from the live actor; no current value or threshold is trusted from the sender.
  Validate the new form and its cost metadata on every execution path, including local and
  forwarded owner requests, which currently bypass `narrowApplyRequest`.
- The legacy `{ path, delta }` form is still accepted. **Apply Damage keeps sending it whenever
  no talent is used**, so a GM still on the old code can apply ordinary damage without trouble.

Before sending a talent application, require a positive `defensive-damage-v1` capability
response from the currently elected writer (the active GM, or the elected owner without a GM).
This capability means support for both the `changes` form and queued affordability validation.
A separate read-only socket probe carries a request id and the selected writer id; accept its
reply only from that writer's authenticated socket sender and for that request. A local writer
checks its own capability directly. An old writer ignores the probe; after 5 seconds without a
positive reply, refuse locally with a localized reload warning and send no mutation or chat.

Capability responses are tied to the writer's current session and are not cached across
applications. Re-elect after every probe result, including timeout or refusal. If the elected
writer changes before dispatch, discard the result and probe the replacement, within the
coordinator's bounded attempt limit. Only an unchanged writer that fails to confirm support
gets the reload warning. The coordinator must never reroute a talent application to an unverified
writer. This gate applies to owned and unowned targets alike: an old GM validates unowned
requests, but forwarded owner requests bypass that validation, so the existing error is not a
safe compatibility check.

`performApply` normalizes both forms to a list and reads every current value before writing
them all in a single update. For a talent application, it validates `defenceCost` and checks
affordability against the live actor inside the same queued operation, before any write.

## Module shape

### New: `modules/helpers/defensive-talents.js`

Has no access to Foundry, in the same way as [apply-damage-plan.js](../../../modules/helpers/apply-damage-plan.js):
no `game`, `ui`, `ChatMessage`, `foundry.*` or settings lookups. The dialog reads the settings
and the actor and passes them in. Labels come back as i18n keys.

- `parseTalentNames(text) → string[]`: trimmed, lowercased and deduplicated. Blank entries are dropped.
- `classifyAttack(skillValue) → "melee" | "ranged" | null`
- `planDefensiveTalent({ actor, attack, ruleset, names }) → null | plan`
  - `names` is `{ melee, ranged, meleeSupreme, rangedSupreme, unarmed }`, each already parsed.
  - `plan` is `{ kind: "melee"|"ranged", talentNames, ranks, reduction, formula, hasSupreme,
    hasUnarmed, costPath, costLabelKey, toggleLabelKey, publicKey, current, threshold }`.
- `defenceCost({ supreme, unarmed }) → number`
- `cheapestCost(plan) → number`
- `wouldIncapacitate(plan, cost) → boolean`

### Changed

- **`apply-damage-plan.js`:** `planDamageApplication(actor, target, input)` accepts an optional
  `input.defence = { reduction, cost, costPath }`. It returns the existing fields, with
  `applied` computed on the reduced damage, plus `reduced`, `reduction` and a `changes` array with
  same-path entries merged and `defenceCost: { path: costPath, delta: cost }` preserving the
  separate cost. Without `defence`, it returns exactly what it does today.
- **`apply-damage.js`:** reads the six settings, calls the planner, draws the toggle row, and
  re-reads affordability as the toggles change and on Apply. It sends the single form or the
  guarded `changes` form, handling capability and affordability refusals before posting chat.
- **`gm-bridge.js`:** handles the capability probe; `narrowApplyRequest` accepts and preserves
  the new form and its `defenceCost`. `performApply` validates the new form for all callers,
  checks live affordability inside the queue, and writes both pools in a single update.
- **`actor-apply-coordinator.js`:** verifies the elected writer's capability before dispatching
  a talent application and rechecks if the election changes. A rejected application never
  reaches the GM-whisper step.
- **`modules/swffg-main.js`:** registers the six settings beside `useDefense`.
- **`modules/settings/ui-settings.js`:** a new `defensiveTalentSettings` class, built like
  `combatSettings`.
- **`modules/settings/settings-helpers.js`:** a new `registerMenu` call (`restricted: true`).
- **`lang/en.json`:** new keys under `SWFFG.Settings.DefensiveTalents.*` and
  `SWFFG.ApplyDamage.Defence.*`. Other languages fall back to English.

## Testing

**Node** (`npm test`):

- `tests/node/defensive-talents.test.mjs` (new):
  - name parsing: commas, spaces, case, duplicates, blanks, an empty list
  - whole-name matching: `Parry (Improved)` and `Unarmed Parry` do not count as Parry
  - attack classification for each listed skill, a custom skill and an empty skill
  - vanilla reduction: one rank, several ranks, ranks summed across entries, an unranked entry
  - reSpecialized reduction: a flat 4 for Parry, Block, Reflect and Deflect, whatever the ranks
  - cost: each combination of Supreme and Unarmed, and Unarmed never applied to ranged
  - cost pool: strain for characters and nemeses, wounds for rivals; no talent plan for minions
    or vehicles, in either ruleset
  - incapacitation: just below, at and one over the threshold, an unknown threshold, and a
    target already past its threshold
  - the cheapest cost, which decides whether the toggle is greyed out
  - a selected talent preserved when strain rises and a visible modifier triggers refresh;
    Apply stays blocked until the user explicitly turns the talent off or the cost is affordable
  - a reSpecialized v.56 character holding Block, Deflect, Unarmed Block and Improved Unarmed
    Block: a flat 4 against melee and ranged hits, Unarmed Block's −1 on melee only, no Supreme,
    and Improved Unarmed Block matching nothing; then Parry, Reflect and their Supreme and
    Unarmed modifiers as compatibility aliases in the same world
- `tests/node/apply-damage.test.mjs`: the reduction applied before soak, a reduction larger
  than the damage, merged `changes` on the same path, separate `changes` on different paths,
  the separate cost metadata retained after merging, and identical output when there is no
  `defence`.
- `tests/node/gm-bridge-apply.test.mjs`: the `changes` form accepted, and refused when it is
  empty, has more than two entries, names a path outside `DAMAGE_PATHS`, has a non-finite delta
  or repeats a path. Cost metadata is preserved and rejects an invalid cost pool, a cost outside
  1–3 or a cost missing from the changes. The legacy form still works.
- Writer execution and `tests/node/actor-apply-coordinator.test.mjs`: one actor update writes
  both pools; merged-path affordability checks only the cost. Two queued applications opened
  at 7/10 strain with a 3-strain cost apply only the first, with no write or chat for the second.
  Exercise live threshold changes and rejection on local, forwarded owner and unowned paths.
  Capability tests cover an updated writer, an old writer's probe timeout, and a writer change
  between probe and dispatch, including a silent or refusing writer replaced during its probe.
  Minion talent requests are refused on local, owner and unowned routes, without writes or chat.
  An old writer receives no talent mutation for either owned or
  unowned targets; ordinary legacy damage still works.

**Manual, in Foundry:**

1. A character with Parry 2 is hit in melee (vanilla). The toggle shows with no numbers. Apply
   reduces the hit by 4 and adds 3 strain. The public line says "parries." and the whisper shows the math.
2. The same character is hit by a blaster. There is no toggle. With Reflect it shows **Apply Reflect**.
3. A reSpecialized world, with a character holding Parry 3: the reduction is 4, not 5, and the toggle reads **Apply Block**.
4. A rival with Parry pays 3 wounds, merged with the hit into one write.
5. A character at 8/10 strain: the toggle is greyed out. With Supreme Parry it is enabled, and
   Apply is greyed out until Supreme is selected.
6. Strain damage (the Strain radio) plus a Parry: one write to strain covering both.
7. A player applying to an NPC they don't own goes through the bridge, and the GM whisper is still posted.
8. Edited name lists: a custom talent name is recognized, and clearing a list removes the toggle.
9. Open two dialogs for a character at 7/10 strain and select a 3-strain Parry in both. Apply
   the first, then the second: only the first writes damage and cost or posts chat; the second
   warns that the selected cost is no longer affordable.
10. Keep the elected GM on old code while the applying client runs the new code. A talent
    application to either an owned or unowned target sends no mutation and shows the reload
    warning after the capability probe times out. Ordinary damage still applies. Repeat with
    an old elected owner and no GM, then confirm talent applications work after all reload.
11. Select Parry and Supreme at 7/10 strain, raise strain to 10, then click a visible Unarmed
    modifier. The talent stays selected and Apply is blocked; Enter refuses the application.
    Explicitly turning the talent off allows ordinary damage.
12. A minion with Parry or Reflect gets no talent toggle in either mode; ordinary damage works.
13. Replace a silent or refusing writer during a capability probe. The replacement is probed
    before any talent application is sent, within the bounded attempt limit.
14. A reSpecialized world, with a character holding the v.56 talents Block, Deflect, Unarmed
    Block and Improved Unarmed Block. A melee hit offers **Apply Block**: 4 off the hit for 3
    strain, or 2 with Unarmed. A ranged hit offers **Apply Deflect**: 4 off for 3 strain, with
    no Unarmed or Supreme option. Then give Parry, Reflect, Supreme Parry and Unarmed Parry
    instead and check they behave as Block and Deflect, with Supreme at 1 strain. Record the
    revision tested (v.56).

## Rollout

- **CHANGELOG:** one entry under `Unreleased`, plus a sub-bullet: reload Foundry on every
  connected client so the elected GM or owner supports talent applications. The capability
  check blocks sending them to an old writer; ordinary damage remains available.
- **Wiki:** add the toggle to the damage-and-crits chapter of the tutorial and re-capture its
  Apply Damage screenshot if the dialog appears in it. The new settings menu gets a line in
  the GM setup chapter. The wiki names the supported reSpecialized revision (v.56), the
  **Apply Block** / **Apply Deflect** labels, and Unarmed Block beside Unarmed Parry.

## Non-goals

- The Improved Parry and Improved Reflect counter-hits, and the Djem So Deflection move.
- Checking what the target is wielding. The person applying the damage decides.
- Unarmed Parry's "may Parry while unarmed". That is a permission, and it is already covered
  by not checking weapons.
- Automating "made no combat check last turn" for Supreme. The person applying chooses.
- Vehicles, and any vehicle analogue.
- Minion activation of talents that require voluntarily suffering strain, and a house-rule override.
- Remembering that a hit was parried. The Apply Damage button stays clickable as it is today.
