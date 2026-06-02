"use client";

import { useEffect, useState } from "react";
import { PdfUpload, type ParsedUpload } from "@/components/PdfUpload";
import { TiltCard } from "@/components/TiltCard";
import { Advisor } from "@/components/Advisor";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
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

const CATEGORY_COLOR: Record<Category, string> = {
  hospitalisation: "#0ea5e9",
  life: "#7c3aed",
  "critical-illness": "#f43f5e",
  "disability-income": "#10b981",
  "personal-accident": "#f59e0b",
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "p" + Date.now() + Math.round(Math.random() * 1e6);
}

interface StoredPolicy extends Policy {
  needsReview?: boolean;
}

export function Dashboard() {
  const [policies, setPolicies] = useState<StoredPolicy[]>([]);
  const [income, setIncome] = useState<number>(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { policies?: StoredPolicy[]; income?: number };
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

  function addParsed(results: ParsedUpload[]) {
    const added: StoredPolicy[] = results.map((r) => ({
      id: newId(),
      insurer: r.extracted.insurer ?? "Unknown insurer",
      name: r.extracted.name ?? r.fileName.replace(/\.pdf$/i, ""),
      category: r.extracted.category ?? "life",
      sumAssured: r.extracted.sumAssured ?? 0,
      annualPremium: r.extracted.annualPremium ?? 0,
      needsReview: r.missing.length > 0,
    }));
    setPolicies((p) => [...p, ...added]);
  }

  function addManual() {
    setPolicies((p) => [
      ...p,
      {
        id: newId(),
        insurer: "",
        name: "",
        category: "life",
        sumAssured: 0,
        annualPremium: 0,
        needsReview: true,
      },
    ]);
  }

  function updatePolicy(id: string, patch: Partial<StoredPolicy>) {
    setPolicies((p) =>
      p.map((x) => (x.id === id ? { ...x, ...patch, needsReview: false } : x)),
    );
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
        ? { label: "Gaps to close", dot: "#e11d48" }
        : lifeAdq.status === "partial" || ciAdq.status === "partial"
          ? { label: "Review recommended", dot: "#b45309" }
          : { label: "Well protected", dot: "#047857" };

  const donutSegments = CATEGORIES.filter((c) => totals[c] > 0).map((c) => ({
    label: CATEGORY_LABELS[c],
    value: totals[c],
    color: CATEGORY_COLOR[c],
  }));

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="relative flex flex-col gap-7 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Insurance coverage overview, Singapore
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-foreground backdrop-blur">
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: overall.dot }} />
            {overall.label}
          </span>
        </div>
        <h1 className="max-w-[20ch] text-4xl font-semibold tracking-tight sm:text-6xl">
          <span className="block text-heading">Your protection,</span>
          <span className="block text-gradient">in focus.</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Upload your policy documents and we build the summary for you: coverage
          by category, total premiums, and where your protection may fall short.
          Nothing to type, nothing leaves your browser.
        </p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiTile label="Total cover" value={sgd(totalCover)} sub={`across ${policies.length} ${policies.length === 1 ? "policy" : "policies"}`} />
          <KpiTile
            label="Annual premium"
            value={sgd(premium)}
            sub={income > 0 ? `${(premiumShare.pct * 100).toFixed(1)}% of income` : "add income"}
            subClass={income > 0 ? (premiumShare.overGuideline ? "text-warn" : "text-ok") : "text-muted-foreground"}
          />
          <KpiTile
            label="Death / TPD gap"
            value={income > 0 ? (lifeAdq.gap > 0 ? sgd(lifeAdq.gap) : "Covered") : "n/a"}
            sub={income > 0 ? "vs 9x income" : "set income"}
            subClass={income > 0 ? (lifeAdq.gap > 0 ? "text-danger" : "text-ok") : "text-muted-foreground"}
          />
          <KpiTile
            label="Critical illness gap"
            value={income > 0 ? (ciAdq.gap > 0 ? sgd(ciAdq.gap) : "Covered") : "n/a"}
            sub={income > 0 ? "vs 4x income" : "set income"}
            subClass={income > 0 ? (ciAdq.gap > 0 ? "text-danger" : "text-ok") : "text-muted-foreground"}
          />
        </div>
      </section>

      {/* Upload (always the primary action) */}
      <section className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <PdfUpload onParsed={addParsed} />
      </section>

      {!hasPolicies ? (
        <section
          data-testid="empty-state"
          className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-card/80 p-10 text-center backdrop-blur"
        >
          <h2 className="text-lg font-semibold text-heading">Your summary appears here</h2>
          <p className="max-w-md text-muted-foreground">
            Upload a policy PDF above and your coverage, premiums and protection
            gaps fill in automatically. No document handy?{" "}
            <button
              type="button"
              data-testid="add-manual"
              onClick={addManual}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Add a policy by hand
            </button>
            .
          </p>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-6 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-heading">Coverage by category</h2>
                  <p className="text-sm text-muted-foreground">{sgd(totalCover)} total cover</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
                <Donut segments={donutSegments} total={totalCover} />
                <div className="grid grid-cols-1 gap-2.5">
                  {CATEGORIES.map((c) => (
                    <TiltCard
                      key={c}
                      testid="category-card"
                      max={3}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5"
                    >
                      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[c] }} />
                      <span className="flex-1 text-sm text-foreground">{CATEGORY_LABELS[c]}</span>
                      <span className="text-base font-bold text-heading">
                        {c === "hospitalisation" && totals[c] === 0 ? "As charged" : sgd(totals[c])}
                      </span>
                    </TiltCard>
                  ))}
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-4" data-testid="adequacy">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-heading">Are you covered enough?</h2>
                <label className="flex items-center gap-2 text-sm font-medium text-heading">
                  <span className="whitespace-nowrap">Your annual income (SGD)</span>
                  <input
                    id="income"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={income === 0 ? "" : income}
                    onChange={(e) => setIncome(Number(e.target.value) || 0)}
                    placeholder="optional"
                    className="field-input w-32"
                  />
                </label>
              </div>
              {income > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <AdequacyCard testid="adequacy-life" title="Death and TPD" benchmark={`${DEATH_TPD_MULTIPLE}x annual income`} adq={lifeAdq} />
                  <AdequacyCard testid="adequacy-ci" title="Critical illness" benchmark={`${CI_MULTIPLE}x annual income`} adq={ciAdq} />
                </div>
              ) : (
                <p
                  data-testid="adequacy-hint"
                  className="rounded-2xl border border-dashed border-border bg-card/80 p-5 text-sm text-muted-foreground"
                >
                  Add your annual income above to see how your death/TPD and
                  critical-illness cover compare with the LIA and MoneySense rules
                  of thumb (9x income for death and TPD, 4x for critical illness).
                </p>
              )}

              <TiltCard testid="premium-panel" max={3} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-heading">Premiums</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Total annual premium</p>
                    <p className="text-2xl font-bold text-heading">{sgd(premium)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Share of income</p>
                    <p className={`text-2xl font-bold ${premiumShare.overGuideline ? "text-warn" : "text-ok"}`}>
                      {income > 0 ? (premiumShare.pct * 100).toFixed(1) + "%" : "n/a"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface">
                  <div className={`h-full rounded-full ${premiumShare.overGuideline ? "bg-warn" : "bg-ok"}`} style={{ width: `${Math.min(100, premiumShare.pct * 100)}%` }} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Guideline: protection premiums within about 15% of take-home pay.
                </p>
              </TiltCard>
            </section>
          </div>

          {/* AI adequacy advisor (grounded, self-correcting LangGraph graph) */}
          <Advisor policies={policies} income={income} />

          {/* Editable policy list */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-heading">Your policies</h2>
                <p className="text-sm text-muted-foreground">
                  Pulled from your documents. Anything we misread, fix it inline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPolicies([]);
                  setIncome(0);
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-danger hover:text-danger"
              >
                Clear all
              </button>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-border bg-card shadow-card">
              <table className="w-full min-w-[720px] text-left text-sm">
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
                      className={`border-t border-border ${p.needsReview ? "bg-warn-soft/40" : ""}`}
                    >
                      <td className="px-4 py-2.5">
                        <input
                          aria-label="Insurer"
                          type="text"
                          value={p.insurer}
                          placeholder="Insurer"
                          onChange={(e) => updatePolicy(p.id, { insurer: e.target.value })}
                          className="field-input"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          aria-label="Category"
                          value={p.category}
                          onChange={(e) => updatePolicy(p.id, { category: e.target.value as Category })}
                          className="field-input"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          aria-label="Sum assured (SGD)"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={p.sumAssured === 0 ? "" : p.sumAssured}
                          placeholder="0"
                          onChange={(e) => updatePolicy(p.id, { sumAssured: Number(e.target.value) || 0 })}
                          className="field-input w-32"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          aria-label="Annual premium (SGD)"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={p.annualPremium === 0 ? "" : p.annualPremium}
                          placeholder="0"
                          onChange={(e) => updatePolicy(p.id, { annualPremium: Number(e.target.value) || 0 })}
                          className="field-input w-32"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => removePolicy(p.id)}
                          aria-label={`Remove ${p.insurer || "this"} policy`}
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

            <button
              type="button"
              data-testid="add-manual"
              onClick={addManual}
              className="w-fit rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              Add a policy by hand
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  subClass = "text-muted-foreground",
}: {
  label: string;
  value: string;
  sub?: string;
  subClass?: string;
}) {
  return (
    <TiltCard className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-5 shadow-card">
      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold leading-none text-heading sm:text-[1.75rem]">{value}</span>
      {sub ? <span className={`text-xs font-medium ${subClass}`}>{sub}</span> : null}
    </TiltCard>
  );
}

function Donut({
  segments,
  total,
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
}) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative mx-auto h-40 w-40 shrink-0">
      <svg viewBox="0 0 100 100" className="h-40 w-40 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-surface)" strokeWidth="13" />
        {total > 0
          ? segments.map((s) => {
              const len = (s.value / total) * circ;
              const seg = (
                <circle key={s.label} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="13" strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-acc} />
              );
              acc += len;
              return seg;
            })
          : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-heading">{sgd(total)}</span>
        <span className="font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground">total cover</span>
      </div>
    </div>
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
    <TiltCard testid={testid} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-4">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-surface)" strokeWidth="11" />
            <circle cx="50" cy="50" r={r} fill="none" stroke={STATUS_STROKE[adq.status]} strokeWidth="11" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold text-heading">{Math.round(pct * 100)}%</span>
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-heading">{title}</h3>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{benchmark}</p>
          <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[adq.status]}`}>
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
          <dd className={`font-semibold ${adq.gap > 0 ? "text-danger" : "text-ok"}`}>{adq.gap > 0 ? sgd(adq.gap) : "None"}</dd>
        </div>
      </dl>
    </TiltCard>
  );
}
