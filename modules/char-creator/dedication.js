const DEDICATION_NAME = "dedication";
export const DEDICATION_ATTRIBUTE_KEY = "pcwDedication";

function plainName(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .toLowerCase();
}

export function isDedicationTalent(talent) {
  return plainName(talent?.name) === DEDICATION_NAME;
}

export function dedicationCharacteristicAttribute(characteristic) {
  return { modtype: "Characteristic", mod: characteristic, value: 1 };
}

export function dedicationCharacteristicDeltas(talents = {}, purchases = []) {
  const deltas = {};
  for (const purchase of purchases ?? []) {
    const characteristic = purchase?.characteristic;
    if (!isDedicationTalent(talents[purchase?.key]) || !characteristic) continue;
    deltas[characteristic] = (deltas[characteristic] ?? 0) + 1;
  }
  return deltas;
}

export function dedicationNodeAttributeGrants(talents = {}, purchases = [], characteristics = {}) {
  const grants = {};
  for (const purchase of purchases ?? []) {
    const node = talents[purchase?.key];
    const characteristic = purchase?.characteristic;
    if (!isDedicationTalent(node) || !characteristic || !characteristics[characteristic]) continue;
    grants[purchase.key] = {
      ...(grants[purchase.key] ?? {}),
      [DEDICATION_ATTRIBUTE_KEY]: dedicationCharacteristicAttribute(characteristic),
    };
  }
  return grants;
}
