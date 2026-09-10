import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasIcon,
  CanvasEmptyState,
  CanvasBtn,
} from "@drts/ui-web";
import { FleetActionButton } from "@/components/fleet-action-button";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import {
  loadCaseDetail,
  type FleetCaseTimelineEvent,
  type FleetCaseTimelineAttachment,
} from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { CaseReplyComposer } from "./case-reply-composer";

export const dynamic = "force-dynamic";

interface CaseDetailPageProps {
  params: Promise<{ caseId: string }>;
}

function TimelineList({
  events,
  theme,
}: {
  events: FleetCaseTimelineEvent[];
  theme: ReturnType<typeof buildFleetTheme>;
}) {
  if (!events || events.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <CanvasEmptyState
          theme={theme}
          tone="neutral"
          title="歷程 · 空歷程"
          body="案件剛建立，尚無歷程事件；這是合法的空狀態。"
        />
      </div>
    );
  }

  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {events.map((e, i) => {
        const toneColor =
          e.tone === "success"
            ? theme.success
            : e.tone === "danger"
            ? theme.danger
            : e.tone === "warn"
            ? theme.warn
            : theme.accent;
        const toneBg =
          e.tone === "success"
            ? theme.successBg
            : e.tone === "danger"
            ? theme.dangerBg
            : e.tone === "warn"
            ? theme.warnBg
            : theme.accentBg;

        return (
          <li
            key={i}
            style={{ display: "flex", gap: 12, position: "relative" }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 14,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  marginTop: 6,
                  flexShrink: 0,
                  background: toneColor,
                  boxShadow: `0 0 0 3px ${toneBg}`,
                }}
              />
              {i < events.length - 1 && (
                <span
                  style={{
                    flex: 1,
                    width: 1,
                    background: theme.border,
                    margin: "4px 0",
                  }}
                />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: theme.text,
                  }}
                >
                  {e.t}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    color: theme.textDim,
                    fontFamily: theme.monoFamily,
                    whiteSpace: "nowrap",
                  }}
                >
                  {e.at}
                </span>
              </div>
              {e.actor && (
                <div
                  style={{
                    fontSize: 11,
                    color: theme.textMuted,
                    marginTop: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {e.actorRealm && (
                    <CanvasPill
                      theme={theme}
                      tone={
                        e.actorRealm === "tenant"
                          ? "accent"
                          : e.actorRealm === "ops"
                          ? "info"
                          : "neutral"
                      }
                    >
                      {e.actorRealm}
                    </CanvasPill>
                  )}
                  <span>{e.actor}</span>
                </div>
              )}
              {e.body && (
                <div
                  style={{
                    fontSize: 12,
                    color: theme.text,
                    marginTop: 4,
                    lineHeight: 1.45,
                  }}
                >
                  {e.body}
                </div>
              )}
              {e.attachments && e.attachments.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 6,
                  }}
                >
                  {e.attachments.map(
                    (f: FleetCaseTimelineAttachment, fi: number) => (
                      <span
                        key={fi}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "3px 8px",
                          borderRadius: 6,
                          border: `1px solid ${theme.border}`,
                          background: theme.surfaceLo,
                          fontSize: 10.5,
                          color: theme.textMuted,
                        }}
                      >
                        <CanvasIcon
                          name="audit"
                          size={11}
                          style={{ flexShrink: 0 }}
                        />
                        {f.name}{" "}
                        <span
                          style={{
                            fontFamily: theme.monoFamily,
                            color: theme.textDim,
                          }}
                        >
                          · {f.size}
                        </span>
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default async function FleetCaseDetailPage({
  params,
}: CaseDetailPageProps) {
  const { caseId } = await params;
  const theme = buildFleetTheme();

  let detailResult;
  try {
    detailResult = await loadCaseDetail(caseId);
  } catch (err: any) {
    if (err?.message?.includes("CASE_NOT_FLEET_SCOPED")) {
      return (
        <div style={{ padding: 24 }}>
          <CanvasEmptyState
            theme={theme}
            tone="danger"
            title="非本車行案件 · CASE_NOT_FLEET_SCOPED"
            body="依 API 授權規則隱藏，不可存取。"
            action={
              <Link
                href="/cases"
                style={{
                  color: theme.accent,
                  fontSize: 13,
                  textDecoration: "underline",
                }}
              >
                ← 返回事故 / 申訴列表
              </Link>
            }
          />
        </div>
      );
    }
    notFound();
  }

  const { caseDetail: c, timeline, attachments, source, error } = detailResult;

  if (!c) {
    notFound();
  }

  const isClosed = c.status === "closed";
  const isPlatform = c.responsibility === "platform";
  const status = isClosed ? "closed" : c.status;

  return (
    <>
      <div
        style={{
          padding: "16px 24px 0",
          fontSize: 12,
          color: theme.textMuted,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <Link
          href="/cases"
          style={{ color: theme.accent, textDecoration: "none" }}
        >
          事故 / 申訴
        </Link>
        <span style={{ color: theme.textDim }}>/</span>
        <span style={{ color: theme.text }}>{c.id}</span>
      </div>

      <CanvasPageHeader
        theme={theme}
        title={
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span>{c.id}</span>
            <CanvasPill
              theme={theme}
              tone={c.type === "incident" ? "danger" : "warn"}
            >
              {c.type}
            </CanvasPill>
            <CanvasPill
              theme={theme}
              tone={isClosed ? "neutral" : (c.slaTone as any)}
              dot
            >
              {isClosed ? "closed" : c.slaLabel}
            </CanvasPill>
            <CanvasPill theme={theme} tone="danger">
              {c.severity}
            </CanvasPill>
            <CanvasPill
              theme={theme}
              tone={isPlatform ? "neutral" : "danger"}
            >
              責任歸屬 · {c.responsibility}
            </CanvasPill>
          </span>
        }
        subtitle={`${c.cat} · ${c.desc}`}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <FleetActionButton
              descriptor={{
                action: "export",
                enabled: true,
                riskLevel: "low",
              }}
              icon="reports"
              label="匯出案件"
              en="export"
            />
            <FleetActionButton
              descriptor={{
                action: "respond",
                enabled: !isPlatform && !isClosed,
                ...(isPlatform
                  ? { disabledReasonCode: "platform_owned" }
                  : isClosed
                  ? { disabledReasonCode: "case_closed" }
                  : {}),
                riskLevel: "medium",
              }}
              icon="check"
              label="送出回覆"
              en="respond"
            />
          </div>
        }
      />

      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/cases"
            style={{
              color: theme.accent,
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              textDecoration: "none",
            }}
          >
            ← 返回事故 / 申訴列表
          </Link>
          <span style={{ color: theme.textDim }}>|</span>
          <Link
            href="/cases/errors"
            style={{
              color: theme.textMuted,
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            案件錯誤指引
          </Link>
          <span style={{ color: theme.textDim }}>|</span>
          <Link
            href="/cases/access-states"
            style={{
              color: theme.textMuted,
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            附件/歷程讀取狀態
          </Link>
        </div>

        <DataSourceNotice
          theme={theme}
          source={source}
          body="目前顯示設計範例資料 (fixture)"
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 16,
          }}
        >
          {/* Left Column: Summary & Timeline */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <CanvasBanner
              theme={theme}
              tone="info"
              icon="lock"
              title="車行可見範圍 · fleet-scoped"
              body="僅顯示本車行旗下司機 / 車輛的案件；他車行案件依 API 授權隱藏，不在前端過濾。責任歸屬 platform 的案件維持可見，但唯讀、回覆停用 — 見下方 variant='platform' 範例。Ops 始終保留案件 owner。"
            />

            <CanvasCard theme={theme} title="案件摘要 · Case summary">
              <CanvasDL
                theme={theme}
                cols={3}
                items={[
                  { k: "CASE", v: c.id, mono: true },
                  {
                    k: "TYPE",
                    v: (
                      <CanvasPill
                        theme={theme}
                        tone={c.type === "incident" ? "danger" : "warn"}
                      >
                        {c.type}
                      </CanvasPill>
                    ),
                  },
                  { k: "OPENED", v: c.openedAt, mono: true },
                  { k: "CATEGORY", v: c.cat, mono: true },
                  { k: "SEVERITY", v: c.severity, mono: true },
                  {
                    k: "責任歸屬",
                    v: (
                      <CanvasPill
                        theme={theme}
                        tone={isPlatform ? "neutral" : "danger"}
                        dot
                      >
                        {c.responsibility}
                      </CanvasPill>
                    ),
                  },
                  {
                    k: "STATUS · API-owned",
                    v: (
                      <CanvasPill
                        theme={theme}
                        tone={status === "closed" ? "neutral" : "info"}
                        dot
                      >
                        {status}
                      </CanvasPill>
                    ),
                  },
                  {
                    k: "SLA STATUS",
                    v: c.slaBreachedAt ? "breached" : "on_track",
                    mono: true,
                  },
                  { k: "SLA DUE AT", v: c.slaDueAt, mono: true },
                  {
                    k: "SLA BREACHED AT",
                    v: c.slaBreachedAt || "—",
                    mono: true,
                  },
                  { k: "REOPENS", v: `${c.reopenCount} 次` },
                  {
                    k: "司機",
                    v: `${c.driver} (${c.driverId})`,
                    mono: true,
                  },
                  { k: "ASSIGNEE · Ops", v: c.assignee },
                  {
                    k: "RELATED ORDER",
                    v: (
                      <span style={{ color: theme.accent }}>
                        {c.relatedOrder} →
                      </span>
                    ),
                  },
                  {
                    k: "RELATED CALL",
                    v: c.relatedCall ? (
                      <span style={{ color: theme.accent }}>
                        {c.relatedCall} →
                      </span>
                    ) : (
                      "—"
                    ),
                  },
                ]}
              />
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="歷程 Timeline · cross-actor"
              subtitle="車行僅可見與本案相關、對車行揭露的事件 · 讀取失敗 / 空歷程見 case-access-states"
            >
              {error ? (
                <CanvasEmptyState
                  theme={theme}
                  tone="warn"
                  title="歷程 · 讀取失敗"
                  body="歷程服務暫時無法回應，Ops owner 資訊仍保留於案件摘要。"
                  action={
                    <CanvasBtn theme={theme} size="xs" icon="refresh">
                      重新整理
                    </CanvasBtn>
                  }
                />
              ) : (
                <TimelineList events={timeline} theme={theme} />
              )}
            </CanvasCard>
          </div>

          {/* Right Column: Reply Composer & Linked Entities */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <CaseReplyComposer
              caseDetail={c}
              initialAttachments={attachments}
            />

            <CanvasCard theme={theme} title="Linked entities">
              <CanvasDL
                theme={theme}
                cols={1}
                items={[
                  { k: "RELATED ORDER", v: c.relatedOrder, mono: true },
                  {
                    k: "RELATED CALL SESSION",
                    v: c.relatedCall || "—",
                    mono: true,
                  },
                  { k: "RELATED INCIDENT", v: "— (未升級)" },
                  {
                    k: "DRIVER",
                    v: `${c.driverId} ${c.driver}`,
                    mono: true,
                  },
                  {
                    k: "FLEET PARTNER",
                    v: c.fleetPartnerId || "METRO_FLEET",
                    mono: true,
                  },
                ]}
              />
            </CanvasCard>
          </div>
        </div>
      </div>
    </>
  );
}
