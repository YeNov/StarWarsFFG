# Test-case inventory (2026-10-11 test audit)

[`cases.md`](cases.md) lists every active test case, every generated input case and every commented-out case in the project's test layers. It is the base listing for the [test suite audit remediation plan](../../2026-10-11-test-suite-audit-remediation.md): the classification pass annotates each row with its feature rule and disposition, and the final task re-runs the generator to reconcile the listing against the tree.

## Regenerate

```sh
npm ci
node tools/test-inventory.mjs docs/superpowers/plans/artifacts/2026-10-11-test-audit/cases.md
```

Run it from a clean checkout of the commit you want to list; the header records that commit and says so when the working tree had uncommitted changes. Without an output path the listing goes to stdout. `--layers node,functional,playwright,cypress,scripts` limits the run to the layers named.

The generator needs Node 24 (it uses `node:test`'s `run()` with `globPatterns`) and the installed dev dependencies (mocha, chai, Playwright). It starts no server and no Foundry. The Node layer runs the Node test files, so it takes as long as `npm test`.

It exits non-zero, and writes nothing, if any requested layer cannot be enumerated or turns up no cases, so a partial listing cannot be committed by mistake. It also refuses to write a listing that contains a drive-letter path, a home-directory path, an email address or this checkout's location.

## Reading `cases.md`

Each layer has one table with the columns `id | file | suite path | case name | enumeration`.

- **id** is `N` (Node), `F` (Foundry functional), `P` (Playwright) or `C` (Cypress) plus a four-digit number. Ids are positional: they are assigned in file-path order, then in the order the cases appear in the file. They regenerate on every run and move when a case is added or removed, so cite an id together with the commit in the header. A file with no cases appears once, with `-` for its id.
- **suite path** is the chain of enclosing `describe` or suite titles, joined with `›`.
- **case name** is the title as the runner reports it, or as written in the source for a static row. The generator appends `[skipped]`, `[todo]` or `[pending]` when the runner or the source marks the case that way.
- **enumeration** says how the row was found:

| value | meaning |
| --- | --- |
| `runner` | The test runner listed it: `node:test` for the Node layer, `playwright test --list` for Playwright. Generated cases appear individually. |
| `dynamic` | The suite module was imported in Node and its registration function called with mocha's real `Suite` and `Test`. No test body ran. Loop-generated cases appear individually. |
| `static` | Read from the source text. For a Foundry functional suite this is the fallback for a module that cannot be imported outside Foundry (it needs `foundry`, `Hooks`, `game` and similar). A case generated in a loop is one row with its `${...}` placeholder unexpanded, so the file holds more cases than rows. The layer's notes name each such file and the reason. For Cypress there is no listing mode, so every row is static. |
| `commented-out` | Cypress only: a case whose `it(...)` sits inside a comment. It does not run. |

No Foundry stubs are added to make a module import. The Node tier's `tests/node/_stub/foundry-stub.mjs` is deliberately minimal and is not used here.

## Layers

| layer | what is listed | how |
| --- | --- | --- |
| Node | `npm test`: the globs in `package.json`'s `test` script | `node:test` `run()`. The generator checks its row count against the runner's own `tests` tally and fails on a mismatch. |
| Foundry functional | The suites `tests/ffg-tests.js` registers, plus Codex's from `codex/tests/browser/index.js` | Both harness files are parsed for the suites they import and call; each suite module is then imported. Suite files that no harness file registers are listed and noted. |
| Playwright | `e2e/*.spec.js` | `playwright test --list`; it runs without a server, so `globalSetup` is not reached. |
| Cypress | `cypress/e2e/*.cy.js` | Parsed from source with a comment- and string-aware scanner. |

## Not automated tests

The last section of `cases.md` lists scripts under `tools/`, `tests/` and `docs/superpowers/plans/artifacts/` that print output (`console.*` or `process.stdout/stderr.write`) and are not test suites. The plan treats them separately: a script that imports a module and prints what it finds does not check a feature rule. They have no ids and no cases; only their paths are listed. Test suites (`*.test.js`, `*.test.mjs`), the Foundry harness and the `_stub` and `_fixtures` folders are not scripts.

## Inventory

The classification pass records, for every case and for the test-tool files, the feature rule, the action under test, the expected result, the rule source and a disposition (`keep`, `keep+rename`, `rewrite`, `combine`, `remove`, `move-to-foundry`). Six slice files hold the work; each has a file table, an exception table for cases that differ from their file's default, its open rule decisions and its new findings:

- [inventory-node-a-c.md](inventory-node-a-c.md): `tests/node/[a-c]*.test.mjs`
- [inventory-node-d-i.md](inventory-node-d-i.md): `tests/node/[d-i]*.test.mjs`
- [inventory-node-l-r.md](inventory-node-l-r.md): `tests/node/[l-r]*.test.mjs`
- [inventory-node-s-x.md](inventory-node-s-x.md): `tests/node/[s-x]*.test.mjs`
- [inventory-codex-node.md](inventory-codex-node.md): `codex/tests/node/*.test.mjs`
- [inventory-foundry-browser.md](inventory-foundry-browser.md): the Foundry Mocha suites, Playwright, Cypress and the print-only scripts

The slices were written independently, so their local ids collide. The merged results use global ids:

- [open-decisions.md](open-decisions.md): every open rule decision, `R01` onwards, with its category and sources.
- [findings.md](findings.md): the findings the plan does not name, `NF01` onwards, and the cross-slice duplicates.
- [worklist.md](worklist.md): for each task T3-T30 and for the product-fix tasks PF1-PF3, the cases it owns whose disposition is not plain `keep`.

`move-to-foundry` means the behavior claim gets a real-action case in the Foundry or Playwright layer named in the plan's Phase 3 table; the source-text case is deleted only after that replacement passes.
