export type Theme = "light" | "dark";

export const STORAGE_KEY = "theme";

/**
 * The stored choice, or the OS preference when there is none.
 *
 * Client only. It is the same order the inline script in `theme-script.tsx` uses, and the
 * two have to agree or the button's label would describe a theme the page is not in.
 */
export function resolveTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // storage can be denied. fall through to the media query
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
