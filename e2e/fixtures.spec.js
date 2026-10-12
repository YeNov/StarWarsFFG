// @ts-check
/**
 * Contract of the stat checks in playwright/fixtures.ts. For every field it supports, checkStat
 * passes on the prepared value, which the sheet control shows too, and fails on any other value; an
 * unsupported field throws; and checking leaves the document and every control of its sheet as they
 * were, so a check can never write the value it is meant to verify.
 */
import { test, expect } from "../playwright/foundry.js";
import { Actors, Items } from "../playwright/fixtures";

/**
 * Checks every field of `subject` against its prepared value, then against a wrong value, then the
 * unsupported field names, and compares the source data and sheet controls before and after.
 * @param {Actors | Items} subject  A helper whose sheet is open.
 * @param {string[]} unsupported     Field names that must throw.
 */
async function sweep(subject, unsupported) {
  const before = await subject.snapshot();
  const fields = await subject.readFields();
  expect(Object.keys(fields).length, "the subject supports fields").toBeGreaterThan(0);

  for (const [field, { document, control }] of Object.entries(fields)) {
    expect(control, `${field}: the sheet control shows the prepared value`).toBe(document);
    await subject.checkStat(field, document);
    const wrong = String((Number(document) || 0) + 7);
    await expect(subject.checkStat(field, wrong, { timeout: 500 }), `${field}: checking ${wrong} fails`)
      .rejects.toThrow(`${field}: prepared system.`);
  }
  for (const field of unsupported) {
    await expect(subject.checkStat(field, "0"), `${field} is not a supported field`)
      .rejects.toThrow(`checkStat: unsupported field '${field}'`);
  }

  expect(await subject.snapshot(), "checking left the document and the sheet controls unchanged").toEqual(before);
}

test("checkStat reads every supported field and changes nothing", async ({ sessions }) => {
  test.setTimeout(180_000);

  const character = new Actors(sessions, "check character", "character");
  await character.create({ system: { characteristics: { Brawn: { value: 3 }, Agility: { value: 2 }, Willpower: { value: 4 } } } });
  // Names the old helper accepted and then returned without asserting, and English spellings.
  await sweep(character, ["defense", "defense.melee", "defence.ranged", "Strain", "armor", "speed"]);

  const vehicle = new Actors(sessions, "check vehicle", "vehicle");
  await vehicle.create({ system: { stats: { armour: { value: 3 }, speed: { max: 4 }, encumbrance: { max: 12 }, customizationHardPoints: { value: 5 } } } });
  await sweep(vehicle, ["armor", "speed", "handling", "Brawn"]);

  const armour = new Items(sessions, "check armour", "armour");
  await armour.create({ system: { defence: { value: 1 }, soak: { value: 2 }, encumbrance: { value: 3 }, hardpoints: { value: 4 }, rarity: { value: 5 } } });
  await sweep(armour, ["defense", "armor", "Strain"]);
  await expect(armour.setStat("defense", "1"), "setStat takes the same field names").rejects.toThrow("setStat: unsupported field 'defense'");

  // Built with its values: a new species cannot be edited on its sheet yet (the save throws).
  const attribute = (modtype, mod, value) => ({ modtype, mod, value });
  const species = new Items(sessions, "check species", "species");
  await species.create({ system: { attributes: {
    Wounds: attribute("Stat", "Wounds", 10), Strain: attribute("Stat", "Strain", 12),
    Brawn: attribute("Characteristic", "Brawn", 1), Agility: attribute("Characteristic", "Agility", 2),
    Intellect: attribute("Characteristic", "Intellect", 3), Cunning: attribute("Characteristic", "Cunning", 2),
    Willpower: attribute("Characteristic", "Willpower", 1), Presence: attribute("Characteristic", "Presence", 3),
  } } });
  await sweep(species, ["defense", "woundsMax"]);
});
