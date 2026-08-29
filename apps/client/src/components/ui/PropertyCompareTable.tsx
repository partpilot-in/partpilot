interface CompareTablePart {
  id: string;
  label: string;
  parameters: Record<string, string | number | boolean>;
}

interface PropertyCompareTableProps {
  parts: CompareTablePart[];
  highlightDifferences?: boolean;
}

function formatValue(value: string | number | boolean | undefined) {
  if (value === undefined || value === "") return "Not specified";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function PropertyCompareTable({ parts, highlightDifferences = true }: PropertyCompareTableProps) {
  const parameterKeys = Array.from(
    new Set(parts.flatMap((part) => Object.keys(part.parameters))),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="compare-table-wrap">
      <table className="compare-table">
        <thead>
          <tr>
            <th>Parameter</th>
            {parts.map((part) => (
              <th key={part.id}>{part.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parameterKeys.map((key) => {
            const values = parts.map((part) => formatValue(part.parameters[key]));
            const uniqueValues = new Set(values);
            const isDifferent = highlightDifferences && uniqueValues.size > 1;
            return (
              <tr key={key} className={isDifferent ? "compare-table__different" : undefined}>
                <td className="compare-table__key">{key}</td>
                {values.map((value, index) => (
                  <td key={`${parts[index].id}-${key}`}>{value}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
