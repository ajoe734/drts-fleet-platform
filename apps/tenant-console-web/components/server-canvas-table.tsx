import type { CSSProperties, ReactNode } from "react";
import type { CanvasTheme } from "@drts/ui-web";

export interface ServerCanvasTableColumn<Row extends Record<string, unknown>> {
  h: ReactNode;
  k?: keyof Row & string;
  w?: string | number;
  mono?: boolean;
  align?: CSSProperties["textAlign"];
  r?: (row: Row, index: number) => ReactNode;
}

export interface ServerCanvasTableProps<Row extends Record<string, unknown>> {
  theme: CanvasTheme;
  columns: ServerCanvasTableColumn<Row>[];
  rows: readonly Row[];
  dense?: boolean;
}

function px(value: string | number | undefined) {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

export function ServerCanvasTable<Row extends Record<string, unknown>>({
  theme,
  columns,
  rows,
  dense = true,
}: ServerCanvasTableProps<Row>) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12.5,
          fontFamily: theme.fontFamily,
        }}
      >
        <thead>
          <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
            {columns.map((column, index) => (
              <th
                key={`head-${index}`}
                style={{
                  textAlign: column.align ?? "left",
                  padding: dense ? "7px 12px" : "10px 12px",
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: theme.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  background: theme.surfaceLo,
                  whiteSpace: "nowrap",
                  width: px(column.w),
                  position: "sticky",
                  top: 0,
                }}
              >
                {column.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={`row-${rowIndex}`}
              style={{
                borderBottom: `1px solid ${theme.border}`,
                background:
                  "_selected" in row && row._selected
                    ? theme.rowSelect
                    : "transparent",
              }}
            >
              {columns.map((column, columnIndex) => (
                <td
                  key={`cell-${rowIndex}-${columnIndex}`}
                  style={{
                    padding: dense ? "7px 12px" : "10px 12px",
                    textAlign: column.align ?? "left",
                    fontSize: column.mono ? 11.5 : 12.5,
                    fontFamily: column.mono
                      ? theme.monoFamily
                      : theme.fontFamily,
                    color: theme.text,
                    verticalAlign: "middle",
                    whiteSpace: "nowrap",
                  }}
                >
                  {column.r
                    ? column.r(row, rowIndex)
                    : column.k
                      ? (row[column.k] as ReactNode)
                      : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
