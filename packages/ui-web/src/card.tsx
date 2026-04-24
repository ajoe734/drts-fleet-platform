import type { CSSProperties, ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function Card({ children, style }: CardProps) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, style }: CardProps) {
  return (
    <div
      style={{
        padding: "16px 20px",
        borderBottom: "1px solid #f1f5f9",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, style }: CardProps) {
  return <div style={{ padding: "20px", ...style }}>{children}</div>;
}
