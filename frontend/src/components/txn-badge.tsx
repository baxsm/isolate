import type { FC } from "react";
import { cn, txnColor, txnInkColor, txnTextColor } from "@/lib/utils";

interface TxnBadgeProps {
  txn: number;
  variant?: "fill" | "text";
  label?: string;
  className?: string;
}

/**
 * One transaction, one hue, everywhere: timeline lane, version row, graph node, and its
 * name in a sentence. Filled uses the step 9 token, which is theme invariant; text uses
 * step 11, which is not.
 */
const TxnBadge: FC<TxnBadgeProps> = ({ txn, variant = "fill", label, className }) => {
  const text = label ?? `T${txn}`;
  if (variant === "text") {
    return (
      <span
        className={cn("tabular font-medium font-mono text-[0.95em]", className)}
        style={{ color: txnTextColor(txn) }}
      >
        {text}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "tabular inline-flex h-5 min-w-5 items-center justify-center rounded px-2 font-medium font-mono text-xs",
        className,
      )}
      style={{ background: txnColor(txn), color: txnInkColor(txn) }}
    >
      {text}
    </span>
  );
};

export default TxnBadge;
