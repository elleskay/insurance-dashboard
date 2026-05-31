// Generates a minimal, valid single-page PDF whose text is recognisable by the
// policy extractor. Run with: node tests/fixtures/make-pdf.mjs
// Committed output: tests/fixtures/sample-policy.pdf
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Keep this text in sync with what the e2e expects to see on the dashboard.
const lines = [
  "AIA Singapore Policy Schedule",
  "Plan: AIA Secure Term Life",
  "This plan pays a death benefit and covers total and permanent disability (TPD).",
  "Life Assured: Jordan Tan",
  "Sum Assured: S$500,000",
  "Annual Premium: S$50 per month",
];

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// Build the content stream: one line per row, moving the text cursor down.
let content = "BT /F1 12 Tf 50 740 Td 16 TL\n";
content += lines.map((l) => `(${esc(l)}) Tj T*`).join("\n");
content += "\nET";

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];

let pdf = "%PDF-1.4\n";
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});

const xrefStart = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (const off of offsets) {
  pdf += String(off).padStart(10, "0") + " 00000 n \n";
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
pdf += `startxref\n${xrefStart}\n%%EOF`;

const out = join(here, "sample-policy.pdf");
writeFileSync(out, pdf, "latin1");
console.log("wrote", out, pdf.length, "bytes");
