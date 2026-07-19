import { availFor, computeCritAvailability } from "../modules/helpers/crit-availability.js";

export const CritTraumaCounterTests = (suite, suiteInstance, Test, chai) => {
  const _suite = suiteInstance.create(suite, "Crit-Trauma Counter");   // <-- exact parent title used by the verification filter

  _suite.addTest(new Test("null stamp is attemptable now", function () {
    chai.expect(availFor(null, 5)).to.deep.equal({ attemptable: true, daysLeft: 0 });
  }));
  _suite.addTest(new Test("boundary: stamp+7 === currentDay is attemptable", function () {
    chai.expect(availFor(0, 7).attemptable).to.equal(true);
  }));
  _suite.addTest(new Test("mid-cooldown reports remaining days", function () {
    chai.expect(availFor(3, 5)).to.deep.equal({ attemptable: false, daysLeft: 5 });
  }));
  _suite.addTest(new Test("rewind clamps daysLeft at 7 (never overflow)", function () {
    chai.expect(availFor(100, 5).daysLeft).to.equal(7);
  }));
  _suite.addTest(new Test("fresh crit: receivedDay gates Resilience, Medicine open, mechanics null", function () {
    const a = computeCritAvailability({ receivedDay: 5 }, 5, false, true);
    chai.expect(a.resilience.attemptable).to.equal(false);
    chai.expect(a.resilience.daysLeft).to.equal(7);
    chai.expect(a.medicine.attemptable).to.equal(true);
    chai.expect(a.mechanics).to.equal(null);
  }));
  _suite.addTest(new Test("mechanics present only when vehicleLimit on", function () {
    chai.expect(computeCritAvailability({ mechanicsLastAttemptDay: null }, 5, true, false).mechanics.attemptable).to.equal(true);
  }));
};
