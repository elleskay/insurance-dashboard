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

  // Load from this browser only (nothing is sent anywhere).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { policies?: Policy[]; income?: number };
        if (Array.isArray(parsed.policies)) setPolicies(parsed.policies);
        if (typeof parsed.income === "number") setIncome(parsed.income);
      }
    } catch {
      // ignore corrupt local state
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ policies, income }));
    } catch {
      // ignore quota/availability errors
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
  const lifeAdq = adequacy(income, coverageFor(policies, "life"), DEATH_TPD_MULTIPLE);
  const ciAdq = adequacy(
    income,
    coverageFor(policies, "critical-illness"),
    CI_MULTIPLE,
  );
  const premium = totalAnnualPremium(policies);
  const premiumShare = premiumShareOfIncome(premium, income);
  const hasPolicies = policies.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-heading">
          Your insurance coverage at a glance
        </h1>
        <p className="max-w-prose text-muted-foreground">
          Upload your policy PDFs or add them by hand, then see your coverage by
          category and how it compares to common rules of thumb. Everything stays
          in your browser.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Inputs */}
        <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-card">
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
              className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <p className="text-sm text-muted-foreground">
              Used to compare your cover against the benchmarks. Not stored
              anywhere but this browser.
            </p>
          </div>

          <hr className="border-border" />

          <PdfUpload onPrefill={prefill} />

          <form onSubmit={addPolicy} className="flex flex-col gap-3">
            <h2 className="font-semibold text-heading">Add or review a policy</h2>
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
                  onChange={(e) =>
                    setDraft({ ...draft, sumAssured: e.target.value })
                  }
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
              className="w-fit rounded-lg bg-primary px-5 py-2.5 font-semibold text-on-primary transition-colors hover:bg-primary-strong"
            >
              Add policy
            </button>
          </form>
        </section>

        {/* Coverage + adequacy */}
        <div className="flex flex-col gap-6">
          {!hasPolicies ? (
            <section
              data-testid="empty-state"
              className="flex h-full flex-col justify-center gap-2 rounded-2xl border border-dashed border-border bg-card p-8 text-center"
            >
              <h2 className="text-lg font-semibold text-heading">
                No policies yet
              </h2>
              <p className="text-muted-foreground">
                Upload a policy PDF or add one by hand on the left. Your coverage
                summary and adequacy check will appear here.
              </p>
            </section>
          ) : (
            <>
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-heading">
                  Coverage by category
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {CATEGORIES.map((c) => (
                    <div
                      key={c}
                      data-testid="category-card"
                      className="rounded-2xl border border-border bg-card p-4 shadow-card"
                    >
                      <p className="text-sm text-muted-foreground">
                        {CATEGORY_LABELS[c]}
                      </p>
                      <p className="mt-1 text-xl font-bold text-heading">
                        {c === "hospitalisation" && totals[c] === 0
                          ? "As charged"
                          : sgd(totals[c])}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-3" data-testid="adequacy">
                <h2 className="text-lg font-semibold text-heading">
                  Are you covered enough?
                </h2>
                <AdequacyCard
                  testid="adequacy-life"
                  title="Death and total permanent disability"
                  benchmark={`Benchmark: ${DEATH_TPD_MULTIPLE}x annual income`}
                  adq={lifeAdq}
                />
                <AdequacyCard
                  testid="adequacy-ci"
                  title="Critical illness"
                  benchmark={`Benchmark: ${CI_MULTIPLE}x annual income`}
                  adq={ciAdq}
                />
              </section>

              <section
                data-testid="premium-panel"
                className="rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <h2 className="text-lg font-semibold text-heading">Premiums</h2>
                <p className="mt-1 text-foreground">
                  Total annual premium:{" "}
                  <span className="font-bold">{sgd(premium)}</span>
                </p>
                <p className="text-foreground">
                  Share of income:{" "}
                  <span
                    className={`font-bold ${premiumShare.overGuideline ? "text-warn" : "text-ok"}`}
                  >
                    {income > 0 ? (premiumShare.pct * 100).toFixed(1) + "%" : "n/a"}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Guideline: protection premiums within about 15% of take-home
                  pay.
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
              <thead className="bg-surface text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Insurer</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Sum assured</th>
                  <th className="px-4 py-3 font-semibold">Annual premium</th>
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
                    <td className="px-4 py-3 text-foreground">{sgd(p.sumAssured)}</td>
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
  adq: ReturnType<typeof adequacy>;
}) {
  const pct = Math.min(100, Math.round(adq.pct * 100));
  return (
    <div
      data-testid={testid}
      className="rounded-2xl border border-border bg-card p-4 shadow-card"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-heading">{title}</h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[adq.status]}`}
        >
          {STATUS_LABEL[adq.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{benchmark}</p>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
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
          <dd
            className={`font-semibold ${adq.gap > 0 ? "text-danger" : "text-ok"}`}
          >
            {adq.gap > 0 ? sgd(adq.gap) : "None"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
