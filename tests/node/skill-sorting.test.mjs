import test from "node:test";
import assert from "node:assert/strict";

import { sortSkillsAsOnSheet } from "../../modules/char-creator/skill-sorting.js";

const types = [{ type: "General" }, { type: "Combat" }, { type: "Knowledge" }];
const skills = [
  { key: "KnowledgeLore", label: "Lore", type: "Knowledge" },
  { key: "Brawl", label: "Zuffa", type: "Combat" },
  { key: "Athletics", label: "Atletica", type: "General" },
  { key: "Charm", label: "Fascino", type: "General" },
  { key: "Gunnery", label: "Artiglieria", type: "Combat" },
];

test("sorts by character-sheet type order and original skill key", () => {
  assert.deepEqual(
    sortSkillsAsOnSheet(skills, types).map((skill) => skill.key),
    ["Athletics", "Charm", "Brawl", "Gunnery", "KnowledgeLore"],
  );
});

test("uses localized labels within each character-sheet group when configured", () => {
  assert.deepEqual(
    sortSkillsAsOnSheet(skills, types, { byLabel: true, locale: "it" }).map((skill) => skill.key),
    ["Athletics", "Charm", "Gunnery", "Brawl", "KnowledgeLore"],
  );
});
