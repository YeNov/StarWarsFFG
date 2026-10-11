/**
 * settings-helpers.js registers the system's settings and needs Foundry, so no Node test imports it:
 * a syntax slip in it would only show up as a broken world load. Parse it instead.
 */
import test from "node:test";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

test("the system's settings module still parses", () => {
  // package.json sets no "type", so a plain `node --check <file>` reads this ES module as CommonJS
  // and passes it as soon as it meets the first import, whatever follows. Check it as module source.
  const source = fs.readFileSync(new URL("../../modules/settings/settings-helpers.js", import.meta.url));
  execFileSync(process.execPath, ["--input-type=module", "--check"], { input: source });
});
