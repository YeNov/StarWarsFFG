import assert from "node:assert/strict";
import test from "node:test";

import {
  addTalentListEntry,
  applyTalentToInnateModification,
  buildInnateTalentModification,
  collectInnateTalentGrants,
} from "../../modules/helpers/innate-talents.js";

function weapon({ equipped = true, active = true, broken = false } = {}) {
  return {
    _id: "weapon1",
    name: "Blaster",
    type: "weapon",
    system: {
      equippable: { equipped },
      itemattachment: [{
        _id: "attachment1",
        name: "Integrated Optics",
        system: {
          description: "Attachment description",
          attributes: {
            baseTalent: { modtype: "Innate Talent", mod: "Quick Draw", value: 1 },
          },
          itemmodifier: [{
            name: "Expert Sight",
            system: {
              description: "Modification description",
              active,
              broken,
              rank: 2,
              attributes: {
                modTalent: { modtype: "Innate Talent", mod: "True Aim", value: 1 },
                statBoost: { modtype: "Skill Boost", mod: "RangedHeavy", value: 1 },
              },
            },
          }],
        },
      }],
    },
  };
}

test("collectInnateTalentGrants reads active attachment innate talent mods", () => {
  const grants = collectInnateTalentGrants([weapon()]);

  assert.equal(grants.length, 2);
  assert.deepEqual(grants.map((grant) => [grant.name, grant.rank]), [
    ["Quick Draw", 1],
    ["True Aim", 2],
  ]);
  assert.equal(grants[1].source[0].type, "itemattachment");
  assert.equal(grants[1].source[0].name, "Blaster: Integrated Optics (Expert Sight)");
});

test("collectInnateTalentGrants skips inactive sources", () => {
  assert.equal(collectInnateTalentGrants([weapon({ equipped: false })]).length, 0);
  assert.deepEqual(collectInnateTalentGrants([weapon({ active: false })]).map((grant) => grant.name), ["Quick Draw"]);
  assert.deepEqual(collectInnateTalentGrants([weapon({ broken: true })]).map((grant) => grant.name), ["Quick Draw"]);
});

test("addTalentListEntry stacks ranked innate talent grants", () => {
  const talents = [{ name: "True Aim", isRanked: true, rank: 1, source: [{ type: "talent", id: "talent1" }] }];

  addTalentListEntry(talents, collectInnateTalentGrants([weapon()]).find((grant) => grant.name === "True Aim"));

  assert.equal(talents.length, 1);
  assert.equal(talents[0].rank, 3);
  assert.equal(talents[0].source.length, 2);
});

test("applyTalentToInnateModification stores a dropped talent as one innate-talent attribute", () => {
  const modification = buildInnateTalentModification();
  modification.system.rank = 3;

  const updated = applyTalentToInnateModification(modification, {
    name: "Armor Master",
    img: "talent.webp",
    system: { description: "Talent description" },
  });

  assert.equal(updated.name, "Armor Master");
  assert.equal(updated.img, "talent.webp");
  assert.equal(updated.system.rank, 3);
  assert.equal(updated.system.innateTalent, true);
  assert.deepEqual(updated.system.attributes.innateTalent, {
    modtype: "Innate Talent",
    mod: "Armor Master",
    value: 1,
  });
});
