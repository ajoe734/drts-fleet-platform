import type { ReactNode } from "react";

interface AppShellCardProps {
  title: string;
  description: string;
  children?: ReactNode;
}

export function AppShellCard({
  title,
  description,
  children,
}: AppShellCardProps) {
  return (
    <section
      style={{
        border: "1px solid rgba(15, 23, 42, 0.12)",
        borderRadius: "16px",
        padding: "20px",
        background: "rgba(255, 255, 255, 0.88)",
        boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ display: "grid", gap: "8px" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>{title}</h2>
        <p style={{ margin: 0, color: "#334155", lineHeight: 1.6 }}>
          {description}
        </p>
      </div>
      {children ? <div style={{ marginTop: "16px" }}>{children}</div> : null}
    </section>
  );
}
