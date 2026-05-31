import { test, expect } from "@platform/spec-test/playwright";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Resolved relative to the Playwright working directory (apps/insure).
const SAMPLE_PDF = "tests/fixtures/sample-policy.pdf";

// Stub the AI extraction route so e2e is deterministic and offline. The real
// route calls an LLM; here we return the figures the sample policy implies.
async function mockExtract(
  page: Page,
  policies: Array<Record<string, unknown>> = [
    { insurer: "AIA", name: "Secure Term Life", category: "life", sumAssured: 500000, annualPremium: 600 },
  ],
): Promise<void> {
  await page.route("**/api/extract", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ policies }),
    }),
  );
}

// Upload the sample life policy and wait for it to be added to the dashboard.
async function uploadSample(page: Page): Promise<void> {
  await mockExtract(page);
  await page.getByTestId("pdf-input").setInputFiles(SAMPLE_PDF);
  await expect(page.getByTestId("policy-row")).toHaveCount(1, { timeout: 20_000 });
}

// Add a policy by hand via the fallback, then fill its inline row fields.
async function addManualPolicy(
  page: Page,
  opts: { insurer?: string; category: string; sum: number; premium: number },
): Promise<void> {
  const before = await page.getByTestId("policy-row").count();
  await page.getByTestId("add-manual").click();
  await expect(page.getByTestId("policy-row")).toHaveCount(before + 1);
  const row = page.getByTestId("policy-row").last();
  if (opts.insurer) await row.getByLabel("Insurer").fill(opts.insurer);
  await row.getByLabel("Category").selectOption(opts.category);
  await row.getByLabel("Sum assured (SGD)").fill(String(opts.sum));
  await row.getByLabel("Annual premium (SGD)").fill(String(opts.premium));
}

function seriousViolationIds(
  violations: { id: string; impact?: string | null }[],
): string[] {
  return violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => v.id);
}

test("[INSURE-UPLOAD-001] the page offers PDF upload with a note on how documents are handled", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByTestId("pdf-input");
  await expect(input).toHaveAttribute("accept", /pdf/);
  await expect(input).toHaveAttribute("multiple", "");
  await expect(page.getByTestId("privacy-note")).not.toBeEmpty();
});

test("[INSURE-UPLOAD-002] uploading a policy PDF builds the summary with no manual data entry", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  // The policy and its figures came purely from the document.
  await expect(
    page.getByTestId("category-card").filter({ hasText: "Life (death and TPD)" }),
  ).toContainText("$500,000");
  await expect(page.getByTestId("premium-panel")).toContainText("$600");
  await expect(page.getByTestId("policy-row").getByLabel("Insurer")).toHaveValue("AIA");
});

test("[INSURE-REVIEW-001] an extracted policy can be corrected inline without re-entering it", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  const row = page.getByTestId("policy-row").first();
  await row.getByLabel("Sum assured (SGD)").fill("600000");
  await expect(
    page.getByTestId("category-card").filter({ hasText: "Life (death and TPD)" }),
  ).toContainText("$600,000");
  // The rest of the policy is preserved.
  await expect(row.getByLabel("Insurer")).toHaveValue("AIA");
});

test("[INSURE-REVIEW-002] a policy can be removed", async ({ page }) => {
  await page.goto("/");
  await uploadSample(page);
  await page.getByRole("button", { name: /Remove/ }).click();
  await expect(page.getByTestId("policy-row")).toHaveCount(0);
  await expect(page.getByTestId("empty-state")).toBeVisible();
});

test("[INSURE-DASH-001] coverage by category is shown with totals", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  await expect(page.getByTestId("category-card")).toHaveCount(5);
  await expect(
    page.getByTestId("category-card").filter({ hasText: "Life (death and TPD)" }),
  ).toContainText("$500,000");
});

test("[INSURE-DASH-002] adequacy shows death/TPD vs 9x and CI vs 4x of income", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  await addManualPolicy(page, {
    insurer: "Great Eastern",
    category: "critical-illness",
    sum: 100000,
    premium: 400,
  });
  await page.getByLabel("Your annual income (SGD)").fill("100000");
  const life = page.getByTestId("adequacy-life");
  await expect(life).toContainText("$900,000");
  await expect(life).toContainText("$500,000");
  await expect(life).toContainText("$400,000");
  const ci = page.getByTestId("adequacy-ci");
  await expect(ci).toContainText("$400,000");
  await expect(ci).toContainText("$100,000");
});

test("[INSURE-DASH-003] total premium and its share of income are shown against the guideline", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  await page.getByLabel("Your annual income (SGD)").fill("100000");
  const panel = page.getByTestId("premium-panel");
  await expect(panel).toContainText("$600");
  await expect(panel).toContainText("0.6%");
  await expect(panel).toContainText(/15%/);
});

test("[INSURE-DASH-004] an empty state guides the user before any policy exists", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("empty-state")).toBeVisible();
});

test("[INSURE-TRUST-001] a not-advice disclaimer with cited benchmarks and a date is present", async ({
  page,
}) => {
  await page.goto("/");
  const disclaimer = page.getByTestId("disclaimer");
  await expect(disclaimer).toContainText(/not financial advice/i);
  await expect(disclaimer).toContainText(/LIA|MoneySense/);
  await expect(page.getByTestId("reviewed")).toContainText("2026-05-31");
});

test("[INSURE-SEC-001] the app is usable without authentication", async ({
  page,
}) => {
  const res = await page.goto("/");
  expect(res?.status()).toBeLessThan(400);
  expect(page.url()).not.toContain("/login");
  await expect(page.getByTestId("pdf-input")).toBeAttached();
});

test("[INSURE-SEC-002] the app discloses that document text is sent to an AI service", async ({
  page,
}) => {
  await page.goto("/");
  const note = page.getByTestId("privacy-note");
  await expect(note).toContainText(/AI/);
  await expect(note).toContainText(/sent/i);
  // It must not falsely claim the document never leaves the browser.
  await expect(note).not.toContainText(/never (uploaded|leaves)/i);
});

test("[INSURE-A11Y-001] the dashboard has no critical accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  await page.getByLabel("Your annual income (SGD)").fill("100000");
  const results = await new AxeBuilder({ page }).analyze();
  expect(seriousViolationIds(results.violations)).toEqual([]);
});

test("[INSURE-A11Y-002] adding and editing a policy by hand is operable by keyboard", async ({
  page,
}) => {
  await page.goto("/");
  // Open the manual fallback and add a row with the keyboard only.
  await page.getByTestId("add-manual").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("policy-row")).toHaveCount(1);
  const row = page.getByTestId("policy-row").first();
  await row.getByLabel("Insurer").focus();
  await page.keyboard.type("Manual Co");
  await row.getByLabel("Sum assured (SGD)").focus();
  await page.keyboard.type("250000");
  await expect(row.getByLabel("Insurer")).toHaveValue("Manual Co");
  await expect(
    page.getByTestId("category-card").filter({ hasText: "Life (death and TPD)" }),
  ).toContainText("$250,000");
});

test("[INSURE-JOURNEY-001] upload a policy, add income, and see coverage and an adequacy gap", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  await addManualPolicy(page, {
    insurer: "Great Eastern",
    category: "critical-illness",
    sum: 100000,
    premium: 500,
  });
  await page.getByLabel("Your annual income (SGD)").fill("100000");
  await expect(
    page.getByTestId("category-card").filter({ hasText: "Life (death and TPD)" }),
  ).toContainText("$500,000");
  await expect(page.getByTestId("premium-panel")).toContainText("$1,100");
  await expect(page.getByTestId("adequacy-life")).toContainText("$400,000");
});
