// @ts-check
/**
 * Items and their modifiers reach the owning actor. Every document is created through the
 * `sessions` fixture (playwright/foundry.js), which deletes it by id when the test ends, pass or
 * fail, and fails the test if it left the world changed.
 */
import { test, expect } from "../playwright/foundry.js";
import { Actors, Items } from "../playwright/fixtures";

// TODO: most of these tests should be extended to confirm that they still work if they're done while the item is on an actor
// TODO: creating an AE on a mod does not sync properly to "disabled", meaning it's applied right away

/**
 * Character tests
 */
test('armor applies correctly', async ({ sessions }) => {
  // create items
  const armorActor = new Actors(sessions, "armorActor", "character");
  await armorActor.create();
  const armor = new Items(sessions, "qa armor", "armour");
  await armor.create();

  // set stats on the armor
  await armor.setStat('encumbrance', '5');
  await armor.setStat('defence', '1');
  await armor.setStat('soak', '2');
  await armor.checkStat('encumbrance', '5');
  await armor.checkStat('defence', '1');
  await armor.checkStat('soak', '2');
  await armor.closeSheet();

  // drag and drop the armor onto the character
  await armorActor.switchTab('gear');
  await armorActor.dropItem(armor, { target: armorActor.sheet.locator('.tab.items.active') });
  await armorActor.checkStat('encumbranceCurrent', '5');
  await armorActor.checkStat('soak', '0');
  await armorActor.checkStat('defenceRanged', '0');

  // equip the armor and validate the stats are what we expect
  await armorActor.equipItem(armor);
  await armorActor.checkStat('encumbranceCurrent', '2');
  await armorActor.checkStat('defenceRanged', '1');
  await armorActor.checkStat('defenceMelee', '1');
  await armorActor.checkStat('soak', '2');
});

test('career applies correctly', async ({ sessions }) => {
  const careerActor = new Actors(sessions, "careerActor", "character");
  await careerActor.create();
  const career = new Items(sessions, "qa career", "career");
  await career.create();

  // add a mod
  await career.addDirectModifier('Skill Add Advantage', 'Gunnery', '1');
  await career.closeSheet();

  // drag and drop the armor onto the character
  // (expect there to not be text, then, after the drop, expect there to be text)
  await careerActor.switchTab('gear');
  await careerActor.dropItem(career, { target: careerActor.sheet.locator('.tab.items.active') });
  await careerActor.switchTab('characteristics');
  await careerActor.checkSkillModifiers('Gunnery', 'Advantage', '1');
});

test('critical injury applies correctly', async ({ sessions }) => {
  const critActor = new Actors(sessions, "qa criticalInjuryActor", "character");
  await critActor.create();
  const crit = new Items(sessions, "qa criticalInjuryItem", "criticalinjury");
  await crit.create();

  // add a mod
  await crit.addDirectModifier('Skill Add Success', 'Melee', '2');
  await crit.closeSheet();

  // drag and drop the armor onto the character
  // (expect there to not be text, then, after the drop, expect there to be text)
  await critActor.switchTab('gear');
  await critActor.dropItem(crit, { target: critActor.sheet.locator('.tab.items.active') });
  await critActor.switchTab('characteristics');
  await critActor.checkSkillModifiers('Melee', 'Success', '2');
});

test('force power applies correctly', async ({ sessions }) => {
  const fpActor = new Actors(sessions, "qa forcePowerActor", "character");
  await fpActor.create();
  const fp = new Items(sessions, "qa forcePowerItem", "forcepower");
  await fp.create();

  // add a mod

  //await fp.addDirectModifier('')
  await fp.addTalentModifier('0', 'Skill Add Despair', 'Cool', '3');
  await fp.learnTalent('1');
  await fp.addTalentModifier('1', 'Skill Add Success', 'Computers', '2');
  await fp.closeSheet();

  // drag and drop onto the character
  await fpActor.dropItem(fp, { prompt: 'Grant' });
  await fpActor.switchTab('characteristics');
  await fpActor.checkSkillModifiers('Computers', 'Success', '2');
});

test('gear applies correctly', async ({ sessions }) => {
  const gearActor = new Actors(sessions, "qa gearActor", "character");
  await gearActor.create();
  const gear = new Items(sessions, "qa gearItem", "gear");
  await gear.create();

  // add a mod
  await gear.addDirectModifier('Skill Add Advantage', 'Charm', '2');
  await gear.closeSheet();

  // drag and drop the armor onto the character
  // (expect there to not be text, then, after the drop, expect there to be text)
  await gearActor.switchTab('gear');
  await gearActor.dropItem(gear, { target: gearActor.sheet.locator('.tab.items.active') });
  await gearActor.switchTab('characteristics');
  await gearActor.checkSkillModifiers('Charm', 'Advantage', '2');
});

test('signature ability applies correctly', async ({ sessions }) => {
  const saActor = new Actors(sessions, "qa signatureAbilityActor", "character");
  await saActor.create();
  const sa = new Items(sessions, "qa signatureAbilityItem", "signatureability");
  await sa.create();

  // add a mod
  //await sa.addDirectModifier('')
  await sa.addTalentModifier('0', 'Skill Add Despair', 'Cool', '3');
  await sa.learnTalent('1');
  await sa.addTalentModifier('1', 'Skill Add Success', 'Medicine', '1');
  await sa.closeSheet();

  // drag and drop onto the character
  await saActor.dropItem(sa, { prompt: 'Grant' });
  await saActor.switchTab('characteristics');
  await saActor.checkSkillModifiers('Medicine', 'Success', '1');
});

test('specialization applies correctly', async ({ sessions }) => {
  const spActor = new Actors(sessions, "qa specActor", "character");
  await spActor.create();
  const sp = new Items(sessions, "qa specItem", "specialization");
  await sp.create();

  // add a mod
  //await sp.addDirectModifier('')
  await sp.addTalentModifier('0', 'Skill Add Despair', 'Cool', '3');
  await sp.learnTalent('1');
  await sp.addTalentModifier('1', 'Skill Boost', 'Perception', '3');
  await sp.closeSheet();

  // drag and drop onto the character
  await spActor.dropItem(sp, { prompt: 'Grant' });
  await spActor.switchTab('characteristics');
  await spActor.checkSkillModifiers('Perception', 'boost', '3');
});

test('embedded tree-item base modifiers apply from the pop-out editor', async ({ sessions }) => {
  test.setTimeout(180_000);
  const cases = [
    { type: "specialization", name: "qa popoutSpec", skill: "Perception" },
    { type: "forcepower", name: "qa popoutForcePower", skill: "Computers" },
    { type: "signatureability", name: "qa popoutSignature", skill: "Medicine" },
  ];

  const actor = new Actors(sessions, "qa popoutBaseModifierActor", "character");
  await actor.create();

  for (const itemCase of cases) {
    const item = new Items(sessions, itemCase.name, itemCase.type);
    await item.createWorld();

    await actor.embedWorldItem(item);
    await actor.editItem(item);
    await item.addDirectModifier('Skill Add Success', itemCase.skill, '1');
    await item.closeSheet();
  }

  for (const itemCase of cases) {
    await actor.checkPreparedSkillModifier(itemCase.skill, 'success', 1);
  }
});

test('species applies correctly', async ({ sessions }) => {
  // create items
  const speciesActor = new Actors(sessions, "qa speciesActor", "character");
  await speciesActor.create();
  const speciesItem = new Items(sessions, "qa speciesItem", "species");
  await speciesItem.create();

  // set stats on the speciesItem
  await speciesItem.setStat('Wounds', '10');
  await speciesItem.setStat('Strain', '20');
  await speciesItem.setStat('Brawn', '1');
  await speciesItem.setStat('Agility', '2');
  await speciesItem.setStat('Intellect', '3');
  await speciesItem.setStat('Cunning', '3');
  await speciesItem.setStat('Willpower', '2');
  await speciesItem.setStat('Presence', '1');
  await speciesItem.checkStat('Wounds', '10');
  await speciesItem.checkStat('Strain', '20');
  await speciesItem.checkStat('Brawn', '1');
  await speciesItem.checkStat('Agility', '2');
  await speciesItem.checkStat('Intellect', '3');
  await speciesItem.checkStat('Cunning', '3');
  await speciesItem.checkStat('Willpower', '2');
  await speciesItem.checkStat('Presence', '1');
  await speciesItem.closeSheet();

  // drag and drop the speciesItem onto the character
  await speciesActor.switchTab('characteristics');
  await speciesActor.dropItem(speciesItem);
  await speciesActor.checkStat('woundsMax', '11'); // brawn + wounds
  await speciesActor.checkStat('strainMax', '22'); // willpower + strain
  // TODO: this should be passing, but is not. there's a bug where soak is not being increased by Brawn
  //await speciesActor.checkStat('soak', '1'); // brawn
  await speciesActor.checkStat('Brawn', '1');
  await speciesActor.checkStat('Agility', '2');
  await speciesActor.checkStat('Intellect', '3');
  await speciesActor.checkStat('Cunning', '3');
  await speciesActor.checkStat('Willpower', '2');
  await speciesActor.checkStat('Presence', '1');
});

test('talent applies correctly', async ({ sessions }) => {
  const talentActor = new Actors(sessions, "qa talentActor", "character");
  await talentActor.create();
  const talent = new Items(sessions, "qa talentItem", "talent");
  await talent.create();

  // add a mod
  await talent.addDirectModifier('Stat', 'Strain', '3');
  await talent.closeSheet();

  // drag and drop the talent onto the character
  await talentActor.dropItem(talent, { prompt: 'Grant' });
  // `Stat`/`Strain` raises the strain threshold (open-decisions R30)
  await talentActor.checkStat('strainMax', '3');
});

test('weapon applies correctly', async ({ sessions }) => {
  const weaponActor = new Actors(sessions, "qa weaponActor", "character");
  await weaponActor.create();
  const weapon = new Items(sessions, "qa weaponItem", "weapon");
  await weapon.create();

  // add a mod
  await weapon.switchTab('modifiers');
  await weapon.setStat('encumbrance', '5');
  await weapon.closeSheet();

  // drag and drop the weapon onto the character
  await weaponActor.switchTab('gear');
  await weaponActor.dropItem(weapon, { target: weaponActor.sheet.locator('.tab.items.active') });
  await weaponActor.checkStat('encumbranceCurrent', '5');
});

test('embedded armor applies correctly', async ({ sessions }) => {
  const embeddedActor = new Actors(sessions, "qa embeddedArmorActor", "character");
  await embeddedActor.create();
  const armor = new Items(sessions, "qa armorItem", "armour");
  await armor.create();
  const armorAttachment = new Items(sessions, "qa embeddedAttachment", "itemattachment");
  await armorAttachment.create();

  await armorAttachment.addDirectModifier('Stat', 'Soak', '1');
  await armorAttachment.closeSheet();
  // drag the attachment to the armor
  await armor.dropItem(armorAttachment);
  await armor.closeSheet();
  await embeddedActor.switchTab('gear');
  await embeddedActor.checkStat('soak', '0');
  await embeddedActor.dropItem(armor, { target: embeddedActor.sheet.locator('.tab.items.active') });
  // TODO: this should probably be 0, because the AE should not apply until equipped
  await embeddedActor.checkStat('soak', '1');

  // okay, add the mod
  const weaponMod = new Items(sessions, "qa embeddedMod", "itemmodifier");
  await weaponMod.create();
  await weaponMod.addDirectModifier('Stat', 'Defence-Melee', '1');
  await weaponMod.setRank('1');
  await weaponMod.closeSheet();
  await embeddedActor.editItem(armor);
  await armor.dropItem(weaponMod);
  await armor.closeSheet();
  await embeddedActor.checkStat('defenceMelee', '1');
  await embeddedActor.checkStat('defenceRanged', '0');
  await embeddedActor.checkStat('soak', '1');

  // okay, now add the mod to the attachment
  await embeddedActor.editItem(armor);
  //await armor.removeItem(attachmentName);
  // 'embeddedAttachment' drives the editor of the attachment copy on the actor's armour
  const embeddedAttachment = new Items(sessions, "qa embeddedAttachment", "itemattachment");
  await armor.editItem(embeddedAttachment);
  await embeddedAttachment.sheet.getByText('Modifications', { exact: true }).click();
  await expect(embeddedAttachment.sheet.locator('.tab[data-tab="modifications"]')).toBeVisible();
  await weaponMod.dragTo(embeddedAttachment.sheet.locator('.content'));
  // enableMod waits for the dropped modification's row
  await embeddedAttachment.enableMod('0');
  await embeddedAttachment.sheet.getByText('Basics', { exact: true }).click();
  await embeddedAttachment.closeSheet();
  await armor.closeSheet();
  await embeddedActor.equipItem(armor);
  await embeddedActor.checkStat('defenceMelee', '2');
  await embeddedActor.checkStat('defenceRanged', '0');
});

test('embedded weapons applies correctly', async ({ sessions }) => {
  const embeddedActor = new Actors(sessions, "qa embeddedWeaponActor", "character");
  await embeddedActor.create();
  const weapon = new Items(sessions, "qa embeddedWeaponItem", "weapon");
  await weapon.create();
  const weaponAttachment = new Items(sessions, "qa embeddedAttachment", "itemattachment");
  await weaponAttachment.create();

  // add an attachment-specific modifier
  await weaponAttachment.addDirectModifier('Stat', 'Soak', '1');
  await weaponAttachment.closeSheet();

  // drag the attachment to the weapon
  await weapon.dropItem(weaponAttachment);
  await weapon.closeSheet();

  // drag the weapon to the actor
  await embeddedActor.switchTab('gear');
  await embeddedActor.checkStat('soak', '0');
  await embeddedActor.dropItem(weapon, { target: embeddedActor.sheet.locator('.tab.items.active') });
  // TODO: this should probably be 0, because the AE should not apply until equipped
  await embeddedActor.checkStat('soak', '1');

  // create the mod
  const weaponMod = new Items(sessions, "qa embeddedMod", "itemmodifier");
  await weaponMod.create();
  await weaponMod.addDirectModifier('Stat', 'Defence-Melee', '1');
  await weaponMod.setRank('1');
  await weaponMod.closeSheet();

  // open the editor for the weapon
  await embeddedActor.editItem(weapon);
  // add the mod to the weapon
  await weapon.dropItem(weaponMod);
  await weapon.closeSheet();
  await embeddedActor.checkStat('defenceMelee', '1');
  await embeddedActor.checkStat('defenceRanged', '0');
  await embeddedActor.checkStat('soak', '1');

  // okay, now add the mod to the attachment
  await embeddedActor.editItem(weapon);
  // 'embeddedAttachment' drives the editor of the attachment copy on the actor's weapon
  const embeddedAttachment = new Items(sessions, "qa embeddedAttachment", "itemattachment");
  await weapon.editItem(embeddedAttachment);
  await embeddedAttachment.sheet.getByText('Modifications', { exact: true }).click();
  await expect(embeddedAttachment.sheet.locator('.tab[data-tab="modifications"]')).toBeVisible();
  // actually drag the mod to the attachment
  await weaponMod.dragTo(embeddedAttachment.sheet.locator('.content'));
  // a dropped mod already counts as installed (open decisions R33); enableMod waits for its row
  await embeddedAttachment.enableMod('0');
  await embeddedAttachment.sheet.getByText('Basics', { exact: true }).click();
  await embeddedAttachment.closeSheet();
  await weapon.closeSheet();
  await embeddedActor.equipItem(weapon);
  // validate tha the second mod instance is adding to the AE properly
  await embeddedActor.checkStat('defenceMelee', '2');
  await embeddedActor.checkStat('defenceRanged', '0');
});

test('a quality dropped into an attachment counts as installed: its box is ticked and the weapon lists it', async ({ sessions }) => {
  // A modification is off only when its Installed? box is unticked (`active: false`); one with no
  // `active` at all, as a dropped quality arrives, counts as installed (open decisions R33).
  const page = sessions.gm;
  const quality = new Items(sessions, "qa droppedQuality", "itemmodifier");
  await quality.create();
  await quality.addDirectModifier('Stat', 'Defence-Melee', '1');
  await quality.closeSheet();

  // dropped onto an attachment's own sheet
  const attachment = new Items(sessions, "qa attachmentForDrop", "itemattachment");
  await attachment.create();
  await attachment.switchTab('modifiers');
  await attachment.dropItem(quality);
  expect(await page.evaluate((uuid) => 'active' in fromUuidSync(uuid)._source.system.itemmodifier[0].system, attachment.uuid)).toBe(false);
  await attachment.switchTab('modifications');
  await expect(attachment.sheet.locator('input[name="system.itemmodifier[0].system.active"][type="checkbox"]')).toBeChecked();
  // a modification added with the button starts uninstalled, and its box says so
  await attachment.sheet.locator('button.add-modification[data-action="create"]').click();
  await expect(attachment.sheet.locator('input[name="system.itemmodifier[1].system.active"][type="checkbox"]')).not.toBeChecked();
  await attachment.closeSheet();

  // dropped into the editor of an attachment fitted to a weapon
  const fitted = new Items(sessions, "qa fittedForDrop", "itemattachment");
  await fitted.create();
  await fitted.closeSheet();
  const weapon = new Items(sessions, "qa weaponForDrop", "weapon");
  await weapon.create();
  await weapon.switchTab('modifiers');
  await weapon.dropItem(fitted);
  await weapon.editItem(fitted);
  await fitted.sheet.getByText('Modifications', { exact: true }).click();
  await quality.dragTo(fitted.sheet.locator('.content'));
  const fittedModification = () => page.evaluate((uuid) => {
    const modification = fromUuidSync(uuid)._source.system.itemattachment[0]?.system?.itemmodifier?.[0];
    return modification ? { name: modification.name, hasActive: 'active' in modification.system } : null;
  }, weapon.uuid);
  await expect.poll(fittedModification, { message: `${quality.name} is dropped into ${fitted.name}` })
    .toEqual({ name: quality.name, hasActive: false });
  await expect(fitted.sheet.locator('input[name="system.itemmodifier[0].system.active"][type="checkbox"]')).toBeChecked();
  // the weapon's quality summary lists it as coming from the attachment
  await expect(weapon.sheet.locator('.quality-name').filter({ hasText: quality.name })).toHaveCount(1);
});

test("a weapon's modifier switched off with its Enabled box stays off through unequip and equip", async ({ sessions }) => {
  // The Enabled box stores its state on the modifier row, so equipping, unequipping and the
  // reconcile that follows no longer switch the modifier back on (open decisions R34).
  const actor = new Actors(sessions, "qa enabledToggleActor", "character");
  await actor.create();
  const weapon = new Items(sessions, "qa enabledToggleWeapon", "weapon");
  await weapon.create();
  await weapon.switchTab('modifiers');
  await weapon.addDirectModifier('Stat', 'Soak', '1');
  await weapon.closeSheet();

  await actor.switchTab('gear');
  await actor.dropItem(weapon, { target: actor.sheet.locator('.tab.items.active') });
  await actor.equipItem(weapon);
  await actor.checkStat('soak', '1');

  await actor.editItem(weapon);
  await weapon.switchTab('modifiers');
  await weapon.setModifierEnabled('Stat', 'Soak', false);
  await weapon.closeSheet();
  await actor.checkStat('soak', '0');

  await actor.equipItem(weapon); // unequip
  await actor.checkStat('soak', '0');
  await actor.equipItem(weapon); // equip again
  await actor.checkStat('soak', '0');

  await actor.editItem(weapon);
  await weapon.switchTab('modifiers');
  await expect(await weapon.modifierEnabledBox('Stat', 'Soak')).not.toBeChecked();
  await weapon.setModifierEnabled('Stat', 'Soak', true);
  await weapon.closeSheet();
  await actor.checkStat('soak', '1');
});

/**
 * Vehicle Tests
 */
test('critical damage applies correctly', async ({ sessions }) => {
  // create items
  const critActor = new Actors(sessions, "qa critActor", "vehicle");
  await critActor.create();
  const crit = new Items(sessions, "qa critItem", "criticaldamage");
  await crit.create();

  // set stats on the crit
  await crit.addDirectModifier('Vehicle Stat', 'Armor', '1');
  await crit.closeSheet();

  // drag and drop the crit onto the character
  await critActor.dropItem(crit, { target: critActor.sheet.locator('.tab.components.active') });
  await critActor.checkStat('armour', '1');
});

test('ship attachment applies correctly', async ({ sessions }) => {
  // create items
  const attachmentActor = new Actors(sessions, "qa attachmentActor", "vehicle");
  await attachmentActor.create();
  const attachment = new Items(sessions, "qa shipAttachment", "shipattachment");
  await attachment.create();

  // set stats on the attachment
  await attachment.setStat('encumbrance', '5');
  await attachment.setStat('hardpoints', '3');
  await attachment.closeSheet();

  // drag and drop the attachment onto the character
  await attachmentActor.dropItem(attachment, { target: attachmentActor.sheet.locator('.tab.components.active') });
  await attachmentActor.checkStat('encumbranceCurrent', '5');
  await attachmentActor.switchTab('crew');
  await attachmentActor.checkStat('customizationHardPoints', '-3');
});

test('ship weapon applies correctly', async ({ sessions }) => {
  const shipWeaponActor = new Actors(sessions, "qa shipWeaponActor", "vehicle");
  await shipWeaponActor.create();
  const shipWeapon = new Items(sessions, "qa shipWeaponItem", "shipweapon");
  await shipWeapon.create();

  // add a mod
  await shipWeapon.addDirectModifier('Vehicle Stat', 'Armour', '3');
  await shipWeapon.closeSheet();

  // drag and drop the shipWeapon onto the character
  await shipWeaponActor.dropItem(shipWeapon, { target: shipWeaponActor.sheet.locator('.tab.components.active') });
  await shipWeaponActor.checkStat('armour', '3'); // shipWeapon plus modifier
});

test('embedded ship weapon applies correctly', async ({ sessions }) => {
  const vehicle = new Actors(sessions, "qa shipAttActor", "vehicle");
  await vehicle.create();
  const shipweapon = new Items(sessions, "qa shipAttWpn", "shipweapon");
  await shipweapon.create();
  const shipweaponattachment = new Items(sessions, "qa shipAttAtt", "itemattachment");
  await shipweaponattachment.create();
  await shipweaponattachment.addDirectModifier('Vehicle Stat', 'Speed', '1');
  await shipweaponattachment.closeSheet();
  // drag the attachment to the shipweapon
  await shipweapon.dropItem(shipweaponattachment);
  await shipweapon.closeSheet();
  // `Vehicle Stat`/`Speed` targets the speed threshold; 0 until the weapon is on the vehicle (open-decisions R30)
  await vehicle.checkStat('speedMax', '0');
  await vehicle.dropItem(shipweapon, { target: vehicle.sheet.locator('.tab.components.active') });
  await vehicle.checkStat('speedMax', '1');
});
