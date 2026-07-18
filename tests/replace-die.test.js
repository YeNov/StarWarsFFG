import { RollFFG } from "../modules/dice/roll.js";
import {
  zeroTally,
  faceTally,
  computeFFGTotals,
  recomputeTermFFG,
  spliceReplacement,
  cloneEvaluatedTerm,
} from "../modules/dice/replace-die.js";

export const ReplaceDieTests = (suite, suiteInstance, Test, chai) => {
  const _suite = suiteInstance.create(suite, "Replace Die");

  // -- computeFFGTotals (pure, no Foundry deps) --------------------------

  _suite.addTest(
    new Test("computeFFGTotals cancels success against failure", function () {
      const t = computeFFGTotals([{ ...zeroTally(), success: 3, failure: 1 }], []);
      chai.expect(t.success).to.equal(2);
      chai.expect(t.failure).to.equal(0);
    })
  );

  _suite.addTest(
    new Test("computeFFGTotals cancels advantage against threat", function () {
      const t = computeFFGTotals([{ ...zeroTally(), advantage: 1, threat: 4 }], []);
      chai.expect(t.advantage).to.equal(0);
      chai.expect(t.threat).to.equal(3);
    })
  );

  _suite.addTest(
    new Test("computeFFGTotals never cancels light against dark", function () {
      const t = computeFFGTotals([{ ...zeroTally(), light: 3, dark: 5 }], []);
      chai.expect(t.light).to.equal(3);
      chai.expect(t.dark).to.equal(5);
    })
  );

  _suite.addTest(
    new Test("computeFFGTotals: an added Triumph adds a success and survives net-zero", function () {
      // One failure face plus an added Triumph: the coupled success cancels
      // the failure to zero, but triumph itself is never touched by cancellation.
      const t = computeFFGTotals([{ ...zeroTally(), failure: 1 }], [{ type: "Triumph", value: 1, negative: false }]);
      chai.expect(t.success).to.equal(0);
      chai.expect(t.failure).to.equal(0);
      chai.expect(t.triumph).to.equal(1);
    })
  );

  _suite.addTest(
    new Test("computeFFGTotals: an added Despair adds a failure", function () {
      const t = computeFFGTotals([], [{ type: "Despair", value: 1, negative: false }]);
      chai.expect(t.failure).to.equal(1);
      chai.expect(t.despair).to.equal(1);
    })
  );

  _suite.addTest(
    new Test("computeFFGTotals handles negative addedResults (mirrors evaluate()'s symmetric cancellation)", function () {
      const t = computeFFGTotals([], [{ type: "Advantage", value: 2, negative: true }]);
      chai.expect(t.advantage).to.equal(0);
      chai.expect(t.threat).to.equal(2);
    })
  );

  _suite.addTest(
    new Test("computeFFGTotals with empty inputs is all zeros", function () {
      chai.expect(computeFFGTotals([], [])).to.deep.equal(zeroTally());
    })
  );

  // -- faceTally ------------------------------------------------------------

  _suite.addTest(
    new Test("faceTally returns r.ffg when present, ignoring the die entirely", function () {
      const ffg = { ...zeroTally(), success: 1 };
      chai.expect(faceTally(null, { ffg, active: true })).to.equal(ffg);
    })
  );

  _suite.addTest(
    new Test("faceTally recovers from CONFIG.FFG.PROFICIENCY_RESULTS when r.ffg is missing", function () {
      const term = new CONFIG.Dice.terms.p(1);
      const tally = faceTally(term, { result: 12 });
      chai.expect(tally).to.deep.equal(CONFIG.FFG.PROFICIENCY_RESULTS[12]);
      chai.expect(tally.triumph).to.equal(1);
    })
  );

  _suite.addTest(
    new Test("faceTally returns null for an inactive (discarded) face, even with r.ffg present", function () {
      const ffg = { ...zeroTally(), success: 1 };
      chai.expect(faceTally(null, { ffg, active: false })).to.be.null;
    })
  );

  _suite.addTest(
    new Test("faceTally returns null for a malformed/unknown face and never throws", function () {
      const term = new CONFIG.Dice.terms.p(1);
      chai.expect(faceTally(term, { result: 9999 })).to.be.null;
      chai.expect(faceTally(term, null)).to.be.null;
      chai.expect(faceTally({}, { result: 1 })).to.be.null;
    })
  );

  // -- recomputeTermFFG -------------------------------------------------

  _suite.addTest(
    new Test("recomputeTermFFG aggregates results[].ffg", function () {
      const term = {
        results: [
          { ffg: { ...zeroTally(), success: 1 } },
          { ffg: { ...zeroTally(), advantage: 1 } },
        ],
      };
      recomputeTermFFG(term);
      chai.expect(term.ffg).to.deep.equal({ ...zeroTally(), success: 1, advantage: 1 });
    })
  );

  _suite.addTest(
    new Test("recomputeTermFFG matches the die's own evaluate() aggregation", async function () {
      const die = new CONFIG.Dice.terms.b(3);
      await die.evaluate();
      const evaluated = foundry.utils.deepClone(die.ffg);
      recomputeTermFFG(die);
      chai.expect(die.ffg).to.deep.equal(evaluated);
    })
  );

  // -- spliceReplacement: model-shape adapters (no Foundry deps) --------

  const modelAdapters = {
    getDenom: (t) => t.denom,
    makeOperator: () => ({ op: "+" }),
    makeTerm: (src, res) => ({ denom: src.denom, results: res }),
  };
  const tag = (x) => (x.op ? "op" : x.denom);

  _suite.addTest(
    new Test("spliceReplacement (model): cross-denom replace of the first face flattens to b,p,a", function () {
      // 2dp+1da
      const terms = [
        { denom: "p", results: ["rp1", "rp2"] },
        { op: "+" },
        { denom: "a", results: ["ra1"] },
      ];
      const fresh = { denom: "b", results: ["rb1"] };
      const out = spliceReplacement(terms, 0, 0, fresh, modelAdapters);
      chai.expect(out.map(tag)).to.deep.equal(["b", "op", "p", "op", "a"]);
      chai.expect(out[2].results).to.deep.equal(["rp2"]);
    })
  );

  _suite.addTest(
    new Test("spliceReplacement (model): cross-denom replace of the second face flattens to p,b,a", function () {
      const terms = [
        { denom: "p", results: ["rp1", "rp2"] },
        { op: "+" },
        { denom: "a", results: ["ra1"] },
      ];
      const fresh = { denom: "b", results: ["rb1"] };
      const out = spliceReplacement(terms, 0, 1, fresh, modelAdapters);
      chai.expect(out.map(tag)).to.deep.equal(["p", "op", "b", "op", "a"]);
      chai.expect(out[0].results).to.deep.equal(["rp1"]);
    })
  );

  _suite.addTest(
    new Test("spliceReplacement (model): splitting a middle term keeps the flanking operators intact", function () {
      // 1dp+2da+1db
      const opBefore = { op: "+" };
      const opAfter = { op: "+" };
      const terms = [
        { denom: "p", results: ["rp1"] },
        opBefore,
        { denom: "a", results: ["ra1", "ra2"] },
        opAfter,
        { denom: "b", results: ["rb1"] },
      ];
      const fresh = { denom: "c", results: ["rc1"] };
      const out = spliceReplacement(terms, 2, 0, fresh, modelAdapters);
      chai.expect(out.map(tag)).to.deep.equal(["p", "op", "c", "op", "a", "op", "b"]);
      // The original flanking operators are untouched, same objects, still adjacent to p and b.
      chai.expect(out[1]).to.equal(opBefore);
      chai.expect(out[5]).to.equal(opAfter);
      chai.expect(out[4].results).to.deep.equal(["ra2"]);
    })
  );

  _suite.addTest(
    new Test("spliceReplacement (model): same-denom replacement keeps one term at the exact position", function () {
      const opTerm = { op: "+" };
      const aTerm = { denom: "a", results: ["ra1"] };
      const terms = [{ denom: "p", results: ["rp1", "rp2"] }, opTerm, aTerm];
      const fresh = { denom: "p", results: ["rpNew"] };
      const out = spliceReplacement(terms, 0, 0, fresh, modelAdapters);
      chai.expect(out.length).to.equal(3);
      chai.expect(out[0].denom).to.equal("p");
      chai.expect(out[0].results).to.deep.equal(["rpNew", "rp2"]);
      chai.expect(out[1]).to.equal(opTerm);
      chai.expect(out[2]).to.equal(aTerm);
    })
  );

  // -- spliceReplacement: live Foundry-shaped adapters (round-2 Blocker regression) --

  const liveAdapters = {
    getDenom: (t) => t?.constructor?.DENOMINATION,
    makeOperator: () => new foundry.dice.terms.OperatorTerm({ operator: "+" }),
    makeTerm: (src, res) => cloneEvaluatedTerm(src.constructor, res),
  };

  _suite.addTest(
    new Test("spliceReplacement (live): cross-denom split produces real, serializable RollTerms in order", async function () {
      const p = new CONFIG.Dice.terms.p(2);
      await p.evaluate();
      const opTerm = new foundry.dice.terms.OperatorTerm({ operator: "+" });
      const a = new CONFIG.Dice.terms.a(1);
      await a.evaluate();
      const terms = [p, opTerm, a];

      const freshBoost = new CONFIG.Dice.terms.b(1);
      await freshBoost.evaluate();

      const out = spliceReplacement(terms, 0, 0, freshBoost, liveAdapters);

      chai.expect(out.length).to.equal(5);
      chai.expect(out[0]).to.equal(freshBoost);
      chai.expect(out[1]).to.be.instanceOf(foundry.dice.terms.OperatorTerm);
      chai.expect(out[2].constructor.DENOMINATION).to.equal("p");
      chai.expect(out[2].results).to.deep.equal([p.results[1]]);
      chai.expect(out[3]).to.equal(opTerm); // original flanking operator, untouched
      chai.expect(out[4]).to.equal(a); // untouched term, same reference

      for (const el of out) {
        chai.expect(typeof el.toJSON).to.equal("function");
      }

      const denomOrder = out
        .filter((t) => !(t instanceof foundry.dice.terms.OperatorTerm))
        .map((t) => t.constructor.DENOMINATION);
      chai.expect(denomOrder).to.deep.equal(["b", "p", "a"]);
    })
  );

  _suite.addTest(
    new Test("spliceReplacement (live): same-denom replacement takes the swap branch, not the split branch", async function () {
      const p = new CONFIG.Dice.terms.p(2);
      await p.evaluate();
      const opTerm = new foundry.dice.terms.OperatorTerm({ operator: "+" });
      const a = new CONFIG.Dice.terms.a(1);
      await a.evaluate();
      const terms = [p, opTerm, a];

      const freshP = new CONFIG.Dice.terms.p(1);
      await freshP.evaluate();

      const out = spliceReplacement(terms, 0, 0, freshP, liveAdapters);

      chai.expect(out.length).to.equal(3); // swap branch: no split, no new operator
      chai.expect(out[0].constructor.DENOMINATION).to.equal("p");
      chai.expect(out[0].results[0]).to.equal(freshP.results[0]);
      chai.expect(out[0].results[1]).to.equal(p.results[1]);
      chai.expect(out[1]).to.equal(opTerm);
      chai.expect(out[2]).to.equal(a);
    })
  );

  // -- Audit capture: the defensive path used to snapshot a removed face --

  _suite.addTest(
    new Test("audit capture: deepClone(faceTally(...) ?? zeroTally()) recovers the table tally and never throws", function () {
      const term = new CONFIG.Dice.terms.p(1);
      const captured = foundry.utils.deepClone(faceTally(term, { result: 12 }) ?? zeroTally());
      chai.expect(captured).to.deep.equal(CONFIG.FFG.PROFICIENCY_RESULTS[12]);
    })
  );

  _suite.addTest(
    new Test("audit capture: a malformed face captures zeroTally(), never undefined", function () {
      const term = new CONFIG.Dice.terms.p(1);
      const captured = foundry.utils.deepClone(faceTally(term, { result: 9999 }) ?? zeroTally());
      chai.expect(captured).to.deep.equal(zeroTally());
      chai.expect(captured).to.not.be.undefined;
    })
  );

  // -- RollFFG.modifications serialization round-trip (design §5.1) -----

  _suite.addTest(
    new Test("RollFFG.modifications round-trips through toJSON/fromData", function () {
      const roll = new RollFFG("0");
      roll.modifications = [{ by: "x", mode: "dice", original: { denom: "p" }, replacement: { kind: "die", denom: "b" } }];
      const revived = RollFFG.fromData(JSON.parse(JSON.stringify(roll)));
      chai.expect(revived.modifications).to.deep.equal(roll.modifications);
    })
  );

  _suite.addTest(
    new Test("RollFFG.modifications defaults to [] when absent from serialized data", function () {
      const roll = new RollFFG("0");
      const data = JSON.parse(JSON.stringify(roll));
      delete data.modifications;
      const revived = RollFFG.fromData(data);
      chai.expect(revived.modifications).to.deep.equal([]);
    })
  );
};
