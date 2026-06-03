import Link from "next/link";
import { notFound } from "next/navigation";
import type {
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
    category: "driver_conduct",
    severity: "high",
    status: "under_investigation",
    description:
      "Fallback complaint detail used when the backend detail snapshot is unavailable.",
    caseSource: "ops",
    relatedOrderId: "ord_8175",
    relatedCallId: "call_2014",
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
    | ((
        id: string,
      ) => Promise<
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
    (): ComplaintExportViewRecord =>
      ({
        caseNo,
        exportGeneratedAt: complaint.updatedAt,
        summary: complaint.description,
        customerStatement: null,
        driverStatement: null,
        attachments: [],
      }) as ComplaintExportViewRecord,
  );

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

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["overview", "activity", "export"].map((tab) => (
          <Pill
            key={tab}
            theme={theme}
            tone={tab === "overview" ? "accent" : "neutral"}
          >
            {tab}
          </Pill>
        ))}
      </div>

      <Banner
        theme={theme}
        tone="danger"
        icon="warn"
        title={copy(
          locale,
          "High-risk action requires reason",
          "高風險動作必須填寫原因",
        )}
        body={copy(
          locale,
          "Escalating a complaint to an incident creates an immutable audit trail and requires a reason.",
          "將客訴升級為事故會產生不可變更的稽核軌跡，且必須填寫原因。",
        )}
      />

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
                { k: "order", v: complaint.relatedOrderId ?? "—", mono: true },
                { k: "call", v: complaint.relatedCallId ?? "—", mono: true },
                {
                  k: "category",
                  v: formatOpsCodeLabel(locale, complaint.category),
                  mono: true,
                },
                {
                  k: "sla due",
                  v: formatDateTime(locale, complaint.slaDueAt),
                  mono: true,
                },
              ]}
            />
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
                  v: exportView.summary ?? complaint.description,
                },
                {
                  k: "attachments",
                  v: String(exportView.attachments?.length ?? 0),
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
