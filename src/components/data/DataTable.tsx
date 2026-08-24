import { clsx } from "clsx";
import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  className?: string;
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  empty?: ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-card border border-hairline bg-surface shadow-soft">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-hairline">
            {columns.map((c) => (
              <th
                key={c.key}
                className={clsx(
                  "px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-faint",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-hairline last:border-b-0 hover:bg-ink/2"
            >
              {columns.map((c) => (
                <td key={c.key} className={clsx("px-4 py-3 align-middle", c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
