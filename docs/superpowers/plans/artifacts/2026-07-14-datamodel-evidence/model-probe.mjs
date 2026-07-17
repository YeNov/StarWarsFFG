/**
 * Offline model probe: construct the SYSTEM'S REAL DataModel classes against
 * REAL stored data, outside Foundry. Answers exactly what a registered model
 * does to a stored document's system data.
 */
const APP = "D:/SW FFG/Portable FVTT 14/App/resources/app";

await import(`file:///${APP}/common/primitives/_module.mjs`); // Foundry's built-in extensions
const fields = await import(`file:///${APP}/common/data/fields.mjs`);
const dataMod = await import(`file:///${APP}/common/abstract/data.mjs`);
const typeDataMod = await import(`file:///${APP}/common/abstract/type-data.mjs`);
const helpers = await import(`file:///${APP}/common/utils/helpers.mjs`);

globalThis.foundry = {
  data: { fields, validators: {} },
  abstract: { DataModel: dataMod.default, TypeDataModel: typeDataMod.default },
  utils: helpers,
  CONST: {},
};
globalThis.CONST = {};
for (const [k, v] of Object.entries(helpers)) if (!(k in globalThis)) globalThis[k] = v;

const SYS = "D:/SW FFG/Portable FVTT/Data/systems/starwarsffg";
const { WeaponDataModel } = await import(`file:///${SYS}/modules/data/models/item/weapon.js`);

// A real stored weapon shape (the parts that matter), as found in the live DB.
const stored = {
  description: "<p>A real weapon</p>",
  attributes: {},
  metadata: { tags: [], sources: ["Core pg. 1"] },
  quantity: { value: 1, type: "Number", label: "Quantity", abrev: "Qty" },
  encumbrance: { value: 1, type: "Number", label: "Encumbrance", abrev: "Encum", adjusted: 1 },
  price: { value: 500, type: "Number", label: "Price", adjusted: 500 },
  rarity: { value: 5, isrestricted: true, type: "Number", label: "Rarity", adjusted: 5 },
  hardpoints: { value: 3, type: "Number", label: "Hard Points", abrev: "HP", adjusted: 3 },
  equippable: { value: true, type: "Boolean", equipped: true },
  itemattachment: [], itemmodifier: [], adjusteditemmodifer: [],
  skill: { value: "Ranged: Light", type: "String", label: "Skill" },
  damage: { value: 6, type: "Number", label: "Damage", abrev: "Dam", adjusted: 6 },
  crit: { value: 3, type: "Number", label: "Critical Rating", abrev: "Crit", adjusted: 3 },
  range: { value: "Short", type: "String", label: "Range", adjusted: "Short" },
  special: { value: "", type: "String", label: "Special" },
  ammo: { max: 0, value: 0 },
  status: "Minor Damage",     // <-- undeclared in the model
};

const probe = new WeaponDataModel(structuredClone(stored), { parent: null });
const out = probe.toObject();

console.log("=== What the registered model does to real stored data ===");
console.log("stored.rarity.isrestricted :", JSON.stringify(stored.rarity.isrestricted));
console.log("toObject().rarity         :", JSON.stringify(out.rarity));
console.log("stored.status             :", JSON.stringify(stored.status));
console.log("toObject().status         :", JSON.stringify(out.status));
console.log("");
console.log("PREPARED VIEW (what sheets/code read as `item.system.*`):");
console.log("  system.rarity.isrestricted :", JSON.stringify(probe.rarity?.isrestricted));
console.log("  system.status              :", JSON.stringify(probe.status));
console.log("");
console.log("VERDICT: isrestricted", ("isrestricted" in (out.rarity ?? {})) ? "SURVIVES" : "PRUNED from model output");
console.log("VERDICT: status      ", ("status" in out) ? "SURVIVES" : "PRUNED from model output");
