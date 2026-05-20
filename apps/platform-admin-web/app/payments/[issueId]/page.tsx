"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasShell as Shell,
  CanvasTable as Table,
  Timeline,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTheme,
  type TimelineItem,
} from "@drts/ui-web";
import { RECONCILIATION_ISSUE_RESOLUTION_CODES } from "@drts/contracts";
import type { ReconciliationIssueRecord } from "@drts/contracts";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";

const DEFAULT_FINANCE_ACTOR_ID = "finance.console";
type ResolutionCodeValue =
  | NonNullable<ReconciliationIssueRecord["resolutionCode"]>
  | "";
const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});
type EvidenceArtifactRow = { artifactId: string };

function parseArtifactIds(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function describeChannel(
  t: (key: string, params?: Record<string, string | number>) => string,
  channelKey: string | null | undefined,
) {
  if (!channelKey) {
    return "—";
  }

  const key = `payments.matrix.channel.${channelKey}`;
  const value = t(key);
  return value === key ? channelKey : value;
}

function textOrDash(value: string | null | undefined) {
  return value?.trim() ? value : "—";
}

function getStatusTone(status: ReconciliationIssueRecord["status"]) {
  if (status === "resolved") {
    return "success" as const;
  }
  if (status === "assigned") {
    return "warn" as const;
  }
  if (status === "reopened") {
    return "danger" as const;
  }
  return "neutral" as const;
}

function getSourceTone(source: ReconciliationIssueRecord["source"]) {
  return source === "forwarder_auto" ? ("warn" as const) : ("info" as const);
}

function controlStyle(activeTheme: CanvasTheme, multiline = false) {
  return {
    width: "100%",
    minHeight: multiline ? "96px" : "38px",
    padding: multiline ? "10px 12px" : "8px 12px",
    borderRadius: "7px",
    border: `1px solid ${activeTheme.border}`,
    background: activeTheme.bgRaised,
    color: activeTheme.text,
    boxSizing: "border-box" as const,
    fontSize: "12.5px",
    fontFamily: multiline ? activeTheme.fontFamily : activeTheme.fontFamily,
    lineHeight: 1.45,
    resize: multiline ? ("vertical" as const) : ("none" as const),
    outline: "none",
  };
}

function buildPlatformNav(
  locale: "en" | "zh",
  openIssueCount: number,
): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          tenantGovernance: "Tenant Governance",
          fleetCompliance: "Fleet & Compliance",
          pricingSettlement: "Pricing & Settlement",
          platformLayer: "Platform Layer",
          home: "Home",
          health: "Health & Alerts",
          tenants: "Tenants",
          partners: "Partner Entry",
          users: "Platform Staff",
          fleet: "Fleet & Compliance",
          switchboard: "Public Info & Placards",
          pricing: "Pricing",
          payments: "Settlement Governance",
          notices: "Notices & Maintenance",
          audit: "Audit & Evidence",
          featureFlags: "Feature Flags",
          adapterRegistry: "Adapter Registry",
        }
      : {
          workspace: "工作面",
          tenantGovernance: "租戶治理",
          fleetCompliance: "車隊與法遵",
          pricingSettlement: "計價與結算",
          platformLayer: "平台層",
          home: "工作首頁",
          health: "平台健康",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricing: "計價",
          payments: "結算治理",
          notices: "公告與維護",
          audit: "稽核與證據",
          featureFlags: "功能旗標",
          adapterRegistry: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    {
      key: "health",
      href: "/health",
      icon: "health",
      label: labels.health,
    },
    { divider: labels.tenantGovernance },
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: labels.tenants,
    },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: labels.partners,
    },
    { key: "users", href: "/users", icon: "users", label: labels.users },
    { divider: labels.fleetCompliance },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
    { divider: labels.pricingSettlement },
    {
      key: "pricing",
      href: "/pricing",
      icon: "pricing",
      label: labels.pricing,
    },
    {
      key: "payments",
      href: "/payments",
      icon: "payments",
      label: labels.payments,
      ...(openIssueCount > 0
        ? { badge: String(openIssueCount), badgeTone: "danger" as const }
        : {}),
      matchPaths: ["/payments"],
    },
    { divider: labels.platformLayer },
    {
      key: "notices",
      href: "/notices",
      icon: "notices",
      label: labels.notices,
    },
    { key: "audit", href: "/audit", icon: "audit", label: labels.audit },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: labels.featureFlags,
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapterRegistry,
    },
  ];
}

function formatIssueSubtitle(
  issue: ReconciliationIssueRecord,
  locale: "en" | "zh",
) {
  const source = formatPlatformCodeLabel(locale, issue.source);
  const external = issue.externalOrderId ?? issue.orderId ?? "—";
  const mirror = issue.mirrorOrderId ?? "—";
  return `${source} · ${external} · mirror ${mirror}`;
}

function buildForwarderContextSummary(
  issue: ReconciliationIssueRecord,
  locale: "en" | "zh",
) {
  if (!issue.forwardedFinanceContext) {
    return null;
  }

  const context = issue.forwardedFinanceContext;
  return [
    formatPlatformCodeLabel(locale, context.platformCode),
    formatPlatformCodeLabel(locale, context.reconciliationReason),
    `fare ${formatPlatformCodeLabel(locale, context.fareAuthority)}`,
    `settlement ${formatPlatformCodeLabel(locale, context.settlementAuthority)}`,
    `payout ${formatPlatformCodeLabel(locale, context.driverPayoutAuthority)}`,
    `ledger ${formatPlatformCodeLabel(locale, context.localLedgerMode)}`,
  ].join(" · ");
}

function buildTimelineItems(
  issue: ReconciliationIssueRecord,
  locale: "en" | "zh",
  t: (key: string, params?: Record<string, string | number>) => string,
): TimelineItem[] {
  const createdItem: TimelineItem = {
    id: `${issue.issueId}-created`,
    eyebrow: locale === "zh" ? "建立 issue" : "Issue opened",
    title: formatPlatformCodeLabel(locale, issue.issueType),
    detail: issue.summary,
    timestamp: formatDateTime(issue.createdAt),
    tone: issue.source === "forwarder_auto" ? "warning" : "accent",
    meta: `${issue.openedBy} · ${describeChannel(t, issue.channelKey)}`,
    supportingContent:
      issue.evidenceArtifactIds.length > 0 ? (
        <div className="artifactRow">
          {issue.evidenceArtifactIds.map((artifactId) => (
            <Pill key={artifactId} theme={theme} tone="neutral">
              {artifactId}
            </Pill>
          ))}
        </div>
      ) : null,
  };

  const commentItems = [...issue.comments]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map<TimelineItem>((comment) => ({
      id: comment.commentId,
      eyebrow: locale === "zh" ? "評論 / 證據" : "Comment / Evidence",
      title: locale === "zh" ? "新增評論" : "Comment added",
      detail: comment.message,
      timestamp: formatDateTime(comment.createdAt),
      tone: "accent",
      meta: comment.actorId,
      supportingContent:
        comment.artifactIds.length > 0 ? (
          <div className="artifactRow">
            {comment.artifactIds.map((artifactId) => (
              <Pill key={artifactId} theme={theme} tone="info">
                {artifactId}
              </Pill>
            ))}
          </div>
        ) : null,
    }));

  const resolutionItems: TimelineItem[] = [];
  if (issue.resolvedAt) {
    resolutionItems.push({
      id: `${issue.issueId}-resolved`,
      eyebrow: locale === "zh" ? "結案" : "Resolved",
      title: t("payments.reconciliation.resolve"),
      detail: issue.resolutionSummary ?? "—",
      timestamp: formatDateTime(issue.resolvedAt),
      tone: "success",
      meta: issue.resolutionCode
        ? formatPlatformCodeLabel(locale, issue.resolutionCode)
        : undefined,
    });
  } else if (issue.reopenCount > 0) {
    resolutionItems.push({
      id: `${issue.issueId}-reopened`,
      eyebrow: locale === "zh" ? "重開" : "Reopened",
      title: t("payments.reconciliation.reopenCount", {
        count: String(issue.reopenCount),
      }),
      detail:
        locale === "zh"
          ? "此問題已重開，等待新的處理或外部回覆。"
          : "This issue has been reopened and is waiting for a new review.",
      timestamp: formatDateTime(issue.updatedAt),
      tone: "danger",
    });
  }

  return [createdItem, ...commentItems, ...resolutionItems];
}

export default function PaymentReconciliationIssueDetailPage() {
  const params = useParams<{ issueId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const client = usePlatformAdminClient();
  const { locale, t } = useTranslation();
  const issueId = Array.isArray(params?.issueId)
    ? params.issueId[0]
    : (params?.issueId ?? "");

  const [issues, setIssues] = useState<ReconciliationIssueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [financeActorId, setFinanceActorId] = useState(
    DEFAULT_FINANCE_ACTOR_ID,
  );
  const [assigneeId, setAssigneeId] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [commentArtifactIds, setCommentArtifactIds] = useState("");
  const [resolutionCode, setResolutionCode] = useState<ResolutionCodeValue>("");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [resolutionArtifactIds, setResolutionArtifactIds] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [reopenArtifactIds, setReopenArtifactIds] = useState("");
  const [actionPending, setActionPending] = useState<string | null>(null);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await client.listReconciliationIssues();
      setIssues(records ?? []);
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  const issue = useMemo(
    () => issues.find((record) => record.issueId === issueId) ?? null,
    [issueId, issues],
  );
  const openIssueCount = useMemo(
    () => issues.filter((record) => record.status !== "resolved").length,
    [issues],
  );
  const navItems = useMemo(
    () => buildPlatformNav(locale, openIssueCount),
    [locale, openIssueCount],
  );
  const timelineItems = useMemo(
    () => (issue ? buildTimelineItems(issue, locale, t) : []),
    [issue, locale, t],
  );
  const evidenceRows = useMemo<EvidenceArtifactRow[]>(
    () =>
      issue?.evidenceArtifactIds.map((artifactId) => ({
        artifactId,
      })) ?? [],
    [issue],
  );

  useEffect(() => {
    if (!issue) {
      return;
    }

    setAssigneeId(issue.ownerId ?? "");
    setResolutionCode(issue.resolutionCode ?? "");
    setResolutionSummary(issue.resolutionSummary ?? "");
  }, [issue]);

  async function handleAssignIssue() {
    if (!issue) {
      return;
    }

    const nextAssignee = assigneeId.trim() || issue.ownerId || "";
    if (!nextAssignee) {
      setError(t("payments.reconciliation.assigneeRequired"));
      return;
    }

    setActionPending("assign");
    setError(null);
    try {
      await client.assignReconciliationIssue(issue.issueId, {
        assigneeId: nextAssignee,
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        note: commentMessage.trim() || null,
      });
      setCommentMessage("");
      await loadIssues();
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setActionPending(null);
    }
  }

  async function handleAddComment() {
    if (!issue) {
      return;
    }

    const message = commentMessage.trim();
    if (!message) {
      setError(t("payments.reconciliation.commentRequired"));
      return;
    }

    setActionPending("comment");
    setError(null);
    try {
      await client.addReconciliationIssueComment(issue.issueId, {
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        message,
        artifactIds: parseArtifactIds(commentArtifactIds),
      });
      setCommentMessage("");
      setCommentArtifactIds("");
      await loadIssues();
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setActionPending(null);
    }
  }

  async function handleResolveIssue() {
    if (!issue) {
      return;
    }

    const summary = resolutionSummary.trim();
    if (!summary) {
      setError(t("payments.reconciliation.resolveSummaryRequired"));
      return;
    }

    setActionPending("resolve");
    setError(null);
    try {
      await client.resolveReconciliationIssue(issue.issueId, {
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        resolutionCode:
          (resolutionCode as NonNullable<
            ReconciliationIssueRecord["resolutionCode"]
          >) || "resolved_other",
        resolutionSummary: summary,
        artifactIds: parseArtifactIds(resolutionArtifactIds),
      });
      setResolutionArtifactIds("");
      await loadIssues();
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setActionPending(null);
    }
  }

  async function handleReopenIssue() {
    if (!issue) {
      return;
    }

    const reason = reopenReason.trim();
    if (!reason) {
      setError(t("payments.reconciliation.reopenReasonRequired"));
      return;
    }

    setActionPending("reopen");
    setError(null);
    try {
      await client.reopenReconciliationIssue(issue.issueId, {
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        reason,
        artifactIds: parseArtifactIds(reopenArtifactIds),
      });
      setReopenReason("");
      setReopenArtifactIds("");
      await loadIssues();
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setActionPending(null);
    }
  }

  const headerTitle = issue
    ? `${issue.issueId} · ${formatPlatformCodeLabel(locale, issue.issueType)}`
    : issueId || t("payments.reconciliation.title");
  const headerSubtitle = issue
    ? formatIssueSubtitle(issue, locale)
    : t("payments.reconciliation.subtitle");
  const resolutionCardSubtitle =
    issue?.status === "resolved"
      ? locale === "zh"
        ? "此 issue 已結案；若有新證據或外部修正，可從此卡片重開。"
        : "This issue is resolved; reopen it from this card when new evidence arrives."
      : locale === "zh"
        ? "在同一卡片內完成指派、補證據與正式結案。"
        : "Keep assignment, evidence capture, and resolution in one workflow.";

  function scrollToSection(sectionId: string) {
    document
      .getElementById(sectionId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <style jsx global>{`
        body > aside {
          display: none !important;
        }

        body > main {
          padding: 0 !important;
          background: transparent !important;
        }
      `}</style>

      <Shell
        theme={theme}
        nav={navItems}
        active="payments"
        currentPath={pathname ?? `/payments/${issueId}`}
        brandLabel={t("app.name")}
        brandSubLabel={locale === "zh" ? "Platform Admin" : "Platform Admin"}
        brandMark="PA"
        breadcrumb={[
          locale === "zh" ? "結算治理" : "Settlement Governance",
          locale === "zh" ? "Reconciliation issues" : "Reconciliation issues",
          issueId || "—",
        ]}
        env="production"
        avatarLabel="PA"
        searchPlaceholder={
          locale === "zh"
            ? "搜尋 issue、租戶、訂單…"
            : "Search issues, tenants, orders…"
        }
        style={{ minHeight: "100vh" }}
      >
        <PageHeader
          theme={theme}
          title={headerTitle}
          subtitle={headerSubtitle}
          actions={
            <div className="headerActions">
              <Btn
                theme={theme}
                variant="secondary"
                icon="copy"
                onClick={() => scrollToSection("assignment-section")}
                disabled={!issue}
              >
                {t("payments.reconciliation.assign")}
              </Btn>
              <Btn
                theme={theme}
                variant="secondary"
                icon="plus"
                onClick={() => scrollToSection("evidence-section")}
                disabled={!issue}
              >
                {locale === "zh" ? "補 evidence" : "Add evidence"}
              </Btn>
              <Btn
                theme={theme}
                variant="primary"
                icon={issue?.status === "resolved" ? "plus" : "check"}
                onClick={() => scrollToSection("resolution-card")}
                disabled={!issue}
              >
                {issue?.status === "resolved"
                  ? t("payments.reconciliation.reopen")
                  : t("payments.reconciliation.resolve")}
              </Btn>
            </div>
          }
        />

        <div className="pageBody">
          {error ? (
            <Banner
              theme={theme}
              tone="danger"
              icon="warn"
              title={locale === "zh" ? "操作失敗" : "Request failed"}
              body={error}
            />
          ) : null}

          {loading ? (
            <Card theme={theme} title={t("payments.loading")}>
              <div className="emptyState">{t("payments.loading")}</div>
            </Card>
          ) : null}

          {!loading && !issue ? (
            <Card
              theme={theme}
              title={issueId || t("payments.reconciliation.title")}
              subtitle={
                locale === "zh"
                  ? "找不到指定的 reconciliation issue。"
                  : "The requested reconciliation issue could not be found."
              }
            >
              <div className="emptyState">
                <Btn
                  theme={theme}
                  variant="primary"
                  onClick={() => router.push("/payments")}
                >
                  {locale === "zh" ? "回到結算治理" : "Go to payments"}
                </Btn>
              </div>
            </Card>
          ) : null}

          {!loading && issue ? (
            <>
              <div className="pillRow">
                <Pill theme={theme} tone={getStatusTone(issue.status)} dot>
                  {formatPlatformCodeLabel(locale, issue.status)}
                </Pill>
                <Pill theme={theme} tone={getSourceTone(issue.source)}>
                  {formatPlatformCodeLabel(locale, issue.source)}
                </Pill>
                <Pill theme={theme} tone="accent">
                  {describeChannel(t, issue.channelKey)}
                </Pill>
                {issue.reopenCount > 0 ? (
                  <Pill theme={theme} tone="danger">
                    {t("payments.reconciliation.reopenCount", {
                      count: String(issue.reopenCount),
                    })}
                  </Pill>
                ) : null}
              </div>

              <div className="contentGrid">
                <div className="contentColumn">
                  <Card
                    theme={theme}
                    title="Issue summary"
                    subtitle={issue.summary}
                  >
                    <div className="summaryMetricGrid">
                      <KPI
                        theme={theme}
                        label="STATUS"
                        value={formatPlatformCodeLabel(locale, issue.status)}
                        sub={formatPlatformCodeLabel(locale, issue.source)}
                        hint={describeChannel(t, issue.channelKey)}
                      />
                      <KPI
                        theme={theme}
                        label="OWNER"
                        value={textOrDash(issue.ownerId)}
                        sub={issue.openedBy}
                        hint={formatDateTime(issue.createdAt)}
                      />
                      <KPI
                        theme={theme}
                        label="EVIDENCE"
                        value={issue.evidenceArtifactIds.length}
                        delta={
                          issue.reopenCount > 0
                            ? t("payments.reconciliation.reopenCount", {
                                count: String(issue.reopenCount),
                              })
                            : undefined
                        }
                        deltaTone={issue.reopenCount > 0 ? "down" : "neutral"}
                        sub={t("payments.reconciliation.commentCount", {
                          count: String(issue.comments.length),
                        })}
                        hint={formatDateTime(issue.updatedAt)}
                      />
                    </div>

                    <DL
                      theme={theme}
                      cols={3}
                      items={[
                        {
                          k: "TYPE",
                          v: formatPlatformCodeLabel(locale, issue.issueType),
                          mono: true,
                        },
                        {
                          k: "CHANNEL",
                          v: describeChannel(t, issue.channelKey),
                        },
                        {
                          k: "OWNER",
                          v: textOrDash(issue.ownerId),
                          mono: true,
                        },
                        {
                          k: "EXTERNAL ORDER",
                          v: textOrDash(issue.externalOrderId ?? issue.orderId),
                          mono: true,
                        },
                        {
                          k: "MIRROR ORDER",
                          v: textOrDash(issue.mirrorOrderId),
                          mono: true,
                        },
                        {
                          k: "TENANT",
                          v: textOrDash(issue.tenantId),
                          mono: true,
                        },
                        {
                          k: "PARTNER PROGRAM",
                          v: textOrDash(issue.partnerProgramId),
                          mono: true,
                        },
                        {
                          k: "OPENED",
                          v: formatDateTime(issue.createdAt),
                          mono: true,
                        },
                        {
                          k: "EVIDENCE",
                          v: t("payments.reconciliation.evidenceCount", {
                            count: String(issue.evidenceArtifactIds.length),
                          }),
                        },
                      ]}
                    />

                    {evidenceRows.length > 0 ? (
                      <div className="inlineSection">
                        <div className="sectionLabel">ARTIFACT IDS</div>
                        <div className="artifactTable">
                          <Table
                            theme={theme}
                            dense
                            columns={[
                              {
                                h: "ARTIFACT ID",
                                k: "artifactId",
                                mono: true,
                              },
                            ]}
                            rows={evidenceRows}
                          />
                        </div>
                      </div>
                    ) : null}

                    {issue.forwardedFinanceContext ? (
                      <div className="cardNote">
                        <Banner
                          theme={theme}
                          tone="info"
                          icon="payments"
                          title={
                            locale === "zh"
                              ? "Forwarded finance context"
                              : "Forwarded finance context"
                          }
                          body={
                            buildForwarderContextSummary(issue, locale) ??
                            issue.forwardedFinanceContext.note ??
                            "—"
                          }
                        />
                      </div>
                    ) : null}
                  </Card>

                  <Card
                    theme={theme}
                    title="Timeline"
                    subtitle={t("common.immutableHistory")}
                  >
                    <Timeline
                      density="compact"
                      items={timelineItems}
                      emptyState={t("payments.reconciliation.empty")}
                    />
                  </Card>
                </div>

                <div className="contentColumn">
                  <Card
                    theme={theme}
                    title="Linked references"
                    subtitle={
                      locale === "zh"
                        ? "保留跨系統對帳、發票與報銷追蹤錨點。"
                        : "Cross-system anchors retained for audit and payout follow-up."
                    }
                  >
                    <DL
                      theme={theme}
                      cols={1}
                      items={[
                        {
                          k: "TENANT ID",
                          v: textOrDash(issue.tenantId),
                          mono: true,
                        },
                        {
                          k: "PARTNER ID",
                          v: textOrDash(issue.partnerId),
                          mono: true,
                        },
                        {
                          k: "PARTNER PROGRAM ID",
                          v: textOrDash(issue.partnerProgramId),
                          mono: true,
                        },
                        {
                          k: "SPONSOR REFERENCE",
                          v: textOrDash(issue.sponsorReference),
                          mono: true,
                        },
                        {
                          k: "MIRROR ORDER ID",
                          v: textOrDash(issue.mirrorOrderId),
                          mono: true,
                        },
                        {
                          k: "EXTERNAL ORDER ID",
                          v: textOrDash(issue.externalOrderId ?? issue.orderId),
                          mono: true,
                        },
                        {
                          k: "LINKED RECON JOB",
                          v: textOrDash(issue.linkedReconciliationJobId),
                          mono: true,
                        },
                        {
                          k: "LINKED INVOICE",
                          v: textOrDash(issue.linkedInvoiceId),
                          mono: true,
                        },
                        {
                          k: "REIMBURSEMENT BATCH",
                          v: textOrDash(issue.linkedReimbursementBatchId),
                          mono: true,
                        },
                      ]}
                    />
                  </Card>

                  <div id="resolution-card">
                    <Card
                      theme={theme}
                      title="Resolution"
                      subtitle={resolutionCardSubtitle}
                    >
                      {issue.status === "resolved" ? (
                        <div className="cardNote">
                          <Banner
                            theme={theme}
                            tone="success"
                            icon="check"
                            title={formatPlatformCodeLabel(
                              locale,
                              issue.resolutionCode ?? "resolved_other",
                            )}
                            body={issue.resolutionSummary ?? "—"}
                          />
                        </div>
                      ) : null}

                      <div className="fieldStack">
                        <div id="assignment-section" className="sectionBlock">
                          <div className="sectionLabel">OWNER ACTION</div>
                          <div className="fieldGrid">
                            <Field
                              theme={theme}
                              label={t("payments.reconciliation.actorId")}
                            >
                              <input
                                id="finance-actor-input"
                                value={financeActorId}
                                onChange={(event) =>
                                  setFinanceActorId(event.target.value)
                                }
                                style={controlStyle(theme)}
                              />
                            </Field>

                            <Field
                              theme={theme}
                              label={t("payments.reconciliation.assignee")}
                            >
                              <div className="splitField">
                                <input
                                  id="assignee-input"
                                  value={assigneeId}
                                  onChange={(event) =>
                                    setAssigneeId(event.target.value)
                                  }
                                  style={controlStyle(theme)}
                                />
                                <Btn
                                  theme={theme}
                                  variant="secondary"
                                  icon="copy"
                                  onClick={() => void handleAssignIssue()}
                                  disabled={actionPending !== null}
                                >
                                  {t("payments.reconciliation.assign")}
                                </Btn>
                              </div>
                            </Field>
                          </div>
                        </div>

                        <div id="evidence-section" className="sectionBlock">
                          <div className="sectionLabel">COMMENT / EVIDENCE</div>
                          <Field
                            theme={theme}
                            label={t("payments.reconciliation.comment")}
                            hint={t("payments.reconciliation.commentCount", {
                              count: String(issue.comments.length),
                            })}
                          >
                            <textarea
                              id="comment-message-input"
                              value={commentMessage}
                              onChange={(event) =>
                                setCommentMessage(event.target.value)
                              }
                              style={controlStyle(theme, true)}
                            />
                          </Field>

                          <Field
                            theme={theme}
                            label={t("payments.reconciliation.artifactIds")}
                            hint={t(
                              "payments.reconciliation.artifactPlaceholder",
                            )}
                          >
                            <input
                              id="comment-artifacts-input"
                              value={commentArtifactIds}
                              onChange={(event) =>
                                setCommentArtifactIds(event.target.value)
                              }
                              style={controlStyle(theme)}
                            />
                          </Field>

                          <div className="actionRow">
                            <Btn
                              theme={theme}
                              variant="secondary"
                              icon="plus"
                              onClick={() => void handleAddComment()}
                              disabled={actionPending !== null}
                            >
                              {t("payments.reconciliation.addComment")}
                            </Btn>
                          </div>
                        </div>

                        {issue.status !== "resolved" ? (
                          <div className="sectionBlock">
                            <div className="sectionLabel">RESOLUTION</div>
                            <Field
                              theme={theme}
                              label={t("payments.reconciliation.resolveCode")}
                              required
                            >
                              <select
                                id="resolution-code-select"
                                value={resolutionCode}
                                onChange={(event) =>
                                  setResolutionCode(
                                    event.target.value as ResolutionCodeValue,
                                  )
                                }
                                style={controlStyle(theme)}
                              >
                                <option value="">
                                  {t("payments.reconciliation.resolveCode")}
                                </option>
                                {RECONCILIATION_ISSUE_RESOLUTION_CODES.map(
                                  (code) => (
                                    <option key={code} value={code}>
                                      {formatPlatformCodeLabel(locale, code)}
                                    </option>
                                  ),
                                )}
                              </select>
                            </Field>

                            <Field
                              theme={theme}
                              label={t(
                                "payments.reconciliation.resolveSummary",
                              )}
                              required
                            >
                              <textarea
                                id="resolution-summary-input"
                                value={resolutionSummary}
                                onChange={(event) =>
                                  setResolutionSummary(event.target.value)
                                }
                                style={controlStyle(theme, true)}
                              />
                            </Field>

                            <Field
                              theme={theme}
                              label={t("payments.reconciliation.artifactIds")}
                              hint={t(
                                "payments.reconciliation.artifactPlaceholder",
                              )}
                            >
                              <input
                                id="resolution-artifacts-input"
                                value={resolutionArtifactIds}
                                onChange={(event) =>
                                  setResolutionArtifactIds(event.target.value)
                                }
                                style={controlStyle(theme)}
                              />
                            </Field>

                            <div className="actionRow">
                              <Btn
                                theme={theme}
                                variant="secondary"
                                onClick={() =>
                                  setResolutionSummary(issue.summary)
                                }
                                disabled={actionPending !== null}
                              >
                                {locale === "zh" ? "帶入摘要" : "Use summary"}
                              </Btn>
                              <Btn
                                theme={theme}
                                variant="primary"
                                icon="check"
                                onClick={() => void handleResolveIssue()}
                                disabled={actionPending !== null}
                              >
                                {t("payments.reconciliation.resolve")}
                              </Btn>
                            </div>
                          </div>
                        ) : (
                          <div className="sectionBlock">
                            <div className="sectionLabel">REOPEN</div>
                            <Field
                              theme={theme}
                              label={t("payments.reconciliation.reopenReason")}
                              required
                            >
                              <textarea
                                id="reopen-reason-input"
                                value={reopenReason}
                                onChange={(event) =>
                                  setReopenReason(event.target.value)
                                }
                                style={controlStyle(theme, true)}
                              />
                            </Field>

                            <Field
                              theme={theme}
                              label={t("payments.reconciliation.artifactIds")}
                              hint={t(
                                "payments.reconciliation.artifactPlaceholder",
                              )}
                            >
                              <input
                                id="reopen-artifacts-input"
                                value={reopenArtifactIds}
                                onChange={(event) =>
                                  setReopenArtifactIds(event.target.value)
                                }
                                style={controlStyle(theme)}
                              />
                            </Field>

                            <div className="actionRow">
                              <Btn
                                theme={theme}
                                variant="secondary"
                                icon="plus"
                                onClick={() => void handleReopenIssue()}
                                disabled={actionPending !== null}
                              >
                                {t("payments.reconciliation.reopen")}
                              </Btn>
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </Shell>

      <style jsx>{`
        .pageBody {
          padding: 24px;
          display: grid;
          gap: 16px;
        }

        .headerActions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }

        .pillRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .contentGrid {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr);
          gap: 16px;
          align-items: start;
        }

        .contentColumn {
          display: grid;
          gap: 16px;
          align-content: start;
        }

        .summaryMetricGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }

        .fieldStack {
          display: grid;
          gap: 0;
        }

        .sectionBlock + .sectionBlock {
          border-top: 1px solid ${theme.border};
          margin-top: 4px;
          padding-top: 16px;
        }

        .fieldGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .inlineSection {
          display: grid;
          gap: 8px;
          margin-top: 16px;
        }

        .sectionLabel {
          font-size: 10.5px;
          font-weight: 700;
          color: ${theme.textMuted};
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .artifactTable {
          overflow: hidden;
          border-radius: 8px;
          border: 1px solid ${theme.border};
        }

        .splitField {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
        }

        .actionRow {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 2px;
        }

        .cardNote {
          margin-top: 14px;
        }

        .artifactRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .emptyState {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 120px;
          color: ${theme.textMuted};
          font-size: 12.5px;
        }

        @media (max-width: 1080px) {
          .contentGrid {
            grid-template-columns: 1fr;
          }

          .summaryMetricGrid,
          .fieldGrid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .pageBody {
            padding: 16px;
          }

          .splitField {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
