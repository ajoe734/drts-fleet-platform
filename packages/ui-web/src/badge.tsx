import type { CSSProperties, ReactNode } from "react";

type BadgeVariant = "green" | "red" | "yellow" | "blue" | "gray" | "orange";

const STYLES: Record<BadgeVariant, { background: string; color: string }> = {
  green: { background: "#dcfce7", color: "#15803d" },
  red: { background: "#fee2e2", color: "#b91c1c" },
  yellow: { background: "#fef9c3", color: "#a16207" },
  blue: { background: "#dbeafe", color: "#1d4ed8" },
  gray: { background: "#f1f5f9", color: "#475569" },
  orange: { background: "#ffedd5", color: "#c2410c" },
};

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  style?: CSSProperties;
}

export function Badge({ children, variant = "gray", style }: BadgeProps) {
  const s = STYLES[variant];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "999px",
        fontSize: "11.5px",
        fontWeight: 600,
        background: s.background,
        color: s.color,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "green" : "red"}>
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}
