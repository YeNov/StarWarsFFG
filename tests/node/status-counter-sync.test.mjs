import test from "node:test";
import assert from "node:assert/strict";

import { planStatusCounterSync } from "../../modules/helpers/status-counter-sync.js";

/**
 * The Status Icon Counters bridge mirrors a counter's value onto the Active Effect's own
 * changes, so a stacked condition applies its modifier once per stack.
 *
 * It was registered as a bare `updateActiveEffect` hook with no guards. That hook fires on
 * EVERY connected client for EVERY Active Effect update anywhere in the world, and the write
 * sat outside the "is this a counter change at all" test -- so every client echoed every
 * effect update back at the server. Players got a red "User <name> lacks permission to update
 * ActiveEffect [...] in parent Item [...]" toast for each effect they do not own, five at a
 * time when a GM loading an actor resynced one item's effects.
 *
 * These cover the predicate that decides whether this client writes anything at all.
 */

const ME = "user-me";
const OTHER = "user-other";

// V14 stores the changes at `system.changes`. The PREPARED entries additionally carry a
// back-reference to the effect that owns them, which is what the old bridge serialized back
// into the document; `_source` is the clean stored copy, and is what the plan must read.
const effect = ({ isOwner = true, changes = [{ key: "system.stats.soak.value", type: "add", value: 1 }] } = {}) => ({
  isOwner,
  _source: { system: { changes } },
  system: { changes: changes.map((c) => ({ ...c, effect: { name: "back-reference" } })) },
});

const counterChange = (value) => ({ flags: { statuscounter: { counter: { value } } } });

test("mirrors the counter value onto every change", () => {
  const ae = effect({ changes: [{ key: "a", type: "add", value: 1 }, { key: "b", type: "add", value: 1 }] });

  const planned = planStatusCounterSync(ae, counterChange(3), ME, ME);

  assert.deepEqual(planned, [{ key: "a", type: "add", value: 3 }, { key: "b", type: "add", value: 3 }]);
});

test("does not carry a change's back-reference to its own effect into the write", () => {
  // Reading the prepared changes and writing them straight back serialized a copy of the whole
  // Active Effect into each of its changes -- on every client that had permission to do it.
  const ae = { isOwner: true, system: { changes: [{ key: "a", type: "add", value: 1, effect: { name: "(inherent)" } }] } };

  const planned = planStatusCounterSync(ae, counterChange(3), ME, ME);

  assert.deepEqual(planned, [{ key: "a", type: "add", value: 3 }]);
});

test("does not mutate the effect's own changes", () => {
  const ae = effect({ changes: [{ key: "a", type: "add", value: 1 }] });

  planStatusCounterSync(ae, counterChange(3), ME, ME);

  assert.deepEqual(ae._source.system.changes, [{ key: "a", type: "add", value: 1 }]);
});

test("writes nothing for an update another client performed", () => {
  // The hook runs on every client. Only the one that made the change writes the follow-up;
  // everyone else receives it through the normal document broadcast.
  assert.equal(planStatusCounterSync(effect(), counterChange(3), OTHER, ME), null);
});

test("writes nothing when the update carries no counter value", () => {
  // This is what produced the permission toasts: the write used to run for every Active
  // Effect update in the world, counter or not.
  assert.equal(planStatusCounterSync(effect(), { disabled: true }, ME, ME), null);
  assert.equal(planStatusCounterSync(effect(), {}, ME, ME), null);
});

test("writes nothing when this user cannot modify the effect", () => {
  assert.equal(planStatusCounterSync(effect({ isOwner: false }), counterChange(3), ME, ME), null);
});

test("writes nothing when the changes already carry the counter value", () => {
  const ae = effect({ changes: [{ key: "a", type: "add", value: 3 }] });

  assert.equal(planStatusCounterSync(ae, counterChange(3), ME, ME), null);
});

test("reads a flattened counter path as well as an expanded one", () => {
  const ae = effect({ changes: [{ key: "a", type: "add", value: 1 }] });

  const planned = planStatusCounterSync(ae, { "flags.statuscounter.counter.value": 2 }, ME, ME);

  assert.deepEqual(planned, [{ key: "a", type: "add", value: 2 }]);
});

test("writes nothing for an effect with no changes", () => {
  assert.equal(planStatusCounterSync(effect({ changes: [] }), counterChange(3), ME, ME), null);
  assert.equal(planStatusCounterSync({ isOwner: true }, counterChange(3), ME, ME), null);
});
