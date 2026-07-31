import test from "node:test";
import assert from "node:assert/strict";

import { normalizeRemoteImageUrl } from "../../modules/char-creator/assemble-character-source.js";

test("accepts and normalizes absolute HTTP(S) image URLs", () => {
  assert.equal(normalizeRemoteImageUrl(" https://example.com/a portrait.webp "), "https://example.com/a%20portrait.webp");
  assert.equal(normalizeRemoteImageUrl("http://example.com/token.png"), "http://example.com/token.png");
  assert.equal(normalizeRemoteImageUrl(""), "");
});

test("rejects uploads, local/data schemes, relative paths, and embedded credentials", () => {
  for (const value of [
    "data:image/png;base64,AAAA",
    "file:///tmp/image.png",
    "relative/image.webp",
    "https://user:password@example.com/image.webp",
  ]) {
    assert.equal(normalizeRemoteImageUrl(value), null, value);
  }
});
