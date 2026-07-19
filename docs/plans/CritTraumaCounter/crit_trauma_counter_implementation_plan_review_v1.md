Verdict: NEEDS-REVISION

# Findings

## Major — Stages 6 and 11 — The live checklist contradicts the Resilience rest gate

- **Why it matters:** Stage 6 says a fresh PC crit should show both "Roll Resilience" and "Failed", and Stage 11.3 again expects "Roll Resilience" on a fresh crit. That cannot happen under the plan's own correct implementation: Stage 5 stamps a newly created injury's `receivedDay` to the current day, and Stage 2 uses `resilienceLastAttemptDay ?? receivedDay`, so Resilience must show "Self-heal in 7 days" until a full week passes. Stage 11.8 independently expects the same fresh crit to carry the current `receivedDay`. A correct build therefore fails the stated acceptance test, creating pressure to remove the required rest gate.
- **Concrete fix:** Change Stage 6's fresh-crit expectation to "Self-heal in 7 days" plus an immediately available Medicine "Failed" marker. In Stage 11, create a fresh crit, verify that initial state, advance `campaignDay` by 7, and only then test the Resilience roll. Use two injuries (or advance another week) to exercise both the success/delete and failure/stamp branches.

## Major — Stage 7 — The prerequisites-before-stamp recipe still constructs the roll after stamping

- **Why it matters:** Stage 7 correctly builds the `DicePoolFFG` before the item update, but its supplied expression constructs `new game.ffg.RollFFG(pool.renderDiceExpression())` only after `resilienceLastAttemptDay` is written. Formula rendering/parsing and `RollFFG` construction are non-dice prerequisites and can throw before `RollFFG.toMessage()` reaches its evaluation at `modules/dice/roll.js:353`. That would consume the week without a die being evaluated, contrary to the stage's explicit ordering guarantee. The error instruction also describes only a post-evaluation ChatMessage failure, leaving the implementer to infer the actual catch boundary.
- **Concrete fix:** In step 4, after validating the skill and building the pool, also render the expression and construct `const roll = new game.ffg.RollFFG(pool.renderDiceExpression())`. Only then stamp in step 5. In step 6, call `await roll.toMessage(...)` inside an explicit catch that warns and returns while preserving the stamp; never perform equality-based rollback. This leaves all locally constructible prerequisites before the stamp and keeps the accepted no-free-reroll behavior once the reserved roll begins.

## Minor — Stage 7 — The owner-local Mechanics path does not explicitly re-check the house-rule gate

- **Why it matters:** Stage 9 correctly rejects a forwarded Mechanics request when `vehicleCritWeeklyLimit` is Off, but Stage 7 describes the owner-local handler merely as "same as medfail". A stale button can remain clickable during the asynchronous sheet refresh after the setting is disabled, and an owner bypasses the GM bridge entirely. The local path could therefore stamp `mechanicsLastAttemptDay` while the feature is Off.
- **Concrete fix:** Make the `.cdx-inj-mechfail` handler re-read `vehicleCritWeeklyLimit` and abort unless it is true before either local update or forwarding. Also validate that the live item is `criticaldamage`; use the same live null-or-seven-days predicate afterward.

## Minor — Stage 1 — The stated syntax-check command is not runnable in this repository's shell

- **Why it matters:** The environment is Windows PowerShell 5.1, where `&&` is a parser error. Running the exact Stage 1 command fails before either `node --check` executes, so this stage does not currently carry the promised runnable verification command.
- **Concrete fix:** Put the two `node --check` invocations on separate lines, or use PowerShell-safe control flow such as `node --check ...; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node --check ...`.

## Minor — Stages 2 and 11 — The proposed availability test is neither located nor callable as written

- **Why it matters:** `avail()` is nested inside the registered Handlebars helper in `modules/swffg-main.js`, so a headless test cannot import it. `tests/ffg-tests.js` is the Mocha harness, not a test-suite file; its real pattern is to import a suite such as `tests/codex-schemes.test.js` and register that suite in `getData()`. "Add to `ffg-tests.js` a pure test" is therefore not an executable test plan, and the rewind clamp is central enough that syntax plus grep does not verify it.
- **Concrete fix:** Extract/export the availability calculation from a small dependency-free helper module, add a real `tests/crit-trauma-counter.test.js` suite, import/register it in `tests/ffg-tests.js`, and give the exact Foundry-console command used elsewhere in this repo: `const m = await import('/systems/starwarsffg/tests/ffg-tests.js'); const r = await new m.default().getData(); console.log(r.fail);`. Alternatively, make the Stage 2 verification an explicit live-console invocation of the registered helper with stated expected objects.

## Minor — Stage 3 — The JSON check does not detect duplicate keys as claimed

- **Why it matters:** `node -e "require(...)"` is runnable here and detects malformed JSON/trailing commas, but Node's JSON parser accepts duplicate object keys and keeps the last value. The command cannot establish the duplicate-key property claimed by the plan.
- **Concrete fix:** Keep the parse command, remove the duplicate-key claim, and add a duplicate-key-aware JSON lint/parser if that check is required. At minimum, add exact-key-count assertions for every new localization key.

## Minor — Stage 5 — The actor-to-actor crit-drag verification is not a supported UI path

- **Why it matters:** The Codex crit element is `.cdx-injury`, while the cross-actor DragDrop selector is `.cdx-card` (`modules/actors/actor-sheet-ffg.js:1375-1379`). Even when a stock `.items-list .item` starts the transfer handler, `_onTransferItemDragStart()` permits only `weapon`, `armour`, and `gear` (`:2161-2174`). The proposed "crit dragged from an existing actor" check therefore is not a reliable runnable way to test stamp-if-non-null copy semantics.
- **Concrete fix:** Verify this case through a supported document operation in the Foundry console, such as creating an embedded `criticalinjury` on a second actor from `sourceCrit.toObject()` with a known non-null `receivedDay`, then assert the copied item retains that value. Keep Apply Crit and manual `+` as the two UI creation tests.

## Minor — Stage 9 — The authorization/availability verification needs an exact forged-request procedure

- **Why it matters:** Syntax and grep only prove that security-looking words exist. The live bullet asks for a LIMITED request and an already-cooling forged emit but supplies neither a payload nor a way to observe the GM-side rejection. Those are the stage's essential behavioral guarantees, and they require at least two client roles because `requestorId` is supplied by Foundry's socket transport.
- **Concrete fix:** Add an exact two-client checklist: actor UUID/item ID setup, OBSERVER and LIMITED permission setup, the player-console `game.socket.emit('system.starwarsffg', {event:'ffgCritRecovery', actorUuid, itemId, path:'medicine'})` command, the expected item field before/after, and the GM log expectation. Repeat while the live stamp is cooling and confirm it is unchanged.

## Minor — Stage 10 — Byte-identical readout CSS is the wrong verification invariant

- **Why it matters:** The actual Destiny Tracker chrome differs materially between `styles/starwarsffg.css` and `styles/mandar.css` (for example, `.swffg-destiny` and `.destiny-points` use different sizing, margins, and layout). Requiring byte-identical new blocks conflicts with the same stage's requirement to be theme-consistent and can encourage styling that fits only one theme. The important repository constraint is that both independently loaded stylesheets contain working readout rules; `mandarBeskarAstromech.css` then inherits the mandar copy.
- **Concrete fix:** Require the same selector coverage in both files, not identical declarations. Verify visibility, layout, pointer behavior, and `[+]` affordance under the default, mandar, and mandarBeskarAstromech themes.

# Verified implementation grounding

The cited source files and principal anchors are otherwise real and current: both crit DataModels, the shared/vehicle card blocks, `_cdxActivate()` and `_cdxApplyStrainRecovery()`, the settings and Codex allow-list, the Destiny Tracker ApplicationV2 methods, the existing folded `preCreateItem` hook, the GM bridge listener, and the CSS loading split. The numbered dependency order is parse/load-safe: settings exist before the new templates invoke the helper; the stable value span predates behavioral acceptance; the client bridge export is added with its import; and the GM branch has the required OBSERVER, membership, type/enum, house-rule, GM-derived-day, and live availability checks. The plan also correctly preserves the accepted non-atomic cross-client race as a documented non-goal and does not introduce a build/compile step.
