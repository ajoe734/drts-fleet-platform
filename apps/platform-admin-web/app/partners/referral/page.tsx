"use client";

import Link from "next/link";
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
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
} from "@drts/ui-web";

// Group C · platform-admin referral 渠道管理 (canvas: platform-referral.jsx).
// C1 (create/edit partnerType/entryHost/themeAccent) + C3 (ingress credentials)
// are already served by the shared /partners list + /partners/[entrySlug] detail.
// This surface adds the referral-only view (referral_channel entries) and the
// net-new C2: revenue-share rate config wired to the BE-006 referral-rates API.

const theme = buildCanvasTheme({
  dark: true,
  surface: "platform",
  density: "compact",
});

const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;
const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "0 14px",
  alignItems: "end",
} satisfies CSSProperties;
const inputStyle: CSSProperties = {
  width: "100%",
  height: 34,
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  color: theme.text,
  padding: "0 10px",
  fontSize: 13,
};
const linkStyle: CSSProperties = {
  color: theme.accent,
  textDecoration: "none",
};

const REFERRAL_PARTNER_TYPE = "referral_channel";

type RateType = "percent" | "per_trip";

export default function ReferralChannelsPage() {
  const { locale, t } = useTranslation();
  const client = usePlatformAdminClient();
  const [entries, setEntries] = useState<PartnerChannelEntryRecord[]>([]);
  const [rules, setRules] = useState<ReferralRevenueShareRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    partnerEntrySlug: string;
    rateType: RateType;
    value: string;
    currency: string;
  }>({ partnerEntrySlug: "", rateType: "percent", value: "", currency: "NTD" });

  const copy =
    locale === "en"
      ? {
          title: "Referral channels",
          subtitle:
            "partnerType=referral_channel · community / property-management embedded ride-hailing · entryHost whitelist, branding, revenue-share rate.",
          refresh: "Refresh",
          errorTitle: "Unable to load referral channels",
          channels: "Channels",
          rateTitle: "Revenue-share rate · drts_pays_partner",
          rateSubtitle:
            "Per-completed-trip share DRTS pays the channel. percent = % of fare; per_trip = flat minor units.",
          colEntry: "ENTRY",
          colHost: "ENTRY HOST",
          colStatus: "STATUS",
          colRate: "RATE",
          colEffective: "EFFECTIVE",
          noRate: "no rate set",
          slug: "Channel (entrySlug)",
          rateType: "Rate type",
          value: "Value",
          currency: "Currency",
          save: "Save rate",
          saving: "Saving…",
          openDetail: "Open entry detail / credentials",
          empty:
            "No referral_channel entries yet — create one from the Partner entry page.",
        }
      : {
          title: "Referral 渠道",
          subtitle:
            "partnerType=referral_channel · 社區/物業 App 內嵌叫車 · entryHost 白名單、品牌、分潤費率。",
          refresh: "重新整理",
          errorTitle: "無法載入 referral 渠道",
          channels: "渠道清單",
          rateTitle: "分潤費率 · drts_pays_partner",
          rateSubtitle:
            "DRTS 依每筆完成行程付給渠道的分潤。percent = 車資百分比；per_trip = 每趟固定（最小幣別單位）。",
          colEntry: "渠道",
          colHost: "ENTRY HOST",
          colStatus: "狀態",
          colRate: "費率",
          colEffective: "生效",
          noRate: "未設定",
          slug: "渠道 (entrySlug)",
          rateType: "費率類型",
          value: "數值",
          currency: "幣別",
          save: "儲存費率",
          saving: "儲存中…",
          openDetail: "查看渠道詳情 / 憑證",
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

  const formatRate = (rule: ReferralRevenueShareRule | undefined) => {
    if (!rule) return copy.noRate;
    return rule.rateType === "percent"
      ? `${rule.value}%`
      : `${rule.value} ${rule.currency}/trip`;
  };

  const saveRate = useCallback(async () => {
    const value = Number(form.value);
    if (!form.partnerEntrySlug.trim() || Number.isNaN(value) || value < 0) {
      setError(t("paMisc.referralValueRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await client.upsertReferralRevenueShareRule({
        partnerEntrySlug: form.partnerEntrySlug.trim(),
        rateType: form.rateType,
        value,
        currency: form.currency.trim() || "NTD",
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }, [client, form, load, t]);

  return (
    <div style={pageStackStyle}>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <CanvasBtn theme={theme} onClick={() => void load()}>
            {copy.refresh}
          </CanvasBtn>
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
          rows={entries}
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
                  {entry.displayName} · {entry.entrySlug}
                </Link>
              ),
            },
            { h: copy.colHost, k: "entryHost", w: 200, mono: true },
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
                >
                  {entry.status}
                </CanvasPill>
              ),
            },
            {
              h: copy.colRate,
              w: 140,
              mono: true,
              r: (entry) => formatRate(rateByEntry.get(entry.entrySlug)),
            },
          ]}
        />
        {!loading && entries.length === 0 ? (
          <div style={{ padding: 16, color: theme.textMuted, fontSize: 13 }}>
            {copy.empty}
          </div>
        ) : null}
      </CanvasCard>

      <CanvasCard
        theme={theme}
        title={copy.rateTitle}
        subtitle={copy.rateSubtitle}
      >
        <div style={formGridStyle}>
          <CanvasField theme={theme} label={copy.slug} required>
            <input
              style={inputStyle}
              list="referral-entry-options"
              value={form.partnerEntrySlug}
              onChange={(e) =>
                setForm((c) => ({ ...c, partnerEntrySlug: e.target.value }))
              }
            />
            <datalist id="referral-entry-options">
              {entries.map((e) => (
                <option key={e.entrySlug} value={e.entrySlug} />
              ))}
            </datalist>
          </CanvasField>
          <CanvasField theme={theme} label={copy.rateType}>
            <select
              style={inputStyle}
              value={form.rateType}
              onChange={(e) =>
                setForm((c) => ({ ...c, rateType: e.target.value as RateType }))
              }
            >
              <option value="percent">percent</option>
              <option value="per_trip">per_trip</option>
            </select>
          </CanvasField>
          <CanvasField theme={theme} label={copy.value} required>
            <input
              style={inputStyle}
              inputMode="numeric"
              value={form.value}
              onChange={(e) =>
                setForm((c) => ({ ...c, value: e.target.value }))
              }
            />
          </CanvasField>
          <CanvasField theme={theme} label={copy.currency}>
            <input
              style={inputStyle}
              value={form.currency}
              onChange={(e) =>
                setForm((c) => ({ ...c, currency: e.target.value }))
              }
            />
          </CanvasField>
          <CanvasBtn
            theme={theme}
            variant="primary"
            disabled={saving}
            onClick={() => void saveRate()}
          >
            {saving ? copy.saving : copy.save}
          </CanvasBtn>
        </div>

        <div style={{ marginTop: 14 }}>
          <CanvasTable<ReferralRevenueShareRule>
            theme={theme}
            rows={rules}
            columns={[
              { h: copy.colEntry, k: "partnerEntrySlug", w: 220, mono: true },
              {
                h: copy.colRate,
                w: 140,
                mono: true,
                r: (rule) => formatRate(rule),
              },
              { h: copy.colEffective, k: "effectiveFrom", w: 180, mono: true },
            ]}
          />
        </div>
      </CanvasCard>
    </div>
  );
}
