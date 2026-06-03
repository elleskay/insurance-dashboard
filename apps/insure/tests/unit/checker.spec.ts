import { test, expect } from "@platform/spec-test/vitest";
import { CHECK_ITEMS, type CheckItem } from "@/lib/insure/types";
import {
  MAX_DRAFTS,
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
