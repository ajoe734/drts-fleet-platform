import type { CSSProperties, ReactNode } from "react";
import { buildCanvasTheme, type CanvasTheme } from "../canvas-tokens";

// NOTE: This module intentionally has NO "use client" directive.
// `Table` is a purely presentational, server-renderable component. It lives
// apart from the "use client" canvas-primitives/index.tsx so that React Server
// Components can pass column render functions (`r: (row) => <jsx>`) without
// crossing the server→client boundary — functions cannot be serialized to
// client components, which previously 500'd any table page once it had data.
// Row-click interaction is not supported here; wrap in a client component if
// you need it.

const DEFAULT_THEME = buildCanvasTheme({
  surface: "tenant",
  density: "compact",
});

function resolveTheme(theme?: CanvasTheme) {
  return theme ?? DEFAULT_THEME;
}

function px(value?: string | number) {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "number" ? `${value}px` : value;
}

export interface TableColumn<Row extends object> {
  h: ReactNode;
  k?: keyof Row & string;
  w?: string | number;
  mono?: boolean;
  align?: CSSProperties["textAlign"];
  r?: (row: Row, index: number) => ReactNode;
}

export interface TableProps<Row extends object> {
  theme?: CanvasTheme;
  columns: TableColumn<Row>[];
  rows: readonly Row[];
  dense?: boolean;
}

export function Table<Row extends object>({
  theme: providedTheme,
  columns,
  rows,
  dense = true,
}: TableProps<Row>) {
  const theme = resolveTheme(providedTheme);

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
          {rows.map((row, rowIndex) => {
            const keyedRow = row as Record<string, unknown>;

            return (
              <tr
                key={`row-${rowIndex}`}
                style={{
                  borderBottom: `1px solid ${theme.border}`,
                  background:
                    "_selected" in keyedRow && keyedRow._selected
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
                        ? (keyedRow[column.k] as ReactNode)
                        : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
