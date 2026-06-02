import { test, expect } from "@platform/spec-test/vitest";
import {
  buildFacts,
  routeAfterVerify,
  summarize,
  verifyGrounding,
  type Recommendation,
} from "@/lib/insure/advisor";
import type { Policy } from "@/lib/insure/types";

const policies: Policy[] = [
  { id: "1", insurer: "AIA", name: "Term", category: "life", sumAssured: 500000, annualPremium: 600 },
  { id: "2", insurer: "GE", name: "CI", category: "critical-illness", sumAssured: 100000, annualPremium: 400 },
];

test("[INSURE-ADVISOR-001] every recommendation is grounded in the computed coverage gaps", () => {
  // income 100k: life target 9x = 900k, covered 500k, gap 400k.
  //              CI target 4x = 400k, covered 100k, gap 300k.
  const facts = buildFacts(policies, 100000);
  expect(facts.gaps.find((g) => g.category === "life")?.gap).toBe(400000);
  expect(facts.gaps.find((g) => g.category === "critical-illness")?.gap).toBe(300000);

  const recs: Recommendation[] = [
    { id: "a", category: "life", title: "", detail: "", severity: "high", citedGap: 400000 }, // correct
    { id: "b", category: "life", title: "", detail: "", severity: "high", citedGap: 999999 }, // wrong figure
    { id: "c", category: "general", title: "", detail: "", severity: "low" }, // no figure, allowed
    { id: "d", category: "premium", title: "", detail: "", severity: "low", citedGap: 5000 }, // no gap to match
  ];

  const issues = verifyGrounding(recs, facts);
  const flagged = issues.map((i) => i.index).sort();
  // Only the wrong-figure (index 1) and the unmatchable premium (index 3) are flagged.
  expect(flagged).toEqual([1, 3]);
});

test("[INSURE-ADVISOR-002] the advisor revises ungrounded drafts then flags anything it cannot verify", () => {
  const issue = [{ index: 0, reason: "wrong" }];

  // Revise while there are issues and attempts remain under the cap.
  expect(routeAfterVerify(issue, 1)).toBe("draft");
  // Stop revising once the draft cap (3) is reached, even with issues left.
  expect(routeAfterVerify(issue, 3)).toBe("finalize");
  // Finalise immediately when everything is grounded.
  expect(routeAfterVerify([], 1)).toBe("finalize");

  const recs: Recommendation[] = [
    { id: "a", category: "life", title: "ok", detail: "", severity: "high", citedGap: 400000 },
    { id: "b", category: "life", title: "bad", detail: "", severity: "high", citedGap: 1 },
  ];
  const summary = summarize(recs, [{ index: 1, reason: "wrong" }]);
  // The unverifiable suggestion is dropped, the result is flagged for review,
  // and confidence reflects the share that survived.
  expect(summary.recommendations.map((r) => r.id)).toEqual(["a"]);
  expect(summary.needsReview).toBe(true);
  expect(summary.confidence).toBeCloseTo(0.5);
});
