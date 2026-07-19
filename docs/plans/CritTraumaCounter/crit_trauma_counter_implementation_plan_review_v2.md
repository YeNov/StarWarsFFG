Verdict: NEEDS-REVISION

# Audit scope

The v1 review actually contained **2 Major and 7 Minor** findings, although the re-review request says 2 + 6. All nine findings are audited below so none is silently omitted.

# Prior findings

1. **Resolved — Major — Stages 6/11: fresh-crit checklist contradicted the Resilience rest gate.** Stage 6 now correctly expects a freshly stamped injury to show “Self-heal in 7 days” plus an immediately available Medicine marker. Stage 11.2 verifies that state, and Stage 11.3 advances seven days before expecting “Roll Resilience.” This agrees with `receivedDay = currentDay` and the `resilienceLastAttemptDay ?? receivedDay` precedence.

2. **Resolved — Major — Stage 7: the roll was constructed after the stamp.** Step 4 now validates the skill, builds the pool, renders its expression, and constructs `RollFFG` before `item.update`. Step 6 puts `roll.toMessage(...)` in an explicit `try/catch`, warns and returns without rolling the stamp back, and reads `message.rolls[0].ffg.success` only on success. This matches the real lifecycle in `modules/dice/roll.js`: evaluation begins at line 353 and ChatMessage creation occurs at line 398.

3. **Resolved — Minor — Stage 7: owner-local Mechanics omitted the house-rule gate.** The revised handler explicitly re-reads `vehicleCritWeeklyLimit`, verifies the live item is `criticaldamage`, and re-checks cooldown availability before either a local write or forwarding. Stage 11.8 covers the stale/off local path.

4. **Resolved — Minor — Stage 1: `&&` was not runnable in PowerShell 5.1.** The plan now uses separate commands with `$LASTEXITCODE` control flow. That syntax is valid for this repository's PowerShell 5.1 environment.

5. **Resolved — Minor — Stages 2/11: availability tests were not importable or registered correctly.** The proposed `modules/helpers/crit-availability.js` is dependency-free and exports named functions. The proposed `tests/crit-trauma-counter.test.js` named export plus an import near `tests/ffg-tests.js:4-13` and a call near lines 41-50 matches the real `CodexSchemeTests` pattern (`tests/codex-schemes.test.js:8-9`, imported at `ffg-tests.js:8`, invoked at line 45). The supplied F12 command is valid for the real default-exported harness and its public `getData()` method: `const m = await import('/systems/starwarsffg/tests/ffg-tests.js'); const r = await new m.default().getData(); console.log(r.fail);`.

6. **Resolved — Minor — Stage 3: JSON parsing was incorrectly claimed to detect duplicate keys.** The claim is removed. The parse checks remain, and the plan adds one-count checks for every new key.

7. **Resolved — Minor — Stage 5: actor-to-actor crit drag was not a supported test path.** The replacement uses `toObject()` plus `createEmbeddedDocuments()` to exercise non-null copy semantics. The cited reason is accurate: the real transfer DragDrop selector is `.items-list .item, .cdx-card` at `modules/actors/actor-sheet-ffg.js:1375-1379`, and `_onTransferItemDragStart()` allows only weapon/armour/gear at lines 2161-2174.

8. **Resolved — Minor — Stage 9: the forged-request verification was underspecified.** V2 supplies a concrete two-client payload and separates the OBSERVER success, LIMITED authorization rejection, and OBSERVER cooling-stamp rejection cases. Checking both the GM warning and unchanged stamp makes the LIMITED case distinguishable from an availability rejection.

9. **Resolved — Minor — Stage 10: byte-identical CSS was the wrong invariant.** V2 requires selector coverage in both global stylesheets while allowing declarations to fit the materially different default and mandar Destiny Tracker chrome. It also checks mandarBeskarAstromech, which really imports `mandar.css`.

# Structural checks introduced by v2

- **Handlebars/import graph:** `swffg-main.js -> helpers/crit-availability.js` is load-safe because the new module has no imports or Foundry globals. The helper is still registered inside the existing `init` block immediately after `renderMultiple`; `SettingsHelpers.initLevelSettings()` runs earlier in that same hook at current line 354, while the wrapper does not read settings until template invocation. Adding `codex-sheets.js -> gm-bridge.js` and `codex-sheets.js -> crit-availability.js` in Stage 7 also creates no new cycle: the real GM bridge imports only `minions.js`, and `minions.js` has no imports.
- **Test graph:** the new test module imports only the dependency-free availability module. Importing and invoking its named suite from `tests/ffg-tests.js` follows the real suite contract and does not affect normal system startup because the harness is loaded only by the explicit F12 import.

# New findings

## Major — Stages 2 and 9 — The GM bridge does not import or use the extracted availability module

- **Why it matters:** V2's extracted module is used by the Handlebars wrapper and Stage 7 handlers, but the Stage 9 GM branch still contains a third handwritten predicate: `stamp === null || day >= Math.floor(Number(stamp)) + 7`. There is no `crit-availability.js` import in Stage 9, no proposed GM-bridge import anywhere in the document, and the Review response does not mention it. This fails the stated structural goal that the helper, handler, and authoritative GM-side re-check share one implementation. It also leaves the security boundary free to drift from the tested rewind/null/boundary behavior.
- **Concrete fix:** Add `import { availFor } from "./crit-availability.js";` to `modules/helpers/gm-bridge.js` and replace the handwritten condition with `if (!availFor(stamp, day).attemptable) return;`. Add the bridge import/use to Stage 2/9 file lists and verifications. This fix is cycle-safe: `crit-availability.js` has no imports, `gm-bridge.js` currently imports only `minions.js`, and neither module imports `swffg-main.js` or `codex-sheets.js`.

## Minor — Stage 2-tests — The suite-title/run assertion is not fully specified

- **Why it matters:** Verification filters failures by parent title `Crit-Trauma Counter`, but the test-file instructions never require `suiteInstance.create(suite, "Crit-Trauma Counter")`. Checking only that no matching failure exists also passes if the suite was accidentally not registered or was named differently.
- **Concrete fix:** Include the exact suite declaration and require at least one matching pass (or the exact number of specified cases) as well as zero matching failures. Keep the import and registration call explicitly shown in `tests/ffg-tests.js`.

# Final assessment

The fresh-crit states, Stage 7 reservation ordering, Mechanics local gate, verification commands, supported copy test, bridge authorization procedure, CSS invariant, and test-harness architecture are corrected. The new pure module and test suite are individually load-safe. The plan still needs one structural correction before implementation: route the authoritative GM-side availability check through the same tested `availFor()` function rather than retaining duplicate security-critical math.
