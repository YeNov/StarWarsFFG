/**
 * Skill ordering shared by the PC wizard tables. It mirrors the character sheet:
 * skill-type groups stay in actor order, then each group sorts by key or localized
 * label according to the world's skillSorting setting.
 */

export function sheetSkillComparator(skillTypes = [], { byLabel = false, locale } = {}) {
  const typeOrder = new Map(skillTypes.map((entry, index) => [entry?.type ?? entry, index]));
  return (a, b) => {
    const aType = typeOrder.get(a?.type) ?? Number.MAX_SAFE_INTEGER;
    const bType = typeOrder.get(b?.type) ?? Number.MAX_SAFE_INTEGER;
    if (aType !== bType) return aType - bType;

    const aValue = byLabel ? (a?.label ?? a?.key) : (a?.key ?? a?.label);
    const bValue = byLabel ? (b?.label ?? b?.key) : (b?.key ?? b?.label);
    return String(aValue ?? "").localeCompare(String(bValue ?? ""), locale, { sensitivity: "base" });
  };
}

export function sortSkillsAsOnSheet(skills = [], skillTypes = [], options = {}) {
  return [...skills].sort(sheetSkillComparator(skillTypes, options));
}
