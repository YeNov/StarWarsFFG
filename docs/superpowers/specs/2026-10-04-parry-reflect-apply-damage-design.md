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

> **Block:** When hit by a melee attack, suffer 3 strain to reduce damage by 4.
> **Deflect:** When hit by a ranged attack, suffer 3 strain to reduce damage by 4.

Both are unranked and apply after damage is calculated and before soak, once per hit.

In a reSpecialized world, **Parry works as Block and Reflect works as Deflect**. The
reSpecialized Martial Artist and Pit Fighter trees still grant a talent called Parry, and the
table treats it as Block. Supreme and Unarmed modify the cost in this mode too.

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
| `unarmedParryTalents` | string | `Unarmed Parry` | cut a melee reduction's cost by 1 |

A name list is split on commas. Each name is trimmed and compared whole and case-insensitively
against the target's talent names, so `Parry` never matches `Parry (Improved)`. An empty list
turns that row off. The defaults cover both the OggDude import names (`Parry (Supreme)`) and the
book names (`Supreme Parry`).

## Behavior

### Which talent applies

1. **Attack type** comes from the weapon skill on the chat-embedded item
   (`message.rolls[0].data.system.skill.value`), using the lists that
   [defence-helpers.js](../../../modules/helpers/defence-helpers.js) already uses for defence dice:
   - `MELEE_DEFENCE_SKILLS` (Melee, Brawl, Lightsaber) → **melee**
   - `RANGED_DEFENCE_SKILLS` (Ranged: Light, Ranged: Heavy, Gunnery) → **ranged**
   - anything else (a custom skill) → no toggle.
2. **Target type:** characters, nemeses, rivals and minions. Vehicles never get a toggle.
3. **Talents** are read from `actor.talentList`. `ActorFFG` builds it for every type above, and it
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
in strain (`system.stats.strain.value`). **Rivals and minions** have no strain, so they pay it in
wounds (`system.stats.wounds.value`), as the rules require.

### Incapacitation

Paying a cost would incapacitate the target when `current + cost > threshold`. For characters
and nemeses, current and threshold are `strain.value` and `strain.max`. For rivals and minions
they are `wounds.value` and `wounds.max`, and for a minion group the threshold is the whole
group's. Reaching the threshold exactly is allowed, because the rules incapacitate only when
the threshold is *exceeded*. A threshold that is not a positive number is treated as unknown
and never disables anything.

Only the cost counts, not the hit itself.

- The **talent toggle** is greyed out (`disabled`, no tooltip) when even the cheapest cost
  available to this target would incapacitate it. The cheapest cost is 1 with Supreme, 2 with
  Unarmed alone, and 3 otherwise.
- When the toggle is on and the cost currently selected would incapacitate the target (for
  example 3 strain is too much but Supreme's 1 is not), the dialog's **Apply** button is greyed
  out until the selection is cheap enough or the toggle is turned off. The dialog never selects
  Supreme by itself, because only the table knows whether the target made a combat check last turn.

### Dialog

Below Damage and Pierce, only when a talent applies:

```
[ ⦿ Wounds   ○ Strain ]

Damage:  [  9 ]
Pierce:  [  2 ]

[ 🛡 Apply Parry ]           toggle (aria-pressed)
    [ Supreme: 1 strain ]    shown when the target has a Supreme talent for this category
    [ Unarmed: −1 strain ]   melee only, shown when the target has an Unarmed Parry talent
    Costs 3 strain           "wounds" for rivals and minions; follows the toggles

        [ Apply ]   [ Cancel ]
```

- The toggle reads **Apply Parry** / **Apply Reflect** in vanilla and **Apply Block** /
  **Apply Deflect** in reSpecialized.
- The Supreme and Unarmed toggles and the cost line appear only while the main toggle is on.
  Their wording follows the cost pool: "1 wound" and "−1 wound" for rivals and minions.
- **Neither the ranks nor the reduction is ever shown in the dialog.** This holds for the GM as
  well. The GM gets the numbers in the whisper.
- The rest of the dialog is unchanged.

### Chat

- **Public line:** unchanged, plus a second paragraph when the talent was used:
  "{actorName} parries." (melee) or "{actorName} deflects." (ranged), in both rulesets. It
  carries no cost and no numbers.
- **GM whisper:** unchanged, with its damage and soak figures computed on the reduced damage,
  plus one line naming the matched talent, the reduction and how it was reached, and the cost.
  For example: "Parry: −4 damage (2 + 2 ranks); 3 strain, Supreme." In reSpecialized the
  explanation reads "flat 4".

### Write

The damage and the cost go to the target in **one** `actor.update`, through the existing
[GM bridge](../../../modules/helpers/gm-bridge.js) queue. A hit therefore never lands without
its cost being paid, and the cost is never paid without the hit landing.

The `damage` request gains an optional `changes` form:

```js
{ type: "damage", changes: [{ path, delta }, { path, delta }], gmChat }
```

- One or two entries. Each `path` must be in `DAMAGE_PATHS` and each `delta` a finite number,
  under the same rules the single form already enforces. Duplicate paths are refused.
- When the damage pool and the cost pool are the same path (strain damage on a character, or
  any hit on a rival or minion), the planner merges them into one entry before sending.
- The legacy `{ path, delta }` form is still accepted. **Apply Damage keeps sending it whenever
  no talent is used**, so a GM still on the old code can apply ordinary damage without trouble.
  A Parry application reaching a GM on the old code is refused with the bridge's existing error.

`performApply` normalizes both forms to a list and reads every current value before writing
them all in a single update.

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
  same-path entries merged. Without `defence`, it returns exactly what it does today.
- **`apply-damage.js`:** reads the six settings, calls the planner, draws the toggle row, and
  keeps the toggle's and Apply's disabled state current as the toggles change. On Apply it
  sends the single form or the `changes` form and writes both chat lines.
- **`gm-bridge.js`:** `narrowApplyRequest` accepts the `changes` form, and `performApply` writes
  either form in a single update.
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
  - cost pool: strain for characters and nemeses, wounds for rivals and minions, nothing for vehicles
  - incapacitation: just below, at and one over the threshold, an unknown threshold, and a
    target already past its threshold
  - the cheapest cost, which decides whether the toggle is greyed out
- `tests/node/apply-damage.test.mjs`: the reduction applied before soak, a reduction larger
  than the damage, merged `changes` on the same path, separate `changes` on different paths,
  and identical output when there is no `defence`.
- `tests/node/gm-bridge-apply.test.mjs`: the `changes` form accepted, and refused when it is
  empty, has more than two entries, names a path outside `DAMAGE_PATHS`, has a non-finite delta
  or repeats a path. The legacy form still works.

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

## Rollout

- **CHANGELOG:** one entry under `Unreleased`, plus a sub-bullet: reload Foundry on every
  connected client, because a GM on the old code refuses a Parry application.
- **Wiki:** add the toggle to the damage-and-crits chapter of the tutorial and re-capture its
  Apply Damage screenshot if the dialog appears in it. The new settings menu gets a line in
  the GM setup chapter.

## Non-goals

- The Improved Parry and Improved Reflect counter-hits, and the Djem So Deflection move.
- Checking what the target is wielding. The person applying the damage decides.
- Unarmed Parry's "may Parry while unarmed". That is a permission, and it is already covered
  by not checking weapons.
- Automating "made no combat check last turn" for Supreme. The person applying chooses.
- Vehicles, and any vehicle analogue.
- Remembering that a hit was parried. The Apply Damage button stays clickable as it is today.
