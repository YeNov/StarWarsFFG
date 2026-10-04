import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  DEFENSIVE_TALENT_LISTS,
  RULESET_RESPECIALIZED,
  RULESET_VANILLA,
  parseTalentNames,
  planDefensiveTalent,
  unitLabelKey,
} from "../../modules/helpers/defensive-talents.js";

/**
 * Parry & Reflect shows only i18n keys the rules module hands back and the settings name. A key
 * missing from English would surface as a raw "SWFFG.ApplyDamage.Defence.ApplyParry" on the button.
 */
const english = JSON.parse(fs.readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));
const names = Object.fromEntries(DEFENSIVE_TALENT_LISTS.map((list) => [list.field, parseTalentNames(list.default)]));

test("every label the rules hand back exists in English", () => {
  const keys = new Set();
  for (const ruleset of [RULESET_VANILLA, RULESET_RESPECIALIZED]) {
    for (const [attack, name] of [["melee", "Parry"], ["ranged", "Reflect"]]) {
      for (const rank of [1, 2]) {
        const actor = { type: "character", talentList: [{ name, rank }], system: { stats: { strain: { value: 0, max: 10 } } } };
        const plan = planDefensiveTalent({ actor, attack, ruleset, names });
        keys.add(plan.toggleLabelKey);
        keys.add(plan.publicKey);
        keys.add(plan.formula.key);
      }
    }
  }
  for (const [unit, count] of [["strain", 1], ["wounds", 1], ["wounds", 3]]) keys.add(unitLabelKey(unit, count));
  for (const suffix of ["Supreme", "Unarmed", "Cost", "SupremeName", "UnarmedName", "GMLine", "Unaffordable", "WriterOutdated"]) {
    keys.add(`SWFFG.ApplyDamage.Defence.${suffix}`);
  }
  for (const key of keys) assert.equal(typeof english[key], "string", key);
});

test("the Parry & Reflect menu and each of its settings are named in English", () => {
  const keys = [
    "Title", "Name", "Hint", "Label",
    "Ruleset.Name", "Ruleset.Hint", "Ruleset.Vanilla", "Ruleset.Respecialized",
    ...DEFENSIVE_TALENT_LISTS.flatMap((list) => [`${list.label}.Name`, `${list.label}.Hint`]),
  ];
  for (const key of keys) assert.equal(typeof english[`SWFFG.Settings.DefensiveTalents.${key}`], "string", key);
});
