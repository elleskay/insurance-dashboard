export const CATEGORIES = [
  "hospitalisation",
  "life",
  "critical-illness",
  "disability-income",
  "personal-accident",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  hospitalisation: "Hospitalisation (Integrated Shield)",
  life: "Life (death and TPD)",
  "critical-illness": "Critical illness",
  "disability-income": "Disability income",
  "personal-accident": "Personal accident",
};

/**
 * The curated Singapore fine-print checklist. Every checked policy reports a
 * status for each of these, in this order, so nothing silently disappears. The
 * order roughly follows when each catch bites you: before you can claim, what
 * is carved out, what you still pay, and how the policy can change on you.
 */
export const CHECK_ITEMS = [
  "waiting-period",
  "survival-period",
  "pre-existing",
  "exclusions",
  "deductible",
  "co-payment",
  "claim-limits",
  "premium-guarantee",
  "free-look",
] as const;

export type CheckKey = (typeof CHECK_ITEMS)[number];

export const CHECK_LABELS: Record<CheckKey, string> = {
  "waiting-period": "Waiting period",
  "survival-period": "Survival period",
  "pre-existing": "Pre-existing conditions",
  exclusions: "Key exclusions",
  deductible: "Deductible",
  "co-payment": "Co-payment and pro-ration",
  "claim-limits": "Claim and sub-limits",
  "premium-guarantee": "Premium guarantee",
  "free-look": "Free-look period",
};

/** Plain-language description of what each watch-out means. Shown as a hint and
 * fed to the model so it knows what to look for. */
export const CHECK_DESCRIPTIONS: Record<CheckKey, string> = {
  "waiting-period":
    "A period after the policy starts during which a claim is not payable (for example a 90-day wait before critical illness cover begins).",
  "survival-period":
    "A number of days you must survive after a diagnosis or event before a benefit is paid (common on critical illness plans).",
  "pre-existing":
    "Whether conditions you already had before the policy started are excluded or limited.",
  exclusions:
    "Specific situations, conditions or activities the policy will not pay for.",
  deductible:
    "The fixed amount you pay out of pocket before the policy pays anything. Bills at or below it are fully self-paid (the most common reason a claim does not pay out).",
  "co-payment":
    "The percentage share of a claim you still pay after the deductible: co-insurance, co-payment or pro-ration (common on Integrated Shield riders).",
  "claim-limits":
    "Caps on what can be claimed: per claim, per year, lifetime limits, or sub-limits on specific benefits.",
  "premium-guarantee":
    "Whether premiums are guaranteed or can rise, and whether they step up with age.",
  "free-look":
    "The window after buying during which you can cancel for a refund (typically 14 days in Singapore).",
};

export type CheckStatus = "found" | "not-stated";

/** How much a found watch-out should worry the reader. */
export type CheckSeverity = "info" | "watch" | "caution";

export interface CheckItem {
  key: CheckKey;
  status: CheckStatus;
  /** Plain-language detail when found; empty string when not stated. */
  detail: string;
  /** Verbatim snippet from the document backing the finding; empty if not found. */
  quote: string;
  severity: CheckSeverity;
}

/**
 * The out-of-pocket structure, used for a worked "will this pay out?" example.
 * Every figure here is grounded: it is only set if the number appears in the
 * document.
 */
export interface Payout {
  /** Deductible / excess in SGD paid before the policy pays anything. */
  deductible?: number;
  /** Co-payment / co-insurance percentage charged after the deductible. */
  coPayPercent?: number;
  /** Annual cap in SGD on the co-payment, if stated. */
  coPayCap?: number;
}

/** A single policy after it has been read and checked. */
export interface PolicyCheck {
  id: string;
  insurer: string;
  name: string;
  category: Category;
  /** Plain-language "what you are getting" paragraph. */
  summary: string;
  /** Benefit / sum assured in SGD, if stated. */
  benefitAmount?: number;
  /** Annual premium in SGD, if stated. */
  premium?: number;
  /** A short note on the premium (for example "not guaranteed, rises with age"). */
  premiumNote?: string;
  /** The full curated checklist, always one entry per CHECK_ITEMS key. */
  checklist: CheckItem[];
  /** Grounded out-of-pocket figures, when the document states them. */
  payout?: Payout;
  /** True when grounding had to set something aside. */
  needsReview?: boolean;
  /** Client-only: marks a pre-computed sample report loaded without an upload. */
  sample?: boolean;
}

/** The server returns checked policies without a client id; the UI assigns one. */
export type PolicyCheckData = Omit<PolicyCheck, "id">;
