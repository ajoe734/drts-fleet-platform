"use client";

import { useParams, useRouter } from "next/navigation";
import React, {
  useCallback,
  useEffect,
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
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasTable,
  buildCanvasTheme,
} from "@drts/ui-web";

// Group C2 · platform-admin per-partner revenue-share rate editor
// (canvas: platform-referral.jsx · PA_RefRates). Reached from the referral
// channel list. Wired to the BE-006 referral-rates upsert API.

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
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

type RateType = "percent" | "per_trip";

export default function ReferralRatePage() {
  const params = useParams();
  const entrySlug = String(
    Array.isArray(params.entrySlug)
      ? params.entrySlug[0]
      : (params.entrySlug ?? ""),
  );
  const { locale } = useTranslation();
  const router = useRouter();
  const client = usePlatformAdminClient();
  const [entry, setEntry] = useState<PartnerChannelEntryRecord | null>(null);
  const [rules, setRules] = useState<ReferralRevenueShareRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    rateType: RateType;
    value: string;
    currency: string;
    effectiveFrom: string;
    effectiveUntil: string;
  }>({
    rateType: "percent",
    value: "",
    currency: "TWD",
    effectiveFrom: "",
    effectiveUntil: "",
  });

  const copy =
    locale === "en"
      ? {
          title: "Revenue-share rate",
          subtitle: "rateType / value / effective period · changes are audited",
          cancel: "Cancel",
          publish: "Publish rate",
          saving: "Saving…",
          errorTitle: "Unable to load rate",
          invalid: "Enter a valid value (≥ 0).",
          currentRate: "Current rate",
          currentRateSub: "effective rate",
          rateType: "Rate type · billing",
          percent: "Percent",
          perTrip: "Per trip",
          value: "Value · ratio / amount",
          currency: "Currency",
          base: "Base",
          baseValue: "GMV (completed fare)",
          effFrom: "Effective from",
          effTo: "Effective to",
          warnTitle: "Rate changes apply to the next statement",
          warnBody:
            "Adjustments do not affect already-issued statements; completed trips from the effective date use the new rate.",
          auditTitle: "Rate change history · audit",
          auditSub: "all changes are written to audit",
          colEffFrom: "EFFECTIVE FROM",
          colRate: "RATE",
          colCreated: "CREATED",
          noRules: "No rate history yet.",
          estTitle: "Estimate",
          estSub: "current-period estimate",
          estRate: "Rate",
          estPayable: "Payable share",
          estPayableNote: "rate × period GMV (settled per statement)",
          estDirection: "Settlement direction",
          noRate: "no rate set",
          rulesTitle: "Rate rules",
          rule1: "percent rules compute the payable share on GMV.",
          rule2: "per_trip rules compute completed trips × value.",
          rule3:
            "Rate changes require pa_partner_mgr and are written to audit.",
        }
      : {
          title: "分潤費率設定 · Revenue Share Rate",
          subtitle: "rateType / value / 生效期間 · 變更寫 audit",
          cancel: "取消",
          publish: "發佈費率",
          saving: "儲存中…",
          errorTitle: "無法載入費率",
          invalid: "請輸入有效數值（≥ 0）。",
          currentRate: "當前費率",
          currentRateSub: "effective rate",
          rateType: "rateType · 計費方式",
          percent: "百分比",
          perTrip: "每趟固定",
          value: "value · 比例 / 金額",
          currency: "currency",
          base: "基準 · base",
          baseValue: "GMV (完成行程車資)",
          effFrom: "生效起 · effectiveFrom",
          effTo: "生效迄 · effectiveTo",
          warnTitle: "變更費率將套用於下一期對帳",
          warnBody:
            "費率調整不影響已產生的對帳單；自生效日起的完成行程適用新費率。",
          auditTitle: "費率變更紀錄 · audit",
          auditSub: "所有變更已寫入稽核",
          colEffFrom: "生效起",
          colRate: "費率",
          colCreated: "建立時間",
          noRules: "尚無費率紀錄。",
          estTitle: "試算",
          estSub: "本期預估",
          estRate: "費率",
          estPayable: "應付分潤",
          estPayableNote: "費率 × 期間 GMV（依當期對帳結算）",
          estDirection: "金流方向",
          noRate: "未設定",
          rulesTitle: "費率規則說明",
          rule1: "percent 型以 GMV 為基準計算應付分潤。",
          rule2: "per_trip 型以完成行程數 × value 計算。",
          rule3: "費率變更需具備 pa_partner_mgr 權限並寫入稽核。",
        };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entries, allRules] = await Promise.all([
        client.listPlatformPartnerEntries(),
        client.listReferralRevenueShareRules(),
      ]);
      setEntry(entries.find((e) => e.entrySlug === entrySlug) ?? null);
      const mine = allRules
        .filter((r) => r.partnerEntrySlug === entrySlug)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
      setRules(mine);
      const cur = mine[0];
      if (cur) {
        setForm({
          rateType: cur.rateType,
          value: String(cur.value),
          currency: cur.currency,
          effectiveFrom: cur.effectiveFrom?.slice(0, 10) ?? "",
          effectiveUntil: cur.effectiveUntil?.slice(0, 10) ?? "",
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [client, entrySlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = rules[0];
  const formatRate = (rule: ReferralRevenueShareRule) =>
    rule.rateType === "percent"
      ? `${rule.value}%`
      : `${rule.value} ${rule.currency}/trip`;

  const publish = useCallback(async () => {
    const value = Number(form.value);
    if (Number.isNaN(value) || value < 0) {
      setError(copy.invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await client.upsertReferralRevenueShareRule({
        partnerEntrySlug: entrySlug,
        rateType: form.rateType,
        value,
        currency: form.currency.trim() || "TWD",
        ...(form.effectiveFrom ? { effectiveFrom: form.effectiveFrom } : {}),
        ...(form.effectiveUntil ? { effectiveUntil: form.effectiveUntil } : {}),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }, [client, entrySlug, form, load, copy.invalid]);

  return (
    <div style={pageStackStyle}>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={`${entry?.displayName ?? entrySlug} · /${entrySlug} · ${copy.subtitle}`}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              onClick={() => router.push("/partners/referral")}
            >
              {copy.cancel}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="check"
              disabled={saving}
              onClick={() => void publish()}
            >
              {saving ? copy.saving : copy.publish}
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CanvasCard
            theme={theme}
            title={copy.currentRate}
            subtitle={copy.currentRateSub}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 14px",
              }}
            >
              <CanvasField theme={theme} label={copy.rateType}>
                <div style={{ display: "flex", gap: 6 }}>
                  {(
                    [
                      ["percent", copy.percent],
                      ["per_trip", copy.perTrip],
                    ] as const
                  ).map(([val, lbl]) => {
                    const sel = form.rateType === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() =>
                          setForm((c) => ({ ...c, rateType: val }))
                        }
                        style={{
                          flex: 1,
                          textAlign: "center",
                          padding: "8px 0",
                          borderRadius: 8,
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          border: `1px solid ${sel ? theme.accent : theme.border}`,
                          background: sel ? theme.accentBg : theme.surface,
                          color: sel ? theme.accent : theme.textMuted,
                        }}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
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
              <CanvasField theme={theme} label={copy.base}>
                <input
                  style={{ ...inputStyle, color: theme.textMuted }}
                  value={copy.baseValue}
                  readOnly
                />
              </CanvasField>
              <CanvasField theme={theme} label={copy.effFrom}>
                <input
                  style={inputStyle}
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, effectiveFrom: e.target.value }))
                  }
                />
              </CanvasField>
              <CanvasField theme={theme} label={copy.effTo}>
                <input
                  style={inputStyle}
                  type="date"
                  value={form.effectiveUntil}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, effectiveUntil: e.target.value }))
                  }
                />
              </CanvasField>
            </div>
            <div style={{ marginTop: 14 }}>
              <CanvasBanner
                theme={theme}
                tone="warn"
                icon="warn"
                title={copy.warnTitle}
                body={copy.warnBody}
              />
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={copy.auditTitle}
            subtitle={copy.auditSub}
            padding={0}
          >
            <CanvasTable<ReferralRevenueShareRule>
              theme={theme}
              rows={rules}
              columns={[
                { h: copy.colEffFrom, k: "effectiveFrom", w: 160, mono: true },
                {
                  h: copy.colRate,
                  w: 140,
                  mono: true,
                  r: (rule) => formatRate(rule),
                },
                { h: copy.colCreated, k: "createdAt", w: 200, mono: true },
              ]}
            />
            {!loading && rules.length === 0 ? (
              <div
                style={{ padding: 16, color: theme.textMuted, fontSize: 13 }}
              >
                {copy.noRules}
              </div>
            ) : null}
          </CanvasCard>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CanvasCard
            theme={theme}
            title={copy.estTitle}
            subtitle={copy.estSub}
          >
            <CanvasDL
              theme={theme}
              cols={1}
              items={[
                {
                  k: copy.estRate,
                  v: current ? formatRate(current) : copy.noRate,
                  mono: true,
                },
                { k: copy.base, v: copy.baseValue },
                { k: copy.estPayable, v: copy.estPayableNote },
                {
                  k: copy.estDirection,
                  v: `DRTS → ${entry?.displayName ?? entrySlug}`,
                },
              ]}
            />
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
    </div>
  );
}
