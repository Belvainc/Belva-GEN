"use client";

import type { ReactNode } from "react";
import { Text } from "@/components/atoms/Text";

export interface DataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: Record<string, unknown>) => ReactNode;
}

interface DataTableProps {
  columns: DataTableColumn[];
  data: Record<string, unknown>[];
  sort?: string;
  direction?: "asc" | "desc";
  onSort?: (field: string) => void;
  onRowClick?: (row: Record<string, unknown>) => void;
  page: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
  total: number;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString();
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function DataTable({
  columns,
  data,
  sort,
  direction,
  onSort,
  onRowClick,
  page,
  totalPages,
  onPageChange,
  total,
}: DataTableProps): ReactNode {
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left font-medium text-muted-foreground ${
                    col.sortable === true ? "cursor-pointer select-none hover:text-foreground" : ""
                  }`}
                  onClick={() => {
                    if (col.sortable === true && onSort !== undefined) {
                      onSort(col.key);
                    }
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sort === col.key && (
                      <span className="text-xs">
                        {direction === "asc" ? "\u25B2" : "\u25BC"}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No records found
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={(row.id as string) ?? idx}
                  className={`transition-colors hover:bg-surface-secondary ${
                    onRowClick !== undefined ? "cursor-pointer" : ""
                  }`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-foreground">
                      {col.render !== undefined
                        ? col.render(row[col.key], row)
                        : formatCellValue(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <Text variant="muted" className="text-xs">
          {total} total records
        </Text>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange?.(page - 1)}
            className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <Text variant="small">
            Page {page} of {totalPages}
          </Text>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange?.(page + 1)}
            className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
