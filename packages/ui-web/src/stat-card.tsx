import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
  accent?: string;
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  accent = "#1d4ed8",
}: StatCardProps) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontSize: "12.5px",
            fontWeight: 500,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </span>
        {icon && <span style={{ color: accent }}>{icon}</span>}
      </div>
      <div
        style={{
          fontSize: "28px",
          fontWeight: 700,
          color: "#0f172a",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: "12px", color: "#94a3b8" }}>{sub}</div>}
    </div>
  );
}
