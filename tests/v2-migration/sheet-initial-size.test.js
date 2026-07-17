// V2-full migration tripwire — actor sheet initial-size contract (issue #14).
//
// Behavior under test: `getData()` applies the per-type default size on the FIRST
// call only. Re-applying it on every render is what snapped a resized sheet back
// to default, and it did so invisibly: `position` is a Proxy whose set trap runs
// _updatePosition but never #applyPosition, and _updatePosition only writes
// el.style for dimensions that are "auto" — which actor sheets are not (both are
// pinned numerically in DEFAULT_OPTIONS). So the write moved internal state while
// the DOM kept the user's size, and nothing looked wrong until the next
// setPosition replayed the stale clone. Dragging the header is exactly that:
// #onWindowDragMove replays width and height, not just top/left. Hence the
// two-step repro — edit, THEN move.
//
// The full resize/edit/drag UI assertion stays in the manual checklist; what is
// pinned here is the contract every actor sheet class must honour: a size present
// after the first getData survives every later getData.
//
// Covers legacy AND Codex, and BOTH sizing paths — which are distinct:
//   ActorSheetFFG      sizes in its own getData (guarded by _sizeInitialized)
//   AdversarySheetFFG  sizes AGAIN in an override that runs after super.getData(),
//                      so it needs its own latch (_advSizeInitialized). The first
//                      pass at #14 missed this and had no effect on adversary
//                      sheets at all — hence the dedicated case below.
//
// Sheets are constructed but never rendered. That is deliberate and safe:
// ApplicationV2#_updatePosition early-returns when there is no element, so the
// position writes land unclamped and no DOM is required.

import { ActorSheetFFG } from "../../modules/actors/actor-sheet-ffg.js";
import { AdversarySheetFFG } from "../../modules/actors/adversary-sheet-ffg.js";
import { CodexActorSheet, CodexAdversarySheet } from "../../modules/actors/codex-sheets.js";

// Every declared Actor type (system.json documentTypes.Actor).
const ALL_ACTOR_TYPES = ["character", "minion", "vehicle", "homestead", "rival", "nemesis"];
// Codex II is registered for these only — see CODEX_ACTOR_TYPES in swffg-main.js.
const CODEX_TYPES = ["character", "rival", "nemesis", "minion", "vehicle"];

export const SheetInitialSizeTests = (suite, suiteInstance, Test, chai) => {
  const _suite = suiteInstance.create(suite, "V2 Migration — Actor Sheet Initial Size");

  // `loaded` short-circuits the specialization refresh inside getData: it is
  // irrelevant to sizing and slow.
  const makeActor = (type) =>
    Actor.create({ name: `_v2mig_size_${type}`, type, flags: { starwarsffg: { loaded: true } } });

  /**
   * The contract: whatever size the sheet holds after its first getData, a
   * subsequent getData (i.e. any re-render) must leave it alone.
   */
  const assertSizeSurvives = async (sheet, label) => {
    await sheet.getData({});                       // first call — latches and sizes
    const w = sheet.position.width;
    const h = sheet.position.height;
    chai.expect(w, `${label}: first getData establishes a numeric width`).to.be.a("number");
    chai.expect(h, `${label}: first getData establishes a numeric height`).to.be.a("number");

    // Stand in for a user resize. Read the values back rather than trusting the
    // ones we set, so the assertion holds even if a clamp ever applies here.
    sheet.position.width = w - 50;
    sheet.position.height = h - 40;
    const resizedW = sheet.position.width;
    const resizedH = sheet.position.height;
    chai.expect(resizedW, `${label}: the simulated resize actually took`).to.not.equal(w);

    await sheet.getData({});                       // stands in for a re-render
    chai.expect(sheet.position.width, `${label}: width survives a re-render`).to.equal(resizedW);
    chai.expect(sheet.position.height, `${label}: height survives a re-render`).to.equal(resizedH);
  };

  for (const type of ALL_ACTOR_TYPES) {
    _suite.addTest(new Test(`legacy sheet keeps its size across re-renders — ${type}`, async function () {
      const actor = await makeActor(type);
      try {
        await assertSizeSurvives(new ActorSheetFFG({ document: actor }), `ActorSheetFFG/${type}`);
      } finally {
        await actor.delete();
      }
    }));
  }

  for (const type of CODEX_TYPES) {
    _suite.addTest(new Test(`Codex sheet keeps its size across re-renders — ${type}`, async function () {
      const actor = await makeActor(type);
      try {
        await assertSizeSurvives(new CodexActorSheet({ document: actor }), `CodexActorSheet/${type}`);
      } finally {
        await actor.delete();
      }
    }));
  }

  // Adversary sheets are registered for `character` only, and size a second time
  // in their own getData override — the path the first #14 commit missed.
  _suite.addTest(new Test("adversary sheets keep their size across re-renders — legacy + Codex", async function () {
    const actor = await makeActor("character");
    try {
      await assertSizeSurvives(new AdversarySheetFFG({ document: actor }), "AdversarySheetFFG");
      await assertSizeSurvives(new CodexAdversarySheet({ document: actor }), "CodexAdversarySheet");
    } finally {
      await actor.delete();
    }
  }));

  // The guard must suppress RE-application, not sizing itself: a freshly opened
  // sheet still has to land on its per-type default.
  _suite.addTest(new Test("first getData still applies the per-type default size", async function () {
    for (const type of ["character", "vehicle", "minion"]) {
      const actor = await makeActor(type);
      try {
        const sheet = new ActorSheetFFG({ document: actor });
        await sheet.getData({});
        chai.expect(sheet.position.width, `${type}: default width applied on first render`)
          .to.equal(CONFIG.FFG.sheets.defaultWidth[type]);
        chai.expect(sheet.position.height, `${type}: default height applied on first render`)
          .to.equal(CONFIG.FFG.sheets.defaultHeight[type]);
      } finally {
        await actor.delete();
      }
    }
  }));
};
