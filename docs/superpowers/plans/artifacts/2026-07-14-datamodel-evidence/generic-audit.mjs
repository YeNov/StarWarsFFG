/**
 * GENERIC discovery audit (Stage 1.2): for every stored document, construct its
 * REAL registered model class from raw DB source and report every leaf path the
 * model drops. Finds undeclared paths BY CONSTRUCTION — no hand-built list, so
 * module/macro-written paths surface too.
 *
 * Offline: reads LevelDB directly, never boots Foundry, never writes.
 * Usage: node generic-audit.mjs <label>=<dbPath> [...]
 */
const APP = "D:/SW FFG/Portable FVTT 14/App/resources/app";
const SYS = "D:/SW FFG/Portable FVTT/Data/systems/starwarsffg";

await import(`file:///${APP}/common/primitives/_module.mjs`);
const fields = await import(`file:///${APP}/common/data/fields.mjs`);
const dataMod = await import(`file:///${APP}/common/abstract/data.mjs`);
const typeDataMod = await import(`file:///${APP}/common/abstract/type-data.mjs`);
const helpers = await import(`file:///${APP}/common/utils/helpers.mjs`);
globalThis.foundry = {
  data: { fields, validators: {} },
  abstract: { DataModel: dataMod.default, TypeDataModel: typeDataMod.default },
  utils: helpers, CONST: {},
};
globalThis.CONST = {};
const { ClassicLevel } = (await import("module")).createRequire(import.meta.url)(
  `${APP}/node_modules/classic-level`,
);

const M = async (p) => await import(`file:///${SYS}/modules/data/models/${p}`);
const ITEM = {
  ability: (await M("item/ability.js")).AbilityDataModel,
  homesteadupgrade: (await M("item/homesteadupgrade.js")).HomesteadUpgradeDataModel,
  criticalinjury: (await M("item/criticalinjury.js")).CriticalInjuryDataModel,
  criticaldamage: (await M("item/criticaldamage.js")).CriticalDamageDataModel,
  background: (await M("item/background.js")).BackgroundDataModel,
  obligation: (await M("item/obligation.js")).ObligationDataModel,
  motivation: (await M("item/motivation.js")).MotivationDataModel,
  itemmodifier: (await M("item/itemmodifier.js")).ItemModifierDataModel,
  gear: (await M("item/gear.js")).GearDataModel,
  weapon: (await M("item/weapon.js")).WeaponDataModel,
  armour: (await M("item/armour.js")).ArmourDataModel,
  shipweapon: (await M("item/shipweapon.js")).ShipWeaponDataModel,
  shipattachment: (await M("item/shipattachment.js")).ShipAttachmentDataModel,
  itemattachment: (await M("item/itemattachment.js")).ItemAttachmentDataModel,
  talent: (await M("item/talent.js")).TalentDataModel,
  species: (await M("item/species.js")).SpeciesDataModel,
  forcepower: (await M("item/forcepower.js")).ForcePowerDataModel,
  specialization: (await M("item/specialization.js")).SpecializationDataModel,
  career: (await M("item/career.js")).CareerDataModel,
  signatureability: (await M("item/signatureability.js")).SignatureAbilityDataModel,
};
const ACTOR = {
  vehicle: (await M("actor/vehicle.js")).VehicleDataModel,
  homestead: (await M("actor/homestead.js")).HomesteadDataModel,
  minion: (await M("actor/minion.js")).MinionDataModel,
  rival: (await M("actor/rival.js")).RivalDataModel,
  nemesis: (await M("actor/nemesis.js")).NemesisDataModel,
  character: (await M("actor/character.js")).CharacterDataModel,
};
const MODELS = { ...ITEM, ...ACTOR };

function leaves(obj, prefix = "", out = new Map()) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) { out.set(prefix, obj); return out; }
  const keys = Object.keys(obj);
  if (!keys.length && prefix) out.set(prefix, obj);
  for (const k of keys) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) leaves(v, p, out);
    else out.set(p, v);
  }
  return out;
}

const dropped = new Map(); // "type|path" -> {count, sample, dbs:Set}
const errors = [];
let scanned = 0;

for (const arg of process.argv.slice(2)) {
  const [label, dbPath] = arg.split("=");
  const db = new ClassicLevel(dbPath, { valueEncoding: "json", keyEncoding: "utf8" });
  await db.open();
  for await (const [, doc] of db.iterator()) {
    const Cls = MODELS[doc?.type];
    if (!Cls || !doc.system) continue;
    scanned++;
    let out;
    try { out = new Cls(structuredClone(doc.system), { parent: null }).toObject(); }
    catch (e) { errors.push(`${doc.type} "${doc.name}": ${e.message}`); continue; }
    const before = leaves(doc.system), after = leaves(out);
    for (const [p, v] of before) {
      if (after.has(p)) continue;
      const key = `${doc.type}|${p}`;
      const rec = dropped.get(key) ?? { count: 0, sample: v, dbs: new Set() };
      rec.count++; rec.dbs.add(label);
      dropped.set(key, rec);
    }
  }
  await db.close();
}

// Collapse dynamic id-keyed paths (attributes.attrNNN.x, skills.Foo.bar) for readability
const norm = (p) => p
  .replace(/(^|\.)attr\d+(\.|$)/g, "$1attr<id>$2")
  .replace(/(^|\.)[A-Za-z0-9]{16}(\.|$)/g, "$1<id>$2");
const grouped = new Map();
for (const [key, rec] of dropped) {
  const [type, path] = key.split("|");
  const k = `${type}|${norm(path)}`;
  const g = grouped.get(k) ?? { count: 0, sample: rec.sample, dbs: new Set() };
  g.count += rec.count; for (const d of rec.dbs) g.dbs.add(d);
  grouped.set(k, g);
}

console.log(`=== GENERIC MODEL-DIFF AUDIT — ${scanned} docs constructed against their real model ===\n`);
if (!grouped.size) console.log("No dropped paths. Every stored path is declared.");
const rows = [...grouped.entries()].sort((a, b) => b[1].count - a[1].count);
console.log("DROPPED PATH (stored but NOT in schema)".padEnd(62) + "DOCS".padStart(6) + "  SAMPLE VALUE");
for (const [k, g] of rows) {
  const [type, path] = k.split("|");
  const sample = JSON.stringify(g.sample);
  console.log(`${(type + " . " + path).padEnd(62)}${String(g.count).padStart(6)}  ${String(sample).slice(0, 34)}`);
}
if (errors.length) { console.log(`\n=== CONSTRUCTION ERRORS (${errors.length}) ===`); for (const e of errors.slice(0, 10)) console.log("  " + e); }
