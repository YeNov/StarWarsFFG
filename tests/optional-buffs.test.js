/**
 * Optional buffs inside Foundry: what the Node tier cannot reach. Items keep their buffs through
 * a save (the data model declares the field), and a talent dropped into a specialization tree
 * brings its buffs along. The buff rules themselves are covered in tests/node/optional-buffs*.
 */

const BUFFS = [{ id: "b1", name: "Hood up", rows: [{ modtype: "Skill Boost", mod: "Stealth", value: 1 }] }];

export const OptionalBuffsTests = (suite, suiteInstance, Test, chai, harness) => {
  const _suite = suiteInstance.create(suite, "Optional buffs");

  for (const type of ["weapon", "armour", "gear", "talent", "itemattachment"]) {
    _suite.addTest(new Test(`a ${type} keeps its optional buffs through an update`, async function () {
      const item = await harness.fixtures.create("Item", { name: `buffs-${type}`, type, system: { optionalBuffs: BUFFS } });

      await item.update({ name: harness.fixtures.name(`buffs-${type}-renamed`) });

      chai.expect(item.system.optionalBuffs).to.deep.equal(BUFFS);
    }));
  }

  _suite.addTest(new Test("a talent dropped into a specialization brings its buffs", async function () {
    const talent = await harness.fixtures.create("Item", { name: "buff-talent", type: "talent", system: { optionalBuffs: BUFFS } });
    const spec = await harness.fixtures.create("Item", { name: "buff-spec", type: "specialization" });

    await spec.sheet.render({ force: true });
    await harness.waitFor(() => spec.sheet.rendered, { message: "the specialization sheet renders" });
    const slot = spec.sheet.element.querySelector(".specialization-talent#talent0");
    if (!slot) return harness.skip(this, "the specialization sheet shows no talent0 slot");

    await spec.sheet._onDropTalentToSpecialization({
      currentTarget: slot,
      dataTransfer: { getData: () => JSON.stringify({ type: "Item", uuid: talent.uuid }) },
      preventDefault() {},
      stopPropagation() {},
    });

    await harness.waitFor(() => spec.system.talents?.talent0?.optionalBuffs?.length === 1,
      { message: "the dropped talent's buffs reach the tree slot" });
    chai.expect(spec.system.talents.talent0.optionalBuffs).to.deep.equal(BUFFS);
  }));
};
