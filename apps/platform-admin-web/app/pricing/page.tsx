"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { usePlatformAdminAssistantPage } from "@/components/assistant/route-context";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
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
    trigger: "service=wheelchair",
    amount: "NT$ 180 / trip",
    scope: "wheelchair",
    from: "2026-01-01",
    to: "open",
  },
  {
    version: "sb_v05",
    name: "夜間機場接送補助",
    status: "published",
    trigger: "service=airport && hour∈[22,5]",
    amount: "12% fare top-up",
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
    continuation: "NT$ 5 / 250m",
    fee: "1800 bps",
  },
  business_dispatch: {
    label: "business",
    base: "NT$ 120 / 起",
    continuation: "NT$ 6 / 200m",
    fee: "2200 bps",
  },
  airport_transfer: {
    label: "airport",
    base: "NT$ 180 / 起",
    continuation: "flat by zone",
    fee: "2500 bps",
  },
  wheelchair: {
    label: "wheelchair",
    base: "NT$ 95 / 起",
    continuation: "NT$ 5 / 250m",
    fee: "900 bps · subsidy",
  },
};

function formatRange(from: string, to: string | null) {
  return `${from || "—"} → ${to || "open"}`;
}

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
    reimburse:
      rule.reimbursementMode === "mixed"
        ? "manual + platform"
        : "platform only",
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

function ReasonModal({
  selectedDraft,
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
            發佈版本
          </h2>
          <p style={helperStyle}>
            high-risk action 需要填寫原因，並在 audit receipt 中保留
            actor、reason 與 trace evidence。
          </p>
        </div>

        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="warn"
          title={selectedDraft.version}
          body={`${selectedDraft.ruleName} · ${formatRange(
            selectedDraft.effectiveFrom,
            selectedDraft.effectiveTo,
          )}`}
        />

        {conflictWarning ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title="scope conflict check"
            body={conflictWarning}
          />
        ) : null}

        <div style={fieldGridStyle}>
          <CanvasField theme={theme} label="生效開始" required>
            <input
              type="datetime-local"
              value={windowFrom}
              onChange={(event) => onWindowFromChange(event.target.value)}
              style={inputStyle}
              required
            />
          </CanvasField>
          <CanvasField theme={theme} label="生效結束">
            <input
              type="datetime-local"
              value={windowTo}
              onChange={(event) => onWindowToChange(event.target.value)}
              style={inputStyle}
            />
          </CanvasField>
        </div>

        <CanvasField theme={theme} label="高風險原因" required>
          <textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            style={textareaStyle}
            placeholder="請描述 pricing publish 的治理原因、影響範圍與核准依據。"
            required
          />
        </CanvasField>

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title="無法發佈草稿"
            body={error}
          />
        ) : null}

        <div style={buttonRowStyle}>
          <CanvasBtn theme={theme} onClick={onClose} disabled={publishing}>
            取消
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
            {publishing ? "發佈中…" : "確認發佈"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PricingPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<PlatformPricingRuleRecord[]>([]);
  const [plans, setPlans] = useState<DriverFeePlanRecord[]>([]);
  const [catalog, setCatalog] = useState<ProductRuleCatalog | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("passenger");
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (
      tab === "passenger" ||
      tab === "driver" ||
      tab === "subsidy" ||
      tab === "history"
    ) {
      setActiveTab(tab);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", activeTab);
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", next);
  }, [activeTab]);

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
          loadError instanceof Error ? loadError.message : String(loadError),
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [client]);

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
  const draftRules = rules.filter((rule) => rule.status === "draft");
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
      ? `${conflictingDrafts.length} drafts share scope ${selectedDraft?.applicableTo ?? "—"}; publish should confirm the intended winner before atomic replace.`
      : activeRule &&
          selectedDraft &&
          activeRule.applicableTo === selectedDraft.applicableTo
        ? `${activeRule.version} will be retired for scope ${selectedDraft.applicableTo} when ${selectedDraft.version} publishes.`
        : null;
  const createDraftLabel =
    activeTab === "passenger"
      ? "建立 passenger 草稿"
      : activeTab === "driver"
        ? "建立 driver plan 草稿"
        : activeTab === "subsidy"
          ? "建立 subsidy 草稿"
          : "檢視版本歷史";
  const publishButtonLabel =
    activeTab === "driver"
      ? "發佈 driver fee plan"
      : activeTab === "subsidy"
        ? "發佈 subsidy rule"
        : "發佈";
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
            setActiveTab(value as TabId);
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
              message: "Filled pricing publish window draft without submitting.",
            } as const;
          },
        },
      },
    }),
    [draftRules],
  );

  usePlatformAdminAssistantPage(assistantBridge);

  const passengerColumns: CanvasTableColumn<PricingRow>[] = [
    { h: "VERSION", k: "version", mono: true, w: 108 },
    { h: "名稱", k: "ruleName", w: 220 },
    {
      h: "STATUS",
      w: 108,
      r: (row) => (
        <CanvasPill theme={theme} tone={ruleTone(row.status)} dot>
          {pricingStatusLabel(row.status)}
        </CanvasPill>
      ),
    },
    { h: "SERVICE FEE bps", k: "serviceFeeBps", mono: true, align: "right" },
    { h: "REIMBURSE", k: "reimburse", mono: true, w: 180 },
    { h: "SCOPE", k: "scope", mono: true, w: 180 },
    {
      h: "EFFECTIVE",
      w: 210,
      r: (row) => (
        <span style={monoTextStyle}>{formatRange(row.from, row.to)}</span>
      ),
    },
  ];

  const driverColumns: CanvasTableColumn<FeePlanRow>[] = [
    { h: "VERSION", k: "version", mono: true, w: 108 },
    { h: "名稱", k: "planName", w: 240 },
    {
      h: "STATUS",
      w: 108,
      r: () => (
        <CanvasPill theme={theme} tone="success" dot>
          published
        </CanvasPill>
      ),
    },
    { h: "SCOPE", k: "scope", mono: true, w: 160 },
    { h: "SERVICE FEE bps", k: "serviceFeeBps", mono: true, align: "right" },
    {
      h: "EFFECTIVE",
      w: 210,
      r: (row) => (
        <span style={monoTextStyle}>{formatRange(row.from, row.to)}</span>
      ),
    },
  ];

  const subsidyColumns: CanvasTableColumn<SubsidyRow>[] = [
    { h: "VERSION", k: "version", mono: true, w: 108 },
    { h: "名稱", k: "name", w: 220 },
    {
      h: "STATUS",
      w: 108,
      r: (row) => (
        <CanvasPill
          theme={theme}
          tone={row.status === "published" ? "success" : "warn"}
          dot
        >
          {row.status}
        </CanvasPill>
      ),
    },
    { h: "TRIGGER", k: "trigger", mono: true, w: 300 },
    { h: "AMOUNT / PCT", k: "amount", mono: true, w: 160 },
    { h: "SCOPE", k: "scope", mono: true, w: 140 },
    {
      h: "EFFECTIVE",
      w: 210,
      r: (row) => (
        <span style={monoTextStyle}>{formatRange(row.from, row.to)}</span>
      ),
    },
  ];

  const historyColumns: CanvasTableColumn<HistoryRow>[] = [
    { h: "VERSION", k: "version", mono: true, w: 108 },
    { h: "TYPE", k: "type", mono: true, w: 132 },
    { h: "SCOPE", k: "scope", mono: true, w: 132 },
    { h: "NAME", k: "name", w: 240 },
    {
      h: "PUBLISHED AT",
      w: 170,
      r: (row) => <span style={monoTextStyle}>{row.publishedAt}</span>,
    },
    { h: "PUBLISHED BY", k: "publishedBy", w: 180 },
    {
      h: "STATUS",
      w: 108,
      r: (row) => (
        <CanvasPill theme={theme} tone={historyTone(row.status)} dot>
          {row.status}
        </CanvasPill>
      ),
    },
  ];

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDraft) {
      setPublishError("沒有可發佈的 draft pricing rule。");
      return;
    }
    if (publishReason.trim().length < 12) {
      setPublishError("高風險原因至少需要 12 個字。");
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
        `${selectedDraft.version} published with reason "${publishReason.trim()}" at ${new Date().toISOString()}`,
      );
      setPublishReason("");
    } catch (publishFailure) {
      setPublishError(
        publishFailure instanceof Error
          ? publishFailure.message
          : String(publishFailure),
      );
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return <div style={loadingStyle}>Loading pricing workspace…</div>;
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title="Pricing"
        subtitle="draft → published → retired · 發佈為 atomic replace (Q-ADM10)"
        actions={
          <>
            <CanvasBtn
              theme={theme}
              icon="plus"
              onClick={() =>
                setActiveTab(activeTab === "history" ? "passenger" : activeTab)
              }
            >
              {createDraftLabel}
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
              {publishButtonLabel}
            </CanvasBtn>
          </>
        }
      />

      <div style={bodyStyle}>
        <CanvasBanner
          theme={theme}
          tone="info"
          icon="info"
          title="canonical quoted fare authority"
          body="後端為唯一計價真值；前端任何 manual override 必須走 override governance 並保留 actor type 與必填欄位。"
        />

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title="pricing workspace 載入失敗"
            body={error}
          />
        ) : null}

        {publishReceipt ? (
          <CanvasBanner
            theme={theme}
            tone="success"
            icon="check"
            title="audit receipt"
            body={publishReceipt}
          />
        ) : null}

        {!publishSupported && activeTab !== "history" ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title={`${publishButtonLabel} 尚未接上 mutation`}
            body="目前高風險 publish modal 與 atomic replace 流程只接在 passenger pricing；driver / subsidy 先保留 parity 結構與治理提示。"
          />
        ) : null}

        <div style={tabRowStyle}>
          {[
            { id: "passenger" as const, label: "Passenger Pricing" },
            { id: "driver" as const, label: "Driver Fee Plans" },
            { id: "subsidy" as const, label: "Subsidy / Reimbursement Rules" },
            { id: "history" as const, label: "Published Versions" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              style={tabButtonStyle(activeTab === tab.id)}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "passenger" ? (
          <div style={splitGridStyle}>
            <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
              <CanvasCard theme={theme} padding={0}>
                {pricingRows.length === 0 ? (
                  <div style={emptyStateStyle}>
                    目前沒有 passenger pricing 版本。
                  </div>
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
                title={`服務 bucket fee 拆解 · ${
                  activeRule?.version ??
                  catalog?.pricingAuthority.canonicalPricingRuleVersion ??
                  "pr_v23"
                }`}
              >
                <div style={bucketGridStyle}>
                  {(catalog?.phase1ServiceBuckets ?? [])
                    .slice(0, 4)
                    .map((bucket: string) => {
                      const meta = SERVICE_BUCKET_META[bucket] ?? {
                        label: bucket,
                        base: "canonical backend rule",
                        continuation: "see pricing rule",
                        fee: `${activeRule?.serviceFeeBps ?? 1800} bps`,
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
                              {meta.label}
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
                          cont: "NT$ 5 / 250m",
                          fee: "1800 bps",
                        },
                        {
                          key: "business",
                          base: "NT$ 120 / 起",
                          cont: "NT$ 6 / 200m",
                          fee: "2200 bps",
                        },
                        {
                          key: "airport",
                          base: "NT$ 180 / 起",
                          cont: "flat by zone",
                          fee: "2500 bps",
                        },
                        {
                          key: "wheelchair",
                          base: "NT$ 95 / 起",
                          cont: "NT$ 5 / 250m",
                          fee: "900 bps · subsidy",
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
                            {bucket.key}
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
                title="Active / Draft comparison"
                subtitle="version model · 發佈前比對 canonical active 與候選 draft"
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
                      <h3 style={sectionTitleStyle}>Active</h3>
                      <CanvasPill theme={theme} tone="success" dot>
                        current
                      </CanvasPill>
                    </div>
                    {activeRule ? (
                      <CanvasDL
                        theme={theme}
                        items={[
                          { label: "VERSION", value: activeRule.version },
                          { label: "NAME", value: activeRule.ruleName },
                          {
                            label: "SERVICE FEE",
                            value: `${activeRule.serviceFeeBps} bps`,
                          },
                          {
                            label: "EFFECTIVE",
                            value: formatRange(
                              activeRule.effectiveFrom,
                              activeRule.effectiveTo,
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <p style={helperStyle}>沒有 active pricing rule。</p>
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
                      <h3 style={sectionTitleStyle}>Draft</h3>
                      <CanvasPill
                        theme={theme}
                        tone={selectedDraft ? "warn" : "neutral"}
                        dot
                      >
                        {selectedDraft ? "publish candidate" : "empty"}
                      </CanvasPill>
                    </div>
                    {selectedDraft ? (
                      <>
                        <CanvasDL
                          theme={theme}
                          items={[
                            { label: "VERSION", value: selectedDraft.version },
                            { label: "NAME", value: selectedDraft.ruleName },
                            {
                              label: "SERVICE FEE",
                              value: `${selectedDraft.serviceFeeBps} bps`,
                            },
                            {
                              label: "EFFECTIVE",
                              value: formatRange(
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
                      <p style={helperStyle}>
                        目前沒有待發佈的 pricing draft。
                      </p>
                    )}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="Publish stepper"
                subtitle="select draft → compare → reason capture → atomic replace"
              >
                {publishConflictBody ? (
                  <CanvasBanner
                    theme={theme}
                    tone="warn"
                    icon="warn"
                    title="conflict check"
                    body={publishConflictBody}
                  />
                ) : null}
                <div style={stepperStyle}>
                  {[
                    {
                      title: "1. Select draft",
                      body: selectedDraft
                        ? `${selectedDraft.version} 已進入 publish queue`
                        : "目前沒有可發佈的 draft",
                      active: !selectedDraft,
                      complete: Boolean(selectedDraft),
                    },
                    {
                      title: "2. Compare active/draft",
                      body:
                        activeRule && selectedDraft
                          ? `${activeRule.version} → ${selectedDraft.version}`
                          : "需要 active 與 draft 才能比對",
                      active: Boolean(selectedDraft) && !publishModalOpen,
                      complete: Boolean(selectedDraft),
                    },
                    {
                      title: "3. High-risk reason",
                      body: publishReason.trim()
                        ? publishReason.trim()
                        : "開啟 modal 並填寫必填 reason",
                      active: publishModalOpen,
                      complete: publishReason.trim().length >= 12,
                    },
                    {
                      title: "4. Audit receipt",
                      body: publishReceipt ?? "發佈後會在此留下 receipt 摘要",
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
                title="Override governance"
                subtitle="manual override 只允許記錄式治理，不得覆蓋 canonical quoted fare authority"
              >
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      label: "CANONICAL",
                      value:
                        catalog?.pricingAuthority.canonicalQuotedFareSource ??
                        "platform_pricing_rule",
                    },
                    {
                      label: "VERSION",
                      value:
                        catalog?.pricingAuthority.canonicalPricingRuleVersion ??
                        activeRule?.version ??
                        "—",
                    },
                    {
                      label: "ACTOR TYPES",
                      value: manualOverrideActors.join(", "),
                    },
                    {
                      label: "REQUIRED FIELDS",
                      value: requiredFields.join(", "),
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
                <div style={emptyStateStyle}>
                  目前沒有 driver fee plan 版本。
                </div>
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
                title="Active / Draft comparison"
                subtitle="driver settlement plans remain immutable after publish"
              >
                <div style={comparisonGridStyle}>
                  <div style={comparisonPanelStyle("success")}>
                    <h3 style={sectionTitleStyle}>Published</h3>
                    {activePlan ? (
                      <CanvasDL
                        theme={theme}
                        items={[
                          { label: "VERSION", value: activePlan.version },
                          { label: "PLAN", value: activePlan.planName },
                          {
                            label: "SERVICE FEE",
                            value: `${activePlan.serviceFeeBps} bps`,
                          },
                          {
                            label: "PUBLISHED",
                            value: formatDateTime(activePlan.publishedAt),
                          },
                        ]}
                      />
                    ) : (
                      <p style={helperStyle}>目前沒有已發佈司機費用方案。</p>
                    )}
                  </div>
                  <div
                    style={comparisonPanelStyle(draftPlan ? "warn" : "neutral")}
                  >
                    <h3 style={sectionTitleStyle}>Draft queue</h3>
                    {draftPlan ? (
                      <CanvasDL
                        theme={theme}
                        items={[
                          { label: "VERSION", value: draftPlan.version },
                          { label: "PLAN", value: draftPlan.planName },
                          {
                            label: "SERVICE FEE",
                            value: `${draftPlan.serviceFeeBps} bps`,
                          },
                          { label: "SCOPE", value: draftPlan.scope },
                        ]}
                      />
                    ) : (
                      <p style={helperStyle}>
                        現有後端僅回傳 published fee plan；draft
                        比對區先保留治理空位。
                      </p>
                    )}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="Per-trip fee structure"
                subtitle="must-show fee structure + subsidy linkage"
              >
                {selectedFeePlan ? (
                  <CanvasDL
                    theme={theme}
                    items={[
                      { label: "PLAN", value: selectedFeePlan.planName },
                      {
                        label: "SERVICE FEE",
                        value: `${selectedFeePlan.serviceFeeBps} bps / trip`,
                      },
                      {
                        label: "REIMBURSEMENT MODE",
                        value: selectedFeePlan.reimbursementMode,
                      },
                      {
                        label: "SUBSIDY LINKAGE",
                        value:
                          selectedFeePlan.reimbursementMode === "mixed"
                            ? "mixed reimbursement requires subsidy reconciliation"
                            : "platform_funded only",
                      },
                    ]}
                  />
                ) : (
                  <p style={helperStyle}>目前沒有可展示的 fee structure。</p>
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
                title="Subsidy / reimbursement linkage"
                subtitle="補助規則與 reimbursement queue 採獨立治理，但共用 quoted fare authority"
              >
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      label: "QUEUE",
                      value: "/payments/reimbursements",
                    },
                    {
                      label: "TRIGGER COUNT",
                      value: String(subsidyRows.length),
                    },
                    {
                      label: "CANONICAL VERSION",
                      value:
                        catalog?.pricingAuthority.canonicalPricingRuleVersion ??
                        activeRule?.version ??
                        "—",
                    },
                    {
                      label: "REIMBURSEMENT MODE",
                      value: activeRule?.reimbursementMode ?? "platform_funded",
                    },
                  ]}
                />
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="Override governance"
                subtitle="manual override actor 與 evidence obligations"
              >
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      label: "MANUAL OVERRIDE",
                      value: manualOverrideActors.join(", "),
                    },
                    {
                      label: "REQUIRED FIELDS",
                      value: requiredFields.join(", "),
                    },
                    {
                      label: "TENANT CAN SET QUOTED FARE",
                      value: String(
                        catalog?.pricingAuthority.tenantCanSetQuotedFare ??
                          false,
                      ),
                    },
                    {
                      label: "PARTNER CAN SET QUOTED FARE",
                      value: String(
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
              title="Published version filters"
              subtitle="cross-tab history 可依 type、scope、period 篩選"
            >
              <div style={filterRowStyle}>
                <span style={inlineLabelStyle}>Type</span>
                {[
                  ["all", "All"],
                  ["passenger", "Passenger"],
                  ["driver_fee", "Driver"],
                  ["subsidy", "Subsidy"],
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
                <span style={inlineLabelStyle}>Scope</span>
                {historyScopeOptions.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    style={filterChipStyle(historyScopeFilter === scope)}
                    onClick={() => setHistoryScopeFilter(scope)}
                  >
                    {scope}
                  </button>
                ))}
              </div>
              <div style={filterRowStyle}>
                <span style={inlineLabelStyle}>Period</span>
                {[
                  ["all", "All"],
                  ["90d", "Last 90d"],
                  ["30d", "Last 30d"],
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

            <CanvasCard
              theme={theme}
              padding={0}
              title="所有已發佈版本 · 跨 tab 歷史"
            >
              {filteredHistoryRows.length === 0 ? (
                <div style={emptyStateStyle}>
                  目前篩選條件下沒有可顯示的版本歷史。
                </div>
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
