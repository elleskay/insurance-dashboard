import type { Category, ExtractedPolicy } from "./types";

// Deterministic, best-effort extraction from policy text. It only sets a field
// when it finds a clear signal, so unrelated text yields nothing rather than
// fabricated numbers. The user always reviews and corrects the result.

const INSURERS = [
  "Great Eastern",
  "Prudential",
  "AIA",
  "NTUC Income",
  "Income",
  "Manulife",
  "Singlife",
  "AXA",
  "HSBC Life",
  "Aviva",
  "Tokio Marine",
  "China Taiping",
  "FWD",
  "Etiqa",
];

function detectInsurer(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const name of INSURERS) {
    if (lower.includes(name.toLowerCase())) return name;
  }
  return undefined;
}

function detectCategory(text: string): Category | undefined {
  const t = text.toLowerCase();
  if (/critical illness|critical-illness|major illness|early stage critical/.test(t)) {
    return "critical-illness";
  }
  if (/income protection|disability income/.test(t)) return "disability-income";
  if (/personal accident|accidental death/.test(t)) return "personal-accident";
  if (/hospital|integrated shield|medishield|shield plan|surgical|h&s/.test(t)) {
    return "hospitalisation";
  }
  if (
    /term life|whole life|life assured|death benefit|total and permanent disability|\btpd\b|life insurance|life plan/.test(
      t,
    )
  ) {
    return "life";
  }
  return undefined;
}

function parseAmount(raw: string): number {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function detectSumAssured(text: string): number | undefined {
  const m = text.match(
    /(sum assured|sum insured|coverage amount|benefit amount|sum covered|insured amount)[^\d$]{0,24}s?\$?\s?([\d,]+(?:\.\d+)?)/i,
  );
  if (!m) return undefined;
  const n = parseAmount(m[2] as string);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function detectAnnualPremium(text: string): number | undefined {
  const m = text.match(
    /(premium)[^\d$]{0,30}s?\$?\s?([\d,]+(?:\.\d+)?)\s*(per year|per annum|\/\s?year|annually|a year|per month|\/\s?month|monthly|p\.?a\.?|p\.?m\.?)?/i,
  );
  if (!m) return undefined;
  let n = parseAmount(m[2] as string);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const period = (m[3] ?? "").toLowerCase();
  if (/month|p\.?m\.?/.test(period)) n = Math.round(n * 12);
  return n;
}

export function extractPolicyFromText(text: string): ExtractedPolicy {
  const result: ExtractedPolicy = {};
  const insurer = detectInsurer(text);
  if (insurer) result.insurer = insurer;
  const category = detectCategory(text);
  if (category) result.category = category;
  const sumAssured = detectSumAssured(text);
  if (sumAssured !== undefined) result.sumAssured = sumAssured;
  const annualPremium = detectAnnualPremium(text);
  if (annualPremium !== undefined) result.annualPremium = annualPremium;
  return result;
}
