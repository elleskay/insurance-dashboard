"use client";

import { useState } from "react";
import type { Policy } from "@/lib/insure/types";
import type { AdviceResult } from "@/lib/insure/advisor";

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-danger-soft text-danger",
  medium: "bg-warn-soft text-warn",
  low: "bg-ok-soft text-ok",
};
const SEVERITY_LABEL: Record<string, string> = {
  high: "Priority",
  medium: "Worth doing",
  low: "Nice to have",
};

function sgd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function Advisor({
  policies,
  income,
}: {
  policies: Policy[];
  income: number;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdviceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canAdvise = policies.length > 0 && income > 0;

  async function getAdvice() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/advise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policies, income }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not generate advice.");
        setResult(null);
        return;
      }
      setResult((await res.json()) as AdviceResult);
    } catch {
      setError("Could not reach the advisor.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      data-testid="advisor-panel"
      className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-heading">
            Personalised next steps
          </h2>
          <p className="text-sm text-muted-foreground">
            Suggestions are grounded in the gaps computed above. Each cited figure
            is checked against your own numbers before it is shown.
          </p>
        </div>
        <button
          type="button"
          data-testid="get-advice"
          onClick={getAdvice}
          disabled={!canAdvise || loading}
          className="rounded-lg bg-primary-strong px-4 py-2 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Thinking..." : "Get advice"}
        </button>
      </div>

      {!canAdvise ? (
        <p
          data-testid="advice-hint"
          className="rounded-2xl border border-dashed border-border bg-card/80 p-4 text-sm text-muted-foreground"
        >
          Add at least one policy and your annual income above, then get tailored
          suggestions for closing your protection gaps.
        </p>
      ) : null}

      {error ? (
        <p
          data-testid="advice-error"
          className="rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-3">
          {result.needsReview ? (
            <div
              data-testid="advice-review"
              className="flex items-start gap-2 rounded-2xl border border-warn/30 bg-warn-soft p-4 text-sm text-warn"
            >
              <span aria-hidden="true">!</span>
              <span>
                Some suggestions were set aside because we could not match them to
                your figures. Confirm anything important with a licensed adviser.
              </span>
            </div>
          ) : null}

          {result.recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing to flag right now. Your benchmarked cover looks on track.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {result.recommendations.map((r) => (
                <li
                  key={r.id}
                  data-testid="advice-item"
                  className="rounded-2xl border border-border bg-surface/60 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[r.severity]}`}
                    >
                      {SEVERITY_LABEL[r.severity]}
                    </span>
                    <h3 className="font-semibold text-heading">{r.title}</h3>
                    {r.citedGap !== undefined ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {sgd(r.citedGap)} gap
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">{r.detail}</p>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            General information, not financial advice. Benchmarks: LIA and
            MoneySense rules of thumb.
          </p>
        </div>
      ) : null}
    </section>
  );
}
