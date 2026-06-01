// V2-full migration tripwire — dialog submit re-entry invariant.
//
// Behavior under test: a dialog's confirming action must fire its callback
// exactly ONCE even if the action is triggered twice in rapid succession
// (the XP-double-apply bug). This is the durable invariant; the full
// "drive every close path (button / X / Esc)" scenario stays in the manual
// per-stage checklist because it needs real DOM events.
//
// STAGE REPOINT: this imports DialogV2Compat, which Stage 1 deletes. When
// Stage 1 replaces the wrapper with native DialogV2, repoint this test at
// the new single-submit guard (the invariant is unchanged).
import { DialogV2Compat } from "../../modules/apps/dialog-v2-compat.js";

export const DialogSubmitTests = (suite, suiteInstance, Test, chai) => {
  const _suite = suiteInstance.create(suite, "V2 Migration — Dialog Submit");

  _suite.addTest(new Test("confirming action fires its callback exactly once on double-trigger", async function () {
    let count = 0;
    const dialog = new DialogV2Compat({
      title: "tripwire",
      content: "<p>x</p>",
      buttons: {
        submit: {
          label: "OK",
          callback: async () => { count += 1; },
        },
      },
      default: "submit",
    });

    // Two synchronous triggers, as a double-click would produce. The second
    // must early-return on the _actionSubmitted guard. No render needed:
    // without a rendered app, button-disable and close() are no-ops.
    await Promise.all([
      dialog._submitLegacyAction("submit"),
      dialog._submitLegacyAction("submit"),
    ]);

    chai.expect(count).to.equal(1);
  }));

  _suite.addTest(new Test("guard resets after a failed submit so the action can be retried", async function () {
    let attempts = 0;
    const dialog = new DialogV2Compat({
      title: "tripwire",
      content: "<p>x</p>",
      buttons: {
        submit: {
          label: "OK",
          callback: async () => {
            attempts += 1;
            if (attempts === 1) throw new Error("boom");
          },
        },
      },
      default: "submit",
    });

    // First attempt throws -> guard must reset.
    try { await dialog._submitLegacyAction("submit"); } catch (_e) { /* expected */ }
    // Second attempt must be allowed through and succeed.
    await dialog._submitLegacyAction("submit");

    chai.expect(attempts).to.equal(2);
  }));
};
