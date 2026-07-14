import {
  CDX_SCHEMES,
  CDX_SCHEME_LABELS,
  CodexActorSheet,
} from "../modules/actors/codex-sheets.js";
import { CodexItemSheet } from "../modules/items/codex-item-sheet.js";

export const CodexSchemeTests = (suite, suiteInstance, Test, chai) => {
  const _suite = suiteInstance.create(suite, "Codex II — Schemes");

  _suite.addTest(new Test("Eldritch Horror variants are registered with their public labels", function () {
    chai.expect(CDX_SCHEMES).to.include("eldritch-scholar");
    chai.expect(CDX_SCHEMES).to.include("eldritch-fate");
    chai.expect(CDX_SCHEME_LABELS["eldritch-scholar"]).to.equal("Eldritch Horror - Scholar");
    chai.expect(CDX_SCHEME_LABELS["eldritch-fate"]).to.equal("Eldritch Horror - Fate");

    const setting = game.settings.settings.get("starwarsffg.defaultSheetTheme");
    chai.expect(setting?.choices?.["codex-eldritch-scholar"]).to.equal("Codex II — Eldritch Horror - Scholar");
    chai.expect(setting?.choices?.["codex-eldritch-fate"]).to.equal("Codex II — Eldritch Horror - Fate");
  }));

  _suite.addTest(new Test("legacy 'eldritch' flag resolves to the Scholar variant", function () {
    const actor = {
      getFlag: (scope, key) => scope === "starwarsffg" && key === "scheme" ? "eldritch" : undefined,
    };
    const item = {
      actor,
      getFlag: () => undefined,
    };

    chai.expect(CodexActorSheet.prototype._cdxScheme.call({ actor })).to.equal("eldritch-scholar");
    chai.expect(CodexItemSheet.prototype._cdxScheme.call({ item })).to.equal("eldritch-scholar");
  }));

  _suite.addTest(new Test("Eldritch variants also carry the shared base scheme class", function () {
    // Both variants emit the specific class AND the base `scheme-eldritch`, so the
    // shared CSS + the bleeding-texture JS (gated on `.scheme-eldritch`) apply.
    chai.expect(CodexActorSheet.prototype._getLegacyRootClasses.call({ _cdxScheme: () => "eldritch-fate" }))
      .to.deep.equal(["scheme-eldritch-fate", "scheme-eldritch"]);
    chai.expect(CodexActorSheet.prototype._getLegacyRootClasses.call({ _cdxScheme: () => "eldritch-scholar" }))
      .to.deep.equal(["scheme-eldritch-scholar", "scheme-eldritch"]);
    chai.expect(CodexItemSheet.prototype._getLegacyRootClasses.call({ _cdxScheme: () => "eldritch-fate" }))
      .to.deep.equal(["scheme-eldritch-fate", "scheme-eldritch"]);
    // Non-Eldritch schemes are unaffected (single class).
    chai.expect(CodexActorSheet.prototype._getLegacyRootClasses.call({ _cdxScheme: () => "republic" }))
      .to.deep.equal(["scheme-republic"]);
  }));
};
