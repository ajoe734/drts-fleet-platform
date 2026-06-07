"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import type {
  PartnerChannelEntryRecord,
  PartnerEligibilityMode,
} from "@drts/contracts";
import { formatTenantCodeLabel } from "@/lib/localized-labels";

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

const ELIGIBILITY_NOTE: Record<PartnerEligibilityMode, string> = {
  none: "這個入口不需要資格驗證。",
  bank_card_inline: "建立訂單前需要先完成卡片資格驗證。",
  reference_required: "建立訂單前需要先完成參考代碼資格驗證。",
};

function formatPartnerAuthMode(
  authMode: PartnerChannelEntryRecord["authMode"],
) {
  switch (authMode) {
    case "tenant_portal_bearer":
      return "租戶入口權杖";
    case "partner_api_key":
      return "合作夥伴 API 金鑰";
    default:
      return formatTenantCodeLabel(authMode, authMode);
  }
}

function formatPartnerActorType(actorType: string) {
  switch (actorType) {
    case "partner_api_key":
      return "合作夥伴 API 金鑰";
    case "tenant_user":
      return "租戶使用者";
    case "tenant_admin":
      return "租戶管理員";
    default:
      return formatTenantCodeLabel(actorType, actorType);
  }
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function summarizePartnerBinding(session: PartnerSessionSummary) {
  if (session.programCode && session.bankCode) {
    return "已綁定合作方案與銀行識別。";
  }
  if (session.programCode) {
    return "已綁定合作方案。";
  }
  if (session.bankCode) {
    return "已綁定合作銀行識別。";
  }
  return "入口識別已由平台管理端確認。";
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
      <aside className="partner-sidebar" aria-label="合作夥伴導覽">
        <div className="partner-brand">
          <span className="partner-badge">合作夥伴模式</span>
          <h1>{session.displayName}</h1>
          <p className="partner-brand-note">
            {summarizePartnerBinding(session)}
          </p>
          <p className="partner-brand-note">
            {ELIGIBILITY_NOTE[session.eligibilityMode]}
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
            <strong>工作階段身分</strong>
            <p>身分 {formatPartnerActorType(session.identityActorType)}</p>
            <p>驗證方式 {formatPartnerAuthMode(session.authMode)}</p>
            <p>
              有效期限至{" "}
              <time dateTime={session.expiresAt}>
                {new Date(session.expiresAt).toLocaleString()}
              </time>
            </p>
          </div>
          <button
            className="action-button action-button-secondary"
            disabled={pending}
            onClick={() => void handleLogout()}
            type="button"
          >
            {pending ? "登出中..." : "登出合作夥伴工作階段"}
          </button>
        </div>
      </aside>

      <main className="partner-main">
        <div className="partner-frame">
          <header className="partner-topbar">
            <div className="partner-topbar-copy">
              <span className="eyebrow">受限合作夥伴工作區</span>
              <h2>{activeItem?.label ?? "合作夥伴工作區"}</h2>
              <p>
                {activeItem?.note ??
                  "合作夥伴工作區只提供入口範圍內的資格驗證與訂單建立功能。"}
              </p>
            </div>
            <div className="partner-topbar-meta">
              <span className="meta-pill">權限來源：合作夥伴受限工作區</span>
              <span className="meta-pill">不顯示租戶治理導覽</span>
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
  return (
    <div className="partner-public-shell">
      <header className="partner-public-header">
        <span className="partner-badge">合作夥伴模式</span>
        <h1>合作夥伴登入</h1>
        <p>
          這是平台提供的合作夥伴訂單入口。輸入入口別名與合作夥伴 API
          金鑰後，系統會向後端要求簽發受限工作階段。
        </p>
      </header>
      <main className="partner-public-body">{children}</main>
      <footer className="partner-public-footer">
        合作夥伴模式是受限工作區：不會暴露租戶管理治理、人員、稽核、API
        金鑰、回呼或設定頁。
      </footer>
    </div>
  );
}
