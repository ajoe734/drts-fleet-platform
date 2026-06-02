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
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const titleRowStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const capabilityRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 12,
} satisfies CSSProperties;

const authorityStackStyle = {
  display: "grid",
  gap: 10,
  marginTop: 12,
  paddingTop: 12,
  borderTop: `1px solid ${theme.border}`,
} satisfies CSSProperties;

const authorityLaneStyle = {
  display: "grid",
  gap: 8,
  padding: 12,
  borderRadius: 14,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
} satisfies CSSProperties;

const authorityHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
} satisfies CSSProperties;

const authorityCopyStyle = {
  display: "grid",
  gap: 4,
} satisfies CSSProperties;

const authorityTitleStyle = {
  color: theme.text,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
} satisfies CSSProperties;

const authorityBodyStyle = {
  color: theme.textDim,
  fontSize: 12,
  lineHeight: 1.5,
} satisfies CSSProperties;

const buttonRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const helperTextStyle = {
  color: theme.textDim,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const noop = () => {};

type AdapterStatus = "healthy" | "degraded" | "renewal_overdue";
type AdapterKind = "forwarder" | "auth" | "filing";

type AdapterAction = {
  label: string;
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
  capabilityFlags: string[];
  platformAuthority: string;
  opsAuthority: string;
  platformActions: AdapterAction[];
  opsActions: AdapterAction[];
  platformNote?: string;
  opsNote?: string;
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
    capabilityFlags: [
      "dispatch forwarding",
      "credential write",
      "hard disable",
    ],
    platformAuthority:
      "Config, credential, and disable authority remains here.",
    opsAuthority: "Pause and retry stay in Ops once traffic is flowing.",
    platformActions: [
      { label: "Edit credential", icon: "apiKeys" },
      { label: "Rotate", icon: "arrow" },
      { label: "Disable", danger: true },
    ],
    opsActions: [{ label: "Ops pause (TTL)" }, { label: "Retry backlog" }],
  },
  {
    id: "gocab-v1",
    source: "GoCab",
    kind: "forwarder",
    status: "degraded",
    latency: "780ms",
    last: "8s ago",
    orders24h: "220",
    capabilityFlags: ["dispatch forwarding", "degraded", "backlog inspection"],
    platformAuthority:
      "Credential cutover and health escalation belong to Platform Admin.",
    opsAuthority: "Ops owns backlog triage while latency remains degraded.",
    platformActions: [
      { label: "Edit credential", icon: "apiKeys" },
      { label: "Rotate", icon: "arrow" },
      { label: "Disable", danger: true },
    ],
    opsActions: [
      { label: "Ops pause (TTL)" },
      { label: "Retry backlog" },
      { label: "View handoff" },
    ],
    opsNote:
      "GoCab is degraded, so the ops lane stays visible even though write authority does not move here.",
  },
  {
    id: "ctbc-oauth",
    source: "中信 OAuth",
    kind: "auth",
    status: "healthy",
    latency: "88ms",
    last: "1s ago",
    orders24h: "N/A",
    capabilityFlags: ["oauth", "secret rotation", "redirect policy"],
    platformAuthority:
      "Client secret and redirect allowlist governance stays here.",
    opsAuthority:
      "Ops only receives the incident handoff context for auth faults.",
    platformActions: [
      { label: "Edit credential", icon: "apiKeys" },
      { label: "Rotate", icon: "arrow" },
      { label: "Disable", danger: true },
    ],
    opsActions: [{ label: "View handoff" }],
  },
  {
    id: "cathay-magic",
    source: "國泰 Magic Link",
    kind: "auth",
    status: "healthy",
    latency: "110ms",
    last: "3s ago",
    orders24h: "N/A",
    capabilityFlags: ["oauth", "allowlist", "campaign auth"],
    platformAuthority:
      "Platform Admin governs credentials and approved callback policy.",
    opsAuthority:
      "Ops can view the handoff packet but cannot mutate auth settings.",
    platformActions: [
      { label: "Edit credential", icon: "apiKeys" },
      { label: "Rotate", icon: "arrow" },
      { label: "Disable", danger: true },
    ],
    opsActions: [{ label: "View handoff" }],
  },
  {
    id: "mof-einv",
    source: "財政部電子發票",
    kind: "filing",
    status: "healthy",
    latency: "320ms",
    last: "12m ago",
    orders24h: "N/A",
    capabilityFlags: ["filing", "mapping policy", "reconciliation watch"],
    platformAuthority:
      "Filing credential and mapping changes require platform governance.",
    opsAuthority:
      "Ops can only observe reconciliation impact from this console handoff.",
    platformActions: [
      { label: "Edit credential", icon: "apiKeys" },
      { label: "Rotate", icon: "arrow" },
      { label: "Disable", danger: true },
    ],
    opsActions: [{ label: "Observe only", disabled: true }],
    opsNote:
      "Filing adapters do not support direct operational pause or retry in Platform Admin.",
  },
  {
    id: "mof-bgmt",
    source: "BGMT 派遣回報",
    kind: "filing",
    status: "renewal_overdue",
    latency: "N/A",
    last: "4h ago",
    orders24h: "N/A",
    capabilityFlags: [
      "filing",
      "token renewal overdue",
      "completion reporting",
    ],
    platformAuthority:
      "Token renewal and hard disable remain in Platform Admin with audited reason capture.",
    opsAuthority:
      "Ops monitors missed completion reports and follows the incident handoff only.",
    platformActions: [
      { label: "Edit credential", icon: "apiKeys" },
      { label: "Rotate", icon: "arrow" },
      { label: "Disable", danger: true },
    ],
    opsActions: [{ label: "Observe only", disabled: true }],
    platformNote:
      "The previous BGMT token expired on May 31, 2026. Renew here before reopening completion-report delivery.",
    opsNote:
      "Ops can see impact and escalation context here, but cannot renew the token from this route.",
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
            "Config and credential writes live in Platform Admin; operational pause and retry remain in Ops for Q-ADM17 split authority.",
          createAction: "Register adapter",
          rotateAction: "Renew token",
          metaPill: "Write authority",
          opsPill: "Ops scope",
          dangerTitle: "mof-bgmt renewal overdue",
          dangerBody:
            "The previous BGMT dispatch reporting token expired on May 31, 2026. Renew it here before completion reports resume upstream.",
          platformAuthority: "Platform Admin",
          opsAuthority: "Ops Console",
          latency: "LATENCY",
          lastEvent: "LAST EVENT",
          orders24h: "ORDERS 24H",
          capabilities: "CAPABILITY FLAGS",
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
            "config / credential 寫入權在 Platform Admin；operational pause / retry 依 Q-ADM17 留在 Ops。",
          createAction: "註冊 adapter",
          rotateAction: "續發 token",
          metaPill: "Write authority",
          opsPill: "Ops scope",
          dangerTitle: "mof-bgmt 續發逾期",
          dangerBody:
            "上一把 BGMT 派遣回報 token 已於 2026 年 5 月 31 日到期。必須先在此續發，完成單回報才會恢復上游送達。",
          platformAuthority: "Platform Admin",
          opsAuthority: "Ops Console",
          latency: "LATENCY",
          lastEvent: "LAST EVENT",
          orders24h: "ORDERS 24H",
          capabilities: "CAPABILITY FLAGS",
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

        <div style={adapterGridStyle}>
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

                <div style={capabilityRowStyle}>
                  <CanvasPill theme={theme} tone="neutral">
                    {copy.capabilities}
                  </CanvasPill>
                  {adapter.capabilityFlags.map((flag) => (
                    <CanvasPill key={flag} theme={theme} tone="info">
                      {flag}
                    </CanvasPill>
                  ))}
                </div>

                <div style={authorityStackStyle}>
                  <div style={authorityLaneStyle}>
                    <div style={authorityHeaderStyle}>
                      <div style={authorityCopyStyle}>
                        <div style={authorityTitleStyle}>
                          {copy.platformAuthority}
                        </div>
                        <div style={authorityBodyStyle}>
                          {adapter.platformAuthority}
                        </div>
                      </div>
                      <CanvasPill theme={theme} tone="accent">
                        {copy.metaPill}
                      </CanvasPill>
                    </div>

                    <div style={buttonRowStyle}>
                      {adapter.platformActions.map((action) => (
                        <CanvasBtn
                          key={action.label}
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

                    {adapter.platformNote ? (
                      <div style={helperTextStyle}>{adapter.platformNote}</div>
                    ) : null}
                  </div>

                  <div style={authorityLaneStyle}>
                    <div style={authorityHeaderStyle}>
                      <div style={authorityCopyStyle}>
                        <div style={authorityTitleStyle}>
                          {copy.opsAuthority}
                        </div>
                        <div style={authorityBodyStyle}>
                          {adapter.opsAuthority}
                        </div>
                      </div>
                      <CanvasPill theme={theme} tone="info">
                        {copy.opsPill}
                      </CanvasPill>
                    </div>

                    <div style={buttonRowStyle}>
                      {adapter.opsActions.map((action) => (
                        <CanvasBtn
                          key={action.label}
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

                    {adapter.opsNote ? (
                      <div style={helperTextStyle}>{adapter.opsNote}</div>
                    ) : null}
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
