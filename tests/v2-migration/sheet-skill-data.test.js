// V2 migration tripwire - actor sheet skill data.
//
// Behavior under test: actor sheets must build `data.skilllist` from prepared
// actor skills. A raw serialized DataModel can contain an empty/default
// `system.skills` object even though `actor.system.skills` has been prepared from
// CONFIG.FFG.skills, which renders headers with no skill rows.

import { ActorSheetFFG } from "../../modules/actors/actor-sheet-ffg.js";
import { CodexActorSheet } from "../../modules/actors/codex-sheets.js";

export const SheetSkillDataTests = (suite, suiteInstance, Test, chai) => {
  const _suite = suiteInstance.create(suite, "V2 Migration - Actor Sheet Skill Data");

  const makeActor = () =>
    Actor.create({
      name: "_v2mig_skilldata",
      type: "character",
      flags: { starwarsffg: { loaded: true } },
      system: { skills: {} },
    });

  const assertSkillRows = async (SheetClass, label) => {
    const actor = await makeActor();
    try {
      const data = await new SheetClass({ document: actor }).getData({});
      const skills = Object.keys(data.data.skills ?? {});
      const rows = (data.data.skilllist ?? []).flat().filter((row) => row.id !== "header");

      chai.expect(skills.length, `${label}: prepared skills are present`).to.be.greaterThan(0);
      chai.expect(rows.length, `${label}: skilllist has rendered rows`).to.be.greaterThan(0);
    } finally {
      await actor.delete();
    }
  };

  _suite.addTest(new Test("legacy actor sheet keeps prepared skill rows", async function () {
    await assertSkillRows(ActorSheetFFG, "ActorSheetFFG");
  }));

  _suite.addTest(new Test("Codex actor sheet keeps prepared skill rows", async function () {
    await assertSkillRows(CodexActorSheet, "CodexActorSheet");
  }));
};
