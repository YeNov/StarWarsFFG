/**
 * Refunding the purchases that have no Active Effect behind them.
 *
 * Only `_spendXp` (skill ranks, characteristics) ever created an effect named
 * `purchased-<id>`. Every other path charges the actor directly, because an Active
 * Effect can neither grant a document nor tick a talent-tree node:
 *
 *   - item grants  -- a force power / specialization / talent bought as an Item
 *   - tree nodes   -- `…islearned = true` on a specialization or force power
 *   - adjustments  -- a self XP adjustment, which moves available AND total
 *
 * All three logged with no id at all, so the shared ffg-block template hid the refund
 * button and the Codex template rendered it with an EMPTY data-id -- where
 * `ae.name.includes("")` is true for every effect, so a refund click deleted whichever
 * unrelated Active Effect came first (in practice, a talent's).
 *
 * They now carry an `undo` descriptor. Entries written before that carry nothing, and
 * must resolve to `none`: there is no record of what they bought.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the Codex XP log hides the refund button for entries with no purchase id", () => {
  const codex = read("templates/actors/codex-character.html");
  const entry = codex.split("\n").find((line) => line.includes('class="xp refund"'));
  assert.ok(entry, "could not locate the Codex refund button");
  assert.match(entry, /\{\{#if entry\.id\}\}/, "legacy id-less entries must not render a refund button");
});
