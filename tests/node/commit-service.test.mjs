import test from "node:test";
import assert from "node:assert/strict";

import { isMatchingCommittedActor } from "../../modules/char-creator/commit-service.js";

const commit = {
  userId: "user-1",
  commitId: "COMMIT0000000001",
  firstAttemptAt: "2026-07-21T12:34:56.000Z",
  xp: { total: 110, available: 35 },
};

function actorWithStamp(stamp) {
  return {
    getFlag: (scope, key) => {
      assert.equal(scope, "starwarsffg");
      assert.equal(key, "pcWizardCommit");
      return stamp;
    },
  };
}

test("same stamped commit is recognized as an idempotent retry", () => {
  const actor = actorWithStamp({
    userId: "user-1",
    commitId: "COMMIT0000000001",
    date: "2026-07-21",
    xp: { total: 110, available: 35 },
  });

  assert.equal(isMatchingCommittedActor(actor, commit), true);
});

test("different commit stamp is not treated as a retry", () => {
  assert.equal(isMatchingCommittedActor(actorWithStamp({ ...commit, commitId: "COMMIT0000000002", date: "2026-07-21" }), commit), false);
  assert.equal(isMatchingCommittedActor(actorWithStamp({
    userId: "user-2",
    commitId: "COMMIT0000000001",
    date: "2026-07-21",
    xp: { total: 110, available: 35 },
  }), commit), false);
  assert.equal(isMatchingCommittedActor(actorWithStamp({
    userId: "user-1",
    commitId: "COMMIT0000000001",
    date: "2026-07-21",
    xp: { total: 110, available: 34 },
  }), commit), false);
});
