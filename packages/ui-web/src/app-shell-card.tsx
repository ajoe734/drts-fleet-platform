import type { ReactNode } from "react";
import { MANAGEMENT_COLORS, managementSurfaceStyle } from "./management-theme";

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
        ...managementSurfaceStyle(),
        padding: "20px",
      }}
    >
      <div style={{ display: "grid", gap: "8px" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>{title}</h2>
        <p
          style={{
            margin: 0,
            color: MANAGEMENT_COLORS.text,
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      </div>
      {children ? <div style={{ marginTop: "16px" }}>{children}</div> : null}
    </section>
  );
}
