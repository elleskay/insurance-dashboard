import { CATEGORIES, type Category, type Policy } from "./types";

/** LIA / MoneySense rules of thumb. */
export const DEATH_TPD_MULTIPLE = 9;
export const CI_MULTIPLE = 4;
export const PREMIUM_GUIDELINE = 0.15;

export function sumByCategory(policies: Policy[]): Record<Category, number> {
  const totals = Object.fromEntries(
    CATEGORIES.map((c) => [c, 0]),
  ) as Record<Category, number>;
  for (const p of policies) {
    totals[p.category] += p.sumAssured;
  }
  return totals;
}

export function coverageFor(policies: Policy[], category: Category): number {
  return policies
    .filter((p) => p.category === category)
    .reduce((sum, p) => sum + p.sumAssured, 0);
}

export function totalAnnualPremium(policies: Policy[]): number {
  return policies.reduce((sum, p) => sum + p.annualPremium, 0);
}

export type AdequacyStatus = "met" | "partial" | "low";

export interface Adequacy {
  target: number;
  covered: number;
  gap: number;
  pct: number;
  status: AdequacyStatus;
}

export function adequacy(
  income: number,
  covered: number,
  multiple: number,
): Adequacy {
  const target = Math.max(0, income) * multiple;
  const gap = Math.max(0, target - covered);
  const pct = target > 0 ? covered / target : covered > 0 ? 1 : 0;
  const status: AdequacyStatus = pct >= 1 ? "met" : pct >= 0.5 ? "partial" : "low";
  return { target, covered, gap, pct, status };
}

export interface PremiumShare {
  pct: number;
  overGuideline: boolean;
}

export function premiumShareOfIncome(
  totalPremium: number,
  income: number,
): PremiumShare {
  const pct = income > 0 ? totalPremium / income : 0;
  return { pct, overGuideline: pct > PREMIUM_GUIDELINE };
}
