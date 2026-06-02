import { z } from "zod";
import { type Category, type Policy } from "./types";
import {
  adequacy,
  CI_MULTIPLE,
  coverageFor,
  DEATH_TPD_MULTIPLE,
  premiumShareOfIncome,
  totalAnnualPremium,
  type AdequacyStatus,
} from "./compute";

/**
 * The advisor turns the dashboard's computed coverage gaps into specific,
 * grounded recommendations. The headline behaviour (see advisor-graph.ts) is a
 * self-correction loop: the model drafts suggestions, we verify every dollar
 * figure against the numbers we actually computed, and the graph revises any
 * suggestion that cites a figure we cannot back. The functions in this file are
 * the deterministic, model-free core of that loop, so they are unit-testable.
 */

/** Categories that carry a benchmark-based adequacy target. */
export type AdviceCategory = Category | "premium" | "general";

export interface GapFact {
  category: Extract<Category, "life" | "critical-illness">;
  label: string;
  covered: number;
  target: number;
  gap: number;
  status: AdequacyStatus;
}

export interface AdviceFacts {
  income: number;
  gaps: GapFact[];
  totalPremium: number;
  premiumSharePct: number;
  premiumOverGuideline: boolean;
}

export interface Recommendation {
  id: string;
  category: AdviceCategory;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  /** A dollar gap the suggestion cites. Verified against the computed facts. */
  citedGap?: number;
}

export interface GroundingIssue {
  index: number;
  reason: string;
}

/** Up to three drafts: the first plus two revisions. */
export const MAX_DRAFTS = 3;
/** Citations within this many dollars of the computed gap are treated as a match. */
export const GAP_TOLERANCE = 1;

/** Compute the ground-truth facts a recommendation must be consistent with. */
export function buildFacts(policies: Policy[], income: number): AdviceFacts {
  const life = adequacy(income, coverageFor(policies, "life"), DEATH_TPD_MULTIPLE);
  const ci = adequacy(income, coverageFor(policies, "critical-illness"), CI_MULTIPLE);
  const totalPremium = totalAnnualPremium(policies);
  const share = premiumShareOfIncome(totalPremium, income);
  return {
    income,
    gaps: [
      {
        category: "life",
        label: "Death and TPD",
        covered: life.covered,
        target: life.target,
        gap: life.gap,
        status: life.status,
      },
      {
        category: "critical-illness",
        label: "Critical illness",
        covered: ci.covered,
        target: ci.target,
        gap: ci.gap,
        status: ci.status,
      },
    ],
    totalPremium,
    premiumSharePct: share.pct,
    premiumOverGuideline: share.overGuideline,
  };
}

/**
 * The anti-hallucination guard. A recommendation that cites a dollar figure is
 * grounded only if that figure matches the gap we actually computed for its
 * category. Suggestions with no cited figure (qualitative advice) always pass.
 */
export function verifyGrounding(
  recs: Recommendation[],
  facts: AdviceFacts,
): GroundingIssue[] {
  const issues: GroundingIssue[] = [];
  recs.forEach((rec, index) => {
    if (rec.citedGap === undefined) return;
    const gap = facts.gaps.find((g) => g.category === rec.category);
    if (!gap) {
      issues.push({
        index,
        reason: `Cites a $${rec.citedGap.toLocaleString("en-US")} figure for "${rec.category}", which has no computed gap to match.`,
      });
      return;
    }
    if (Math.abs(gap.gap - rec.citedGap) > GAP_TOLERANCE) {
      issues.push({
        index,
        reason: `Cited gap $${rec.citedGap.toLocaleString("en-US")} does not match the computed $${gap.gap.toLocaleString("en-US")} ${gap.label} gap.`,
      });
    }
  });
  return issues;
}

/**
 * Conditional-edge router: revise while there are issues and we are under the
 * draft cap, otherwise finalise.
 */
export function routeAfterVerify(
  issues: GroundingIssue[],
  attempts: number,
): "draft" | "finalize" {
  return issues.length > 0 && attempts < MAX_DRAFTS ? "draft" : "finalize";
}

export interface AdviceResult {
  recommendations: Recommendation[];
  needsReview: boolean;
  confidence: number;
}

/**
 * Final step: drop any recommendation we could not verify, report confidence as
 * the share that survived, and flag the result for review if anything was set
 * aside.
 */
export function summarize(
  recs: Recommendation[],
  issues: GroundingIssue[],
): AdviceResult {
  const flagged = new Set(issues.map((i) => i.index));
  const grounded = recs.filter((_, i) => !flagged.has(i));
  const denominator = recs.length || 1;
  return {
    recommendations: grounded,
    needsReview: issues.length > 0,
    confidence: grounded.length / denominator,
  };
}

/** Schema the drafting model fills. Kept flat so revisions are cheap to parse. */
export const adviceDraftSchema = z.object({
  recommendations: z
    .array(
      z.object({
        category: z
          .enum([
            "hospitalisation",
            "life",
            "critical-illness",
            "disability-income",
            "personal-accident",
            "premium",
            "general",
          ])
          .describe("Which protection area this suggestion is about."),
        title: z.string().describe("Short, plain-language headline."),
        detail: z
          .string()
          .describe("One or two sentences of specific, actionable guidance."),
        severity: z
          .enum(["high", "medium", "low"])
          .describe("How urgent closing this gap is."),
        citedGap: z
          .number()
          .describe(
            "The exact dollar gap from the provided facts that this suggestion addresses. Use 0 if the suggestion does not reference a specific gap figure.",
          ),
      }),
    )
    .describe("Two to four grounded suggestions."),
});

export type AdviceDraft = z.infer<typeof adviceDraftSchema>;

export const ADVISOR_SYSTEM =
  "You are a Singapore personal-insurance coverage assistant. You turn a person's computed protection gaps into specific, practical suggestions. " +
  "You must only cite dollar figures that appear in the FACTS provided to you; never invent or estimate a number. " +
  "If a category is already adequately covered, do not suggest buying more of it. " +
  "Benchmarks are the LIA and MoneySense rules of thumb (death and TPD around 9 times annual income, critical illness around 4 times, protection premiums within about 15 percent of income). " +
  "This is general information, not financial advice. Do not use em dashes.";

/** Render the ground-truth facts (and any prior issues to fix) as a prompt. */
export function buildAdvicePrompt(
  facts: AdviceFacts,
  priorIssues: GroundingIssue[],
): string {
  const lines: string[] = [];
  lines.push(`FACTS (all figures in SGD):`);
  lines.push(`- Annual income: ${facts.income}`);
  for (const g of facts.gaps) {
    lines.push(
      `- ${g.label}: covered ${g.covered}, target ${g.target}, gap ${g.gap}, status ${g.status}`,
    );
  }
  lines.push(
    `- Total annual premium: ${facts.totalPremium} (${(facts.premiumSharePct * 100).toFixed(1)}% of income, ${facts.premiumOverGuideline ? "over" : "within"} the ~15% guideline)`,
  );
  if (priorIssues.length > 0) {
    lines.push("");
    lines.push("Your previous draft had these grounding problems. Fix them:");
    for (const issue of priorIssues) lines.push(`- ${issue.reason}`);
  }
  lines.push("");
  lines.push(
    "Write two to four suggestions. For each one that addresses a specific gap, set citedGap to the exact gap figure above. Prioritise the largest gaps.",
  );
  return lines.join("\n");
}
