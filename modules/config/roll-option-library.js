/**
 * The roll option library: ready-made option code for well-known talents and qualities
 * (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "The library").
 *
 * The GM's library run (modules/helpers/roll-option-library-run.js) writes each entry into a world
 * macro and links that macro into every item with a matching name. Names match through
 * normalizeName, so "Auto-fire", "Autofire" and "Auto Fire" are one name. The OggDude importer
 * produces these same names.
 *
 * The labels and hints are English, like the book names: once installed they are the GM's macro
 * text to edit.
 *
 * Checked against the talents' rule text. Saber Swarm's text says "this turn" rather than
 * "once per round"; the hint follows what the user accepted in the design.
 */
import { normalizeName } from "../helpers/roll-options.js";

const entry = (id, kind, names, options) => Object.freeze({
  id,
  kind,
  names: Object.freeze(names),
  macroName: `Roll option: ${names[0]}`,
  options: Object.freeze(options),
});

export const ROLL_OPTION_LIBRARY = Object.freeze([
  entry("auto-fire", "quality", ["Auto-fire"], [
    { id: "auto-fire", label: "Auto-fire", offer: { attack: true }, dice: { difficulty: 1 } },
  ]),
  entry("intense-focus", "talent", ["Intense Focus"], [
    { id: "intense-focus", label: "Intense Focus", cost: { strain: 1, maneuvers: 1 }, dice: { upgradeAbility: 1 } },
  ]),
  entry("frenzied-attack", "talent", ["Frenzied Attack"], [
    {
      id: "frenzied-attack",
      label: "Frenzied Attack",
      offer: { skills: ["Melee", "Brawl"] },
      amount: { max: "ranks", label: "Strain" },
      cost: { strain: "amount" },
      dice: { upgradeAbility: "amount" },
    },
  ]),
  entry("guns-blazing", "talent", ["Guns Blazing"], [
    {
      id: "guns-blazing",
      label: "Guns Blazing",
      offer: { skills: ["Ranged: Light"], twoWeapons: "same" },
      cost: { strain: 2 },
      dice: { difficulty: -1 },
    },
  ]),
  entry("saber-swarm", "talent", ["Saber Swarm"], [
    {
      id: "saber-swarm",
      label: "Saber Swarm",
      hint: "Once per round",
      offer: { skills: ["Lightsaber"] },
      cost: { strain: 1, maneuvers: 1 },
    },
  ]),
  entry("true-aim", "talent", ["True Aim"], [
    {
      id: "true-aim",
      label: "True Aim",
      hint: "Once per round",
      offer: { skillTypes: ["Combat"] },
      cost: { maneuvers: 1 },
      dice: { boost: 1, upgradeAbility: "ranks" },
    },
  ]),
  entry("sniper-shot", "talent", ["Sniper Shot"], [
    {
      id: "sniper-shot",
      label: "Sniper Shot",
      hint: "Not thrown weapons",
      offer: { skills: ["Ranged: Light", "Ranged: Heavy", "Gunnery"] },
      amount: { max: "ranks", label: "Range bands" },
      cost: { maneuvers: 1 },
      dice: { upgradeDifficulty: "amount" },
    },
  ]),
  entry("point-blank", "talent", ["Point Blank"], [
    {
      id: "point-blank",
      label: "Point Blank",
      hint: "Short range or engaged",
      offer: { skills: ["Ranged: Light", "Ranged: Heavy"] },
    },
  ]),
]);

/**
 * The library entry for an item of this kind and name, or null.
 * @param {"talent"|"quality"} kind
 * @param {string} name
 * @returns {object|null}
 */
export function libraryEntryFor(kind, name) {
  const key = normalizeName(name);
  if (!key) return null;
  return ROLL_OPTION_LIBRARY.find((e) => e.kind === kind && e.names.some((n) => normalizeName(n) === key)) ?? null;
}
