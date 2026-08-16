/**
 * Guards the Codex button-defence block in styles/cdx.css.
 *
 * Third-party UI modules restyle every `form button` at a specificity no
 * `.cdx-*` rule can reach (Carolingian UI, for one, wipes background and border
 * and repaints the text). cdx.css defends against that with a single
 * !important consumer reading --cdx-btn-* tokens, applied to an EXPLICIT list of
 * button classes -- explicit rather than a bare `button` because the Bio tab
 * embeds TinyMCE and ProseMirror inside the same form and their toolbars are
 * <button>s, which a blanket rule would flatten.
 *
 * An explicit list rots silently: add a button, forget the list, and the only
 * symptom is a flattened control on the machines of users who happen to run such
 * a module. This test makes that a build failure instead.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATE_DIRS = [
  join(ROOT, "templates", "actors", "codex"),
  join(ROOT, "templates", "items", "codex"),
  join(ROOT, "templates", "parts", "codex"),
];

/** Every .html under the given dirs, recursively. */
function templateFiles(dirs) {
  const out = [];
  for (const dir of dirs) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // a codex template dir may legitimately not exist yet
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...templateFiles([full]));
      else if (entry.endsWith(".html")) out.push(full);
    }
  }
  return out;
}

/** `cdx-*` classes that appear on a <button> in the Codex templates. */
function buttonClassesInTemplates() {
  const found = new Set();
  for (const file of templateFiles(TEMPLATE_DIRS)) {
    const html = readFileSync(file, "utf8");
    for (const tag of html.match(/<button\b[^>]*>/g) ?? []) {
      const cls = tag.match(/\bclass\s*=\s*"([^"]*)"/);
      if (!cls) continue;
      for (const name of cls[1].split(/\s+/)) {
        // Skip handlebars output and state classes that are never styled alone.
        if (name.startsWith("cdx-") && !name.includes("{{")) found.add(name);
      }
    }
  }
  return found;
}

/**
 * Start of the real selector: past the end of the explanatory comment. The
 * comment quotes the offending module rule verbatim, braces and all, so
 * scanning from the marker would parse the quote instead of our selector.
 */
function selectorStart(css) {
  const marker = css.indexOf("---- Button defence ----");
  assert.notEqual(marker, -1, "the 'Button defence' block is missing from styles/cdx.css");
  const commentEnd = css.indexOf("*/", marker);
  assert.notEqual(commentEnd, -1, "the 'Button defence' comment is unterminated");
  return commentEnd + "*/".length;
}

/** The class list inside the defence block's `:is( ... )`. */
function defendedClasses() {
  const css = readFileSync(join(ROOT, "styles", "cdx.css"), "utf8");
  const isStart = css.indexOf(":is(", selectorStart(css));
  assert.notEqual(isStart, -1, "the button-defence selector no longer uses :is()");
  const isEnd = css.indexOf(")", isStart);
  const list = css.slice(isStart + ":is(".length, isEnd);

  return new Set(
    list
      .split(",")
      .map((s) => s.trim().replace(/^\./, ""))
      .filter(Boolean)
  );
}

test("the button-defence block still exists and is ID-weighted", () => {
  const css = readFileSync(join(ROOT, "styles", "cdx.css"), "utf8");
  const start = selectorStart(css);
  const selector = css.slice(start, css.indexOf("{", start));
  // `:not(#_)` carries the block's ID-level specificity. Without it the block
  // drops to (0,2,1) and loses to any module rule marked !important.
  assert.ok(
    selector.includes(":not(#_)"),
    "the defence block lost its :not(#_) specificity anchor -- it will now lose to an !important module rule"
  );
});

test("every cdx-* button class in the templates is defended", () => {
  const inTemplates = buttonClassesInTemplates();
  const defended = defendedClasses();

  assert.ok(inTemplates.size > 0, "found no cdx-* button classes -- the template scan is broken");

  const undefended = [...inTemplates].filter((c) => !defended.has(c)).sort();
  assert.deepEqual(
    undefended,
    [],
    `these Codex button classes are not in the defence block in styles/cdx.css, so a UI module ` +
      `can flatten them: ${undefended.join(", ")}`
  );
});

test("the defence block lists no class that no template uses", () => {
  const inTemplates = buttonClassesInTemplates();
  const stale = [...defendedClasses()].filter((c) => !inTemplates.has(c)).sort();
  assert.deepEqual(stale, [], `stale entries in the defence block: ${stale.join(", ")}`);
});

/**
 * The defence block wins with !important, so any background/border a defended
 * class declares the ordinary way is dead -- the control silently renders with
 * no fill and no border for EVERYONE, module or not. Every such value has to be
 * set as a --cdx-btn-* token instead.
 *
 * This is not hypothetical: the first pass at the defence block missed six such
 * rules (the base .cdx-cr-change plus five eldritch overrides), which made the
 * credits CHANGE button invisible on all six schemes. A line-oriented grep found
 * nothing because the declarations sit on different lines from the selector.
 */
test("no defended class sets background or border outside the defence block", () => {
  const defended = defendedClasses();
  const offenders = [];

  for (const file of readdirSync(join(ROOT, "styles")).filter((f) => /^cdx.*\.css$/.test(f))) {
    const css = readFileSync(join(ROOT, "styles", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // Innermost {...} only, which is what a flat stylesheet gives us.
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (selector.includes(":not(#_)")) continue; // the defence block itself
      const hit = [...defended].find((c) => new RegExp(`\\.${c}(?![-\\w])`).test(selector));
      if (!hit) continue;
      for (const [, prop] of body.matchAll(/(?:^|;)\s*(background|border)(?:-[a-z]+)?\s*:/g)) {
        const full = body.match(new RegExp(`(?:^|;)\\s*(${prop}(?:-[a-z]+)?)\\s*:`))?.[1] ?? prop;
        if (full === "border-radius") continue;
        offenders.push(`${file}: "${selector.trim().slice(0, 60)}" sets ${full} (use --cdx-btn-*)`);
      }
    }
  }

  assert.deepEqual(
    [...new Set(offenders)].sort(),
    [],
    "these declarations are overridden by the !important defence block and will not render.\n" +
      "Convert them to --cdx-btn-bg / --cdx-btn-bw / --cdx-btn-bc, or split the rule if it also\n" +
      "targets a non-button element:\n  " +
      [...new Set(offenders)].sort().join("\n  ")
  );
});
