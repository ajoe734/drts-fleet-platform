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
  CanvasField,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
} from "@drts/ui-web";

// Group C · platform-admin referral 渠道管理 (canvas: platform-referral.jsx).
// C1 (create/edit partnerType/entryHost/themeAccent) + C3 (ingress credentials)
// are served by the shared /partners list + /partners/[entrySlug] detail. This
// surface mirrors the canvas C1a referral list (type / entryHost / theme / rate
// / status tabs) and the C2 revenue-share rate config wired to the BE-006 API.

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

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
  const router = useRouter();
  const client = usePlatformAdminClient();
  const [entries, setEntries] = useState<PartnerChannelEntryRecord[]>([]);
  const [rules, setRules] = useState<ReferralRevenueShareRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [onlyActive, setOnlyActive] = useState(false);
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
          filter: "Active only",
          create: "Create referral channel",
          tabReferral: "Referral Channels",
          tabCard: "Credit card / Airport",
          tabEnterprise: "Enterprise / Hotel",
          errorTitle: "Unable to load referral channels",
          channels: "Channels",
          rateTitle: "Revenue-share rate · drts_pays_partner",
          rateSubtitle:
            "Per-completed-trip share DRTS pays the channel. percent = % of fare; per_trip = flat minor units.",
          colEntry: "ENTRY",
          colType: "TYPE",
          colHost: "ENTRY HOST",
          colTheme: "THEME",
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
          rateWarnTitle: "Rate changes apply to the next statement",
          rateWarnBody:
            "Adjustments do not affect already-issued statements; completed trips from the effective date use the new rate.",
          rulesTitle: "Rate rules",
          rule1: "percent rules compute the payable share on GMV.",
          rule2: "per_trip rules compute completed trips × value.",
          rule3:
            "Rate changes require pa_partner_mgr and are written to audit.",
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
          rateTitle: "分潤費率 · drts_pays_partner",
          rateSubtitle:
            "DRTS 依每筆完成行程付給渠道的分潤。percent = 車資百分比；per_trip = 每趟固定（最小幣別單位）。",
          colEntry: "渠道",
          colType: "TYPE",
          colHost: "ENTRY HOST",
          colTheme: "THEME",
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
          rateWarnTitle: "變更費率將套用於下一期對帳",
          rateWarnBody:
            "費率調整不影響已產生的對帳單；自生效日起的完成行程適用新費率。",
          rulesTitle: "費率規則說明",
          rule1: "percent 型以 GMV 為基準計算應付分潤。",
          rule2: "per_trip 型以完成行程數 × value 計算。",
          rule3: "費率變更需具備 pa_partner_mgr 權限並寫入稽核。",
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
              r: (entry) => formatRate(rateByEntry.get(entry.entrySlug)),
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
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
                  setForm((c) => ({
                    ...c,
                    rateType: e.target.value as RateType,
                  }))
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
            <CanvasBanner
              theme={theme}
              tone="warn"
              icon="warn"
              title={copy.rateWarnTitle}
              body={copy.rateWarnBody}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <CanvasTable<ReferralRevenueShareRule>
              theme={theme}
              rows={rules}
              columns={[
                { h: copy.colEntry, k: "partnerEntrySlug", w: 200, mono: true },
                {
                  h: copy.colRate,
                  w: 120,
                  mono: true,
                  r: (rule) => formatRate(rule),
                },
                {
                  h: copy.colEffective,
                  k: "effectiveFrom",
                  w: 160,
                  mono: true,
                },
              ]}
            />
          </div>
        </CanvasCard>

        <CanvasCard theme={theme} title={copy.rulesTitle}>
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 12.5,
              color: theme.text,
              lineHeight: 1.7,
            }}
          >
            <li>{copy.rule1}</li>
            <li>{copy.rule2}</li>
            <li>{copy.rule3}</li>
          </ol>
        </CanvasCard>
      </div>
    </div>
  );
}
