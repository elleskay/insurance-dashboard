"use client";

import { useRef, useState } from "react";
import { extractPolicyFromText } from "@/lib/insure/extractor";
import type { ExtractedPolicy } from "@/lib/insure/types";

export interface ParsedUpload {
  fileName: string;
  extracted: ExtractedPolicy;
  /** Fields we could not read with confidence (need a human glance). */
  missing: ("category" | "sumAssured" | "annualPremium")[];
}

async function readPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdfjs = await import("pdfjs-dist");
  // The worker is bundled with the app (emitted as a /_next/static asset and
  // served from our own origin), so the PDF is read in memory and never leaves
  // the browser.
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

export function PdfUpload({
  onParsed,
}: {
  onParsed: (results: ParsedUpload[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => /pdf$/i.test(f.name) || f.type === "application/pdf");
    if (list.length === 0) return;
    setBusy(true);
    setStatus(`Reading ${list.length} document${list.length > 1 ? "s" : ""} in your browser...`);
    const results: ParsedUpload[] = [];
    let failed = 0;
    for (const file of list) {
      try {
        const text = await readPdfText(file);
        const extracted = extractPolicyFromText(text);
        const missing: ParsedUpload["missing"] = [];
        if (extracted.category === undefined) missing.push("category");
        if (extracted.sumAssured === undefined) missing.push("sumAssured");
        if (extracted.annualPremium === undefined) missing.push("annualPremium");
        results.push({ fileName: file.name, extracted, missing });
      } catch {
        failed += 1;
      }
    }
    if (results.length > 0) onParsed(results);
    const added = results.length;
    const needs = results.filter((r) => r.missing.length > 0).length;
    const parts: string[] = [];
    if (added > 0) parts.push(`Added ${added} polic${added > 1 ? "ies" : "y"} to your dashboard.`);
    if (needs > 0) parts.push(`${needs} need${needs > 1 ? "" : "s"} a quick check below.`);
    if (failed > 0) parts.push(`${failed} could not be read; add ${failed > 1 ? "those" : "it"} by hand below.`);
    setStatus(parts.join(" ") || "Nothing to read in that file.");
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

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
          dragging ? "border-primary bg-primary/5" : "border-border bg-surface/50 hover:border-primary/60"
        }`}
      >
        <span aria-hidden="true" className="btn-gradient grid h-12 w-12 place-items-center rounded-2xl text-white shadow-card">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M5 16v2a2 2 0 002 2h10a2 2 0 002-2v-2" />
          </svg>
        </span>
        <span className="text-base font-semibold text-heading">
          {busy ? "Reading your documents..." : "Drop your policy PDFs here"}
        </span>
        <span className="text-sm text-muted-foreground">
          or click to choose files. We read them and build your summary automatically.
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
      <p data-testid="privacy-note" className="text-sm text-muted-foreground">
        Your documents are read entirely in your browser and are never uploaded
        to any server. We pull out the figures so you do not have to type them.
      </p>
      {status ? (
        <p role="status" className="text-sm font-medium text-primary">
          {status}
        </p>
      ) : null}
    </div>
  );
}
