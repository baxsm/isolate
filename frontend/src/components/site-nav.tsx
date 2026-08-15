"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FC } from "react";
import ThemeToggle from "@/components/theme-toggle";
import { FOCUS, NAV_LINK, NAV_LINK_ACTIVE, NAV_LINK_IDLE } from "@/lib/interaction";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Article" },
  { href: "/compose", label: "Compose" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/matrix", label: "Matrix" },
];

/**
 * The site nav, split out of the layout because the active item needs the pathname and the
 * layout has to stay a server component to export metadata.
 *
 * Active is ink weight plus a rule under the label, drawn with a pseudo element so it spans
 * the word exactly and keeps square ends. Hover draws the same rule at lower strength, so an
 * inactive item answers the pointer in the shape the active one uses.
 */
const SiteNav: FC = () => {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav aria-label="Main" className="mx-auto flex max-w-[1200px] items-center gap-4 px-6 py-3">
      {/*
        The wordmark is the product's name, not a nav item, so it does not answer the
        pointer the way the links do. Fading it on hover made it look like a fifth link
        with a different affordance from the other four.
      */}
      <Link
        href="/"
        className={cn("rounded-xs font-medium font-mono text-[var(--color-ink)] text-sm", FOCUS)}
      >
        isolate
      </Link>
      {/* says where the name stops and the routes start */}
      <span aria-hidden className="h-4 w-px shrink-0 bg-[var(--color-line)]" />
      {/*
        The links scroll rather than shrink. At 375 the four labels plus the wordmark already
        fill the bar, so adding the toggle pushed Matrix underneath it: both measured as
        on-screen while the button painted over the last 28px of the link. Scrolling keeps
        every label at its own width and reachable.
      */}
      <ul className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {links.map((link) => {
          const active = isActive(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(NAV_LINK, active ? NAV_LINK_ACTIVE : NAV_LINK_IDLE)}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* the toggle sits at the far edge, on the same 1200px measure and 24px inset every
          page uses, so it lines up with the content below it rather than the window */}
      <div className="shrink-0">
        <ThemeToggle />
      </div>
    </nav>
  );
};

export default SiteNav;
