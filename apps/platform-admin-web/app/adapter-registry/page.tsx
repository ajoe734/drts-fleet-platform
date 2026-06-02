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
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const titleRowStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const authorityStackStyle = {
  display: "grid",
  gap: 10,
  marginTop: 12,
  paddingTop: 12,
  borderTop: `1px solid ${theme.border}`,
} satisfies CSSProperties;

const authorityCardStyle = {
  display: "grid",
  gap: 8,
  padding: 12,
  borderRadius: 14,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
} satisfies CSSProperties;

const authorityHeaderStyle = {
  display: "flex",
  alignItems: "center",
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

const footerLegendStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const noop = () => {};

type AdapterStatus = "healthy" | "degraded" | "pending_renewal";
type AdapterKind = "forwarder" | "auth" | "filing";

type AdapterRecord = {
  id: string;
  source: string;
  kind: AdapterKind;
  status: AdapterStatus;
  latency: string;
  last: string;
  orders24h: string | number;
  platformAuthority: string;
  opsAuthority: string;
};

const adapters: AdapterRecord[] = [
  {
    id: "srx-v3",
    source: "SmartRides X",
    kind: "forwarder",
    status: "healthy",
    latency: "142ms",
    last: "2s ago",
    orders24h: 1421,
    platformAuthority: "config, credential, disable",
    opsAuthority: "pause / retry deliveries",
  },
  {
    id: "gocab-v1",
    source: "GoCab",
    kind: "forwarder",
    status: "degraded",
    latency: "780ms",
    last: "8s ago",
    orders24h: 220,
    platformAuthority: "credential rotate before cutover",
    opsAuthority: "pause route, inspect backlog",
  },
  {
    id: "ctbc-oauth",
    source: "中信 OAuth",
    kind: "auth",
    status: "healthy",
    latency: "88ms",
    last: "1s ago",
    orders24h: "–",
    platformAuthority: "client secret, redirect policy",
    opsAuthority: "incident routing only",
  },
  {
    id: "cathay-magic",
    source: "國泰 Magic Link",
    kind: "auth",
    status: "healthy",
    latency: "110ms",
    last: "3s ago",
    orders24h: "–",
    platformAuthority: "credential + allowlist governance",
    opsAuthority: "handoff only",
  },
  {
    id: "mof-einv",
    source: "財政部電子發票",
    kind: "filing",
    status: "healthy",
    latency: "320ms",
    last: "12m ago",
    orders24h: "–",
    platformAuthority: "mapping, filing credential",
    opsAuthority: "observe reconciliation incidents",
  },
  {
    id: "mof-bgmt",
    source: "BGMT 派遣回報",
    kind: "filing",
    status: "pending_renewal",
    latency: "–",
    last: "4h ago",
    orders24h: "–",
    platformAuthority: "token renewal and disable",
    opsAuthority: "monitor missed completion reports",
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
    case "pending_renewal":
    default:
      return "danger";
  }
}

export default function AdapterRegistryPage() {
  const { locale } = useTranslation();
  const copy =
    locale === "en"
      ? {
          title: "External Platform Adapter Registry",
          subtitle:
            "config / credential governance lives in platform-admin; operational pause / retry belongs in ops (Q-ADM17 split)",
          createAction: "Create",
          rotateAction: "Rotate now",
          metaPill: "Split authority",
          dangerTitle: "mof-bgmt token expires in 6 days",
          dangerBody:
            "Renew the BGMT dispatch reporting token before 2026-05-31 or today's completed trips will stop reporting upstream.",
          platformAuthority: "Platform Admin",
          platformBody:
            "Manage config, credentials, and hard disable actions with audited reason capture.",
          opsAuthority: "Ops Console",
          opsBody:
            "Operational pause, retry, and incident response stay outside this console.",
          editCredential: "Edit credential",
          rotate: "Rotate",
          disable: "Disable",
          pause: "Ops pause (TTL)",
          retry: "Retry backlog",
          handoff: "View handoff",
          observe: "Observe only",
          latency: "LATENCY",
          lastEvent: "LAST EVENT",
          orders24h: "ORDERS 24H",
        }
      : {
          title: "External Platform Adapter Registry",
          subtitle:
            "config / credential 治理在 platform-admin；operational pause / retry 在 ops（Q-ADM17 split）",
          createAction: "註冊 adapter",
          rotateAction: "立即輪替",
          metaPill: "Split authority",
          dangerTitle: "mof-bgmt · token 距到期 6 天",
          dangerBody:
            "BGMT 派遣回報 token 必須於 2026-05-31 前輪替；否則無法回報今日完成單。",
          platformAuthority: "Platform Admin",
          platformBody:
            "這裡只處理 config、credential 與 hard disable，所有高風險操作都要留下原因與審計痕跡。",
          opsAuthority: "Ops Console",
          opsBody:
            "operational pause、retry 與 incident response 仍由 ops console 執行。",
          editCredential: "編輯 credential",
          rotate: "輪替",
          disable: "停用",
          pause: "ops pause (TTL)",
          retry: "重送 backlog",
          handoff: "查看 handoff",
          observe: "僅觀察",
          latency: "LATENCY",
          lastEvent: "LAST EVENT",
          orders24h: "ORDERS 24H",
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
          {adapters.map((adapter) => (
            <CanvasCard
              key={adapter.id}
              theme={theme}
              title={
                <span style={titleRowStyle}>
                  <span>{adapter.source}</span>
                  <CanvasPill theme={theme} tone={getKindTone(adapter.kind)}>
                    {adapter.kind}
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
                  {adapter.status}
                </CanvasPill>
              }
            >
              <CanvasDL
                theme={theme}
                cols={3}
                items={[
                  { k: copy.latency, v: adapter.latency, mono: true },
                  { k: copy.lastEvent, v: adapter.last, mono: true },
                  {
                    k: copy.orders24h,
                    v: String(adapter.orders24h),
                    mono: true,
                  },
                ]}
              />

              <div style={authorityStackStyle}>
                <div style={authorityCardStyle}>
                  <div style={authorityHeaderStyle}>
                    <div style={authorityCopyStyle}>
                      <div style={authorityTitleStyle}>
                        {copy.platformAuthority}
                      </div>
                      <div style={authorityBodyStyle}>
                        {copy.platformBody} {adapter.platformAuthority}.
                      </div>
                    </div>
                    <CanvasPill theme={theme} tone="accent">
                      {copy.metaPill}
                    </CanvasPill>
                  </div>

                  <div style={buttonRowStyle}>
                    <CanvasBtn
                      theme={theme}
                      variant="secondary"
                      size="sm"
                      icon="apiKeys"
                      onClick={noop}
                    >
                      {copy.editCredential}
                    </CanvasBtn>
                    <CanvasBtn
                      theme={theme}
                      variant="secondary"
                      size="sm"
                      icon="arrow"
                      onClick={noop}
                    >
                      {copy.rotate}
                    </CanvasBtn>
                    <CanvasBtn
                      theme={theme}
                      variant="secondary"
                      size="sm"
                      onClick={noop}
                    >
                      {copy.disable}
                    </CanvasBtn>
                  </div>
                </div>

                <div style={authorityCardStyle}>
                  <div style={authorityHeaderStyle}>
                    <div style={authorityCopyStyle}>
                      <div style={authorityTitleStyle}>{copy.opsAuthority}</div>
                      <div style={authorityBodyStyle}>
                        {copy.opsBody} {adapter.opsAuthority}.
                      </div>
                    </div>
                    <CanvasPill theme={theme} tone="info">
                      ops
                    </CanvasPill>
                  </div>

                  <div style={buttonRowStyle}>
                    {adapter.kind === "forwarder" ? (
                      <>
                        <CanvasBtn
                          theme={theme}
                          variant="secondary"
                          size="sm"
                          onClick={noop}
                        >
                          {copy.pause}
                        </CanvasBtn>
                        <CanvasBtn
                          theme={theme}
                          variant="secondary"
                          size="sm"
                          onClick={noop}
                        >
                          {copy.retry}
                        </CanvasBtn>
                      </>
                    ) : adapter.kind === "auth" ? (
                      <CanvasBtn
                        theme={theme}
                        variant="secondary"
                        size="sm"
                        onClick={noop}
                      >
                        {copy.handoff}
                      </CanvasBtn>
                    ) : (
                      <CanvasBtn
                        theme={theme}
                        variant="secondary"
                        size="sm"
                        onClick={noop}
                      >
                        {copy.observe}
                      </CanvasBtn>
                    )}
                  </div>
                </div>
              </div>
            </CanvasCard>
          ))}
        </div>

        <div style={footerLegendStyle}>
          <CanvasPill theme={theme} tone="danger" dot>
            mof-bgmt renewal required
          </CanvasPill>
          <CanvasPill theme={theme} tone="warn" dot>
            GoCab degraded
          </CanvasPill>
          <CanvasPill theme={theme} tone="neutral">
            platform-admin does not execute ops pause / retry
          </CanvasPill>
        </div>
      </div>
    </>
  );
}
