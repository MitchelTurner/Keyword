import type { ReactNode } from "react";

export default function Panel({
  children,
  className = "",
  title,
  hint,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <section
      className={`rounded-lg border border-zinc-800/90 bg-zinc-900/40 p-4 ${className}`}
    >
      {(title || hint) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {title && (
            <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
          )}
          {hint && <p className="text-xs text-zinc-500">{hint}</p>}
        </div>
      )}
      {children}
    </section>
  );
}
