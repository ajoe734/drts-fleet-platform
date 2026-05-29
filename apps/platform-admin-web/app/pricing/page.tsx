/**
 * /pricing — Pricing Governance (platform-admin)
 *
 * Rebuilt to the `Platform Admin.html` canvas artboard `PA_Pricing` (4 tabs:
 * Passenger Pricing / Driver Fee Plans / Subsidy · Reimbursement / Published
 * Versions) and the design hand-off packet §5.10. Behaviour is driven by the
 * cross-cutting `@drts/contracts` ui-runtime envelopes:
 *   - refresh tier T4 `medium_slow` (30s) per packet §5.10 / canvas
 *   - `availableActions[]` (ResourceActionDescriptor) drives every CTA per §3.5
 *   - risk-classified confirmation (medium/high) per §3.4 — publish is high +
 *     requiresReason (atomic version-replace per Q-ADM10)
 *   - six distinct `EmptyReason` treatments per §3.6 (the driver-only
 *     `driver_not_eligible` is N/A here)
 *   - cross-app deep links (CrossAppResourceLink) per §3.10 — pricing exits to
 *     audit-trail entries (§5.10.E); action receipts surface a "View audit"
 *     deep link.
 *
 * Visual system: `@drts/ui-web` canvas primitives (platform dark surface),
 * matching the dominant platform-admin-web canvas pages.
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  DriverFeePlanRecord,
  PlatformPricingRuleRecord,
  ProductRuleCatalog,
  ResourceActionDescriptor,
  EmptyReason,
  RefreshTier,
  UiRefreshMetadata,
  CrossAppResourceLink,
  ActionReceipt,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

// ─────────────────────────────────────────────────────────────────────────────
// Tabs (canvas PA_Pricing artboards)
// ─────────────────────────────────────────────────────────────────────────────
type TabId = "passenger" | "driver" | "subsidy" | "history";
const TAB_IDS: readonly TabId[] = ["passenger", "driver", "subsidy", "history"];

// ─────────────────────────────────────────────────────────────────────────────
// Refresh model (packet §3.2 / §5.10 — T4 medium_slow) ─────────────────────────
// Pricing data is governance-cadence; canvas wires `refreshTier="medium_slow"`.
const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_CADENCE_MS: Record<RefreshTier, number | null> = {
  urgent: 5000,
  fast: 3000,
  dispatch: 5000,
  medium: 15000,
  medium_slow: 30000,
  slow: 30000,
  manual: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// EmptyReason → distinct treatment (packet §3.6 / Q-X15) ───────────────────────
// Six platform-admin reasons (the driver-only `driver_not_eligible` is N/A here).
type PlatformEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

interface EmptyTreatment {
  glyph: string;
  tone: CanvasTone;
  action?: "retry" | "clear_filters";
}

const EMPTY_TREATMENTS: Record<PlatformEmptyReason, EmptyTreatment> = {
  no_data: { glyph: "🗂", tone: "neutral" },
  not_provisioned: { glyph: "🧩", tone: "info" },
  fetch_failed: { glyph: "⚠️", tone: "danger", action: "retry" },
  permission_denied: { glyph: "🔒", tone: "warn" },
  external_unavailable: { glyph: "🛰", tone: "warn", action: "retry" },
  filtered_empty: { glyph: "🔍", tone: "neutral", action: "clear_filters" },
};

// Classify a thrown error into a distinct EmptyReason so the six treatments are
// all reachable (permission vs upstream-unavailable vs generic fetch failure).
function classifyFetchError(message: string): PlatformEmptyReason {
  const m = message.toLowerCase();
  if (
    m.includes("403") ||
    m.includes("permission") ||
    m.includes("forbidden") ||
    m.includes("unauthor")
  ) {
    return "permission_denied";
  }
  if (
    m.includes("502") ||
    m.includes("503") ||
    m.includes("504") ||
    m.includes("unavailable") ||
    m.includes("timeout") ||
    m.includes("gateway") ||
    m.includes("network")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

// ─────────────────────────────────────────────────────────────────────────────
// availableActions (packet §3.5 / Q-X13) ───────────────────────────────────────
// Backend will eventually decorate records with `availableActions[]`; until then
// we derive the descriptor set packet §5.10.B mandates, but rendering always
// reads from a descriptor array so CTAs are authority-driven, never hard-coded.
const ACTION_CREATE_DRAFT: ResourceActionDescriptor = {
  action: "create_draft",
  enabled: true,
  riskLevel: "medium",
};
const ACTION_PUBLISH_RULE: ResourceActionDescriptor = {
  action: "publish_rule",
  enabled: true,
  requiresReason: true,
  riskLevel: "high",
};
const ACTION_PUBLISH_FEE_PLAN: ResourceActionDescriptor = {
  action: "publish_fee_plan",
  enabled: true,
  requiresReason: true,
  riskLevel: "high",
};
// Subsidy authoring is not provisioned in Phase 1 (no contract surface yet).
const ACTION_CREATE_SUBSIDY_DRAFT: ResourceActionDescriptor = {
  action: "create_subsidy_draft",
  enabled: false,
  disabledReasonCode: "not_provisioned",
  riskLevel: "medium",
};

function readActions<T>(
  record: T,
  derived: ResourceActionDescriptor[],
): ResourceActionDescriptor[] {
  const provided = (record as { availableActions?: ResourceActionDescriptor[] })
    .availableActions;
  return Array.isArray(provided) ? provided : derived;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-app deep links (packet §3.10 / §5.10.E — exits to audit trail) ─────────
// Pricing mutations are audited; rows/receipts deep-link to the platform-admin
// audit surface (same-tab, in-app). A `CrossAppResourceLink` keeps the open-mode
// + target explicit so the affordance is uniform with the rest of the suite.
function auditLink(
  resourceType: string,
  resourceId: string,
  label: string,
): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: `/audit?module=pricing&resourceType=${encodeURIComponent(
      resourceType,
    )}&resourceId=${encodeURIComponent(resourceId)}`,
    resourceType,
    resourceId,
    openMode: "same_tab",
    label,
  };
}

function CrossAppLink({
  link,
  theme,
}: {
  link: CrossAppResourceLink;
  theme: ReturnType<typeof buildCanvasTheme>;
}) {
  const external = link.openMode === "new_tab";
  return (
    <a
      href={link.route}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      title={external ? `${link.targetApp} ↗` : link.targetApp}
      style={{
        color: theme.accent,
        textDecoration: "none",
        fontSize: 11.5,
        fontFamily: theme.monoFamily,
        whiteSpace: "nowrap",
      }}
    >
      {link.label}
      {external ? " ↗" : " →"}
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Form + history view models
// ─────────────────────────────────────────────────────────────────────────────
type PricingFormState = {
  ruleName: string;
  version: string;
  serviceFeeBps: string;
  reimbursementMode: "platform_funded" | "mixed";
  applicableTo: string;
  notes: string;
};

type FeePlanFormState = {
  planName: string;
  version: string;
  serviceFeeBps: string;
  reimbursementMode: "platform_funded" | "mixed";
};

type PublishFormState = {
  effectiveFrom: string;
  effectiveTo: string;
  reason: string;
};

type PricingRuleRow = PlatformPricingRuleRecord & Record<string, unknown>;
type FeePlanRow = DriverFeePlanRecord & Record<string, unknown>;
type HistoryRow = {
  key: string;
  version: string;
  type: "passenger" | "driver_fee";
  name: string;
  publishedAt: string;
  publishedBy: string;
  status: string;
  link: CrossAppResourceLink;
};

const EMPTY_PRICING_FORM: PricingFormState = {
  ruleName: "",
  version: "",
  serviceFeeBps: "1500",
  reimbursementMode: "platform_funded",
  applicableTo: "all",
  notes: "",
};

const EMPTY_FEE_PLAN_FORM: FeePlanFormState = {
  planName: "",
  version: "",
  serviceFeeBps: "1500",
  reimbursementMode: "platform_funded",
};

const EMPTY_PUBLISH_FORM: PublishFormState = {
  effectiveFrom: "",
  effectiveTo: "",
  reason: "",
};

const th = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

// ── styles ────────────────────────────────────────────────────────────────────
const pageRootStyle: CSSProperties = {
  minHeight: "100%",
  background: th.bg,
  color: th.text,
  borderRadius: 12,
  overflow: "hidden",
  fontFamily: th.fontFamily,
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const loadingStateStyle: CSSProperties = {
  padding: 24,
  borderRadius: 12,
  background: th.bg,
  color: th.textMuted,
  fontFamily: th.fontFamily,
};

const summaryRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const tabButtonStyle: CSSProperties = {
  appearance: "none",
  border: 0,
  background: "transparent",
  color: "inherit",
  font: "inherit",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const tabCountStyle = (active: boolean): CSSProperties => ({
  fontSize: 10.5,
  fontFamily: th.monoFamily,
  padding: "0 6px",
  borderRadius: 999,
  background: active ? th.accentBg : th.surfaceLo,
  color: active ? th.accent : th.textDim,
});

const cardToolbarStyle: CSSProperties = {
  padding: "14px 14px 0",
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const pillButtonStyle: CSSProperties = {
  padding: 0,
  border: 0,
  background: "transparent",
  cursor: "pointer",
};

const stackedCellStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const primaryTextStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const secondaryTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
  lineHeight: 1.4,
  whiteSpace: "normal",
};

const secondaryMonoStyle: CSSProperties = {
  fontSize: 11,
  color: th.textDim,
  fontFamily: th.monoFamily,
  whiteSpace: "normal",
};

const composerStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 14,
};

const twoFieldRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const monoInputStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: th.monoFamily,
};

const textAreaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 80,
  resize: "vertical",
};

const formActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const helperTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 11.5,
  color: th.textMuted,
  lineHeight: 1.45,
};

const sectionIntroStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: th.text,
  fontSize: 12.5,
  fontWeight: 600,
};

const sectionCopyStyle: CSSProperties = {
  margin: 0,
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const bucketGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const bucketCellStyle = (tone: CanvasTone): CSSProperties => {
  const borderColor =
    tone === "accent"
      ? th.accentBorder
      : tone === "info"
        ? th.infoBorder
        : tone === "warn"
          ? th.warnBorder
          : th.successBorder;
  const badgeColor =
    tone === "accent"
      ? th.accent
      : tone === "info"
        ? th.info
        : tone === "warn"
          ? th.warn
          : th.success;
  const badgeBg =
    tone === "accent"
      ? th.accentBg
      : tone === "info"
        ? th.infoBg
        : tone === "warn"
          ? th.warnBg
          : th.successBg;
  return {
    border: `1px solid ${borderColor}`,
    borderRadius: 8,
    padding: 12,
    display: "grid",
    gap: 8,
    background: th.surfaceLo,
    minWidth: 0,
    boxSizing: "border-box",
    ["--badge-color" as string]: badgeColor,
    ["--badge-bg" as string]: badgeBg,
  };
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2,6,23,0.62)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
  padding: 16,
};

const modalStyle: CSSProperties = {
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 14,
  padding: 22,
  width: "min(480px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: th.shadow,
  color: th.text,
  fontFamily: th.fontFamily,
};

// ── helpers ─────────────────────────────────────────────────────────────────
function normalizeDateTimeLocalValue(value: string) {
  const normalized = value.trim();
  if (!normalized) return { localValue: "", isoValue: null as string | null };
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return { localValue: normalized, isoValue: null as string | null };
  }
  const localValue = [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ]
    .join("-")
    .concat("T")
    .concat(
      [
        String(parsed.getHours()).padStart(2, "0"),
        String(parsed.getMinutes()).padStart(2, "0"),
      ].join(":"),
    );
  return { localValue, isoValue: parsed.toISOString() };
}

function formatBps(locale: string, value: number) {
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function formatPercent(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

function statusTone(
  status: PlatformPricingRuleRecord["status"] | DriverFeePlanRecord["status"],
): CanvasTone {
  if (status === "active" || status === "published") return "success";
  if (status === "draft") return "warn";
  return "neutral";
}

export default function PricingPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const defaultPlanName = getPlatformLabel(locale, "defaultPlanName");

  const [rules, setRules] = useState<PlatformPricingRuleRecord[]>([]);
  const [feePlans, setFeePlans] = useState<DriverFeePlanRecord[]>([]);
  const [productRuleCatalog, setProductRuleCatalog] =
    useState<ProductRuleCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshMeta, setRefreshMeta] = useState<UiRefreshMetadata | null>(
    null,
  );

  const [activeTab, setActiveTab] = useState<TabId>("passenger");
  const [filter, setFilter] = useState<"all" | "active" | "draft" | "archived">(
    "all",
  );
  const [showCreate, setShowCreate] = useState(false);
  const [pricingForm, setPricingForm] =
    useState<PricingFormState>(EMPTY_PRICING_FORM);
  const [feePlanForm, setFeePlanForm] = useState<FeePlanFormState>(() => ({
    ...EMPTY_FEE_PLAN_FORM,
    planName: defaultPlanName,
  }));
  const [showFeePlanForm, setShowFeePlanForm] = useState(false);

  const [publishRuleId, setPublishRuleId] = useState<string | null>(null);
  const [publishForm, setPublishForm] =
    useState<PublishFormState>(EMPTY_PUBLISH_FORM);
  const [publishFormError, setPublishFormError] = useState<string | null>(null);

  const [creatingPricingRule, setCreatingPricingRule] = useState(false);
  const [publishingRuleId, setPublishingRuleId] = useState<string | null>(null);
  const [publishingFeePlan, setPublishingFeePlan] = useState(false);
  const [toast, setToast] = useState<{
    receipt: ActionReceipt;
    ok: boolean;
  } | null>(null);

  // Cross-app entry: deep-links may target a tab (?tab=driver). Read client-side
  // to stay build-safe (no useSearchParams Suspense boundary required).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && (TAB_IDS as readonly string[]).includes(tab)) {
      setActiveTab(tab as TabId);
    }
  }, []);

  const copy =
    locale === "en"
      ? {
          title: "Pricing",
          subtitle:
            "draft → published → retired · publish is an atomic version-replace (Q-ADM10)",
          tabs: {
            passenger: "Passenger Pricing",
            driver: "Driver Fee Plans",
            subsidy: "Subsidy / Reimbursement",
            history: "Published Versions",
          } as Record<TabId, string>,
          authorityTitle: "canonical quoted fare authority",
          authorityFallback:
            "Backend remains the only quoted-fare source. Manual overrides must keep actor, reason, and trace evidence.",
          authorityAuditLink: "Audit trail",
          rulesTitle: "Passenger pricing rules",
          rulesSubtitle:
            "Platform-owned pricing rules remain the only fare authority for quoted fare.",
          authorityCardTitle: "Quoted-fare authority",
          feePlansTitle: "Driver fee plans",
          feePlansSubtitle:
            "Immutable settlement plans used when generating driver statements and payout trails.",
          feePlansComposer:
            "Publish a new immutable fee-plan version for downstream settlement.",
          subsidyTitle: "Subsidy / reimbursement rules",
          subsidySubtitle:
            "Subsidy-rule authoring is not provisioned in Phase 1; reimbursement is governed via pricing-rule reimbursement mode and the payments reimbursement queue.",
          historyTitle: "Published versions · cross-tab history",
          historySubtitle:
            "Chronological published & retired versions across passenger pricing and driver fee plans. Each exits to its audit-trail entry.",
          bucketTitle: (version: string) =>
            `Service bucket fee breakdown (${version})`,
          currentVersionLabel: "canonical version",
          refresh: "Refresh",
          refreshTierLabel: "refresh T4 · medium_slow (30s)",
          lastRefreshed: (time: string) => `updated ${time}`,
          freshness: {
            fresh: "fresh",
            stale: "stale",
            degraded: "degraded",
            unknown: "—",
          } as Record<string, string>,
          notAllowed: "Not allowed",
          openEnded: "open-ended",
          publishWindow: "Publish window",
          publishWindowCopy:
            "Leave either field blank to keep the draft's stored effective window.",
          publishReasonLabel: "Publish reason (required · high-risk)",
          publishReasonPlaceholder:
            "Why is this version safe to publish now? (scope, effective date, conflict check)",
          publishReasonRequired: "A publish reason is required.",
          riskHigh: "HIGH RISK",
          cancel: "Cancel",
          receiptTitle: "Action complete",
          receiptFailed: "Action failed",
          viewAudit: "View audit entry",
          empty: {
            no_data: {
              title: "No records yet",
              body: "Nothing has been created on this tab yet.",
            },
            not_provisioned: {
              title: "Not provisioned in Phase 1",
              body: "This governance surface has no backing contract yet. Track it via pricing-rule reimbursement mode and the payments reimbursement queue.",
            },
            fetch_failed: {
              title: "Couldn't load",
              body: "The pricing service returned an error. Retry, or check the gateway.",
            },
            permission_denied: {
              title: "Permission denied",
              body: "Your role can't read this surface. Requires pa_finance_gov or pa_super_admin.",
            },
            external_unavailable: {
              title: "Upstream unavailable",
              body: "The pricing service is unreachable right now. This is usually transient — retry shortly.",
            },
            filtered_empty: {
              title: "No matches",
              body: "No records match the current filters.",
            },
            retry: "Retry",
            clearFilters: "Clear filters",
          } as Record<string, { title: string; body: string } | string>,
          col: {
            version: "VERSION",
            name: "NAME",
            status: "STATUS",
            fee: "SERVICE FEE bps",
            reimburse: "REIMBURSE",
            scope: "SCOPE",
            effective: "EFFECTIVE",
            type: "TYPE",
            publishedAt: "PUBLISHED AT",
            publishedBy: "PUBLISHED BY",
            audit: "AUDIT",
            plan: "PLAN",
          },
          bucketCards: [
            {
              key: "standard",
              title: "standard",
              base: "NT$ 85 / start",
              continuation: "NT$ 5 / 250m",
              fee: "180 bps",
              note: "standard_taxi core lane",
              tone: "accent" as const,
            },
            {
              key: "business",
              title: "business",
              base: "NT$ 120 / start",
              continuation: "NT$ 6 / 200m",
              fee: "220 bps",
              note: "enterprise dispatch",
              tone: "info" as const,
            },
            {
              key: "airport",
              title: "airport",
              base: "NT$ 180 / start",
              continuation: "flat by zone",
              fee: "250 bps",
              note: "credit-card airport transfer",
              tone: "warn" as const,
            },
            {
              key: "wheelchair",
              title: "wheelchair",
              base: "NT$ 95 / start",
              continuation: "NT$ 5 / 250m",
              fee: "90 bps · subsidy",
              note: "manual reimbursement lane",
              tone: "success" as const,
            },
          ],
        }
      : {
          title: "計價",
          subtitle:
            "draft → published → retired · 發佈為 atomic version-replace (Q-ADM10)",
          tabs: {
            passenger: "Passenger Pricing",
            driver: "Driver Fee Plans",
            subsidy: "Subsidy / Reimbursement",
            history: "Published Versions",
          } as Record<TabId, string>,
          authorityTitle: "canonical quoted fare authority",
          authorityFallback:
            "後端仍是 quoted fare 的唯一真值，所有 manual override 都必須留下 actor、reason 與 trace 證據。",
          authorityAuditLink: "稽核軌跡",
          rulesTitle: "乘客定價規則",
          rulesSubtitle:
            "平台自有 pricing rule 是 quoted fare 的唯一規則真值。",
          authorityCardTitle: "Quoted-fare 權威",
          feePlansTitle: "司機費用方案",
          feePlansSubtitle:
            "發布後不可變更，供 driver statement 與 payout trail 使用。",
          feePlansComposer: "發布新的 immutable fee plan 版本供後續結算使用。",
          subsidyTitle: "補助 / 報銷規則",
          subsidySubtitle:
            "Phase 1 尚未提供補助規則編輯介面；報銷透過 pricing rule 的 reimbursement mode 與 payments 報銷佇列治理。",
          historyTitle: "已發佈版本 · 跨 tab 歷史",
          historySubtitle:
            "跨乘客定價與司機費用方案的已發佈 / 已退役版本（依時間排序），每筆可跳轉其稽核軌跡。",
          bucketTitle: (version: string) => `服務 bucket fee 拆解 (${version})`,
          currentVersionLabel: "canonical version",
          refresh: "重新整理",
          refreshTierLabel: "refresh T4 · medium_slow (30s)",
          lastRefreshed: (time: string) => `更新於 ${time}`,
          freshness: {
            fresh: "fresh",
            stale: "stale",
            degraded: "degraded",
            unknown: "—",
          } as Record<string, string>,
          notAllowed: "不允許",
          openEnded: "未設定截止",
          publishWindow: "發布視窗",
          publishWindowCopy: "任一欄位留空時，會沿用草稿原本儲存的生效區間。",
          publishReasonLabel: "發布理由（必填 · 高風險）",
          publishReasonPlaceholder:
            "為何此版本現在可安全發布？（範圍、生效時間、衝突檢查）",
          publishReasonRequired: "發布理由為必填。",
          riskHigh: "高風險",
          cancel: "取消",
          receiptTitle: "操作完成",
          receiptFailed: "操作失敗",
          viewAudit: "檢視稽核紀錄",
          empty: {
            no_data: { title: "尚無紀錄", body: "此分頁目前沒有任何資料。" },
            not_provisioned: {
              title: "Phase 1 尚未提供",
              body: "此治理介面目前沒有對應 contract。請改由 pricing rule 的 reimbursement mode 與 payments 報銷佇列追蹤。",
            },
            fetch_failed: {
              title: "載入失敗",
              body: "計價服務回傳錯誤。請重試或檢查 gateway。",
            },
            permission_denied: {
              title: "權限不足",
              body: "你的角色無法讀取此介面，需要 pa_finance_gov 或 pa_super_admin。",
            },
            external_unavailable: {
              title: "上游暫時無法連線",
              body: "計價服務目前無法連線，通常為暫時性問題，請稍後重試。",
            },
            filtered_empty: {
              title: "無符合項目",
              body: "沒有符合目前篩選條件的紀錄。",
            },
            retry: "重試",
            clearFilters: "清除篩選",
          } as Record<string, { title: string; body: string } | string>,
          col: {
            version: "版本",
            name: "名稱",
            status: "狀態",
            fee: "SERVICE FEE bps",
            reimburse: "報銷",
            scope: "SCOPE",
            effective: "EFFECTIVE",
            type: "類型",
            publishedAt: "發布時間",
            publishedBy: "發布者",
            audit: "稽核",
            plan: "方案",
          },
          bucketCards: [
            {
              key: "standard",
              title: "standard",
              base: "NT$ 85 / 起",
              continuation: "NT$ 5 / 250m",
              fee: "180 bps",
              note: "standard_taxi 核心車道",
              tone: "accent" as const,
            },
            {
              key: "business",
              title: "business",
              base: "NT$ 120 / 起",
              continuation: "NT$ 6 / 200m",
              fee: "220 bps",
              note: "enterprise dispatch",
              tone: "info" as const,
            },
            {
              key: "airport",
              title: "airport",
              base: "NT$ 180 / 起",
              continuation: "依區域 flat rate",
              fee: "250 bps",
              note: "信用卡機場接送",
              tone: "warn" as const,
            },
            {
              key: "wheelchair",
              title: "wheelchair",
              base: "NT$ 95 / 起",
              continuation: "NT$ 5 / 250m",
              fee: "90 bps · subsidy",
              note: "補貼型 manual reimbursement",
              tone: "success" as const,
            },
          ],
        };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pricingRules, settlementPlans, productRules] = await Promise.all([
        client.listPlatformPricingRules(),
        client.listDriverFeePlans(),
        client.getProductRuleCatalog(),
      ]);
      setRules(pricingRules ?? []);
      setFeePlans(settlementPlans ?? []);
      setProductRuleCatalog(productRules);
      setRefreshMeta({
        generatedAt: new Date().toISOString(),
        staleAfterMs: REFRESH_CADENCE_MS[REFRESH_TIER] ?? 0,
        dataFreshness: "fresh",
        source: "live",
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setRefreshMeta({
        generatedAt: new Date().toISOString(),
        staleAfterMs: 0,
        dataFreshness: "unknown",
        source: "live",
      });
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Refresh-tier polling: medium_slow schedules a 30s reload. A manual tier
  // would skip the timer; here the cadence map drives it (packet §3.2).
  useEffect(() => {
    const cadence = REFRESH_CADENCE_MS[REFRESH_TIER];
    if (!cadence) return;
    const id = setInterval(() => void loadData(), cadence);
    return () => clearInterval(id);
  }, [loadData]);

  const sortedRules = useMemo(
    () =>
      [...rules].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [rules],
  );

  const filteredRules = useMemo(() => {
    if (filter === "all") return sortedRules;
    return sortedRules.filter((rule) => rule.status === filter);
  }, [filter, sortedRules]);

  const draftRules = useMemo(
    () => sortedRules.filter((rule) => rule.status === "draft"),
    [sortedRules],
  );

  const activeRule = useMemo(
    () => sortedRules.find((rule) => rule.status === "active") ?? null,
    [sortedRules],
  );

  const ruleCounts = useMemo(
    () => ({
      all: rules.length,
      active: rules.filter((r) => r.status === "active").length,
      draft: rules.filter((r) => r.status === "draft").length,
      archived: rules.filter((r) => r.status === "archived").length,
    }),
    [rules],
  );

  const ruleRows = useMemo<PricingRuleRow[]>(
    () => filteredRules.map((rule) => ({ ...rule })),
    [filteredRules],
  );

  const feePlanRows = useMemo<FeePlanRow[]>(
    () =>
      [...feePlans]
        .sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime(),
        )
        .map((plan) => ({ ...plan })),
    [feePlans],
  );

  const historyRows = useMemo<HistoryRow[]>(() => {
    const fromRules: HistoryRow[] = rules
      .filter((r) => r.status === "active" || r.status === "archived")
      .map((r) => ({
        key: `rule:${r.ruleId}`,
        version: r.version,
        type: "passenger",
        name: r.ruleName,
        publishedAt: r.publishedAt ?? r.updatedAt,
        publishedBy: r.publishedBy ?? "—",
        status: r.status === "active" ? "published" : "retired",
        link: auditLink("platform_pricing_rule", r.ruleId, copy.col.audit),
      }));
    const fromPlans: HistoryRow[] = feePlans.map((p) => ({
      key: `plan:${p.feePlanId}`,
      version: p.version,
      type: "driver_fee",
      name: p.planName,
      publishedAt: p.publishedAt,
      publishedBy: "—",
      status: p.status,
      link: auditLink("driver_fee_plan", p.feePlanId, copy.col.audit),
    }));
    return [...fromRules, ...fromPlans].sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  }, [rules, feePlans, copy.col.audit]);

  // ── receipt helper ──────────────────────────────────────────────────────────
  const emitReceipt = useCallback(
    (
      actionId: string,
      resourceType: string,
      resourceId: string,
      ok: boolean,
      err?: unknown,
    ) => {
      setToast({
        ok,
        receipt: {
          actionId,
          auditId: ok ? resourceId : "",
          resourceType,
          resourceId,
          status: ok ? "completed" : "failed",
          message: ok
            ? `${actionId} · ${resourceId || resourceType}`
            : err instanceof Error
              ? err.message
              : String(err ?? "error"),
        },
      });
    },
    [],
  );

  // ── form handlers ───────────────────────────────────────────────────────────
  async function handleCreatePricingRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingPricingRule(true);
    setError(null);
    try {
      const created = await client.createPlatformPricingRule({
        ruleName: pricingForm.ruleName,
        version: pricingForm.version,
        serviceFeeBps: Number(pricingForm.serviceFeeBps),
        reimbursementMode: pricingForm.reimbursementMode,
        applicableTo: pricingForm.applicableTo.trim() || "all",
        notes: pricingForm.notes,
      });
      setPricingForm(EMPTY_PRICING_FORM);
      setShowCreate(false);
      emitReceipt(
        "create_draft",
        "platform_pricing_rule",
        created.ruleId,
        true,
      );
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      emitReceipt("create_draft", "platform_pricing_rule", "", false, e);
    } finally {
      setCreatingPricingRule(false);
    }
  }

  function openPublishModal(rule: PlatformPricingRuleRecord) {
    const from = normalizeDateTimeLocalValue(rule.effectiveFrom ?? "");
    const to = normalizeDateTimeLocalValue(rule.effectiveTo ?? "");
    setError(null);
    setPublishFormError(null);
    setPublishRuleId(rule.ruleId);
    setPublishForm({
      effectiveFrom: from.localValue,
      effectiveTo: to.localValue,
      reason: "",
    });
  }

  function closePublishModal() {
    setPublishRuleId(null);
    setPublishForm(EMPTY_PUBLISH_FORM);
    setPublishFormError(null);
  }

  async function handlePublishRule(ruleId: string) {
    const from = normalizeDateTimeLocalValue(publishForm.effectiveFrom);
    const to = normalizeDateTimeLocalValue(publishForm.effectiveTo);

    // high-risk action: reason is required (packet §3.4 / §5.10.B)
    if (!publishForm.reason.trim()) {
      setPublishFormError(copy.publishReasonRequired);
      return;
    }
    if (publishForm.effectiveFrom.trim() && !from.isoValue) {
      setPublishFormError(t("switchboard.err.effectiveFrom"));
      return;
    }
    if (publishForm.effectiveTo.trim() && !to.isoValue) {
      setPublishFormError(t("switchboard.err.effectiveTo"));
      return;
    }
    if (from.isoValue && to.isoValue && to.isoValue < from.isoValue) {
      setPublishFormError(t("switchboard.err.effectiveToOrder"));
      return;
    }

    setPublishingRuleId(ruleId);
    setError(null);
    setPublishFormError(null);
    try {
      await client.publishPlatformPricingRule(ruleId, {
        effectiveFrom: from.isoValue,
        effectiveTo: to.isoValue,
        publishedBy: "platform-admin-web",
      });
      closePublishModal();
      emitReceipt("publish_rule", "platform_pricing_rule", ruleId, true);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      emitReceipt("publish_rule", "platform_pricing_rule", ruleId, false, e);
    } finally {
      setPublishingRuleId(null);
    }
  }

  async function handlePublishFeePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPublishingFeePlan(true);
    setError(null);
    try {
      await client.publishDriverFeePlan({
        planName: feePlanForm.planName,
        version: feePlanForm.version,
        serviceFeeBps: Number(feePlanForm.serviceFeeBps),
        reimbursementMode: feePlanForm.reimbursementMode,
      });
      setFeePlanForm({
        ...EMPTY_FEE_PLAN_FORM,
        planName: feePlanForm.planName,
      });
      setShowFeePlanForm(false);
      emitReceipt(
        "publish_fee_plan",
        "driver_fee_plan",
        feePlanForm.version,
        true,
      );
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      emitReceipt("publish_fee_plan", "driver_fee_plan", "", false, e);
    } finally {
      setPublishingFeePlan(false);
    }
  }

  // ── derived: authority + empty reasons ───────────────────────────────────────
  const authorityItems = productRuleCatalog
    ? [
        {
          k: "Canonical source",
          v: productRuleCatalog.pricingAuthority.canonicalQuotedFareSource,
          mono: true,
        },
        {
          k: "Rule version",
          v: productRuleCatalog.pricingAuthority.canonicalPricingRuleVersion,
          mono: true,
        },
        {
          k: "Tenant quoted fare",
          v: productRuleCatalog.pricingAuthority.tenantCanSetQuotedFare
            ? t("common.yes")
            : copy.notAllowed,
        },
        {
          k: "Partner quoted fare",
          v: productRuleCatalog.pricingAuthority.partnerCanSetQuotedFare
            ? t("common.yes")
            : copy.notAllowed,
        },
        {
          k: "Override actors",
          v: productRuleCatalog.pricingAuthority.manualOverrideActorTypes.join(
            " / ",
          ),
          mono: true,
        },
        {
          k: "Required fields",
          v: productRuleCatalog.pricingAuthority.manualOverrideRequiredFields.join(
            ", ",
          ),
          mono: true,
        },
      ]
    : [];

  const errorReason = error ? classifyFetchError(error) : null;
  const filtersActive = filter !== "all";
  const passengerEmptyReason: PlatformEmptyReason =
    errorReason ?? (filtersActive ? "filtered_empty" : "no_data");
  const listEmptyReason: PlatformEmptyReason = errorReason ?? "no_data";

  const canonicalVersion =
    activeRule?.version ??
    productRuleCatalog?.pricingAuthority.canonicalPricingRuleVersion ??
    "draft";

  // ── columns ───────────────────────────────────────────────────────────────
  const ruleColumns: CanvasTableColumn<PricingRuleRow>[] = [
    {
      h: copy.col.version,
      w: 124,
      mono: true,
      r: (rule) => (
        <div style={stackedCellStyle}>
          <span>{rule.version}</span>
          <span style={secondaryMonoStyle}>
            {formatDateTime(rule.updatedAt)}
          </span>
        </div>
      ),
    },
    {
      h: copy.col.name,
      w: 240,
      r: (rule) => (
        <div style={stackedCellStyle}>
          <span style={primaryTextStyle}>{rule.ruleName}</span>
          <span style={secondaryMonoStyle}>{rule.ruleId}</span>
          {rule.notes ? (
            <span style={secondaryTextStyle}>{rule.notes}</span>
          ) : null}
        </div>
      ),
    },
    {
      h: copy.col.status,
      w: 112,
      r: (rule) => (
        <CanvasPill theme={th} tone={statusTone(rule.status)} dot>
          {formatPlatformCodeLabel(locale, rule.status)}
        </CanvasPill>
      ),
    },
    {
      h: copy.col.fee,
      w: 140,
      align: "right",
      mono: true,
      r: (rule) => (
        <div style={stackedCellStyle}>
          <span>{formatBps(locale, rule.serviceFeeBps)} bps</span>
          <span style={secondaryMonoStyle}>
            {formatPercent(rule.serviceFeeBps)}
          </span>
        </div>
      ),
    },
    {
      h: copy.col.reimburse,
      w: 140,
      r: (rule) => formatPlatformCodeLabel(locale, rule.reimbursementMode),
    },
    {
      h: copy.col.scope,
      w: 160,
      mono: true,
      r: (rule) =>
        rule.applicableTo === "all"
          ? t("common.allTenants")
          : rule.applicableTo,
    },
    {
      h: copy.col.effective,
      w: 210,
      mono: true,
      r: (rule) => (
        <div style={stackedCellStyle}>
          <span>{formatDateTime(rule.effectiveFrom)}</span>
          <span style={secondaryMonoStyle}>
            {rule.effectiveTo
              ? formatDateTime(rule.effectiveTo)
              : copy.openEnded}
          </span>
        </div>
      ),
    },
    {
      h: "",
      w: 120,
      r: (rule) => {
        if (rule.status !== "draft")
          return <span style={secondaryMonoStyle}>—</span>;
        const actions = readActions(rule, [ACTION_PUBLISH_RULE]);
        return (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {actions.map((d) => (
              <ActionCTA
                key={d.action}
                descriptor={d}
                size="xs"
                label={t("pricing.publishDraft")}
                onClick={() => openPublishModal(rule)}
              />
            ))}
          </div>
        );
      },
    },
  ];

  const feePlanColumns: CanvasTableColumn<FeePlanRow>[] = [
    {
      h: copy.col.plan,
      w: 240,
      r: (plan) => (
        <div style={stackedCellStyle}>
          <span style={primaryTextStyle}>{plan.planName}</span>
          <span style={secondaryMonoStyle}>{plan.feePlanId}</span>
        </div>
      ),
    },
    { h: copy.col.version, w: 140, mono: true, k: "version" },
    {
      h: copy.col.fee,
      w: 160,
      align: "right",
      mono: true,
      r: (plan) => (
        <div style={stackedCellStyle}>
          <span>{formatBps(locale, plan.serviceFeeBps)} bps</span>
          <span style={secondaryMonoStyle}>
            {formatPercent(plan.serviceFeeBps)}
          </span>
        </div>
      ),
    },
    {
      h: copy.col.reimburse,
      w: 140,
      r: (plan) => formatPlatformCodeLabel(locale, plan.reimbursementMode),
    },
    {
      h: copy.col.status,
      w: 120,
      r: (plan) => (
        <CanvasPill theme={th} tone={statusTone(plan.status)} dot>
          {formatPlatformCodeLabel(locale, plan.status)}
        </CanvasPill>
      ),
    },
    {
      h: copy.col.publishedAt,
      w: 170,
      mono: true,
      r: (plan) => formatDateTime(plan.publishedAt),
    },
  ];

  const historyColumns: CanvasTableColumn<HistoryRow>[] = [
    { h: copy.col.version, w: 110, mono: true, r: (r) => r.version },
    {
      h: copy.col.type,
      w: 130,
      r: (r) => (
        <CanvasPill
          theme={th}
          tone={r.type === "passenger" ? "info" : "accent"}
        >
          {r.type}
        </CanvasPill>
      ),
    },
    {
      h: copy.col.name,
      w: 230,
      r: (r) => <span style={primaryTextStyle}>{r.name}</span>,
    },
    {
      h: copy.col.publishedAt,
      w: 160,
      mono: true,
      r: (r) => formatDateTime(r.publishedAt),
    },
    { h: copy.col.publishedBy, w: 160, r: (r) => r.publishedBy },
    {
      h: copy.col.status,
      w: 110,
      r: (r) => (
        <CanvasPill
          theme={th}
          tone={r.status === "published" ? "success" : "neutral"}
          dot
        >
          {r.status}
        </CanvasPill>
      ),
    },
    {
      h: copy.col.audit,
      w: 110,
      r: (r) => <CrossAppLink link={r.link} theme={th} />,
    },
  ];

  if (loading && rules.length === 0 && feePlans.length === 0) {
    return <div style={loadingStateStyle}>{t("pricing.loading")}</div>;
  }

  // ── interactive tabs rendered into the canvas page header ─────────────────────
  const tabNodes: ReactNode[] = TAB_IDS.map((id) => {
    const isActive = activeTab === id;
    const count =
      id === "passenger"
        ? rules.length
        : id === "driver"
          ? feePlans.length
          : id === "history"
            ? historyRows.length
            : 0;
    return (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={isActive}
        style={tabButtonStyle}
        onClick={() => setActiveTab(id)}
      >
        {copy.tabs[id]}
        {id !== "subsidy" ? (
          <span style={tabCountStyle(isActive)}>{count}</span>
        ) : null}
      </button>
    );
  });
  const activeTabNode = tabNodes[TAB_IDS.indexOf(activeTab)];

  const publishingRule =
    publishRuleId !== null
      ? (sortedRules.find((r) => r.ruleId === publishRuleId) ?? null)
      : null;

  return (
    <div style={pageRootStyle}>
      <CanvasPageHeader
        theme={th}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={tabNodes}
        activeTab={activeTabNode}
        actions={
          <>
            <RefreshIndicator
              meta={refreshMeta}
              tierLabel={copy.refreshTierLabel}
              freshness={copy.freshness}
              lastRefreshed={copy.lastRefreshed}
            />
            {activeTab === "passenger" ? (
              <ActionCTA
                descriptor={ACTION_CREATE_DRAFT}
                icon={showCreate ? "x" : "plus"}
                label={
                  showCreate
                    ? t("pricing.cancelDraft")
                    : t("pricing.newPricingDraft")
                }
                onClick={() => setShowCreate((c) => !c)}
              />
            ) : null}
            {activeTab === "passenger" ? (
              <ActionCTA
                descriptor={
                  draftRules.length > 0
                    ? ACTION_PUBLISH_RULE
                    : {
                        ...ACTION_PUBLISH_RULE,
                        enabled: false,
                        disabledReasonCode: "no_draft",
                      }
                }
                variant="primary"
                icon="check"
                label={t("pricing.publishDraft")}
                onClick={() => {
                  const next = draftRules[0];
                  if (next) openPublishModal(next);
                }}
              />
            ) : null}
            {activeTab === "driver" ? (
              <ActionCTA
                descriptor={ACTION_PUBLISH_FEE_PLAN}
                variant="primary"
                icon={showFeePlanForm ? "x" : "plus"}
                label={
                  showFeePlanForm
                    ? t("pricing.hidePublishForm")
                    : t("pricing.publishSettlementPlan")
                }
                onClick={() => setShowFeePlanForm((c) => !c)}
              />
            ) : null}
            {activeTab === "subsidy" ? (
              <ActionCTA
                descriptor={ACTION_CREATE_SUBSIDY_DRAFT}
                icon="plus"
                label={t("pricing.createDraft")}
                onClick={() => undefined}
              />
            ) : null}
            <CanvasBtn
              theme={th}
              variant="secondary"
              onClick={() => void loadData()}
            >
              {copy.refresh}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={getPlatformLabel(locale, "error")}
            body={error}
          />
        ) : null}

        <CanvasBanner
          theme={th}
          tone="info"
          icon="warn"
          title={copy.authorityTitle}
          body={
            <span
              style={{
                display: "inline-flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {productRuleCatalog ? (
                <>
                  <strong>
                    {
                      productRuleCatalog.pricingAuthority
                        .canonicalQuotedFareSource
                    }
                  </strong>
                  {" · "}
                  <strong>
                    {
                      productRuleCatalog.pricingAuthority
                        .canonicalPricingRuleVersion
                    }
                  </strong>
                  {" · "}
                  {productRuleCatalog.pricingAuthority.manualOverrideActorTypes.join(
                    " / ",
                  )}
                  {" · "}
                  {productRuleCatalog.pricingAuthority.manualOverrideRequiredFields.join(
                    ", ",
                  )}
                </>
              ) : (
                copy.authorityFallback
              )}
              <CrossAppLink
                link={auditLink(
                  "pricing_authority",
                  canonicalVersion,
                  copy.authorityAuditLink,
                )}
                theme={th}
              />
            </span>
          }
        />

        <div style={summaryRowStyle}>
          <CanvasPill theme={th} tone="warn">
            {t("pricing.platformDrafts")} {ruleCounts.draft}
          </CanvasPill>
          <CanvasPill theme={th} tone="success">
            {t("pricing.activeTemplates")} {ruleCounts.active}
          </CanvasPill>
          <CanvasPill theme={th} tone="info">
            {t("pricing.publishedPlans")} {feePlanRows.length}
          </CanvasPill>
          <CanvasPill theme={th} tone="accent">
            {copy.currentVersionLabel} {canonicalVersion}
          </CanvasPill>
        </div>

        {/* ── Passenger Pricing tab ───────────────────────────────────────── */}
        {activeTab === "passenger" ? (
          <>
            {showCreate ? (
              <CanvasCard
                theme={th}
                title={t("pricing.sectionCreateDraft")}
                subtitle={copy.rulesSubtitle}
              >
                <form onSubmit={handleCreatePricingRule} style={composerStyle}>
                  <div style={fieldGridStyle}>
                    <CanvasField
                      theme={th}
                      label={t("pricing.form.ruleName")}
                      required
                    >
                      <input
                        value={pricingForm.ruleName}
                        onChange={(e) =>
                          setPricingForm((c) => ({
                            ...c,
                            ruleName: e.target.value,
                          }))
                        }
                        required
                        placeholder={defaultPlanName}
                        style={inputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={th}
                      label={t("pricing.form.version")}
                      required
                    >
                      <input
                        value={pricingForm.version}
                        onChange={(e) =>
                          setPricingForm((c) => ({
                            ...c,
                            version: e.target.value,
                          }))
                        }
                        required
                        style={monoInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={th}
                      label={getPlatformLabel(locale, "applicableTo")}
                    >
                      <input
                        value={pricingForm.applicableTo}
                        onChange={(e) =>
                          setPricingForm((c) => ({
                            ...c,
                            applicableTo: e.target.value,
                          }))
                        }
                        style={monoInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={th}
                      label={t("pricing.form.serviceFeeBps")}
                      required
                    >
                      <input
                        type="number"
                        min={0}
                        value={pricingForm.serviceFeeBps}
                        onChange={(e) =>
                          setPricingForm((c) => ({
                            ...c,
                            serviceFeeBps: e.target.value,
                          }))
                        }
                        required
                        style={monoInputStyle}
                      />
                    </CanvasField>
                    <CanvasField theme={th} label={t("pricing.form.reimbMode")}>
                      <select
                        value={pricingForm.reimbursementMode}
                        onChange={(e) =>
                          setPricingForm((c) => ({
                            ...c,
                            reimbursementMode: e.target
                              .value as PricingFormState["reimbursementMode"],
                          }))
                        }
                        style={inputStyle}
                      >
                        <option value="platform_funded">
                          {t("pricing.platformFunded")}
                        </option>
                        <option value="mixed">{t("pricing.mixed")}</option>
                      </select>
                    </CanvasField>
                  </div>
                  <CanvasField theme={th} label={t("pricing.form.notes")}>
                    <textarea
                      value={pricingForm.notes}
                      onChange={(e) =>
                        setPricingForm((c) => ({ ...c, notes: e.target.value }))
                      }
                      rows={3}
                      style={textAreaStyle}
                    />
                  </CanvasField>
                  <div style={formActionsStyle}>
                    <CanvasBtn
                      theme={th}
                      variant="secondary"
                      onClick={() => setShowCreate(false)}
                    >
                      {copy.cancel}
                    </CanvasBtn>
                    <button
                      type="submit"
                      disabled={
                        creatingPricingRule ||
                        !pricingForm.ruleName.trim() ||
                        !pricingForm.version.trim()
                      }
                      style={{
                        ...inputStyle,
                        width: "auto",
                        cursor:
                          creatingPricingRule ||
                          !pricingForm.ruleName.trim() ||
                          !pricingForm.version.trim()
                            ? "not-allowed"
                            : "pointer",
                        border: `1px solid ${th.accent}`,
                        background: th.accent,
                        color: "#ffffff",
                        fontWeight: 600,
                        opacity:
                          creatingPricingRule ||
                          !pricingForm.ruleName.trim() ||
                          !pricingForm.version.trim()
                            ? 0.55
                            : 1,
                      }}
                    >
                      {creatingPricingRule
                        ? t("pricing.creating")
                        : t("pricing.createDraft")}
                    </button>
                  </div>
                </form>
              </CanvasCard>
            ) : null}

            <CanvasCard
              theme={th}
              title={copy.rulesTitle}
              subtitle={copy.rulesSubtitle}
              padding={0}
            >
              <div style={cardToolbarStyle}>
                {(["all", "active", "draft", "archived"] as const).map(
                  (value) => {
                    const count =
                      value === "all"
                        ? ruleCounts.all
                        : value === "active"
                          ? ruleCounts.active
                          : value === "draft"
                            ? ruleCounts.draft
                            : ruleCounts.archived;
                    return (
                      <button
                        key={value}
                        type="button"
                        style={pillButtonStyle}
                        onClick={() => setFilter(value)}
                      >
                        <CanvasPill
                          theme={th}
                          tone={filter === value ? "accent" : "neutral"}
                          dot={value !== "all"}
                        >
                          {formatPlatformCodeLabel(locale, value)} {count}
                        </CanvasPill>
                      </button>
                    );
                  },
                )}
              </div>
              {ruleRows.length > 0 ? (
                <CanvasTable theme={th} columns={ruleColumns} rows={ruleRows} />
              ) : (
                <div style={{ padding: 14 }}>
                  <EmptyState
                    reason={passengerEmptyReason}
                    copy={copy}
                    onRetry={() => void loadData()}
                    onClearFilters={() => setFilter("all")}
                  />
                </div>
              )}
            </CanvasCard>

            <CanvasCard theme={th} title={copy.bucketTitle(canonicalVersion)}>
              <div style={bucketGridStyle}>
                {copy.bucketCards.map((bucket) => (
                  <div key={bucket.key} style={bucketCellStyle(bucket.tone)}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        width: "fit-content",
                        padding: "2px 7px",
                        borderRadius: 999,
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        color: "var(--badge-color)",
                        background: "var(--badge-bg)",
                        textTransform: "uppercase",
                      }}
                    >
                      {bucket.title}
                    </div>
                    <div style={{ display: "grid", gap: 3 }}>
                      <span style={primaryTextStyle}>{bucket.base}</span>
                      <span style={secondaryTextStyle}>
                        {bucket.continuation}
                      </span>
                    </div>
                    <div
                      style={{
                        color: "var(--badge-color)",
                        fontFamily: th.monoFamily,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {bucket.fee}
                    </div>
                    <div style={secondaryMonoStyle}>{bucket.note}</div>
                  </div>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title={copy.authorityCardTitle}
              subtitle={copy.authorityFallback}
            >
              {authorityItems.length > 0 ? (
                <CanvasDL theme={th} cols={2} items={authorityItems} />
              ) : (
                <p style={helperTextStyle}>{copy.authorityFallback}</p>
              )}
            </CanvasCard>
          </>
        ) : null}

        {/* ── Driver Fee Plans tab ────────────────────────────────────────── */}
        {activeTab === "driver" ? (
          <>
            {showFeePlanForm ? (
              <CanvasCard
                theme={th}
                title={t("pricing.sectionPublishPlan")}
                subtitle={copy.feePlansComposer}
              >
                <form onSubmit={handlePublishFeePlan} style={composerStyle}>
                  <div style={fieldGridStyle}>
                    <CanvasField
                      theme={th}
                      label={t("pricing.form.planName")}
                      required
                    >
                      <input
                        value={feePlanForm.planName}
                        onChange={(e) =>
                          setFeePlanForm((c) => ({
                            ...c,
                            planName: e.target.value,
                          }))
                        }
                        required
                        style={inputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={th}
                      label={t("pricing.form.version")}
                      required
                    >
                      <input
                        value={feePlanForm.version}
                        onChange={(e) =>
                          setFeePlanForm((c) => ({
                            ...c,
                            version: e.target.value,
                          }))
                        }
                        required
                        placeholder="drv-fee-v2"
                        style={monoInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={th}
                      label={t("pricing.form.serviceFeeBps")}
                      required
                    >
                      <input
                        type="number"
                        min={0}
                        value={feePlanForm.serviceFeeBps}
                        onChange={(e) =>
                          setFeePlanForm((c) => ({
                            ...c,
                            serviceFeeBps: e.target.value,
                          }))
                        }
                        required
                        style={monoInputStyle}
                      />
                    </CanvasField>
                    <CanvasField theme={th} label={t("pricing.form.reimbMode")}>
                      <select
                        value={feePlanForm.reimbursementMode}
                        onChange={(e) =>
                          setFeePlanForm((c) => ({
                            ...c,
                            reimbursementMode: e.target
                              .value as FeePlanFormState["reimbursementMode"],
                          }))
                        }
                        style={inputStyle}
                      >
                        <option value="platform_funded">
                          {t("pricing.platformFunded")}
                        </option>
                        <option value="mixed">{t("pricing.mixed")}</option>
                      </select>
                    </CanvasField>
                  </div>
                  <p style={helperTextStyle}>{copy.feePlansComposer}</p>
                  <div style={formActionsStyle}>
                    <CanvasBtn
                      theme={th}
                      variant="secondary"
                      onClick={() => setShowFeePlanForm(false)}
                    >
                      {copy.cancel}
                    </CanvasBtn>
                    <button
                      type="submit"
                      disabled={
                        publishingFeePlan || !feePlanForm.version.trim()
                      }
                      style={{
                        ...inputStyle,
                        width: "auto",
                        cursor:
                          publishingFeePlan || !feePlanForm.version.trim()
                            ? "not-allowed"
                            : "pointer",
                        border: `1px solid ${th.accent}`,
                        background: th.accent,
                        color: "#ffffff",
                        fontWeight: 600,
                        opacity:
                          publishingFeePlan || !feePlanForm.version.trim()
                            ? 0.55
                            : 1,
                      }}
                    >
                      {publishingFeePlan
                        ? t("pricing.publishing")
                        : t("pricing.publishSettlementPlan")}
                    </button>
                  </div>
                </form>
              </CanvasCard>
            ) : null}

            <CanvasCard
              theme={th}
              title={copy.feePlansTitle}
              subtitle={copy.feePlansSubtitle}
              padding={0}
            >
              {feePlanRows.length > 0 ? (
                <CanvasTable
                  theme={th}
                  columns={feePlanColumns}
                  rows={feePlanRows}
                />
              ) : (
                <div style={{ padding: 14 }}>
                  <EmptyState
                    reason={listEmptyReason}
                    copy={copy}
                    onRetry={() => void loadData()}
                  />
                </div>
              )}
            </CanvasCard>
          </>
        ) : null}

        {/* ── Subsidy / Reimbursement tab (not provisioned in Phase 1) ─────── */}
        {activeTab === "subsidy" ? (
          <CanvasCard
            theme={th}
            title={copy.subsidyTitle}
            subtitle={copy.subsidySubtitle}
          >
            <EmptyState
              reason={errorReason ?? "not_provisioned"}
              copy={copy}
              onRetry={() => void loadData()}
            />
          </CanvasCard>
        ) : null}

        {/* ── Published Versions tab (cross-tab history) ──────────────────── */}
        {activeTab === "history" ? (
          <CanvasCard
            theme={th}
            title={copy.historyTitle}
            subtitle={copy.historySubtitle}
            padding={0}
          >
            {historyRows.length > 0 ? (
              <CanvasTable
                theme={th}
                columns={historyColumns}
                rows={historyRows}
              />
            ) : (
              <div style={{ padding: 14 }}>
                <EmptyState
                  reason={listEmptyReason}
                  copy={copy}
                  onRetry={() => void loadData()}
                />
              </div>
            )}
          </CanvasCard>
        ) : null}
      </div>

      {/* ── Publish modal — high-risk, requiresReason (packet §3.4) ──────────── */}
      {publishingRule ? (
        <div style={modalOverlayStyle} role="dialog" aria-modal="true">
          <div style={modalStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <CanvasPill theme={th} tone="danger" dot>
                {copy.riskHigh}
              </CanvasPill>
              <h2 style={{ margin: 0, fontSize: 16 }}>
                {t("pricing.publishDraft")}
              </h2>
            </div>
            <div style={sectionIntroStyle}>
              <h3 style={sectionTitleStyle}>{publishingRule.ruleName}</h3>
              <p style={sectionCopyStyle}>
                {publishingRule.version} · {copy.publishWindow}
              </p>
            </div>

            {publishFormError ? (
              <div style={{ margin: "12px 0" }}>
                <CanvasBanner
                  theme={th}
                  tone="danger"
                  icon="warn"
                  title={getPlatformLabel(locale, "error")}
                  body={publishFormError}
                />
              </div>
            ) : null}

            <div style={{ ...twoFieldRowStyle, marginTop: 14 }}>
              <CanvasField
                theme={th}
                label={t("pricing.effectiveFromOverride")}
              >
                <input
                  type="datetime-local"
                  value={publishForm.effectiveFrom}
                  onChange={(e) => {
                    setPublishFormError(null);
                    setPublishForm((c) => ({
                      ...c,
                      effectiveFrom: e.target.value,
                    }));
                  }}
                  style={inputStyle}
                  max={publishForm.effectiveTo || undefined}
                />
              </CanvasField>
              <CanvasField theme={th} label={t("pricing.effectiveToOverride")}>
                <input
                  type="datetime-local"
                  value={publishForm.effectiveTo}
                  onChange={(e) => {
                    setPublishFormError(null);
                    setPublishForm((c) => ({
                      ...c,
                      effectiveTo: e.target.value,
                    }));
                  }}
                  style={inputStyle}
                  min={publishForm.effectiveFrom || undefined}
                />
              </CanvasField>
            </div>

            <p style={{ ...helperTextStyle, marginTop: 10 }}>
              {copy.publishWindowCopy}
            </p>

            <div style={{ marginTop: 14 }}>
              <CanvasField theme={th} label={copy.publishReasonLabel} required>
                <textarea
                  value={publishForm.reason}
                  onChange={(e) => {
                    setPublishFormError(null);
                    setPublishForm((c) => ({ ...c, reason: e.target.value }));
                  }}
                  rows={3}
                  style={textAreaStyle}
                  placeholder={copy.publishReasonPlaceholder}
                />
              </CanvasField>
            </div>

            <div style={{ ...formActionsStyle, marginTop: 18 }}>
              <CanvasBtn
                theme={th}
                variant="secondary"
                onClick={closePublishModal}
                disabled={publishingRuleId === publishingRule.ruleId}
              >
                {copy.cancel}
              </CanvasBtn>
              <CanvasBtn
                theme={th}
                variant="primary"
                danger
                icon="check"
                disabled={
                  publishingRuleId === publishingRule.ruleId ||
                  !publishForm.reason.trim()
                }
                onClick={() => void handlePublishRule(publishingRule.ruleId)}
              >
                {publishingRuleId === publishingRule.ruleId
                  ? t("pricing.publishing")
                  : t("pricing.confirmPublish")}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Receipt toast — ActionReceipt with cross-app "View audit" link ──── */}
      {toast ? (
        <ReceiptToast
          ok={toast.ok}
          receipt={toast.receipt}
          title={toast.ok ? copy.receiptTitle : copy.receiptFailed}
          viewAuditLabel={copy.viewAudit}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Descriptor-driven CTA (packet §3.5) — disabled CTAs stay visible with a
// tooltip reason; high-risk gets a ⚠ prefix.
// ─────────────────────────────────────────────────────────────────────────────
function ActionCTA({
  descriptor,
  label,
  onClick,
  variant = "secondary",
  size = "sm",
  icon,
}: {
  descriptor: ResourceActionDescriptor;
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
  size?: "xs" | "sm" | "md";
  icon?: string;
}) {
  const disabled = !descriptor.enabled;
  return (
    <CanvasBtn
      theme={th}
      variant={variant}
      size={size}
      danger={descriptor.riskLevel === "high" && variant === "primary"}
      icon={icon as never}
      disabled={disabled}
      onClick={onClick}
    >
      {descriptor.riskLevel === "high" ? "⚠ " : ""}
      {label}
    </CanvasBtn>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh indicator (packet §3.2 — tier + freshness + last-refreshed)
// ─────────────────────────────────────────────────────────────────────────────
function RefreshIndicator({
  meta,
  tierLabel,
  freshness,
  lastRefreshed,
}: {
  meta: UiRefreshMetadata | null;
  tierLabel: string;
  freshness: Record<string, string>;
  lastRefreshed: (time: string) => string;
}) {
  const fresh = meta?.dataFreshness ?? "unknown";
  const tone: CanvasTone =
    fresh === "fresh"
      ? "success"
      : fresh === "degraded"
        ? "danger"
        : fresh === "stale"
          ? "warn"
          : "neutral";
  return (
    <span
      title={tierLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        marginRight: 4,
        fontSize: 11.5,
        color: th.textMuted,
      }}
    >
      <CanvasPill theme={th} tone={tone} dot>
        {freshness[fresh] ?? fresh}
      </CanvasPill>
      {meta ? (
        <span
          style={{ fontFamily: th.monoFamily, fontSize: 11, color: th.textDim }}
        >
          {lastRefreshed(formatDateTime(meta.generatedAt))}
        </span>
      ) : null}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state — six distinct EmptyReason treatments (packet §3.6)
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({
  reason,
  copy,
  onRetry,
  onClearFilters,
}: {
  reason: PlatformEmptyReason;
  copy: { empty: Record<string, { title: string; body: string } | string> };
  onRetry?: () => void;
  onClearFilters?: () => void;
}) {
  const treatment = EMPTY_TREATMENTS[reason];
  const text = copy.empty[reason] as { title: string; body: string };
  const accent =
    treatment.tone === "danger"
      ? th.danger
      : treatment.tone === "warn"
        ? th.warn
        : treatment.tone === "info"
          ? th.info
          : th.textDim;
  return (
    <div
      data-empty-reason={reason}
      style={{
        borderLeft: `3px solid ${accent}`,
        background: th.surfaceLo,
        borderRadius: 8,
        textAlign: "center",
        padding: "32px 24px",
        display: "grid",
        gap: 8,
        justifyItems: "center",
      }}
    >
      <div style={{ fontSize: 34 }}>{treatment.glyph}</div>
      <h3 style={{ margin: 0, fontSize: 14, color: th.text }}>{text.title}</h3>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: th.textMuted,
          maxWidth: 460,
          lineHeight: 1.5,
        }}
      >
        {text.body}
      </p>
      {treatment.action === "retry" && onRetry ? (
        <CanvasBtn theme={th} variant="secondary" size="sm" onClick={onRetry}>
          {copy.empty.retry as string}
        </CanvasBtn>
      ) : null}
      {treatment.action === "clear_filters" && onClearFilters ? (
        <CanvasBtn
          theme={th}
          variant="secondary"
          size="sm"
          onClick={onClearFilters}
        >
          {copy.empty.clearFilters as string}
        </CanvasBtn>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Receipt toast — ActionReceipt + cross-app "View audit" deep link (§3.4/§3.10)
// ─────────────────────────────────────────────────────────────────────────────
function ReceiptToast({
  ok,
  receipt,
  title,
  viewAuditLabel,
  onClose,
}: {
  ok: boolean;
  receipt: ActionReceipt;
  title: string;
  viewAuditLabel: string;
  onClose: () => void;
}) {
  const link =
    ok && receipt.auditId
      ? auditLink(receipt.resourceType, receipt.auditId, viewAuditLabel)
      : null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 60,
        maxWidth: 360,
        background: th.bgRaised,
        border: `1px solid ${ok ? th.successBorder : th.dangerBorder}`,
        borderRadius: 12,
        boxShadow: th.shadow,
        padding: 16,
        color: th.text,
        fontFamily: th.fontFamily,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <strong style={{ fontSize: 13 }}>{title}</strong>
        <button
          onClick={onClose}
          type="button"
          aria-label="close"
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 16,
            color: th.textMuted,
          }}
        >
          ×
        </button>
      </div>
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 12,
          color: th.textMuted,
          wordBreak: "break-word",
        }}
      >
        {receipt.message}
      </p>
      {link ? <CrossAppLink link={link} theme={th} /> : null}
    </div>
  );
}
