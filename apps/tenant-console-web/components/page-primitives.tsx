import type { ReactNode } from "react";

export function PageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="page-hero">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
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
    <article className="surface-card">
      <span className="surface-kicker">{kicker}</span>
      <h3>{title}</h3>
      <p>{description}</p>
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
  return (
    <section
      className={`callout-panel${tone === "warning" ? " is-warning" : ""}`}
    >
      <strong>{title}</strong>
      <p>{description}</p>
      {children}
    </section>
  );
}
