"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePlatformAdminAssistantPage } from "@/components/assistant/route-context";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  formatPlatformUiError,
  toPlatformErrorMessage,
} from "@/lib/error-copy";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  DriverFeePlanRecord,
  PlatformPricingRuleRecord,
  ProductRuleCatalog,
  PublishPlatformPricingRuleCommand,
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

type TabId = "passenger" | "driver" | "subsidy" | "history";

type PricingRow = PlatformPricingRuleRecord &
  Record<string, unknown> & {
    from: string;
    to: string;
    reimburse: string;
    scope: string;
  };

type FeePlanRow = DriverFeePlanRecord &
  Record<string, unknown> & {
    from: string;
    to: string;
    scope: string;
  };

type SubsidyRow = Record<string, unknown> & {
  version: string;
  name: string;
  status: "published" | "draft";
  trigger: string;
  amount: string;
  scope: string;
  from: string;
  to: string;
};

type HistoryRow = Record<string, unknown> & {
  version: string;
  type: "passenger" | "driver_fee" | "subsidy";
  name: string;
  scope: string;
  publishedAt: string;
  publishedBy: string;
  status: "published" | "retired";
};

const PRICING_TAB_VALUES = new Set<TabId>([
  "passenger",
  "driver",
  "subsidy",
  "history",
]);

function isTabId(value: string | null): value is TabId {
  return value !== null && PRICING_TAB_VALUES.has(value as TabId);
}

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const bodyStyle = {
  padding: 24,
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const loadingStyle = {
  padding: 24,
  color: theme.textMuted,
  fontSize: 12.5,
} satisfies CSSProperties;

const tabRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} satisfies CSSProperties;

const tabButtonStyle = (active: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 12px",
  borderRadius: 999,
  border: `1px solid ${active ? theme.accent : theme.border}`,
  background: active ? theme.accentBg : theme.surface,
  color: active ? theme.accent : theme.textMuted,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
});

const splitGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 0.95fr)",
} satisfies CSSProperties;

const comparisonGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
} satisfies CSSProperties;

const comparisonPanelStyle = (tone: CanvasTone): CSSProperties => {
  const colors: Record<
    CanvasTone,
    { border: string; background: string; accent: string }
  > = {
    neutral: {
      border: theme.border,
      background: theme.surfaceLo,
      accent: theme.textMuted,
    },
    accent: {
      border: theme.accentBorder,
      background: theme.accentBg,
      accent: theme.accent,
    },
    info: {
      border: theme.infoBorder,
      background: theme.infoBg,
      accent: theme.info,
    },
    warn: {
      border: theme.warnBorder,
      background: theme.warnBg,
      accent: theme.warn,
    },
    success: {
      border: theme.successBorder,
      background: theme.successBg,
      accent: theme.success,
    },
    danger: {
      border: theme.dangerBorder,
      background: theme.dangerBg,
      accent: theme.danger,
    },
  };

  return {
    border: `1px solid ${colors[tone].border}`,
    background: colors[tone].background,
    borderRadius: 10,
    padding: 12,
    display: "grid",
    gap: 10,
    minWidth: 0,
    boxSizing: "border-box",
    boxShadow: `inset 0 0 0 1px ${colors[tone].background}`,
    ["--comparison-accent" as string]: colors[tone].accent,
  };
};

const sectionTitleStyle = {
  margin: 0,
  fontSize: 12.5,
  fontWeight: 600,
  color: theme.text,
} satisfies CSSProperties;

const helperStyle = {
  margin: 0,
  fontSize: 11.5,
  lineHeight: 1.45,
  color: theme.textMuted,
} satisfies CSSProperties;

const filterRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const filterChipStyle = (active: boolean): CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${active ? theme.accentBorder : theme.border}`,
  background: active ? theme.accentBg : theme.surface,
  color: active ? theme.accent : theme.textMuted,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
});

const inlineLabelStyle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: theme.textDim,
  textTransform: "uppercase",
} satisfies CSSProperties;

const monoTextStyle = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  color: theme.textDim,
} satisfies CSSProperties;

const bucketGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
} satisfies CSSProperties;

const stepperStyle = {
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const stepRowStyle = (active: boolean, complete: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: "26px minmax(0, 1fr)",
  gap: 10,
  alignItems: "start",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${
    complete ? theme.successBorder : active ? theme.accentBorder : theme.border
  }`,
  background: complete
    ? theme.successBg
    : active
      ? theme.accentBg
      : theme.surface,
});

const stepDotStyle = (active: boolean, complete: boolean): CSSProperties => ({
  width: 22,
  height: 22,
  borderRadius: "50%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: complete
    ? theme.success
    : active
      ? theme.accent
      : theme.surfaceLo,
  color: complete || active ? "#ffffff" : theme.textMuted,
  fontSize: 11,
  fontWeight: 700,
});

const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 50,
} satisfies CSSProperties;

const modalCardStyle = {
  width: "min(560px, 100%)",
  borderRadius: 14,
  background: theme.bg,
  border: `1px solid ${theme.border}`,
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.35)",
  display: "grid",
  gap: 16,
  padding: 20,
} satisfies CSSProperties;

const fieldGridStyle = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
} satisfies CSSProperties;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 12.5,
  padding: "8px 10px",
  fontFamily: theme.fontFamily,
} satisfies CSSProperties;

const textareaStyle = {
  ...inputStyle,
  minHeight: 96,
  resize: "vertical",
} satisfies CSSProperties;

const buttonRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const emptyStateStyle = {
  padding: "28px 16px",
  textAlign: "center",
  color: theme.textMuted,
  fontSize: 12.5,
} satisfies CSSProperties;

const FALLBACK_SUBSIDY_ROWS: SubsidyRow[] = [
  {
    version: "sb_v04",
    name: "輪椅服務補助",
    status: "published",
    trigger: "輪椅服務",
    amount: "NT$ 180 / 每趟",
    scope: "wheelchair",
    from: "2026-01-01",
    to: "open",
  },
  {
    version: "sb_v05",
    name: "夜間機場接送補助",
    status: "published",
    trigger: "機場接送且時段介於 22:00 至 05:59",
    amount: "車資加成 12%",
    scope: "airport_transfer",
    from: "2026-04-01",
    to: "2026-06-30",
  },
];

const SERVICE_BUCKET_META: Record<
  string,
  { label: string; base: string; continuation: string; fee: string }
> = {
  standard_taxi: {
    label: "standard",
    base: "NT$ 85 / 起",
    continuation: "NT$ 5 / 250 公尺",
    fee: "1800 基點",
  },
  business_dispatch: {
    label: "business",
    base: "NT$ 120 / 起",
    continuation: "NT$ 6 / 200 公尺",
    fee: "2200 基點",
  },
  airport_transfer: {
    label: "airport",
    base: "NT$ 180 / 起",
    continuation: "依區域固定",
    fee: "2500 基點",
  },
  wheelchair: {
    label: "wheelchair",
    base: "NT$ 95 / 起",
    continuation: "NT$ 5 / 250 公尺",
    fee: "900 基點 · 補助",
  },
};

function pricingStatusLabel(
  status: PlatformPricingRuleRecord["status"],
): "draft" | "published" | "retired" {
  if (status === "active") return "published";
  if (status === "draft") return "draft";
  return "retired";
}

function ruleTone(status: PlatformPricingRuleRecord["status"]): CanvasTone {
  if (status === "active") return "success";
  if (status === "draft") return "warn";
  return "neutral";
}

function historyTone(status: HistoryRow["status"]): CanvasTone {
  return status === "published" ? "success" : "neutral";
}

function buildPricingRows(rules: PlatformPricingRuleRecord[]): PricingRow[] {
  return rules.map((rule) => ({
    ...rule,
    from: rule.effectiveFrom,
    to: rule.effectiveTo ?? "open",
    reimburse: rule.reimbursementMode,
    scope: rule.applicableTo,
  }));
}

function buildFeePlanRows(plans: DriverFeePlanRecord[]): FeePlanRow[] {
  return plans.map((plan) => ({
    ...plan,
    from: plan.publishedAt ? plan.publishedAt.slice(0, 10) : "2026-04-01",
    to: "open",
    scope: plan.planName.toLowerCase().includes("business")
      ? "business"
      : "standard",
  }));
}

function buildHistoryRows(
  rules: PlatformPricingRuleRecord[],
  plans: DriverFeePlanRecord[],
): HistoryRow[] {
  return [
    ...rules
      .filter((rule) => rule.status !== "draft")
      .map<HistoryRow>((rule) => ({
        version: rule.version,
        type: "passenger",
        name: rule.ruleName,
        scope: rule.applicableTo,
        publishedAt: rule.publishedAt ?? rule.updatedAt,
        publishedBy: rule.publishedBy ?? "system",
        status: rule.status === "archived" ? "retired" : "published",
      })),
    ...plans.map<HistoryRow>((plan) => ({
      version: plan.version,
      type: "driver_fee",
      name: plan.planName,
      scope: plan.planName.toLowerCase().includes("business")
        ? "business"
        : "standard",
      publishedAt: plan.publishedAt,
      publishedBy: "platform_admin",
      status: "published",
    })),
    ...FALLBACK_SUBSIDY_ROWS.map<HistoryRow>((row) => ({
      version: row.version,
      type: "subsidy",
      name: row.name,
      scope: row.scope,
      publishedAt: `${row.from} 00:00`,
      publishedBy: "張薇",
      status: row.status === "draft" ? "retired" : "published",
    })),
  ].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

function reimbursementModeLabel(locale: "en" | "zh", mode: string) {
  if (mode === "mixed") {
    return locale === "en" ? "Manual + Platform" : "人工 + 平台";
  }
  if (mode === "platform_funded") {
    return locale === "en" ? "Platform Only" : "僅平台";
  }
  return formatPlatformCodeLabel(locale, mode);
}

function booleanLabel(locale: "en" | "zh", value: boolean) {
  return locale === "en" ? (value ? "Yes" : "No") : value ? "是" : "否";
}

function ReasonModal({
  selectedDraft,
  copy,
  rangeLabel,
  reason,
  onReasonChange,
  windowFrom,
  windowTo,
  onWindowFromChange,
  onWindowToChange,
  conflictWarning,
  error,
  publishing,
  onClose,
  onSubmit,
}: {
  selectedDraft: PlatformPricingRuleRecord | null;
  copy: {
    modalTitle: string;
    modalSubtitle: string;
    conflictCheckTitle: string;
    effectiveFromLabel: string;
    effectiveToLabel: string;
    reasonLabel: string;
    reasonPlaceholder: string;
    publishErrorTitle: string;
    cancel: string;
    confirmPublish: string;
    publishing: string;
  };
  rangeLabel: string;
  reason: string;
  onReasonChange: (value: string) => void;
  windowFrom: string;
  windowTo: string;
  onWindowFromChange: (value: string) => void;
  onWindowToChange: (value: string) => void;
  conflictWarning: string | null;
  error: string | null;
  publishing: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!selectedDraft) {
    return null;
  }

  return (
    <div style={modalBackdropStyle}>
      <form style={modalCardStyle} onSubmit={onSubmit}>
        <div style={{ display: "grid", gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: theme.text }}>
            {copy.modalTitle}
          </h2>
          <p style={helperStyle}>{copy.modalSubtitle}</p>
        </div>

        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="warn"
          title={selectedDraft.version}
          body={`${selectedDraft.ruleName} · ${rangeLabel}`}
        />

        {conflictWarning ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title={copy.conflictCheckTitle}
            body={conflictWarning}
          />
        ) : null}

        <div style={fieldGridStyle}>
          <CanvasField theme={theme} label={copy.effectiveFromLabel} required>
            <input
              type="datetime-local"
              value={windowFrom}
              onChange={(event) => onWindowFromChange(event.target.value)}
              style={inputStyle}
              required
            />
          </CanvasField>
          <CanvasField theme={theme} label={copy.effectiveToLabel}>
            <input
              type="datetime-local"
              value={windowTo}
              onChange={(event) => onWindowToChange(event.target.value)}
              style={inputStyle}
            />
          </CanvasField>
        </div>

        <CanvasField theme={theme} label={copy.reasonLabel} required>
          <textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            style={textareaStyle}
            placeholder={copy.reasonPlaceholder}
            required
          />
        </CanvasField>

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy.publishErrorTitle}
            body={error}
          />
        ) : null}

        <div style={buttonRowStyle}>
          <CanvasBtn theme={theme} onClick={onClose} disabled={publishing}>
            {copy.cancel}
          </CanvasBtn>
          <button
            type="submit"
            disabled={publishing || reason.trim().length < 12}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              fontSize: 12,
              height: 28,
              fontWeight: 500,
              background: theme.accent,
              color: "#ffffff",
              border: `1px solid ${theme.accent}`,
              borderRadius: 7,
              cursor:
                publishing || reason.trim().length < 12
                  ? "not-allowed"
                  : "pointer",
              opacity: publishing || reason.trim().length < 12 ? 0.55 : 1,
              fontFamily: theme.fontFamily,
            }}
          >
            {publishing ? copy.publishing : copy.confirmPublish}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PricingPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<PlatformPricingRuleRecord[]>([]);
  const [plans, setPlans] = useState<DriverFeePlanRecord[]>([]);
  const [catalog, setCatalog] = useState<ProductRuleCatalog | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishReason, setPublishReason] = useState("");
  const [publishFrom, setPublishFrom] = useState("");
  const [publishTo, setPublishTo] = useState("");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishReceipt, setPublishReceipt] = useState<string | null>(null);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<
    "all" | HistoryRow["type"]
  >("all");
  const [historyScopeFilter, setHistoryScopeFilter] = useState<string>("all");
  const [historyPeriodFilter, setHistoryPeriodFilter] = useState<
    "all" | "90d" | "30d"
  >("all");

  const tabParam = searchParams.get("tab");
  const activeTab: TabId = isTabId(tabParam) ? tabParam : "passenger";
  const openEndedLabel = locale === "en" ? "open" : "持續生效";
  const formatDisplayRange = (from: string, to: string | null) =>
    `${from || "—"} → ${!to || to === "open" ? openEndedLabel : to}`;

  const copy =
    locale === "en"
      ? {
          loadingWorkspace: "Loading pricing workspace…",
          pageTitle: "Pricing",
          pageSubtitle:
            "draft → published → retired · publish atomically replaces the active version",
          canonicalTitle: "Canonical quoted fare authority",
          canonicalBody:
            "The backend is the only source of pricing truth. Any manual override in the UI must go through override governance and retain actor type plus required evidence fields.",
          loadErrorTitle: "Pricing workspace failed to load",
          receiptTitle: "Audit receipt",
          publishUnavailableTitle: `${activeTab === "driver" ? "Publish driver fee plan" : activeTab === "subsidy" ? "Publish subsidy rule" : "Publish"} is not wired yet`,
          publishUnavailableBody:
            "The high-risk publish modal and atomic replace flow are currently wired only for passenger pricing. Driver and subsidy keep the parity structure plus governance guidance for now.",
          tabs: {
            passenger: "Passenger Pricing",
            driver: "Driver Fee Plans",
            subsidy: "Subsidy / Reimbursement Rules",
            history: "Published Versions",
          } as Record<TabId, string>,
          createDraftLabel:
            activeTab === "passenger"
              ? "Create passenger draft"
              : activeTab === "driver"
                ? "Create driver plan draft"
                : activeTab === "subsidy"
                  ? "Create subsidy draft"
                  : "View version history",
          publishButtonLabel:
            activeTab === "driver"
              ? "Publish driver fee plan"
              : activeTab === "subsidy"
                ? "Publish subsidy rule"
                : "Publish",
          passengerEmpty: "No passenger pricing versions yet.",
          driverEmpty: "No driver fee plan versions yet.",
          historyEmpty: "No version history matches the current filters.",
          serviceBucketBreakdownTitle: (version: string) =>
            `Service bucket fee breakdown · ${version}`,
          bucketFallbackBase: "canonical backend rule",
          bucketFallbackContinuation: "see pricing rule",
          activeDraftComparisonTitle: "Active / Draft Comparison",
          passengerComparisonSubtitle:
            "Compare the canonical active version with the candidate draft before publish.",
          activeLabel: "Active",
          draftLabel: "Draft",
          currentLabel: "current",
          publishCandidateLabel: "publish candidate",
          emptyLabel: "empty",
          noActiveRule: "No active pricing rule.",
          noDraftRule: "No pricing draft is waiting to be published.",
          publishStepperTitle: "Publish Stepper",
          publishStepperSubtitle:
            "select draft → compare → capture reason → atomic replace",
          conflictCheckTitle: "Scope conflict check",
          stepSelectDraft: "1. Select draft",
          stepCompare: "2. Compare active / draft",
          stepReason: "3. High-risk reason",
          stepReceipt: "4. Audit receipt",
          stepNoDraft: "There is no draft available for publishing.",
          stepNeedCompare:
            "An active version and a draft are both required for comparison.",
          stepOpenModal: "Open the modal and fill in the required reason.",
          stepReceiptPending:
            "A receipt summary will appear here after publish.",
          overrideTitle: "Override Governance",
          overrideSubtitle:
            "Manual overrides are record-only governance and must not replace the canonical quoted fare authority.",
          driverComparisonSubtitle:
            "Driver settlement plans remain immutable after publish.",
          publishedLabel: "Published",
          draftQueueLabel: "Draft Queue",
          noPublishedDriverPlan:
            "There is no published driver fee plan right now.",
          noDriverDraft:
            "The backend currently returns only published fee plans; the draft comparison area is intentionally reserved.",
          feeStructureTitle: "Per-trip Fee Structure",
          feeStructureSubtitle: "Must-show fee structure + subsidy linkage.",
          noFeeStructure: "No fee structure is available to display right now.",
          subsidyLinkageTitle: "Subsidy / Reimbursement Linkage",
          subsidyLinkageSubtitle:
            "Subsidy rules and reimbursement queues are governed separately, but share the same quoted fare authority.",
          overrideEvidenceSubtitle:
            "Manual override actors and evidence obligations.",
          historyFiltersTitle: "Published Version Filters",
          historyFiltersSubtitle:
            "Cross-tab history can be filtered by type, scope, and period.",
          historyTitle: "All published versions · cross-tab history",
          typeLabel: "Type",
          scopeLabel: "Scope",
          periodLabel: "Period",
          last90d: "Last 90d",
          last30d: "Last 30d",
          receiptPublished: (version: string, reason: string) =>
            `${version} published with reason "${reason}" at ${new Date().toISOString()}`,
          publishNoDraftError:
            "There is no draft pricing rule available for publishing.",
          publishReasonTooShort:
            "A high-risk reason must be at least 12 characters long.",
          conflictManyDrafts: (count: number, scope: string) =>
            `${count} drafts share scope ${scope}; confirm the intended winner before atomic replace.`,
          conflictRetireActive: (
            activeVersion: string,
            nextVersion: string,
            scope: string,
          ) =>
            `${activeVersion} will be retired for scope ${scope} when ${nextVersion} is published.`,
          modal: {
            modalTitle: "Publish version",
            modalSubtitle:
              "This high-risk action requires a reason and records actor, reason, and trace evidence in the audit receipt.",
            conflictCheckTitle: "Scope conflict check",
            effectiveFromLabel: "Effective from",
            effectiveToLabel: "Effective to",
            reasonLabel: "High-risk reason",
            reasonPlaceholder:
              "Describe the governance reason, impact radius, and approval basis for this pricing publish.",
            publishErrorTitle: "Unable to publish draft",
            cancel: "Cancel",
            confirmPublish: "Confirm publish",
            publishing: "Publishing…",
          },
        }
      : {
          loadingWorkspace: "載入定價工作面中…",
          pageTitle: "定價治理",
          pageSubtitle: "草稿 → 已發布 → 已退役 · 發布採原子替換",
          canonicalTitle: "標準報價權威來源",
          canonicalBody:
            "後端是唯一的定價真值來源。前端任何人工覆寫都必須走覆寫治理，並保留操作者類型與必填證據欄位。",
          loadErrorTitle: "定價工作面載入失敗",
          receiptTitle: "稽核收據",
          publishUnavailableTitle: `${activeTab === "driver" ? "發布司機費用方案" : activeTab === "subsidy" ? "發布補助規則" : "發布"}尚未接上變更端點`,
          publishUnavailableBody:
            "高風險發布視窗與原子替換流程目前只接在乘客定價；司機與補助頁先保留同構版面與治理提示。",
          tabs: {
            passenger: "乘客定價",
            driver: "司機費用方案",
            subsidy: "補助 / 代墊規則",
            history: "已發布版本",
          } as Record<TabId, string>,
          createDraftLabel:
            activeTab === "passenger"
              ? "建立乘客定價草稿"
              : activeTab === "driver"
                ? "建立司機方案草稿"
                : activeTab === "subsidy"
                  ? "建立補助草稿"
                  : "查看版本歷史",
          publishButtonLabel:
            activeTab === "driver"
              ? "發布司機費用方案"
              : activeTab === "subsidy"
                ? "發布補助規則"
                : "發布",
          passengerEmpty: "目前沒有乘客定價版本。",
          driverEmpty: "目前沒有司機費用方案版本。",
          historyEmpty: "目前篩選條件下沒有可顯示的版本歷史。",
          serviceBucketBreakdownTitle: (version: string) =>
            `服務類別費用拆解 · ${version}`,
          bucketFallbackBase: "以後端標準規則為準",
          bucketFallbackContinuation: "請參考定價規則",
          activeDraftComparisonTitle: "現行 / 草稿比對",
          passengerComparisonSubtitle: "發布前比對標準現行版本與候選草稿版本。",
          activeLabel: "現行",
          draftLabel: "草稿",
          currentLabel: "目前生效",
          publishCandidateLabel: "發布候選",
          emptyLabel: "空白",
          noActiveRule: "目前沒有生效中的定價規則。",
          noDraftRule: "目前沒有待發布的定價草稿。",
          publishStepperTitle: "發布步驟",
          publishStepperSubtitle: "選擇草稿 → 比對版本 → 填寫原因 → 原子替換",
          conflictCheckTitle: "範圍衝突檢查",
          stepSelectDraft: "1. 選擇草稿",
          stepCompare: "2. 比對現行 / 草稿",
          stepReason: "3. 高風險原因",
          stepReceipt: "4. 稽核收據",
          stepNoDraft: "目前沒有可發布的草稿。",
          stepNeedCompare: "需要同時有現行版本與草稿版本才能比對。",
          stepOpenModal: "開啟視窗並填寫必填原因。",
          stepReceiptPending: "發布後會在這裡留下收據摘要。",
          overrideTitle: "覆寫治理",
          overrideSubtitle:
            "人工覆寫僅能作為記錄式治理，不得覆蓋標準報價權威來源。",
          driverComparisonSubtitle: "司機結算方案一旦發布後即保持不可變。",
          publishedLabel: "已發布",
          draftQueueLabel: "草稿佇列",
          noPublishedDriverPlan: "目前沒有已發布的司機費用方案。",
          noDriverDraft:
            "目前後端只回傳已發布方案；草稿比對區刻意保留為治理空位。",
          feeStructureTitle: "單趟費用結構",
          feeStructureSubtitle: "必須呈現的費用結構與補助關聯。",
          noFeeStructure: "目前沒有可展示的費用結構。",
          subsidyLinkageTitle: "補助 / 代墊連動",
          subsidyLinkageSubtitle:
            "補助規則與代墊佇列各自治理，但共用同一條報價權威來源。",
          overrideEvidenceSubtitle: "人工覆寫的操作者與證據義務。",
          historyFiltersTitle: "已發布版本篩選",
          historyFiltersSubtitle: "跨分頁歷史可依類型、範圍與期間篩選。",
          historyTitle: "所有已發布版本 · 跨分頁歷史",
          typeLabel: "類型",
          scopeLabel: "範圍",
          periodLabel: "期間",
          last90d: "近 90 天",
          last30d: "近 30 天",
          receiptPublished: (version: string, reason: string) =>
            `稽核收據：${version} 已於 ${new Date().toISOString()} 發布。原因：${reason}`,
          publishNoDraftError: "沒有可發布的定價草稿規則。",
          publishReasonTooShort: "高風險原因至少需要 12 個字。",
          conflictManyDrafts: (count: number, scope: string) =>
            `${count} 份草稿共用範圍 ${scope}；發布前請先確認真正要勝出的版本。`,
          conflictRetireActive: (
            activeVersion: string,
            nextVersion: string,
            scope: string,
          ) =>
            `${activeVersion} 會在 ${nextVersion} 發布後於範圍 ${scope} 退役。`,
          modal: {
            modalTitle: "發布版本",
            modalSubtitle:
              "這是高風險操作，必須填寫原因，並在稽核收據中保留操作者、原因與追蹤證據。",
            conflictCheckTitle: "範圍衝突檢查",
            effectiveFromLabel: "生效開始",
            effectiveToLabel: "生效結束",
            reasonLabel: "高風險原因",
            reasonPlaceholder:
              "請描述這次定價發布的治理原因、影響範圍與核准依據。",
            publishErrorTitle: "無法發布草稿",
            cancel: "取消",
            confirmPublish: "確認發布",
            publishing: "發布中…",
          },
        };

  function handleTabChange(nextTab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [pricingRules, feePlans, productCatalog] = await Promise.all([
          client.listPlatformPricingRules(),
          client.listDriverFeePlans(),
          client.getProductRuleCatalog(),
        ]);
        setRules(pricingRules ?? []);
        setPlans(feePlans ?? []);
        setCatalog(productCatalog);
      } catch (loadError) {
        setError(
          formatPlatformUiError(
            locale,
            toPlatformErrorMessage(loadError),
            locale === "en"
              ? "Unable to load pricing workspace"
              : "無法載入費率治理工作區",
          ),
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [client, locale]);

  const pricingRows = useMemo(() => buildPricingRows(rules), [rules]);
  const feePlanRows = useMemo(() => buildFeePlanRows(plans), [plans]);
  const historyRows = useMemo(
    () => buildHistoryRows(rules, plans),
    [plans, rules],
  );
  const subsidyRows = useMemo(() => FALLBACK_SUBSIDY_ROWS, []);

  const activeRule =
    rules.find((rule) => rule.status === "active") ??
    rules.find((rule) => rule.status !== "archived") ??
    null;
  // Memoized so the reference is stable across renders: `draftRules` is a
  // dependency of the `assistantBridge` useMemo below, and deriving it inline
  // produced a fresh array every render, which recreated the bridge and made
  // usePlatformAdminAssistantPage call setPageBridge on every render. Sibling
  // pages (tenants, switchboard) register their bridge with a [] dependency;
  // this keeps pricing consistent and avoids the wasted re-registration churn.
  const draftRules = useMemo(
    () => rules.filter((rule) => rule.status === "draft"),
    [rules],
  );
  const selectedDraft =
    draftRules.find((rule) => rule.ruleId === selectedDraftId) ??
    draftRules[0] ??
    null;
  const activePlan = plans[0] ?? null;
  const draftPlan =
    feePlanRows.find((plan) => plan.version.toLowerCase().includes("draft")) ??
    null;
  const selectedFeePlan = draftPlan ?? activePlan;
  const manualOverrideActors = catalog?.pricingAuthority
    .manualOverrideActorTypes ?? ["platform_admin", "ops_user"];
  const requiredFields = catalog?.pricingAuthority
    .manualOverrideRequiredFields ?? ["actor", "reason", "traceId"];
  const historyScopeOptions = useMemo(() => {
    return ["all", ...new Set(historyRows.map((row) => row.scope))];
  }, [historyRows]);
  const filteredHistoryRows = useMemo(() => {
    const now = new Date("2026-06-02T00:00:00Z");
    return historyRows.filter((row) => {
      if (historyTypeFilter !== "all" && row.type !== historyTypeFilter) {
        return false;
      }
      if (historyScopeFilter !== "all" && row.scope !== historyScopeFilter) {
        return false;
      }
      if (historyPeriodFilter === "all") {
        return true;
      }

      const rowTime = new Date(row.publishedAt.replace(" ", "T")).getTime();
      const diffDays = (now.getTime() - rowTime) / (1000 * 60 * 60 * 24);
      return historyPeriodFilter === "30d" ? diffDays <= 30 : diffDays <= 90;
    });
  }, [historyPeriodFilter, historyRows, historyScopeFilter, historyTypeFilter]);
  const conflictingDrafts = draftRules.filter(
    (rule) => rule.applicableTo === selectedDraft?.applicableTo,
  );
  const publishConflictBody =
    conflictingDrafts.length > 1
      ? copy.conflictManyDrafts(
          conflictingDrafts.length,
          selectedDraft?.applicableTo ?? "—",
        )
      : activeRule &&
          selectedDraft &&
          activeRule.applicableTo === selectedDraft.applicableTo
        ? copy.conflictRetireActive(
            activeRule.version,
            selectedDraft.version,
            selectedDraft.applicableTo,
          )
        : null;
  const publishSupported = activeTab === "passenger";

  useEffect(() => {
    if (!selectedDraft) {
      return;
    }
    setSelectedDraftId(selectedDraft.ruleId);
    setPublishFrom(selectedDraft.effectiveFrom.slice(0, 16));
    setPublishTo(selectedDraft.effectiveTo?.slice(0, 16) ?? "");
  }, [selectedDraft]);

  const assistantBridge = useMemo(
    () => ({
      pageId: "pricing",
      filters: {
        active_tab: {
          apply(value: unknown) {
            if (
              typeof value !== "string" ||
              !PRICING_TAB_VALUES.has(value as TabId)
            ) {
              return {
                ok: false,
                code: "invalid_filter_value",
                message:
                  "Pricing tab filter accepts only passenger, driver, subsidy, or history.",
              } as const;
            }
            handleTabChange(value as TabId);
            return {
              ok: true,
              code: "filter_applied",
              message: `Applied pricing tab ${value}.`,
              payload: { filterId: "active_tab", value },
            } as const;
          },
        },
      },
      drafts: {
        publish_rule_window: {
          fill(values: Record<string, unknown>) {
            const ruleId =
              typeof values.ruleId === "string" ? values.ruleId : null;
            if (ruleId) {
              const matchedRule =
                draftRules.find((rule) => rule.ruleId === ruleId) ?? null;
              if (!matchedRule) {
                return {
                  ok: false,
                  code: "draft_rule_not_found",
                  message:
                    "Publish window draft requires a known draft pricing rule id.",
                } as const;
              }
              setSelectedDraftId(matchedRule.ruleId);
              setPublishFrom(matchedRule.effectiveFrom.slice(0, 16));
              setPublishTo(matchedRule.effectiveTo?.slice(0, 16) ?? "");
            }
            setPublishFrom((current) =>
              typeof values.effectiveFrom === "string"
                ? values.effectiveFrom
                : current,
            );
            setPublishTo((current) =>
              typeof values.effectiveTo === "string"
                ? values.effectiveTo
                : current,
            );
            setPublishModalOpen(true);
            return {
              ok: true,
              code: "draft_filled",
              message:
                "Filled pricing publish window draft without submitting.",
            } as const;
          },
        },
      },
    }),
    [draftRules],
  );

  usePlatformAdminAssistantPage(assistantBridge);

  const passengerColumns: CanvasTableColumn<PricingRow>[] = [
    {
      h: locale === "en" ? "Version" : "版本",
      k: "version",
      mono: true,
      w: 108,
    },
    { h: locale === "en" ? "Name" : "名稱", k: "ruleName", w: 220 },
    {
      h: locale === "en" ? "Status" : "狀態",
      w: 108,
      r: (row) => (
        <CanvasPill theme={theme} tone={ruleTone(row.status)} dot>
          {formatPlatformCodeLabel(locale, pricingStatusLabel(row.status))}
        </CanvasPill>
      ),
    },
    {
      h: locale === "en" ? "Service Fee (bps)" : "服務費（基點）",
      k: "serviceFeeBps",
      mono: true,
      align: "right",
    },
    {
      h: locale === "en" ? "Reimbursement" : "補助模式",
      mono: true,
      w: 180,
      r: (row) => reimbursementModeLabel(locale, row.reimburse),
    },
    {
      h: locale === "en" ? "Scope" : "範圍",
      mono: true,
      w: 180,
      r: (row) => formatPlatformCodeLabel(locale, row.scope),
    },
    {
      h: locale === "en" ? "Effective" : "生效期間",
      w: 210,
      r: (row) => (
        <span style={monoTextStyle}>
          {formatDisplayRange(row.from, row.to)}
        </span>
      ),
    },
  ];

  const driverColumns: CanvasTableColumn<FeePlanRow>[] = [
    {
      h: locale === "en" ? "Version" : "版本",
      k: "version",
      mono: true,
      w: 108,
    },
    { h: locale === "en" ? "Name" : "名稱", k: "planName", w: 240 },
    {
      h: locale === "en" ? "Status" : "狀態",
      w: 108,
      r: () => (
        <CanvasPill theme={theme} tone="success" dot>
          {formatPlatformCodeLabel(locale, "published")}
        </CanvasPill>
      ),
    },
    {
      h: locale === "en" ? "Scope" : "範圍",
      mono: true,
      w: 160,
      r: (row) => formatPlatformCodeLabel(locale, row.scope),
    },
    {
      h: locale === "en" ? "Service Fee (bps)" : "服務費（基點）",
      k: "serviceFeeBps",
      mono: true,
      align: "right",
    },
    {
      h: locale === "en" ? "Effective" : "生效期間",
      w: 210,
      r: (row) => (
        <span style={monoTextStyle}>
          {formatDisplayRange(row.from, row.to)}
        </span>
      ),
    },
  ];

  const subsidyColumns: CanvasTableColumn<SubsidyRow>[] = [
    {
      h: locale === "en" ? "Version" : "版本",
      k: "version",
      mono: true,
      w: 108,
    },
    { h: locale === "en" ? "Name" : "名稱", k: "name", w: 220 },
    {
      h: locale === "en" ? "Status" : "狀態",
      w: 108,
      r: (row) => (
        <CanvasPill
          theme={theme}
          tone={row.status === "published" ? "success" : "warn"}
          dot
        >
          {formatPlatformCodeLabel(locale, row.status)}
        </CanvasPill>
      ),
    },
    {
      h: locale === "en" ? "Trigger" : "觸發條件",
      k: "trigger",
      mono: true,
      w: 300,
    },
    {
      h: locale === "en" ? "Amount / Pct" : "金額 / 比例",
      k: "amount",
      mono: true,
      w: 160,
    },
    {
      h: locale === "en" ? "Scope" : "範圍",
      mono: true,
      w: 140,
      r: (row) => formatPlatformCodeLabel(locale, row.scope),
    },
    {
      h: locale === "en" ? "Effective" : "生效期間",
      w: 210,
      r: (row) => (
        <span style={monoTextStyle}>
          {formatDisplayRange(row.from, row.to)}
        </span>
      ),
    },
  ];

  const historyColumns: CanvasTableColumn<HistoryRow>[] = [
    {
      h: locale === "en" ? "Version" : "版本",
      k: "version",
      mono: true,
      w: 108,
    },
    {
      h: locale === "en" ? "Type" : "類型",
      mono: true,
      w: 132,
      r: (row) => formatPlatformCodeLabel(locale, row.type),
    },
    {
      h: locale === "en" ? "Scope" : "範圍",
      mono: true,
      w: 132,
      r: (row) => formatPlatformCodeLabel(locale, row.scope),
    },
    { h: locale === "en" ? "Name" : "名稱", k: "name", w: 240 },
    {
      h: locale === "en" ? "Published At" : "發布時間",
      w: 170,
      r: (row) => <span style={monoTextStyle}>{row.publishedAt}</span>,
    },
    {
      h: locale === "en" ? "Published By" : "發布者",
      w: 180,
      r: (row) => formatPlatformCodeLabel(locale, row.publishedBy),
    },
    {
      h: locale === "en" ? "Status" : "狀態",
      w: 108,
      r: (row) => (
        <CanvasPill theme={theme} tone={historyTone(row.status)} dot>
          {formatPlatformCodeLabel(locale, row.status)}
        </CanvasPill>
      ),
    },
  ];

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDraft) {
      setPublishError(copy.publishNoDraftError);
      return;
    }
    if (publishReason.trim().length < 12) {
      setPublishError(copy.publishReasonTooShort);
      return;
    }

    setPublishing(true);
    setPublishError(null);

    const command: PublishPlatformPricingRuleCommand = {
      effectiveFrom: publishFrom ? new Date(publishFrom).toISOString() : null,
      effectiveTo: publishTo ? new Date(publishTo).toISOString() : null,
      publishedBy: `platform_admin:${locale}`,
    };

    try {
      await client.publishPlatformPricingRule(selectedDraft.ruleId, command);
      const [nextRules, nextPlans, nextCatalog] = await Promise.all([
        client.listPlatformPricingRules(),
        client.listDriverFeePlans(),
        client.getProductRuleCatalog(),
      ]);
      setRules(nextRules ?? []);
      setPlans(nextPlans ?? []);
      setCatalog(nextCatalog);
      setPublishModalOpen(false);
      setPublishReceipt(
        copy.receiptPublished(selectedDraft.version, publishReason.trim()),
      );
      setPublishReason("");
    } catch (publishFailure) {
      setPublishError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(publishFailure),
          copy.modal.publishErrorTitle,
        ),
      );
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return <div style={loadingStyle}>{copy.loadingWorkspace}</div>;
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              icon="plus"
              onClick={() =>
                handleTabChange(
                  activeTab === "history" ? "passenger" : activeTab,
                )
              }
            >
              {copy.createDraftLabel}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="check"
              disabled={!publishSupported || !selectedDraft}
              onClick={() => {
                if (!publishSupported) {
                  return;
                }
                setPublishModalOpen(true);
                setPublishError(null);
              }}
            >
              {copy.publishButtonLabel}
            </CanvasBtn>
          </>
        }
      />

      <div style={bodyStyle}>
        <CanvasBanner
          theme={theme}
          tone="info"
          icon="info"
          title={copy.canonicalTitle}
          body={copy.canonicalBody}
        />

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy.loadErrorTitle}
            body={error}
          />
        ) : null}

        {publishReceipt ? (
          <CanvasBanner
            theme={theme}
            tone="success"
            icon="check"
            title={copy.receiptTitle}
            body={publishReceipt}
          />
        ) : null}

        {!publishSupported && activeTab !== "history" ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title={copy.publishUnavailableTitle}
            body={copy.publishUnavailableBody}
          />
        ) : null}

        <div style={tabRowStyle}>
          {[
            { id: "passenger" as const, label: copy.tabs.passenger },
            { id: "driver" as const, label: copy.tabs.driver },
            { id: "subsidy" as const, label: copy.tabs.subsidy },
            { id: "history" as const, label: copy.tabs.history },
          ].map((tab) => (
            <Link
              key={tab.id}
              href={`${pathname}?tab=${tab.id}`}
              replace
              scroll={false}
              prefetch={false}
              style={{
                ...tabButtonStyle(activeTab === tab.id),
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {activeTab === "passenger" ? (
          <div style={splitGridStyle}>
            <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
              <CanvasCard theme={theme} padding={0}>
                {pricingRows.length === 0 ? (
                  <div style={emptyStateStyle}>{copy.passengerEmpty}</div>
                ) : (
                  <CanvasTable<PricingRow>
                    theme={theme}
                    columns={passengerColumns}
                    rows={pricingRows}
                  />
                )}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.serviceBucketBreakdownTitle(
                  activeRule?.version ??
                    catalog?.pricingAuthority.canonicalPricingRuleVersion ??
                    "pr_v23",
                )}
              >
                <div style={bucketGridStyle}>
                  {(catalog?.phase1ServiceBuckets ?? [])
                    .slice(0, 4)
                    .map((bucket: string) => {
                      const meta = SERVICE_BUCKET_META[bucket] ?? {
                        label: formatPlatformCodeLabel(locale, bucket),
                        base: copy.bucketFallbackBase,
                        continuation: copy.bucketFallbackContinuation,
                        fee:
                          locale === "en"
                            ? `${activeRule?.serviceFeeBps ?? 1800} bps`
                            : `${activeRule?.serviceFeeBps ?? 1800} 基點`,
                      };

                      return (
                        <div
                          key={bucket}
                          style={comparisonPanelStyle("neutral")}
                        >
                          <div style={{ display: "grid", gap: 4 }}>
                            <div
                              style={{
                                color: theme.text,
                                fontWeight: 600,
                                fontFamily: theme.monoFamily,
                              }}
                            >
                              {locale === "en"
                                ? meta.label
                                : formatPlatformCodeLabel(locale, bucket)}
                            </div>
                            <div style={helperStyle}>
                              {meta.base}
                              <br />
                              {meta.continuation}
                            </div>
                          </div>
                          <div
                            style={{
                              color: theme.accent,
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {meta.fee}
                          </div>
                        </div>
                      );
                    })}
                  {catalog?.phase1ServiceBuckets?.length ? null : (
                    <>
                      {[
                        {
                          key: "standard",
                          base: "NT$ 85 / 起",
                          cont: "NT$ 5 / 250 公尺",
                          fee: locale === "en" ? "1800 bps" : "1800 基點",
                        },
                        {
                          key: "business",
                          base: "NT$ 120 / 起",
                          cont: "NT$ 6 / 200 公尺",
                          fee: locale === "en" ? "2200 bps" : "2200 基點",
                        },
                        {
                          key: "airport",
                          base: "NT$ 180 / 起",
                          cont: locale === "en" ? "flat by zone" : "依區域固定",
                          fee: locale === "en" ? "2500 bps" : "2500 基點",
                        },
                        {
                          key: "wheelchair",
                          base: "NT$ 95 / 起",
                          cont: "NT$ 5 / 250 公尺",
                          fee:
                            locale === "en"
                              ? "900 bps · subsidy"
                              : "900 基點 · 補助",
                        },
                      ].map((bucket) => (
                        <div
                          key={bucket.key}
                          style={comparisonPanelStyle("neutral")}
                        >
                          <div
                            style={{
                              color: theme.text,
                              fontWeight: 600,
                              fontFamily: theme.monoFamily,
                            }}
                          >
                            {formatPlatformCodeLabel(locale, bucket.key)}
                          </div>
                          <div style={helperStyle}>
                            {bucket.base}
                            <br />
                            {bucket.cont}
                          </div>
                          <div
                            style={{
                              color: theme.accent,
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {bucket.fee}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </CanvasCard>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <CanvasCard
                theme={theme}
                title={copy.activeDraftComparisonTitle}
                subtitle={copy.passengerComparisonSubtitle}
              >
                <div style={comparisonGridStyle}>
                  <div style={comparisonPanelStyle("success")}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <h3 style={sectionTitleStyle}>{copy.activeLabel}</h3>
                      <CanvasPill theme={theme} tone="success" dot>
                        {copy.currentLabel}
                      </CanvasPill>
                    </div>
                    {activeRule ? (
                      <CanvasDL
                        theme={theme}
                        items={[
                          {
                            label: locale === "en" ? "Version" : "版本",
                            value: activeRule.version,
                          },
                          {
                            label: locale === "en" ? "Name" : "名稱",
                            value: activeRule.ruleName,
                          },
                          {
                            label: locale === "en" ? "Service Fee" : "服務費",
                            value:
                              locale === "en"
                                ? `${activeRule.serviceFeeBps} bps`
                                : `${activeRule.serviceFeeBps} 基點`,
                          },
                          {
                            label: locale === "en" ? "Effective" : "生效期間",
                            value: formatDisplayRange(
                              activeRule.effectiveFrom,
                              activeRule.effectiveTo,
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <p style={helperStyle}>{copy.noActiveRule}</p>
                    )}
                  </div>

                  <div
                    style={comparisonPanelStyle(
                      selectedDraft ? "warn" : "neutral",
                    )}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <h3 style={sectionTitleStyle}>{copy.draftLabel}</h3>
                      <CanvasPill
                        theme={theme}
                        tone={selectedDraft ? "warn" : "neutral"}
                        dot
                      >
                        {selectedDraft
                          ? copy.publishCandidateLabel
                          : copy.emptyLabel}
                      </CanvasPill>
                    </div>
                    {selectedDraft ? (
                      <>
                        <CanvasDL
                          theme={theme}
                          items={[
                            {
                              label: locale === "en" ? "Version" : "版本",
                              value: selectedDraft.version,
                            },
                            {
                              label: locale === "en" ? "Name" : "名稱",
                              value: selectedDraft.ruleName,
                            },
                            {
                              label: locale === "en" ? "Service Fee" : "服務費",
                              value:
                                locale === "en"
                                  ? `${selectedDraft.serviceFeeBps} bps`
                                  : `${selectedDraft.serviceFeeBps} 基點`,
                            },
                            {
                              label: locale === "en" ? "Effective" : "生效期間",
                              value: formatDisplayRange(
                                selectedDraft.effectiveFrom,
                                selectedDraft.effectiveTo,
                              ),
                            },
                          ]}
                        />
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          {draftRules.map((rule) => (
                            <button
                              key={rule.ruleId}
                              type="button"
                              style={tabButtonStyle(
                                rule.ruleId === selectedDraft.ruleId,
                              )}
                              onClick={() => setSelectedDraftId(rule.ruleId)}
                            >
                              {rule.version}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p style={helperStyle}>{copy.noDraftRule}</p>
                    )}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.publishStepperTitle}
                subtitle={copy.publishStepperSubtitle}
              >
                {publishConflictBody ? (
                  <CanvasBanner
                    theme={theme}
                    tone="warn"
                    icon="warn"
                    title={copy.conflictCheckTitle}
                    body={publishConflictBody}
                  />
                ) : null}
                <div style={stepperStyle}>
                  {[
                    {
                      title: copy.stepSelectDraft,
                      body: selectedDraft
                        ? locale === "en"
                          ? `${selectedDraft.version} is in the publish queue`
                          : `${selectedDraft.version} 已進入發布佇列`
                        : copy.stepNoDraft,
                      active: !selectedDraft,
                      complete: Boolean(selectedDraft),
                    },
                    {
                      title: copy.stepCompare,
                      body:
                        activeRule && selectedDraft
                          ? `${activeRule.version} → ${selectedDraft.version}`
                          : copy.stepNeedCompare,
                      active: Boolean(selectedDraft) && !publishModalOpen,
                      complete: Boolean(selectedDraft),
                    },
                    {
                      title: copy.stepReason,
                      body: publishReason.trim()
                        ? publishReason.trim()
                        : copy.stepOpenModal,
                      active: publishModalOpen,
                      complete: publishReason.trim().length >= 12,
                    },
                    {
                      title: copy.stepReceipt,
                      body: publishReceipt ?? copy.stepReceiptPending,
                      active: false,
                      complete: Boolean(publishReceipt),
                    },
                  ].map((step, index) => (
                    <div
                      key={step.title}
                      style={stepRowStyle(step.active, step.complete)}
                    >
                      <div style={stepDotStyle(step.active, step.complete)}>
                        {index + 1}
                      </div>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={sectionTitleStyle}>{step.title}</div>
                        <div style={helperStyle}>{step.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.overrideTitle}
                subtitle={copy.overrideSubtitle}
              >
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      label: locale === "en" ? "Canonical" : "標準來源",
                      value: formatPlatformCodeLabel(
                        locale,
                        catalog?.pricingAuthority.canonicalQuotedFareSource ??
                          "platform_pricing_rule",
                      ),
                    },
                    {
                      label: locale === "en" ? "Version" : "版本",
                      value:
                        catalog?.pricingAuthority.canonicalPricingRuleVersion ??
                        activeRule?.version ??
                        "—",
                    },
                    {
                      label: locale === "en" ? "Actor Types" : "操作者類型",
                      value: manualOverrideActors
                        .map((actor) => formatPlatformCodeLabel(locale, actor))
                        .join(", "),
                    },
                    {
                      label: locale === "en" ? "Required Fields" : "必填欄位",
                      value: requiredFields
                        .map((field) => formatPlatformCodeLabel(locale, field))
                        .join(", "),
                    },
                  ]}
                />
              </CanvasCard>
            </div>
          </div>
        ) : null}

        {activeTab === "driver" ? (
          <div style={splitGridStyle}>
            <CanvasCard theme={theme} padding={0}>
              {feePlanRows.length === 0 ? (
                <div style={emptyStateStyle}>{copy.driverEmpty}</div>
              ) : (
                <CanvasTable<FeePlanRow>
                  theme={theme}
                  columns={driverColumns}
                  rows={feePlanRows}
                />
              )}
            </CanvasCard>

            <div style={{ display: "grid", gap: 16 }}>
              <CanvasCard
                theme={theme}
                title={copy.activeDraftComparisonTitle}
                subtitle={copy.driverComparisonSubtitle}
              >
                <div style={comparisonGridStyle}>
                  <div style={comparisonPanelStyle("success")}>
                    <h3 style={sectionTitleStyle}>{copy.publishedLabel}</h3>
                    {activePlan ? (
                      <CanvasDL
                        theme={theme}
                        items={[
                          {
                            label: locale === "en" ? "Version" : "版本",
                            value: activePlan.version,
                          },
                          {
                            label: locale === "en" ? "Plan" : "方案",
                            value: activePlan.planName,
                          },
                          {
                            label: locale === "en" ? "Service Fee" : "服務費",
                            value:
                              locale === "en"
                                ? `${activePlan.serviceFeeBps} bps`
                                : `${activePlan.serviceFeeBps} 基點`,
                          },
                          {
                            label: locale === "en" ? "Published" : "發布時間",
                            value: formatDateTime(activePlan.publishedAt),
                          },
                        ]}
                      />
                    ) : (
                      <p style={helperStyle}>{copy.noPublishedDriverPlan}</p>
                    )}
                  </div>
                  <div
                    style={comparisonPanelStyle(draftPlan ? "warn" : "neutral")}
                  >
                    <h3 style={sectionTitleStyle}>{copy.draftQueueLabel}</h3>
                    {draftPlan ? (
                      <CanvasDL
                        theme={theme}
                        items={[
                          {
                            label: locale === "en" ? "Version" : "版本",
                            value: draftPlan.version,
                          },
                          {
                            label: locale === "en" ? "Plan" : "方案",
                            value: draftPlan.planName,
                          },
                          {
                            label: locale === "en" ? "Service Fee" : "服務費",
                            value:
                              locale === "en"
                                ? `${draftPlan.serviceFeeBps} bps`
                                : `${draftPlan.serviceFeeBps} 基點`,
                          },
                          {
                            label: locale === "en" ? "Scope" : "範圍",
                            value: formatPlatformCodeLabel(
                              locale,
                              draftPlan.scope,
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <p style={helperStyle}>{copy.noDriverDraft}</p>
                    )}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.feeStructureTitle}
                subtitle={copy.feeStructureSubtitle}
              >
                {selectedFeePlan ? (
                  <CanvasDL
                    theme={theme}
                    items={[
                      {
                        label: locale === "en" ? "Plan" : "方案",
                        value: selectedFeePlan.planName,
                      },
                      {
                        label: locale === "en" ? "Service Fee" : "服務費",
                        value:
                          locale === "en"
                            ? `${selectedFeePlan.serviceFeeBps} bps / trip`
                            : `${selectedFeePlan.serviceFeeBps} 基點 / 每趟`,
                      },
                      {
                        label:
                          locale === "en" ? "Reimbursement Mode" : "補助模式",
                        value: reimbursementModeLabel(
                          locale,
                          selectedFeePlan.reimbursementMode,
                        ),
                      },
                      {
                        label: locale === "en" ? "Subsidy Linkage" : "補助連動",
                        value:
                          selectedFeePlan.reimbursementMode === "mixed"
                            ? locale === "en"
                              ? "Mixed reimbursement requires subsidy reconciliation"
                              : "混合補助模式需要額外做補助對帳"
                            : locale === "en"
                              ? "Platform-funded only"
                              : "僅平台資助",
                      },
                    ]}
                  />
                ) : (
                  <p style={helperStyle}>{copy.noFeeStructure}</p>
                )}
              </CanvasCard>
            </div>
          </div>
        ) : null}

        {activeTab === "subsidy" ? (
          <div style={splitGridStyle}>
            <CanvasCard theme={theme} padding={0}>
              <CanvasTable<SubsidyRow>
                theme={theme}
                columns={subsidyColumns}
                rows={subsidyRows}
              />
            </CanvasCard>

            <div style={{ display: "grid", gap: 16 }}>
              <CanvasCard
                theme={theme}
                title={copy.subsidyLinkageTitle}
                subtitle={copy.subsidyLinkageSubtitle}
              >
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      label: locale === "en" ? "Queue" : "佇列",
                      value: "/payments/reimbursements",
                    },
                    {
                      label: locale === "en" ? "Trigger Count" : "觸發數量",
                      value: String(subsidyRows.length),
                    },
                    {
                      label: locale === "en" ? "Canonical Version" : "標準版本",
                      value:
                        catalog?.pricingAuthority.canonicalPricingRuleVersion ??
                        activeRule?.version ??
                        "—",
                    },
                    {
                      label:
                        locale === "en" ? "Reimbursement Mode" : "補助模式",
                      value: reimbursementModeLabel(
                        locale,
                        activeRule?.reimbursementMode ?? "platform_funded",
                      ),
                    },
                  ]}
                />
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.overrideTitle}
                subtitle={copy.overrideEvidenceSubtitle}
              >
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      label: locale === "en" ? "Manual Override" : "人工覆寫",
                      value: manualOverrideActors
                        .map((actor) => formatPlatformCodeLabel(locale, actor))
                        .join(", "),
                    },
                    {
                      label: locale === "en" ? "Required Fields" : "必填欄位",
                      value: requiredFields
                        .map((field) => formatPlatformCodeLabel(locale, field))
                        .join(", "),
                    },
                    {
                      label:
                        locale === "en"
                          ? "Tenant Can Set Quoted Fare"
                          : "租戶可否設定報價",
                      value: booleanLabel(
                        locale,
                        catalog?.pricingAuthority.tenantCanSetQuotedFare ??
                          false,
                      ),
                    },
                    {
                      label:
                        locale === "en"
                          ? "Partner Can Set Quoted Fare"
                          : "合作方可否設定報價",
                      value: booleanLabel(
                        locale,
                        catalog?.pricingAuthority.partnerCanSetQuotedFare ??
                          false,
                      ),
                    },
                  ]}
                />
              </CanvasCard>
            </div>
          </div>
        ) : null}

        {activeTab === "history" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <CanvasCard
              theme={theme}
              title={copy.historyFiltersTitle}
              subtitle={copy.historyFiltersSubtitle}
            >
              <div style={filterRowStyle}>
                <span style={inlineLabelStyle}>{copy.typeLabel}</span>
                {[
                  ["all", locale === "en" ? "All" : "全部"],
                  ["passenger", formatPlatformCodeLabel(locale, "passenger")],
                  ["driver_fee", formatPlatformCodeLabel(locale, "driver_fee")],
                  ["subsidy", formatPlatformCodeLabel(locale, "subsidy")],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    style={filterChipStyle(historyTypeFilter === value)}
                    onClick={() =>
                      setHistoryTypeFilter(value as "all" | HistoryRow["type"])
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={filterRowStyle}>
                <span style={inlineLabelStyle}>{copy.scopeLabel}</span>
                {historyScopeOptions.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    style={filterChipStyle(historyScopeFilter === scope)}
                    onClick={() => setHistoryScopeFilter(scope)}
                  >
                    {scope === "all"
                      ? locale === "en"
                        ? "All"
                        : "全部"
                      : formatPlatformCodeLabel(locale, scope)}
                  </button>
                ))}
              </div>
              <div style={filterRowStyle}>
                <span style={inlineLabelStyle}>{copy.periodLabel}</span>
                {[
                  ["all", locale === "en" ? "All" : "全部"],
                  ["90d", copy.last90d],
                  ["30d", copy.last30d],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    style={filterChipStyle(historyPeriodFilter === value)}
                    onClick={() =>
                      setHistoryPeriodFilter(value as "all" | "90d" | "30d")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard theme={theme} padding={0} title={copy.historyTitle}>
              {filteredHistoryRows.length === 0 ? (
                <div style={emptyStateStyle}>{copy.historyEmpty}</div>
              ) : (
                <CanvasTable<HistoryRow>
                  theme={theme}
                  columns={historyColumns}
                  rows={filteredHistoryRows}
                />
              )}
            </CanvasCard>
          </div>
        ) : null}
      </div>

      {publishModalOpen ? (
        <ReasonModal
          selectedDraft={selectedDraft}
          copy={copy.modal}
          rangeLabel={
            selectedDraft
              ? formatDisplayRange(
                  selectedDraft.effectiveFrom,
                  selectedDraft.effectiveTo,
                )
              : "—"
          }
          reason={publishReason}
          onReasonChange={setPublishReason}
          windowFrom={publishFrom}
          windowTo={publishTo}
          onWindowFromChange={setPublishFrom}
          onWindowToChange={setPublishTo}
          conflictWarning={publishConflictBody}
          error={publishError}
          publishing={publishing}
          onClose={() => {
            setPublishModalOpen(false);
            setPublishError(null);
          }}
          onSubmit={handlePublish}
        />
      ) : null}
    </>
  );
}
