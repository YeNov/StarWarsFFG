const OBLIGATION_TYPE_LABELS = Object.freeze({
  obligation: "SWFFG.DescriptionObligation",
  morality: "SWFFG.DescriptionMorality",
  duty: "SWFFG.DescriptionDuty",
});

/**
 * Return the localization key for a Codex item header pill.
 *
 * Obligation, Morality, and Duty share the Foundry `obligation` item type; the
 * actual category is stored in system.type. Other item types use their standard
 * Foundry type label.
 */
export function codexItemTypeLabelKey(itemType, systemType) {
  if (itemType === "obligation") {
    return OBLIGATION_TYPE_LABELS[String(systemType ?? "").trim().toLowerCase()]
      ?? "TYPES.Item.obligation";
  }
  return itemType ? `TYPES.Item.${itemType}` : "";
}
