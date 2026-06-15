"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { EAvatar, EIcon } from "@/components/ent-kit";
import {
  enterpriseQuotaSummary,
  enterpriseTenant,
  getEnterpriseUser,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { useTranslation } from "@/lib/i18n";

const TENANT_MARK = "鴻";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function topLinkStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 13px",
    borderRadius: 9,
    fontSize: 13.5,
    fontWeight: active ? 700 : 500,
    color: active ? t.primary : t.ink2,
    background: active ? t.primaryBg : "transparent",
    textDecoration: "none",
  };
}

// ── workspace top nav (S1) ───────────────────────────────────────────────────
export function EnterpriseShell({ children }: { children: ReactNode }) {
  const { t: tr, locale } = useTranslation();
  const pathname = usePathname() ?? "/";
  const tenant = enterpriseTenant;
  const user = getEnterpriseUser(locale);
  const quota = enterpriseQuotaSummary;

  const navItems = [
    { key: "home", href: "/", label: tr("shell.nav.home") },
    { key: "bookings", href: "/bookings", label: tr("shell.nav.bookings") },
    { key: "trip", href: "/trip", label: tr("shell.nav.trip") },
    { key: "help", href: "/help", label: tr("shell.nav.help") },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: t.bg,
        color: t.ink,
        fontFamily: t.sans,
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          borderBottom: `1px solid ${t.line}`,
          background: t.dark ? "rgba(14,19,32,.86)" : "rgba(255,255,255,.86)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "0 26px",
            minHeight: 60,
            display: "flex",
            alignItems: "center",
            gap: 26,
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
                borderRadius: 9,
                background: `linear-gradient(150deg, ${t.primary}, ${t.primaryHi})`,
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                fontWeight: 800,
              }}
            >
              {TENANT_MARK}
            </span>
            <span style={{ lineHeight: 1.15 }}>
              <span
                style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}
              >
                {tenant.name}
              </span>
              <span
                style={{ display: "block", fontSize: 10.5, color: t.muted }}
              >
                {tr("shell.tenantSubtitle")}
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
                border: `1px solid ${t.line}`,
                background: t.surface,
                fontSize: 12,
                color: t.ink2,
              }}
            >
              <EIcon name="bolt" size={13} style={{ color: t.primary }} />
              {tr("shell.quota")}
              <strong style={{ fontFamily: t.mono }}>{quota.rides}</strong>
            </span>
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <EAvatar t={t} name={user.name} size={30} />
              <span style={{ lineHeight: 1.15 }}>
                <span
                  style={{ display: "block", fontSize: 12.5, fontWeight: 600 }}
                >
                  {user.name}
                </span>
                <span
                  style={{ display: "block", fontSize: 10.5, color: t.muted }}
                >
                  {user.role}
                </span>
              </span>
            </span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "26px" }}>
        {children}
      </main>

      <footer
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "8px 26px 40px",
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          fontSize: 11,
          color: t.faint,
        }}
      >
        <span>
          © 2026 {tenant.name} · {tr("shell.footer.product")}
        </span>
        <span>
          {tr("shell.footer.operatedBy", { operator: tr("shell.operator") })}
        </span>
      </footer>
    </div>
  );
}

// page header inside a web shell
export function EntPageHead({
  title,
  sub,
  back,
  actions,
  meta,
}: {
  title: ReactNode;
  sub?: ReactNode;
  back?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 20,
      }}
    >
      <div style={{ flex: 1 }}>
        {back && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              color: t.muted,
              marginBottom: 8,
            }}
          >
            <EIcon
              name="chevR"
              size={13}
              style={{ transform: "rotate(180deg)" }}
            />
            {back}
          </div>
        )}
        <h1
          style={{
            fontSize: 25,
            fontWeight: 800,
            letterSpacing: -0.5,
            margin: 0,
            color: t.ink,
          }}
        >
          {title}
        </h1>
        {sub && (
          <p
            style={{
              fontSize: 14,
              color: t.muted,
              margin: "6px 0 0",
              lineHeight: 1.5,
            }}
          >
            {sub}
          </p>
        )}
        {meta && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 12,
            }}
          >
            {meta}
          </div>
        )}
      </div>
      {actions && (
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>{actions}</div>
      )}
    </div>
  );
}

// ── compact embed shell (S2) — fills the host webview viewport ────────────────
export function EnterpriseEmbedShell({
  children,
  host = "hongshuo-workspace",
  state = "live",
  footer,
}: {
  children: ReactNode;
  host?: string;
  state?: "live" | "warn" | "err" | "neutral";
  footer?: ReactNode;
}) {
  const { t: tr } = useTranslation();
  const tenant = enterpriseTenant;
  const dotC =
    state === "live"
      ? t.success
      : state === "warn"
        ? t.warn
        : state === "err"
          ? t.danger
          : t.faint;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: t.bg,
        color: t.ink,
        fontFamily: t.sans,
      }}
    >
      {/* host app status bar */}
      <div
        style={{
          height: 44,
          flexShrink: 0,
          background: t.dark ? "#0B0F1A" : t.primaryHi,
          color: "#fff",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "0 22px 6px",
          fontSize: 12.5,
          fontWeight: 600,
        }}
      >
        <span>9:41</span>
        <span
          style={{
            display: "inline-flex",
            gap: 5,
            alignItems: "center",
            opacity: 0.9,
          }}
        >
          <EIcon name="bolt" size={12} />
          <EIcon name="shield" size={12} />
        </span>
      </div>

      {/* host app chrome */}
      <div
        style={{
          flexShrink: 0,
          background: t.dark ? "#0B0F1A" : t.primaryHi,
          color: "#fff",
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
            borderRadius: 15,
            background: "rgba(255,255,255,.16)",
            border: "none",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <EIcon
            name="chevR"
            size={16}
            style={{ transform: "rotate(180deg)" }}
          />
        </button>
        <div style={{ flex: 1, lineHeight: 1.2 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>
            {tr("shell.embed.title")}
          </div>
          <div style={{ fontSize: 10, opacity: 0.74 }}>
            {tr("shell.embed.subtitle", { tenant: tenant.name })}
          </div>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 9.5,
            fontFamily: t.mono,
            opacity: 0.75,
            background: "rgba(255,255,255,.12)",
            padding: "4px 8px",
            borderRadius: 999,
          }}
        >
          <EIcon name="lock" size={10} />
          {host}
        </span>
      </div>

      {/* webview surface badge */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 14px",
          background: t.surface,
          borderBottom: `1px solid ${t.line}`,
          fontSize: 10.5,
          color: t.muted,
        }}
      >
        <span
          style={{ width: 6, height: 6, borderRadius: 3, background: dotC }}
        />
        <span style={{ fontFamily: t.mono }}>webview</span>
        <span style={{ color: t.faint }}>
          {tr("shell.embed.status", { tenant: tenant.name })}
        </span>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>{children}</div>

      {footer && (
        <div
          style={{
            flexShrink: 0,
            borderTop: `1px solid ${t.line}`,
            background: t.surface,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 9,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
