"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FC } from "react";
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
 * Active is carried by ink weight and a rule under the label, drawn with a pseudo element so
 * it spans the word exactly and has square ends. It used to be `border-b-2` on a `rounded-sm`
 * box pulled up with `-mb-px`, which paints a stubby rounded bar floating below the text and
 * reads as an artifact rather than an underline.
 *
 * Hover uses the same rule at lower strength instead of only lifting the ink, so an inactive
 * item answers the pointer in the same shape the active one uses.
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
      <ul className="flex items-center gap-4">
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
    </nav>
  );
};

export default SiteNav;
