import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Aurora } from "@/components/Aurora";
import { meta } from "@/lib/insure/meta";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CoverLens SG: insurance policy checker",
  description:
    "Upload a Singapore insurance policy PDF and get a plain-language summary of what you are covered for, plus the fine print to watch for, each backed by a quote from your own document.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="relative min-h-full overflow-x-hidden">
        <Aurora />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-30 border-b border-border/70 bg-page/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-5 py-3.5">
            <span
              aria-hidden="true"
              className="btn-gradient grid h-9 w-9 place-items-center rounded-xl text-white shadow-card"
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
            <span className="text-lg font-bold text-heading">CoverLens SG</span>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-6xl px-5 py-8">
          {children}
        </main>

        <footer className="mt-8 border-t border-border bg-page/70 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-5 py-6 text-sm text-muted-foreground">
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
