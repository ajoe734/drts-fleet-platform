"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslation } from "@/lib/i18n";
import { findPassengerNavItem, getPassengerNavItems } from "@/lib/navigation";

export function PassengerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useTranslation();

  if (pathname.startsWith("/embed/")) {
    return <>{children}</>;
  }

  const passengerNavItems = getPassengerNavItems(locale);
  const activeItem = findPassengerNavItem(pathname, locale);

  return (
    <div className="passenger-shell">
      <aside className="passenger-sidebar">
        <div className="passenger-brand">
          <span className="passenger-badge">{t("shell.badge")}</span>
          <h1>{t("shell.title")}</h1>
          <p>{t("shell.description")}</p>
        </div>

        <nav className="passenger-nav" aria-label={t("shell.navLabel")}>
          {passengerNavItems.map((item) => {
            const isActive = activeItem?.href === item.href;

            return (
              <Link
                className={`passenger-nav-link${isActive ? " is-active" : ""}`}
                href={item.href}
                key={item.href}
              >
                <strong>{item.label}</strong>
                <span>{item.note}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-callout">
          <strong>{t("shell.calloutTitle")}</strong>
          <p>{t("shell.calloutBody")}</p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <button
            aria-label={t("common.language.switch")}
            className="text-link"
            onClick={() => setLocale("zh")}
            style={{
              cursor: "pointer",
              border: "none",
              opacity: locale === "zh" ? 1 : 0.75,
            }}
            type="button"
          >
            {t("common.language.zh")}
          </button>
          <button
            aria-label={t("common.language.switch")}
            className="text-link"
            onClick={() => setLocale("en")}
            style={{
              cursor: "pointer",
              border: "none",
              opacity: locale === "en" ? 1 : 0.75,
            }}
            type="button"
          >
            {t("common.language.en")}
          </button>
        </div>

        <p className="sidebar-footnote">{t("shell.footnote")}</p>
      </aside>

      <main className="passenger-main">
        <div className="passenger-frame">
          <header className="passenger-topbar">
            <div className="topbar-copy">
              <span className="eyebrow">{t("shell.topbarEyebrow")}</span>
              <h2>{activeItem?.label ?? t("shell.title")}</h2>
              <p>{activeItem?.note ?? t("shell.topbarDefaultNote")}</p>
            </div>
            <div className="topbar-meta">
              <span className="meta-pill">{t("shell.metaTopology")}</span>
              <span className="meta-pill">{t("shell.metaScope")}</span>
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
