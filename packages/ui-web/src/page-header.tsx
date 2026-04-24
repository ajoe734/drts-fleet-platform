import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: "24px",
        gap: "16px",
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: "22px",
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#64748b" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
