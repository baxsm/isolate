"use client";

import { Moon, Sun } from "lucide-react";
import type { FC } from "react";
import { useCallback, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveTheme, STORAGE_KEY, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Switches the theme by setting `data-theme` on `<html>`, which is the attribute the two
 * dark selectors in `globals.css` already answer to.
 *
 * Nothing here is suppressed. The layout never renders `data-theme` in JSX, so the inline
 * script in `theme-script.tsx` sets an attribute React does not own and there is no mismatch
 * to hide. The button's own label is the only thing that has to agree with the DOM, and it
 * starts empty rather than guessing: the server cannot know which theme the reader gets,
 * and rendering "Switch to dark" for someone already in dark is a wrong label, not a
 * cosmetic one.
 */
const ThemeToggle: FC = () => {
  const [theme, setTheme] = useState<Theme | null>(null);

  // before paint, and it also re-applies the attribute react's dev remount strips off
  useLayoutEffect(() => {
    const current = resolveTheme();
    document.documentElement.setAttribute("data-theme", current);
    setTheme(current);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = (current ?? resolveTheme()) === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // private mode denies storage. the attribute still switched, so the theme holds
        // for this page and simply does not survive a reload
      }
      return next;
    });
  }, []);

  const dark = theme === "dark";

  return (
    <Button
      variant="outline"
      size="icon-sm"
      onClick={toggle}
      aria-label={theme === null ? "Switch theme" : dark ? "Switch to light" : "Switch to dark"}
      className="relative"
    >
      {/*
        Both icons stay mounted and counter-rotate past each other, so the swap reads as one
        object turning rather than two icons appearing. Absolute, because a swap that changed
        the button's content box would move the nav.

        Driven by state rather than the `dark:` variant: that variant is defined as
        `[data-theme="dark"]` only, so a reader on an OS dark preference who has not clicked
        yet would get the wrong icon.
      */}
      <Sun
        aria-hidden
        className={cn(
          "absolute transition-[transform,opacity] duration-200 ease-out motion-reduce:duration-[1ms]",
          dark ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
        )}
      />
      <Moon
        aria-hidden
        className={cn(
          "absolute transition-[transform,opacity] duration-200 ease-out motion-reduce:duration-[1ms]",
          dark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0",
        )}
      />
    </Button>
  );
};

export default ThemeToggle;
