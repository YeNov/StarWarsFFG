import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * The chat card posted once per version upgrade (modules/swffg-migration.js sendChanges).
 *
 * Both of its link bugs shipped, so both are guarded here:
 *
 * 1. It pointed at the UPSTREAM repository, so a reader of this fork's update message was sent
 *    to someone else's changelog and wiki -- not the version they were actually running.
 * 2. Its first link was carried over from upstream's per-version "new features" wiki pages,
 *    which this fork does not keep. GitHub redirects a wiki page that does not exist to the
 *    wiki's front page, so that link quietly resolved to the same place as the "System Wiki"
 *    link below it: three bullets, two destinations.
 *
 * Note that the second bug is NOT caught by comparing the hrefs: they differed in the source
 * and only collapsed after GitHub's redirect, which a static check cannot follow. What guards
 * it is requiring the version-specific link to be one that exists for every version.
 */

const TEMPLATE = new URL("../../templates/notifications/new_version.html", import.meta.url);
const VERSION = "9.8.7";

const hrefs = () => {
  const html = fs.readFileSync(TEMPLATE, "utf8").replaceAll("{{ version }}", VERSION);
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
};

test("every link goes somewhere different", () => {
  const links = hrefs();

  assert.ok(links.length >= 3, `expected the useful-links list, got ${links.length} link(s)`);
  assert.deepEqual([...new Set(links)], links, "two bullets lead to the same page");
});

test("the version-specific link is the release, which exists for every version", () => {
  // A release is published for every version (the tag is `v<version>`), and its notes are the
  // user-facing account of what changed. A wiki page named after the version is not: it has to
  // be written by hand for each release, and when it is missing the link silently degrades.
  assert.ok(
    hrefs().some((href) => href.endsWith(`/releases/tag/v${VERSION}`)),
    "no link points at this version's release notes",
  );
});

test("no link leaves this fork", () => {
  for (const href of hrefs()) {
    assert.match(href, /^https:\/\/github\.com\/YeNov\/StarWarsFFG(\/|$)/, `${href} is not this fork`);
  }
});
