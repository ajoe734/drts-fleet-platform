"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { CanvasIcon, CanvasWindowChrome } from "@drts/ui-web";
import {
  enterpriseTenant,
  getEnterpriseUser,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme } from "@/lib/enterprise-theme";
import { useTranslation } from "@/lib/i18n";

export interface EnterpriseShellProps {
  children: ReactNode;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function topLinkStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 14px",
    borderRadius: 10,
    fontSize: 13.5,
    fontWeight: active ? 700 : 500,
    color: active ? enterpriseTheme.accent : enterpriseTheme.text,
    background: active ? enterpriseTheme.accentBg : "transparent",
    textDecoration: "none",
  };
}

function iconButtonStyle(): CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: 999,
    border: `1px solid ${enterpriseTheme.border}`,
    background: enterpriseTheme.surface,
    color: enterpriseTheme.textMuted,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };
}

function UserChip() {
  const { locale } = useTranslation();
  const user = getEnterpriseUser(locale);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          background: enterpriseTheme.accentBg,
          border: `1px solid ${enterpriseTheme.accentBorder}`,
          color: enterpriseTheme.accent,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        林
      </span>
      <span style={{ lineHeight: 1.15 }}>
        <span
          style={{
            display: "block",
            fontSize: 12.5,
            fontWeight: 600,
            color: enterpriseTheme.text,
          }}
        >
          林宜君
        </span>
        <span
          style={{
            display: "block",
            fontSize: 10.5,
            color: enterpriseTheme.textMuted,
          }}
        >
          {user.role}
        </span>
      </span>
    </div>
  );
}

export function EnterpriseShell({ children }: EnterpriseShellProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const tenantIdentity = {
    mark: "鴻",
    name: enterpriseTenant.name,
    subtitle: t("shell.tenantSubtitle"),
    operator: t("shell.operator"),
  };
  const navItems = [
    { key: "home", href: "/", label: t("shell.nav.home") },
    { key: "bookings", href: "/bookings", label: t("shell.nav.bookings") },
    { key: "trip", href: "/trip", label: t("shell.nav.trip") },
    { key: "help", href: "/help", label: t("shell.nav.help") },
  ] as const;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: enterpriseTheme.bg,
        color: enterpriseTheme.text,
        fontFamily: enterpriseTheme.fontFamily,
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          borderBottom: `1px solid ${enterpriseTheme.border}`,
          background: enterpriseTheme.surface,
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "0 24px",
            minHeight: 60,
            display: "flex",
            alignItems: "center",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{ display: "inline-flex", alignItems: "center", gap: 11 }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: `linear-gradient(150deg, ${enterpriseTheme.accent}, ${enterpriseTheme.info})`,
                color: enterpriseTheme.surface,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                fontWeight: 800,
              }}
            >
              {tenantIdentity.mark}
            </span>
            <span style={{ lineHeight: 1.15 }}>
              <span
                style={{
                  display: "block",
                  fontSize: 14.5,
                  fontWeight: 700,
                }}
              >
                {tenantIdentity.name}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 10.5,
                  color: enterpriseTheme.textMuted,
                }}
              >
                {tenantIdentity.subtitle}
              </span>
            </span>
          </div>

          <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                style={topLinkStyle(isActive(pathname, item.href))}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${enterpriseTheme.border}`,
                background: enterpriseTheme.surface,
                fontSize: 12,
                color: enterpriseTheme.text,
              }}
            >
              <CanvasIcon
                name="clock"
                size={13}
                style={{ color: enterpriseTheme.accent }}
              />
              {t("shell.quota")}
              <strong style={{ fontFamily: enterpriseTheme.monoFamily }}>
                NT$ 31,000
              </strong>
            </span>
            <button
              type="button"
              style={iconButtonStyle()}
              title={t("shell.supportNotifications")}
            >
              <CanvasIcon name="bell" size={14} />
            </button>
            <UserChip />
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "8px 24px 36px",
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          fontSize: 11,
          color: enterpriseTheme.textDim,
        }}
      >
        <span>
          © 2026 {tenantIdentity.name} · {t("shell.footer.product")}
        </span>
        <span>
          {t("shell.footer.operatedBy", { operator: tenantIdentity.operator })}
        </span>
      </footer>
    </div>
  );
}

export function EnterpriseEmbedShell({
  children,
  host = "hongshuo-workspace",
  state = "live",
}: {
  children: ReactNode;
  host?: string;
  state?: "live" | "warn" | "err" | "neutral";
}) {
  const { t } = useTranslation();
  const tenantIdentity = {
    name: enterpriseTenant.name,
  };
  const statusColor =
    state === "live"
      ? enterpriseTheme.success
      : state === "warn"
        ? enterpriseTheme.warn
        : state === "err"
          ? enterpriseTheme.danger
          : enterpriseTheme.textMuted;

  return (
    <CanvasWindowChrome
      width="100%"
      height={720}
      outerPadding={20}
      style={{ background: enterpriseTheme.bg }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: enterpriseTheme.bg,
          color: enterpriseTheme.text,
          fontFamily: enterpriseTheme.fontFamily,
        }}
      >
        <div
          style={{
            height: 44,
            background: enterpriseTheme.info,
            color: enterpriseTheme.surface,
            padding: "0 20px 6px",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          <span>9:41</span>
          <span
            style={{ display: "inline-flex", gap: 5, alignItems: "center" }}
          >
            <CanvasIcon name="clock" size={12} />
            <CanvasIcon name="health" size={12} />
          </span>
        </div>

        <div
          style={{
            background: enterpriseTheme.info,
            color: enterpriseTheme.surface,
            padding: "4px 12px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <button
            type="button"
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              background: enterpriseTheme.accentBg,
              border: "none",
              color: enterpriseTheme.surface,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <CanvasIcon
              name="chevR"
              size={16}
              style={{ transform: "rotate(180deg)" }}
            />
          </button>
          <div style={{ flex: 1, lineHeight: 1.2 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>
              {t("shell.embed.title")}
            </div>
            <div style={{ fontSize: 10, opacity: 0.74 }}>
              {t("shell.embed.subtitle", { tenant: tenantIdentity.name })}
            </div>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 9.5,
              fontFamily: enterpriseTheme.monoFamily,
              background: enterpriseTheme.accentBg,
              padding: "4px 8px",
              borderRadius: 999,
            }}
          >
            <CanvasIcon name="health" size={10} />
            {host}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            background: enterpriseTheme.surface,
            borderBottom: `1px solid ${enterpriseTheme.border}`,
            fontSize: 10.5,
            color: enterpriseTheme.textMuted,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: statusColor,
            }}
          />
          <span style={{ fontFamily: enterpriseTheme.monoFamily }}>
            webview
          </span>
          <span>{t("shell.embed.status", { tenant: tenantIdentity.name })}</span>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
      </div>
    </CanvasWindowChrome>
  );
}
