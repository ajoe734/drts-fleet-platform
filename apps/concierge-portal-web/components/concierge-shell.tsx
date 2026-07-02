"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslation } from "@/lib/i18n";
import { findConciergeNavItem, getConciergeNavItems } from "@/lib/navigation";
import { formatScopeSummary } from "@/lib/api-client";
import { formatDeskMode, localizeDeskRecord } from "@/lib/desk-catalog";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

export function ConciergeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready: languageReady, setLocale, t } = useTranslation();
  const navItems = getConciergeNavItems(t);
  const activeItem = findConciergeNavItem(pathname, t);
  const { ready, session, signOut } = useConciergePortal();
  const selectedDesk = localizeDeskRecord(useSelectedDesk(), t);

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <div className="brand-stack">
          <span className="brand-badge">{t("shell.brandBadge")}</span>
          <h1>{t("shell.title")}</h1>
          <p>{t("shell.description")}</p>
        </div>

        <nav className="sidebar-nav" aria-label={t("shell.navAria")}>
          {navItems.map((item) => {
            const isActive = item.href === pathname;

            return (
              <Link
                className={`sidebar-link${isActive ? " is-active" : ""}`}
                href={item.href}
                key={item.href}
              >
                <strong>{item.label}</strong>
                <span>{item.note}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-card">
          <strong>{t("shell.scopeTitle")}</strong>
          <p>{t("shell.scopeBody", { scopes: formatScopeSummary() })}</p>
        </div>

        <p className="sidebar-footnote">{t("shell.footnote")}</p>
      </aside>

      <main className="portal-main">
        <div className="portal-frame">
          <header className="portal-topbar">
            <div className="topbar-copy">
              <span className="topbar-eyebrow">{t("shell.topbarEyebrow")}</span>
              <h2>{activeItem?.label ?? t("shell.defaultTitle")}</h2>
              <p>{activeItem?.note ?? t("shell.defaultNote")}</p>
            </div>

            <div className="topbar-stack">
              <div className="badge-row" aria-label={t("shell.language")}>
                <button
                  aria-label={t("shell.language.toZh")}
                  className="secondary-button"
                  disabled={!languageReady}
                  onClick={() => setLocale("zh")}
                  type="button"
                >
                  {t("shell.language.zh")}
                </button>
                <button
                  aria-label={t("shell.language.toEn")}
                  className="secondary-button"
                  disabled={!languageReady}
                  onClick={() => setLocale("en")}
                  type="button"
                >
                  {t("shell.language.en")}
                </button>
              </div>

              <div className="badge-row">
                <span className="meta-pill">
                  {session
                    ? t("shell.badge.session", {
                        mode: formatDeskMode(session.mode, t),
                        name: session.operatorName,
                      })
                    : t("shell.badge.bootstrapRequired")}
                </span>
                <span className="meta-pill">
                  {selectedDesk
                    ? t("shell.badge.desk", {
                        siteName: selectedDesk.siteName,
                        deskName: selectedDesk.deskName,
                      })
                    : t("shell.badge.noDesk")}
                </span>
                <span className="meta-pill">
                  {ready ? t("shell.badge.ready") : t("shell.badge.loading")}
                </span>
              </div>

              {session ? (
                <button
                  className="secondary-button"
                  onClick={() => {
                    signOut();
                    router.push("/login");
                  }}
                  type="button"
                >
                  {t("shell.clearSession")}
                </button>
              ) : null}
            </div>
          </header>

          {children}
        </div>
      </main>
    </div>
  );
}
