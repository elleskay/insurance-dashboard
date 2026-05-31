import { test, expect } from "@platform/spec-test/vitest";
import { normalizePolicies, normalizePolicy } from "@/lib/insure/extract-ai";

test("[INSURE-DATA-001] AI extraction output is normalised into valid policy fields", () => {
  const [p] = normalizePolicies([
    {
      insurer: "AIA",
      name: "Secure Term",
      category: "critical-illness",
      sumAssured: "200,000",
      premiumAmount: 100,
      premiumFrequency: "monthly",
    },
  ]);
  expect(p.insurer).toBe("AIA");
  expect(p.category).toBe("critical-illness");
  expect(p.sumAssured).toBe(200000);
  // Monthly premium is annualised.
  expect(p.annualPremium).toBe(1200);

  // A yearly premium is left as-is.
  const yearly = normalizePolicy({
    category: "life",
    sumAssured: 500000,
    premiumAmount: 600,
    premiumFrequency: "yearly",
  });
  expect(yearly.annualPremium).toBe(600);
});

test("[INSURE-DATA-002] normalisation drops unrecognised or invalid values rather than inventing them", () => {
  const p = normalizePolicy({
    insurer: "",
    category: "unknown",
    sumAssured: 0,
    premiumAmount: -50,
    premiumFrequency: "unknown",
  });
  expect(p.category).toBeUndefined();
  expect(p.sumAssured).toBeUndefined();
  expect(p.annualPremium).toBeUndefined();
  expect(p.insurer).toBeUndefined();
});
