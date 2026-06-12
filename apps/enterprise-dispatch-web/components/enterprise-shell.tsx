"use client";

import {
  CanvasBtn,
  CanvasIcon,
  CanvasShell,
  CanvasWindowChrome,
  type CanvasShellNavItem,
} from "@drts/ui-web";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { enterpriseTheme } from "@/lib/enterprise-theme";

type FreshnessState = "fresh" | "stale" | "degraded" | "unknown";
type HealthState = "healthy" | "degraded" | "down";

export interface EnterpriseShellProps {
  children: ReactNode;
}

const enterpriseNav: CanvasShellNavItem[] = [
  {
    key: "overview",
    href: "/",
    label: "Dispatch Overview",
    icon: "dashboard",
  },
  {
    key: "reassignments",
    href: "/reassignments",
    label: "Reassignments",
    icon: "dispatch",
    badge: "2",
    badgeTone: "warn",
    matchPaths: ["/reassignments"],
  },
  {
    key: "supply",
    href: "/supply",
    label: "Supply Coverage",
    icon: "fleet",
    badge: "1",
    badgeTone: "danger",
    matchPaths: ["/supply"],
  },
];

function iconButtonStyle(): CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: 7,
    background: "transparent",
    border: "1px solid transparent",
    color: enterpriseTheme.textMuted,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };
}

function RefreshTierBadge({
  code,
  seconds,
  freshness,
}: {
  code: string;
  seconds: number | null;
  freshness: FreshnessState;
}) {
  const tones = {
    fresh: {
      fg: enterpriseTheme.success,
      bg: enterpriseTheme.successBg,
      bd: enterpriseTheme.successBorder,
      label: "fresh",
    },
    stale: {
      fg: enterpriseTheme.warn,
      bg: enterpriseTheme.warnBg,
      bd: enterpriseTheme.warnBorder,
      label: "stale",
    },
    degraded: {
      fg: enterpriseTheme.danger,
      bg: enterpriseTheme.dangerBg,
      bd: enterpriseTheme.dangerBorder,
      label: "degraded",
    },
    unknown: {
      fg: enterpriseTheme.textMuted,
      bg: enterpriseTheme.neutralBg,
      bd: enterpriseTheme.neutralBorder,
      label: "unknown",
    },
  } as const;

  const tone = tones[freshness];

  return (
    <div
      title="Dispatch refresh metadata"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 6,
        background: tone.bg,
        border: `1px solid ${tone.bd}`,
        fontSize: 10.5,
        fontWeight: 600,
        color: tone.fg,
        fontFamily: enterpriseTheme.monoFamily,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          background: tone.fg,
          flexShrink: 0,
        }}
      />
      <span>{code}</span>
      <span>{seconds === null ? "MANUAL" : `${seconds}s`}</span>
      {freshness !== "fresh" ? <span>· {tone.label}</span> : null}
    </div>
  );
}

function IdentityChip() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 1,
        background: enterpriseTheme.surfaceLo,
        border: `1px solid ${enterpriseTheme.border}`,
        borderRadius: 7,
        overflow: "hidden",
        height: 28,
      }}
    >
      <div
        style={{
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: enterpriseTheme.accentBg,
          color: enterpriseTheme.accent,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: 999,
            background: enterpriseTheme.accent,
          }}
        />
        OPS
      </div>
      <div
        style={{
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          color: enterpriseTheme.success,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          fontFamily: enterpriseTheme.monoFamily,
        }}
      >
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: 999,
            background: enterpriseTheme.success,
          }}
        />
        production
      </div>
      <div
        style={{
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          borderLeft: `1px solid ${enterpriseTheme.border}`,
          color: enterpriseTheme.textMuted,
          fontSize: 11,
          fontWeight: 600,
          fontFamily: enterpriseTheme.monoFamily,
        }}
      >
        ent_dispatch
      </div>
      <div
        style={{
          padding: "0 8px 0 6px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderLeft: `1px solid ${enterpriseTheme.border}`,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            background: enterpriseTheme.accentBg,
            color: enterpriseTheme.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9.5,
            fontWeight: 700,
            border: `1px solid ${enterpriseTheme.accentBorder}`,
          }}
        >
          YL
        </div>
        <span
          style={{
            fontSize: 11.5,
            color: enterpriseTheme.text,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          林宜君
        </span>
      </div>
    </div>
  );
}

function HealthFooter({
  state,
  lastCheckedAt,
}: {
  state: HealthState;
  lastCheckedAt: string;
}) {
  const tones = {
    healthy: {
      fg: enterpriseTheme.success,
      bg: enterpriseTheme.successBg,
      label: "API healthy",
      code: "healthy",
    },
    degraded: {
      fg: enterpriseTheme.warn,
      bg: enterpriseTheme.warnBg,
      label: "API degraded",
      code: "degraded",
    },
    down: {
      fg: enterpriseTheme.danger,
      bg: enterpriseTheme.dangerBg,
      label: "API down",
      code: "down",
    },
  } as const;

  const tone = tones[state];

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 8px",
          borderRadius: 6,
          background: tone.bg,
          fontSize: 11,
          fontWeight: 600,
          color: tone.fg,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: tone.fg,
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1 }}>{tone.label}</span>
        <span style={{ fontFamily: enterpriseTheme.monoFamily, opacity: 0.7 }}>
          {tone.code}
        </span>
      </div>
      <div
        style={{
          fontSize: 10,
          color: enterpriseTheme.textDim,
          display: "flex",
          justifyContent: "space-between",
          padding: "0 2px",
        }}
      >
        <span>last checked</span>
        <span style={{ fontFamily: enterpriseTheme.monoFamily }}>
          {lastCheckedAt} ago
        </span>
      </div>
    </div>
  );
}

export function EnterpriseShell({ children }: EnterpriseShellProps) {
  const pathname = usePathname();

  return (
    <CanvasShell
      theme={enterpriseTheme}
      nav={enterpriseNav}
      currentPath={pathname}
      brandLabel="Enterprise Dispatch"
      brandSubLabel="Dispatch Workspace"
      title="Enterprise Dispatch"
      env="production"
      versionLabel="v1-shell"
      sidebarFooter={<HealthFooter state="healthy" lastCheckedAt="14s" />}
      headerControls={
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "5px 10px",
              borderRadius: 7,
              background: enterpriseTheme.surfaceLo,
              border: `1px solid ${enterpriseTheme.border}`,
              width: 220,
              color: enterpriseTheme.textMuted,
            }}
          >
            <CanvasIcon name="search" size={13} />
            <span style={{ fontSize: 12, color: enterpriseTheme.textDim }}>
              Search bookings, riders, drivers
            </span>
          </div>
          <div
            style={{
              fontFamily: enterpriseTheme.monoFamily,
              fontSize: 10.5,
              padding: "2px 6px",
              borderRadius: 5,
              border: `1px solid ${enterpriseTheme.border}`,
              background: enterpriseTheme.surfaceLo,
              color: enterpriseTheme.textMuted,
              fontWeight: 600,
            }}
          >
            ⌘K
          </div>
          <RefreshTierBadge
            code="MEDIUM_SLOW"
            seconds={30}
            freshness="fresh"
          />
          <button type="button" style={iconButtonStyle()} title="Open alerts">
            <CanvasIcon name="bell" size={15} />
          </button>
          <IdentityChip />
        </>
      }
    >
      {children}
    </CanvasShell>
  );
}

export function EnterpriseEmbedShell({
  children,
  host = "tenant portal",
  state = "live",
}: {
  children: ReactNode;
  host?: string;
  state?: "live" | "warn" | "err" | "neutral";
}) {
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
      style={{ background: "#ece9e2" }}
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
            background: enterpriseTheme.accent,
            color: "#fff",
            padding: "10px 14px 11px",
            display: "flex",
            alignItems: "center",
            gap: 9,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: "rgba(255,255,255,0.14)",
              border: "none",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CanvasIcon
              name="arrow"
              size={16}
              style={{ transform: "rotate(180deg)" }}
            />
          </button>
          <div style={{ flex: 1, lineHeight: 1.2 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>
              Enterprise Dispatch
            </div>
            <div style={{ fontSize: 10, opacity: 0.72 }}>
              Embedded operator workspace
            </div>
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 9.5,
              fontFamily: enterpriseTheme.monoFamily,
              opacity: 0.8,
              background: "rgba(255,255,255,0.1)",
              padding: "4px 8px",
              borderRadius: 999,
            }}
          >
            <CanvasIcon name="ext" size={10} />
            {host}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            background: "#fff",
            borderBottom: `1px solid ${enterpriseTheme.border}`,
            fontSize: 10.5,
            color: enterpriseTheme.textMuted,
            flexShrink: 0,
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
          <span style={{ fontFamily: enterpriseTheme.monoFamily }}>webview</span>
          <span>· embedded in {host}</span>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
      </div>
    </CanvasWindowChrome>
  );
}

export function EnterpriseShellActions() {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <CanvasBtn theme={enterpriseTheme} variant="secondary" size="xs">
        Mirror window
      </CanvasBtn>
      <CanvasBtn theme={enterpriseTheme} variant="primary" size="xs">
        Open dispatch
      </CanvasBtn>
    </div>
  );
}
