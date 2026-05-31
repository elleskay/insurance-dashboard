"use client";

import { useEffect, useState } from "react";
import { PdfUpload } from "@/components/PdfUpload";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type ExtractedPolicy,
  type Policy,
} from "@/lib/insure/types";
import {
  adequacy,
  CI_MULTIPLE,
  coverageFor,
  DEATH_TPD_MULTIPLE,
  premiumShareOfIncome,
  sumByCategory,
  totalAnnualPremium,
  type Adequacy,
} from "@/lib/insure/compute";

const STORAGE_KEY = "insure.state.v1";

function sgd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

const STATUS_STYLES: Record<string, string> = {
  met: "bg-ok-soft text-ok",
  partial: "bg-warn-soft text-warn",
  low: "bg-danger-soft text-danger",
};
const STATUS_LABEL: Record<string, string> = {
  met: "Target met",
  partial: "Partly covered",
  low: "Likely under-covered",
};
const STATUS_STROKE: Record<string, string> = {
  met: "#047857",
  partial: "#b45309",
  low: "#b91c1c",
};

const CATEGORY_META: Record<
  Category,
  { chip: string; color: string; icon: React.ReactNode }
> = {
  hospitalisation: {
    chip: "bg-sky-100 text-sky-700",
    color: "#0ea5e9",
    icon: <path d="M3 21V8l9-5 9 5v13M9 21v-6h6v6M12 3v3" />,
  },
  life: {
    chip: "bg-indigo-100 text-indigo-700",
    color: "#6366f1",
    icon: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />,
  },
  "critical-illness": {
    chip: "bg-rose-100 text-rose-700",
    color: "#f43f5e",
    icon: <path d="M3 12h4l2 5 4-12 2 7h6" />,
  },
  "disability-income": {
    chip: "bg-emerald-100 text-emerald-700",
    color: "#10b981",
    icon: <path d="M3 7h18v10H3zM3 11h18M7 15h2" />,
  },
  "personal-accident": {
    chip: "bg-amber-100 text-amber-700",
    color: "#f59e0b",
    icon: <path d="M12 3a9 9 0 0 0-9 9h18a9 9 0 0 0-9-9zM12 12v9M8 21h8" />,
  },
};

interface Draft {
  insurer: string;
  name: string;
  category: Category;
  sumAssured: string;
  annualPremium: string;
}
const EMPTY_DRAFT: Draft = {
  insurer: "",
  name: "",
  category: "life",
  sumAssured: "",
  annualPremium: "",
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "p" + Date.now() + Math.round(Math.random() * 1e6);
}

export function Dashboard() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [income, setIncome] = useState<number>(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { policies?: Policy[]; income?: number };
        if (Array.isArray(parsed.policies)) setPolicies(parsed.policies);
        if (typeof parsed.income === "number") setIncome(parsed.income);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ policies, income }));
    } catch {
      /* ignore */
    }
  }, [policies, income]);

  function prefill(extracted: ExtractedPolicy) {
    setDraft((d) => ({
      ...d,
      insurer: extracted.insurer ?? d.insurer,
      name: extracted.name ?? d.name,
      category: extracted.category ?? d.category,
      sumAssured:
        extracted.sumAssured !== undefined ? String(extracted.sumAssured) : d.sumAssured,
      annualPremium:
        extracted.annualPremium !== undefined
          ? String(extracted.annualPremium)
          : d.annualPremium,
    }));
  }

  function addPolicy(e: React.FormEvent) {
    e.preventDefault();
    const policy: Policy = {
      id: newId(),
      insurer: draft.insurer.trim() || "Unnamed insurer",
      name: draft.name.trim(),
      category: draft.category,
      sumAssured: Number(draft.sumAssured) || 0,
      annualPremium: Number(draft.annualPremium) || 0,
    };
    setPolicies((p) => [...p, policy]);
    setDraft(EMPTY_DRAFT);
  }

  function removePolicy(id: string) {
    setPolicies((p) => p.filter((x) => x.id !== id));
  }

  const totals = sumByCategory(policies);
  const totalCover = CATEGORIES.reduce((s, c) => s + totals[c], 0);
  const lifeAdq = adequacy(income, coverageFor(policies, "life"), DEATH_TPD_MULTIPLE);
  const ciAdq = adequacy(income, coverageFor(policies, "critical-illness"), CI_MULTIPLE);
  const premium = totalAnnualPremium(policies);
  const premiumShare = premiumShareOfIncome(premium, income);
  const hasPolicies = policies.length > 0;

  const overall = !hasPolicies
    ? { label: "No policies yet", dot: "#94a3b8" }
    : income === 0
      ? { label: "Add income for adequacy", dot: "#94a3b8" }
      : lifeAdq.status === "low" || ciAdq.status === "low"
        ? { label: "Gaps to close", dot: "#f87171" }
        : lifeAdq.status === "partial" || ciAdq.status === "partial"
          ? { label: "Review recommended", dot: "#fbbf24" }
          : { label: "Well protected", dot: "#34d399" };

  return (
    <div className="flex flex-col gap-7">
      <section className="hero-gradient shadow-glow relative overflow-hidden rounded-3xl px-7 py-8 text-white sm:px-10 sm:py-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/75">
          Insurance coverage overview, Singapore
        </p>
        <h1 className="mt-3 max-w-[20ch] text-3xl font-semibold text-white sm:text-4xl">
          Your protection, at a glance.
        </h1>
        <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <HeroStat label="Total cover" value={sgd(totalCover)} />
          <HeroStat label="Policies" value={String(policies.length)} />
          <HeroStat label="Annual premium" value={sgd(premium)} />
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-wider text-white/70">
              Status
            </span>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/15">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: overall.dot }}
              />
              {overall.label}
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-card">
          <div className="flex flex-col gap-2">
            <label htmlFor="income" className="font-semibold text-heading">
              Your annual income (SGD)
            </label>
            <input
              id="income"
              type="number"
              inputMode="numeric"
              min={0}
              value={income === 0 ? "" : income}
              onChange={(e) => setIncome(Number(e.target.value) || 0)}
              placeholder="e.g. 80000"
              className="field-input"
            />
            <p className="text-sm text-muted-foreground">
              Used to compare your cover against the benchmarks. Stored only in
              this browser.
            </p>
          </div>

          <hr className="border-border" />
          <PdfUpload onPrefill={prefill} />

          <form onSubmit={addPolicy} className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-heading">
              Add or review a policy
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Insurer">
                <input
                  type="text"
                  value={draft.insurer}
                  onChange={(e) => setDraft({ ...draft, insurer: e.target.value })}
                  className="field-input"
                />
              </Field>
              <Field label="Policy name (optional)">
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="field-input"
                />
              </Field>
              <Field label="Category">
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value as Category })
                  }
                  className="field-input"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sum assured (SGD)">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft.sumAssured}
                  onChange={(e) => setDraft({ ...draft, sumAssured: e.target.value })}
                  className="field-input"
                />
              </Field>
              <Field label="Annual premium (SGD)">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft.annualPremium}
                  onChange={(e) =>
                    setDraft({ ...draft, annualPremium: e.target.value })
                  }
                  className="field-input"
                />
              </Field>
            </div>
            <button
              type="submit"
              className="w-fit rounded-xl bg-primary px-6 py-2.5 font-semibold text-on-primary shadow-card transition-colors hover:bg-primary-strong"
            >
              Add policy
            </button>
          </form>
        </section>

        <div className="flex flex-col gap-6">
          {!hasPolicies ? (
            <section
              data-testid="empty-state"
              className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center"
            >
              <span
                aria-hidden="true"
                className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-primary"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <h2 className="text-lg font-semibold text-heading">No policies yet</h2>
              <p className="max-w-sm text-muted-foreground">
                Upload a policy PDF or add one by hand on the left. Your coverage
                summary and adequacy check appear here.
              </p>
            </section>
          ) : (
            <>
              <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-card">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-heading">
                    Coverage by category
                  </h2>
                  <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    {sgd(totalCover)} total
                  </span>
                </div>
                {totalCover > 0 ? (
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface">
                    {CATEGORIES.filter((c) => totals[c] > 0).map((c) => (
                      <div
                        key={c}
                        style={{
                          width: `${(totals[c] / totalCover) * 100}%`,
                          backgroundColor: CATEGORY_META[c].color,
                        }}
                        title={CATEGORY_LABELS[c]}
                      />
                    ))}
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {CATEGORIES.map((c) => (
                    <div
                      key={c}
                      data-testid="category-card"
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5"
                    >
                      <span
                        aria-hidden="true"
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${CATEGORY_META[c].chip}`}
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {CATEGORY_META[c].icon}
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-muted-foreground">
                          {CATEGORY_LABELS[c]}
                        </p>
                        <p className="font-display text-lg font-bold text-heading">
                          {c === "hospitalisation" && totals[c] === 0
                            ? "As charged"
                            : sgd(totals[c])}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-3" data-testid="adequacy">
                <h2 className="text-lg font-semibold text-heading">
                  Are you covered enough?
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <AdequacyCard
                    testid="adequacy-life"
                    title="Death and TPD"
                    benchmark={`${DEATH_TPD_MULTIPLE}x annual income`}
                    adq={lifeAdq}
                  />
                  <AdequacyCard
                    testid="adequacy-ci"
                    title="Critical illness"
                    benchmark={`${CI_MULTIPLE}x annual income`}
                    adq={ciAdq}
                  />
                </div>
              </section>

              <section
                data-testid="premium-panel"
                className="rounded-2xl border border-border bg-card p-6 shadow-card"
              >
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-heading">Premiums</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Total annual premium
                    </p>
                    <p className="font-display text-2xl font-bold text-heading">
                      {sgd(premium)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Share of income</p>
                    <p
                      className={`font-display text-2xl font-bold ${premiumShare.overGuideline ? "text-warn" : "text-ok"}`}
                    >
                      {income > 0 ? (premiumShare.pct * 100).toFixed(1) + "%" : "n/a"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface">
                  <div
                    className={`h-full rounded-full ${premiumShare.overGuideline ? "bg-warn" : "bg-ok"}`}
                    style={{ width: `${Math.min(100, premiumShare.pct * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Guideline: protection premiums within about 15% of take-home pay.
                </p>
              </section>
            </>
          )}
        </div>
      </div>

      {hasPolicies ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-heading">Your policies</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface font-mono text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Insurer</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Sum assured</th>
                  <th className="px-4 py-3 font-medium">Annual premium</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr
                    key={p.id}
                    data-testid="policy-row"
                    className="border-t border-border"
                  >
                    <td className="px-4 py-3 text-foreground">
                      {p.insurer}
                      {p.name ? (
                        <span className="text-muted-foreground"> ({p.name})</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {CATEGORY_LABELS[p.category]}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {sgd(p.sumAssured)}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {sgd(p.annualPremium)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removePolicy(p.id)}
                        aria-label={`Remove ${p.insurer} ${CATEGORY_LABELS[p.category]} policy`}
                        className="rounded-md px-2 py-1 font-medium text-danger hover:bg-danger-soft"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-xs uppercase tracking-wider text-white/70">
        {label}
      </span>
      <span className="font-display text-2xl font-bold text-white sm:text-3xl">
        {value}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-heading">
      {label}
      {children}
    </label>
  );
}

function AdequacyCard({
  testid,
  title,
  benchmark,
  adq,
}: {
  testid: string;
  title: string;
  benchmark: string;
  adq: Adequacy;
}) {
  const pct = Math.min(1, Math.max(0, adq.pct));
  const r = 42;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  return (
    <div
      data-testid={testid}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card"
    >
      <div className="flex items-center gap-4">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-surface)" strokeWidth="11" />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={STATUS_STROKE[adq.status]}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-xl font-bold text-heading">
              {Math.round(pct * 100)}%
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-heading">{title}</h3>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {benchmark}
          </p>
          <span
            className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[adq.status]}`}
          >
            {STATUS_LABEL[adq.status]}
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Covered</dt>
          <dd className="font-semibold text-heading">{sgd(adq.covered)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Target</dt>
          <dd className="font-semibold text-heading">{sgd(adq.target)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Gap</dt>
          <dd className={`font-semibold ${adq.gap > 0 ? "text-danger" : "text-ok"}`}>
            {adq.gap > 0 ? sgd(adq.gap) : "None"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
