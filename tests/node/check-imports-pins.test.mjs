/**
 * GATE-IMPORTS pin support — negative tests (plan DEV-17).
 *
 * DEV-17 relaxed the gate's pass condition from "zero findings" to "zero findings that are not
 * pinned". That is a mechanism whose failure mode is silence: a pin file that matches too much
 * turns a repo-wide boot defence into a gate that reports nothing, and the exit code looks
 * identical either way. So the mechanism is pinned from both sides here, on the same standard the
 * rules themselves were held to in check-imports-rules.test.mjs:
 *
 *   - a pinned finding passes                       (the mechanism works)
 *   - an unpinned finding fails                     (it did not swallow everything)
 *   - a pin that moved / vanished / changed /
 *     multiplied fails                              (it does not drift with the tree)
 *   - a rule-wide or file-wide pin is MALFORMED     (it cannot be widened)
 *   - a second defect one line from the pin fails    (rule 2 still runs everywhere)
 *
 * Fixtures are written into throwaway roots and the checker is pointed at them with `--root` plus
 * an explicit `--baseline`, so the real repo and its real baseline are never mutated.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "./_stub/foundry-stub.mjs";
import { parseBaseline, applyPins, evaluateImports } from "../../tools/check-imports.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * A fixture tree whose only finding is one rule-2 miss at modules/apps/sheet.js:3.
 * The two leading lines exist so a "moved" pin has somewhere to have moved from.
 *
 * `MISS` is assembled through a template literal on purpose: rule 2 scans `tests/**` too, and a
 * bare `"systems/starwarsffg/…"` constant here would be a real finding in this very file. The
 * `SYS` half resolves to the repo root, which is an existing directory, so it is accepted.
 */
const SHEET = "modules/apps/sheet.js";
const SYS = "systems/starwarsffg/";
const MISS = `${SYS}templates/actors/ffg-nope.html`;
const SHEET_SRC =
  "// a leading comment\n" +
  "const unrelated = 1;\n" +
  `const t = "${MISS}";\n` +
  "export const x = [unrelated, t];\n";

const MISS_MESSAGE = `Foundry-style path "${MISS}" does not resolve under the repo root`;
const GOOD_PIN = `2 | ${SHEET}:3 | YeNov/StarWarsFFG#29 | ${MISS_MESSAGE}`;

/**
 * @param {Record<string,string>} files repo-relative path -> source
 * @param {string|null} baseline pin-file contents, or null for "no baseline file at all"
 */
function withFixture(files, baseline, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swffg-pins-"));
  try {
    for (const [rel, src] of Object.entries(files)) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, src);
    }
    const baselinePath = path.join(root, "imports-baseline.txt");
    if (baseline !== null) fs.writeFileSync(baselinePath, baseline);
    return fn({ root, baselinePath });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const evaluate = ({ root, baselinePath }) =>
  evaluateImports({ root, cutover: false, baselinePath });

// ---------------------------------------------------------------------------
// The mechanism works — and only as far as the pin reaches
// ---------------------------------------------------------------------------

test("a pinned finding passes", () => {
  withFixture({ [SHEET]: SHEET_SRC }, GOOD_PIN, (fx) => {
    const r = evaluate(fx);
    assert.equal(r.findings.length, 1, JSON.stringify(r.findings));
    assert.deepEqual(r.unpinned, []);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.baselineErrors, []);
    assert.equal(r.ok, true);
  });
});

test("an UNPINNED finding fails — the pin file did not swallow the rest of the tree", () => {
  withFixture({
    [SHEET]: SHEET_SRC,
    "modules/apps/other.js": 'const t = "systems/starwarsffg/templates/actors/also-gone.html";\nexport const y = t;\n',
  }, GOOD_PIN, (fx) => {
    const r = evaluate(fx);
    assert.equal(r.ok, false);
    assert.equal(r.unpinned.length, 1, JSON.stringify(r.unpinned));
    assert.equal(r.unpinned[0].file, "modules/apps/other.js");
    assert.match(r.unpinned[0].message, /also-gone\.html/);
  });
});

test("a SECOND defect one line from the pin still fails — rule 2 keeps running everywhere", () => {
  // The load-bearing DEV-17 property: pinning import-helpers.js:2961 must not blind rule 2 to a
  // second template.json-shaped defect, not even in the very same file.
  withFixture({
    [SHEET]:
      "// a leading comment\n" +
      "const unrelated = 1;\n" +
      `const t = "${MISS}";\n` +
      'const u = "systems/starwarsffg/template.json";\n' +
      "export const x = [unrelated, t, u];\n",
  }, GOOD_PIN, (fx) => {
    const r = evaluate(fx);
    assert.equal(r.ok, false);
    assert.equal(r.unpinned.length, 1, JSON.stringify(r.unpinned));
    assert.equal(r.unpinned[0].line, 4);
    assert.match(r.unpinned[0].message, /template\.json/);
  });
});

test("with NO baseline file every finding counts — absence of pins is the strict direction", () => {
  withFixture({ [SHEET]: SHEET_SRC }, null, (fx) => {
    const r = evaluate(fx);
    assert.equal(r.baselineExists, false);
    assert.equal(r.ok, false);
    assert.equal(r.unpinned.length, 1);
  });
});

// ---------------------------------------------------------------------------
// The pin does not drift with the tree
// ---------------------------------------------------------------------------

test("a pin whose finding MOVED fails — twice: the pin vanished and the new line is unpinned", () => {
  withFixture({
    // Same defect, now on line 4 — an inserted line above it.
    [SHEET]:
      "// a leading comment\n" +
      "const unrelated = 1;\n" +
      "const inserted = 2;\n" +
      `const t = "${MISS}";\n` +
      "export const x = [unrelated, inserted, t];\n",
  }, GOOD_PIN, (fx) => {
    const r = evaluate(fx);
    assert.equal(r.ok, false);
    assert.equal(r.problems.length, 1, JSON.stringify(r.problems));
    assert.equal(r.problems[0].kind, "vanished");
    assert.equal(r.unpinned.length, 1, JSON.stringify(r.unpinned));
    assert.equal(r.unpinned[0].line, 4);
  });
});

test("a VANISHED pin fails — a fixed defect must be de-pinned deliberately, not silently", () => {
  withFixture({
    "templates/actors/ffg-nope.html": "<div></div>\n",   // the path now resolves
    [SHEET]: SHEET_SRC,
  }, GOOD_PIN, (fx) => {
    const r = evaluate(fx);
    assert.deepEqual(r.findings, []);
    assert.equal(r.ok, false, "a clean tree with a stale pin must NOT pass");
    assert.equal(r.problems.length, 1);
    assert.equal(r.problems[0].kind, "vanished");
    assert.match(r.problems[0].message, /re-verify the pin against YeNov\/StarWarsFFG#29/);
  });
});

test("a pin whose finding CHANGED fails — the message is part of the pin", () => {
  const stalePin = `2 | ${SHEET}:3 | #29 | Foundry-style path "systems/starwarsffg/templates/actors/ffg-old.html" does not resolve under the repo root`;
  withFixture({ [SHEET]: SHEET_SRC }, stalePin, (fx) => {
    const r = evaluate(fx);
    assert.equal(r.ok, false);
    assert.equal(r.problems.length, 1, JSON.stringify(r.problems));
    assert.equal(r.problems[0].kind, "changed");
    assert.match(r.problems[0].message, /ffg-nope\.html/);
  });
});

test("a pin whose finding MULTIPLIED fails — a pin covers exactly one finding", () => {
  withFixture({
    // Two distinct unresolvable Foundry paths on the SAME line.
    [SHEET]:
      "// a leading comment\n" +
      "const unrelated = 1;\n" +
      `const t = ["${MISS}", "systems/starwarsffg/templates/actors/ffg-nope-2.html"];\n` +
      "export const x = [unrelated, t];\n",
  }, GOOD_PIN, (fx) => {
    const r = evaluate(fx);
    assert.equal(r.ok, false);
    assert.equal(r.problems.length, 1, JSON.stringify(r.problems));
    assert.equal(r.problems[0].kind, "multiplied");
    assert.match(r.problems[0].message, /now yields 2 findings/);
  });
});

// ---------------------------------------------------------------------------
// The pin cannot be widened
// ---------------------------------------------------------------------------

test("a RULE-WIDE pin is malformed and does not suppress anything", () => {
  for (const wide of ["2", "2 | * | #29 | anything", "* | modules/apps/sheet.js:3 | #29 | x"]) {
    withFixture({ [SHEET]: SHEET_SRC }, wide, (fx) => {
      const r = evaluate(fx);
      assert.equal(r.ok, false, `"${wide}" must not pass`);
      assert.equal(r.pins.length, 0, `"${wide}" must produce no pin`);
      assert.equal(r.baselineErrors.length, 1, JSON.stringify(r.baselineErrors));
      assert.equal(r.unpinned.length, 1, "the real finding is still reported");
    });
  }
});

test("a FILE-WIDE pin is malformed and does not suppress anything", () => {
  for (const wide of [
    `2 | ${SHEET} | #29 | ${MISS_MESSAGE}`,
    `2 | ${SHEET}:* | #29 | ${MISS_MESSAGE}`,
    `2 | modules/apps/*.js:3 | #29 | ${MISS_MESSAGE}`,
  ]) {
    withFixture({ [SHEET]: SHEET_SRC }, wide, (fx) => {
      const r = evaluate(fx);
      assert.equal(r.ok, false, `"${wide}" must not pass`);
      assert.equal(r.pins.length, 0, `"${wide}" must produce no pin`);
      assert.equal(r.baselineErrors.length, 1, JSON.stringify(r.baselineErrors));
      assert.equal(r.unpinned.length, 1, "the real finding is still reported");
    });
  }
});

test("a pin with no tracking issue is malformed — an untracked finding is not pinnable", () => {
  for (const noIssue of [
    `2 | ${SHEET}:3 |  | ${MISS_MESSAGE}`,
    `2 | ${SHEET}:3 | pre-existing | ${MISS_MESSAGE}`,
    `2 | ${SHEET}:3 | TODO later | ${MISS_MESSAGE}`,
  ]) {
    withFixture({ [SHEET]: SHEET_SRC }, noIssue, (fx) => {
      const r = evaluate(fx);
      assert.equal(r.ok, false);
      assert.equal(r.pins.length, 0);
      assert.equal(r.baselineErrors.length, 1, JSON.stringify(r.baselineErrors));
      assert.match(r.baselineErrors[0], /not a tracking issue/);
    });
  }
});

test("a pin with an empty message is malformed — a pin must name the exact finding", () => {
  withFixture({ [SHEET]: SHEET_SRC }, `2 | ${SHEET}:3 | #29 |`, (fx) => {
    const r = evaluate(fx);
    assert.equal(r.ok, false);
    assert.equal(r.pins.length, 0);
    assert.equal(r.baselineErrors.length, 1);
  });
});

test("duplicate pins for one triple are malformed — otherwise a stale copy hides a multiplication", () => {
  withFixture({ [SHEET]: SHEET_SRC }, `${GOOD_PIN}\n${GOOD_PIN}\n`, (fx) => {
    const r = evaluate(fx);
    assert.equal(r.ok, false);
    assert.equal(r.pins.length, 1);
    assert.equal(r.baselineErrors.length, 1);
    assert.match(r.baselineErrors[0], /duplicate pin/);
  });
});

// ---------------------------------------------------------------------------
// parseBaseline / applyPins units
// ---------------------------------------------------------------------------

test("blank lines and # comments are commentary, not pins", () => {
  const { pins, errors } = parseBaseline(
    "# a heading\n\n   \n" + GOOD_PIN + "\n# trailing note\n",
  );
  assert.deepEqual(errors, []);
  assert.equal(pins.length, 1);
  assert.deepEqual(
    { rule: pins[0].rule, file: pins[0].file, line: pins[0].line, issue: pins[0].issue },
    { rule: 2, file: SHEET, line: 3, issue: "YeNov/StarWarsFFG#29" },
  );
});

test("a message containing a | survives the split", () => {
  const { pins, errors } = parseBaseline(`2 | a/b.js:1 | #7 | left | right\n`);
  assert.deepEqual(errors, []);
  assert.equal(pins[0].message, "left | right");
});

test("a finding with no line is never pinnable — there is no exact triple for it", () => {
  const findings = [{ rule: 4, file: "templates/x.html", line: null, message: "m" }];
  const { unpinned, problems } = applyPins(findings, parseBaseline("4 | templates/x.html:1 | #7 | m").pins);
  assert.equal(unpinned.length, 1);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, "vanished");
});

// ---------------------------------------------------------------------------
// The real repo baseline
// ---------------------------------------------------------------------------

test("the committed baseline is well-formed and every pin carries an issue", () => {
  const file = path.join(
    REPO_ROOT, "superpowers/docs/plans/PcWizard/baselines/imports-baseline.txt",
  );
  const { pins, errors } = parseBaseline(fs.readFileSync(file, "utf8"));
  assert.deepEqual(errors, [], "the committed baseline must have no malformed pin");
  assert.ok(pins.length > 0, "the baseline exists precisely because it carries pins");
  for (const pin of pins) assert.match(pin.issue, /#\d+$/);
});

test("GATE-IMPORTS passes on the real tree, and its pins have not become the whole report", () => {
  const r = evaluateImports({ root: REPO_ROOT, cutover: false });
  assert.equal(r.baselineExists, true);
  assert.deepEqual(r.baselineErrors, []);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.unpinned, [], "unpinned findings on the real tree");
  // Stage 1 pins exactly one finding. If this ever needs raising, it is an owner decision, not a
  // quiet edit — the count is asserted so growth cannot be silent.
  assert.equal(r.pins.length, 1);
  assert.equal(r.findings.length, 1);
});
