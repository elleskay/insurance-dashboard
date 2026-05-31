"use client";

import { useState } from "react";
import { extractPolicyFromText } from "@/lib/insure/extractor";
import type { ExtractedPolicy } from "@/lib/insure/types";

export function PdfUpload({
  onPrefill,
}: {
  onPrefill: (extracted: ExtractedPolicy) => void;
}) {
  const [status, setStatus] = useState("");

  async function handleFile(file: File) {
    setStatus("Reading the document in your browser...");
    try {
      const buf = await file.arrayBuffer();
      const pdfjs = await import("pdfjs-dist");
      // The worker is code, not your data; the PDF itself is never uploaded.
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
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
      const extracted = extractPolicyFromText(text);
      onPrefill(extracted);
      setStatus(
        Object.keys(extracted).length > 0
          ? "We pre-filled what we could find. Please check every field before adding."
          : "We could not read the fields automatically. Please enter them below.",
      );
    } catch {
      setStatus("Could not read that PDF. Please enter the details below.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="pdf-input" className="font-semibold text-heading">
        Upload a policy PDF (optional)
      </label>
      <input
        id="pdf-input"
        data-testid="pdf-input"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
        className="block w-full rounded-lg border border-border bg-white text-sm text-foreground file:mr-4 file:border-0 file:bg-surface file:px-4 file:py-2.5 file:font-medium file:text-primary hover:file:bg-border"
      />
      <p data-testid="privacy-note" className="text-sm text-muted-foreground">
        Your document is read entirely in your browser and is never uploaded to
        any server. We pre-fill the form below; you stay in control and confirm
        every figure.
      </p>
      {status ? (
        <p role="status" className="text-sm font-medium text-primary">
          {status}
        </p>
      ) : null}
    </div>
  );
}
