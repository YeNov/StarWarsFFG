/**
 * Pure data-layer helpers for the "Replace a rolled die" feature — FFG-totals
 * recompute and in-place term/result splicing, independent of DOM/dialog/
 * persistence code (that lives in ../helpers/replace-die.js).
 *
 * See docs/superpowers/specs/2026-07-18-dice-replacement-design_doc_v3.md §5.2.
 */

// Denomination -> the CONFIG.FFG per-face result table for that die type.
export const RESULTS_BY_DENOM = {
  p: "PROFICIENCY_RESULTS",
  a: "ABILITY_RESULTS",
  b: "BOOST_RESULTS",
  i: "DIFFICULTY_RESULTS",
  c: "CHALLENGE_RESULTS",
  s: "SETBACK_RESULTS",
  f: "FORCE_RESULTS",
};

// Denomination -> localized die-name key, for the fresh-die picker and the
// Force-die label fallback (Force faces carry an empty result label).
export const DIE_NAME = {
  p: "SWFFG.DiceProficiency",
  a: "SWFFG.DiceAbility",
  b: "SWFFG.DiceBoost",
  i: "SWFFG.DiceDifficulty",
  c: "SWFFG.DiceChallenge",
  s: "SWFFG.DiceSetback",
  f: "SWFFG.DiceForce",
};

// Symbol type -> the fixed chat token, per design §5.1. Used both to append a
// Result-mode symbol and to re-normalize `addedResults[].symbol` before
// persisting (undoing the `updateSymbols()` HTML enrichment).
export const TOKEN = {
  Success: "[SU]",
  Failure: "[FA]",
  Advantage: "[AD]",
  Threat: "[TH]",
  Triumph: "[TR]",
  Despair: "[DE]",
  Light: "[LI]",
  Dark: "[DA]",
};

export const zeroTally = () => ({ success: 0, failure: 0, advantage: 0, threat: 0, triumph: 0, despair: 0, light: 0, dark: 0 });

/**
 * The per-face FFG symbol tally for a single die result, defensively.
 * @param {object} die — a DiceTerm (or term-shaped stand-in with `constructor.DENOMINATION`).
 * @param {object} r — a single result object from `die.results`.
 * @returns {object|null} the tally, or null for a discarded/inactive/malformed face.
 */
export function faceTally(die, r) {
  if (!r || r.active === false) return null; // skip discarded/inactive faces
  if (r.ffg) return r.ffg; // normal path (round-tripped)
  const table = CONFIG.FFG?.[RESULTS_BY_DENOM[die?.constructor?.DENOMINATION]];
  return table?.[r.result] ?? null; // recover legacy/malformed face
}

/**
 * Pure FFG totals from raw per-face tallies plus injected symbols, with the
 * same cancellation and triumph/despair coupling as `RollFFG#evaluate()`.
 * @param {Array<object|null>} faceTallies
 * @param {Array<object>} added — `roll.addedResults`-shaped entries.
 */
export function computeFFGTotals(faceTallies, added) {
  const t = zeroTally();
  for (const f of faceTallies) if (f) for (const k of Object.keys(t)) t[k] += Number(f[k]) || 0;
  for (const a of added) {
    const v = (a.negative ? -1 : 1) * (Number(a.value) || 0);
    switch (a.type) {
      case "Success": t.success += v; break;
      case "Failure": t.failure += v; break;
      case "Advantage": t.advantage += v; break;
      case "Threat": t.threat += v; break;
      case "Light": t.light += v; break;
      case "Dark": t.dark += v; break;
      case "Triumph": t.triumph += v; t.success += v; break; // coupling (constructor parity)
      case "Despair": t.despair += v; t.failure += v; break; // coupling (constructor parity)
    }
  }
  if (t.success < t.failure) { t.failure -= t.success; t.success = 0; }
  else { t.success -= t.failure; t.failure = 0; }
  if (t.advantage < t.threat) { t.threat -= t.advantage; t.advantage = 0; }
  else { t.advantage -= t.threat; t.threat = 0; }
  return t; // light/dark and triumph/despair intentionally uncancelled — matches evaluate()
}

/** Keep `term.ffg` internally consistent after mutating `term.results`. */
export function recomputeTermFFG(term) {
  const agg = zeroTally();
  for (const r of term.results) {
    const f = faceTally(term, r);
    if (f) for (const k of Object.keys(agg)) agg[k] += Number(f[k]) || 0;
  }
  term.ffg = agg;
}

/** Recompute `roll.ffg` from scratch from the current dice + addedResults. */
export function recomputeRollFFG(roll) {
  const faces = roll.dice
    .filter((d) => game.ffg.diceterms.includes(d.constructor))
    .flatMap((d) => d.results.map((r) => faceTally(d, r)))
    .filter(Boolean);
  roll.ffg = computeFFGTotals(faces, roll.addedResults ?? []);
}

/**
 * Build an evaluated one-type term from already-evaluated result objects
 * (used when a multi-die term is split; reuses the existing result objects,
 * no re-roll).
 * @param {typeof foundry.dice.terms.DiceTerm} SourceClass
 * @param {Array<object>} results
 */
export function cloneEvaluatedTerm(SourceClass, results) {
  const t = new SourceClass(1); // ctor arg immaterial; we set number/results explicitly
  t.results = results;
  t.number = results.length;
  t._evaluated = true;
  t._isFFG = true;
  recomputeTermFFG(t);
  return t;
}

/**
 * Splice a fresh term into `terms[ti]` at result index `j`, preserving glyph
 * order. Same-denomination replacement stays a single term at the same
 * position; cross-denomination splits the term around `j` and drops the
 * fresh term into the gap, joined with real additive operator terms.
 *
 * Adapters are injected so this stays pure and Foundry-shape-agnostic:
 * `getDenom(term)` -> denomination string; `makeOperator("+")` -> an additive
 * operator term; `makeTerm(sourceTerm, results)` -> a term of sourceTerm's
 * type carrying `results`.
 * @param {Array<object>} terms
 * @param {number} ti — index of the term being replaced within `terms`.
 * @param {number} j — index of the result being replaced within `terms[ti].results`.
 * @param {object} freshTerm — the replacement term (already evaluated, one result).
 * @param {{getDenom: Function, makeOperator: Function, makeTerm: Function}} adapters
 */
export function spliceReplacement(terms, ti, j, freshTerm, { getDenom, makeOperator, makeTerm }) {
  const term = terms[ti];
  const before = term.results.slice(0, j);
  const after = term.results.slice(j + 1);
  let segments;
  if (getDenom(freshTerm) === getDenom(term)) {
    // Same type → in-place single-face swap; stays one term, position unchanged.
    const results = term.results.slice();
    results[j] = freshTerm.results[0];
    segments = [makeTerm(term, results)];
  } else {
    // Different type → split the term around j and drop the fresh one-die term into the gap.
    segments = [];
    if (before.length) segments.push(makeTerm(term, before));
    segments.push(freshTerm);
    if (after.length) segments.push(makeTerm(term, after));
  }
  const insert = [];
  segments.forEach((s, k) => { if (k) insert.push(makeOperator("+")); insert.push(s); }); // real ops
  const out = terms.slice();
  out.splice(ti, 1, ...insert);
  return out;
}

/**
 * A defensive, localized label for a removed face — used both as the modal's
 * dialog title and the audit line's "original" label. Force faces have empty
 * result labels, so those fall back to the die-type name.
 * @param {object} term
 * @param {object} r
 */
export function localizeFaceLabel(term, r) {
  const denom = term?.constructor?.DENOMINATION;
  const table = CONFIG.FFG?.[RESULTS_BY_DENOM[denom]];
  const raw = r?.ffg?.label ?? table?.[r?.result]?.label ?? "";
  return raw ? game.i18n.localize(raw) : game.i18n.localize(DIE_NAME[denom] ?? "");
}
