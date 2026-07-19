Verdict: NEEDS-REVISION

# Findings

## 1. Major — `vehicleCritWeeklyLimit` would be unreachable

- **Targets:** §3.5 Settings; §5 resolved question (d).
- **Why it matters:** `config: false` settings do not appear in Foundry's normal Settings UI. The custom Codex settings menu is not populated automatically: `modules/settings/ui-settings.js:306-311` has an explicit allow-list containing only `defaultSheetTheme` and `codexAdvantageHealsStrain`. The design mentions only `modules/settings/settings-helpers.js`, so the proposed house-rule toggle would be registered but have no UI through which a GM could enable it.
- **Concrete suggested fix:** Add `"starwarsffg.vehicleCritWeeklyLimit"` to `codexSettings._prepareContext()` in `modules/settings/ui-settings.js`, and add localized Name/Hint keys. Include `modules/settings/ui-settings.js` and the localization file(s) in the declared touch points.

## 2. Major — the non-owner Medicine/Mechanics write path does not exist yet

- **Targets:** §3.3 Medicine and Mechanics handlers; §5 “Non-owner Medicine/Mechanics stamp”.
- **Why it matters:** `modules/helpers/gm-bridge.js:35-44` supports only `damage`, `crit`, and `kill-minion`; `applyToTargetActor` cannot update an existing embedded item. Calling it with a new operation without extending `performApply` is a no-op. More importantly, the current APPLY endpoint at `gm-bridge.js:131-140` does not authorize or narrow actor operations. Extending it with a client-supplied arbitrary item path/value would create a privileged-write escalation. This is a required path, not a build-time optional risk: the brief explicitly requires an ally/non-owner to be able to mark a failed Medicine attempt.
- **Concrete suggested fix:** Specify a dedicated, narrow operation such as `crit-recovery-attempt`, carrying only `actorUuid`, `itemId`, and an enum path (`medicine` or `mechanics`). On the active GM, validate the authenticated `requestorId`, require an appropriate permission to view/use the actor sheet, verify the item is embedded in that actor, verify its type matches the path, whitelist the exact destination field, and derive the stored day from the GM's `campaignDay` rather than trusting a client-supplied value. Keep owner/GM writes local and return/report the forwarded result consistently.

## 3. Major — Resilience is exposed to users who cannot complete its writes

- **Targets:** §3.3 Resilience markup and handler.
- **Why it matters:** `CodexSchemeMixin.activateListeners` calls `_cdxActivate` after the base sheet listeners (`codex-sheets.js:392-397`). The base returns early for non-editable/non-owner sheets at `actor-sheet-ffg.js:508-510`, but `_cdxActivate` still runs. Because the design renders the Resilience button unconditionally when attemptable, an observer/non-owner can trigger the roll; `item.delete()` on success or `item.update()` on failure then fails permission checks. This contradicts the design's own “actor rolling on their own sheet” rationale.
- **Concrete suggested fix:** Add an explicit `canSelfHeal` permission gate (`item.parent?.isOwner`/GM) to the helper or sheet context and also re-check it in the handler. Hide or disable the Resilience action for other viewers. Keep Medicine/Mechanics separately visible to permitted allies through the narrow GM bridge from Finding 2.

## 4. Major — rejecting the item-id tag violates an explicit requirement

- **Targets:** §3.3 Resilience; §4 “Tagged auto-resolve roll + chat-hook read-back”.
- **Why it matters:** The requirements brief explicitly says the Resilience roll is “tagged with the item id.” The design rejects tagging because the handler closure is sufficient for synchronous resolution. That may simplify resolution, but it does not satisfy the acceptance requirement and removes durable audit/correlation metadata from the chat message.
- **Concrete suggested fix:** Keep the inline closure/read-back design, but also pass a narrow message flag to `toMessage`, for example `flags.starwarsffg.critTraumaRecovery = { actorUuid, itemId, path: "resilience" }`. No chat hook is required merely because the tag exists.

## 5. Major — the proposed Destiny DOM rewrite can destroy the `[+]` listener

- **Targets:** §3.4 Global Day readout; §3.6 live-refresh path 2.
- **Why it matters:** The dPool precedent at `settings-helpers.js:213-215` replaces the whole section `innerHTML`; that is safe only because the destiny section's click listener is attached to the section itself. Here the GM listener is proposed on a `[+]` child. Replacing `#ffg-campaign-day` innerHTML removes that child and its listener. Saying “rewrite its text/innerHTML … preserving the child” is not a concrete mechanism and the two operations are incompatible unless the listener is delegated or rebound.
- **Concrete suggested fix:** Give the number a stable child such as `<span class="ffg-campaign-day-value">Day {{campaignDay}}</span>` and update only that child's `textContent`. Leave the `[+]` button node intact. Alternatively delegate the click from a stable ancestor, but the value-span approach is simpler. Null-guard both the day element and value child, unlike the current dPool code.

## 6. Major — roll-then-stamp permits duplicate weekly attempts

- **Targets:** §3.3 Resilience handler ordering.
- **Why it matters:** The described handler awaits `toMessage()` and stamps only after a failed result. During that await the button remains attemptable, so a double click—or simultaneous owner and GM clicks on two clients—can launch multiple Resilience rolls for the same weekly attempt. Render-time availability is not an authority check.
- **Concrete suggested fix:** Re-read the live item and recompute availability in the handler immediately before acting, disable the local control/in-flight key at first click, and define a reservation order. The robust ordering is to persist the current attempt day before rolling, then delete the item on success; define error handling so a failed roll creation does not silently burn the attempt (for example, conditionally clear only the stamp written by that operation). At minimum, specify local de-duplication plus a second live-state check.

## 7. Major — the claimed `preCreateItem` coverage is false for copied stamped crits

- **Targets:** §3.7 received-day stamping; §5 “preCreateItem over-firing”.
- **Why it matters:** The proposed condition stamps only when `system.receivedDay` is null. That works for the two known paths: manual add creates sparse data, and Apply Crit copies a world-table item whose stamp is null. It does not treat an actor-to-actor drag/copy or importer payload carrying a prior non-null `receivedDay` as a new injury, despite §3.7 claiming the hook covers those future creation paths. Conversely, always overwriting the value could corrupt intentionally preserved state when duplicating an actor. The design has not defined “genuine creation” precisely enough for its chosen choke point.
- **Concrete suggested fix:** Define copy semantics. Either stamp explicitly in the two required creation paths (`apply-crit` payload and `.item-add.criticalinjury`) and stop claiming universal hook coverage, or make the pre-create hook overwrite for new injuries while supporting an explicit trusted `preserveCritRecoveryState` operation option for actor duplication/import. Integrate the logic into the existing `registerActorItemValidationHooks()` pre-create hook at `swffg-main.js:76-113`, rather than adding an uncoordinated second hook.

## 8. Question — minion support conflicts with the actual creation rules

- **Targets:** §3.3 character/minion card scope; §3.7 genuine creation.
- **Why it matters:** The shared Codex partial does render for minions, but `swffg-main.js:102-105` rejects embedded `criticalinjury` creation unless the actor is character, nemesis, or rival. Apply Crit also kills a minion instead of embedding a crit (`apply-crit.js:87-96`). Therefore the design's statement that minions inherit working controls is true only for legacy/pre-existing unusual items, not for normal creation.
- **Concrete suggested fix:** Decide explicitly whether minions are in functional scope. If yes, change the validation allow-list and reconcile Apply Crit behavior. If no, state that the shared markup is harmless for legacy minion crits but no supported flow creates them; do not claim normal minion support.

## 9. Minor — the ApplicationV2 registry claim needs exact Map iteration

- **Targets:** §3.6 live-refresh path 1.
- **Why it matters:** The installed V13 runtime does expose `foundry.applications.instances`, and it is a `Map<string, ApplicationV2>` (`App/resources/app/client/applications/_module.mjs:24-27`). Iterating the Map itself yields `[id, app]` pairs, which fail the proposed `instanceof` tests. Rendered applications are registered and removed by the V13 lifecycle, and `.render()` is valid.
- **Concrete suggested fix:** Specify `for (const app of foundry.applications.instances.values())`, then filter `app.rendered && (app instanceof CodexActorSheet || app instanceof CodexAdversarySheet)`. Also state how `settings-helpers.js` obtains those class references (a direct import is cycle-safe with the current imports, or move the refresh helper into `codex-sheets.js`).

## 10. Minor — schema details are slightly inaccurate and should enforce integer days

- **Targets:** §3.1 Data model; §5 campaign-day discipline.
- **Why it matters:** On the installed V13 runtime, `NumberField` defaults to `nullable: true` and `initial: undefined`, not `nullable: false` and `initial: 0` (`common/data/fields.mjs:1087-1113`). The proposed explicit `nullable: true, initial: null` is still correct. Existing crit sources that lack the new keys initialize cleanly to null, so no bulk migration is required and legacy crits remain immediately attemptable. However, the proposed fields do not set `integer: true`, even though all values are campaign-day integers.
- **Concrete suggested fix:** Declare the stamp fields with `{ nullable: true, initial: null, integer: true }`, normalize/floor values before writes, and correct the defaults explanation. State explicitly that existing missing source keys prepare as null and are persisted only when stamped; add a small DataModel conformance/round-trip test if the implementation has tests.

## 11. Minor — localization is a missed touch point

- **Targets:** §3.3 controls; §3.4 dialog; §3.5 setting.
- **Why it matters:** The design introduces button labels, countdown text, a dialog title/prompt, errors, and setting Name/Hint strings but names no localization changes. The Codex strings are loaded from `lang/codex/<lang>.json` by `swffg-main.js`; hard-coded English would regress the system's established UI pattern.
- **Concrete suggested fix:** Add named `SWFFG.Codex.CritTrauma.*` keys (with English fallback and translations as available) and use `localize`/`game.i18n.format` for pluralized countdowns, notifications, dialog text, and setting labels.

# Verified claims

- The availability formula handles null correctly: the selected Resilience origin must be chosen before arithmetic, and an entirely null origin yields `attemptable: true, daysLeft: 0`. `Math.min(7, Math.max(0, stamp + 7 - currentDay))` correctly caps a rewound/future stamp at 7.
- Declared top-level fields on `CriticalInjuryDataModel` and `CriticalDamageDataModel` are the correct `system.*` storage. Missing fields on existing item sources initialize to null without a destructive migration.
- `_cdxApplyStrainRecovery` really receives a created `ChatMessage` from `RollFFG.toMessage()` and reads `message.rolls[0].ffg`. `roll.js:188-203` cancels successes against failures first, so `success >= 1` is the correct net-success test.
- The CSS split is correct: card rules belong in `styles/cdx.css`; global Day-widget rules belong in both `styles/starwarsffg.css` and `styles/mandar.css`. `mandarBeskarAstromech.css` imports `mandar.css`, so no third duplicate is needed. CSS must remain hand-edited; no gulp/npm compile step is appropriate.
- `templates/parts/codex/cdx-injuries.html`, `templates/actors/codex/codex-vehicle.html`, `_cdxActivate`, the DataModel files, helper-registration area, Apply Crit path, and the Destiny Tracker lifecycle named by the design all exist at the stated locations, though several cited line numbers have already drifted by a few lines.
