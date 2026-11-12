import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { restoreDiceCodes } from "../../modules/helpers/restore-dice-codes.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// Before the closed-editor fix, a sheet submit could save the drawn glyph spans
// over the [CH]/[DI] codes. Opening such text in ProseMirror keeps each glyph as
// a span mark, and typing after the last one extends it. Turning the glyphs back
// into codes on the way into the editor repairs those entries on their next save.

const span = (type, text, q = '"', theme = "starwars") => `<span class=${q}dietype ${theme} ${type}${q}>${text}</span>`;

test("glyph spans become their codes", () => {
  const html = `<p>Roll ${span("challenge", "c")}${span("difficulty", "d")}${span("difficulty", "d")}${span("boost", "b")}</p>`;
  assert.equal(restoreDiceCodes(html), "<p>Roll [CH][DI][DI][BO]</p>");
});

test("single-quoted spans from renderDiceImages and other dice themes are restored", () => {
  assert.equal(restoreDiceCodes(span("advantage", "a", "'", "genesys")), "[AD]");
  assert.equal(restoreDiceCodes(span("triumph", "x")), "[TR]");
});

test("every glyph type maps to a code", () => {
  const cases = {
    ability: "[AB]", advantage: "[AD]", boost: "[BO]", challenge: "[CH]", dark: "[DA]", despair: "[DE]",
    difficulty: "[DI]", forcepoint: "[FP]", failure: "[FA]", force: "[FO]", light: "[LI]", proficiency: "[PR]",
    remsetback: "[RS]", restricted: "[RE]", setback: "[SE]", success: "[SU]", threat: "[TH]", triumph: "[TR]",
    adddifficulty: "[DD]", updifficulty: "[UD]", cancelthreat: "[CT]",
  };
  for (const [type, code] of Object.entries(cases)) assert.equal(restoreDiceCodes(span(type, "z")), code, type);
});

test("a multi-die difficulty glyph becomes one code per die", () => {
  assert.equal(restoreDiceCodes(span("difficulty", "ddd")), "[DI][DI][DI]");
  assert.equal(restoreDiceCodes(span("difficulty", "di")), "[DI][DI]");
});

test("text typed inside a glyph span is kept after the code", () => {
  assert.equal(restoreDiceCodes(`<p>${span("difficulty", "d then [BO]")}</p>`), "<p>[DI] then [BO]</p>");
});

test("a glyph rendered inside another glyph's span is restored too", () => {
  const nested = span("difficulty", `d ${span("boost", "b")}`);
  assert.equal(restoreDiceCodes(`<p>${nested}</p>`), "<p>[DI] [BO]</p>");
});

test("other spans and plain text are left alone", () => {
  const html = '<p><span class="bold">Hi</span> [CH] <span class="dietype starwars unknown">q</span></p>';
  assert.equal(restoreDiceCodes(html), html);
  assert.equal(restoreDiceCodes(""), "");
  assert.equal(restoreDiceCodes(undefined), "");
});

test("the inline and popout editors restore codes before ProseMirror parses the field", () => {
  assert.match(read("modules/apps/ffg-document-sheet.js"), /const initial = restoreDiceCodes\(foundry\.utils\.getProperty\(this\.document, name\) \?\? ""\);/);
  assert.match(read("modules/items/item-editor.js"), /const initial = restoreDiceCodes\(foundry\.utils\.getProperty\(this\.data\.clickedObject, name\) \?\? ""\);/);
  assert.match(read("modules/popout-editor.js"), /value: restoreDiceCodes\(attr\)/);
});
