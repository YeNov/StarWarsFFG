import test from "node:test";
import assert from "node:assert/strict";

import { onceEffectIds, postThenPay } from "../../modules/dice/roll-costs.js";

/**
 * What a roll costs -- its once-only effects and a round of ammo -- is paid only after the roll
 * has reached chat. A roll that fails to post leaves the actor and the weapon as they were, so
 * the player can roll again without having lost anything.
 *
 * The roll dialog builds the post and the costs; this covers the order they run in. The chat
 * post itself and the document writes stay in the dialog (modules/dice/roll-builder.js).
 */

test("a roll that fails to post costs nothing", async () => {
  let paid = 0;
  const post = async () => { throw new Error("chat is down"); };

  await assert.rejects(postThenPay(post, [async () => { paid += 1; }]), /chat is down/);

  assert.equal(paid, 0);
});

test("a posted roll pays each cost once, after the post", async () => {
  const events = [];
  const post = async () => { events.push("post"); return "message"; };
  const costs = [async () => { events.push("effects"); }, async () => { events.push("ammo"); }];

  const result = await postThenPay(post, costs);

  assert.equal(result, "message");
  assert.deepEqual(events, ["post", "effects", "ammo"]);
});

test("a cost that fails is reported and the other costs are still paid", async () => {
  const reported = [];
  let ammoPaid = false;
  const failure = new Error("effect already gone");
  const costs = [async () => { throw failure; }, async () => { ammoPaid = true; }];

  const result = await postThenPay(async () => "message", costs, { onCostError: (err) => reported.push(err) });

  assert.equal(result, "message");
  assert.equal(ammoPaid, true);
  assert.deepEqual(reported, [failure]);
});

test("only once-only effects are consumed, whichever field carries the marker", () => {
  const effects = [
    { id: "flagged", flags: { starwarsffg: { duration: "once" } } },
    { id: "legacy", system: { duration: "once" } },
    { id: "combat", flags: { starwarsffg: { duration: "combat" } } },
    { id: "flag-wins", flags: { starwarsffg: { duration: "combat" } }, system: { duration: "once" } },
    { id: "plain" },
  ];

  assert.deepEqual(onceEffectIds(effects), ["flagged", "legacy"]);
});

test("a post a hook cancelled costs nothing (Codex review)", async () => {
  // ChatMessage.create resolves undefined for one message and [] for a list when a
  // preCreateChatMessage hook refuses them: the roll never reached chat.
  for (const cancelled of [undefined, null, []]) {
    let paid = 0;
    const result = await postThenPay(async () => cancelled, [async () => { paid += 1; }]);
    assert.equal(paid, 0, `nothing paid for ${JSON.stringify(cancelled)}`);
    assert.deepEqual(result, cancelled);
  }
  let paid = 0;
  await postThenPay(async () => [{ id: "m1" }], [async () => { paid += 1; }]);
  assert.equal(paid, 1, "a list with a message in it is a post");
});
