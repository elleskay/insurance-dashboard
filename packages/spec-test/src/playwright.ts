import {
  test as base,
  expect,
  type PlaywrightTestArgs,
  type PlaywrightTestOptions,
  type PlaywrightWorkerArgs,
  type PlaywrightWorkerOptions,
  type TestInfo,
} from "@playwright/test";
import { recordCoverage } from "./coverage.js";

type SpecTestFixtures = PlaywrightTestArgs &
  PlaywrightTestOptions & { specCoverage: void } & PlaywrightWorkerArgs &
  PlaywrightWorkerOptions;

const SPEC_ID_RE = /^\[([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)+-\d{3,})\]/;

// Spec category per id, populated by specTest() at collection time and read by
// the auto fixture at run time so the coverage report can detect a test
// covering a requirement in the wrong layer (category mismatch).
const categoryById = new Map<string, string>();

/**
 * Extended Playwright `test` that auto-records spec coverage.
 *
 * Title convention: "[ARM-XXX-001] human description". The leading
 * [ID] is parsed; if present, the test's outcome is appended to
 * .spec-coverage/results.jsonl in a post-test hook.
 *
 * Tests without a [ID] prefix run normally and are not recorded.
 */
export const test = base.extend<{ specCoverage: void }>({
  specCoverage: [
    async ({}, use, testInfo) => {
      await use();
      const m = SPEC_ID_RE.exec(testInfo.title);
      if (!m) return;
      const id = m[1] as string;
      const status: "passed" | "failed" = testInfo.status === "passed" ? "passed" : "failed";
      recordCoverage({
        id,
        status,
        category: categoryById.get(id),
        file: testInfo.file,
        durationMs: testInfo.duration,
      });
    },
    { auto: true },
  ],
});

export { expect };

export interface SpecTestOptions {
  /** Requirement category, used for coverage category-mismatch detection. */
  category?: string;
}

/**
 * Register a Playwright test bound to a spec requirement id. The id is prefixed
 * to the test title as "[ID] " so the auto fixture records it. Use for
 * `ui`, `functional`, `security`, and `a11y` requirements.
 */
export function specTest(
  id: string,
  title: string,
  fn: (args: SpecTestFixtures, testInfo: TestInfo) => void | Promise<void>,
  opts: SpecTestOptions = {},
): void {
  if (opts.category) categoryById.set(id, opts.category);
  test(`[${id}] ${title}`, fn);
}
