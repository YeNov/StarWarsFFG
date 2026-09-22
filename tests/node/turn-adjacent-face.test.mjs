/**
 * Unmatched Fortune: turning a rolled die to a face that shares an edge with the rolled face.
 *
 * The neighbours follow the PHYSICAL FFG dice, not Dice So Nice's 3D models (which place the
 * symbols on a generic numbered die, and have rearranged their d8/d12 between versions). The
 * expected rows below are transcribed from the community chart "Dice Adjacencies for Unmatched
 * Fortune" (https://i.imgur.com/VszFxNK.jpg), one row per physical face in the chart's order.
 *
 * Symbols: B blank, S success, A advantage, T triumph, F failure, H threat, D despair.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { setSetting } from "./_stub/foundry-stub.mjs";

import { configureDice } from "../../modules/config/ffg-dice.js";
import { RESULTS_BY_DENOM, adjacentFaces, canTurnToAdjacent, turnTermFace } from "../../modules/dice/replace-die.js";

setSetting("starwarsffg", "dicetheme", "starwars");
configureDice();

const CHART = {
  b: ["B: S SA A AA", "B: S SA A AA", "S: B B SA AA", "SA: B B S A", "A: B B SA AA", "AA: B B S A"],
  s: ["B: B F H H", "B: B F F H", "F: B B F H", "F: B F H H", "H: B B F H", "H: B F F H"],
  a: ["B: S A AA", "S: B SS A", "S: SA A AA", "SS: S SA A", "SA: S SS A", "A: S SA AA", "A: B S SS", "AA: B S A"],
  i: ["B: F FF H", "F: B H HH", "FF: B H H", "FH: H H HH", "H: B H HH", "H: FF FH H", "H: F FF FH", "HH: F FH H"],
  p: [
    "B: S SS SA SA AA", "S: SS T SA AA AA", "S: B T SA A AA", "SS: S SS SA SA AA", "SS: B SS SA SA SA",
    "SA: B S SS SS AA", "SA: B S SS SA A", "SA: SS SS SA A AA", "A: S T SA SA AA", "AA: B S S T SA",
    "AA: S SS T SA A", "T: S S A AA AA",
  ],
  c: [
    "B: F FF FH FH HH", "F: FF FF D FH HH", "F: B FH H H HH", "FF: B F D FH FH", "FF: F FH H HH HH",
    "FH: B F FF FF HH", "FH: B F FF D H", "H: F D FH H HH", "H: F FF H HH HH", "HH: B F FF FH H",
    "HH: F FF D H H", "D: F FF FH H HH",
  ],
};

const FACES = { b: 6, s: 6, a: 8, i: 8, p: 12, c: 12 };

/** The symbols printed on one face, read from the system's own result table. */
function symbols(denom, face) {
  const t = CONFIG.FFG[RESULTS_BY_DENOM[denom]][face];
  if (t.triumph) return "T"; // the table also counts the Triumph's success
  if (t.despair) return "D"; // ...and the Despair's failure
  const s = "S".repeat(t.success) + "A".repeat(t.advantage) + "F".repeat(t.failure) + "H".repeat(t.threat);
  return s || "B";
}

/** Order-free form of a chart row, so duplicate faces can sit in any order. */
function normalizeRow(row) {
  const [face, neighbours] = row.split(": ");
  return `${face}: ${neighbours.split(" ").sort().join(" ")}`;
}

function faceList(denom) {
  return Array.from({ length: FACES[denom] }, (_, i) => i + 1);
}

for (const denom of Object.keys(CHART)) {
  test(`die "${denom}": every face's neighbours match the physical chart`, () => {
    const actual = faceList(denom)
      .map((face) => `${symbols(denom, face)}: ${adjacentFaces(denom, face).map((n) => symbols(denom, n)).sort().join(" ")}`)
      .sort();
    assert.deepEqual(actual, CHART[denom].map(normalizeRow).sort());
  });

  test(`die "${denom}": neighbours are mutual and never the face itself`, () => {
    for (const face of faceList(denom)) {
      const neighbours = adjacentFaces(denom, face);
      assert.ok(!neighbours.includes(face), `face ${face} lists itself`);
      assert.equal(new Set(neighbours).size, neighbours.length, `face ${face} lists a neighbour twice`);
      for (const n of neighbours) {
        assert.ok(adjacentFaces(denom, n).includes(face), `face ${face} touches ${n}, but ${n} does not touch ${face}`);
      }
    }
  });
}

test("every face of a d6 touches all faces but its opposite", () => {
  for (const denom of ["b", "s"]) {
    for (const face of faceList(denom)) assert.equal(adjacentFaces(denom, face).length, 4, `${denom} face ${face}`);
  }
});

test("the d8 tables have the shape of an octahedron", () => {
  // Faces of an octahedron touch 3 others, and the faces split into two sets where every
  // neighbour of a face lies in the other set (the cube is its dual).
  for (const denom of ["a", "i"]) {
    const side = { 1: 0 };
    const queue = [1];
    while (queue.length) {
      const face = queue.shift();
      assert.equal(adjacentFaces(denom, face).length, 3, `${denom} face ${face}`);
      for (const n of adjacentFaces(denom, face)) {
        if (side[n] === undefined) {
          side[n] = 1 - side[face];
          queue.push(n);
        } else {
          assert.notEqual(side[n], side[face], `${denom} faces ${face} and ${n} touch but sit in the same set`);
        }
      }
    }
    assert.equal(Object.keys(side).length, 8, `${denom}: every face is reachable`);
  }
});

test("the d12 tables have the shape of a dodecahedron", () => {
  // Each face of a dodecahedron is ringed by 5 faces, and each of those touches exactly
  // two others in the ring.
  for (const denom of ["p", "c"]) {
    for (const face of faceList(denom)) {
      const ring = adjacentFaces(denom, face);
      assert.equal(ring.length, 5, `${denom} face ${face}`);
      for (const n of ring) {
        const inRing = adjacentFaces(denom, n).filter((m) => ring.includes(m));
        assert.equal(inRing.length, 2, `${denom} face ${n} in the ring around ${face}`);
      }
    }
  }
});

test("Force dice can never be turned; every other die can", () => {
  assert.equal(canTurnToAdjacent("f"), false);
  assert.deepEqual(adjacentFaces("f", 1), []);
  for (const denom of ["b", "s", "a", "i", "p", "c"]) assert.equal(canTurnToAdjacent(denom), true, denom);
});

test("an unknown die or face has no neighbours", () => {
  assert.equal(canTurnToAdjacent("x"), false);
  assert.deepEqual(adjacentFaces("x", 1), []);
  assert.deepEqual(adjacentFaces("a", 9), []);
});

class AbilityTerm {
  static DENOMINATION = "a";
  constructor(faces) {
    this.results = faces.map((face) => ({ result: face, active: true, ffg: CONFIG.FFG.ABILITY_RESULTS[face] }));
  }
}

test("turning a die swaps in the new face and refreshes the die's totals", () => {
  const term = new AbilityTerm([1, 4]); // blank, 2 success
  const untouched = term.results[1];

  assert.equal(turnTermFace(term, 0, 8), true); // blank -> 2 advantage (they share an edge)

  assert.equal(term.results[0].result, 8);
  assert.equal(term.results[0].active, true);
  assert.equal(term.results[0].ffg.advantage, 2);
  assert.equal(term.results[1], untouched);
  assert.deepEqual(term.ffg, { success: 2, failure: 0, advantage: 2, threat: 0, triumph: 0, despair: 0, light: 0, dark: 0 });
});

test("a face that does not touch the rolled face is refused", () => {
  const term = new AbilityTerm([1]);
  const before = term.results[0];

  assert.equal(turnTermFace(term, 0, 4), false); // blank and 2 success only share a corner
  assert.equal(turnTermFace(term, 0, 1), false); // the face it already shows
  assert.equal(turnTermFace(term, 5, 2), false); // no such result

  assert.equal(term.results[0], before);
  assert.equal(term.ffg, undefined);
});
