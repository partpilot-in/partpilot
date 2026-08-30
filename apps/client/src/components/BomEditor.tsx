import { Plus, Trash2 } from "lucide-react";
import {
  countryOfOriginFromCharacteristics,
  withCharacteristicSummary,
} from "../api/componentMetadata";
import type { BomLine } from "../api/types";

export interface EditableBomLine {
  id: string;
  mpn: string;
  description: string;
  manufacturer: string;
  country_of_origin: string;
  category: string;
  qty: number;
  unit_price: number;
}

type EditableBomField = keyof Omit<EditableBomLine, "id">;

interface BomEditorProps {
  rows: EditableBomLine[];
  onRowsChange: (rows: EditableBomLine[]) => void;
}

export function createEditableBomLine(index: number): EditableBomLine {
  return {
    id: `draft-line-${Date.now()}-${index}`,
    mpn: "",
    description: "",
    manufacturer: "",
    country_of_origin: "",
    category: "",
    qty: 1,
    unit_price: 0,
  };
}

export function bomLineToEditable(line: BomLine): EditableBomLine {
  return {
    id: line.id,
    mpn: line.mpn,
    description: line.description,
    manufacturer: line.manufacturer,
    country_of_origin: countryOfOriginFromCharacteristics(
      line.component_metadata,
    ),
    category: line.category,
    qty: line.qty,
    unit_price: line.unit_price,
  };
}

export function editableToBomLines(
  rows: EditableBomLine[],
  prefix: string,
): BomLine[] {
  return rows
    .filter((row) => row.mpn.trim() || row.description.trim())
    .map((row, index) => ({
      id: `${prefix}-${index + 1}`,
      part_id: `${prefix}-part-${index + 1}`,
      line_no: index + 1,
      mpn: row.mpn.trim() || `MANUAL-${index + 1}`,
      description: row.description.trim() || "Manual BOM line",
      manufacturer: row.manufacturer.trim() || "Unknown",
      category: row.category.trim() || "Uncategorized",
      qty: Number.isFinite(row.qty) && row.qty > 0 ? row.qty : 1,
      unit_price:
        Number.isFinite(row.unit_price) && row.unit_price >= 0
          ? row.unit_price
          : 0,
      score: 72,
      component_metadata: withCharacteristicSummary(
        {},
        {
          countryOfOrigin: row.country_of_origin.trim() || "Unknown",
        },
      ),
    }));
}

export function exportBomCsv(filename: string, rows: BomLine[]) {
  const headers = [
    "Line",
    "MPN",
    "Description",
    "Manufacturer",
    "Made In",
    "Category",
    "Qty",
    "Unit Price",
  ];
  const csvRows = rows.map((line) => [
    line.line_no,
    line.mpn,
    line.description,
    line.manufacturer,
    countryOfOriginFromCharacteristics(line.component_metadata),
    line.category,
    line.qty,
    line.unit_price,
  ]);
  const csv = [headers, ...csvRows]
    .map((row) =>
      row
        .map((value) => {
          const text = String(value);
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "bom"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function BomEditor({ rows, onRowsChange }: BomEditorProps) {
  function updateRow(id: string, field: EditableBomField, value: string) {
    onRowsChange(
      rows.map((row) => {
        if (row.id !== id) return row;
        if (field === "qty" || field === "unit_price") {
          return { ...row, [field]: Number(value) };
        }
        return { ...row, [field]: value };
      }),
    );
  }

  function addRow() {
    onRowsChange([...rows, createEditableBomLine(rows.length + 1)]);
  }

  function removeRow(id: string) {
    if (rows.length === 1) {
      onRowsChange([createEditableBomLine(1)]);
      return;
    }
    onRowsChange(rows.filter((row) => row.id !== id));
  }

  return (
    <div className="bom-editor">
      <div className="bom-editor__table-shell">
        <div className="bom-editor__scroll">
          <table className="bom-editor__table">
            <thead>
              <tr>
                <th>#</th>
                <th>MPN</th>
                <th>Description</th>
                <th>Manufacturer</th>
                <th>Made In</th>
                <th>Category</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      value={row.mpn}
                      onChange={(event) =>
                        updateRow(row.id, "mpn", event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={row.description}
                      onChange={(event) =>
                        updateRow(row.id, "description", event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={row.manufacturer}
                      onChange={(event) =>
                        updateRow(row.id, "manufacturer", event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={row.country_of_origin}
                      onChange={(event) =>
                        updateRow(
                          row.id,
                          "country_of_origin",
                          event.target.value,
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={row.category}
                      onChange={(event) =>
                        updateRow(row.id, "category", event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      value={row.qty}
                      onChange={(event) =>
                        updateRow(row.id, "qty", event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.unit_price}
                      onChange={(event) =>
                        updateRow(row.id, "unit_price", event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove line ${index + 1}`}
                      onClick={() => removeRow(row.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="bom-editor__insert-row"
          onClick={addRow}
        >
          <span className="bom-editor__insert-row-icon" aria-hidden="true">
            <Plus size={15} />
          </span>
          Insert row below
        </button>
      </div>
    </div>
  );
}
