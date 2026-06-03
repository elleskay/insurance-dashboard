import { CHECK_ITEMS, type CheckItem, type PolicyCheckData } from "./types";

type Found = Pick<CheckItem, "detail" | "quote" | "severity">;

/** Build a full 8-item checklist from the found items, marking the rest not stated. */
function checklist(found: Partial<Record<CheckItem["key"], Found>>): CheckItem[] {
  return CHECK_ITEMS.map((key) => {
    const f = found[key];
    return f
      ? { key, status: "found", detail: f.detail, quote: f.quote, severity: f.severity }
      : { key, status: "not-stated", detail: "", quote: "", severity: "info" };
  });
}

/**
 * A pre-computed sample report so the app can be tried without uploading a real
 * document, and without spending a model call. Shown clearly labelled as a
 * sample in the UI.
 */
export const SAMPLE_CHECKS: PolicyCheckData[] = [
  {
    insurer: "Great Eastern",
    name: "GREAT Term Protect",
    category: "life",
    summary:
      "A term life plan that pays a lump sum on death or total and permanent disability while the policy is in force.",
    coverage: [
      {
        benefit: "Death benefit",
        limit: "$750,000",
        detail: "A lump sum of $750,000 is paid to your beneficiaries if you pass away during the policy term.",
        quote: "a death benefit of $750,000 is payable on the death of the life assured during the term",
      },
      {
        benefit: "Total and permanent disability",
        limit: "$750,000",
        detail: "The same $750,000 is paid if you become totally and permanently disabled before age 70.",
        quote: "the total and permanent disability benefit of $750,000 is payable before the policy anniversary at age 70",
      },
    ],
    benefitAmount: 750000,
    premium: 720,
    checklist: checklist({
      "survival-period": {
        detail: "The benefit is paid only if you survive at least 7 days after a covered diagnosis.",
        quote: "a survival period of 7 days applies before any benefit becomes payable",
        severity: "watch",
      },
      exclusions: {
        detail: "No payout for death by suicide within the first policy year.",
        quote: "no benefit is payable for death resulting from suicide within one year from the cover start date",
        severity: "watch",
      },
      "free-look": {
        detail: "You can cancel within 14 days of receiving the policy for a refund.",
        quote: "you may cancel this policy within 14 days of receiving the document",
        severity: "info",
      },
    }),
    needsReview: false,
  },
  {
    insurer: "AIA",
    name: "HealthShield Gold Max",
    category: "hospitalisation",
    summary:
      "An Integrated Shield hospitalisation plan covering private hospital stays and selected outpatient treatments, on top of MediShield Life.",
    coverage: [
      {
        benefit: "Hospital room and board",
        limit: "As charged",
        detail: "A private hospital ward is covered as charged, with no fixed daily cap.",
        quote: "room and board in a private hospital is payable as charged",
      },
      {
        benefit: "Surgical procedures",
        limit: "As charged",
        detail: "Surgeon, anaesthetist and operating-theatre fees are covered as charged.",
        quote: "surgical fees, including the surgeon and anaesthetist, are payable as charged",
      },
      {
        benefit: "Outpatient cancer treatment",
        limit: "Up to 5x MediShield Life limit",
        detail: "Approved outpatient cancer drug treatment is covered up to five times the MediShield Life limit.",
        quote: "outpatient cancer drug treatment is covered up to 5 times the MediShield Life claim limit",
      },
      {
        benefit: "Pre- and post-hospitalisation",
        limit: "Up to 180 days",
        detail: "Related treatment before and after a hospital stay is covered for up to 180 days.",
        quote: "pre-hospitalisation and post-hospitalisation treatment is covered for up to 180 days",
      },
    ],
    premium: 650,
    premiumNote: "not guaranteed, rises with age",
    checklist: checklist({
      "waiting-period": {
        detail: "Specified illnesses have a 30-day waiting period from the start date.",
        quote: "a waiting period of 30 days applies to specified illnesses",
        severity: "watch",
      },
      "pre-existing": {
        detail: "Conditions you already had before the policy started are excluded unless declared and accepted.",
        quote: "pre-existing conditions are not covered unless specifically declared and accepted by us",
        severity: "caution",
      },
      deductible: {
        detail: "You pay the first $3,500 of an eligible claim each policy year before the plan pays.",
        quote: "a deductible of $3,500 applies per policy year before benefits are payable",
        severity: "caution",
      },
      "co-payment": {
        detail: "A 5% co-payment applies after the deductible, capped at $3,000 a year on panel doctors.",
        quote: "the insured shall bear a co-payment of 5 percent of the eligible claim amount",
        severity: "caution",
      },
      "claim-limits": {
        detail: "Claims are subject to an annual limit and per-treatment sub-limits.",
        quote: "benefits are subject to an annual claim limit and the sub-limits set out in the benefit schedule",
        severity: "watch",
      },
    }),
    payout: { deductible: 3500, coPayPercent: 5, coPayCap: 3000 },
    needsReview: false,
  },
];
