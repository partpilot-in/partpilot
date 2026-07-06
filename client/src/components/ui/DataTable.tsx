import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right";
  numeric?: boolean;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  sort?: { key: string; direction: "asc" | "desc" };
  onSortChange?: (key: string, direction: "asc" | "desc") => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  loading?: boolean;
  rowClassName?: (row: T) => string;
  footer?: ReactNode;
}

function getValue<T>(row: T, key: string) {
  return (row as Record<string, unknown>)[key];
}

function compareValues(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  sort,
  onSortChange,
  selectable = false,
  selectedIds = new Set<string>(),
  onSelectionChange,
  onRowClick,
  emptyState,
  loading = false,
  rowClassName,
  footer,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<{ key: string; direction: "asc" | "desc" } | undefined>();
  const activeSort = sort ?? internalSort;

  const sortedRows = useMemo(() => {
    if (!activeSort) return rows;
    return [...rows].sort((a, b) => {
      const result = compareValues(getValue(a, activeSort.key), getValue(b, activeSort.key));
      return activeSort.direction === "asc" ? result : -result;
    });
  }, [activeSort, rows]);

  const allVisibleSelected = sortedRows.length > 0 && sortedRows.every((row) => selectedIds.has(getRowId(row)));

  function setSort(key: string) {
    const nextDirection = activeSort?.key === key && activeSort.direction === "asc" ? "desc" : "asc";
    if (onSortChange) onSortChange(key, nextDirection);
    else setInternalSort({ key, direction: nextDirection });
  }

  function toggleRow(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange?.(next);
  }

  function toggleAllVisible() {
    const next = new Set(selectedIds);
    if (allVisibleSelected) {
      sortedRows.forEach((row) => next.delete(getRowId(row)));
    } else {
      sortedRows.forEach((row) => next.add(getRowId(row)));
    }
    onSelectionChange?.(next);
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {selectable && (
              <th className="data-table__checkbox">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
              </th>
            )}
            {columns.map((column) => {
              const key = String(column.key);
              const align = column.align ?? (column.numeric ? "right" : "left");
              const isSorted = activeSort?.key === key;
              return (
                <th
                  key={key}
                  className={column.numeric ? "data-table__numeric" : undefined}
                  aria-sort={
                    isSorted ? (activeSort.direction === "asc" ? "ascending" : "descending") : undefined
                  }
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className="data-table__sort"
                      data-align={align}
                      onClick={() => setSort(key)}
                    >
                      <span>{column.header}</span>
                      {isSorted ? (
                        activeSort.direction === "asc" ? (
                          <ArrowUp size={14} aria-hidden="true" />
                        ) : (
                          <ArrowDown size={14} aria-hidden="true" />
                        )
                      ) : (
                        <ChevronsUpDown size={14} aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }).map((_, index) => (
              <tr key={`skeleton-${index}`}>
                {selectable && <td className="data-table__checkbox"><span className="skeleton-cell" /></td>}
                {columns.map((column) => (
                  <td key={String(column.key)}>
                    <span className="skeleton-cell" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            sortedRows.map((row) => {
              const id = getRowId(row);
              const rowClasses = [
                "data-table-row",
                onRowClick && "data-table-row--clickable",
                rowClassName?.(row),
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <tr
                  key={id}
                  className={rowClasses}
                  onClick={() => onRowClick?.(row)}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (onRowClick && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  }}
                >
                  {selectable && (
                    <td className="data-table__checkbox" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select row ${id}`}
                        checked={selectedIds.has(id)}
                        onChange={() => toggleRow(id)}
                      />
                    </td>
                  )}
                  {columns.map((column) => {
                    const align = column.align ?? (column.numeric ? "right" : "left");
                    return (
                      <td
                        key={String(column.key)}
                        className={column.numeric ? "data-table__numeric" : undefined}
                        style={{ textAlign: align }}
                      >
                        {column.render ? column.render(row) : String(getValue(row, String(column.key)) ?? "")}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          {!loading && sortedRows.length === 0 && (
            <tr>
              <td className="data-table__empty" colSpan={columns.length + (selectable ? 1 : 0)}>
                {emptyState ?? <EmptyState title="No rows" body="Adjust filters or try another search." />}
              </td>
            </tr>
          )}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}
