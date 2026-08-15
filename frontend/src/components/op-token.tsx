import type { FC } from "react";
import { cn, opToken, txnTextColor } from "@/lib/utils";

interface OpTokenProps {
  kind: string;
  txn: number;
  operationKey?: string | null;
  className?: string;
}

/** Anywhere an operation is named in text or in a panel, this renders it. Always mono. */
const OpToken: FC<OpTokenProps> = ({ kind, txn, operationKey = null, className }) => {
  return (
    <code
      className={cn("tabular font-mono text-[0.95em]", className)}
      style={{ color: txnTextColor(txn) }}
    >
      {opToken(kind, txn, operationKey)}
    </code>
  );
};

export default OpToken;
