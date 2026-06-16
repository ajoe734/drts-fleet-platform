"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type {
  PartnerChannelEntryRecord,
  ReferralRevenueShareRule,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
} from "@drts/ui-web";

// Group C1a · platform-admin referral channel list (canvas: platform-referral.jsx
// · PA_RefChannels). Partner-type tabs, entryHost / themeAccent / rate / status
// columns. Per-channel revenue-share rate editing lives on the C2 detail page
// (/partners/[entrySlug]/rates); create / credentials stay on the shared
// /partners + /partners/[entrySlug] surfaces.

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;
const linkStyle: CSSProperties = {
  color: theme.accent,
  textDecoration: "none",
};

const REFERRAL_PARTNER_TYPE = "referral_channel";

export default function ReferralChannelsPage() {
  const { locale } = useTranslation();
  const router = useRouter();
  const client = usePlatformAdminClient();
  const [entries, setEntries] = useState<PartnerChannelEntryRecord[]>([]);
  const [rules, setRules] = useState<ReferralRevenueShareRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyActive, setOnlyActive] = useState(false);

  const copy =
    locale === "en"
      ? {
          title: "Referral channels",
          subtitle:
            "partnerType=referral_channel · community / property-management embedded ride-hailing · entryHost whitelist, branding, revenue-share rate.",
          refresh: "Refresh",
          filter: "Active only",
          create: "Create referral channel",
          tabReferral: "Referral Channels",
          tabCard: "Credit card / Airport",
          tabEnterprise: "Enterprise / Hotel",
          errorTitle: "Unable to load referral channels",
          channels: "Channels",
          colEntry: "ENTRY",
          colType: "TYPE",
          colHost: "ENTRY HOST",
          colTheme: "THEME",
          colStatus: "STATUS",
          colRate: "RATE",
          noRate: "no rate set",
          openDetail: "Open entry detail / credentials",
          setRate: "Set revenue-share rate",
          empty:
            "No referral_channel entries yet — create one from the Partner entry page.",
        }
      : {
          title: "Referral 渠道",
          subtitle:
            "partnerType=referral_channel · 社區/物業 App 內嵌叫車 · entryHost 白名單、品牌、分潤費率。",
          refresh: "重新整理",
          filter: "僅顯示啟用",
          create: "建立 referral 渠道",
          tabReferral: "Referral Channels",
          tabCard: "信用卡 / 機場",
          tabEnterprise: "企業 / 飯店",
          errorTitle: "無法載入 referral 渠道",
          channels: "渠道清單",
          colEntry: "渠道",
          colType: "TYPE",
          colHost: "ENTRY HOST",
          colTheme: "THEME",
          colStatus: "狀態",
          colRate: "費率",
          noRate: "未設定",
          openDetail: "查看渠道詳情 / 憑證",
          setRate: "設定分潤費率",
          empty: "尚無 referral_channel 渠道 — 請至 Partner entry 頁建立。",
        };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allEntries, allRules] = await Promise.all([
        client.listPlatformPartnerEntries(),
        client.listReferralRevenueShareRules(),
      ]);
      setEntries(
        allEntries.filter((e) => e.partnerType === REFERRAL_PARTNER_TYPE),
      );
      setRules(allRules);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const rateByEntry = useMemo(() => {
    const map = new Map<string, ReferralRevenueShareRule>();
    for (const rule of rules) {
      const existing = map.get(rule.partnerEntrySlug);
      if (!existing || rule.effectiveFrom > existing.effectiveFrom) {
        map.set(rule.partnerEntrySlug, rule);
      }
    }
    return map;
  }, [rules]);

  const visibleEntries = useMemo(
    () => (onlyActive ? entries.filter((e) => e.status === "active") : entries),
    [entries, onlyActive],
  );

  const formatRate = (rule: ReferralRevenueShareRule | undefined) => {
    if (!rule) return copy.noRate;
    return rule.rateType === "percent"
      ? `${rule.value}%`
      : `${rule.value} ${rule.currency}/trip`;
  };

  return (
    <div style={pageStackStyle}>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={[copy.tabReferral, copy.tabCard, copy.tabEnterprise]}
        activeTab={copy.tabReferral}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              icon="filter"
              variant={onlyActive ? "primary" : "secondary"}
              onClick={() => setOnlyActive((v) => !v)}
            >
              {copy.filter}
            </CanvasBtn>
            <CanvasBtn theme={theme} onClick={() => void load()}>
              {copy.refresh}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => router.push("/partners")}
            >
              {copy.create}
            </CanvasBtn>
          </>
        }
      />

      {error ? (
        <CanvasBanner
          theme={theme}
          tone="danger"
          title={copy.errorTitle}
          body={error}
        />
      ) : null}

      <CanvasCard theme={theme} title={copy.channels} padding={0}>
        <CanvasTable<PartnerChannelEntryRecord>
          theme={theme}
          rows={visibleEntries}
          columns={[
            {
              h: copy.colEntry,
              w: 240,
              r: (entry) => (
                <Link
                  href={`/partners/${entry.entrySlug}`}
                  style={linkStyle}
                  title={copy.openDetail}
                >
                  <div style={{ fontWeight: 600 }}>{entry.displayName}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: theme.textDim,
                      fontFamily: theme.monoFamily,
                    }}
                  >
                    {entry.partnerId} · /{entry.entrySlug}
                  </div>
                </Link>
              ),
            },
            {
              h: copy.colType,
              w: 150,
              r: () => (
                <CanvasPill theme={theme} tone="accent">
                  referral_channel
                </CanvasPill>
              ),
            },
            { h: copy.colHost, k: "entryHost", w: 200, mono: true },
            {
              h: copy.colTheme,
              w: 120,
              r: (entry) =>
                entry.themeAccent ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        background: entry.themeAccent,
                        border: `1px solid ${theme.border}`,
                      }}
                    />
                    <span
                      style={{ fontFamily: theme.monoFamily, fontSize: 11 }}
                    >
                      {entry.themeAccent}
                    </span>
                  </span>
                ) : (
                  <span style={{ color: theme.textDim }}>—</span>
                ),
            },
            {
              h: copy.colRate,
              w: 130,
              mono: true,
              r: (entry) => (
                <Link
                  href={`/partners/${entry.entrySlug}/rates`}
                  style={linkStyle}
                  title={copy.setRate}
                >
                  {formatRate(rateByEntry.get(entry.entrySlug))}
                </Link>
              ),
            },
            {
              h: copy.colStatus,
              w: 110,
              r: (entry) => (
                <CanvasPill
                  theme={theme}
                  tone={
                    entry.status === "active"
                      ? "success"
                      : entry.status === "revoked"
                        ? "danger"
                        : "neutral"
                  }
                  dot
                >
                  {entry.status}
                </CanvasPill>
              ),
            },
            {
              h: "",
              w: 36,
              r: (entry) => (
                <Link
                  href={`/partners/${entry.entrySlug}`}
                  style={linkStyle}
                  title={copy.openDetail}
                >
                  <CanvasIcon
                    name="more"
                    size={14}
                    style={{ color: theme.textDim }}
                  />
                </Link>
              ),
            },
          ]}
        />
        {!loading && visibleEntries.length === 0 ? (
          <div style={{ padding: 16, color: theme.textMuted, fontSize: 13 }}>
            {copy.empty}
          </div>
        ) : null}
      </CanvasCard>
    </div>
  );
}
