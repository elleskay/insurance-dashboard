"use client";

import { useEffect, useState } from "react";
import { PdfUpload } from "@/components/PdfUpload";
import {
  CATEGORY_LABELS,
  CHECK_LABELS,
  type CheckItem,
  type CheckSeverity,
  type Payout,
  type PolicyCheck,
  type PolicyCheckData,
} from "@/lib/insure/types";
import {
  EXAMPLE_BILL,
  SEVERITY_RANK,
  computePayout,
  topCatch,
} from "@/lib/insure/checker";
import { SAMPLE_CHECKS } from "@/lib/insure/sample";

const STORAGE_KEY = "insure.checks.v1";

function sgd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return "c" + Date.now() + Math.round(Math.random() * 1e6);
}

const SEVERITY: Record<
  CheckSeverity,
  { dot: string; pill: string; label: string }
> = {
  caution: { dot: "#b91c1c", pill: "bg-danger-soft text-danger", label: "Caution" },
  watch: { dot: "#b45309", pill: "bg-warn-soft text-warn", label: "Watch" },
  info: { dot: "#047857", pill: "bg-ok-soft text-ok", label: "Note" },
};

export function PolicyChecker() {
  const [checks, setChecks] = useState<PolicyCheck[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { checks?: PolicyCheck[] };
        if (Array.isArray(parsed.checks)) setChecks(parsed.checks);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ checks }));
    } catch {
      /* ignore */
    }
  }, [checks]);

  function addChecked(policies: PolicyCheckData[]) {
    const added: PolicyCheck[] = policies.map((p) => ({ ...p, id: newId() }));
    setChecks((c) => [...c, ...added]);
  }

  function loadSample() {
    const added: PolicyCheck[] = SAMPLE_CHECKS.map((p) => ({
      ...p,
      id: newId(),
      sample: true,
    }));
    setChecks((c) => [...c, ...added]);
  }

  function removeCheck(id: string) {
    setChecks((c) => c.filter((x) => x.id !== id));
  }

  const hasChecks = checks.length > 0;
  const watchOuts = checks.reduce(
    (n, c) => n + c.checklist.filter((i) => i.status === "found").length,
    0,
  );

  const statusChip = !hasChecks
    ? { label: "No policy checked yet", dot: "#94a3b8" }
    : watchOuts > 0
      ? { label: `${watchOuts} watch-out${watchOuts > 1 ? "s" : ""} found`, dot: "#b45309" }
      : { label: "No fine print flagged", dot: "#047857" };

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="relative flex flex-col gap-7 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Insurance policy checker, Singapore
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-foreground backdrop-blur">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: statusChip.dot }}
            />
            {statusChip.label}
          </span>
        </div>
        <h1 className="max-w-[20ch] text-4xl font-semibold tracking-tight sm:text-6xl">
          <span className="block text-heading">Know what your policy</span>
          <span className="block text-gradient">actually covers.</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Upload a policy PDF and we read it for you: a plain-language summary of
          what you are getting, and the fine print to watch for. Every watch-out
          is backed by a quote from your own document.
        </p>
      </section>

      {/* Upload (always the primary action) */}
      <section className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <PdfUpload onChecked={addChecked} />
      </section>

      {!hasChecks ? (
        <section
          data-testid="empty-state"
          className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-card/80 p-10 text-center backdrop-blur"
        >
          <h2 className="text-lg font-semibold text-heading">
            Your policy breakdown appears here
          </h2>
          <p className="max-w-md text-muted-foreground">
            Upload a policy PDF above and we will explain what it covers and flag
            the fine print, with the exact wording from your document.
          </p>
          <button
            type="button"
            data-testid="load-sample"
            onClick={loadSample}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/5"
          >
            No document handy? See a sample report
          </button>
        </section>
      ) : (
        <section className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-heading">
                Your policies
              </h2>
              <p className="text-sm text-muted-foreground">
                {checks.length} polic{checks.length > 1 ? "ies" : "y"} read from
                your documents.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChecks([])}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-danger hover:text-danger"
            >
              Clear all
            </button>
          </div>

          {checks.map((c) => (
            <PolicyCard key={c.id} check={c} onRemove={() => removeCheck(c.id)} />
          ))}
        </section>
      )}
    </div>
  );
}

function PolicyCard({
  check,
  onRemove,
}: {
  check: PolicyCheck;
  onRemove: () => void;
}) {
  const top = topCatch(check.checklist);
  // Show found watch-outs first, most serious at the top; not-stated after.
  const ordered = [...check.checklist].sort((a, b) => {
    const af = a.status === "found" ? 1 : 0;
    const bf = b.status === "found" ? 1 : 0;
    if (af !== bf) return bf - af;
    if (af === 1) return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    return 0;
  });

  return (
    <article
      data-testid="policy-check"
      className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-6 shadow-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-heading">{check.name}</h3>
            <span className="rounded-full bg-surface px-2.5 py-0.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABELS[check.category]}
            </span>
            {check.sample ? (
              <span
                data-testid="sample-badge"
                className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
              >
                Sample
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{check.insurer}</p>
        </div>
        <div className="flex items-center gap-4">
          {check.benefitAmount !== undefined ? (
            <div className="text-right">
              <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Benefit
              </p>
              <p className="text-base font-bold text-heading">
                {sgd(check.benefitAmount)}
              </p>
            </div>
          ) : null}
          {check.premium !== undefined ? (
            <div className="text-right">
              <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Premium / yr
              </p>
              <p className="text-base font-bold text-heading">
                {sgd(check.premium)}
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${check.name}`}
            className="rounded-md px-2 py-1 text-sm font-medium text-danger hover:bg-danger-soft"
          >
            Remove
          </button>
        </div>
      </header>

      {check.needsReview ? (
        <div
          data-testid="check-review"
          className="flex items-start gap-2 rounded-2xl border border-warn/30 bg-warn-soft p-3 text-sm text-warn"
        >
          <span aria-hidden="true">!</span>
          <span>
            Some details could not be matched to wording in your document and
            were set aside. Confirm anything important against the policy itself.
          </span>
        </div>
      ) : null}

      {/* What you are getting */}
      <div>
        <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          What you are getting
        </h4>
        <p data-testid="check-summary" className="mt-1.5 text-sm text-foreground">
          {check.summary}
        </p>
        {check.premiumNote ? (
          <p className="mt-1.5 text-sm text-warn">Premium note: {check.premiumNote}</p>
        ) : null}
      </div>

      {/* The single headline catch */}
      {top ? (
        <div
          data-testid="top-catch"
          className="rounded-2xl border border-border bg-surface/70 p-4"
        >
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Most important catch
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: SEVERITY[top.severity].dot }}
            />
            <span className="font-semibold text-heading">
              {CHECK_LABELS[top.key]}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SEVERITY[top.severity].pill}`}
            >
              {SEVERITY[top.severity].label}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{top.detail}</p>
        </div>
      ) : null}

      {/* Will a claim pay out? Grounded deductible / co-pay worked example. */}
      {check.payout?.deductible !== undefined ? (
        <PayoutExplainer payout={check.payout} />
      ) : null}

      {/* What to watch for */}
      <div>
        <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          What to watch for
        </h4>
        <ul data-testid="checklist" className="mt-2 grid grid-cols-1 gap-2.5">
          {ordered.map((item) => (
            <ChecklistRow key={item.key} item={item} />
          ))}
        </ul>
      </div>
    </article>
  );
}

function PayoutExplainer({ payout }: { payout: Payout }) {
  const deductible = payout.deductible ?? 0;
  const split = computePayout(
    EXAMPLE_BILL,
    deductible,
    payout.coPayPercent ?? 0,
    payout.coPayCap ?? 0,
  );
  return (
    <div
      data-testid="payout-explainer"
      className="rounded-2xl border border-border bg-surface/70 p-4"
    >
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Will a claim pay out?
      </p>
      <p className="mt-1.5 text-sm text-foreground">
        Bills at or below{" "}
        <span className="font-semibold text-heading">{sgd(deductible)}</span> (your
        deductible) are fully self-paid. This is the most common reason a claim
        does not pay.
        {payout.coPayPercent !== undefined ? (
          <>
            {" "}
            Above that you also pay {payout.coPayPercent}% co-payment
            {payout.coPayCap !== undefined ? `, capped at ${sgd(payout.coPayCap)} a year` : ""}.
          </>
        ) : null}
      </p>
      <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-xl bg-card p-3 text-sm">
        <div>
          <p className="text-muted-foreground">A {sgd(EXAMPLE_BILL)} bill</p>
          <p className="font-semibold text-heading">{sgd(split.bill)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">You pay</p>
          <p className="font-semibold text-danger">{sgd(split.selfPaid)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Policy pays</p>
          <p className="font-semibold text-ok">{sgd(split.insurerPaid)}</p>
        </div>
      </div>
    </div>
  );
}

function ChecklistRow({ item }: { item: CheckItem }) {
  const found = item.status === "found";
  const sev = SEVERITY[item.severity];

  return (
    <li
      data-testid="checklist-item"
      data-key={item.key}
      data-status={item.status}
      className={`rounded-2xl border p-3.5 ${
        found ? "border-border bg-surface/60" : "border-dashed border-border bg-card/40"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {found ? (
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: sev.dot }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
          />
        )}
        <span
          className={`flex-1 text-sm font-medium ${found ? "text-heading" : "text-muted-foreground"}`}
        >
          {CHECK_LABELS[item.key]}
        </span>
        {found ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${sev.pill}`}
          >
            {sev.label}
          </span>
        ) : (
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Not stated
          </span>
        )}
      </div>

      {found ? (
        <>
          <p className="mt-1.5 text-sm text-muted-foreground">{item.detail}</p>
          {item.quote ? (
            <details data-testid="check-quote" className="mt-2 text-sm">
              <summary className="cursor-pointer font-medium text-primary">
                Show the wording from your document
              </summary>
              <blockquote className="mt-1.5 border-l-2 border-primary/40 pl-3 text-muted-foreground">
                {item.quote}
              </blockquote>
            </details>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
