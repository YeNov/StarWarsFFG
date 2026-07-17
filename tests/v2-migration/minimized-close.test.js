// V2 migration tripwire - minimized close should not wait on the close animation.
//
// Foundry ApplicationV2.close waits up to 1000ms for a transition unless
// `animate:false` is passed. When a window is already minimized, that animation is
// not useful; clicking X should remove the window immediately.

import { FFGDocumentSheet } from "../../modules/apps/ffg-document-sheet.js";
import { FFGFormApplication } from "../../modules/apps/ffg-form-application.js";

export const MinimizedCloseTests = (suite, suiteInstance, Test, chai) => {
  const _suite = suiteInstance.create(suite, "V2 Migration - Minimized Close");

  const captureParentCloseOptions = async (Class, minimized) => {
    const parent = Object.getPrototypeOf(Class.prototype);
    const originalClose = parent.close;
    let capturedOptions;
    parent.close = async function (options = {}) {
      capturedOptions = options;
      return this;
    };

    try {
      const app = Object.create(Class.prototype);
      app.options = {};
      app.form = null;
      Object.defineProperty(app, "minimized", { configurable: true, value: minimized });
      await app.close({});
      return capturedOptions;
    } finally {
      parent.close = originalClose;
    }
  };

  for (const [label, Class] of [
    ["document sheets", FFGDocumentSheet],
    ["form applications", FFGFormApplication],
  ]) {
    _suite.addTest(new Test(`${label} close instantly when already minimized`, async function () {
      const options = await captureParentCloseOptions(Class, true);
      chai.expect(options.animate).to.equal(false);
    }));

    _suite.addTest(new Test(`${label} keep normal close animation when not minimized`, async function () {
      const options = await captureParentCloseOptions(Class, false);
      chai.expect(options).to.not.have.property("animate");
    }));
  }
};
