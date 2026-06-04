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

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

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

const FALLBACK_SUBSIDY_ROWS = [
  {
    version: "sb_v04",
    nameKey: "pricing.subsidy.name.wheelchair",
    status: "published",
    trigger: "service=wheelchair",
    amountKey: "pricing.subsidy.amount.wheelchair",
    scope: "wheelchair",
    from: "2026-01-01",
    to: null,
  },
  {
    version: "sb_v05",
    nameKey: "pricing.subsidy.name.airportNight",
    status: "published",
    trigger: "service=airport && hour∈[22,5]",
    amountKey: "pricing.subsidy.amount.airportNight",
    scope: "airport_transfer",
    from: "2026-04-01",
    to: "2026-06-30",
  },
] as const;

const SERVICE_BUCKET_META: Record<
  string,
  {
    labelKey: string;
    baseKey: string;
    continuationKey: string;
    feeKey: string;
  }
> = {
  standard_taxi: {
    labelKey: "pricing.bucket.standard.label",
    baseKey: "pricing.bucket.standard.base",
    continuationKey: "pricing.bucket.standard.continuation",
    feeKey: "pricing.bucket.standard.fee",
  },
  business_dispatch: {
    labelKey: "pricing.bucket.business.label",
    baseKey: "pricing.bucket.business.base",
    continuationKey: "pricing.bucket.business.continuation",
    feeKey: "pricing.bucket.business.fee",
  },
  airport_transfer: {
    labelKey: "pricing.bucket.airport.label",
    baseKey: "pricing.bucket.airport.base",
    continuationKey: "pricing.bucket.airport.continuation",
    feeKey: "pricing.bucket.airport.fee",
  },
  wheelchair: {
    labelKey: "pricing.bucket.wheelchair.label",
    baseKey: "pricing.bucket.wheelchair.base",
    continuationKey: "pricing.bucket.wheelchair.continuation",
    feeKey: "pricing.bucket.wheelchair.fee",
  },
};

function buildSubsidyRows(t: TranslateFn): SubsidyRow[] {
  return FALLBACK_SUBSIDY_ROWS.map((row) => ({
    version: row.version,
    name: t(row.nameKey),
    status: row.status,
    trigger: row.trigger,
    amount: t(row.amountKey),
    scope: row.scope,
    from: row.from,
    to: row.to ?? t("pricing.value.open"),
  }));
}

function formatRange(t: TranslateFn, from: string, to: string | null) {
  return `${from || t("pricing.value.empty")} ${t("pricing.value.rangeArrow")} ${
    to || t("pricing.value.open")
  }`;
}

function pricingStatusLabel(
  t: TranslateFn,
  status: PlatformPricingRuleRecord["status"],
): string {
  if (status === "active") return t("pricing.status.published");
  if (status === "draft") return t("pricing.status.draft");
  return t("pricing.status.retired");
}

function ruleTone(status: PlatformPricingRuleRecord["status"]): CanvasTone {
  if (status === "active") return "success";
  if (status === "draft") return "warn";
  return "neutral";
}

function historyTone(status: HistoryRow["status"]): CanvasTone {
  return status === "published" ? "success" : "neutral";
}

function buildPricingRows(
  rules: PlatformPricingRuleRecord[],
  t: TranslateFn,
): PricingRow[] {
  return rules.map((rule) => ({
    ...rule,
    from: rule.effectiveFrom,
    to: rule.effectiveTo ?? t("pricing.value.open"),
    reimburse:
      rule.reimbursementMode === "mixed"
        ? t("pricing.reimbursement.mixed")
        : t("pricing.reimbursement.platformOnly"),
    scope: rule.applicableTo,
  }));
}

function buildFeePlanRows(
  plans: DriverFeePlanRecord[],
  t: TranslateFn,
): FeePlanRow[] {
  return plans.map((plan) => ({
    ...plan,
    from: plan.publishedAt ? plan.publishedAt.slice(0, 10) : "2026-04-01",
    to: t("pricing.value.open"),
    scope: plan.planName.toLowerCase().includes("business")
      ? t("pricing.scope.business")
      : t("pricing.scope.standard"),
  }));
}

function buildHistoryRows(
  rules: PlatformPricingRuleRecord[],
  plans: DriverFeePlanRecord[],
  t: TranslateFn,
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
        publishedBy: rule.publishedBy ?? t("pricing.actor.system"),
        status: rule.status === "archived" ? "retired" : "published",
      })),
    ...plans.map<HistoryRow>((plan) => ({
      version: plan.version,
      type: "driver_fee",
      name: plan.planName,
      scope: plan.planName.toLowerCase().includes("business")
        ? t("pricing.scope.business")
        : t("pricing.scope.standard"),
      publishedAt: plan.publishedAt,
      publishedBy: t("pricing.actor.platformAdmin"),
      status: "published",
    })),
    ...buildSubsidyRows(t).map<HistoryRow>((row) => ({
      version: row.version,
      type: "subsidy",
      name: row.name,
      scope: row.scope,
      publishedAt: `${row.from} 00:00`,
      publishedBy: t("pricing.actor.samplePublisher"),
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
  t,
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
  t: TranslateFn;
}) {
  if (!selectedDraft) {
    return null;
  }

  return (
    <div style={modalBackdropStyle}>
      <form style={modalCardStyle} onSubmit={onSubmit}>
        <div style={{ display: "grid", gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: theme.text }}>
            {t("pricing.modal.title")}
          </h2>
          <p style={helperStyle}>{t("pricing.modal.body")}</p>
        </div>

        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="warn"
          title={selectedDraft.version}
          body={`${selectedDraft.ruleName} · ${formatRange(
            t,
            selectedDraft.effectiveFrom,
            selectedDraft.effectiveTo,
          )}`}
        />

        {conflictWarning ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title={t("pricing.modal.conflictTitle")}
            body={conflictWarning}
          />
        ) : null}

        <div style={fieldGridStyle}>
          <CanvasField
            theme={theme}
            label={t("pricing.form.publishEffectiveFrom")}
            required
          >
            <input
              type="datetime-local"
              value={windowFrom}
              onChange={(event) => onWindowFromChange(event.target.value)}
              style={inputStyle}
              required
            />
          </CanvasField>
          <CanvasField
            theme={theme}
            label={t("pricing.form.publishEffectiveTo")}
          >
            <input
              type="datetime-local"
              value={windowTo}
              onChange={(event) => onWindowToChange(event.target.value)}
              style={inputStyle}
            />
          </CanvasField>
        </div>

        <CanvasField
          theme={theme}
          label={t("pricing.form.publishReason")}
          required
        >
          <textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            style={textareaStyle}
            placeholder={t("pricing.form.publishReasonPlaceholder")}
            required
          />
        </CanvasField>

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("pricing.modal.errorTitle")}
            body={error}
          />
        ) : null}

        <div style={buttonRowStyle}>
          <CanvasBtn theme={theme} onClick={onClose} disabled={publishing}>
            {t("common.cancel")}
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
            {publishing ? t("pricing.publishing") : t("pricing.confirmPublish")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PricingPage() {
  const { locale, t } = useTranslation();
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
          loadError instanceof Error ? loadError.message : String(loadError),
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [client]);

  const pricingRows = useMemo(() => buildPricingRows(rules, t), [rules, t]);
  const feePlanRows = useMemo(() => buildFeePlanRows(plans, t), [plans, t]);
  const historyRows = useMemo(
    () => buildHistoryRows(rules, plans, t),
    [plans, rules, t],
  );
  const subsidyRows = useMemo(() => buildSubsidyRows(t), [t]);

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
      ? t("pricing.publishConflict.multipleDrafts", {
          count: conflictingDrafts.length,
          scope: selectedDraft?.applicableTo ?? t("pricing.value.empty"),
        })
      : activeRule &&
          selectedDraft &&
          activeRule.applicableTo === selectedDraft.applicableTo
        ? t("pricing.publishConflict.activeRetire", {
            activeVersion: activeRule.version,
            scope: selectedDraft.applicableTo,
            draftVersion: selectedDraft.version,
          })
        : null;
  const createDraftLabel =
    activeTab === "passenger"
      ? t("pricing.action.createPassengerDraft")
      : activeTab === "driver"
        ? t("pricing.action.createDriverDraft")
        : activeTab === "subsidy"
          ? t("pricing.action.createSubsidyDraft")
          : t("pricing.action.viewHistory");
  const publishButtonLabel =
    activeTab === "driver"
      ? t("pricing.action.publishDriverPlan")
      : activeTab === "subsidy"
        ? t("pricing.action.publishSubsidyRule")
        : t("common.publish");
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
    { h: t("pricing.col.versionUpper"), k: "version", mono: true, w: 108 },
    { h: t("pricing.col.name"), k: "ruleName", w: 220 },
    {
      h: t("pricing.col.statusUpper"),
      w: 108,
      r: (row) => (
        <CanvasPill theme={theme} tone={ruleTone(row.status)} dot>
          {pricingStatusLabel(t, row.status)}
        </CanvasPill>
      ),
    },
    {
      h: t("pricing.col.serviceFeeBpsUpper"),
      k: "serviceFeeBps",
      mono: true,
      align: "right",
    },
    { h: t("pricing.col.reimburseUpper"), k: "reimburse", mono: true, w: 180 },
    { h: t("pricing.col.scopeUpper"), k: "scope", mono: true, w: 180 },
    {
      h: t("pricing.col.effectiveUpper"),
      w: 210,
      r: (row) => (
        <span style={monoTextStyle}>{formatRange(t, row.from, row.to)}</span>
      ),
    },
  ];

  const driverColumns: CanvasTableColumn<FeePlanRow>[] = [
    { h: t("pricing.col.versionUpper"), k: "version", mono: true, w: 108 },
    { h: t("pricing.col.name"), k: "planName", w: 240 },
    {
      h: t("pricing.col.statusUpper"),
      w: 108,
      r: () => (
        <CanvasPill theme={theme} tone="success" dot>
          {t("pricing.status.published")}
        </CanvasPill>
      ),
    },
    { h: t("pricing.col.scopeUpper"), k: "scope", mono: true, w: 160 },
    {
      h: t("pricing.col.serviceFeeBpsUpper"),
      k: "serviceFeeBps",
      mono: true,
      align: "right",
    },
    {
      h: t("pricing.col.effectiveUpper"),
      w: 210,
      r: (row) => (
        <span style={monoTextStyle}>{formatRange(t, row.from, row.to)}</span>
      ),
    },
  ];

  const subsidyColumns: CanvasTableColumn<SubsidyRow>[] = [
    { h: t("pricing.col.versionUpper"), k: "version", mono: true, w: 108 },
    { h: t("pricing.col.name"), k: "name", w: 220 },
    {
      h: t("pricing.col.statusUpper"),
      w: 108,
      r: (row) => (
        <CanvasPill
          theme={theme}
          tone={row.status === "published" ? "success" : "warn"}
          dot
        >
          {t(`pricing.status.${row.status}`)}
        </CanvasPill>
      ),
    },
    { h: t("pricing.col.triggerUpper"), k: "trigger", mono: true, w: 300 },
    { h: t("pricing.col.amountUpper"), k: "amount", mono: true, w: 160 },
    { h: t("pricing.col.scopeUpper"), k: "scope", mono: true, w: 140 },
    {
      h: t("pricing.col.effectiveUpper"),
      w: 210,
      r: (row) => (
        <span style={monoTextStyle}>{formatRange(t, row.from, row.to)}</span>
      ),
    },
  ];

  const historyColumns: CanvasTableColumn<HistoryRow>[] = [
    { h: t("pricing.col.versionUpper"), k: "version", mono: true, w: 108 },
    { h: t("pricing.col.typeUpper"), k: "type", mono: true, w: 132 },
    { h: t("pricing.col.scopeUpper"), k: "scope", mono: true, w: 132 },
    { h: t("pricing.col.nameUpper"), k: "name", w: 240 },
    {
      h: t("pricing.col.publishedAtUpper"),
      w: 170,
      r: (row) => <span style={monoTextStyle}>{row.publishedAt}</span>,
    },
    { h: t("pricing.col.publishedByUpper"), k: "publishedBy", w: 180 },
    {
      h: t("pricing.col.statusUpper"),
      w: 108,
      r: (row) => (
        <CanvasPill theme={theme} tone={historyTone(row.status)} dot>
          {t(`pricing.status.${row.status}`)}
        </CanvasPill>
      ),
    },
  ];

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDraft) {
      setPublishError(t("pricing.error.noDraft"));
      return;
    }
    if (publishReason.trim().length < 12) {
      setPublishError(t("pricing.error.reasonTooShort"));
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
        t("pricing.publishReceipt", {
          version: selectedDraft.version,
          reason: publishReason.trim(),
          timestamp: new Date().toISOString(),
        }),
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
    return <div style={loadingStyle}>{t("pricing.loadingWorkspace")}</div>;
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("pricing.pageTitle")}
        subtitle={t("pricing.pageSubtitle")}
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
          title={t("pricing.banner.authority.title")}
          body={t("pricing.banner.authority.body")}
        />

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("pricing.banner.loadFailure.title")}
            body={error}
          />
        ) : null}

        {publishReceipt ? (
          <CanvasBanner
            theme={theme}
            tone="success"
            icon="check"
            title={t("pricing.banner.receipt.title")}
            body={publishReceipt}
          />
        ) : null}

        {!publishSupported && activeTab !== "history" ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title={t("pricing.banner.publishUnsupported.title", {
              action: publishButtonLabel,
            })}
            body={t("pricing.banner.publishUnsupported.body")}
          />
        ) : null}

        <div style={tabRowStyle}>
          {[
            { id: "passenger" as const, label: t("pricing.tab.passenger") },
            { id: "driver" as const, label: t("pricing.tab.driver") },
            { id: "subsidy" as const, label: t("pricing.tab.subsidy") },
            { id: "history" as const, label: t("pricing.tab.history") },
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
                  <div style={emptyStateStyle}>
                    {t("pricing.empty.passenger")}
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
                title={`${t("pricing.bucket.title")} · ${
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
                        labelKey: "",
                        baseKey: "pricing.bucket.fallback.base",
                        continuationKey: "pricing.bucket.fallback.continuation",
                        feeKey: "",
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
                              {meta.labelKey ? t(meta.labelKey) : bucket}
                            </div>
                            <div style={helperStyle}>
                              {t(meta.baseKey)}
                              <br />
                              {t(meta.continuationKey)}
                            </div>
                          </div>
                          <div
                            style={{
                              color: theme.accent,
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {meta.feeKey
                              ? t(meta.feeKey)
                              : t("pricing.bucket.fallback.fee", {
                                  feeBps: activeRule?.serviceFeeBps ?? 1800,
                                })}
                          </div>
                        </div>
                      );
                    })}
                  {catalog?.phase1ServiceBuckets?.length ? null : (
                    <>
                      {["standard", "business", "airport", "wheelchair"].map(
                        (bucket) => (
                          <div
                            key={bucket}
                            style={comparisonPanelStyle("neutral")}
                          >
                            <div
                              style={{
                                color: theme.text,
                                fontWeight: 600,
                                fontFamily: theme.monoFamily,
                              }}
                            >
                              {t(`pricing.bucket.${bucket}.label`)}
                            </div>
                            <div style={helperStyle}>
                              {t(`pricing.bucket.${bucket}.base`)}
                              <br />
                              {t(`pricing.bucket.${bucket}.continuation`)}
                            </div>
                            <div
                              style={{
                                color: theme.accent,
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {t(`pricing.bucket.${bucket}.fee`)}
                            </div>
                          </div>
                        ),
                      )}
                    </>
                  )}
                </div>
              </CanvasCard>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <CanvasCard
                theme={theme}
                title={t("pricing.card.activeDraft.title")}
                subtitle={t("pricing.card.activeDraft.subtitle")}
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
                      <h3 style={sectionTitleStyle}>
                        {t("pricing.state.active")}
                      </h3>
                      <CanvasPill theme={theme} tone="success" dot>
                        {t("pricing.state.current")}
                      </CanvasPill>
                    </div>
                    {activeRule ? (
                      <CanvasDL
                        theme={theme}
                        items={[
                          {
                            label: t("pricing.col.versionUpper"),
                            value: activeRule.version,
                          },
                          {
                            label: t("pricing.col.nameUpper"),
                            value: activeRule.ruleName,
                          },
                          {
                            label: t("pricing.col.serviceFeeUpper"),
                            value: `${activeRule.serviceFeeBps} bps`,
                          },
                          {
                            label: t("pricing.col.effectiveUpper"),
                            value: formatRange(
                              t,
                              activeRule.effectiveFrom,
                              activeRule.effectiveTo,
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <p style={helperStyle}>{t("pricing.empty.activeRule")}</p>
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
                      <h3 style={sectionTitleStyle}>
                        {t("pricing.state.draft")}
                      </h3>
                      <CanvasPill
                        theme={theme}
                        tone={selectedDraft ? "warn" : "neutral"}
                        dot
                      >
                        {selectedDraft
                          ? t("pricing.state.publishCandidate")
                          : t("pricing.state.empty")}
                      </CanvasPill>
                    </div>
                    {selectedDraft ? (
                      <>
                        <CanvasDL
                          theme={theme}
                          items={[
                            {
                              label: t("pricing.col.versionUpper"),
                              value: selectedDraft.version,
                            },
                            {
                              label: t("pricing.col.nameUpper"),
                              value: selectedDraft.ruleName,
                            },
                            {
                              label: t("pricing.col.serviceFeeUpper"),
                              value: `${selectedDraft.serviceFeeBps} bps`,
                            },
                            {
                              label: t("pricing.col.effectiveUpper"),
                              value: formatRange(
                                t,
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
                        {t("pricing.empty.publishDraft")}
                      </p>
                    )}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={t("pricing.card.publishStepper.title")}
                subtitle={t("pricing.card.publishStepper.subtitle")}
              >
                {publishConflictBody ? (
                  <CanvasBanner
                    theme={theme}
                    tone="warn"
                    icon="warn"
                    title={t("pricing.card.publishStepper.conflictTitle")}
                    body={publishConflictBody}
                  />
                ) : null}
                <div style={stepperStyle}>
                  {[
                    {
                      title: t("pricing.step.selectDraft.title"),
                      body: selectedDraft
                        ? t("pricing.step.selectDraft.ready", {
                            version: selectedDraft.version,
                          })
                        : t("pricing.step.selectDraft.empty"),
                      active: !selectedDraft,
                      complete: Boolean(selectedDraft),
                    },
                    {
                      title: t("pricing.step.compare.title"),
                      body:
                        activeRule && selectedDraft
                          ? t("pricing.step.compare.ready", {
                              activeVersion: activeRule.version,
                              draftVersion: selectedDraft.version,
                            })
                          : t("pricing.step.compare.empty"),
                      active: Boolean(selectedDraft) && !publishModalOpen,
                      complete: Boolean(selectedDraft),
                    },
                    {
                      title: t("pricing.step.reason.title"),
                      body: publishReason.trim()
                        ? publishReason.trim()
                        : t("pricing.step.reason.empty"),
                      active: publishModalOpen,
                      complete: publishReason.trim().length >= 12,
                    },
                    {
                      title: t("pricing.step.receipt.title"),
                      body: publishReceipt ?? t("pricing.step.receipt.empty"),
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
                title={t("pricing.card.override.title")}
                subtitle={t("pricing.card.override.subtitle")}
              >
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      label: t("pricing.col.canonicalUpper"),
                      value:
                        catalog?.pricingAuthority.canonicalQuotedFareSource ??
                        "platform_pricing_rule",
                    },
                    {
                      label: t("pricing.col.versionUpper"),
                      value:
                        catalog?.pricingAuthority.canonicalPricingRuleVersion ??
                        activeRule?.version ??
                        t("pricing.value.empty"),
                    },
                    {
                      label: t("pricing.col.actorTypesUpper"),
                      value: manualOverrideActors.join(", "),
                    },
                    {
                      label: t("pricing.col.requiredFieldsUpper"),
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
                <div style={emptyStateStyle}>{t("pricing.empty.driver")}</div>
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
                title={t("pricing.card.driverComparison.title")}
                subtitle={t("pricing.card.driverComparison.subtitle")}
              >
                <div style={comparisonGridStyle}>
                  <div style={comparisonPanelStyle("success")}>
                    <h3 style={sectionTitleStyle}>
                      {t("pricing.state.published")}
                    </h3>
                    {activePlan ? (
                      <CanvasDL
                        theme={theme}
                        items={[
                          {
                            label: t("pricing.col.versionUpper"),
                            value: activePlan.version,
                          },
                          {
                            label: t("pricing.col.planUpper"),
                            value: activePlan.planName,
                          },
                          {
                            label: t("pricing.col.serviceFeeUpper"),
                            value: `${activePlan.serviceFeeBps} bps`,
                          },
                          {
                            label: t("pricing.col.publishedUpper"),
                            value: formatDateTime(activePlan.publishedAt),
                          },
                        ]}
                      />
                    ) : (
                      <p style={helperStyle}>
                        {t("pricing.empty.publishedPlans")}
                      </p>
                    )}
                  </div>
                  <div
                    style={comparisonPanelStyle(draftPlan ? "warn" : "neutral")}
                  >
                    <h3 style={sectionTitleStyle}>
                      {t("pricing.card.driverComparison.draftQueue")}
                    </h3>
                    {draftPlan ? (
                      <CanvasDL
                        theme={theme}
                        items={[
                          {
                            label: t("pricing.col.versionUpper"),
                            value: draftPlan.version,
                          },
                          {
                            label: t("pricing.col.planUpper"),
                            value: draftPlan.planName,
                          },
                          {
                            label: t("pricing.col.serviceFeeUpper"),
                            value: `${draftPlan.serviceFeeBps} bps`,
                          },
                          {
                            label: t("pricing.col.scopeUpper"),
                            value: draftPlan.scope,
                          },
                        ]}
                      />
                    ) : (
                      <p style={helperStyle}>
                        {t("pricing.empty.driverDraft")}
                      </p>
                    )}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={t("pricing.card.tripFee.title")}
                subtitle={t("pricing.card.tripFee.subtitle")}
              >
                {selectedFeePlan ? (
                  <CanvasDL
                    theme={theme}
                    items={[
                      {
                        label: t("pricing.col.planUpper"),
                        value: selectedFeePlan.planName,
                      },
                      {
                        label: t("pricing.col.serviceFeeUpper"),
                        value: `${selectedFeePlan.serviceFeeBps} bps / trip`,
                      },
                      {
                        label: t("pricing.col.reimbursementModeUpper"),
                        value: selectedFeePlan.reimbursementMode,
                      },
                      {
                        label: t("pricing.col.subsidyLinkageUpper"),
                        value:
                          selectedFeePlan.reimbursementMode === "mixed"
                            ? t("pricing.tripFee.mixedSubsidyLinkage")
                            : t("pricing.tripFee.platformFundedOnly"),
                      },
                    ]}
                  />
                ) : (
                  <p style={helperStyle}>{t("pricing.empty.tripFee")}</p>
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
                title={t("pricing.card.subsidyLinkage.title")}
                subtitle={t("pricing.card.subsidyLinkage.subtitle")}
              >
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      label: t("pricing.col.queueUpper"),
                      value: "/payments/reimbursements",
                    },
                    {
                      label: t("pricing.col.triggerCountUpper"),
                      value: String(subsidyRows.length),
                    },
                    {
                      label: t("pricing.col.canonicalVersionUpper"),
                      value:
                        catalog?.pricingAuthority.canonicalPricingRuleVersion ??
                        activeRule?.version ??
                        t("pricing.value.empty"),
                    },
                    {
                      label: t("pricing.col.reimbursementModeUpper"),
                      value: activeRule?.reimbursementMode ?? "platform_funded",
                    },
                  ]}
                />
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={t("pricing.card.override.title")}
                subtitle={t("pricing.card.subsidyOverride.subtitle")}
              >
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      label: t("pricing.col.manualOverrideUpper"),
                      value: manualOverrideActors.join(", "),
                    },
                    {
                      label: t("pricing.col.requiredFieldsUpper"),
                      value: requiredFields.join(", "),
                    },
                    {
                      label: t("pricing.col.tenantCanSetQuotedFareUpper"),
                      value: String(
                        catalog?.pricingAuthority.tenantCanSetQuotedFare ??
                          false,
                      ),
                    },
                    {
                      label: t("pricing.col.partnerCanSetQuotedFareUpper"),
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
              title={t("pricing.card.historyFilters.title")}
              subtitle={t("pricing.card.historyFilters.subtitle")}
            >
              <div style={filterRowStyle}>
                <span style={inlineLabelStyle}>{t("pricing.filter.type")}</span>
                {[
                  ["all", t("common.all")],
                  ["passenger", t("pricing.filter.option.passenger")],
                  ["driver_fee", t("pricing.filter.option.driver")],
                  ["subsidy", t("pricing.filter.option.subsidy")],
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
                <span style={inlineLabelStyle}>
                  {t("pricing.filter.scope")}
                </span>
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
                <span style={inlineLabelStyle}>
                  {t("pricing.filter.period")}
                </span>
                {[
                  ["all", t("common.all")],
                  ["90d", t("pricing.filter.option.last90d")],
                  ["30d", t("pricing.filter.option.last30d")],
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
              title={t("pricing.card.historyTable.title")}
            >
              {filteredHistoryRows.length === 0 ? (
                <div style={emptyStateStyle}>{t("pricing.empty.history")}</div>
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
          t={t}
        />
      ) : null}
    </>
  );
}
