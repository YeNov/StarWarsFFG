Verdict: NEEDS-REVISION

The v1 review artifact contains 11 numbered findings (7 Major, 3 Minor, 1 Question); all 11 are audited below.

# Prior finding audit

1. **Resolved — Major: `vehicleCritWeeklyLimit` unreachable.** §3.5 and §6 now explicitly add the key to `codexSettings._prepareContext()`'s real allow-list in `modules/settings/ui-settings.js`, making the `config: false` setting reachable.
2. **Partially-resolved — Major: non-owner Medicine/Mechanics write path.** §3.3.3 now defines a narrow event, enum-to-field mapping, item/type/house-rule checks, GM-derived day, and authenticated sender lookup, but its permission threshold is unresolved and it still trusts the client for cooldown availability; see New Finding 1.
3. **Resolved — Major: Resilience exposed to non-owners.** §3.2/§3.3.1 now both hide the action with `canSelfHeal` and re-check `item.parent?.isOwner || game.user.isGM` in the handler, correctly accounting for `_cdxActivate` running after the base's non-editable early return.
4. **Resolved — Major: required item-id roll tag omitted.** §3.3.1 retains inline result handling and supplies `actorUuid`, `itemId`, and `path` in a scoped ChatMessage flag accepted by `RollFFG.toMessage()`.
5. **Resolved — Major: Day refresh destroys `[+]` listener.** §3.4/§3.6 now update only a stable `.ffg-campaign-day-value` span's `textContent`, null-guard it, and leave the advance-control node and listener intact.
6. **Partially-resolved — Major: duplicate Resilience attempts.** The local in-flight guard fixes ordinary double-clicks and the live re-check improves stale-render handling, but two clients can still pass the check before either same-day update propagates; the proposed update is not an atomic reservation. Its rollback is also unsafe; see New Findings 2 and 3.
7. **Resolved — Major: false universal `preCreateItem` coverage.** §3.7 folds stamping into the real existing hook and now defines honest stamp-if-null copy semantics rather than claiming a non-null copied crit is a new injury.
8. **Resolved — Question: minion scope conflicts with creation rules.** §5 correctly documents minions as legacy-only, matching both the validation hook that blocks minion critical injuries and Apply Crit's kill-minion branch.
9. **Resolved — Minor: ApplicationV2 registry iteration.** §3.6 uses `foundry.applications.instances.values()` on the actual V13 `Map`, filters the two Codex classes, and places the exported refresh helper where `settings-helpers.js` can import it without a cycle.
10. **Resolved — Minor: NumberField defaults and integer days.** §3.1 corrects the V13 defaults, uses explicit nullable/null/integer fields, explains clean initialization of existing sparse crits, and normalizes feature writes.
11. **Resolved — Minor: localization omitted.** §3.8 and §6 now require localization keys and localized formatting for every new control, countdown, dialog, notification, and setting; the exact file-placement claim needs the Minor correction in New Finding 4.

# New findings

## 1. Major — the new GM bridge authorizes hidden actions and does not enforce availability

- **Section:** §3.3.2–§3.3.3; §5 requestor-permission risk.
- **Why it matters:** The proposed GM endpoint validates membership, type, path, and destination field, but the only cooldown re-check is client-side. A modified client with the chosen permission can emit `ffgCritRecovery` while the path is already cooling down; the GM then replaces the old stamp with the current day and improperly extends the cooldown. The authorization phrase “at least OBSERVER/LIMITED” is also not an implementable threshold. In the installed V13 runtime, `DocumentSheetV2` uses LIMITED merely to open a sheet, while these Codex templates wrap the crit-card body in `{{#unless limited}}`; a LIMITED user cannot see the marker. Allowing LIMITED at the bridge therefore grants an action the real UI withholds.
- **Concrete suggested fix:** On the GM, require `actor.testUserPermission(requestor, "OBSERVER")` (GM remains implicitly OWNER), not LIMITED. After resolving and validating the item/path, recompute that path's availability from the GM's floored `campaignDay` and the live stamp, and reject unless the stamp is null or `currentDay >= stamp + 7`. Treat this as authorization/validation in the endpoint, not a client convenience check.

## 2. Major — same-day item updates are not an atomic multi-client reservation

- **Section:** §2 “no duplicate … multi-client races”; §3.3.1 steps 2–3.
- **Why it matters:** Two clients can both read an attemptable item before either update arrives, then both write the identical `resilienceLastAttemptDay = currentDay`. Foundry's `Item#update` has no compare-and-set precondition and the day field carries no reservation owner; both calls can complete and both clients then roll. The assertion that “a concurrent second attempt now fails the live re-check” is true only when the second check happens after the first update has propagated, not under the race the v2 goal explicitly promises to prevent.
- **Concrete suggested fix:** Route every Resilience reservation—including owner-originated attempts—through one authoritative serialized coordinator on the active GM. Claim an in-memory `actorUuid:itemId` lock synchronously before the first await, re-check live availability on the GM, persist the day, and send a correlated accept/reject response before the client rolls. GM-local attempts must call the same coordinator. Release only through the defined commit/abort path; otherwise remove the multi-client guarantee from the goals and acceptance criteria.

## 3. Major — rollback cannot identify “only the reservation this operation wrote”

- **Section:** §3.3.1 steps 3–6; §5 reservation-vs-failure risk.
- **Why it matters:** The schema stores only a day, not an operation token, so `item.update({ resilienceLastAttemptDay: prior })` cannot prove the current value still belongs to this attempt. With overlapping same-day attempts, one client's failure rollback can erase the other client's valid reservation. There is also an ordering hole: the design reserves before it validates/builds the Resilience skill pool, so a missing skill can burn a week without reaching `toMessage()`. Finally, the statement “if `toMessage()` throws (so no genuine attempt was made)” is false for the actual `RollFFG.toMessage`: `roll.js:351-398` evaluates the dice first and creates the ChatMessage afterward, so message creation can throw after a genuine roll; restoring the prior stamp then grants a free reroll.
- **Concrete suggested fix:** Validate the skill and build all non-mutating prerequisites before reservation. Use the token/lock owned by the authoritative coordinator from New Finding 2 for any abort, and distinguish evaluation failure from post-evaluation message failure. Once the roll has evaluated, keep the attempt stamp even if ChatMessage creation fails and notify the user/GM. If no operation token is introduced, do not automatically roll the day field back based only on equality with `currentDay`.

## 4. Minor — the localization-file evidence is inaccurate

- **Section:** §3.8; §6 localization touch point.
- **Why it matters:** `lang/codex/en.json` does contain the cited `SWFFG.Codex.StrainRecovery.*` keys, but the existing `SWFFG.Settings.codex.*` and `AdvantageHealsStrain` keys are actually in `lang/en.json:531-536`. The dynamic Codex merge means a new setting key could technically work from `lang/codex/en.json`, but the “verified” precedent and declared placement are inaccurate and split one settings namespace across files.
- **Concrete suggested fix:** Put `SWFFG.Settings.codex.VehicleCritWeeklyLimit.{Name,Hint}` beside the other Codex setting keys in `lang/en.json`, keep feature-sheet strings in `lang/codex/en.json`, and add `lang/en.json` to the declared touch points; alternatively document an intentional relocation of the whole settings group.

# Re-verified unchanged fixes

- The stable value-span refresh preserves the `[+]` listener and matches the widget's one-render lifecycle.
- The `.values()` registry iteration is valid on the installed V13 ApplicationV2 runtime, and the proposed import direction is cycle-safe in this repository.
- The folded pre-create hook, stamp-if-null behavior, availability math, declared DataModel storage, roll net-success read-back, and CSS split remain code-consistent.
