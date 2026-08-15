import type { FC } from "react";

interface EngineUnreachableProps {
  title: string;
}

/** What a server rendered route shows when the engine did not answer. The heading stays, so
 * the page still reads as the one the reader asked for. */
const EngineUnreachable: FC<EngineUnreachableProps> = ({ title }) => (
  <div className="mx-auto max-w-[1200px] px-6 py-6">
    <h1 className="font-medium text-xl tracking-tight">{title}</h1>
    <p className="mt-6 text-[var(--color-danger)] text-sm">
      Could not reach the engine. Check it is running, then reload.
    </p>
  </div>
);

export default EngineUnreachable;
