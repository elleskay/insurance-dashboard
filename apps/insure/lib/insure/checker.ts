import { z } from "zod";
import {
  CATEGORIES,
  CHECK_DESCRIPTIONS,
  CHECK_ITEMS,
  CHECK_LABELS,
  type Category,
  type CheckItem,
  type CheckKey,
  type CheckSeverity,
  type PolicyCheckData,
} from "./types";

/**
 * The deterministic, model-free core of the policy checker. The headline
 * behaviour (see checker-graph.ts) is a self-correction loop: the model reads a
 * policy document and drafts a plain-language summary plus a set of fine-print
 * findings, each with a verbatim quote from the document. We then check that
 * every quote actually appears in the source text, and the graph re-drafts
 * anything it cannot ground before demoting the rest to "not stated". The
 * functions here are that grounding logic, so they are unit-testable without a
 * model.
 */

/** Up to two drafts: the first plus one revision. Bounds the worst-case number
 * of paid model calls per request. */
export const MAX_DRAFTS = 2;

/** How loudly a found watch-out should be flagged. Higher is more serious. */
export const SEVERITY_RANK: Record<CheckSeverity, number> = {
  caution: 3,
  watch: 2,
  info: 1,
};

/**
 * The single most important catch in a checklist: the highest-severity found
 * item, breaking ties by the curated order (which CHECK_ITEMS already encodes).
 * Returns null when nothing was found. Used to surface one headline per policy.
 */
export function topCatch(checklist: CheckItem[]): CheckItem | null {
  let best: CheckItem | null = null;
  for (const item of checklist) {
    if (item.status !== "found") continue;
    if (!best || SEVERITY_RANK[item.severity] > SEVERITY_RANK[best.severity]) {
      best = item;
    }
  }
  return best;
}

/** A quote shorter than this (after normalisation) is too weak to trust as
 * grounding, so it is treated as ungrounded. */
export const MIN_QUOTE_CHARS = 12;

const VALID_KEYS = new Set<string>(CHECK_ITEMS);
const VALID_CATEGORIES = new Set<string>(CATEGORIES);
const VALID_SEVERITIES = new Set<string>(["info", "watch", "caution"]);

/** What the model returns for a single watch-out it claims to have found. */
export interface DraftFinding {
  key: string;
  detail: string;
  quote: string;
  severity: string;
}

/** Out-of-pocket figures the model extracts for the worked payout example. */
export interface DraftPayout {
  deductible: number;
  coPaymentPercent: number;
  coPaymentCap: number;
}

/** What the model returns for a single policy in the document. */
export interface DraftPolicy {
  insurer: string;
  name: string;
  category: string;
  summary: string;
  benefitAmount: number;
  premium: number;
  premiumNote: string;
  findings: DraftFinding[];
  payout: DraftPayout;
}

export interface GroundingIssue {
  policyIndex: number;
  key: string;
  reason: string;
}

export interface CheckResult {
  policies: PolicyCheckData[];
  needsReview: boolean;
}

/**
 * Normalise text for quote matching: lowercase, strip everything that is not a
 * letter, digit or space, and collapse whitespace. This makes grounding robust
 * to the spacing and punctuation noise that PDF text extraction introduces,
 * while still requiring the model's quote to be a real run of words from the
 * document.
 */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A finding's quote is grounded only if it is a meaningful run of text that
 * actually appears in the document. */
export function isQuoteGrounded(quote: string, normalizedSource: string): boolean {
  const q = normalizeForMatch(quote);
  if (q.length < MIN_QUOTE_CHARS) return false;
  return normalizedSource.includes(q);
}

/**
 * The anti-hallucination guard. Walk every drafted finding and flag the ones
 * whose quote we cannot locate in the source document. Findings for unknown
 * checklist keys are flagged too, so a stray key cannot slip through.
 */
export function verifyGrounding(
  policies: DraftPolicy[],
  sourceText: string,
): GroundingIssue[] {
  const normalizedSource = normalizeForMatch(sourceText);
  const issues: GroundingIssue[] = [];
  policies.forEach((policy, policyIndex) => {
    policy.findings.forEach((f) => {
      if (!VALID_KEYS.has(f.key)) {
        issues.push({
          policyIndex,
          key: f.key,
          reason: `"${f.key}" is not one of the checklist items.`,
        });
        return;
      }
      if (!isQuoteGrounded(f.quote, normalizedSource)) {
        issues.push({
          policyIndex,
          key: f.key,
          reason: `The quote for "${CHECK_LABELS[f.key as CheckKey]}" was not found in the document. Quote the exact wording or drop the finding.`,
        });
      }
    });
  });
  return issues;
}

/** The illustrative hospital bill used in the worked payout example. */
export const EXAMPLE_BILL = 10_000;

export interface PayoutSplit {
  bill: number;
  selfPaid: number;
  insurerPaid: number;
}

/**
 * The out-of-pocket split for a bill given a deductible and optional co-payment.
 * A bill at or below the deductible is entirely self-paid; above it the insured
 * pays the deductible plus the (optionally capped) co-payment, the insurer pays
 * the rest. This is the maths behind "will this claim even pay out?".
 */
export function computePayout(
  bill: number,
  deductible: number,
  coPayPercent = 0,
  coPayCap = 0,
): PayoutSplit {
  if (bill <= deductible) return { bill, selfPaid: bill, insurerPaid: 0 };
  const afterDeductible = bill - deductible;
  let coPay = afterDeductible * (coPayPercent / 100);
  if (coPayCap > 0) coPay = Math.min(coPay, coPayCap);
  const selfPaid = Math.round(deductible + coPay);
  return { bill, selfPaid, insurerPaid: bill - selfPaid };
}

/** A dollar figure is grounded if it appears in the raw source as digits or a
 * comma-grouped number (for example 3500 or 3,500). */
export function groundsAmount(n: number, rawSource: string): boolean {
  return (
    rawSource.includes(String(n)) ||
    rawSource.includes(n.toLocaleString("en-US"))
  );
}

/** A percentage is grounded if the document writes it as a percent. */
export function groundsPercent(n: number, rawSource: string): boolean {
  const s = rawSource.toLowerCase();
  return (
    s.includes(`${n}%`) ||
    s.includes(`${n} percent`) ||
    s.includes(`${n} per cent`)
  );
}

/**
 * Build the grounded payout for a policy: keep only figures the document
 * actually states, so the worked example never shows an invented number. Returns
 * undefined when there is no grounded deductible to anchor the example.
 */
export function buildPayout(
  draft: DraftPayout,
  rawSource: string,
): { deductible?: number; coPayPercent?: number; coPayCap?: number } | undefined {
  const out: { deductible?: number; coPayPercent?: number; coPayCap?: number } = {};
  if (draft.deductible > 0 && groundsAmount(draft.deductible, rawSource)) {
    out.deductible = Math.round(draft.deductible);
  }
  if (draft.coPaymentPercent > 0 && groundsPercent(draft.coPaymentPercent, rawSource)) {
    out.coPayPercent = draft.coPaymentPercent;
  }
  if (draft.coPaymentCap > 0 && groundsAmount(draft.coPaymentCap, rawSource)) {
    out.coPayCap = Math.round(draft.coPaymentCap);
  }
  // Anchor the worked example on a grounded deductible.
  return out.deductible !== undefined ? out : undefined;
}

/**
 * Conditional-edge router: revise while there are ungrounded findings and we
 * are under the draft cap, otherwise finalise.
 */
export function routeAfterVerify(
  issues: GroundingIssue[],
  attempts: number,
): "draft" | "finalize" {
  return issues.length > 0 && attempts < MAX_DRAFTS ? "draft" : "finalize";
}

function toCategory(c: string): Category {
  return VALID_CATEGORIES.has(c) ? (c as Category) : "life";
}

function toSeverity(s: string): CheckSeverity {
  return VALID_SEVERITIES.has(s) ? (s as CheckSeverity) : "watch";
}

function positiveAmount(n: number): number | undefined {
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

/**
 * Final step. For each policy, keep only the findings we could ground, then
 * build the complete curated checklist so every item reports either found
 * (with its detail and quote) or not stated. Anything set aside flips
 * needsReview, so the UI can tell the user some claims were dropped rather than
 * silently hiding them.
 */
export function summarize(
  policies: DraftPolicy[],
  issues: GroundingIssue[],
  sourceText: string,
): CheckResult {
  const normalizedSource = normalizeForMatch(sourceText);
  let dropped = 0;

  const out: PolicyCheckData[] = policies.map((policy, policyIndex) => {
    // The grounded findings for this policy, keyed for lookup. First grounded
    // finding per key wins; later duplicates are ignored.
    const grounded = new Map<CheckKey, DraftFinding>();
    for (const f of policy.findings) {
      if (!VALID_KEYS.has(f.key)) {
        dropped += 1;
        continue;
      }
      const key = f.key as CheckKey;
      if (!isQuoteGrounded(f.quote, normalizedSource)) {
        dropped += 1;
        continue;
      }
      if (!grounded.has(key)) grounded.set(key, f);
    }

    const checklist: CheckItem[] = CHECK_ITEMS.map((key) => {
      const f = grounded.get(key);
      if (f) {
        return {
          key,
          status: "found",
          detail: f.detail.trim() || CHECK_DESCRIPTIONS[key],
          quote: f.quote.trim(),
          severity: toSeverity(f.severity),
        };
      }
      return { key, status: "not-stated", detail: "", quote: "", severity: "info" };
    });

    void policyIndex;
    return {
      insurer: policy.insurer.trim() || "Unknown insurer",
      name: policy.name.trim() || "Policy",
      category: toCategory(policy.category),
      summary: policy.summary.trim(),
      benefitAmount: positiveAmount(policy.benefitAmount),
      premium: positiveAmount(policy.premium),
      premiumNote: policy.premiumNote.trim() || undefined,
      checklist,
      payout: buildPayout(policy.payout, sourceText),
      needsReview: false,
    };
  });

  const needsReview = issues.length > 0 || dropped > 0;
  if (needsReview) for (const p of out) p.needsReview = true;

  return { policies: out, needsReview };
}

// ---------------------------------------------------------------------------
// Model schema + prompt
// ---------------------------------------------------------------------------

/** Schema the reading model fills. Kept flat so revisions are cheap to parse. */
export const checkDraftSchema = z.object({
  policies: z
    .array(
      z.object({
        insurer: z.string().describe("Insurer or company name. Empty string if not stated."),
        name: z.string().describe("Plan or product name. Empty string if not stated."),
        category: z
          .enum([...CATEGORIES, "unknown"])
          .describe(
            "One of: hospitalisation (Integrated Shield/MediShield/H&S), life (death and TPD, term/whole life), critical-illness, disability-income (income protection), personal-accident. Use 'unknown' if unclear.",
          ),
        summary: z
          .string()
          .describe(
            "Two to four plain-language sentences: what this policy covers, what triggers a payout, and the headline benefit. Aimed at someone with no insurance knowledge.",
          ),
        benefitAmount: z
          .number()
          .describe("Headline sum assured or benefit amount in SGD. Use 0 if not stated."),
        premium: z
          .number()
          .describe("Annual premium in SGD. Use 0 if not stated."),
        premiumNote: z
          .string()
          .describe("Short note on the premium, for example 'not guaranteed, rises with age'. Empty string if nothing notable."),
        findings: z
          .array(
            z.object({
              key: z
                .enum(CHECK_ITEMS)
                .describe("Which curated watch-out this is."),
              detail: z
                .string()
                .describe("One plain-language sentence explaining this watch-out for this policy."),
              quote: z
                .string()
                .describe(
                  "A short VERBATIM quote copied exactly from the document text that supports this finding. Must be wording that literally appears in the document. Do not paraphrase.",
                ),
              severity: z
                .enum(["info", "watch", "caution"])
                .describe("info: routine. watch: worth knowing. caution: could materially limit a claim."),
            }),
          )
          .describe(
            "Only the curated watch-out items you can actually find in the document, each with a verbatim supporting quote. Omit items the document does not mention rather than guessing.",
          ),
        payout: z
          .object({
            deductible: z
              .number()
              .describe("Deductible or excess in SGD the insured pays before the policy pays anything, exactly as stated. 0 if not stated."),
            coPaymentPercent: z
              .number()
              .describe("Co-payment or co-insurance percentage charged after the deductible (for example 5 for 5%). 0 if not stated."),
            coPaymentCap: z
              .number()
              .describe("Any annual cap in SGD on the co-payment, exactly as stated. 0 if not stated."),
          })
          .describe("Out-of-pocket figures for the worked payout example. Use 0 for anything the document does not state. Do not estimate."),
      }),
    )
    .describe("One entry per distinct policy or plan found in the document."),
});

export type CheckDraft = z.infer<typeof checkDraftSchema>;

export const CHECKER_SYSTEM =
  "You read Singapore personal insurance policy documents and explain them plainly. " +
  "For each policy you do two things: write a short plain-language summary of what it covers, and surface the fine print a buyer should watch for. " +
  "You may ONLY report a watch-out if you can copy a verbatim quote of the supporting wording from the document text provided; if you cannot quote it, do not report it. " +
  "Never invent exclusions, limits, waiting periods or figures. It is correct and expected to leave items out when the document does not mention them. " +
  "This is general information, not financial advice. Do not use em dashes.";

const CHECKLIST_BRIEF = CHECK_ITEMS.map(
  (k) => `- ${k} (${CHECK_LABELS[k]}): ${CHECK_DESCRIPTIONS[k]}`,
).join("\n");

/** Render the document text (and any prior grounding issues to fix) as a prompt. */
export function buildCheckPrompt(
  sourceText: string,
  priorIssues: GroundingIssue[],
): string {
  const lines: string[] = [];
  lines.push("Watch-out items to look for (only report the ones the document actually supports):");
  lines.push(CHECKLIST_BRIEF);
  if (priorIssues.length > 0) {
    lines.push("");
    lines.push("Your previous draft had these grounding problems. Fix them by quoting the exact wording or dropping the finding:");
    for (const issue of priorIssues) lines.push(`- ${issue.reason}`);
  }
  lines.push("");
  lines.push("POLICY DOCUMENT TEXT:");
  lines.push(sourceText);
  return lines.join("\n");
}
