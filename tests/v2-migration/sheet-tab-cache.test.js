// V2-full migration tripwire — active-tab cache contract.
//
// Behavior under test: the per-document active-tab cache round-trips a
// selected tab keyed by document, so reopening a sheet restores the tab the
// user last had open. This is the mechanism the duplicate-Tabs-binding bug
// defeated (the second Tabs controller snapped back to the default). The
// full open/select/close/reopen + in-place re-render UI assertion stays in
// the manual per-stage checklist; here we verify the cache key is
// well-formed and the cache round-trips through the sheet instance.
//
// Durable accessor: read the cache off `sheet.constructor` (inherited static
// today, the native sheet's own Map after Stages 3-4), never by importing
// the compat base directly.

export const SheetTabCacheTests = (suite, suiteInstance, Test, chai) => {
  const _suite = suiteInstance.create(suite, "V2 Migration — Sheet Tab Cache");

  _suite.addTest(new Test("active-tab cache key is document-scoped and round-trips", async function () {
    const item = await Item.create({ name: "_v2mig_tabcache", type: "gear" });
    try {
      const sheet = item.sheet;
      const cache = sheet.constructor._activeTabCache;
      chai.expect(cache, "sheet class exposes an _activeTabCache Map").to.exist;

      const key = sheet._activeTabCacheKey;
      chai.expect(key, "cache key resolves to a string").to.be.a("string");
      chai.expect(key, "cache key is scoped to this document").to.contain(item.uuid);

      // Round-trip a selected tab and read it back the same way the sheet's
      // tab init resolves its initial tab.
      cache.set(key, "attributes");
      chai.expect(cache.get(sheet._activeTabCacheKey)).to.equal("attributes");

      // Distinct documents get distinct cache entries (no cross-talk).
      const other = await Item.create({ name: "_v2mig_tabcache2", type: "gear" });
      try {
        chai.expect(other.sheet._activeTabCacheKey).to.not.equal(key);
        chai.expect(cache.get(other.sheet._activeTabCacheKey)).to.not.equal("attributes");
      } finally {
        await other.delete();
      }
    } finally {
      await item.delete();
    }
  }));
};
