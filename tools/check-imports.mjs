#!/usr/bin/env node
/**
 * GATE-IMPORTS — static resolution, template references, and the Node-purity allowlist.
 *
 * PC Wizard implementation plan v10, §0.4.
 *
 * This checker is deliberately **NON-EXECUTING**: it parses and resolves only. It must never
 * `import()` system code — several system modules read `foundry.*` at module load and would
 * throw, and executing production code inside a gate is exactly the coupling this gate exists
 * to avoid.
 *
 * Usage:
 *   node tools/check-imports.mjs [--cutover] [--root <dir>] [--json]
 *
 *   --cutover   Activates rule 6 (the Stage 18 shim assertion). Inactive by default so that a
 *               malformed shim can never silently skip the assertion (plan §0.4 rule 6).
 *   --root      Alternate repo root. Used by the rule-6/rule-7 meta-tests to run the real rule
 *               logic against throwaway fixture trees instead of mutating this repo.
 *   --json      Emit findings as JSON.
 *
 * Exit code 0 with zero findings = pass.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Directories never walked. */
const SKIP_DIRS = new Set(["node_modules", ".git", ".idea", ".vscode", "dist", "coverage"]);

/** The Foundry-served prefix for this system's own files. */
const SYSTEM_PREFIX = "systems/starwarsffg/";

/** Filler substituted for string-literal interiors by `scanSource`. Never a valid JS character. */
const STRING_FILL = "";

/**
 * Rule 7 — the frozen closure from plan §0.6.4.
 *
 * Every Covered module maps to the EXACT set of repo-relative paths it is permitted to import.
 * An empty array means "imports nothing".
 */
const COVERED = new Map([
  ["modules/char-creator/constants.js", []],
  ["modules/helpers/xp-entry-builders.js", []],
  ["modules/char-creator/build-deps.js", []],
  ["modules/char-creator/starting-bonus.js", []],
  ["modules/char-creator/build-item-schema.js", []],
  ["modules/char-creator/calculators.js", ["modules/char-creator/starting-bonus.js"]],
  ["modules/char-creator/wizard-state.js", ["modules/char-creator/constants.js"]],
  ["modules/char-creator/source-descriptors.js", ["modules/char-creator/constants.js"]],
  ["modules/char-creator/to-item-data.js", [
    "modules/char-creator/build-item-schema.js",
    "modules/char-creator/constants.js",
    "modules/config/ffg-active-effect-modes.js",
  ]],
  ["modules/char-creator/apply-build.js", ["modules/char-creator/calculators.js"]],
  ["modules/char-creator/validate.js", [
    "modules/char-creator/calculators.js",
    "modules/char-creator/constants.js",
  ]],
  ["modules/char-creator/draft-schema.js", ["modules/char-creator/constants.js"]],
  ["modules/char-creator/notify-policy.js", ["modules/char-creator/constants.js"]],
  ["modules/char-creator/commit-normalize.js", [
    "modules/char-creator/build-item-schema.js",
    "modules/char-creator/constants.js",
    "modules/helpers/xp-entry-builders.js",
  ]],
]);

/**
 * The two named external exceptions (plan §0.6.4). They are reachable from Covered modules but
 * are not themselves Covered, so the closure is only sound while they stay import-clean —
 * which is asserted directly below.
 */
const IMPORT_CLEAN_EXCEPTIONS = [
  "modules/config/ffg-active-effect-modes.js",
  "modules/helpers/xp-entry-builders.js",
];

/**
 * Soundness self-check for rule 7's transitivity claim.
 *
 * The closure is transitive iff every permitted target is itself either Covered (and therefore
 * checked against its own allowlist by this same rule) or an import-clean exception (and
 * therefore checked to have no imports at all). If that invariant ever breaks, a forbidden edge
 * could hide one hop away, so this throws rather than reporting a finding.
 */
for (const [source, allowed] of COVERED) {
  for (const target of allowed) {
    if (!COVERED.has(target) && !IMPORT_CLEAN_EXCEPTIONS.includes(target)) {
      throw new Error(
        `rule 7 closure is unsound: ${source} may import ${target}, which is neither Covered ` +
        `nor an import-clean exception`,
      );
    }
  }
}

/** Rule 7's forbidden-by-name callouts, reported with a clearer message when hit. */
const NOTABLY_FORBIDDEN = [
  "modules/helpers/modifiers.js",
  "modules/helpers/item-helpers.js",
  "modules/helpers/actor-helpers.js",
  "modules/actors/actor-ffg.js",
  "modules/char-creator/enrich.js",
];

// ---------------------------------------------------------------------------
// Source scanning — comment/string aware, no execution
// ---------------------------------------------------------------------------

/**
 * Split JS source into code (comments blanked out) and the set of literal strings it contains.
 *
 * Comments are replaced by equivalent-length whitespace so byte offsets and line numbers stay
 * intact. Regex literals are detected with the standard "previous significant token" heuristic
 * so that a `/` inside e.g. `/["']/` cannot open a phantom string state.
 *
 * String literals are emitted into `code` with their DELIMITERS intact but their interior
 * replaced by a filler character (newlines preserved, so offsets and line numbers stay exact).
 * That is what stops the specifier patterns below from reading *inside* a literal: without it,
 * `icon: "fas fa-file-import", label: "…"` presents a literal `import` followed by a quoted
 * region and is extracted as a bare specifier, and every fixture source held in a test file's
 * string constant is scanned as if it were that file's own import list. The real text is not
 * lost — each literal is recorded with its start offset, and `extractSpecifiers` maps a matched
 * delimiter pair back to its recorded value.
 *
 * @returns {{code: string, strings: Array<{value: string, line: number, interpolated: boolean,
 *            start: number}>}}
 */
function scanSource(src) {
  const out = new Array(src.length);
  const strings = [];
  let i = 0;
  let line = 1;
  // Last significant (non-whitespace, non-comment) code character, and the identifier that
  // ended at it — together these decide whether a `/` opens a regex literal or is division.
  let lastSignificant = "";
  let lastWord = "";

  const blank = (from, to) => {
    for (let k = from; k < to; k++) out[k] = src[k] === "\n" ? "\n" : " ";
  };
  // String interiors: same length, newlines preserved, every other character replaced by a
  // filler that can never form an identifier, a quote, or a `;`.
  const fill = (from, to) => {
    for (let k = from; k < to; k++) out[k] = src[k] === "\n" ? "\n" : STRING_FILL;
  };

  const regexAllowedAfter = new Set([
    "", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "~",
    "^", "<", ">",
  ]);
  const regexAllowedKeywords = new Set([
    "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case",
    "do", "else", "yield", "await",
  ]);

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    // Line comment
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }

    // Block comment
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === "\n") line++;
      blank(i, stop);
      i = stop;
      continue;
    }

    // Regex literal — blanked so a `/["']/` cannot open a phantom string state.
    if (c === "/" && (regexAllowedAfter.has(lastSignificant) || regexAllowedKeywords.has(lastWord))) {
      let k = i + 1;
      let inClass = false;
      let closed = false;
      while (k < src.length) {
        const rc = src[k];
        if (rc === "\\") { k += 2; continue; }
        if (rc === "\n") break;              // unterminated — not a regex after all
        if (rc === "[") inClass = true;
        else if (rc === "]") inClass = false;
        else if (rc === "/" && !inClass) { closed = true; k++; break; }
        k++;
      }
      if (closed) {
        blank(i, k);
        i = k;
        lastSignificant = "/";
        lastWord = "";
        continue;
      }
      // not a regex after all — fall through and treat as division
    }

    // String / template literal. The delimiters are kept and the interior is filled, so byte
    // offsets stay exact while the specifier regexes below cannot read literal content as code.
    // Because string state is tracked here, a `//` or `/* */` inside a literal can never be
    // mistaken for a comment.
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      const startLine = line;
      let k = i + 1;
      let value = "";
      let interpolated = false;
      let terminated = false;
      while (k < src.length) {
        const sc = src[k];
        if (sc === "\\") { value += src[k + 1] ?? ""; k += 2; continue; }
        if (sc === "\n") {
          if (quote !== "`") break;           // unterminated single-quoted string
          line++;
          value += sc;
          k++;
          continue;
        }
        if (quote === "`" && sc === "$" && src[k + 1] === "{") {
          interpolated = true;
          let depth = 1;
          k += 2;
          while (k < src.length && depth > 0) {
            if (src[k] === "{") depth++;
            else if (src[k] === "}") depth--;
            else if (src[k] === "\n") line++;
            k++;
          }
          continue;
        }
        if (sc === quote) { terminated = true; k++; break; }
        value += sc;
        k++;
      }
      if (terminated) {
        strings.push({ value, line: startLine, interpolated, start: i });
        out[i] = quote;                       // opening delimiter
        fill(i + 1, k - 1);                   // interior
        out[k - 1] = src[k - 1];              // closing delimiter
        i = k;
        lastSignificant = quote;
        lastWord = "";
        continue;
      }
      // Unterminated — emit the delimiter alone and resume scanning as code.
      out[i] = c;
      i++;
      continue;
    }

    if (c === "\n") line++;
    out[i] = c;
    if (!/\s/.test(c)) {
      lastSignificant = c;
      lastWord = /[A-Za-z_$0-9]/.test(c) ? lastWord + c : "";
    }
    i++;
  }

  return { code: out.join(""), strings };
}

/**
 * Extract module specifiers from JS source.
 *
 * Covers static `import … from "…"`, side-effect `import "…"`, `export … from "…"`, and
 * `import("…")` with a literal argument. Dynamic imports whose argument is not a plain literal
 * (e.g. the cache-busted template literal in `tests/ffg-tests.js`) cannot be resolved statically
 * and are skipped.
 *
 * `code` must be the filled output of `scanSource`, and `strings` its companion record. A match
 * is only accepted when its quoted region is a literal `scanSource` actually recorded, and the
 * specifier reported is that literal's real value — so nothing inside a string can be mistaken
 * for an import, and nothing real is lost to the filler.
 */
function extractSpecifiers(code, strings) {
  const byOpeningQuote = new Map(strings.map((s) => [s.start, s]));
  const found = [];

  const patterns = [
    // import ... from "x" / export ... from "x"
    //
    // The gap is bounded by `[^;]` rather than `[\s\S]` on purpose: an import/export clause
    // never contains a semicolon before its `from`, so this cannot run past the end of the
    // statement. An unbounded lazy gap would let a `from`-less statement such as
    // `export const x = 1;` swallow the NEXT import and misreport its line.
    /\b(?:import|export)\b[^;]*?\bfrom\s*(["'])([^"'\n]*)\1/gd,
    // bare side-effect import "x"
    /\bimport\s*(["'])([^"'\n]*)\1/gd,
    // dynamic import("x")
    /\bimport\s*\(\s*(["'])([^"'\n]*)\1\s*\)/gd,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) {
      // `d` gives the interior's offset; the opening quote sits one byte before it.
      const record = byOpeningQuote.get(m.indices[2][0] - 1);
      if (!record || record.interpolated) continue;
      found.push({ spec: record.value, line: record.line, start: record.start });
    }
  }

  // De-duplicate (the patterns overlap on some forms). One literal = one specifier, so the
  // literal's own start offset is the identity.
  const seen = new Set();
  return found.filter((f) => {
    if (seen.has(f.start)) return false;
    seen.add(f.start);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function walk(dir, predicate, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), predicate, acc);
    } else if (entry.isFile() && predicate(entry.name)) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

const isDirectory = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** Strip a `?query` / `#hash` suffix before resolving against the filesystem. */
const stripSuffix = (spec) => spec.replace(/[?#].*$/, "");

// ---------------------------------------------------------------------------
// The checker
// ---------------------------------------------------------------------------

export function checkImports({ root = REPO_ROOT, cutover = false } = {}) {
  const findings = [];
  const rel = (abs) => path.relative(root, abs).split(path.sep).join("/");
  const add = (rule, file, line, message) =>
    findings.push({ rule, file: typeof file === "string" ? file : rel(file), line, message });

  // --- collect the files in scope -----------------------------------------
  const jsFiles = [
    ...walk(path.join(root, "modules"), (n) => n.endsWith(".js")),
    ...walk(path.join(root, "tests"), (n) => n.endsWith(".js") || n.endsWith(".mjs")),
  ];
  const htmlFiles = walk(path.join(root, "templates"), (n) => n.endsWith(".html"));

  /** repo-relative path -> {specifiers, strings} */
  const parsed = new Map();
  for (const abs of jsFiles) {
    const src = fs.readFileSync(abs, "utf8");
    const { code, strings } = scanSource(src);
    parsed.set(rel(abs), { abs, specifiers: extractSpecifiers(code, strings), strings });
  }

  // --- rules 1, 2, 5 -------------------------------------------------------
  for (const [relPath, info] of parsed) {
    const dir = path.dirname(info.abs);
    const inModules = relPath.startsWith("modules/");

    for (const { spec, line } of info.specifiers) {
      const bare = stripSuffix(spec);

      if (bare.startsWith("./") || bare.startsWith("../")) {
        // RULE 1 — exact-path, extension-required resolution. The browser serves these over
        // HTTP and does no Node-style extensionless resolution, so a missing `.js` is a real
        // boot failure.
        const target = path.resolve(dir, bare);
        if (!isFile(target)) {
          add(1, relPath, line, `relative import "${spec}" does not resolve to an existing file`);
        }
        continue;
      }

      const systemRel = foundryStyleTarget(bare);
      if (systemRel !== null) {
        // RULE 2 (import position) — absolute Foundry-style specifier.
        if (!isFile(path.join(root, systemRel))) {
          add(2, relPath, line, `Foundry-style import "${spec}" does not resolve under the repo root`);
        }
        continue;
      }

      if (bare.startsWith("/")) continue;   // some other absolute path; not this gate's business

      // RULE 5 — bare specifiers inside modules/**.
      if (inModules) {
        add(5, relPath, line, `bare (non-relative, non-Foundry) import specifier "${spec}"`);
      }
    }

    // RULE 2 (string-literal position) — PARTS[*].template, PARTS[*].templates[], and the
    // partial-templates.js preload list are plain string literals, not import specifiers.
    //
    // A literal that names an existing DIRECTORY is accepted: the repo's sheets build their
    // template path in two halves, e.g. actor-sheet-ffg.js:59-61 holds the base
    // "systems/starwarsffg/templates/actors" and appends the filename in a template literal.
    // The prefix is a real, existing location — resolving it as a file is the checker's error,
    // not the sheet's. A literal naming neither an existing file nor an existing directory is
    // still a finding, so a mistyped or deleted path is caught exactly as before.
    for (const { value, line, interpolated } of info.strings) {
      if (interpolated) continue;
      const systemRel = foundryStyleTarget(stripSuffix(value));
      if (systemRel === null) continue;
      if (isDirectory(path.join(root, systemRel))) continue;
      if (!isFile(path.join(root, systemRel))) {
        add(2, relPath, line, `Foundry-style path "${value}" does not resolve under the repo root`);
      }
    }
  }

  // --- rules 3 and 4 -------------------------------------------------------
  const partialTargets = new Map();   // repo-relative html -> Set of referenced targets
  for (const abs of htmlFiles) {
    const src = fs.readFileSync(abs, "utf8");
    const relPath = rel(abs);
    const targets = new Set();
    const re = /\{\{#?>\s*(?:(["'])([^"']+)\1|([^\s}"']+))/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const raw = m[2] ?? m[3];
      // Unquoted tokens without a path separator are dynamic partial *names* (the repo has
      // `menuPartial` and `settingPartial`); they cannot be resolved statically.
      if (m[3] !== undefined && !raw.includes("/")) continue;
      const line = src.slice(0, m.index).split("\n").length;
      targets.add(raw);

      const systemRel = foundryStyleTarget(stripSuffix(raw));
      const candidate = systemRel !== null ? path.join(root, systemRel) : path.join(root, stripSuffix(raw));
      if (!isFile(candidate)) {
        add(3, relPath, line, `partial reference "${raw}" does not resolve`);
      }
    }
    partialTargets.set(relPath, targets);
  }

  // RULE 4 — bidirectional preload cross-check for the pc_wizard tree.
  const preloadFile = "modules/helpers/partial-templates.js";
  const preloadInfo = parsed.get(preloadFile);
  if (preloadInfo) {
    const listed = new Set(
      preloadInfo.strings
        .filter((s) => !s.interpolated)
        .map((s) => foundryStyleTarget(stripSuffix(s.value)))
        .filter((v) => v !== null),
    );

    // 4a — every pc_wizard partial referenced from a pc_wizard template must be listed.
    for (const [relPath, targets] of partialTargets) {
      if (!relPath.startsWith("templates/wizards/pc_wizard/")) continue;
      for (const raw of targets) {
        const systemRel = foundryStyleTarget(stripSuffix(raw));
        if (systemRel === null) continue;
        if (!systemRel.startsWith("templates/wizards/pc_wizard/")) continue;
        if (!listed.has(systemRel)) {
          add(4, relPath, null,
            `partial "${raw}" is referenced but not registered in ${preloadFile}`);
        }
      }
    }

    // 4b — every pc_wizard path in the preload list must exist on disk.
    for (const systemRel of listed) {
      if (!systemRel.startsWith("templates/wizards/pc_wizard/")) continue;
      if (!isFile(path.join(root, systemRel))) {
        add(4, preloadFile, null, `registered pc_wizard template "${systemRel}" does not exist on disk`);
      }
    }
  }

  // --- rule 6 (only under --cutover) ---------------------------------------
  if (cutover) {
    const shimRel = "modules/helpers/character-creator.js";
    const shimAbs = path.join(root, shimRel);
    if (!isFile(shimAbs)) {
      add(6, shimRel, null, "the compatibility shim file does not exist (plan §0.8: it must not be deleted)");
    } else {
      const src = fs.readFileSync(shimAbs, "utf8");
      const { code } = scanSource(src);
      const lines = code.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
      if (lines.length !== 1) {
        add(6, shimRel, null,
          `expected a single re-export line, found ${lines.length} non-comment lines`);
      } else if (!/^export\s*\{\s*CharacterCreator\s*\}\s*from\s*["'][^"']+["']\s*;?$/.test(lines[0])) {
        add(6, shimRel, null,
          `the single line is not a named re-export of CharacterCreator: ${lines[0]}`);
      }
    }
  }

  // --- rule 7 --------------------------------------------------------------
  for (const [coveredRel, allowed] of COVERED) {
    const info = parsed.get(coveredRel);
    if (!info) continue;                              // not written yet — vacuous
    const dir = path.dirname(info.abs);
    for (const { spec, line } of info.specifiers) {
      const bare = stripSuffix(spec);
      let targetRel = null;
      if (bare.startsWith("./") || bare.startsWith("../")) {
        targetRel = path.relative(root, path.resolve(dir, bare)).split(path.sep).join("/");
      } else {
        targetRel = foundryStyleTarget(bare);
      }
      if (targetRel !== null && allowed.includes(targetRel)) continue;

      const label = targetRel ?? spec;
      const notable = NOTABLY_FORBIDDEN.includes(label) || label.startsWith("modules/apps/");
      add(7, coveredRel, line,
        `Covered module imports "${spec}"${notable ? " (a poisoned / out-of-closure module)" : ""}` +
        ` — not in the frozen §0.6.4 closure`);
    }
  }

  // Rule 7's soundness depends on the two named exceptions staying import-clean.
  for (const exceptionRel of IMPORT_CLEAN_EXCEPTIONS) {
    const info = parsed.get(exceptionRel);
    if (!info) continue;
    for (const { spec, line } of info.specifiers) {
      add(7, exceptionRel, line,
        `named rule-7 exception must stay import-clean, but it imports "${spec}"`);
    }
  }

  return findings;
}

/**
 * Map a Foundry-served specifier onto a repo-relative path, or null if it is not one.
 * Accepts both `/systems/starwarsffg/…` and `systems/starwarsffg/…`.
 */
function foundryStyleTarget(spec) {
  const s = spec.startsWith("/") ? spec.slice(1) : spec;
  if (!s.startsWith(SYSTEM_PREFIX)) return null;
  return s.slice(SYSTEM_PREFIX.length);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  const cutover = argv.includes("--cutover");
  const json = argv.includes("--json");
  const rootIdx = argv.indexOf("--root");
  const root = rootIdx !== -1 ? path.resolve(argv[rootIdx + 1]) : REPO_ROOT;

  const findings = checkImports({ root, cutover });

  if (json) {
    process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
  } else {
    const mode = cutover ? "rules 1-7 (rule 6 ACTIVE)" : "rules 1-5, 7 (rule 6 inactive)";
    process.stdout.write(`GATE-IMPORTS — root ${root}\nmode: ${mode}\n`);
    for (const f of findings) {
      const where = f.line ? `${f.file}:${f.line}` : f.file;
      process.stdout.write(`  [rule ${f.rule}] ${where} — ${f.message}\n`);
    }
    process.stdout.write(
      findings.length === 0 ? "PASS — 0 findings\n" : `FAIL — ${findings.length} finding(s)\n`,
    );
  }

  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
