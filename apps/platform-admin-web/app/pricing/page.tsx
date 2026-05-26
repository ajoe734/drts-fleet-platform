"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
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

type PublishRuleFormState = {
  effectiveFrom: string;
  effectiveTo: string;
  reason: string;
};

type PricingRuleRow = PlatformPricingRuleRecord &
  Record<string, unknown> & {
    _selected?: boolean;
  };

type FeePlanRow = DriverFeePlanRecord & Record<string, unknown>;

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

const EMPTY_PUBLISH_RULE_FORM: PublishRuleFormState = {
  effectiveFrom: "",
  effectiveTo: "",
  reason: "",
};

const th = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

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

const splitLayoutStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-start",
};

const mainColumnStyle: CSSProperties = {
  flex: "1.65 1 640px",
  minWidth: 0,
};

const sideColumnStyle: CSSProperties = {
  flex: "1 1 320px",
  minWidth: 280,
  display: "grid",
  gap: 16,
};

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
  minHeight: 92,
  resize: "vertical",
};

const formActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const submitButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 120,
  height: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${th.accent}`,
  background: th.accent,
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  fontFamily: th.fontFamily,
});

const helperTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 11.5,
  color: th.textMuted,
  lineHeight: 1.45,
};

const draftSelectorStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const dividerStyle: CSSProperties = {
  height: 1,
  background: th.border,
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

function normalizeDateTimeLocalValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return { localValue: "", isoValue: null };
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return { localValue: normalized, isoValue: null };
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

  return {
    localValue,
    isoValue: parsed.toISOString(),
  };
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
  if (status === "published") {
    return "success";
  }
  if (status === "draft" || status === "review_required") {
    return "warn";
  }
  if (status === "scheduled") {
    return "info";
  }
  if (status === "rollback_hold") {
    return "danger";
  }
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
  const [filter, setFilter] = useState<
    "all" | "published" | "review_required" | "superseded"
  >("all");
  const [showCreate, setShowCreate] = useState(false);
  const [pricingForm, setPricingForm] =
    useState<PricingFormState>(EMPTY_PRICING_FORM);
  const [feePlanForm, setFeePlanForm] = useState<FeePlanFormState>(() => ({
    ...EMPTY_FEE_PLAN_FORM,
    planName: defaultPlanName,
  }));
  const [publishRuleFormRuleId, setPublishRuleFormRuleId] = useState<
    string | null
  >(null);
  const [publishRuleForm, setPublishRuleForm] = useState(
    EMPTY_PUBLISH_RULE_FORM,
  );
  const [publishRuleFormError, setPublishRuleFormError] = useState<
    string | null
  >(null);
  const [creatingPricingRule, setCreatingPricingRule] = useState(false);
  const [publishingRuleId, setPublishingRuleId] = useState<string | null>(null);
  const [requestingReviewRuleId, setRequestingReviewRuleId] = useState<
    string | null
  >(null);
  const [publishingFeePlan, setPublishingFeePlan] = useState(false);

  const copy =
    locale === "en"
      ? {
          title: "Pricing",
          subtitle: "pricing rules · driver fee plans · publish windows",
          tabs: ["Pricing rules", "Driver fee plans", "Override governance"],
          authorityTitle: "canonical quoted fare authority",
          authorityFallback:
            "Backend remains the only quoted-fare source. Manual overrides must keep actor, reason, and trace evidence.",
          rulesTitle: "Pricing rules",
          rulesSubtitle:
            "Platform-owned pricing rules remain the only fare authority for quoted fare.",
          governanceTitle: "Override governance",
          governanceSubtitle:
            "Quoted-fare authority, manual override scope, and pricing publish gates.",
          governanceEmpty:
            "Select a review-required pricing rule to configure effective dates before publish.",
          governanceNoDrafts:
            "No draft pricing rules are waiting for review submission.",
          governanceDraftQueue: "Draft review queue",
          governanceDraftQueueCopy:
            "Draft rules must enter review_required before any publish action.",
          governanceReviewQueue: "Ready-to-publish queue",
          governanceReviewQueueCopy:
            "Only review_required rules can be scheduled or published.",
          governancePublishWindow: "Publish window",
          governancePublishWindowCopy:
            "Leave either field blank to keep the draft's stored effective window.",
          governancePublishReason: "Publish reason",
          governancePublishReasonCopy:
            "High-risk publish actions require a reason and always write audit evidence.",
          governancePublishReasonRequired: "A publish reason is required.",
          feePlansTitle: "Driver fee plans",
          feePlansSubtitle:
            "Immutable settlement plans used when generating driver statements and payout trails.",
          feePlansComposer:
            "Publish a new immutable fee-plan version for downstream settlement.",
          bucketTitle: (version: string) =>
            `Service bucket fee breakdown (${version})`,
          currentVersionLabel: "canonical version",
          refresh: "Refresh",
          configureDraft: "Configure draft",
          draftSelected: "Selected",
          requestReview: "Request review",
          requestingReview: "Requesting review...",
          publishReadyRule: "Publish reviewed rule",
          openEnded: "open-ended",
          notAllowed: "Not allowed",
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
          feeColumns: {
            plan: "PLAN",
            version: "VERSION",
            fee: "SERVICE FEE bps",
            reimburse: "REIMBURSE",
            status: "STATUS",
            published: "PUBLISHED",
          },
          ruleColumns: {
            version: "VERSION",
            name: "Name",
            status: "STATUS",
            fee: "SERVICE FEE bps",
            reimburse: "REIMBURSE",
            scope: "SCOPE",
            effective: "EFFECTIVE",
          },
        }
      : {
          title: "計價",
          subtitle: "pricing rules · driver fee plans · publish windows",
          tabs: ["Pricing rules", "Driver fee plans", "Override governance"],
          authorityTitle: "canonical quoted fare authority",
          authorityFallback:
            "後端仍是 quoted fare 的唯一真值，所有 manual override 都必須留下 actor、reason 與 trace 證據。",
          rulesTitle: "定價規則",
          rulesSubtitle:
            "平台自有 pricing rule 是 quoted fare 的唯一規則真值。",
          governanceTitle: "覆寫治理",
          governanceSubtitle:
            "quoted fare authority、manual override 範圍與 pricing 發布關卡。",
          governanceEmpty:
            "請先選一條 review_required pricing rule，再設定發布時間。",
          governanceNoDrafts: "目前沒有待送審的定價草稿。",
          governanceDraftQueue: "待送審草稿",
          governanceDraftQueueCopy:
            "所有 draft 規則都必須先進入 review_required 才能發布。",
          governanceReviewQueue: "待發布規則",
          governanceReviewQueueCopy:
            "只有 review_required 規則可以排程或立即發布。",
          governancePublishWindow: "發布視窗",
          governancePublishWindowCopy:
            "任一欄位留空時，會沿用草稿原本儲存的生效區間。",
          governancePublishReason: "發布原因",
          governancePublishReasonCopy:
            "高風險發布動作必須填寫原因，並會寫入 audit 證據。",
          governancePublishReasonRequired: "必須填寫發布原因。",
          feePlansTitle: "司機費用方案",
          feePlansSubtitle:
            "發布後不可變更，供 driver statement 與 payout trail 使用。",
          feePlansComposer: "發布新的 immutable fee plan 版本供後續結算使用。",
          bucketTitle: (version: string) => `服務 bucket fee 拆解 (${version})`,
          currentVersionLabel: "canonical version",
          refresh: "重新整理",
          configureDraft: "設定發布",
          draftSelected: "已選取",
          requestReview: "送審",
          requestingReview: "送審中...",
          publishReadyRule: "發布已送審規則",
          openEnded: "未設定截止",
          notAllowed: "不允許",
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
          feeColumns: {
            plan: "方案",
            version: "版本",
            fee: "SERVICE FEE bps",
            reimburse: "報銷",
            status: "狀態",
            published: "發布時間",
          },
          ruleColumns: {
            version: "版本",
            name: "名稱",
            status: "狀態",
            fee: "SERVICE FEE bps",
            reimburse: "報銷",
            scope: "SCOPE",
            effective: "EFFECTIVE",
          },
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const sortedRules = useMemo(
    () =>
      [...rules].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      ),
    [rules],
  );

  const filteredRules = useMemo(() => {
    if (filter === "all") {
      return sortedRules;
    }
    return sortedRules.filter((rule) => rule.status === filter);
  }, [filter, sortedRules]);

  const draftRules = useMemo(
    () => sortedRules.filter((rule) => rule.status === "draft"),
    [sortedRules],
  );

  const reviewRequiredRules = useMemo(
    () => sortedRules.filter((rule) => rule.status === "review_required"),
    [sortedRules],
  );

  const activeRule = useMemo(
    () => sortedRules.find((rule) => rule.status === "published") ?? null,
    [sortedRules],
  );

  const selectedReviewRule = useMemo(
    () =>
      reviewRequiredRules.find((rule) => rule.ruleId === publishRuleFormRuleId) ??
      null,
    [reviewRequiredRules, publishRuleFormRuleId],
  );

  const ruleCounts = useMemo(
    () => ({
      all: rules.length,
      draft: rules.filter((rule) => rule.status === "draft").length,
      reviewRequired: rules.filter((rule) => rule.status === "review_required")
        .length,
      published: rules.filter((rule) => rule.status === "published").length,
      scheduled: rules.filter((rule) => rule.status === "scheduled").length,
      rollbackHold: rules.filter((rule) => rule.status === "rollback_hold")
        .length,
      superseded: rules.filter((rule) => rule.status === "superseded").length,
    }),
    [rules],
  );

  const ruleRows = useMemo<PricingRuleRow[]>(
    () =>
      filteredRules.map((rule) => ({
        ...rule,
        _selected: rule.ruleId === publishRuleFormRuleId,
      })),
    [filteredRules, publishRuleFormRuleId],
  );

  const feePlanRows = useMemo<FeePlanRow[]>(
    () =>
      [...feePlans]
        .sort(
          (left, right) =>
            new Date(right.publishedAt).getTime() -
            new Date(left.publishedAt).getTime(),
        )
        .map((plan) => ({ ...plan })),
    [feePlans],
  );

  async function handleCreatePricingRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingPricingRule(true);
    setError(null);
    try {
      await client.createPlatformPricingRule({
        ruleName: pricingForm.ruleName,
        version: pricingForm.version,
        serviceFeeBps: Number(pricingForm.serviceFeeBps),
        reimbursementMode: pricingForm.reimbursementMode,
        applicableTo: pricingForm.applicableTo.trim() || "all",
        notes: pricingForm.notes,
      });
      setPricingForm(EMPTY_PRICING_FORM);
      setShowCreate(false);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPricingRule(false);
    }
  }

  function openPublishRuleForm(rule: PlatformPricingRuleRecord) {
    const normalizedEffectiveFrom = normalizeDateTimeLocalValue(
      rule.effectiveFrom ?? "",
    );
    const normalizedEffectiveTo = normalizeDateTimeLocalValue(
      rule.effectiveTo ?? "",
    );
    setError(null);
    setPublishRuleFormError(null);
    setPublishRuleFormRuleId(rule.ruleId);
    setPublishRuleForm({
      effectiveFrom: normalizedEffectiveFrom.localValue,
      effectiveTo: normalizedEffectiveTo.localValue,
      reason: "",
    });
  }

  function closePublishRuleForm() {
    setPublishRuleFormRuleId(null);
    setPublishRuleForm(EMPTY_PUBLISH_RULE_FORM);
    setPublishRuleFormError(null);
  }

  async function handlePublishRule(ruleId: string) {
    const normalizedEffectiveFrom = normalizeDateTimeLocalValue(
      publishRuleForm.effectiveFrom,
    );
    const normalizedEffectiveTo = normalizeDateTimeLocalValue(
      publishRuleForm.effectiveTo,
    );

    if (
      publishRuleForm.effectiveFrom.trim() &&
      !normalizedEffectiveFrom.isoValue
    ) {
      setPublishRuleFormError(t("switchboard.err.effectiveFrom"));
      return;
    }

    if (publishRuleForm.effectiveTo.trim() && !normalizedEffectiveTo.isoValue) {
      setPublishRuleFormError(t("switchboard.err.effectiveTo"));
      return;
    }

    if (
      normalizedEffectiveFrom.isoValue &&
      normalizedEffectiveTo.isoValue &&
      normalizedEffectiveTo.isoValue < normalizedEffectiveFrom.isoValue
    ) {
      setPublishRuleFormError(t("switchboard.err.effectiveToOrder"));
      return;
    }

    const normalizedReason = publishRuleForm.reason.trim();
    if (!normalizedReason) {
      setPublishRuleFormError(copy.governancePublishReasonRequired);
      return;
    }

    setPublishingRuleId(ruleId);
    setError(null);
    setPublishRuleFormError(null);
    try {
      await client.publishPlatformPricingRule(ruleId, {
        effectiveFrom: normalizedEffectiveFrom.isoValue,
        effectiveTo: normalizedEffectiveTo.isoValue,
        reason: normalizedReason,
      });
      closePublishRuleForm();
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishingRuleId(null);
    }
  }

  async function handleRequestReview(ruleId: string) {
    setRequestingReviewRuleId(ruleId);
    setError(null);
    try {
      await client.requestPlatformPricingRuleReview(ruleId);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRequestingReviewRuleId(null);
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
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishingFeePlan(false);
    }
  }

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

  const ruleColumns: CanvasTableColumn<PricingRuleRow>[] = [
    {
      h: copy.ruleColumns.version,
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
      h: copy.ruleColumns.name,
      w: 260,
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
      h: copy.ruleColumns.status,
      w: 116,
      r: (rule) => (
        <CanvasPill theme={th} tone={statusTone(rule.status)} dot>
          {formatPlatformCodeLabel(locale, rule.status)}
        </CanvasPill>
      ),
    },
    {
      h: copy.ruleColumns.fee,
      w: 148,
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
      h: copy.ruleColumns.reimburse,
      w: 146,
      r: (rule) => formatPlatformCodeLabel(locale, rule.reimbursementMode),
    },
    {
      h: copy.ruleColumns.scope,
      w: 180,
      mono: true,
      r: (rule) =>
        rule.applicableTo === "all"
          ? t("common.allTenants")
          : rule.applicableTo,
    },
    {
      h: copy.ruleColumns.effective,
      w: 220,
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
  ];

  const feePlanColumns: CanvasTableColumn<FeePlanRow>[] = [
    {
      h: copy.feeColumns.plan,
      w: 240,
      r: (plan) => (
        <div style={stackedCellStyle}>
          <span style={primaryTextStyle}>{plan.planName}</span>
          <span style={secondaryMonoStyle}>{plan.feePlanId}</span>
        </div>
      ),
    },
    {
      h: copy.feeColumns.version,
      w: 140,
      mono: true,
      k: "version",
    },
    {
      h: copy.feeColumns.fee,
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
      h: copy.feeColumns.reimburse,
      w: 140,
      r: (plan) => formatPlatformCodeLabel(locale, plan.reimbursementMode),
    },
    {
      h: copy.feeColumns.status,
      w: 120,
      r: (plan) => (
        <CanvasPill theme={th} tone={statusTone(plan.status)} dot>
          {formatPlatformCodeLabel(locale, plan.status)}
        </CanvasPill>
      ),
    },
    {
      h: copy.feeColumns.published,
      w: 170,
      mono: true,
      r: (plan) => formatDateTime(plan.publishedAt),
    },
  ];

  if (loading) {
    return <div style={loadingStateStyle}>{t("pricing.loading")}</div>;
  }

  const canonicalVersion =
    activeRule?.version ??
    productRuleCatalog?.pricingAuthority.canonicalPricingRuleVersion ??
    "draft";

  return (
    <div style={pageRootStyle}>
      <CanvasPageHeader
        theme={th}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={copy.tabs}
        activeTab={copy.tabs[0]}
        actions={
          <>
            <CanvasBtn
              theme={th}
              variant="secondary"
              icon={showCreate ? "x" : "plus"}
              onClick={() => setShowCreate((current) => !current)}
            >
              {showCreate
                ? t("pricing.cancelDraft")
                : t("pricing.newPricingDraft")}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="check"
              disabled={reviewRequiredRules.length === 0}
              onClick={() => {
                const nextDraft = selectedReviewRule ?? reviewRequiredRules[0];
                if (nextDraft) {
                  openPublishRuleForm(nextDraft);
                }
              }}
            >
              {copy.publishReadyRule}
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
            productRuleCatalog ? (
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
            )
          }
        />

        <div style={summaryRowStyle}>
          <CanvasPill theme={th} tone="warn">
            {t("pricing.platformDrafts")} {ruleCounts.draft}
          </CanvasPill>
          <CanvasPill theme={th} tone="success">
            {t("pricing.activeTemplates")} {ruleCounts.published}
          </CanvasPill>
          <CanvasPill theme={th} tone="info">
            {formatPlatformCodeLabel(locale, "review_required")}{" "}
            {ruleCounts.reviewRequired}
          </CanvasPill>
          <CanvasPill theme={th} tone="info">
            {t("pricing.publishedPlans")} {feePlanRows.length}
          </CanvasPill>
          <CanvasPill theme={th} tone="accent">
            {copy.currentVersionLabel} {canonicalVersion}
          </CanvasPill>
        </div>

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
                    onChange={(event) =>
                      setPricingForm((current) => ({
                        ...current,
                        ruleName: event.target.value,
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
                    onChange={(event) =>
                      setPricingForm((current) => ({
                        ...current,
                        version: event.target.value,
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
                    onChange={(event) =>
                      setPricingForm((current) => ({
                        ...current,
                        applicableTo: event.target.value,
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
                    onChange={(event) =>
                      setPricingForm((current) => ({
                        ...current,
                        serviceFeeBps: event.target.value,
                      }))
                    }
                    required
                    style={monoInputStyle}
                  />
                </CanvasField>
                <CanvasField theme={th} label={t("pricing.form.reimbMode")}>
                  <select
                    value={pricingForm.reimbursementMode}
                    onChange={(event) =>
                      setPricingForm((current) => ({
                        ...current,
                        reimbursementMode: event.target
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
                  onChange={(event) =>
                    setPricingForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
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
                  {t("common.cancel")}
                </CanvasBtn>
                <button
                  type="submit"
                  disabled={
                    creatingPricingRule ||
                    !pricingForm.ruleName.trim() ||
                    !pricingForm.version.trim()
                  }
                  style={submitButtonStyle(
                    creatingPricingRule ||
                      !pricingForm.ruleName.trim() ||
                      !pricingForm.version.trim(),
                  )}
                >
                  {creatingPricingRule
                    ? t("pricing.creating")
                    : t("pricing.createDraft")}
                </button>
              </div>
            </form>
          </CanvasCard>
        ) : null}

        <div style={splitLayoutStyle}>
          <div style={mainColumnStyle}>
            <CanvasCard
              theme={th}
              title={copy.rulesTitle}
              subtitle={copy.rulesSubtitle}
              padding={0}
            >
              <div style={cardToolbarStyle}>
                {(["all", "published", "review_required", "superseded"] as const).map(
                  (value) => {
                    const count =
                      value === "all"
                        ? ruleCounts.all
                        : value === "published"
                          ? ruleCounts.published
                          : value === "review_required"
                            ? ruleCounts.reviewRequired
                            : ruleCounts.superseded;

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
                <span style={{ flex: 1 }} />
                <CanvasBtn
                  theme={th}
                  variant="secondary"
                  onClick={() => void loadData()}
                >
                  {copy.refresh}
                </CanvasBtn>
              </div>

              <CanvasTable theme={th} columns={ruleColumns} rows={ruleRows} />
            </CanvasCard>
          </div>

          <div style={sideColumnStyle}>
            <CanvasCard
              theme={th}
              title={copy.governanceTitle}
              subtitle={copy.governanceSubtitle}
            >
              {authorityItems.length > 0 ? (
                <CanvasDL theme={th} cols={1} items={authorityItems} />
              ) : (
                <p style={helperTextStyle}>{copy.authorityFallback}</p>
              )}

              <div style={{ height: 16 }} />

              <div style={sectionIntroStyle}>
                <h3 style={sectionTitleStyle}>{copy.governanceDraftQueue}</h3>
                <p style={sectionCopyStyle}>{copy.governanceDraftQueueCopy}</p>
              </div>

              <div style={{ height: 10 }} />

              {draftRules.length > 0 ? (
                <div style={draftSelectorStyle}>
                  {draftRules.map((rule) => (
                    <CanvasBtn
                      key={rule.ruleId}
                      theme={th}
                      size="xs"
                      variant="secondary"
                      disabled={requestingReviewRuleId === rule.ruleId}
                      onClick={() => void handleRequestReview(rule.ruleId)}
                    >
                      {requestingReviewRuleId === rule.ruleId
                        ? copy.requestingReview
                        : `${rule.version} · ${copy.requestReview}`}
                    </CanvasBtn>
                  ))}
                </div>
              ) : (
                <p style={helperTextStyle}>{copy.governanceNoDrafts}</p>
              )}

              <div style={{ height: 16 }} />

              <div style={sectionIntroStyle}>
                <h3 style={sectionTitleStyle}>{copy.governanceReviewQueue}</h3>
                <p style={sectionCopyStyle}>{copy.governanceReviewQueueCopy}</p>
              </div>

              <div style={{ height: 10 }} />

              {reviewRequiredRules.length > 0 ? (
                <div style={draftSelectorStyle}>
                  {reviewRequiredRules.map((rule) => (
                    <CanvasBtn
                      key={rule.ruleId}
                      theme={th}
                      size="xs"
                      variant={
                        publishRuleFormRuleId === rule.ruleId
                          ? "primary"
                          : "secondary"
                      }
                      onClick={() => openPublishRuleForm(rule)}
                    >
                      {rule.version}
                    </CanvasBtn>
                  ))}
                </div>
              ) : (
                <p style={helperTextStyle}>{copy.governanceEmpty}</p>
              )}

              <div style={{ height: 16 }} />

              {publishRuleFormError ? (
                <>
                  <CanvasBanner
                    theme={th}
                    tone="danger"
                    icon="warn"
                    title={getPlatformLabel(locale, "error")}
                    body={publishRuleFormError}
                  />
                  <div style={{ height: 12 }} />
                </>
              ) : null}

              {selectedReviewRule ? (
                <div style={composerStyle}>
                  <div style={sectionIntroStyle}>
                    <h3 style={sectionTitleStyle}>
                      {copy.governancePublishWindow}
                    </h3>
                    <p style={sectionCopyStyle}>
                      {selectedReviewRule.ruleName} · {selectedReviewRule.version}
                    </p>
                  </div>

                  <div style={twoFieldRowStyle}>
                    <CanvasField
                      theme={th}
                      label={t("pricing.effectiveFromOverride")}
                    >
                      <input
                        type="datetime-local"
                        value={publishRuleForm.effectiveFrom}
                        onChange={(event) => {
                          setPublishRuleFormError(null);
                          setPublishRuleForm((current) => ({
                            ...current,
                            effectiveFrom: event.target.value,
                          }));
                        }}
                        style={inputStyle}
                        max={publishRuleForm.effectiveTo || undefined}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={th}
                      label={t("pricing.effectiveToOverride")}
                    >
                      <input
                        type="datetime-local"
                        value={publishRuleForm.effectiveTo}
                        onChange={(event) => {
                          setPublishRuleFormError(null);
                          setPublishRuleForm((current) => ({
                            ...current,
                            effectiveTo: event.target.value,
                          }));
                        }}
                        style={inputStyle}
                        min={publishRuleForm.effectiveFrom || undefined}
                      />
                    </CanvasField>
                  </div>

                  <p style={helperTextStyle}>
                    {copy.governancePublishWindowCopy}
                  </p>

                  <CanvasField
                    theme={th}
                    label={copy.governancePublishReason}
                    required
                  >
                    <textarea
                      value={publishRuleForm.reason}
                      onChange={(event) => {
                        setPublishRuleFormError(null);
                        setPublishRuleForm((current) => ({
                          ...current,
                          reason: event.target.value,
                        }));
                      }}
                      rows={3}
                      required
                      style={textAreaStyle}
                    />
                  </CanvasField>

                  <p style={helperTextStyle}>
                    {copy.governancePublishReasonCopy}
                  </p>

                  <div style={formActionsStyle}>
                    <CanvasBtn
                      theme={th}
                      variant="secondary"
                      onClick={closePublishRuleForm}
                      disabled={publishingRuleId === selectedReviewRule.ruleId}
                    >
                      {t("common.cancel")}
                    </CanvasBtn>
                    <CanvasBtn
                      theme={th}
                      variant="primary"
                      icon="check"
                      disabled={publishingRuleId === selectedReviewRule.ruleId}
                      onClick={() =>
                        void handlePublishRule(selectedReviewRule.ruleId)
                      }
                    >
                      {publishingRuleId === selectedReviewRule.ruleId
                        ? t("pricing.publishing")
                        : t("pricing.confirmPublish")}
                    </CanvasBtn>
                  </div>
                </div>
              ) : (
                <p style={helperTextStyle}>{copy.governanceEmpty}</p>
              )}
            </CanvasCard>
          </div>
        </div>

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
                  <span style={secondaryTextStyle}>{bucket.continuation}</span>
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
          title={copy.feePlansTitle}
          subtitle={copy.feePlansSubtitle}
        >
          <form onSubmit={handlePublishFeePlan} style={composerStyle}>
            <div style={sectionIntroStyle}>
              <h3 style={sectionTitleStyle}>
                {t("pricing.sectionPublishPlan")}
              </h3>
              <p style={sectionCopyStyle}>{copy.feePlansComposer}</p>
            </div>

            <div style={fieldGridStyle}>
              <CanvasField
                theme={th}
                label={t("pricing.form.planName")}
                required
              >
                <input
                  value={feePlanForm.planName}
                  onChange={(event) =>
                    setFeePlanForm((current) => ({
                      ...current,
                      planName: event.target.value,
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
                  onChange={(event) =>
                    setFeePlanForm((current) => ({
                      ...current,
                      version: event.target.value,
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
                  onChange={(event) =>
                    setFeePlanForm((current) => ({
                      ...current,
                      serviceFeeBps: event.target.value,
                    }))
                  }
                  required
                  style={monoInputStyle}
                />
              </CanvasField>
              <CanvasField theme={th} label={t("pricing.form.reimbMode")}>
                <select
                  value={feePlanForm.reimbursementMode}
                  onChange={(event) =>
                    setFeePlanForm((current) => ({
                      ...current,
                      reimbursementMode: event.target
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

            <div style={formActionsStyle}>
              <button
                type="submit"
                disabled={publishingFeePlan || !feePlanForm.version.trim()}
                style={submitButtonStyle(
                  publishingFeePlan || !feePlanForm.version.trim(),
                )}
              >
                {publishingFeePlan
                  ? t("pricing.publishing")
                  : t("pricing.publishSettlementPlan")}
              </button>
            </div>
          </form>

          <div style={{ height: 16 }} />
          <div style={dividerStyle} />
          <div style={{ height: 16 }} />

          {feePlanRows.length > 0 ? (
            <CanvasTable
              theme={th}
              columns={feePlanColumns}
              rows={feePlanRows}
            />
          ) : (
            <p style={helperTextStyle}>{t("pricing.noPlans")}</p>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
