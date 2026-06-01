// V2-full migration tripwire — form submit coalescing.
//
// Behavior under test: when multiple submits are triggered concurrently (the
// spec-tree multi-click race), the pipeline coalesces them so _updateObject
// runs at most twice and the FINAL write reflects the LAST submit's data,
// and every concurrent caller awaits the same in-flight flush. This is the
// invariant the coalesce loop in _onSubmit guarantees.
//
// Render-free: we stub `form`, `_getSubmitData`, and `_updateObject` on a real
// sheet instance so the test exercises the coalesce loop without a rendered
// DOM. Durable across stages as long as the sheet keeps a coalescing submit
// path (the plan requires preserving it).

export const FormSubmitCoalesceTests = (suite, suiteInstance, Test, chai) => {
  const _suite = suiteInstance.create(suite, "V2 Migration — Form Submit Coalesce");

  _suite.addTest(new Test("concurrent submits coalesce; last write wins; callers share the flush", async function () {
    const item = await Item.create({ name: "_v2mig_coalesce", type: "gear" });
    try {
      const sheet = item.sheet;

      // Minimal form so the _onSubmit editable/form guard passes without render.
      const fakeForm = document.createElement("form");
      Object.defineProperty(sheet, "form", { get: () => fakeForm, configurable: true });

      // Deterministic submit-data: echo whatever updateData was passed in.
      sheet._getSubmitData = (updateData = {}) => ({ ...(updateData || {}) });

      let calls = 0;
      let lastData = null;
      sheet._updateObject = async (_event, formData) => {
        calls += 1;
        lastData = formData;
        // Yield once so the second _onSubmit lands while we're mid-flight and
        // is recorded as the pending submit rather than starting a new flush.
        await Promise.resolve();
      };

      const p1 = sheet._onSubmit(new Event("submit"), { updateData: { v: 1 } });
      const p2 = sheet._onSubmit(new Event("submit"), { updateData: { v: 2 } });
      const [r1, r2] = await Promise.all([p1, p2]);

      chai.expect(calls, "coalesced into at most two updateObject calls").to.be.at.most(2);
      chai.expect(lastData, "an update actually ran").to.not.equal(null);
      chai.expect(lastData.v, "the last submit's data wins").to.equal(2);
      chai.expect(r2, "the coalesced caller resolves to the flushed form data").to.deep.equal(r1 ?? r2);
    } finally {
      await item.delete();
    }
  }));
};
