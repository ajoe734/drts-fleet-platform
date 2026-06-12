"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import type {
  PartnerChannelEntryRecord,
  PartnerEligibilityMode,
} from "@drts/contracts";
import { useTranslation } from "@/lib/i18n";

export type PartnerNavItem = {
  href: string;
  label: string;
  note: string;
};

type PartnerSessionSummary = {
  partnerCode: string;
  displayName: string;
  entrySlug: string;
  programCode: string | null;
  bankCode: string | null;
  eligibilityMode: PartnerEligibilityMode;
  authMode: PartnerChannelEntryRecord["authMode"];
  themeAccent: string | null;
  identityActorType: string;
  identityActorId: string | null;
  expiresAt: string;
};

const ELIGIBILITY_NOTE_KEY: Record<PartnerEligibilityMode, string> = {
  none: "partner.shell.eligibility.none",
  bank_card_inline: "partner.shell.eligibility.bankCard",
  reference_required: "partner.shell.eligibility.reference",
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function formatDateTime(value: string, locale: "en" | "zh") {
  return new Date(value).toLocaleString(locale === "zh" ? "zh-TW" : "en-US");
}

export function PartnerAuthenticatedShell({
  session,
  navItems,
  children,
}: {
  session: PartnerSessionSummary;
  navItems: PartnerNavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, t } = useTranslation();
  const [pending, startTransition] = useTransition();

  async function handleLogout() {
    const response = await fetch("/api/partner/session", { method: "DELETE" });
    if (response.ok) {
      startTransition(() => {
        router.push("/partner/login");
        router.refresh();
      });
    }
  }

  const activeItem = navItems.find((item) => isActive(pathname, item.href));

  return (
    <div
      className="partner-shell"
      style={
        session.themeAccent
          ? ({ "--partner-accent": session.themeAccent } as React.CSSProperties)
          : undefined
      }
    >
      <aside
        className="partner-sidebar"
        aria-label={t("partner.shell.navAria")}
      >
        <div className="partner-brand">
          <span className="partner-badge">{t("partner.shell.badge")}</span>
          <h1>{session.displayName}</h1>
          <p className="partner-brand-note">
            {t("partner.shell.entrySlug")} <code>{session.entrySlug}</code>
            {session.programCode ? (
              <>
                {" · "}
                {t("partner.shell.program")} <code>{session.programCode}</code>
              </>
            ) : null}
            {session.bankCode ? (
              <>
                {" · "}
                {t("partner.shell.bank")} <code>{session.bankCode}</code>
              </>
            ) : null}
          </p>
          <p className="partner-brand-note">
            {t(ELIGIBILITY_NOTE_KEY[session.eligibilityMode])}
          </p>
        </div>

        <nav className="partner-nav">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                className={`partner-nav-link${active ? " is-active" : ""}`}
                href={item.href}
                key={item.href}
              >
                <strong>{item.label}</strong>
                <span>{item.note}</span>
              </Link>
            );
          })}
        </nav>

        <div className="partner-sidebar-footer">
          <div className="partner-identity">
            <strong>{t("partner.shell.identity")}</strong>
            <p>
              {t("partner.shell.actor")}{" "}
              <code>{session.identityActorType}</code>
              {session.identityActorId ? (
                <>
                  {" · "}id <code>{session.identityActorId}</code>
                </>
              ) : null}
            </p>
            <p>
              {t("partner.shell.authMode")} <code>{session.authMode}</code>
            </p>
            <p>
              {t("partner.shell.sessionValidUntil")}{" "}
              <time dateTime={session.expiresAt}>
                {formatDateTime(session.expiresAt, locale)}
              </time>
            </p>
          </div>
          <button
            className="action-button action-button-secondary"
            disabled={pending}
            onClick={() => void handleLogout()}
            type="button"
          >
            {pending
              ? t("partner.shell.signingOut")
              : t("partner.shell.signOut")}
          </button>
        </div>
      </aside>

      <main className="partner-main">
        <div className="partner-frame">
          <header className="partner-topbar">
            <div className="partner-topbar-copy">
              <span className="eyebrow">
                {t("partner.shell.topbarEyebrow")}
              </span>
              <h2>{activeItem?.label ?? t("partner.shell.workspaceTitle")}</h2>
              <p>
                {activeItem?.note ?? t("partner.shell.workspaceDescription")}
              </p>
            </div>
            <div className="partner-topbar-meta">
              <span className="meta-pill">{t("partner.shell.authority")}</span>
              <span className="meta-pill">
                {t("partner.shell.noTenantAdminNav")}
              </span>
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}

export function PartnerPublicShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="partner-public-shell">
      <header className="partner-public-header">
        <span className="partner-badge">{t("partner.shell.badge")}</span>
        <h1>{t("partner.public.title")}</h1>
        <p>{t("partner.public.description")}</p>
      </header>
      <section className="partner-public-body">{children}</section>
      <footer className="partner-public-footer">
        {t("partner.public.footer")}
      </footer>
    </div>
  );
}
