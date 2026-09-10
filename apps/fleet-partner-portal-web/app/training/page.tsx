import Link from "next/link";
import {
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  type CanvasPillTone,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import {
  computeRosterTabCounts,
  filterRosterByTab,
  loadFleetDriverQuizAttempt,
  loadFleetTraining,
  scopeRosterRows,
} from "@/lib/academy-data.server";
import { BiLabel, DataSourceNotice } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import type { TrainingStatus } from "@drts/contracts";
import { mapTrainingStatusLabel, trTraining } from "./translations";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{
    tab?: string;
    q?: string;
    course?: string;
    attemptId?: string;
    driverId?: string;
  }>;
}

function mapStatusToTone(status: TrainingStatus): CanvasPillTone {
  switch (status) {
    case "passed":
      return "success";
    case "in_progress":
      return "warn";
    case "not_started":
      return "neutral";
    case "failed":
    case "expired":
      return "danger";
    default:
      return "neutral";
  }
}

export default async function FleetTrainingPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, summary, roster, source, error } = await loadFleetTraining();

  const activeTab = params.tab || "all";
  const scopedRoster = scopeRosterRows(roster, {
    q: params.q,
    course: params.course,
  });
  const filteredRoster = filterRosterByTab(scopedRoster, activeTab);
  const tabCounts = computeRosterTabCounts(scopedRoster);

  // If driver and attempt query params are provided, fetch attempt detail for verification evidence
  const attemptDetail =
    params.driverId && params.attemptId
      ? await loadFleetDriverQuizAttempt(params.driverId, params.attemptId)
      : null;

  const tabDefs = [
    { id: "all", label: trTraining("tabAll", locale), count: tabCounts.all },
    { id: "completed", label: trTraining("tabCompleted", locale), count: tabCounts.completed },
    { id: "pending", label: trTraining("tabPending", locale), count: tabCounts.pending },
    { id: "overdue", label: trTraining("tabOverdue", locale), count: tabCounts.overdue },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("training.title", locale)}
        subtitle={t("training.subtitle", locale)}
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <DataSourceNotice
          theme={theme}
          source={source}
          body={t("data.fixtureNotice", locale)}
        />

        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 6,
              background: theme.warnBg,
              border: `1px solid ${theme.warnBorder}`,
              color: theme.warn,
              fontSize: 13,
            }}
          >
            <span>{trTraining("connAlert", locale)}</span>
            <span>{error}</span>
          </div>
        )}

        {/* Top KPIs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <CanvasKPI
            theme={theme}
            label={t("training.kpi.completion", locale)}
            value={summary.completionPct}
          />
          <CanvasKPI
            theme={theme}
            label={t("training.kpi.pending", locale)}
            value={summary.pendingHeadcount}
          />
          <CanvasKPI
            theme={theme}
            label={t("training.kpi.overdue", locale)}
            value={String(summary.overdueIncomplete)}
            delta={t("training.kpi.overdueDelta", locale)}
            deltaTone={Number(summary.overdueIncomplete) > 0 ? "down" : "neutral"}
          />
        </div>

        {/* Authoritative Course Progress Cards */}
        <CanvasCard theme={theme} title={t("training.courses", locale)}>
          {rows.length === 0 ? (
            <div
              style={{
                color: theme.textMuted,
                fontSize: 13,
                padding: "12px 0",
                textAlign: "center",
              }}
            >
              {trTraining("noCourseStats", locale)}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {rows.map((c) => (
                <div key={c.en || c.course}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 6,
                    }}
                  >
                    <BiLabel
                      theme={theme}
                      locale={locale}
                      zh={c.course}
                      en={c.en}
                    />
                    <span
                      style={{
                        fontFamily: theme.monoFamily,
                        fontSize: 12,
                        color: theme.textMuted,
                      }}
                    >
                      {c.completed} / {c.total} · {c.pct}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      background: theme.surfaceLo,
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, c.pct))}%`,
                        height: "100%",
                        background:
                          c.pct >= 90
                            ? theme.success
                            : c.pct >= 70
                              ? theme.accent
                              : theme.warn,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CanvasCard>

        {/* Attempt Drilldown Detail Card (C071: 下鑽到單一人員證據) */}
        {attemptDetail && (
          <CanvasCard
            theme={theme}
            title={trTraining("attemptDetailTitle", locale)}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingBottom: 10,
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                <div>
                  <span style={{ color: theme.textMuted, marginRight: 8 }}>
                    {trTraining("driverIdLabel", locale)}
                  </span>
                  <span
                    style={{
                      fontFamily: theme.monoFamily,
                      fontWeight: 600,
                      color: theme.text,
                    }}
                  >
                    {attemptDetail.driverId}
                  </span>
                  <span
                    style={{
                      color: theme.textMuted,
                      marginLeft: 16,
                      marginRight: 8,
                    }}
                  >
                    {trTraining("attemptIdLabel", locale)}
                  </span>
                  <span
                    style={{
                      fontFamily: theme.monoFamily,
                      color: theme.textMuted,
                    }}
                  >
                    {attemptDetail.attemptId}
                  </span>
                </div>
                <Link
                  href={`/training${params.tab ? `?tab=${params.tab}` : ""}`}
                  style={{
                    textDecoration: "none",
                    fontSize: 12,
                    color: theme.accent,
                  }}
                >
                  {trTraining("closeEvidence", locale)}
                </Link>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 24,
                  alignItems: "center",
                }}
              >
                <div>
                  <span style={{ color: theme.textMuted }}>{trTraining("courseCodeLabel", locale)}</span>
                  <span style={{ fontWeight: 600, marginLeft: 4 }}>
                    {attemptDetail.courseId} (v{attemptDetail.courseVersion})
                  </span>
                </div>
                <div>
                  <span style={{ color: theme.textMuted }}>{trTraining("quizScoreLabel", locale)}</span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      marginLeft: 4,
                      color: attemptDetail.passed ? theme.success : theme.danger,
                    }}
                  >
                    {attemptDetail.score} {trTraining("ptsSuffix", locale)}
                  </span>
                </div>
                <div>
                  <span style={{ color: theme.textMuted }}>{trTraining("verdictLabel", locale)}</span>
                  <CanvasPill
                    theme={theme}
                    tone={attemptDetail.passed ? "success" : "danger"}
                  >
                    {attemptDetail.passed ? trTraining("passedVerdict", locale) : trTraining("failedVerdict", locale)}
                  </CanvasPill>
                </div>
                <div>
                  <span style={{ color: theme.textMuted }}>{trTraining("attemptTimeLabel", locale)}</span>
                  <span
                    style={{
                      fontFamily: theme.monoFamily,
                      fontSize: 12,
                      marginLeft: 4,
                    }}
                  >
                    {attemptDetail.attemptedAt}
                  </span>
                </div>
              </div>

              {attemptDetail.feedback && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 4,
                    background: theme.surfaceLo,
                    color: theme.textMuted,
                    fontSize: 12,
                  }}
                >
                  <span>{trTraining("feedbackLabel", locale)}</span>
                  <span>{attemptDetail.feedback}</span>
                </div>
              )}

              {/* Answers Breakdown */}
              {attemptDetail.answersSummary &&
                attemptDetail.answersSummary.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: theme.textMuted,
                        marginBottom: 6,
                      }}
                    >
                      {trTraining("answersDetailLabel", locale)}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {attemptDetail.answersSummary.map((ans, idx) => (
                        <div
                          key={ans.questionId}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: 4,
                            background: theme.surfaceLo,
                            border: `1px solid ${theme.border}`,
                          }}
                        >
                          <span style={{ fontFamily: theme.monoFamily }}>
                            Q{idx + 1}: {ans.questionId}
                          </span>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                color: theme.textMuted,
                                fontFamily: theme.monoFamily,
                              }}
                            >
                              <span>{trTraining("selectedOptionLabel", locale)}</span>
                              <span>{ans.selectedOptionId}</span>
                            </span>
                            <CanvasPill
                              theme={theme}
                              tone={ans.isCorrect ? "success" : "danger"}
                            >
                              {ans.isCorrect ? trTraining("correctVerdict", locale) : trTraining("incorrectVerdict", locale)}
                            </CanvasPill>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </CanvasCard>
        )}

        {/* Real Driver Training Roster Card (C071 / N02) */}
        <CanvasCard
          theme={theme}
          title={trTraining("rosterTitle", locale)}
        >
          {/* Navigation Tabs */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 12,
              borderBottom: `1px solid ${theme.border}`,
              paddingBottom: 10,
            }}
          >
            <div style={{ display: "flex", gap: 16 }}>
              {tabDefs.map((tab) => {
                const isSelected = activeTab === tab.id;
                const query = new URLSearchParams();
                if (tab.id !== "all") query.set("tab", tab.id);
                if (params.q) query.set("q", params.q);
                if (params.course) query.set("course", params.course);
                const href = query.toString()
                  ? `?${query.toString()}`
                  : "/training";

                return (
                  <Link
                    key={tab.id}
                    href={href}
                    style={{
                      textDecoration: "none",
                      color: isSelected ? theme.text : theme.textMuted,
                      fontWeight: isSelected ? 600 : 500,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      paddingBottom: 4,
                      borderBottom: isSelected
                        ? `2px solid ${theme.accent}`
                        : "2px solid transparent",
                    }}
                  >
                    <span>{tab.label}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: theme.monoFamily,
                        opacity: isSelected ? 1 : 0.7,
                      }}
                    >
                      {tab.count}
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* Filter Search Input */}
            <form
              method="get"
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              {activeTab !== "all" && (
                <input type="hidden" name="tab" value={activeTab} />
              )}
              <input
                type="text"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder={trTraining("searchPlaceholder", locale)}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: `1px solid ${theme.border}`,
                  background: theme.surfaceLo,
                  color: theme.text,
                  fontFamily: theme.fontFamily,
                  outline: "none",
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  color: theme.text,
                  cursor: "pointer",
                }}
              >
                {trTraining("searchBtn", locale)}
              </button>
            </form>
          </div>

          {/* Roster Table */}
          {filteredRoster.length === 0 ? (
            <div
              style={{
                color: theme.textMuted,
                fontSize: 13,
                padding: "24px 0",
                textAlign: "center",
              }}
            >
              {roster.length === 0
                ? trTraining("noRosterData", locale)
                : trTraining("noRosterMatch", locale)}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: `1px solid ${theme.border}`,
                      color: theme.textMuted,
                      textAlign: "left",
                    }}
                  >
                    <th style={{ padding: "8px 12px" }}>{trTraining("colDriver", locale)}</th>
                    <th style={{ padding: "8px 12px" }}>{trTraining("colCourse", locale)}</th>
                    <th style={{ padding: "8px 12px" }}>{trTraining("colStatus", locale)}</th>
                    <th style={{ padding: "8px 12px" }}>{trTraining("colScore", locale)}</th>
                    <th style={{ padding: "8px 12px" }}>{trTraining("colCompletedAt", locale)}</th>
                    <th style={{ padding: "8px 12px" }}>{trTraining("colTag", locale)}</th>
                    <th style={{ padding: "8px 12px" }}>{trTraining("colHistory", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.map((item) => (
                    <tr
                      key={`${item.driverId}_${item.courseCode}`}
                      style={{
                        borderBottom: `1px solid ${theme.border}`,
                      }}
                    >
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 600 }}>{item.driverName}</div>
                        <div
                          style={{
                            fontSize: 11,
                            fontFamily: theme.monoFamily,
                            color: theme.textMuted,
                          }}
                        >
                          {item.driverId}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontFamily: theme.monoFamily,
                        }}
                      >
                        {item.courseCode}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <CanvasPill
                          theme={theme}
                          tone={mapStatusToTone(item.status)}
                        >
                          {mapTrainingStatusLabel(item.status, locale)}
                        </CanvasPill>
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontFamily: theme.monoFamily,
                          fontWeight: item.score !== null ? 600 : 400,
                          color:
                            item.score !== null && item.score >= 80
                              ? theme.success
                              : item.score !== null
                                ? theme.warn
                                : theme.textMuted,
                        }}
                      >
                        {item.score !== null ? `${item.score} ${trTraining("ptsSuffix", locale)}` : "—"}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontFamily: theme.monoFamily,
                          fontSize: 12,
                          color: item.completedAt
                            ? theme.text
                            : theme.textMuted,
                        }}
                      >
                        {item.completedAt
                          ? new Date(item.completedAt).toLocaleString("zh-TW")
                          : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {item.isOverdue ? (
                          <CanvasPill theme={theme} tone="danger" dot>
                            {trTraining("overdueRetrain", locale)}
                          </CanvasPill>
                        ) : (
                          <span
                            style={{ fontSize: 12, color: theme.textMuted }}
                          >
                            {trTraining("statusNormal", locale)}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {item.latestAttemptId ? (
                          <Link
                            href={`/training?tab=${activeTab}&driverId=${encodeURIComponent(
                              item.driverId,
                            )}&attemptId=${encodeURIComponent(
                              item.latestAttemptId,
                            )}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`}
                            style={{
                              textDecoration: "none",
                              fontSize: 12,
                              color: theme.accent,
                              fontFamily: theme.monoFamily,
                            }}
                          >
                            {trTraining("viewHistory", locale)}
                          </Link>
                        ) : (
                          <span
                            style={{
                              fontSize: 12,
                              color: theme.textMuted,
                            }}
                          >
                            {trTraining("notAttempted", locale)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CanvasCard>
      </div>
    </>
  );
}
