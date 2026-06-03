"use client";

import { useEffect, useRef, useState } from "react";
import type { PolicyCheckData } from "@/lib/insure/types";

export interface CheckResponse {
  policies: PolicyCheckData[];
  needsReview: boolean;
}

// Rough seconds the checker takes per document, used only to drive the
// progress estimate. The real call is a multi-pass grounded LLM extraction.
const SECONDS_PER_DOC = 30;
const REQUEST_TIMEOUT_MS = 75_000;

const STAGES = [
  "Reading the document text in your browser...",
  "Working out what you are covered for...",
  "Checking how the policy defines its key terms...",
  "Flagging the fine print to watch for...",
  "Almost done, putting it together...",
];

async function readPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdfjs = await import("pdfjs-dist");
  // The worker is bundled with the app (emitted as a /_next/static asset and
  // served from our own origin), so the PDF is read in memory in the browser.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text +=
      content.items
        .map((it) => ("str" in it ? (it as { str: string }).str : ""))
        .join(" ") + " ";
  }
  return text;
}

async function checkViaApi(text: string): Promise<PolicyCheckData[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 60_000) }),
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      controller.signal.aborted
        ? "it took too long to read. Try a smaller or simpler PDF."
        : "we could not reach the checker. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    if (res.status === 503) throw new Error("the checker is not configured on this deployment.");
    if (res.status === 429) throw new Error("too many requests right now. Wait a moment and try again.");
    if (res.status === 502 || res.status === 504)
      throw new Error("the document took too long to read. Try a smaller or simpler PDF.");
    throw new Error("we could not read this document. Try a different PDF.");
  }
  const data = (await res.json()) as Partial<CheckResponse>;
  return Array.isArray(data.policies) ? data.policies : [];
}

export function PdfUpload({
  onChecked,
}: {
  onChecked: (policies: PolicyCheckData[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [stage, setStage] = useState(0);
  const [estimate, setEstimate] = useState(SECONDS_PER_DOC);
  const inputRef = useRef<HTMLInputElement>(null);

  // While a check runs, tick the elapsed timer and advance the stage label.
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      setStage(0);
      return;
    }
    const start = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    const advance = setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES.length - 1)),
      5_000,
    );
    return () => {
      clearInterval(tick);
      clearInterval(advance);
    };
  }, [busy]);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(
      (f) => /pdf$/i.test(f.name) || f.type === "application/pdf",
    );
    if (list.length === 0) return;
    setStatus("");
    setProblems([]);
    setEstimate(Math.max(20, SECONDS_PER_DOC * list.length));
    setBusy(true);

    const checked: PolicyCheckData[] = [];
    const found: string[] = [];
    for (const file of list) {
      try {
        const text = await readPdfText(file);
        if (text.replace(/\s+/g, "").length < 80) {
          found.push(`${file.name}: no readable text found (it may be a scanned image). Try a text-based PDF.`);
          continue;
        }
        const policies = await checkViaApi(text);
        if (policies.length === 0) {
          found.push(`${file.name}: we could not find a policy in this document.`);
          continue;
        }
        checked.push(...policies);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "we could not read this document.";
        found.push(`${file.name}: ${msg}`);
      }
    }

    if (checked.length > 0) onChecked(checked);
    setStatus(
      checked.length > 0
        ? `Checked ${checked.length} polic${checked.length > 1 ? "ies" : "y"}.`
        : "",
    );
    setProblems(found);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const remaining = Math.max(0, estimate - elapsed);
  const progress = Math.min(92, Math.round((elapsed / estimate) * 100));

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="pdf-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
        className={`group flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-surface/50 hover:border-primary/60"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <span
          aria-hidden="true"
          className="btn-gradient grid h-12 w-12 place-items-center rounded-2xl text-white shadow-card"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M5 16v2a2 2 0 002 2h10a2 2 0 002-2v-2" />
          </svg>
        </span>
        <span className="text-base font-semibold text-heading">
          {busy ? "Reading your documents..." : "Drop your policy PDFs here"}
        </span>
        <span className="text-sm text-muted-foreground">
          or click to choose files. The checker reads each one and explains it in
          plain language.
        </span>
        <input
          id="pdf-input"
          ref={inputRef}
          data-testid="pdf-input"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={busy}
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
          }}
          className="sr-only"
        />
      </label>

      {busy ? (
        <div
          data-testid="check-progress"
          role="status"
          aria-live="polite"
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-card"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium text-heading">
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
              />
              {STAGES[stage]}
            </span>
            <span data-testid="check-eta" className="shrink-0 font-mono text-xs text-muted-foreground">
              {elapsed}s elapsed
              {remaining > 0 ? ` - about ${remaining}s left` : " - almost done"}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      <p data-testid="privacy-note" className="text-sm text-muted-foreground">
        The text from your document is read in your browser and then sent to an
        AI service to read your policy and surface the fine print. We do not
        store your documents. Avoid uploading anything you are not comfortable
        sharing with an AI service.
      </p>

      {status ? (
        <p role="status" className="text-sm font-medium text-primary">
          {status}
        </p>
      ) : null}

      {problems.length > 0 ? (
        <ul
          data-testid="upload-problems"
          className="flex flex-col gap-1 rounded-2xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
        >
          {problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
