import { Fragment, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GridTableColumn {
  header: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

interface GridTableRow {
  cells: ReactNode[];
  className?: string;
  highlight?: boolean;
  // Optional expandable-row support: onClick makes the row a toggle;
  // expandedContent (when present) renders full-width beneath it.
  onClick?: () => void;
  expandedContent?: ReactNode;
}

interface GridTableProps {
  columns: GridTableColumn[];
  rows: GridTableRow[];
  className?: string;
  headerClassName?: string;
  rowClassName?: string;
}

export function GridTable({
  columns,
  rows,
  className,
  headerClassName,
  rowClassName,
}: GridTableProps) {
  return (
    <div className={cn("overflow-x-auto [-webkit-overflow-scrolling:touch]", className)}>
      <table className="w-full min-w-[520px] text-left border-collapse">
        <thead>
          <tr
            className={cn(
              "bg-panel text-[9px] uppercase text-text-dim border-b border-border",
              headerClassName
            )}
          >
            {columns.map((col, idx) => (
              <th
                key={idx}
                className={cn(
                  "p-3 font-normal tracking-wider",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          className={cn(
            "text-[11px] font-mono text-white divide-y divide-border/20",
            rowClassName
          )}
        >
          {rows.map((row, rowIdx) => (
            <Fragment key={rowIdx}>
              <tr
                onClick={row.onClick}
                className={cn(
                  "hover:bg-white/5 transition-colors",
                  row.onClick && "cursor-pointer",
                  row.highlight && "bg-border/10 border-l-2 border-l-gold",
                  row.className
                )}
              >
                {row.cells.map((cell, cellIdx) => (
                  <td
                    key={cellIdx}
                    className={cn(
                      "p-3",
                      columns[cellIdx]?.align === "right" && "text-right",
                      columns[cellIdx]?.align === "center" && "text-center"
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
              {row.expandedContent != null && (
                <tr>
                  <td colSpan={columns.length} className="p-0">
                    {row.expandedContent}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

