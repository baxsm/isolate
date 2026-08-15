import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "isolate",
  description:
    "Compose two concurrent transactions, step through them, and watch the anomaly your isolation level allows.",
};

const links = [
  { href: "/", label: "Article" },
  { href: "/compose", label: "Compose" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/matrix", label: "Matrix" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // light is the design target, so it is set rather than left to the OS preference
    <html lang="en" data-theme="light">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-[var(--color-card)] focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <header className="border-[var(--color-line)] border-b">
          <nav
            aria-label="Main"
            className="mx-auto flex max-w-[1200px] items-center gap-6 px-6 py-3"
          >
            <Link href="/" className="font-medium font-mono text-[var(--color-ink)] text-sm">
              isolate
            </Link>
            <ul className="flex items-center gap-4">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[var(--color-ink-soft)] text-sm transition-colors hover:text-[var(--color-ink)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
