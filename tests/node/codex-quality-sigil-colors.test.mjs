import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const styles = path.join(root, "styles");
const codexCss = fs.readFileSync(path.join(styles, "cdx.css"), "utf8");
const schemes = ["republic", "empire", "dark", "light", "mercenary", "eldritch"];

test("quality details preserve dice sigil colours in every Codex scheme", () => {
  assert.match(
    codexCss,
    /\.cdx \.cdx-item-body \.item\.force-power \.item-details \*:not\(\.dietype\) \{ color:var\(--cdx-dim\); \}/,
  );
  assert.doesNotMatch(
    codexCss,
    /\.cdx \.cdx-item-body \.item\.force-power \.item-details \* \{ color:/,
  );

  for (const scheme of schemes) {
    const schemeCss = fs.readFileSync(path.join(styles, `cdx-${scheme}.css`), "utf8");
    assert.doesNotMatch(
      schemeCss,
      /\.item-details \* \{[^}]*color:/,
      `${scheme} must not blanket-recolour quality-detail descendants`,
    );
  }
});
