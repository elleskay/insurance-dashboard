import { test, expect } from "@platform/spec-test/vitest";
import { CHECK_ITEMS, type CheckItem } from "@/lib/insure/types";
import {
  EXAMPLE_BILL,
  MAX_DRAFTS,
  buildPayout,
  computePayout,
  routeAfterVerify,
  summarize,
  topCatch,
  verifyGrounding,
  type DraftPolicy,
} from "@/lib/insure/checker";

// A short, realistic policy document. The grounding check requires a finding's
// quote to be a verbatim run of text from here.
const SOURCE = `
AIA Secure Term. This term life plan pays a lump sum on death or total and
permanent disability during the policy term. A waiting period of 90 days
applies to critical illness benefits. No benefit is payable for death
resulting from suicide within one year. You may cancel this policy within 14
days of receiving it for a refund of premiums paid.
`;

function draftPolicy(findings: DraftPolicy["findings"]): DraftPolicy {
  return {
    insurer: "AIA",
    name: "Secure Term",
    category: "life",
    summary: "A term life policy paying a lump sum on death or TPD.",
    benefitAmount: 500000,
    premium: 600,
    premiumNote: "",
    findings,
    payout: { deductible: 0, coPaymentPercent: 0, coPaymentCap: 0 },
  };
}

test("[INSURE-CHECK-001] A finding is grounded only if its quote appears in the document", () => {
    // One finding quotes real wording from the document; the other invents an
    // exclusion that does not appear anywhere in the source.
    const policy = draftPolicy([
      {
        key: "waiting-period",
        detail: "Critical illness cover begins after 90 days.",
        quote: "a waiting period of 90 days applies to critical illness",
        severity: "caution",
      },
      {
        key: "exclusions",
        detail: "Sports injuries are excluded.",
        quote: "injuries from any sporting activity are not covered",
        severity: "watch",
      },
    ]);

    const issues = verifyGrounding([policy], SOURCE);

    // Exactly the invented finding is flagged; the grounded one passes.
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ policyIndex: 0, key: "exclusions" });
});

test("[INSURE-CHECK-002] Ungrounded drafts are revised then demoted to not stated and flagged for review", () => {
    const policy = draftPolicy([
      {
        key: "exclusions",
        detail: "Sports injuries are excluded.",
        quote: "injuries from any sporting activity are not covered",
        severity: "watch",
      },
    ]);
    const issues = verifyGrounding([policy], SOURCE);
    expect(issues.length).toBeGreaterThan(0);

    // While issues remain and we are under the cap, the graph re-drafts.
    expect(routeAfterVerify(issues, 1)).toBe("draft");
    // At the cap it gives up revising and finalises.
    expect(routeAfterVerify(issues, MAX_DRAFTS)).toBe("finalize");
    // No issues means finalise regardless of attempts.
    expect(routeAfterVerify([], 1)).toBe("finalize");

    // Finalising demotes the unquotable finding and flags the result for
    // review, rather than surfacing the invented exclusion.
    const result = summarize([policy], issues, SOURCE);
    expect(result.needsReview).toBe(true);
    const exclusions = result.policies[0].checklist.find(
      (i) => i.key === "exclusions",
    );
    expect(exclusions?.status).toBe("not-stated");
    expect(result.policies[0].needsReview).toBe(true);
});

test("[INSURE-CHECK-003] Every checked policy reports the full curated checklist", () => {
    // The model only returned two of the curated items.
    const policy = draftPolicy([
      {
        key: "waiting-period",
        detail: "90-day wait for critical illness.",
        quote: "a waiting period of 90 days applies to critical illness",
        severity: "caution",
      },
      {
        key: "free-look",
        detail: "14-day free-look.",
        quote: "you may cancel this policy within 14 days of receiving it",
        severity: "info",
      },
    ]);

    const { policies } = summarize([policy], [], SOURCE);
    const checklist = policies[0].checklist;

    // Every curated item is present, in order, with a status.
    expect(checklist.map((i) => i.key)).toEqual([...CHECK_ITEMS]);
    for (const item of checklist) {
      expect(["found", "not-stated"]).toContain(item.status);
    }

    // The two quoted items are found; an unmentioned item is not stated.
    expect(checklist.find((i) => i.key === "waiting-period")?.status).toBe("found");
    expect(checklist.find((i) => i.key === "free-look")?.status).toBe("found");
    expect(checklist.find((i) => i.key === "co-payment")?.status).toBe("not-stated");
});

function item(
  key: CheckItem["key"],
  status: CheckItem["status"],
  severity: CheckItem["severity"],
): CheckItem {
  return { key, status, severity, detail: status === "found" ? "d" : "", quote: "" };
}

test("[INSURE-HIGHLIGHT-001] The most important catch is the highest-severity found watch-out", () => {
  const checklist: CheckItem[] = [
    item("waiting-period", "found", "watch"),
    item("co-payment", "found", "caution"),
    item("free-look", "found", "info"),
    item("exclusions", "not-stated", "info"),
  ];
  // caution beats watch beats info.
  expect(topCatch(checklist)?.key).toBe("co-payment");

  // Nothing found means no headline catch.
  const noneFound = CHECK_ITEMS.map((k) => item(k, "not-stated", "info"));
  expect(topCatch(noneFound)).toBeNull();
});

test("[INSURE-DEDUCT-001] The worked payout example is computed correctly from the deductible and co-pay", () => {
  // A bill at or below the deductible is fully self-paid.
  expect(computePayout(1000, 3500, 5)).toEqual({
    bill: 1000,
    selfPaid: 1000,
    insurerPaid: 0,
  });

  // A larger bill: deductible + co-payment of the remainder.
  // 10000 - 3500 = 6500; 5% = 325; self 3825, insurer 6175.
  expect(computePayout(EXAMPLE_BILL, 3500, 5)).toEqual({
    bill: 10000,
    selfPaid: 3825,
    insurerPaid: 6175,
  });

  // The co-payment cap limits the insured's share.
  // 100000 - 3500 = 96500; 5% = 4825, capped to 3000; self 6500, insurer 93500.
  expect(computePayout(100000, 3500, 5, 3000)).toEqual({
    bill: 100000,
    selfPaid: 6500,
    insurerPaid: 93500,
  });
});

test("[INSURE-DEDUCT-002] Payout figures are only used when they appear in the document", () => {
  const source =
    "A deductible of $3,500 applies per policy year, after which a co-payment of 5% is charged.";

  // The deductible and co-pay are present; the cap (9,999) is invented.
  const grounded = buildPayout(
    { deductible: 3500, coPaymentPercent: 5, coPaymentCap: 9999 },
    source,
  );
  expect(grounded).toEqual({ deductible: 3500, coPayPercent: 5 });

  // A deductible that does not appear in the source drops the whole payout,
  // so no invented out-of-pocket figure is ever shown.
  const fabricated = buildPayout(
    { deductible: 8888, coPaymentPercent: 0, coPaymentCap: 0 },
    source,
  );
  expect(fabricated).toBeUndefined();
});
