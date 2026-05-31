import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { meta } from "@/lib/insure/meta";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Insurance coverage dashboard, Singapore",
  description:
    "Upload your insurance policy PDFs (read in your browser, never uploaded) and see your coverage by category with adequacy gaps against the LIA and MoneySense benchmarks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plex.variable} h-full antialiased`}>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
        >
          Skip to content
        </a>

        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-5 py-4">
            <span
              aria-hidden="true"
              className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-on-primary"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </span>
            <span className="text-lg font-bold text-heading">
              Insurance Coverage, Singapore
            </span>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-5xl px-5 py-8">
          {children}
        </main>

        <footer className="mt-8 border-t border-border bg-card">
          <div className="mx-auto max-w-5xl px-5 py-6 text-sm text-muted-foreground">
            <p data-testid="disclaimer">{meta.disclaimer}</p>
            <p data-testid="reviewed" className="mt-2">
              Last reviewed: {meta.lastReviewed}.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
