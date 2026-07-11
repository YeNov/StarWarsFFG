import {
  CDX_SCHEMES,
  CDX_SCHEME_LABELS,
  CodexActorSheet,
} from "../modules/actors/codex-sheets.js";
import { CodexItemSheet } from "../modules/items/codex-item-sheet.js";

export const CodexSchemeTests = (suite, suiteInstance, Test, chai) => {
  const _suite = suiteInstance.create(suite, "Codex II — Schemes");

  _suite.addTest(new Test("Eldritch Horror is registered with its public label", function () {
    chai.expect(CDX_SCHEMES).to.include("eldritch");
    chai.expect(CDX_SCHEME_LABELS.eldritch).to.equal("Eldritch Horror");

    const setting = game.settings.settings.get("starwarsffg.defaultSheetTheme");
    chai.expect(setting?.choices?.["codex-eldritch"]).to.equal("Codex II — Eldritch Horror");
  }));

  _suite.addTest(new Test("actor and item sheets resolve the Eldritch scheme flag", function () {
    const actor = {
      getFlag: (scope, key) => scope === "starwarsffg" && key === "scheme" ? "eldritch" : undefined,
    };
    const item = {
      actor,
      getFlag: () => undefined,
    };

    const actorScheme = CodexActorSheet.prototype._cdxScheme.call({ actor });
    const itemScheme = CodexItemSheet.prototype._cdxScheme.call({ item });

    chai.expect(actorScheme).to.equal("eldritch");
    chai.expect(itemScheme).to.equal("eldritch");
    chai.expect(CodexActorSheet.prototype._getLegacyRootClasses.call({ _cdxScheme: () => actorScheme })).to.deep.equal(["scheme-eldritch"]);
    chai.expect(CodexItemSheet.prototype._getLegacyRootClasses.call({ _cdxScheme: () => itemScheme })).to.deep.equal(["scheme-eldritch"]);
  }));
};
