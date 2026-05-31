import { z } from "zod";
import { CATEGORIES, type Category, type ExtractedPolicy } from "./types";

// Schema the AI model must fill. Kept permissive (0 / "unknown" instead of
// nulls) so the model never has to omit a field; normalizePolicies turns that
// into clean ExtractedPolicy values.
export const llmExtractionSchema = z.object({
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
        sumAssured: z
          .number()
          .describe("Sum assured / coverage amount in SGD. Use 0 if not found."),
        premiumAmount: z
          .number()
          .describe("Premium amount in SGD exactly as stated. Use 0 if not found."),
        premiumFrequency: z
          .enum(["monthly", "yearly", "unknown"])
          .describe("Whether premiumAmount is billed monthly or yearly."),
      }),
    )
    .describe("One entry per distinct policy or plan found in the document."),
});

export type LlmExtraction = z.infer<typeof llmExtractionSchema>;

export const EXTRACT_SYSTEM =
  "You extract Singapore personal insurance policy details from raw policy document text. " +
  "Return one entry per distinct policy or plan. Amounts are in Singapore dollars. " +
  "If a value is not clearly present, use 0 for amounts and 'unknown' for category rather than guessing. " +
  "Do not invent insurers, amounts, or coverage that the text does not support.";

// Raw shape tolerant of stringy / null values so normalization is robust to
// whatever the model returns.
export interface RawPolicy {
  insurer?: string | null;
  name?: string | null;
  category?: string | null;
  sumAssured?: number | string | null;
  premiumAmount?: number | string | null;
  premiumFrequency?: string | null;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function toCategory(c: unknown): Category | undefined {
  return typeof c === "string" && (CATEGORIES as readonly string[]).includes(c)
    ? (c as Category)
    : undefined;
}

/** Coerce one raw AI policy into a clean, validated ExtractedPolicy. */
export function normalizePolicy(raw: RawPolicy): ExtractedPolicy {
  const out: ExtractedPolicy = {};

  const insurer = (raw.insurer ?? "").toString().trim();
  if (insurer) out.insurer = insurer;

  const name = (raw.name ?? "").toString().trim();
  if (name) out.name = name;

  const category = toCategory(raw.category);
  if (category) out.category = category;

  const sum = toNumber(raw.sumAssured);
  if (sum !== undefined && sum > 0) out.sumAssured = Math.round(sum);

  const premium = toNumber(raw.premiumAmount);
  if (premium !== undefined && premium > 0) {
    const annual = raw.premiumFrequency === "monthly" ? premium * 12 : premium;
    out.annualPremium = Math.round(annual);
  }

  return out;
}

export function normalizePolicies(raws: RawPolicy[]): ExtractedPolicy[] {
  return raws.map(normalizePolicy);
}
