import Link from "next/link";
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

/**
 * Canvas `PageHeader` (DRTS design canvas — Tenant Console.html) with
 * an embedded tab row. Tabs render as `Link`s so navigation/filter state
 * lives in the URL and the active tab reflects whatever the page passes
 * in via `activeTabId`.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  tabs,
  activeTabId,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  tabs: ReadonlyArray<{
    id: string;
    label: string;
    href: string;
    badge?: string | number;
    tone?: "default" | "info" | "warn";
  }>;
  activeTabId: string;
  actions?: ReactNode;
}) {
  return (
    <section className="page-header">
      <div className="page-header-top">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {actions ? <div className="page-header-actions">{actions}</div> : null}
      </div>
      <nav aria-label="Page tabs" className="page-header-tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const toneClass =
            tab.tone === "warn"
              ? " is-warning"
              : tab.tone === "info"
                ? " is-info"
                : "";
          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`page-header-tab${isActive ? " is-active" : ""}${toneClass}`}
              href={tab.href}
              key={tab.id}
            >
              <span>{tab.label}</span>
              {tab.badge !== undefined ? (
                <span className="page-header-tab-badge">{tab.badge}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
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
