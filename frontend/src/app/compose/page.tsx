import ComposeWorkbench from "@/components/compose-workbench";
import { runSchedule } from "@/lib/api";
import { DEFAULT_INITIAL, DEFAULT_ISOLATION, DEFAULT_OPERATIONS } from "@/lib/default-schedule";

export const metadata = {
  title: "Compose",
  description: "Build a schedule of your own and step through what each transaction sees.",
};

/**
 * The default schedule is known before the page is built, so the server runs it and hands
 * the result down. Without that the first paint had no steps and every panel showed its
 * empty state - "No operations yet", "No transactions yet" - for a schedule whose contents
 * were never in doubt.
 *
 * Everything after the first paint is the reader's, so the workbench itself stays a client
 * component: editing, sharing and scenario loading all need the browser.
 */
export default async function ComposePage() {
  const seed = await runSchedule({
    engine: "postgres",
    isolation: DEFAULT_ISOLATION,
    operations: DEFAULT_OPERATIONS,
    initial: Object.entries(DEFAULT_INITIAL).map(([key, value]) => ({ key, value })),
  }).catch((error: unknown) => {
    // the page still renders and the client refetches, so a dead engine is not fatal here.
    // it is logged rather than swallowed, because a silent null is indistinguishable from
    // a seed that was never wired up
    console.error("compose.seed", error);
    return null;
  });

  return <ComposeWorkbench seed={seed} />;
}
