/**
 * The minion tally drawn on tokens by `drawMinionCount`.
 *
 * The same fixed-pixel problem the adversary badge had, on the sibling function: the
 * pips were 7x15 with 5px gaps whatever the token's on-canvas size (`token.w` / `token.h`
 * — the token's grid footprint times the scene's grid size). On a coarse grid they became
 * specks; on a fine one the row was wider than the token, `outsideGap` went negative and
 * the pips hung off both edges.
 *
 * These pin the tally to the token's footprint: unchanged on a 1x1 token on a 100px grid,
 * proportionally the same everywhere else.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setSetting } from "./_stub/foundry-stub.mjs";

import { drawMinionCount } from "../../modules/helpers/token.js";

const vec = (x, y) => ({ x, y, set(nx, ny = nx) { this.x = nx; this.y = ny; } });

/** Records the drawing calls rather than rasterising them. */
class FakeGraphics {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.lineWidth = null;
    this.fill = null;
    this.rect = null;
  }

  lineStyle(width) { this.lineWidth = width; return this; }
  beginFill(color) { this.fill = color; return this; }
  drawRoundedRect(x, y, width, height, radius) {
    this.rect = { x, y, width, height, radius };
    return this;
  }
  endFill() { return this; }
  destroy() {}
}

class FakeText {
  constructor(text, style) {
    this.text = text;
    this.style = style;
    this.anchor = vec(0, 0);
    this.x = 0;
    this.y = 0;
  }

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

globalThis.PIXI = { Container: FakeContainer, Graphics: FakeGraphics, Text: FakeText };

setSetting("starwarsffg", "showMinionCount", true);

/** A token of the given on-canvas size carrying `alive` of `max` minions. */
function drawOn(size, { height = size, alive = 4, max = 6 } = {}) {
  const token = {
    w: size,
    h: height,
    children: [],
    addChild(child) {
      this.children.push(child);
      return child;
    },
    actor: { system: { quantity: { value: alive, max } } },
  };
  drawMinionCount(token);
  return token;
}

/** Every pip's rectangle in the token's own coordinate space. */
function pips(token) {
  return token.minionCount.children.map((element) => ({
    fill: element.fill,
    lineWidth: element.lineWidth,
    left: element.x + element.rect.x,
    top: element.y + element.rect.y,
    width: element.rect.width,
    height: element.rect.height,
    right: element.x + element.rect.x + element.rect.width,
    bottom: element.y + element.rect.y + element.rect.height,
  }));
}

/** The bounding box of the whole row of pips. */
function row(token) {
  const drawn = pips(token);
  return {
    count: drawn.length,
    left: Math.min(...drawn.map((p) => p.left)),
    right: Math.max(...drawn.map((p) => p.right)),
    top: Math.min(...drawn.map((p) => p.top)),
    bottom: Math.max(...drawn.map((p) => p.bottom)),
    pipWidth: drawn[0].width,
    pipHeight: drawn[0].height,
  };
}

const near = (actual, expected, tolerance) => Math.abs(actual - expected) <= tolerance;

const SIZES = [50, 150, 200, 400];

test("a 1x1 token on a 100px grid keeps the tally it has always had", () => {
  const box = row(drawOn(100));

  assert.equal(box.count, 6, "one pip per minion the group can hold");
  assert.ok(near(box.pipWidth, 7, 0.5), `pip width was ${box.pipWidth}, expected 7`);
  assert.ok(near(box.pipHeight, 15, 0.5), `pip height was ${box.pipHeight}, expected 15`);
  assert.ok(near((box.left + box.right) / 2, 50, 1),
    `the row centre sat at ${(box.left + box.right) / 2}, expected the token centre`);
  assert.ok(near(box.bottom, 98, 1),
    `the row bottom sat at ${box.bottom}, expected just above the token's bottom edge`);
});

test("the pips scale with the token's on-canvas size", () => {
  const base = row(drawOn(100));

  for (const size of SIZES) {
    const factor = size / 100;
    const box = row(drawOn(size));
    assert.ok(near(box.pipWidth, base.pipWidth * factor, 0.5),
      `at ${size}px a pip was ${box.pipWidth} wide, expected ${base.pipWidth * factor}`);
    assert.ok(near(box.pipHeight, base.pipHeight * factor, 0.5),
      `at ${size}px a pip was ${box.pipHeight} tall, expected ${base.pipHeight * factor}`);
    assert.ok(near(box.right - box.left, (base.right - base.left) * factor, 0.5),
      `at ${size}px the row was ${box.right - box.left} wide, expected ${(base.right - base.left) * factor}`);
  }
});

test("the tally keeps the same relative placement at every token size", () => {
  const base = row(drawOn(100));
  const baseCentre = ((base.left + base.right) / 2) / 100;
  const baseGap = (100 - base.bottom) / 100;

  for (const size of SIZES) {
    const box = row(drawOn(size));
    assert.ok(near(((box.left + box.right) / 2) / size, baseCentre, 0.01),
      `at ${size}px the row centre sat at ${((box.left + box.right) / 2) / size} of the width`);
    assert.ok(near((size - box.bottom) / size, baseGap, 0.01),
      `at ${size}px the row sat ${(size - box.bottom) / size} of the height above the edge`);
  }
});

test("a full tally stays inside the token footprint at every size", () => {
  for (const size of [50, 100, ...SIZES]) {
    const box = row(drawOn(size, { alive: 6, max: 6 }));
    assert.ok(box.left >= 0, `at ${size}px the row overhung the left edge (${box.left})`);
    assert.ok(box.right <= size, `at ${size}px the row overhung the right edge (${box.right})`);
    assert.ok(box.top >= 0, `at ${size}px the row overhung the top edge (${box.top})`);
    assert.ok(box.bottom <= size, `at ${size}px the row overhung the bottom edge (${box.bottom})`);
  }
});

test("the overflow marker scales with the token too", () => {
  const base = drawOn(100, { alive: 9, max: 9 }).minionCount.children[0];
  assert.equal(base.text, "\u221E", "a group too big to draw shows the infinity marker");

  for (const size of SIZES) {
    const factor = size / 100;
    const marker = drawOn(size, { alive: 9, max: 9 }).minionCount.children[0];
    assert.ok(near(marker.style.fontSize, base.style.fontSize * factor, 0.5),
      `at ${size}px the marker was ${marker.style.fontSize}pt, expected ${base.style.fontSize * factor}`);
    assert.ok(near((size - marker.y) / size, (100 - base.y) / 100, 0.01),
      `at ${size}px the marker sat ${(size - marker.y) / size} of the height above the edge`);
  }
});

test("alive minions are drawn in the living colour and the fallen in the dead one", () => {
  for (const size of [100, 200]) {
    const drawn = pips(drawOn(size, { alive: 4, max: 6 }));
    const colours = drawn.map((p) => p.fill);
    assert.equal(new Set(colours.slice(0, 4)).size, 1, "the living pips share one colour");
    assert.equal(new Set(colours.slice(4)).size, 1, "the fallen pips share one colour");
    assert.notEqual(colours[0], colours[4], "living and fallen pips must differ");
  }
});
