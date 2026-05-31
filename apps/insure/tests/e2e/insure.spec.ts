import { test, expect } from "@platform/spec-test/playwright";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function addPolicy(
  page: Page,
  opts: { insurer: string; category: string; sum: number; premium: number },
): Promise<void> {
  await page.getByLabel("Insurer").fill(opts.insurer);
  await page.getByLabel("Category").selectOption(opts.category);
  await page.getByLabel("Sum assured (SGD)").fill(String(opts.sum));
  await page.getByLabel("Annual premium (SGD)").fill(String(opts.premium));
  await page.getByRole("button", { name: "Add policy" }).click();
}

function seriousViolationIds(
  violations: { id: string; impact?: string | null }[],
): string[] {
  return violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => v.id);
}

test("[INSURE-UPLOAD-001] the page offers PDF upload with an in-browser privacy assurance", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByTestId("pdf-input");
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("accept", /pdf/);
  await expect(page.getByTestId("privacy-note")).toContainText(
    /browser|never uploaded/i,
  );
});

test("[INSURE-REVIEW-001] adding a policy puts it in the list and updates the dashboard", async ({
  page,
}) => {
  await page.goto("/");
  await addPolicy(page, { insurer: "AIA", category: "life", sum: 300000, premium: 500 });
  await expect(page.getByTestId("policy-row")).toHaveCount(1);
  await expect(page.getByTestId("category-card").first()).toBeVisible();
});

test("[INSURE-REVIEW-002] a policy can be removed", async ({ page }) => {
  await page.goto("/");
  await addPolicy(page, { insurer: "AIA", category: "life", sum: 300000, premium: 500 });
  await expect(page.getByTestId("policy-row")).toHaveCount(1);
  await page.getByRole("button", { name: /Remove/ }).click();
  await expect(page.getByTestId("policy-row")).toHaveCount(0);
  await expect(page.getByTestId("empty-state")).toBeVisible();
});

test("[INSURE-DASH-001] coverage by category is shown with totals", async ({
  page,
}) => {
  await page.goto("/");
  await addPolicy(page, { insurer: "AIA", category: "life", sum: 300000, premium: 500 });
  await expect(page.getByTestId("category-card")).toHaveCount(5);
  await expect(
    page.getByTestId("category-card").filter({ hasText: "Life (death and TPD)" }),
  ).toContainText("$300,000");
});

test("[INSURE-DASH-002] adequacy shows death/TPD vs 9x and CI vs 4x of income", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Your annual income (SGD)").fill("100000");
  await addPolicy(page, { insurer: "AIA", category: "life", sum: 300000, premium: 500 });
  await addPolicy(page, {
    insurer: "Great Eastern",
    category: "critical-illness",
    sum: 100000,
    premium: 400,
  });
  const life = page.getByTestId("adequacy-life");
  await expect(life).toContainText("$900,000");
  await expect(life).toContainText("$300,000");
  await expect(life).toContainText("$600,000");
  const ci = page.getByTestId("adequacy-ci");
  await expect(ci).toContainText("$400,000");
  await expect(ci).toContainText("$100,000");
});

test("[INSURE-DASH-003] total premium and its share of income are shown against the guideline", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Your annual income (SGD)").fill("100000");
  await addPolicy(page, { insurer: "AIA", category: "life", sum: 300000, premium: 1000 });
  const panel = page.getByTestId("premium-panel");
  await expect(panel).toContainText("$1,000");
  await expect(panel).toContainText("1.0%");
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
  await expect(page.getByTestId("pdf-input")).toBeVisible();
});

test("[INSURE-SEC-002] policy data is never sent to a server", async ({ page }) => {
  await page.goto("/");
  const dataCalls: string[] = [];
  page.on("request", (req) => {
    const t = req.resourceType();
    if (t === "fetch" || t === "xhr") dataCalls.push(req.url());
  });
  await page.getByLabel("Your annual income (SGD)").fill("100000");
  await addPolicy(page, { insurer: "AIA", category: "life", sum: 300000, premium: 1000 });
  await expect(page.getByTestId("policy-row")).toHaveCount(1);
  expect(dataCalls).toEqual([]);
});

test("[INSURE-A11Y-001] the dashboard has no critical accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Your annual income (SGD)").fill("100000");
  await addPolicy(page, { insurer: "AIA", category: "life", sum: 300000, premium: 1000 });
  const results = await new AxeBuilder({ page }).analyze();
  expect(seriousViolationIds(results.violations)).toEqual([]);
});

test("[INSURE-A11Y-002] adding a policy is operable by keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Insurer").focus();
  await page.keyboard.type("AIA");
  // Category defaults to life; fill the amount via keyboard.
  await page.getByLabel("Sum assured (SGD)").focus();
  await page.keyboard.type("250000");
  await page.getByRole("button", { name: "Add policy" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("policy-row")).toHaveCount(1);
});

test("[INSURE-JOURNEY-001] enter income, add policies, and see coverage and an adequacy gap", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Your annual income (SGD)").fill("100000");
  await addPolicy(page, { insurer: "AIA", category: "life", sum: 300000, premium: 1000 });
  await addPolicy(page, {
    insurer: "Great Eastern",
    category: "critical-illness",
    sum: 100000,
    premium: 500,
  });
  await expect(
    page.getByTestId("category-card").filter({ hasText: "Life (death and TPD)" }),
  ).toContainText("$300,000");
  await expect(page.getByTestId("premium-panel")).toContainText("$1,500");
  await expect(page.getByTestId("adequacy-life")).toContainText("$600,000");
});
