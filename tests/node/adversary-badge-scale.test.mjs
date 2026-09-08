/**
 * The adversary badge drawn on tokens by `drawAdversaryCount`.
 *
 * `token.w` / `token.h` are the token's on-canvas size — the token's grid footprint
 * multiplied by the scene's grid size — so they change both when a scene uses a grid
 * that is not the default 100px and when a token occupies more than one square. The
 * badge is drawn as a child of the token in that same unscaled canvas-pixel space, so
 * anything it hardcodes in pixels stops matching the token around it.
 *
 * These tests pin the badge to the token's footprint: same look as always on a 1x1
 * token on a 100px grid, proportionally the same everywhere else.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setSetting } from "./_stub/foundry-stub.mjs";

import { drawAdversaryCount } from "../../modules/helpers/token.js";

/** Natural pixel size of the shipped badge art, images/adversary/adversary-N.png. */
const ART_WIDTH = 282;
const ART_HEIGHT = 186;

const vec = (x, y) => ({ x, y, set(nx, ny = nx) { this.x = nx; this.y = ny; } });

/** Mirrors the PIXI.Sprite surface the badge uses, for a texture that has loaded. */
class FakeSprite {
  constructor(source) {
    this.source = source;
    this.scale = vec(1, 1);
    this.anchor = vec(0, 0);
    this.x = 0;
    this.y = 0;
    this.tint = null;
  }

  get width() { return ART_WIDTH * this.scale.x; }
  set width(value) { this.scale.x = value / ART_WIDTH; }

  get height() { return ART_HEIGHT * this.scale.y; }
  set height(value) { this.scale.y = value / ART_HEIGHT; }

  destroy() {}
}

class FakeContainer {
  constructor() {
    this.name = "";
    this.children = [];
  }

  addChild(child) {
    this.children.push(child);
    return child;
  }

  removeChildren() {
    const removed = this.children;
    this.children = [];
    return removed;
  }
}

globalThis.PIXI = {
  Container: FakeContainer,
  Sprite: { from: (source) => new FakeSprite(source) },
};

setSetting("starwarsffg", "showAdversaryCount", true);
setSetting("starwarsffg", "adversaryItemName", "Adversary");

/** A token of the given on-canvas size carrying an adversary item of `ranks` ranks. */
function drawOn(size, { height = size, ranks = 1 } = {}) {
  const token = {
    w: size,
    h: height,
    children: [],
    addChild(child) {
      this.children.push(child);
      return child;
    },
    actor: {
      items: [{ name: "Adversary", system: { ranks: { current: ranks } } }],
    },
  };
  drawAdversaryCount(token);
  return token;
}

/** The badge's rendered rectangle in the token's own coordinate space. */
function badgeBox(token) {
  const sprite = token.adversaryLevel.children[0];
  const width = ART_WIDTH * sprite.scale.x;
  const height = ART_HEIGHT * sprite.scale.y;
  return {
    width,
    height,
    left: sprite.x - (sprite.anchor.x * width),
    right: sprite.x + ((1 - sprite.anchor.x) * width),
    top: sprite.y - (sprite.anchor.y * height),
    bottom: sprite.y + ((1 - sprite.anchor.y) * height),
    scale: sprite.scale,
  };
}

const near = (actual, expected, tolerance) => Math.abs(actual - expected) <= tolerance;

test("a 1x1 token on a 100px grid keeps the badge size and placement it has always had", () => {
  const box = badgeBox(drawOn(100));

  assert.ok(near(box.width, 42.3, 2), `badge width was ${box.width}, expected about 42`);
  assert.ok(near(box.height, 27.9, 2), `badge height was ${box.height}, expected about 28`);
  assert.ok(near((box.left + box.right) / 2, 50, 2.5),
    `badge centre was ${(box.left + box.right) / 2}, expected about the token centre`);
  assert.ok(near(box.bottom, 93, 3),
    `badge bottom was ${box.bottom}, expected to sit just above the token's bottom edge`);
});

test("the badge scales with the token's on-canvas size", () => {
  const base = badgeBox(drawOn(100));

  for (const size of [50, 150, 200, 400]) {
    const factor = size / 100;
    const box = badgeBox(drawOn(size));
    assert.ok(near(box.width, base.width * factor, 0.5),
      `at ${size}px the badge was ${box.width} wide, expected ${base.width * factor}`);
    assert.ok(near(box.height, base.height * factor, 0.5),
      `at ${size}px the badge was ${box.height} tall, expected ${base.height * factor}`);
  }
});

test("the badge keeps the same relative placement at every token size", () => {
  const base = badgeBox(drawOn(100));
  const baseCentre = ((base.left + base.right) / 2) / 100;
  const baseGap = (100 - base.bottom) / 100;

  for (const size of [50, 150, 200, 400]) {
    const box = badgeBox(drawOn(size));
    assert.ok(near(((box.left + box.right) / 2) / size, baseCentre, 0.01),
      `at ${size}px the badge centre sat at ${((box.left + box.right) / 2) / size} of the width`);
    assert.ok(near((size - box.bottom) / size, baseGap, 0.01),
      `at ${size}px the badge bottom sat ${(size - box.bottom) / size} of the height above the edge`);
  }
});

test("the badge stays inside the token footprint at every size", () => {
  for (const size of [50, 100, 150, 200, 400]) {
    const box = badgeBox(drawOn(size));
    assert.ok(box.left >= 0, `at ${size}px the badge overhung the left edge (${box.left})`);
    assert.ok(box.right <= size, `at ${size}px the badge overhung the right edge (${box.right})`);
    assert.ok(box.top >= 0, `at ${size}px the badge overhung the top edge (${box.top})`);
    assert.ok(box.bottom <= size, `at ${size}px the badge overhung the bottom edge (${box.bottom})`);
  }
});

test("a token that is taller than it is wide does not stretch the badge", () => {
  const box = badgeBox(drawOn(100, { height: 200 }));
  assert.equal(box.scale.x, box.scale.y, "the badge must scale uniformly, not stretch");
});
