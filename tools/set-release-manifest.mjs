#!/usr/bin/env node
/**
 * Stamp release-specific values into `system.json` for a GitHub release build.
 *
 * The release workflow runs this after checkout so the published manifest advertises the
 * repository the release was cut from. Unlike the upstream `#{TOKEN}#` placeholder scheme,
 * this overwrites whatever is already there, which lets the committed `system.json` keep
 * real, working values for anyone running this repository directly as an installed Foundry
 * system.
 *
 * Usage:
 *   VERSION=2.1.0 URL=... MANIFEST=... DOWNLOAD=... node tools/set-release-manifest.mjs
 *
 *   --file <path>   Manifest to rewrite. Defaults to `system.json` in the current directory.
 *   --dry-run       Report the values that would be written; leave the file untouched.
 *
 * The rewrite is only ever applied to the workflow runner's filesystem; nothing is committed
 * back to the repository.
 */

import { readFileSync, writeFileSync } from "node:fs";

const KEYS = ["VERSION", "URL", "MANIFEST", "DOWNLOAD"];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fileArg = args.indexOf("--file");
const file = fileArg === -1 ? "system.json" : args[fileArg + 1];

if (fileArg !== -1 && !file) {
  console.error("set-release-manifest: --file needs a path");
  process.exit(1);
}

const missing = KEYS.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`set-release-manifest: missing required env: ${missing.join(", ")}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(file, "utf8"));

manifest.version = process.env.VERSION;
manifest.url = process.env.URL;
manifest.manifest = process.env.MANIFEST;
manifest.download = process.env.DOWNLOAD;

if (!dryRun) writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`${dryRun ? "would write" : "wrote"} ${file}:`);
for (const key of ["version", "url", "manifest", "download"]) {
  console.log(`  ${key}: ${manifest[key]}`);
}
