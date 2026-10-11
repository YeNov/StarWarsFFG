/** Codex II's in-Foundry suites, collected by the system's test harness (tests/ffg-tests.js). */
import { CodexSchemeTests } from "./codex-schemes.test.js";
import { CodexSheetInitialSizeTests } from "./sheet-initial-size.test.js";
import { CodexSheetSkillDataTests } from "./sheet-skill-data.test.js";

export function CodexBrowserTests(suite, suiteInstance, Test, chai) {
  CodexSchemeTests(suite, suiteInstance, Test, chai);
  CodexSheetInitialSizeTests(suite, suiteInstance, Test, chai);
  CodexSheetSkillDataTests(suite, suiteInstance, Test, chai);
}
