import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-[68ch] px-6 py-12">
      <h1 className="font-medium text-[32px] leading-tight tracking-tight">
        Two transactions, one row
      </h1>
      <p className="mt-6 font-serif text-[19px] text-[var(--color-ink)] leading-relaxed">
        Two transactions touch the same row at the same time. What each one sees, and what survives
        at the end, depends on a setting most applications never change.
      </p>
      <p className="mt-6">
        <Link href="/compose" className="text-[var(--color-t1-text)] underline underline-offset-4">
          Open the workbench
        </Link>
      </p>
    </div>
  );
}
