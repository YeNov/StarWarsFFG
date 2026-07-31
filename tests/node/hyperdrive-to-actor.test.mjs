import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { AE_MODES } from "../../modules/config/ffg-active-effect-modes.js";
import { assembleCharacterSource } from "../../modules/char-creator/assemble-character-source.js";
import { parseHyperdrive } from "../../modules/importer/hyperdrive/parse.js";
import {
  buildSnapshotIndex,
  HYPERDRIVE_SKILL_ALIASES,
  resolutionAliases,
  resolveFindingOverride,
} from "../../modules/importer/hyperdrive/resolve.js";
import { driftReport, hyperdriveToActorData } from "../../modules/importer/hyperdrive/to-actor.js";

const RAW = JSON.parse(fs.readFileSync(new URL("./_fixtures/hyperdrive/mandalorian-warrior.json", import.meta.url)));
const CHARS = (brawn) => ({
  Brawn: { value: brawn },
  Agility: { value: 4 },
  Intellect: { value: 4 },
  Cunning: { value: 3 },
  Willpower: { value: 2 },
  Presence: { value: 2 },
});

function assemblerDeps() {
  const skills = Object.fromEntries(RAW.Skills.map((skill) => [
    HYPERDRIVE_SKILL_ALIASES[skill.Key] ?? skill.skill,
    {
      rank: 0,
      label: HYPERDRIVE_SKILL_ALIASES[skill.Key] ?? skill.skill,
      careerskill: false,
    },
  ]));
  return {
    creationDefaults: {
      img: "default.png",
      prototypeToken: { actorLink: true, sight: { enabled: true } },
      system: {
        // A freshly created actor starts every characteristic at 0 (character.js:173);
        // the species and other items supply the rest via their effects.
        characteristics: Object.fromEntries(
          Object.keys(CHARS(0)).map((characteristic) => [characteristic, { value: 0 }]),
        ),
        skills,
        stats: {
          wounds: { max: 0 },
          strain: { max: 0 },
          soak: { value: 0 },
          encumbrance: { max: 0 },
          credits: { value: 0 },
        },
        experience: {},
      },
    },
    applyCharacteristicDeltas: (system, deltas) => {
      const result = structuredClone(system);
      for (const [key, value] of Object.entries(deltas)) {
        result.characteristics[key].value += value;
        if (key === "Brawn") {
          result.stats.wounds.max += value;
          result.stats.soak.value += value;
          result.stats.encumbrance.max += value;
        }
        if (key === "Willpower") result.stats.strain.max += value;
      }
      return result;
    },
  };
}

function basicDeps(overrides = {}) {
  const buildCalls = [];
  const resolve = {
    getByKey: (type, key) => ({
      itemType: type,
      ref: {
        uuid: `${type}:${key}`,
        name: key,
        type,
        snapshot: {
          name: key,
          type,
          system: type === "specialization"
            ? { talents: { talent18: { name: "Dedication" } } }
            : {},
          effects: [],
        },
      },
    }),
    getByName: () => null,
    ambiguities: [],
  };
  const deps = {
    resolve,
    skillMap: {},
    skillMeta: [],
    itemmodifierIndex: {},
    attachmentIndex: {},
    toItemData: (ref, options = {}) => ({
      ...structuredClone(ref.snapshot),
      importOptions: structuredClone(options),
    }),
    buildInPlace: (kind, entry) => {
      buildCalls.push(entry.Key ?? entry.key);
      return {
        source: {
          name: entry.Name ?? entry.name ?? kind,
          type: kind,
          flags: { starwarsffg: { ffgimportid: entry.Key ?? entry.key } },
          system: {},
          effects: [],
        },
        warnings: [],
      };
    },
    // What the BUILD ITEMS alone prepare, measured from an unsaved preview actor: the
    // species supplies 2 in every characteristic and the Steel Hand Dedication adds +1
    // Brawn; Brawl collects three free ranks (species + career + specialization), while
    // Athletics/Cool come from the career and Coordination from the specialization.
    // Equipment is excluded on purpose — an item carries its own modifiers.
    preparePreview: async () => ({
      characteristics: {
        Brawn: { value: 3 },
        Agility: { value: 2 },
        Intellect: { value: 2 },
        Cunning: { value: 2 },
        Willpower: { value: 2 },
        Presence: { value: 2 },
      },
      skills: {
        Brawl: { rank: 3 },
        Athletics: { rank: 1 },
        Cool: { rank: 1 },
        Coordination: { rank: 1 },
      },
    }),
    prepareFinal: async () => ({
      characteristics: CHARS(3),
      wounds: 18,
      strain: 13,
      soak: 4,
    }),
    assemble: (args) => assembleCharacterSource(assemblerDeps(), args),
    ...overrides,
  };
  return { deps, buildCalls };
}

test("equipment falls back from an unknown export key to an expanded compendium name", async () => {
  const parsed = parseHyperdrive(RAW);
  const base = basicDeps();
  const originalGet = base.deps.resolve.getByKey;
  base.deps.resolve.getByKey = (type, key) =>
    key === "UNARMED" ? null : originalGet(type, key);
  base.deps.resolve.getByName = (type, name) => type === "weapon" && name === "Unarmed"
    ? {
      itemType: "weapon",
      ref: {
        uuid: "weapon:unarmed-strike",
        name: "Unarmed Strike",
        type: "weapon",
        snapshot: {
          name: "Unarmed Strike",
          type: "weapon",
          system: { itemmodifier: [], itemattachment: [] },
          effects: [],
        },
      },
    }
    : null;

  const { actorData } = await hyperdriveToActorData(parsed, base.deps);
  assert.ok(actorData.items.some((item) => item.name === "Unarmed Strike"));
  assert.equal(base.buildCalls.includes("UNARMED"), false);
});

test("a supplied finding resolution overrides automatic equipment matching", async () => {
  const parsed = parseHyperdrive(RAW);
  const { deps } = basicDeps();
  deps.resolveFinding = (kind, item) => kind === "weapon" && item.Key === "UNARMED"
    ? {
      uuid: "weapon:manual-unarmed",
      name: "Manually Chosen Strike",
      type: "weapon",
      snapshot: {
        name: "Manually Chosen Strike",
        type: "weapon",
        system: { itemmodifier: [], itemattachment: [] },
        effects: [],
      },
    }
    : null;

  const { actorData } = await hyperdriveToActorData(parsed, deps);
  assert.ok(actorData.items.some((item) => item.name === "Manually Chosen Strike"));
  assert.equal(actorData.items.some((item) => item.name === "UNARMED"), false);
});

test("nested quality findings are reported and can be manually resolved", async () => {
  const parsed = parseHyperdrive(RAW);
  const unresolved = basicDeps();
  unresolved.deps.itemmodifierIndex = buildSnapshotIndex([], "itemmodifier");
  const first = await hyperdriveToActorData(parsed, unresolved.deps);
  assert.ok(first.report.findings.some((finding) =>
    finding.kind === "itemmodifier" && finding.key === "INFERIOR"));

  const selected = {
    uuid: "itemmodifier:chosen-inferior",
    name: "Chosen Inferior Quality",
    type: "itemmodifier",
    snapshot: {
      name: "Chosen Inferior Quality",
      type: "itemmodifier",
      system: { type: "weapon", rank: 1, attributes: {} },
      effects: [],
    },
  };
  const aliases = resolutionAliases("itemmodifier", { Key: "INFERIOR" }, { ownerType: "weapon" });
  const overrides = new Map(aliases.map((alias) => [alias, selected]));
  const resolved = basicDeps();
  resolved.deps.itemmodifierIndex = buildSnapshotIndex([], "itemmodifier");
  resolved.deps.resolveFinding = (kind, entry, options) =>
    resolveFindingOverride(overrides, kind, entry, options);
  const second = await hyperdriveToActorData(parsed, resolved.deps);
  assert.ok(second.actorData.items.some((item) =>
    item.system?.itemmodifier?.some((modifier) => modifier.name === "Chosen Inferior Quality")));
  assert.equal(second.report.findings.some((finding) =>
    finding.kind === "itemmodifier" && finding.key === "INFERIOR"), false);
});

test("matched cybernetic is routed to compendium and its Brawn effect is preserved", async () => {
  const parsed = parseHyperdrive(RAW);
  const brawnEffect = {
    name: "(inherent)",
    changes: [{
      key: "system.characteristics.Brawn.value",
      mode: AE_MODES.ADD,
      value: 1,
    }],
  };
  const base = basicDeps();
  const originalGet = base.deps.resolve.getByKey;
  base.deps.resolve.getByKey = (type, key) => key === "CYLEGII"
    ? {
      ref: {
        uuid: "gear:CYLEGII",
        name: "Cybernetic Leg",
        type: "gear",
        snapshot: { name: "Cybernetic Leg", type: "gear", system: {}, effects: [brawnEffect] },
      },
    }
    : originalGet(type, key);
  // Base Brawn is the residual 0; species (2) + Dedication (1) + the cybernetic's own
  // +1 prepare to 4. Hyperdrive's export omits the cybernetic's bonus, so the extra
  // point is legitimate drift for the report rather than an importer error.
  base.deps.prepareFinal = async () => ({
    characteristics: CHARS(4),
    wounds: 19,
    strain: 13,
    soak: 4,
  });
  const { actorData, report } = await hyperdriveToActorData(parsed, base.deps);
  assert.equal(base.buildCalls.includes("CYLEGII"), false);
  const cyber = actorData.items.find((item) => item.name === "Cybernetic Leg");
  assert.deepEqual(cyber.effects[0], brawnEffect);
  assert.ok(cyber.effects.flatMap((effect) => effect.changes).some((change) =>
    change.key === "system.stats.wounds.max" && change.value === 1));
  assert.deepEqual(report.drift.find((row) => row.stat === "Brawn"), {
    kind: "characteristic",
    stat: "Brawn",
    exported: 3,
    prepared: 4,
  });
  assert.deepEqual(report.drift.find((row) => row.stat === "wounds"), {
    kind: "threshold",
    stat: "wounds",
    exported: 18,
    prepared: 19,
  });
});

test("golden export stores characteristic residuals and purchased skill ranks", async () => {
  const parsed = parseHyperdrive(RAW);
  const { deps } = basicDeps();
  const originalGet = deps.resolve.getByKey;
  deps.resolve.getByKey = (type, key) =>
    type === "specialization" && key === "DEATHWCOTR" ? null : originalGet(type, key);
  const { actorData, report } = await hyperdriveToActorData(parsed, deps);

  // Brawn 3 = species 2 + Dedication 1, so nothing is left to persist; writing the
  // exported 3 here would double-count against the very items that supply it.
  assert.equal(actorData.system.characteristics.Brawn.value, 0);
  assert.equal(actorData.system.stats.wounds.max, 0);
  assert.equal(actorData.system.stats.encumbrance.max, 0);
  // Characteristics no item supplies stay on the actor: Agility/Intellect 4 - 2, Cunning 3 - 2.
  assert.equal(actorData.system.characteristics.Agility.value, 2);
  assert.equal(actorData.system.characteristics.Intellect.value, 2);
  assert.equal(actorData.system.characteristics.Cunning.value, 1);

  // Hyperdrive skill values are purchased ranks. Free species/career/spec ranks arrive
  // from item effects and must not be subtracted from these actor-base values.
  assert.equal(actorData.system.skills.Athletics.rank, 1);
  assert.equal(actorData.system.skills.Brawl.rank, 2);
  assert.ok(!report.warnings.some((warning) => /Skill .*imported items grant/.test(warning)));
  assert.equal(actorData.system.skills.Charm.rank, 1);
  assert.equal(actorData.system.skills.Vigilance.rank, 1);

  const career = actorData.items.find((item) => item.type === "career");
  const steel = actorData.items.find((item) => item.name === "STEELHAND");
  const deathWatch = actorData.items.find((item) =>
    item.flags?.starwarsffg?.ffgimportid === "DEATHWCOTR");
  const species = actorData.items.find((item) => item.type === "species");
  assert.deepEqual(species.importOptions.rankGrants, ["Brawl"]);
  assert.deepEqual(career.importOptions.rankGrants, ["Athletics", "Brawl", "Cool"]);
  assert.deepEqual(steel.importOptions.rankGrants, ["Brawl", "Coordination"]);
  assert.ok(deathWatch.effects.flatMap((effect) => effect.changes).some((change) =>
    change.key === "system.stats.wounds.max" && change.value === 2));

  const cyber = actorData.items.find((item) => item.flags?.starwarsffg?.inventoryID === "CYLEGII_1785055142357");
  assert.ok(cyber.effects.flatMap((effect) => effect.changes).some((change) =>
    change.key === "system.stats.wounds.max" && change.value === 1));

  // Characteristics are exported as final values, while skill values are purchased
  // ranks. The free Athletics rank therefore adds to its exported purchased rank.
  assert.equal(
    actorData.system.characteristics.Brawn.value + 2 + 1,
    parsed.characteristics.Brawn,
  );
  assert.equal(
    actorData.system.skills.Athletics.rank + 1,
    2,
  );
});

test("exported specialization skills are marked as actor career skills", async () => {
  const parsed = parseHyperdrive(RAW);
  const { deps } = basicDeps();
  const { actorData } = await hyperdriveToActorData(parsed, deps);

  for (const skill of [
    "Discipline",
    "Coordination",
    "Mechanics",
    "Piloting: Planetary",
  ]) {
    assert.equal(
      actorData.system.skills[skill].careerskill,
      true,
      `${skill} should be marked as a career skill`,
    );
  }
  assert.equal(actorData.system.skills.Astrogation.careerskill, false);
});

test("Morality Strength/Weakness are preserved in flags and reported", async () => {
  const parsed = parseHyperdrive(RAW);
  const { deps } = basicDeps();
  const { actorData, report } = await hyperdriveToActorData(parsed, deps);

  // CharacterDataModel declares morality as {value, type, label} only (character.js:50),
  // so the pair is kept in flags rather than written to a path the model would drop.
  const stored = actorData.flags.starwarsffg.hyperdriveImport.morality;
  // The canonical keys must survive — display names are localised and cannot be matched on.
  assert.deepEqual(stored.strength, { key: "CAMARADERIE", name: "Camaraderie" });
  assert.deepEqual(stored.weakness, { key: "CLOSEDMIND", name: "Closed-mindedness" });
  // Nothing else from the source pair is dropped (WeakKey, Source, Type, …).
  assert.equal(stored.pairs.length, 1);
  assert.equal(stored.pairs[0].Strength.WeakKey, "CONFORMITY");
  assert.deepEqual(stored.pairs[0].Strength.Source, { _Page: "16", __text: "Knights of Fate" });
  assert.deepEqual(report.metadata.morality, stored);
  assert.ok(report.warnings.some((warning) => /Morality Strength \(Camaraderie\)/.test(warning)));
  // The numeric score still lands on the declared field.
  assert.equal(actorData.system.morality.value, 50);
});

test("unmatched equipment builds in-place and is included in the report", async () => {
  const parsed = parseHyperdrive(RAW);
  const { deps } = basicDeps();
  deps.resolve.getByKey = (type, key) =>
    type === "weapon" && key === "12DEFEND"
      ? {
        ref: {
          uuid: "weapon:12DEFEND",
          name: "12 Defender",
          type: "weapon",
          snapshot: {
            name: "12 Defender",
            type: "weapon",
            system: { itemattachment: [] },
            effects: [],
          },
        },
      }
      : null;
  const { actorData, report } = await hyperdriveToActorData(parsed, deps);
  assert.equal(actorData.items.find((item) => item.type === "weapon").system.quantity.value, 1);
  assert.ok(report.unmatched.some((item) => item.kind === "armour" && item.key === "HC"));
  assert.ok(report.unmatched.some((item) => item.kind === "gear"));
  assert.ok(report.findings.some((item) =>
    item.kind === "armour" && item.key === "HC" && item.reason === "not-found"));
});

test("empty narrative placeholders are skipped with warnings instead of invalid items", async () => {
  const parsed = parseHyperdrive({
    ...RAW,
    Background: {
      ...RAW.Background,
      Culture: {},
      Adventure: {},
      Force: null,
    },
    Obligations: [{}],
    Duties: [null],
    Motivations: [],
    Weapons: [null],
  });
  const { deps } = basicDeps();
  const { actorData, report } = await hyperdriveToActorData(parsed, deps);

  assert.ok(actorData.items.every((item) => String(item.name ?? "").trim()));
  for (const path of [
    "Background.Culture",
    "Background.Adventure",
    "Background.Force",
    "Obligations[0]",
    "Duties[0]",
    "Weapons[0]",
  ]) {
    assert.ok(report.warnings.some((warning) => warning.includes(path)), `missing warning for ${path}`);
  }
});

test("linked actor and matched-item images override local fallbacks", async () => {
  const parsed = parseHyperdrive({
    ...RAW,
    imageUrl: "https://example.test/character.webp",
    thumbnailUrl: "https://example.test/token.webp",
    Species: {
      ...RAW.Species,
      imageUrl: "https://example.test/species.webp",
    },
    Weapons: [{
      ...RAW.Weapons[0],
      imageUrl: "https://example.test/weapon.webp",
    }],
  });
  const { deps } = basicDeps();
  const { actorData } = await hyperdriveToActorData(parsed, deps);

  assert.equal(actorData.img, "https://example.test/character.webp");
  assert.equal(actorData.prototypeToken.texture.src, "https://example.test/token.webp");
  assert.equal(actorData.items.find((item) => item.type === "species").img, "https://example.test/species.webp");
  assert.equal(actorData.items.find((item) => item.type === "weapon").img, "https://example.test/weapon.webp");
});

test("export skill ids provide a fallback map for in-place weapons", async () => {
  const parsed = parseHyperdrive(RAW);
  const { deps } = basicDeps();
  const originalGet = deps.resolve.getByKey;
  deps.resolve.getByKey = (type, key) =>
    type === "weapon" && key === "UNARMED" ? null : originalGet(type, key);
  deps.buildInPlace = (kind, entry, options = {}) => ({
    source: {
      name: entry.Name,
      type: kind,
      system: {
        skill: { value: options.skillMap?.[entry.SkillKey] ?? entry.SkillKey },
      },
      effects: [],
    },
    warnings: [],
  });

  const { actorData } = await hyperdriveToActorData(parsed, deps);
  assert.equal(
    actorData.items.find((item) => item.name === "Unarmed").system.skill.value,
    "Brawl",
  );
});

test("a present but unmatched key falls back to name matching", async () => {
  const parsed = parseHyperdrive({
    ...RAW,
    Species: { ...RAW.Species, Key: "HOMEBREWSP" },
  });
  let speciesNameLookups = 0;
  const { deps } = basicDeps();
  const originalGet = deps.resolve.getByKey;
  deps.resolve.getByKey = (type, key) =>
    type === "species" && key === "HOMEBREWSP" ? null : originalGet(type, key);
  deps.resolve.getByName = (type, name) => {
    if (type !== "species" || name !== RAW.Species.Name) return null;
    speciesNameLookups += 1;
    return {
      ref: {
        uuid: "species:expanded-name-match",
        type: "species",
        snapshot: {
          name: "Mandalorian Human Species",
          type: "species",
          system: {},
          effects: [],
        },
      },
    };
  };
  const { actorData } = await hyperdriveToActorData(parsed, deps);
  assert.equal(speciesNameLookups, 1);
  assert.ok(actorData.items.some((item) => item.name === "Mandalorian Human Species"));
  assert.equal(actorData.items.some((item) =>
    item.flags?.starwarsffg?.ffgimportid === "HOMEBREWSP"), false);
});

test("matched career receives extra career-skill effects", async () => {
  const parsed = parseHyperdrive(RAW);
  parsed.extraCareerSkills = ["Deception"];
  const { deps } = basicDeps();
  const { actorData } = await hyperdriveToActorData(parsed, deps);
  const career = actorData.items.find((item) => item.type === "career");
  assert.deepEqual(career.effects.flatMap((effect) => effect.changes).find((change) =>
    change.key === "system.skills.Deception.careerskill"), {
    key: "system.skills.Deception.careerskill",
    mode: AE_MODES.ADD,
    value: true,
  });
});

test("Dedication grants are routed to the owning specialization materialization", async () => {
  const parsed = parseHyperdrive(RAW);
  const { deps } = basicDeps();
  const { actorData } = await hyperdriveToActorData(parsed, deps);
  const steel = actorData.items.find((item) => item.name === "STEELHAND");
  assert.deepEqual(steel.importOptions.nodeAttributeGrants.talent18.pcwDedication, {
    modtype: "Characteristic",
    mod: "Brawn",
    value: 1,
  });
});

test("driftReport skips absent prepared characteristic entries", () => {
  assert.deepEqual(driftReport({
    characteristics: { Brawn: 3, Agility: 4 },
    derived: { wounds: 18, strain: 13, soak: 4 },
  }, {
    characteristics: {},
    wounds: 18,
    strain: 13,
    soak: 4,
  }), []);
});
