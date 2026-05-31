import { test, expect } from "@platform/spec-test/vitest";
import {
  adequacy,
  premiumShareOfIncome,
  sumByCategory,
} from "@/lib/insure/compute";
import type { Policy } from "@/lib/insure/types";

const policies: Policy[] = [
  { id: "1", insurer: "A", name: "", category: "life", sumAssured: 300000, annualPremium: 500 },
  { id: "2", insurer: "B", name: "", category: "life", sumAssured: 200000, annualPremium: 300 },
  { id: "3", insurer: "C", name: "", category: "critical-illness", sumAssured: 100000, annualPremium: 400 },
];

test("[INSURE-DATA-003] coverage totals are summed per category", () => {
  const t = sumByCategory(policies);
  expect(t["life"]).toBe(500000);
  expect(t["critical-illness"]).toBe(100000);
  expect(t["personal-accident"]).toBe(0);
});

test("[INSURE-DATA-004] adequacy gap is target minus covered, never negative, with a status", () => {
  const low = adequacy(100000, 300000, 9);
  expect(low.target).toBe(900000);
  expect(low.gap).toBe(600000);
  expect(low.status).toBe("low");

  const met = adequacy(100000, 900000, 9);
  expect(met.gap).toBe(0);
  expect(met.status).toBe("met");

  const partial = adequacy(100000, 500000, 9);
  expect(partial.status).toBe("partial");

  // Over-covered never yields a negative gap.
  const over = adequacy(100000, 1000000, 9);
  expect(over.gap).toBe(0);
});

test("[INSURE-DATA-005] premium share of income is computed and flagged against the guideline", () => {
  const over = premiumShareOfIncome(20000, 100000);
  expect(over.pct).toBeCloseTo(0.2);
  expect(over.overGuideline).toBe(true);

  const ok = premiumShareOfIncome(5000, 100000);
  expect(ok.overGuideline).toBe(false);
});
