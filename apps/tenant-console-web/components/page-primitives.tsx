import type { ReactNode } from "react";
import { managementSurfaceStyle, managementSurfaceTone } from "@drts/ui-web";

export function PageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  const tenantTone = managementSurfaceTone("tenant");

  return (
    <section
      style={{
        ...managementSurfaceStyle("tenant"),
        display: "grid",
        gap: "12px",
        padding: "28px",
        background:
          "linear-gradient(135deg, rgba(240, 253, 250, 0.96), rgba(255, 255, 255, 0.98))",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          width: "fit-content",
          alignItems: "center",
          borderRadius: "999px",
          padding: "6px 10px",
          background: tenantTone.background,
          color: tenantTone.text,
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </span>
      <h1
        style={{
          margin: 0,
          fontSize: "clamp(2rem, 4vw, 3.1rem)",
          lineHeight: 0.98,
          color: "#0f172a",
        }}
      >
        {title}
      </h1>
      <p
        style={{
          margin: 0,
          maxWidth: "64ch",
          color: "#64748b",
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>
    </section>
  );
}

export function SurfaceCard({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <article
      style={{
        ...managementSurfaceStyle(),
        display: "grid",
        gap: "12px",
        padding: "20px",
      }}
    >
      <span
        style={{
          color: "#0f766e",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {kicker}
      </span>
      <h3 style={{ margin: 0, color: "#0f172a", fontSize: "1.1rem" }}>
        {title}
      </h3>
      <p style={{ margin: 0, color: "#64748b", lineHeight: 1.55 }}>
        {description}
      </p>
      {children}
    </article>
  );
}

export function CalloutPanel({
  title,
  description,
  tone = "default",
  children,
}: {
  title: string;
  description: string;
  tone?: "default" | "warning";
  children?: ReactNode;
}) {
  const toneStyles = managementSurfaceTone(
    tone === "warning" ? "warning" : "tenant",
  );

  return (
    <section
      style={{
        ...managementSurfaceStyle(tone === "warning" ? "warning" : "tenant"),
        display: "grid",
        gap: "12px",
        padding: "20px",
        background: toneStyles.background,
      }}
    >
      <strong style={{ color: "#0f172a", fontSize: "1rem" }}>{title}</strong>
      <p style={{ margin: 0, color: "#64748b", lineHeight: 1.55 }}>
        {description}
      </p>
      {children}
    </section>
  );
}
