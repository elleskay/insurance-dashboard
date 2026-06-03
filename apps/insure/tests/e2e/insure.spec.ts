import { test, expect } from "@platform/spec-test/playwright";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Resolved relative to the Playwright working directory (apps/insure).
const SAMPLE_PDF = "tests/fixtures/sample-policy.pdf";

// The curated checklist keys, inlined so the e2e does not depend on app imports.
const CHECK_ITEMS = [
  "waiting-period",
  "survival-period",
  "pre-existing",
  "exclusions",
  "deductible",
  "co-payment",
  "claim-limits",
  "premium-guarantee",
  "free-look",
] as const;

type Found = {
  detail: string;
  quote: string;
  severity: "info" | "watch" | "caution";
};

// Build a full 8-item checklist: keys in `found` are marked found with their
// detail/quote, the rest are not-stated. Mirrors what summarize() returns.
function checklist(found: Partial<Record<string, Found>>) {
  return CHECK_ITEMS.map((key) => {
    const f = found[key];
    return f
      ? { key, status: "found", detail: f.detail, quote: f.quote, severity: f.severity }
      : { key, status: "not-stated", detail: "", quote: "", severity: "info" };
  });
}

const SAMPLE_QUOTE = "a waiting period of 90 days applies to critical illness";

// Stub the checker route so e2e is deterministic and offline. The real route
// runs a LangGraph grounding loop against an LLM; here we return a fixed checked
// policy with a complete checklist.
async function mockCheck(
  page: Page,
  body: Record<string, unknown> = {
    policies: [
      {
        insurer: "AIA",
        name: "Secure Term Life",
        category: "life",
        summary:
          "This is a term life policy that pays a lump sum if you die or are diagnosed as totally and permanently disabled during the policy term.",
        benefitAmount: 500000,
        premium: 600,
        premiumNote: "",
        checklist: checklist({
          "waiting-period": {
            detail: "Critical illness cover only begins 90 days after the start date.",
            quote: SAMPLE_QUOTE,
            severity: "caution",
          },
          exclusions: {
            detail: "Death by suicide in the first year is not covered.",
            quote: "no benefit is payable for death resulting from suicide within one year",
            severity: "watch",
          },
          deductible: {
            detail: "You pay the first $3,500 of an eligible claim each year.",
            quote: "a deductible of $3,500 applies per policy year",
            severity: "caution",
          },
          "free-look": {
            detail: "You can cancel within 14 days for a refund.",
            quote: "you may cancel this policy within 14 days of receiving it",
            severity: "info",
          },
        }),
        payout: { deductible: 3500, coPayPercent: 5 },
        needsReview: false,
      },
    ],
    needsReview: false,
  },
): Promise<void> {
  await page.route("**/api/check", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    }),
  );
}

// Upload the sample policy and wait for its checked card to appear.
async function uploadSample(page: Page): Promise<void> {
  await mockCheck(page);
  await page.getByTestId("pdf-input").setInputFiles(SAMPLE_PDF);
  await expect(page.getByTestId("policy-check")).toHaveCount(1, { timeout: 20_000 });
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

test("[INSURE-UPLOAD-002] uploading a policy PDF produces a summary and a fine-print checklist with no manual entry", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  // Everything on the card came from the document, with no typing.
  const card = page.getByTestId("policy-check");
  await expect(card).toContainText("AIA");
  await expect(card).toContainText("Secure Term Life");
  await expect(card.getByTestId("check-summary")).not.toBeEmpty();
  await expect(card.getByTestId("checklist-item")).toHaveCount(CHECK_ITEMS.length);
});

test("[INSURE-SUMMARY-001] each checked policy shows a plain-language summary of what it covers", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  await expect(page.getByTestId("check-summary")).toContainText(/pays a lump sum/i);
});

test("[INSURE-FINEPRINT-001] each checked policy shows the curated watch-out checklist with a status per item", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  await expect(page.getByTestId("checklist-item")).toHaveCount(CHECK_ITEMS.length);
  // Both found and not-stated items are present and labelled.
  await expect(
    page.locator('[data-testid="checklist-item"][data-status="found"]').first(),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="checklist-item"][data-status="not-stated"]').first(),
  ).toContainText(/not stated/i);
});

test("[INSURE-FINEPRINT-002] a found watch-out shows the supporting quote from the user's document", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  const quote = page.getByTestId("check-quote").first();
  await quote.locator("summary").click();
  await expect(quote).toContainText(SAMPLE_QUOTE);
});

test("[INSURE-REVIEW-001] a checked policy can be removed", async ({ page }) => {
  await page.goto("/");
  await uploadSample(page);
  await page.getByRole("button", { name: /Remove/ }).click();
  await expect(page.getByTestId("policy-check")).toHaveCount(0);
  await expect(page.getByTestId("empty-state")).toBeVisible();
});

test("[INSURE-EMPTY-001] an empty state guides the user before any policy is checked", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("empty-state")).toBeVisible();
});

test("[INSURE-TRUST-001] a not-advice disclaimer with a reviewed date is present", async ({
  page,
}) => {
  await page.goto("/");
  const disclaimer = page.getByTestId("disclaimer");
  await expect(disclaimer).toContainText(/not financial advice/i);
  await expect(disclaimer).toContainText(/policy wording|policy document/i);
  await expect(page.getByTestId("reviewed")).toContainText("2026-06-03");
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

test("[INSURE-A11Y-001] the checked-policy view has no critical accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(seriousViolationIds(results.violations)).toEqual([]);
});

test("[INSURE-A11Y-002] the supporting-quote disclosure is operable by keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  const quote = page.getByTestId("check-quote").first();
  const summary = quote.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(quote).toContainText(SAMPLE_QUOTE);
});

test("[INSURE-HIGHLIGHT-002] a checked policy highlights its most important catch", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  // The sample's most serious found item is the 90-day waiting period (caution).
  const callout = page.getByTestId("top-catch").first();
  await expect(callout).toBeVisible();
  await expect(callout).toContainText(/most important catch/i);
  await expect(callout).toContainText(/caution/i);
});

test("[INSURE-DEDUCT-003] a policy with a deductible shows a will-it-pay-out explainer", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  const explainer = page.getByTestId("payout-explainer").first();
  await expect(explainer).toBeVisible();
  await expect(explainer).toContainText("$3,500");
  await expect(explainer).toContainText(/policy pays/i);
});

test("[INSURE-DEMO-001] a visitor can load a sample report without uploading a document", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("empty-state")).toBeVisible();
  await page.getByTestId("load-sample").click();
  // A clearly-labelled sample policy appears with its summary and checklist.
  await expect(page.getByTestId("policy-check").first()).toBeVisible();
  await expect(page.getByTestId("sample-badge").first()).toBeVisible();
  await expect(page.getByTestId("check-summary").first()).not.toBeEmpty();
  await expect(
    page.getByTestId("policy-check").first().getByTestId("checklist-item"),
  ).toHaveCount(CHECK_ITEMS.length);
});

test("[INSURE-JOURNEY-001] upload a policy and see its summary plus a grounded fine-print checklist", async ({
  page,
}) => {
  await page.goto("/");
  await uploadSample(page);
  // One unbroken flow: summary, the watch-out checklist, and a traceable quote.
  await expect(page.getByTestId("check-summary")).toContainText(/pays a lump sum/i);
  await expect(
    page.locator('[data-testid="checklist-item"][data-status="found"]').first(),
  ).toBeVisible();
  const quote = page.getByTestId("check-quote").first();
  await quote.locator("summary").click();
  await expect(quote).toContainText(SAMPLE_QUOTE);
});
