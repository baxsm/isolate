import ComposeWorkbench from "@/components/compose-workbench";
import { runSchedule } from "@/lib/api";
import { DEFAULT_INITIAL, DEFAULT_ISOLATION, DEFAULT_OPERATIONS } from "@/lib/default-schedule";

export const metadata = {
  title: "Compose",
  description: "Build a schedule of your own and step through what each transaction sees.",
};

/**
 * The default schedule is known before the page is built, so the server runs it rather than
 * letting the first paint show every panel's empty state. Everything after that is the
 * reader's, which is why the workbench stays a client component.
 */
export default async function ComposePage() {
  const seed = await runSchedule({
    engine: "postgres",
    isolation: DEFAULT_ISOLATION,
    operations: DEFAULT_OPERATIONS,
    initial: Object.entries(DEFAULT_INITIAL).map(([key, value]) => ({ key, value })),
  }).catch((error: unknown) => {
    // logged rather than swallowed: a silent null looks the same as a seed never wired up
    console.error("compose.seed", error);
    return null;
  });

  return <ComposeWorkbench seed={seed} />;
}
