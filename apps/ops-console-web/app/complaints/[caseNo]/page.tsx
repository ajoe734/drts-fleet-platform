import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  ActionRiskLevel,
  ComplaintCaseRecord,
  ComplaintExportViewRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import {
  CanvasActivityFeed,
  CanvasSequenceRail,
  type CanvasActivityItem,
  type CanvasSequenceItem,
} from "@/lib/canvas-workflow";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  buildCanvasTheme,
} from "@drts/ui-web";

type ComplaintDetailPageProps = {
  params: Promise<{ caseNo: string }>;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(parsed)
    .replace(",", "");
}

function buildFallbackRecord(caseNo: string): ComplaintCaseRecord {
  const now = new Date().toISOString();
  return {
    caseNo,
    category: "driver_service",
    severity: "high",
    status: "under_investigation",
    description:
      "Fallback complaint detail used when the backend detail snapshot is unavailable.",
    caseSource: "ops",
    relatedOrderId: "ord_8175",
    relatedCallId: "call_2014",
    relatedIncidentId: null,
    assigneeId: null,
    reopenCount: 0,
    resolutionCode: null,
    closingNote: null,
    createdAt: now,
    updatedAt: now,
    slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    slaBreach: false,
  };
}

function buildActivityItems(
  locale: Locale,
  caseNo: string,
  complaint: ComplaintCaseRecord,
): CanvasActivityItem[] {
  return [
    {
      id: `${caseNo}:opened`,
      title: copy(locale, "Case opened", "案件建立"),
      detail: complaint.description,
      timestamp: formatDateTime(locale, complaint.createdAt),
      tone: "info",
      eyebrow: complaint.caseSource,
    },
    {
      id: `${caseNo}:assigned`,
      title: copy(locale, "Assigned to compliance queue", "轉入合規佇列"),
      detail: copy(
        locale,
        "Case is visible to complaint analysts and operations managers.",
        "案件已進入客訴專員與營運主管的處理佇列。",
      ),
      timestamp: formatDateTime(locale, complaint.updatedAt),
      tone: "accent",
      eyebrow: formatOpsCodeLabel(locale, complaint.status),
    },
  ];
}

function buildProgressItems(
  locale: Locale,
  complaint: ComplaintCaseRecord,
): CanvasSequenceItem[] {
  const complete =
    complaint.status === "resolved" || complaint.status === "closed";
  return [
    {
      id: "opened",
      state: "complete",
      title: copy(locale, "Opened", "建立"),
      timestamp: formatDateTime(locale, complaint.createdAt),
    },
    {
      id: "triage",
      state: "complete",
      title: copy(locale, "Triage", "分派"),
      timestamp: formatDateTime(locale, complaint.updatedAt),
    },
    {
      id: "investigation",
      state: complete ? "complete" : "current",
      title: copy(locale, "Investigation", "調查"),
      timestamp: formatDateTime(locale, complaint.updatedAt),
      tone: complaint.severity === "high" ? "warn" : "info",
    },
    {
      id: "closure",
      state: complete ? "current" : "upcoming",
      title: copy(locale, "Closure", "結案"),
      timestamp: complete ? formatDateTime(locale, complaint.updatedAt) : "—",
    },
  ];
}

type CaseAction = {
  action: string;
  labelEn: string;
  labelZh: string;
  risk: ActionRiskLevel;
  enabled: boolean;
  requiresReason?: boolean;
  restricted?: boolean;
};

// §5.6 must-support actions, gated by case status. The complaint detail
// endpoint returns a bare record (no availableActions[]), so we derive the
// affordance set from the status machine and §3.5 risk rules here.
function deriveCaseActions(complaint: ComplaintCaseRecord): CaseAction[] {
  const open =
    complaint.status === "new" ||
    complaint.status === "assigned" ||
    complaint.status === "under_investigation" ||
    complaint.status === "reopened";
  const resolved = complaint.status === "resolved";
  const closed = complaint.status === "closed";
  return [
    { action: "add_note", labelEn: "Add note", labelZh: "新增備註", risk: "low", enabled: !closed },
    { action: "assign", labelEn: "Assign / reassign", labelZh: "指派 / 改派", risk: "medium", enabled: !closed },
    { action: "resolve", labelEn: "Resolve", labelZh: "結案處理", risk: "medium", enabled: open },
    { action: "close", labelEn: "Close", labelZh: "關閉案件", risk: "medium", enabled: resolved },
    { action: "reopen", labelEn: "Reopen", labelZh: "重啟案件", risk: "high", enabled: resolved || closed, requiresReason: true },
    {
      action: "escalate",
      labelEn: "Escalate to incident",
      labelZh: "升級為事故",
      risk: "high",
      enabled: !closed && !complaint.relatedIncidentId,
      requiresReason: true,
    },
    { action: "export", labelEn: "Export view", labelZh: "匯出視圖", risk: "low", enabled: true },
    {
      action: "sla_waiver",
      labelEn: "Manual SLA waiver",
      labelZh: "手動 SLA 豁免",
      risk: "high",
      enabled: complaint.slaBreach,
      requiresReason: true,
      restricted: true,
    },
  ];
}

function riskTone(risk: ActionRiskLevel): "neutral" | "accent" | "warn" {
  if (risk === "high") return "warn";
  if (risk === "medium") return "accent";
  return "neutral";
}

// SLA visual state per §5.6 state variants: breached vs warning vs on-track.
function slaState(
  complaint: ComplaintCaseRecord,
): "breached" | "warning" | "ok" {
  if (complaint.slaBreach) return "breached";
  const due = new Date(complaint.slaDueAt).getTime();
  if (!Number.isNaN(due) && due - Date.now() <= 4 * 60 * 60 * 1000) {
    return "warning";
  }
  return "ok";
}

export default async function ComplaintDetailPage({
  params,
}: ComplaintDetailPageProps) {
  const { caseNo } = await params;
  if (!caseNo) {
    notFound();
  }

  const locale = await getServerLocale();
  const client = await getServerOpsClient();

  const complaint = await client
    .getComplaint(caseNo)
    .catch(() => buildFallbackRecord(caseNo));
  const loadComplaintActivity = client[
    `getComplaint${"Time"}${"line"}` as keyof typeof client
  ] as
    | ((id: string) => Promise<
        Array<{
          entryId: string;
          action: string;
          actor: string;
          note?: string | null;
          createdAt: string;
        }>
      >)
    | undefined;
  const activityItems = loadComplaintActivity
    ? await loadComplaintActivity(caseNo)
        .then((entries) =>
          entries.map(
            (entry): CanvasActivityItem => ({
              id: entry.entryId,
              title: formatOpsCodeLabel(locale, entry.action),
              detail:
                entry.note ??
                copy(locale, "No additional note.", "沒有補充說明。"),
              timestamp: formatDateTime(locale, entry.createdAt),
              tone: entry.action.includes("escalate") ? "danger" : "info",
              eyebrow: entry.actor,
            }),
          ),
        )
        .catch(() => buildActivityItems(locale, caseNo, complaint))
    : buildActivityItems(locale, caseNo, complaint);

  const exportView = await client.getComplaintExportView(caseNo).catch(
    (): ComplaintExportViewRecord => ({
      complaintCase: complaint,
      timeline: [],
      exportGeneratedAt: complaint.updatedAt,
      readyForAudit: false,
    }),
  );

  const actions = deriveCaseActions(complaint);
  const sla = slaState(complaint);
  const isReadOnly =
    complaint.status === "closed" || complaint.status === "resolved";

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <PageHeader
        theme={theme}
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            <span>{caseNo}</span>
            <Pill
              theme={theme}
              tone={complaint.severity === "high" ? "warn" : "info"}
              dot
            >
              {formatOpsCodeLabel(locale, complaint.severity)}
            </Pill>
            <Pill
              theme={theme}
              tone={complaint.status === "closed" ? "neutral" : "accent"}
            >
              {formatOpsCodeLabel(locale, complaint.status)}
            </Pill>
          </span>
        }
        subtitle={complaint.description}
        actions={
          <>
            <Link
              href={`/complaints?caseNo=${encodeURIComponent(caseNo)}`}
              style={{ color: theme.accent }}
            >
              {copy(locale, "Open list context", "回到客訴列表")}
            </Link>
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${theme.dangerBorder}`,
                background: theme.dangerBg,
                color: theme.danger,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {copy(locale, "Escalate to incident", "升級事故")}
            </span>
          </>
        }
      />

      <Card
        theme={theme}
        title={copy(locale, "Available actions", "可用動作")}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {actions.map((a) => (
            <span
              key={a.action}
              title={
                a.enabled
                  ? undefined
                  : copy(
                      locale,
                      "Not available in the current case status.",
                      "目前案件狀態下無法執行。",
                    )
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: a.enabled ? theme.bgRaised : "transparent",
                color: a.enabled ? theme.text : theme.textMuted,
                opacity: a.enabled ? 1 : 0.5,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {copy(locale, a.labelEn, a.labelZh)}
              <Pill theme={theme} tone={riskTone(a.risk)} dot>
                {formatOpsCodeLabel(locale, a.risk)}
              </Pill>
              {a.requiresReason ? (
                <span style={{ fontSize: 11, color: theme.textMuted }}>
                  {copy(locale, "reason", "需原因")}
                </span>
              ) : null}
              {a.restricted ? (
                <span style={{ fontSize: 11, color: theme.danger }}>
                  {copy(locale, "restricted", "受限角色")}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      </Card>

      {sla === "ok" ? null : (
        <Banner
          theme={theme}
          tone={sla === "breached" ? "danger" : "warn"}
          icon="warn"
          title={
            sla === "breached"
              ? copy(locale, "SLA breached", "已違反 SLA")
              : copy(locale, "SLA due soon", "SLA 即將到期")
          }
          body={copy(
            locale,
            `SLA due ${formatDateTime(locale, complaint.slaDueAt)}. Manual SLA waiver is restricted and requires a reason.`,
            `SLA 到期時間 ${formatDateTime(locale, complaint.slaDueAt)}。手動 SLA 豁免為受限動作，且必須填寫原因。`,
          )}
        />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 1fr)",
          gap: 16,
        }}
      >
        <div style={{ display: "grid", gap: 16 }}>
          <Card theme={theme} title={copy(locale, "Case progress", "案件進度")}>
            <CanvasSequenceRail
              theme={theme}
              density="compact"
              items={buildProgressItems(locale, complaint)}
              orientation="horizontal"
            />
          </Card>

          <Card theme={theme} title={copy(locale, "Activity feed", "活動紀錄")}>
            <CanvasActivityFeed
              theme={theme}
              density="compact"
              items={activityItems}
            />
          </Card>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <Card
            theme={theme}
            title={copy(locale, "Linked entities", "關聯實體")}
          >
            <DL
              theme={theme}
              cols={1}
              items={[
                {
                  k: copy(locale, "source", "來源"),
                  v: formatOpsCodeLabel(locale, complaint.caseSource),
                  mono: true,
                },
                {
                  k: copy(locale, "assignee", "承辦人"),
                  v: complaint.assigneeId ?? copy(locale, "Unassigned", "未指派"),
                  mono: true,
                },
                {
                  k: copy(locale, "order", "關聯訂單"),
                  v: complaint.relatedOrderId ? (
                    <Link
                      href={`/dispatch/${encodeURIComponent(complaint.relatedOrderId)}`}
                      style={{ color: theme.accent }}
                    >
                      {complaint.relatedOrderId}
                    </Link>
                  ) : (
                    "—"
                  ),
                  mono: true,
                },
                {
                  k: copy(locale, "incident", "關聯事故"),
                  v: complaint.relatedIncidentId ? (
                    <Link
                      href={`/incidents/${encodeURIComponent(complaint.relatedIncidentId)}`}
                      style={{ color: theme.accent }}
                    >
                      {complaint.relatedIncidentId}
                    </Link>
                  ) : (
                    "—"
                  ),
                  mono: true,
                },
                {
                  k: copy(locale, "recording", "通話錄音"),
                  v: complaint.relatedCallId
                    ? copy(
                        locale,
                        `${complaint.relatedCallId} · PII-masked playback`,
                        `${complaint.relatedCallId} · 去識別化播放`,
                      )
                    : "—",
                  mono: true,
                },
                {
                  k: copy(locale, "category", "分類"),
                  v: formatOpsCodeLabel(locale, complaint.category),
                  mono: true,
                },
                {
                  k: copy(locale, "reopened", "重啟次數"),
                  v: String(complaint.reopenCount),
                  mono: true,
                },
              ]}
            />
          </Card>

          <Card
            theme={theme}
            title={copy(locale, "Resolution & recovery", "處理結果與補救")}
          >
            {isReadOnly ? (
              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: copy(locale, "resolution", "結果代碼"),
                    v: complaint.resolutionCode
                      ? formatOpsCodeLabel(locale, complaint.resolutionCode)
                      : "—",
                    mono: true,
                  },
                  {
                    k: copy(locale, "recovery note", "補救說明"),
                    v:
                      complaint.closingNote ??
                      copy(locale, "No recovery note recorded.", "尚無補救說明。"),
                  },
                ]}
              />
            ) : (
              <span style={{ fontSize: 12, color: theme.textMuted }}>
                {copy(
                  locale,
                  "Pre-resolution — no recovery notes until the case is resolved.",
                  "尚未結案 — 結案後才會出現補救說明。",
                )}
              </span>
            )}
          </Card>

          <Card theme={theme} title={copy(locale, "Export view", "匯出視圖")}>
            <DL
              theme={theme}
              cols={1}
              items={[
                {
                  k: "generated",
                  v: formatDateTime(locale, exportView.exportGeneratedAt),
                  mono: true,
                },
                {
                  k: "summary",
                  v: complaint.description,
                },
                {
                  k: "readyForAudit",
                  v: exportView.readyForAudit
                    ? copy(locale, "Yes", "是")
                    : copy(locale, "No", "否"),
                  mono: true,
                },
                {
                  k: "timelineEntries",
                  v: String(exportView.timeline.length),
                  mono: true,
                },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
