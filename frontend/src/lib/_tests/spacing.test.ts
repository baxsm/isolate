import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// resolved from this file, not from the working directory. a bare "src" silently scanned
// nothing when the runner's cwd was not the frontend root, and an empty scan passes
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * `ui.md` budgets spacing to 8, 12, 16, 24 and 48, which is Tailwind's 2, 3, 4, 6 and 12.
 * A value outside that list needs a reason in the log, so this scans source rather than the
 * DOM: the drift it catches is someone typing `gap-1.5` because it looked right, and that is
 * visible in the class string before it is ever rendered.
 *
 * `components/ui/` is excluded because shadcn generates it and the next `shadcn add`
 * overwrites any edit. The palette pins its radius and colour tokens instead.
 */
/**
 * 8, 12, 16, 24, 48 as Tailwind steps, plus the values that are not lengths on this scale:
 * `0` is nothing, `px` is a hairline, and `auto` is a layout keyword rather than spacing.
 */
const ALLOWED = new Set(["0", "2", "3", "4", "6", "12", "px", "auto"]);

/**
 * Longest alternatives first. Ordered the other way, `gap` matches inside `gap-x-6` and the
 * captured value is `x`, which reported every two-axis utility in the app as an offender.
 */
const PROPS = [
  "gap-x",
  "gap-y",
  "space-x",
  "space-y",
  "gap",
  "px",
  "py",
  "pt",
  "pb",
  "pl",
  "pr",
  "mx",
  "my",
  "mt",
  "mb",
  "ml",
  "mr",
  "p",
  "m",
].join("|");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "ui" || entry === "_tests") continue;
      sourceFiles(path, out);
      continue;
    }
    if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(path);
  }
  return out;
}

describe("spacing stays on the documented scale", () => {
  it("uses only 8, 12, 16, 24 and 48", () => {
    const offenders: string[] = [];
    // a utility can be bare, or prefixed by a variant like `sm:` or `hover:`
    const pattern = new RegExp(`(?:^|["'\\s:])-?(${PROPS})-([\\w.]+)`, "g");

    const files = sourceFiles(SRC);
    // an empty scan would pass, so prove the walk found the tree it is meant to check
    expect(files.length).toBeGreaterThan(15);

    for (const file of files) {
      const lines = readFileSync(file, "utf-8").split("\n");
      lines.forEach((line, i) => {
        for (const match of line.matchAll(pattern)) {
          const [, prop, value] = match;
          if (!value || ALLOWED.has(value)) continue;
          // arbitrary values carry their own reason in the class, e.g. p-[3px]
          if (value.startsWith("[")) continue;
          offenders.push(`${relative(SRC, file)}:${i + 1} ${prop}-${value}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
