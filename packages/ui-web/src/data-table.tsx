"use client";

import type { ReactNode } from "react";

interface Column {
  label: string;
  width?: string;
}

interface DataTableProps {
  columns: Column[];
  children: ReactNode;
  empty?: string;
}

export function DataTable({ columns, children, empty }: DataTableProps) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "13.5px",
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.label}
                style={{
                  padding: "10px 16px",
                  textAlign: "left",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  background: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                  width: col.width,
                  whiteSpace: "nowrap",
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {!children && empty && (
        <p
          style={{
            textAlign: "center",
            padding: "32px 0",
            color: "#94a3b8",
            fontSize: "14px",
          }}
        >
          {empty}
        </p>
      )}
    </div>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return (
    <tr
      style={{ borderBottom: "1px solid #f1f5f9" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background = "#f8fafc";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background =
          "transparent";
      }}
    >
      {children}
    </tr>
  );
}

interface TdProps {
  children: ReactNode;
  muted?: boolean;
  mono?: boolean;
}

export function Td({ children, muted, mono }: TdProps) {
  return (
    <td
      style={{
        padding: "12px 16px",
        color: muted ? "#64748b" : "#0f172a",
        fontFamily: mono ? "monospace" : undefined,
        fontSize: mono ? "12px" : undefined,
      }}
    >
      {children}
    </td>
  );
}
