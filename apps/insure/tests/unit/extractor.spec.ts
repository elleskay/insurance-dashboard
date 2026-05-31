import { test, expect } from "@platform/spec-test/vitest";
import { extractPolicyFromText } from "@/lib/insure/extractor";

test("[INSURE-DATA-001] extractor pulls category, sum assured and premium from policy text", () => {
  const ci = extractPolicyFromText(
    "Great Eastern GREAT Critical Cover. This Critical Illness plan pays a lump sum. Sum Assured: S$200,000. Annual Premium: S$1,200 per year.",
  );
  expect(ci.insurer).toBe("Great Eastern");
  expect(ci.category).toBe("critical-illness");
  expect(ci.sumAssured).toBe(200000);
  expect(ci.annualPremium).toBe(1200);

  // Monthly premium is annualised; life is detected.
  const life = extractPolicyFromText(
    "AIA Term Life. Death benefit and total and permanent disability. Sum Assured $500,000. Premium $50 per month.",
  );
  expect(life.category).toBe("life");
  expect(life.sumAssured).toBe(500000);
  expect(life.annualPremium).toBe(600);
});

test("[INSURE-DATA-002] extractor does not invent values from unrelated text", () => {
  const e = extractPolicyFromText(
    "The quick brown fox jumps over the lazy dog. Lunch meeting at 3pm, bring 2 reports.",
  );
  expect(e.category).toBeUndefined();
  expect(e.sumAssured).toBeUndefined();
  expect(e.annualPremium).toBeUndefined();
});
