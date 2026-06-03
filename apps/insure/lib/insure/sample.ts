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
      "A term life plan that pays a lump sum if you pass away or are diagnosed as totally and permanently disabled while the policy is in force. Cover runs for the chosen term and ends when the term does.",
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
      "An Integrated Shield hospitalisation plan covering private hospital stays and selected outpatient treatments on an as-charged basis, on top of MediShield Life.",
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
      "co-payment": {
        detail: "A 5% co-payment applies to each claim unless you hold the rider that caps it.",
        quote: "the insured shall bear a co-payment of 5 percent of the eligible claim amount",
        severity: "caution",
      },
      "claim-limits": {
        detail: "Claims are subject to an annual limit and per-treatment sub-limits.",
        quote: "benefits are subject to an annual claim limit and the sub-limits set out in the benefit schedule",
        severity: "watch",
      },
    }),
    needsReview: false,
  },
];
