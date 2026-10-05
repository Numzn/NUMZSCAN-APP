import type { ReactNode } from "react";

interface DataTableProps {
  label: string;
  columns: string[];
  rows: ReactNode[][];
}

// One table pattern for the app. On a phone the CSS turns each row into a labelled block, using the column names.
export function DataTable({ label, columns, rows }: DataTableProps) {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} scope="col">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, rowIndex) => (
            <tr key={rowIndex}>
              {cells.map((cell, index) => (
                <td key={index} data-label={columns[index]}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
