import { ReactNode } from "react";
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
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-left border-collapse">
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
            <tr
              key={rowIdx}
              className={cn(
                "hover:bg-white/5 transition-colors",
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

