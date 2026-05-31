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

export interface Policy {
  id: string;
  insurer: string;
  name: string;
  category: Category;
  /** Coverage amount in SGD. For "as charged" hospital plans this may be 0. */
  sumAssured: number;
  /** Premium in SGD per year. */
  annualPremium: number;
}

/** What the extractor can detect from a document. All fields optional. */
export type ExtractedPolicy = Partial<Omit<Policy, "id">>;

export interface Profile {
  annualIncome: number;
}
