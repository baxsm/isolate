import Link from "next/link";
import ArticleFigure from "@/components/article-figure";
import OpToken from "@/components/op-token";
import TxnBadge from "@/components/txn-badge";
import {
  DIRTY_READ,
  FIRST_TOUCH,
  LOST_UPDATE,
  READ_SKEW,
  WRITE_SKEW,
} from "@/lib/article-schedules";

export default function HomePage() {
  return (
    <article className="mx-auto max-w-[68ch] px-6 py-12">
      <h1 className="font-medium text-[32px] leading-tight tracking-tight">
        Two transactions, one row
      </h1>
      <p className="mt-6 font-serif text-[19px] leading-relaxed">
        Two transactions touch the same row at the same time. What each one sees, and what survives
        at the end, depends on a setting most applications never change. Everything below runs on a
        real MVCC engine: step through a schedule and the version chains and dependency graph are
        the engine&apos;s own, not a drawing of them.
      </p>

      <Section title="The simplest interference">
        <p>
          <TxnBadge txn={1} variant="text" /> reads a row, <TxnBadge txn={2} variant="text" />{" "}
          writes it and commits, then <TxnBadge txn={1} variant="text" /> reads the same row again.
          At read committed the second read returns the new value, so one transaction saw two
          different values for one row without writing anything.
        </p>
        <p>
          Step to the end, then set the level to repeatable read. The second{" "}
          <OpToken kind="read" txn={1} operationKey="1" /> goes back to the old value, because the
          snapshot was taken when the transaction began.
        </p>
        <ArticleFigure operations={FIRST_TOUCH} level="read_committed" />
      </Section>

      <Section title="What a snapshot is">
        <p>
          A snapshot is the set of transactions a reader is allowed to see. Every version carries{" "}
          <span className="font-mono">xmin</span>, the transaction that created it, and{" "}
          <span className="font-mono">xmax</span>, the one that expired it. A version is visible
          when its <span className="font-mono">xmin</span> committed before the snapshot and its{" "}
          <span className="font-mono">xmax</span> did not.
        </p>
        <p>
          That is why nothing is overwritten in place. The old row stays until no snapshot can still
          reach it, which is what makes a reader and a writer able to run at once without either
          waiting.
        </p>
        <ArticleFigure operations={DIRTY_READ} level="read_uncommitted" />
        <p>
          Above, <TxnBadge txn={2} variant="text" /> reads a value{" "}
          <TxnBadge txn={1} variant="text" /> never committed. Read uncommitted allows it and every
          higher level forbids it. This one is easy to prevent, and it is the only anomaly on this
          page that every real engine already stops by default.
        </p>
      </Section>

      <Section title="The anomalies, one at a time">
        <p>
          A lost update is two transactions reading the same row, both writing it, and one of the
          writes disappearing. Neither transaction did anything wrong on its own.
        </p>
        <ArticleFigure operations={LOST_UPDATE} level="read_committed" />
        <p>
          Read skew is stranger, because nothing is lost. One transaction reads key{" "}
          <span className="font-mono">1</span> before another commits and key{" "}
          <span className="font-mono">2</span> after, so it sees half of a change that was supposed
          to be atomic.
        </p>
        <ArticleFigure operations={READ_SKEW} level="read_committed" />
      </Section>

      <Section title="Dependency graphs and cycles">
        <p>
          Draw an edge whenever one transaction depends on another:{" "}
          <span className="font-mono">ww</span> when it overwrites,{" "}
          <span className="font-mono">wr</span> when it reads what the other wrote, and{" "}
          <span className="font-mono">rw</span> when it writes what the other read. That last one is
          an anti dependency and is drawn dashed.
        </p>
        <p>
          A schedule is serializable when this graph has no cycle. That is the whole theory: the
          anomalies above are not a list to memorise, they are the shapes a cycle can take.
        </p>
      </Section>

      <Section title="Write skew and why serializable is different">
        <p>
          Write skew is the case snapshot isolation cannot catch. Both transactions read both rows,
          each writes a different row, and neither ever sees the other&apos;s write. No value is
          lost, and the pair still breaks a rule that held before they ran.
        </p>
        <ArticleFigure operations={WRITE_SKEW} level="repeatable_read" />
        <p>
          The graph shows two <span className="font-mono">rw</span> edges pointing opposite ways, a
          cycle with no <span className="font-mono">wr</span> edge anywhere in it. Set the level to
          serializable and one transaction aborts. The node it aborts is the pivot: the one sitting
          between two anti dependencies, which is what Fekete&apos;s result says to look for.
        </p>
      </Section>

      <Section title="The labels are wrong">
        <p>
          &quot;Repeatable read&quot; does not mean the same thing twice. In PostgreSQL it is
          snapshot isolation. In MySQL it is weaker again, and it loses an update where PostgreSQL
          raises a serialization error. Oracle&apos;s &quot;serializable&quot; is snapshot
          isolation, which is not serializable.
        </p>
        <p>
          Both transactions below are set to repeatable read and stay there. Switch the engine from
          PostgreSQL to MySQL, step to the end, and read the outcome: the label never moves and the
          result does.
        </p>
        <ArticleFigure operations={LOST_UPDATE} level="repeatable_read" engineControl />
        <p>
          The{" "}
          <Link href="/matrix" className="text-[var(--color-t1-text)] underline underline-offset-4">
            matrix
          </Link>{" "}
          runs every scenario at every level and compares the result against the published table.
          The{" "}
          <Link
            href="/compose"
            className="text-[var(--color-t1-text)] underline underline-offset-4"
          >
            workbench
          </Link>{" "}
          lets you build a schedule of your own and reorder it.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="font-medium text-[24px] leading-snug tracking-tight">{title}</h2>
      <div className="mt-4 flex flex-col gap-4 font-serif text-[19px] leading-relaxed">
        {children}
      </div>
    </section>
  );
}
