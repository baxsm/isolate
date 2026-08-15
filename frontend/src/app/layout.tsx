import type { Metadata } from "next";
import type { ReactNode } from "react";
import SiteNav from "@/components/site-nav";
import ThemeScript from "@/components/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "isolate",
  description:
    "Compose two concurrent transactions, step through them, and watch the anomaly your isolation level allows.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    /*
      No `data-theme` here on purpose. Pinning it to "light" made the whole dark palette
      unreachable: `:root:not([data-theme="light"])` can never match, so 14 measured tokens,
      a second declaration block and the README's dark-mode paragraph all described
      something the running app could not show.

      Absent, the OS preference drives it through the media query, and the attribute stays
      available for anything that wants to force a theme. `ThemeScript` writes it before the
      first paint when the reader has chosen one, and because React never renders it here
      there is no hydration mismatch and nothing to suppress.
    */
    <html lang="en">
      <head>
        <ThemeScript />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-[var(--color-card)] focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        {/*
          Sticky, because the nav is how you move between four routes and scrolling a long
          article or a wide matrix should not take it away. It carries the page ground rather
          than a transparent background, or the content scrolls visibly underneath it.
        */}
        <header className="sticky top-0 z-30 border-[var(--color-line)] border-b bg-[var(--color-ground)]">
          <SiteNav />
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
