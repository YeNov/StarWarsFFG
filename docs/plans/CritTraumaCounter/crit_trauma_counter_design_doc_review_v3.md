Verdict: READY

# Targeted v3 audit

1. **Resolved — accepted multi-client concurrency descope.** §2 removes atomic cross-client enforcement from the goals, explicitly makes it a non-goal, describes the exact simultaneous same-day race and its consequence (two rolls), and repeats it in §5 as an accepted residual risk. The design no longer claims that the local stamp is an atomic reservation.
2. **Resolved — New Finding 1, bridge authorization.** §3.3.3 now requires `actor.testUserPermission(requestor, "OBSERVER")`, matching the installed V13 permission API and the Codex templates' `{{#unless limited}}` visibility boundary. The active GM also recomputes Medicine/Mechanics availability from its own floored `campaignDay` and the live item stamp before writing, rejecting a non-null stamp until `currentDay >= stamp + 7`. Membership, enum-to-type, house-rule, and field-whitelist checks remain present.
3. **Resolved — New Finding 3, Resilience failure ordering.** §3.3.1 validates the Resilience skill and builds the pool before stamping. It correctly preserves the stamp if ChatMessage creation fails after dice evaluation: actual `RollFFG.toMessage()` evaluates at `modules/dice/roll.js:353` and calls `ChatMessage.create` at line 398. V3 contains no equality-based day rollback, so it cannot erase another same-day stamp or grant a free reroll after evaluated dice.
4. **Resolved — New Finding 4, localization placement.** §3.8 and §6 place `SWFFG.Settings.codex.VehicleCritWeeklyLimit.{Name,Hint}` in `lang/en.json` beside the actual existing Codex-setting keys at lines 531–536, and keep `SWFFG.Codex.CritTrauma.*` feature strings in `lang/codex/en.json` beside `StrainRecovery.*`.

# Previously resolved fixes retained

1. **Resolved — vehicle house-rule setting reachability.** `vehicleCritWeeklyLimit` is still explicitly added to the custom Codex settings allow-list in `modules/settings/ui-settings.js`.
2. **Resolved — Resilience permission gate.** `canSelfHeal` still hides the action from non-owners and the `_cdxActivate` handler independently re-checks owner/GM permission.
3. **Resolved — roll audit tag.** The Resilience `toMessage()` payload still carries the scoped actor UUID, item ID, and path flag.
4. **Resolved — stable Day refresh.** Only `.ffg-campaign-day-value.textContent` is updated, preserving the GM `[+]` node and listener.
5. **Resolved — crit creation stamping.** The stamp remains folded into the existing `preCreateItem` hook with explicit stamp-if-null copy semantics.
6. **Resolved — minion scope.** V3 continues to describe minion crits as legacy-only, matching the actual validation and Apply Crit kill-minion path.
7. **Resolved — ApplicationV2 refresh iteration.** The design still iterates `foundry.applications.instances.values()` and filters the real Codex sheet classes through a cycle-safe helper.
8. **Resolved — schema and migration behavior.** Nullable, null-initial, integer day fields remain declared on the correct item DataModels; legacy missing keys prepare as null without a bulk migration.

# New findings

## Minor — one `{{#unless limited}}` closing-line citation is wrong

- **Section:** §3.3 visibility fact; Review response N1.
- **Why it matters:** The conclusion is correct—the injuries pane at `templates/actors/codex/codex-character.html:131` is inside the limited-user guard opened at line 51—but that guard closes at line 198, not line 135. Line 135 closes the separate `cdxCombinedInventory` conditional. This does not affect the OBSERVER authorization decision.
- **Concrete suggested fix:** Change the cited character-template locations from `51/131/135` to `51/131/198` (and retain the already-correct statement that the minion and vehicle bodies are similarly guarded).

# Final assessment

No new Blocker or Major was introduced. The server-side bridge checks now match the real permission and visibility model; Resilience error ordering matches the actual roll lifecycle without unsafe rollback; localization placement matches the repository; and the non-atomic multi-client race is stated honestly as an accepted product non-goal.
