"use client";

import React, { type CSSProperties } from "react";
import { useTranslation } from "@/lib/i18n";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const adapterGridStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const titleRowStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const authorityCopyStyle = {
  color: theme.textDim,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const actionSectionStyle = {
  display: "grid",
  gap: 10,
  marginTop: 12,
} satisfies CSSProperties;

const actionLaneStyle = {
  display: "grid",
  gap: 8,
  paddingTop: 12,
  borderTop: `1px solid ${theme.border}`,
} satisfies CSSProperties;

const actionLaneHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const actionLabelStyle = {
  color: theme.text,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
} satisfies CSSProperties;

const buttonRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const laneSummaryStyle = {
  color: theme.textDim,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const noop = () => {};

type AdapterStatus = "healthy" | "degraded" | "renewal_overdue";
type AdapterKind = "forwarder" | "auth" | "filing";
type ActionScope = "platform" | "ops";

type AdapterAction = {
  label: string;
  scope: ActionScope;
  icon?: "plus" | "apiKeys" | "arrow";
  danger?: boolean;
  disabled?: boolean;
};

type AdapterRecord = {
  id: string;
  source: string;
  kind: AdapterKind;
  status: AdapterStatus;
  latency: string;
  last: string;
  orders24h: string;
  authoritySummary: string;
  opsSummary: string;
  actions: AdapterAction[];
};

const adapters: AdapterRecord[] = [
  {
    id: "srx-v3",
    source: "SmartRides X",
    kind: "forwarder",
    status: "healthy",
    latency: "142ms",
    last: "2s ago",
    orders24h: "1,421",
    authoritySummary:
      "Platform Admin owns credential writes, rotation, and hard disable.",
    opsSummary: "Ops can issue a temporary pause while traffic keeps flowing.",
    actions: [
      { label: "Edit credential", scope: "platform", icon: "apiKeys" },
      { label: "Rotate", scope: "platform", icon: "arrow" },
      { label: "Disable", scope: "platform", danger: true },
      { label: "Ops pause (TTL)", scope: "ops" },
    ],
  },
  {
    id: "gocab-v1",
    source: "GoCab",
    kind: "forwarder",
    status: "degraded",
    latency: "780ms",
    last: "8s ago",
    orders24h: "220",
    authoritySummary:
      "Platform Admin keeps authority for credential cutover and disable.",
    opsSummary:
      "Ops owns temporary pause and retry handling while backlog drains.",
    actions: [
      { label: "Edit credential", scope: "platform", icon: "apiKeys" },
      { label: "Rotate", scope: "platform", icon: "arrow" },
      { label: "Disable", scope: "platform", danger: true },
      { label: "Ops pause (TTL)", scope: "ops" },
      { label: "Retry backlog", scope: "ops" },
    ],
  },
  {
    id: "ctbc-oauth",
    source: "中信 OAuth",
    kind: "auth",
    status: "healthy",
    latency: "88ms",
    last: "1s ago",
    orders24h: "N/A",
    authoritySummary:
      "Platform Admin governs client secret rotation and redirect policy.",
    opsSummary: "Ops receives incident handoff only; no auth writes here.",
    actions: [
      { label: "Edit credential", scope: "platform", icon: "apiKeys" },
      { label: "Rotate", scope: "platform", icon: "arrow" },
      { label: "Disable", scope: "platform", danger: true },
      { label: "View handoff", scope: "ops" },
    ],
  },
  {
    id: "cathay-magic",
    source: "國泰 Magic Link",
    kind: "auth",
    status: "healthy",
    latency: "110ms",
    last: "3s ago",
    orders24h: "N/A",
    authoritySummary:
      "Platform Admin owns callback allowlist and approved secret rotation.",
    opsSummary: "Ops can inspect incident handoff context only.",
    actions: [
      { label: "Edit credential", scope: "platform", icon: "apiKeys" },
      { label: "Rotate", scope: "platform", icon: "arrow" },
      { label: "Disable", scope: "platform", danger: true },
      { label: "View handoff", scope: "ops" },
    ],
  },
  {
    id: "mof-einv",
    source: "財政部電子發票",
    kind: "filing",
    status: "healthy",
    latency: "320ms",
    last: "12m ago",
    orders24h: "N/A",
    authoritySummary:
      "Platform Admin controls filing credentials and mapping policy.",
    opsSummary:
      "Ops observes reconciliation impact only; no pause or retry from this route.",
    actions: [
      { label: "Edit credential", scope: "platform", icon: "apiKeys" },
      { label: "Rotate", scope: "platform", icon: "arrow" },
      { label: "Disable", scope: "platform", danger: true },
      { label: "Observe only", scope: "ops", disabled: true },
    ],
  },
  {
    id: "mof-bgmt",
    source: "BGMT 派遣回報",
    kind: "filing",
    status: "renewal_overdue",
    latency: "N/A",
    last: "4h ago",
    orders24h: "N/A",
    authoritySummary:
      "Token renewal and hard disable remain in Platform Admin with audited reason capture.",
    opsSummary:
      "Ops tracks missed completion reports but cannot renew this token here.",
    actions: [
      { label: "Edit credential", scope: "platform", icon: "apiKeys" },
      { label: "Rotate", scope: "platform", icon: "arrow" },
      { label: "Disable", scope: "platform", danger: true },
      { label: "View handoff", scope: "ops" },
    ],
  },
];

function getKindTone(kind: AdapterKind) {
  switch (kind) {
    case "forwarder":
      return "info";
    case "auth":
      return "accent";
    case "filing":
    default:
      return "neutral";
  }
}

function getStatusTone(status: AdapterStatus) {
  switch (status) {
    case "healthy":
      return "success";
    case "degraded":
      return "warn";
    case "renewal_overdue":
    default:
      return "danger";
  }
}

function getActionProps(action: AdapterAction) {
  return {
    ...(action.icon ? { icon: action.icon } : {}),
    ...(action.danger ? { danger: true } : {}),
    ...(action.disabled ? { disabled: true } : {}),
  };
}

export default function AdapterRegistryPage() {
  const { locale } = useTranslation();
  const copy =
    locale === "en"
      ? {
          title: "External Platform Adapter Registry",
          subtitle:
            "Config and credential governance stays in Platform Admin; operational pause and retry stay in Ops per Q-ADM17 split authority.",
          createAction: "Register adapter",
          rotateAction: "Rotate now",
          dangerTitle: "mof-bgmt token expires in 6 days",
          dangerBody:
            "The BGMT dispatch reporting token must rotate before May 31, 2026 or completion reports for today cannot reach the upstream endpoint.",
          platformAuthority: "Platform Admin",
          opsAuthority: "Ops Console",
          platformScope: "Write authority",
          opsScope: "Operational handoff",
          latency: "LATENCY",
          lastEvent: "LAST EVENT",
          orders24h: "ORDERS 24H",
          healthy: "healthy",
          degraded: "degraded",
          renewalOverdue: "renewal overdue",
          forwarder: "forwarder",
          auth: "auth",
          filing: "filing",
        }
      : {
          title: "External Platform Adapter Registry",
          subtitle:
            "config / credential 治理留在 Platform Admin；operational pause / retry 依 Q-ADM17 留在 Ops。",
          createAction: "註冊 adapter",
          rotateAction: "立即輪替",
          dangerTitle: "mof-bgmt token 距到期 6 天",
          dangerBody:
            "BGMT 派遣回報 token 必須在 2026 年 5 月 31 日前輪替，否則今日完成單將無法送達上游。",
          platformAuthority: "Platform Admin",
          opsAuthority: "Ops Console",
          platformScope: "Write authority",
          opsScope: "Operational handoff",
          latency: "LATENCY",
          lastEvent: "LAST EVENT",
          orders24h: "ORDERS 24H",
          healthy: "healthy",
          degraded: "degraded",
          renewalOverdue: "renewal overdue",
          forwarder: "forwarder",
          auth: "auth",
          filing: "filing",
        };

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <CanvasBtn theme={theme} variant="primary" icon="plus" onClick={noop}>
            {copy.createAction}
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        <style jsx>{`
          .adapter-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          @media (max-width: 1080px) {
            .adapter-grid {
              grid-template-columns: minmax(0, 1fr);
            }
          }
        `}</style>

        <CanvasBanner
          theme={theme}
          tone="danger"
          icon="warn"
          title={copy.dangerTitle}
          body={copy.dangerBody}
          actions={
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="arrow"
              onClick={noop}
            >
              {copy.rotateAction}
            </CanvasBtn>
          }
        />

        <div className="adapter-grid" style={adapterGridStyle}>
          {adapters.map((adapter) => {
            const statusLabel =
              adapter.status === "healthy"
                ? copy.healthy
                : adapter.status === "degraded"
                  ? copy.degraded
                  : copy.renewalOverdue;

            const kindLabel =
              adapter.kind === "forwarder"
                ? copy.forwarder
                : adapter.kind === "auth"
                  ? copy.auth
                  : copy.filing;

            const platformActions = adapter.actions.filter(
              (action) => action.scope === "platform",
            );
            const opsActions = adapter.actions.filter(
              (action) => action.scope === "ops",
            );

            return (
              <CanvasCard
                key={adapter.id}
                theme={theme}
                title={
                  <span style={titleRowStyle}>
                    <span>{adapter.source}</span>
                    <CanvasPill theme={theme} tone={getKindTone(adapter.kind)}>
                      {kindLabel}
                    </CanvasPill>
                  </span>
                }
                subtitle={adapter.id}
                actions={
                  <CanvasPill
                    theme={theme}
                    tone={getStatusTone(adapter.status)}
                    dot
                  >
                    {statusLabel}
                  </CanvasPill>
                }
              >
                <CanvasDL
                  theme={theme}
                  cols={3}
                  items={[
                    { k: copy.latency, v: adapter.latency, mono: true },
                    { k: copy.lastEvent, v: adapter.last, mono: true },
                    { k: copy.orders24h, v: adapter.orders24h, mono: true },
                  ]}
                />

                <div style={actionSectionStyle}>
                  <div style={actionLaneStyle}>
                    <div style={actionLaneHeaderStyle}>
                      <div style={actionLabelStyle}>
                        {copy.platformAuthority}
                      </div>
                      <CanvasPill theme={theme} tone="accent">
                        {copy.platformScope}
                      </CanvasPill>
                    </div>

                    <div style={authorityCopyStyle}>
                      {adapter.authoritySummary}
                    </div>

                    <div style={buttonRowStyle}>
                      {platformActions.map((action) => (
                        <CanvasBtn
                          key={`${adapter.id}-${action.label}`}
                          theme={theme}
                          variant="secondary"
                          size="sm"
                          onClick={noop}
                          {...getActionProps(action)}
                        >
                          {action.label}
                        </CanvasBtn>
                      ))}
                    </div>
                  </div>

                  <div style={actionLaneStyle}>
                    <div style={actionLaneHeaderStyle}>
                      <div style={actionLabelStyle}>{copy.opsAuthority}</div>
                      <CanvasPill theme={theme} tone="info">
                        {copy.opsScope}
                      </CanvasPill>
                    </div>

                    <div style={laneSummaryStyle}>{adapter.opsSummary}</div>

                    <div style={buttonRowStyle}>
                      {opsActions.map((action) => (
                        <CanvasBtn
                          key={`${adapter.id}-${action.label}`}
                          theme={theme}
                          variant="secondary"
                          size="sm"
                          onClick={noop}
                          {...getActionProps(action)}
                        >
                          {action.label}
                        </CanvasBtn>
                      ))}
                    </div>
                  </div>
                </div>
              </CanvasCard>
            );
          })}
        </div>
      </div>
    </>
  );
}
