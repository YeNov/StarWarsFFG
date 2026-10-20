/** Codex II's in-Foundry suites, collected by the system's test harness (tests/ffg-tests.js). */
import { CodexSchemeTests } from "./codex-schemes.test.js";
import { CodexSheetInitialSizeTests } from "./sheet-initial-size.test.js";
import { CodexSheetSkillDataTests } from "./sheet-skill-data.test.js";

export function CodexBrowserTests(suite, suiteInstance, Test, chai, harness) {
  CodexSchemeTests(suite, suiteInstance, Test, chai, harness);
  CodexSheetInitialSizeTests(suite, suiteInstance, Test, chai, harness);
  CodexSheetSkillDataTests(suite, suiteInstance, Test, chai, harness);
}
