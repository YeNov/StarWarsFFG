/**
 * Species-granted skill rank choices for the PC wizard.
 *
 * Data lives on species.system.creation.skillRankChoices as an array of choice descriptors:
 * { id, label, count, rank, pool, skills, unique, maxRankAtCreation, choiceGroup }.
 * Rows with the same choiceGroup are alternatives: complete exactly one row in that group.
 */

const COMBAT_SKILLS = new Set(["Brawl", "Gunnery", "Lightsaber", "Melee", "Ranged: Heavy", "Ranged: Light"]);

function integerOr(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function slug(value, fallback) {
  const text = String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return text || fallback;
}

function creationOf(ref) {
  return ref?.snapshot?.system?.creation ?? ref?.system?.creation ?? {};
}

function selectedChoices(data) {
  const choices = data?.selected?.speciesSkillRankChoices;
  return choices && typeof choices === "object" ? choices : {};
}

function selectedBranches(data) {
  const branches = data?.selected?.speciesSkillRankChoiceBranches;
  return branches && typeof branches === "object" ? branches : {};
}

function ensureSelectedChoices(data) {
  data.selected ??= {};
  if (!data.selected.speciesSkillRankChoices || typeof data.selected.speciesSkillRankChoices !== "object") {
    data.selected.speciesSkillRankChoices = {};
  }
  return data.selected.speciesSkillRankChoices;
}

function ensureSelectedBranches(data) {
  data.selected ??= {};
  if (!data.selected.speciesSkillRankChoiceBranches || typeof data.selected.speciesSkillRankChoiceBranches !== "object") {
    data.selected.speciesSkillRankChoiceBranches = {};
  }
  return data.selected.speciesSkillRankChoiceBranches;
}

function normalizeChoice(choice, index) {
  const label = String(choice?.label ?? choice?.name ?? `Species skill choice ${index + 1}`);
  const skills = Array.isArray(choice?.skills) ? choice.skills.map(String).filter(Boolean) : [];
  const choiceGroup = String(choice?.choiceGroup ?? choice?.alternativeGroup ?? choice?.group ?? "").trim();
  return {
    ...choice,
    id: String(choice?.id ?? slug(label, `species-skill-choice-${index}`)),
    label,
    choiceGroup,
    choiceGroupLabel: String(choice?.choiceGroupLabel ?? choice?.groupLabel ?? choiceGroup).trim(),
    count: integerOr(choice?.count, 1),
    rank: Math.max(1, integerOr(choice?.rank, 1)),
    pool: String(choice?.pool ?? (skills.length ? "list" : "any")),
    skills,
    unique: choice?.unique !== false,
    maxRankAtCreation: choice?.maxRankAtCreation === undefined ? null : integerOr(choice.maxRankAtCreation, 0),
  };
}

export function getSpeciesSkillRankChoices(data) {
  const choices = creationOf(data?.selected?.species).skillRankChoices;
  if (!Array.isArray(choices)) return [];
  return choices.map(normalizeChoice).filter((choice) => choice.count > 0);
}

export function getSpeciesSkillRankChoiceStatus(data) {
  const choices = getSpeciesSkillRankChoices(data);
  const selections = selectedChoices(data);
  const branches = selectedBranches(data);
  const entries = [];
  const complete = [];
  const grouped = new Map();
  for (const choice of choices) {
    if (!choice.choiceGroup) {
      const selected = Array.isArray(selections[choice.id]) ? selections[choice.id] : [];
      entries.push({ id: choice.id, label: choice.label, used: selected.length, expected: choice.count });
      complete.push(selected.length === choice.count);
      continue;
    }
    const group = grouped.get(choice.choiceGroup) ?? [];
    group.push(choice);
    grouped.set(choice.choiceGroup, group);
  }

  for (const [groupId, groupChoices] of grouped) {
    const activeChoices = groupChoices.filter((choice) => {
      const selected = Array.isArray(selections[choice.id]) ? selections[choice.id] : [];
      return selected.length > 0;
    });
    const label = groupChoices.find((choice) => choice.choiceGroupLabel)?.choiceGroupLabel || groupId;
    const branchChoice = groupChoices.find((choice) => choice.id === branches[groupId]);
    if (activeChoices.length === 0 && !branchChoice) {
      entries.push({ id: `group:${groupId}`, label, used: 0, expected: 1 });
      complete.push(false);
      continue;
    }
    if (activeChoices.length > 1) {
      entries.push({ id: `group:${groupId}`, label, used: activeChoices.length, expected: 1 });
      complete.push(false);
      continue;
    }
    const choice = activeChoices[0] ?? branchChoice;
    const selected = Array.isArray(selections[choice.id]) ? selections[choice.id] : [];
    entries.push({ id: `group:${groupId}`, label: `${label}: ${choice.label}`, used: selected.length, expected: choice.count });
    complete.push(selected.length === choice.count);
  }

  return {
    entries,
    expected: entries.reduce((sum, entry) => sum + entry.expected, 0),
    used: entries.reduce((sum, entry) => sum + entry.used, 0),
    complete: complete.every(Boolean),
  };
}

export function getSpeciesSkillRankGrants(data) {
  const choices = getSpeciesSkillRankChoices(data);
  const selections = selectedChoices(data);
  const branches = selectedBranches(data);
  const grants = [];
  const activeGroupedChoices = new Map();
  for (const choice of choices) {
    if (!choice.choiceGroup) continue;
    if (activeGroupedChoices.has(choice.choiceGroup)) continue;
    if (branches[choice.choiceGroup]) {
      activeGroupedChoices.set(choice.choiceGroup, branches[choice.choiceGroup]);
      continue;
    }
    const selected = Array.isArray(selections[choice.id]) ? selections[choice.id] : [];
    if (selected.length) activeGroupedChoices.set(choice.choiceGroup, choice.id);
  }
  for (const choice of choices) {
    if (choice.choiceGroup && activeGroupedChoices.get(choice.choiceGroup) !== choice.id) continue;
    const selected = Array.isArray(selections[choice.id]) ? selections[choice.id].slice(0, choice.count) : [];
    for (const skill of selected) {
      if (choice.pool.toLowerCase() === "list" && !choice.skills.includes(skill)) continue;
      for (let n = 0; n < choice.rank; n++) grants.push(skill);
    }
  }
  return grants;
}

function matchesChoice(choice, skill) {
  const key = skill.key;
  const pool = choice.pool.toLowerCase();
  if (pool === "list") return choice.skills.includes(key) || choice.skills.includes(skill.label);
  if (pool === "noncareer" || pool === "non-career") return !skill.careerskill;
  if (pool === "career") return !!skill.careerskill;
  if (pool === "combat") return String(skill.type ?? "").toLowerCase() === "combat" || COMBAT_SKILLS.has(key);
  if (pool === "knowledge") return String(skill.type ?? "").toLowerCase() === "knowledge" || key.startsWith("Knowledge");
  return true;
}

export function prepareSpeciesSkillRankChoices(data, skills, { compare } = {}) {
  const selections = selectedChoices(data);
  const branches = selectedBranches(data);
  const activeGroups = new Map();
  for (const choice of getSpeciesSkillRankChoices(data)) {
    if (!choice.choiceGroup || activeGroups.has(choice.choiceGroup)) continue;
    if (branches[choice.choiceGroup]) {
      activeGroups.set(choice.choiceGroup, branches[choice.choiceGroup]);
      continue;
    }
    const selected = Array.isArray(selections[choice.id]) ? selections[choice.id] : [];
    if (selected.length) activeGroups.set(choice.choiceGroup, choice.id);
  }
  return getSpeciesSkillRankChoices(data).map((choice) => {
    const selected = Array.isArray(selections[choice.id]) ? selections[choice.id] : [];
    const activeGroupChoice = choice.choiceGroup ? activeGroups.get(choice.choiceGroup) : null;
    const blockedByAlternative = !!activeGroupChoice && activeGroupChoice !== choice.id;
    const rows = skills
      .filter((skill) => matchesChoice(choice, skill))
      .map((skill) => {
        const picked = selected.includes(skill.key);
        const maxRank = choice.maxRankAtCreation;
        const withinRankCap = maxRank === null || picked || ((Number(skill.rank) || 0) + choice.rank <= maxRank);
        const canAdd = !blockedByAlternative && selected.length < choice.count && (!choice.unique || !picked) && withinRankCap;
        return { ...skill, picked, canToggle: picked || canAdd };
      })
      .sort(compare ?? ((a, b) => String(a.label ?? a.key).localeCompare(String(b.label ?? b.key), undefined, { sensitivity: "base" })));
    return { ...choice, used: selected.length, rows };
  });
}

export function prepareSpeciesSkillRankChoiceSections(data, skills, options = {}) {
  const prepared = prepareSpeciesSkillRankChoices(data, skills, options);
  const sections = [];
  const grouped = new Map();
  for (const choice of prepared) {
    if (!choice.choiceGroup) {
      sections.push({ type: "choice", choice });
      continue;
    }
    const group = grouped.get(choice.choiceGroup) ?? {
      type: "group",
      id: choice.choiceGroup,
      label: choice.choiceGroupLabel || choice.choiceGroup,
      choices: [],
    };
    group.choices.push(choice);
    grouped.set(choice.choiceGroup, group);
  }
  for (const group of grouped.values()) {
    let activeChoice = group.choices.find((choice) => choice.rows.some((row) => row.picked));
    const branchId = selectedBranches(data)[group.id];
    if (branchId) activeChoice = group.choices.find((choice) => choice.id === branchId) ?? activeChoice;
    activeChoice ??= group.choices[0];
    group.activeChoiceId = activeChoice?.id ?? "";
    group.activeChoice = activeChoice ? { ...activeChoice, active: true } : null;
    group.choices = group.choices.map((choice) => ({ ...choice, active: choice.id === group.activeChoiceId }));
    sections.push(group);
  }
  return sections;
}

export function selectSpeciesSkillRankChoiceBranch(data, groupId, choiceId) {
  const groupChoices = getSpeciesSkillRankChoices(data).filter((choice) => choice.choiceGroup === groupId);
  if (!groupChoices.some((choice) => choice.id === choiceId)) return;
  const selections = ensureSelectedChoices(data);
  const branches = ensureSelectedBranches(data);
  branches[groupId] = choiceId;
  for (const choice of groupChoices) {
    if (choice.id !== choiceId) selections[choice.id] = [];
  }
}

export function toggleSpeciesSkillRankChoice(data, choiceId, skillKey) {
  const choice = getSpeciesSkillRankChoices(data).find((entry) => entry.id === choiceId);
  if (!choice || !skillKey) return;
  const selections = ensureSelectedChoices(data);
  const branches = ensureSelectedBranches(data);
  const selected = Array.isArray(selections[choice.id]) ? selections[choice.id] : [];
  const index = selected.indexOf(skillKey);
  if (index >= 0) selected.splice(index, 1);
  else if (selected.length < choice.count) {
    if (choice.choiceGroup) {
      branches[choice.choiceGroup] = choice.id;
      for (const groupChoice of getSpeciesSkillRankChoices(data)) {
        if (groupChoice.choiceGroup === choice.choiceGroup && groupChoice.id !== choice.id) selections[groupChoice.id] = [];
      }
    }
    selected.push(skillKey);
  }
  selections[choice.id] = selected;
}

export function clearSpeciesSkillRankChoices(data) {
  if (data?.selected) {
    data.selected.speciesSkillRankChoices = {};
    data.selected.speciesSkillRankChoiceBranches = {};
  }
}
