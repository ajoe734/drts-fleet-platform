"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  REFERRAL_MONTHLY_COACHING_THRESHOLD,
  REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS,
  REFERRAL_MONTHLY_TERMINATION_THRESHOLD,
  type RecordReferralMonthlyGovernanceOutcomeCommand,
  type ReferralMonthlyGovernanceOutcome,
  type ReferralMonthlyGovernanceRuleType,
  type ReferralMonthlyRatingGovernanceRecord,
  type ReferralMonthlyRatingGovernanceReport,
  type ReferralMonthlyRatingReport,
} from "@drts/contracts";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";

function currentTaipeiMonth() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`;
}

export function ReferralMonthlyRatings() {
  const client = usePlatformAdminClient();
  const { t } = useTranslation();
  const [month, setMonth] = useState(currentTaipeiMonth);
  const [driverId, setDriverId] = useState("");
  const [report, setReport] = useState<ReferralMonthlyRatingReport | null>(
    null,
  );
  const [governance, setGovernance] =
    useState<ReferralMonthlyRatingGovernanceReport | null>(null);
  const [savedRecordsByKey, setSavedRecordsByKey] = useState<
    Record<string, ReferralMonthlyRatingGovernanceRecord>
  >({});
  const [draftOutcomes, setDraftOutcomes] = useState<
    Record<string, ReferralMonthlyGovernanceOutcome>
  >({});
  const [draftReasons, setDraftReasons] = useState<Record<string, string>>({});
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [governanceLoading, setGovernanceLoading] = useState(false);
  const [submittingRecordKey, setSubmittingRecordKey] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<{ message: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function load() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setReport(null);
    setGovernance(null);
    setSavedRecordsByKey({});
    setGovernanceError(null);
    setError(null);
    const query = new URLSearchParams({ periodMonth: month });
    if (driverId.trim()) query.set("driverId", driverId.trim());
    try {
      const envelope = await client.getEnvelope<ReferralMonthlyRatingReport>(
        `/api/reports/referral-monthly-ratings?${query}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setReport(envelope.data);
        if (envelope.data.governance) {
          setGovernance(envelope.data.governance);
          const nextSaved: Record<
            string,
            ReferralMonthlyRatingGovernanceRecord
          > = {};
          for (const rec of envelope.data.governance.records) {
            nextSaved[`${rec.driverId}::${rec.periodMonth}::${rec.ruleType}`] =
              rec;
          }
          setSavedRecordsByKey(nextSaved);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setError({ message: error instanceof Error ? error.message : null });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  async function loadGovernance() {
    setGovernanceLoading(true);
    setGovernanceError(null);
    const query = new URLSearchParams({ periodMonth: month });
    if (driverId.trim()) query.set("driverId", driverId.trim());
    try {
      const envelope =
        await client.getEnvelope<ReferralMonthlyRatingGovernanceReport>(
          `/api/reports/referral-monthly-ratings/governance?${query}`,
        );
      setGovernance(envelope.data);
      const nextSaved: Record<string, ReferralMonthlyRatingGovernanceRecord> =
        {};
      for (const rec of envelope.data.records) {
        nextSaved[`${rec.driverId}::${rec.periodMonth}::${rec.ruleType}`] = rec;
      }
      setSavedRecordsByKey((prev) => ({ ...prev, ...nextSaved }));
    } catch (err) {
      setGovernanceError(
        err instanceof Error
          ? err.message
          : t("referralMonthly.governanceLoadFailed"),
      );
    } finally {
      setGovernanceLoading(false);
    }
  }

  function buildDisplayedGovernanceRecords(
    currentReport: ReferralMonthlyRatingReport,
  ): ReferralMonthlyRatingGovernanceRecord[] {
    const byKey = new Map<string, ReferralMonthlyRatingGovernanceRecord>();
    const activeGovernance =
      governance && governance.periodMonth === currentReport.periodMonth
        ? governance
        : currentReport.governance &&
            currentReport.governance.periodMonth === currentReport.periodMonth
          ? currentReport.governance
          : null;

    if (activeGovernance) {
      for (const rec of activeGovernance.records) {
        const key = `${rec.driverId}::${rec.periodMonth}::${rec.ruleType}`;
        byKey.set(key, savedRecordsByKey[key] ?? rec);
      }
    }
    for (const [key, saved] of Object.entries(savedRecordsByKey)) {
      if (saved.periodMonth === currentReport.periodMonth) {
        byKey.set(key, saved);
      }
    }

    return [...byKey.values()].sort(
      (a, b) =>
        a.driverId.localeCompare(b.driverId) ||
        a.ruleType.localeCompare(b.ruleType),
    );
  }

  function formatRuleLabel(ruleType: ReferralMonthlyGovernanceRuleType) {
    return ruleType === "termination_review"
      ? t("referralMonthly.governanceRuleTermination", {
          consecutiveMonths: REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS,
          threshold: REFERRAL_MONTHLY_TERMINATION_THRESHOLD.toFixed(1),
        })
      : t("referralMonthly.governanceRuleCoaching", {
          threshold: REFERRAL_MONTHLY_COACHING_THRESHOLD.toFixed(1),
        });
  }

  function formatOutcomeLabel(outcome: ReferralMonthlyGovernanceOutcome | null) {
    switch (outcome) {
      case "coached":
        return t("referralMonthly.governanceOutcomeCoached");
      case "terminated":
        return t("referralMonthly.governanceOutcomeTerminated");
      case "dismissed":
        return t("referralMonthly.governanceOutcomeDismissed");
      default:
        return t("referralMonthly.governanceOutcomePending");
    }
  }

  function formatStatusCell(record: ReferralMonthlyRatingGovernanceRecord) {
    if (!record.outcome) {
      return t("referralMonthly.governanceOutcomePending");
    }
    return t("referralMonthly.governanceStatusDetail", {
      outcome: formatOutcomeLabel(record.outcome),
      reason: record.outcomeReason ?? t("referralMonthly.notProvided"),
      actor: record.handledByActorId ?? t("referralMonthly.notProvided"),
      audit: record.auditId ?? t("referralMonthly.notProvided"),
    });
  }

  async function submitOutcome(record: ReferralMonthlyRatingGovernanceRecord) {
    const key = `${record.driverId}::${record.periodMonth}::${record.ruleType}`;
    const defaultOutcome: ReferralMonthlyGovernanceOutcome =
      record.outcome ??
      (record.ruleType === "termination_review" ? "terminated" : "coached");
    const selectedOutcome = draftOutcomes[key] ?? defaultOutcome;
    const reason = (
      draftReasons[key] ??
      record.outcomeReason ??
      ""
    ).trim();

    if (!reason) {
      setGovernanceError(t("referralMonthly.governanceReasonRequired"));
      return;
    }

    setSubmittingRecordKey(key);
    setGovernanceError(null);
    const payload: RecordReferralMonthlyGovernanceOutcomeCommand = {
      recordId: record.recordId,
      driverId: record.driverId,
      periodMonth: record.periodMonth,
      ruleType: record.ruleType,
      outcome: selectedOutcome,
      reason,
    };

    try {
      const updated = await client.post<ReferralMonthlyRatingGovernanceRecord>(
        "/api/reports/referral-monthly-ratings/governance/outcomes",
        { body: payload },
      );
      setSavedRecordsByKey((prev) => ({
        ...prev,
        [key]: updated,
      }));
    } catch (err) {
      setGovernanceError(
        err instanceof Error
          ? err.message
          : t("referralMonthly.governanceSaveFailed"),
      );
    } finally {
      setSubmittingRecordKey(null);
    }
  }

  const displayedGovernanceRecords = report
    ? buildDisplayedGovernanceRecords(report)
    : [];

  return (
    <main>
      <Link href="/p5-ratings" prefetch={false}>
        {t("referralMonthly.back")}
      </Link>
      <h1>{t("referralMonthly.title")}</h1>
      <p>{t("referralMonthly.description")}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label>
          {t("referralMonthly.month")}
          <input
            aria-label={t("referralMonthly.month")}
            type="month"
            required
            value={month}
            onChange={(event) => {
              active.current?.abort();
              setLoading(false);
              setReport(null);
              setGovernance(null);
              setSavedRecordsByKey({});
              setGovernanceError(null);
              setMonth(event.target.value);
            }}
          />
        </label>
        <label>
          {t("referralMonthly.driverId")}
          <input
            aria-label={t("referralMonthly.driverId")}
            value={driverId}
            onChange={(event) => {
              active.current?.abort();
              setLoading(false);
              setReport(null);
              setGovernance(null);
              setSavedRecordsByKey({});
              setGovernanceError(null);
              setDriverId(event.target.value);
            }}
          />
        </label>
        <button type="submit" disabled={loading}>
          {t("referralMonthly.refresh")}
        </button>
      </form>
      {loading ? <p role="status">{t("referralMonthly.loading")}</p> : null}
      {error ? (
        <p role="alert">{error.message || t("referralMonthly.loadFailed")}</p>
      ) : null}
      {report ? (
        <section aria-label={t("referralMonthly.results")}>
          <h2>
            {t("referralMonthly.period", {
              month: report.periodMonth,
              timeZone: report.timeZone,
            })}
          </h2>
          <p>
            {t("referralMonthly.summary", {
              count: report.ratingCount,
              average:
                report.averageRating === null
                  ? t("referralMonthly.noRatings")
                  : report.averageRating.toFixed(2),
              unattributed: report.unattributedRatingCount,
            })}
          </p>
          <table>
            <caption>{t("referralMonthly.driverStatistics")}</caption>
            <thead>
              <tr>
                <th>{t("referralMonthly.driver")}</th>
                <th>{t("referralMonthly.count")}</th>
                <th>{t("referralMonthly.average")}</th>
                <th>{t("referralMonthly.lastRating")}</th>
              </tr>
            </thead>
            <tbody>
              {report.drivers.map((driver) => (
                <tr key={driver.driverId}>
                  <td>{driver.driverId}</td>
                  <td>{driver.ratingCount}</td>
                  <td>{driver.averageRating.toFixed(2)}</td>
                  <td>{driver.lastRatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <section aria-label={t("referralMonthly.governanceSectionAria")}>
            <h3>{t("referralMonthly.governanceTitle")}</h3>
            <p>
              {t("referralMonthly.governanceRuleSummary", {
                coachingThreshold:
                  REFERRAL_MONTHLY_COACHING_THRESHOLD.toFixed(1),
                consecutiveMonths:
                  REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS,
                terminationThreshold:
                  REFERRAL_MONTHLY_TERMINATION_THRESHOLD.toFixed(1),
              })}
            </p>
            <button
              type="button"
              disabled={governanceLoading}
              onClick={() => void loadGovernance()}
            >
              {t("referralMonthly.governanceEvaluateButton")}
            </button>
            {governanceError ? <p role="alert">{governanceError}</p> : null}
            <table>
              <caption>{t("referralMonthly.governanceTableCaption")}</caption>
              <thead>
                <tr>
                  <th>{t("referralMonthly.driver")}</th>
                  <th>{t("referralMonthly.governanceColRuleType")}</th>
                  <th>{t("referralMonthly.governanceColTriggeredMonths")}</th>
                  <th>{t("referralMonthly.governanceColMonthlyBreakdown")}</th>
                  <th>{t("referralMonthly.governanceColHandlingStatus")}</th>
                  <th>{t("referralMonthly.governanceColActions")}</th>
                </tr>
              </thead>
              <tbody>
                {displayedGovernanceRecords.map((record) => {
                  const key = `${record.driverId}::${record.periodMonth}::${record.ruleType}`;
                  const defaultOutcome: ReferralMonthlyGovernanceOutcome =
                    record.outcome ??
                    (record.ruleType === "termination_review"
                      ? "terminated"
                      : "coached");
                  const currentOutcome = draftOutcomes[key] ?? defaultOutcome;
                  const currentReason =
                    draftReasons[key] ?? record.outcomeReason ?? "";
                  return (
                    <tr key={key}>
                      <td>{record.driverId}</td>
                      <td>{formatRuleLabel(record.ruleType)}</td>
                      <td>
                        {record.triggeredMonths.join(
                          t("referralMonthly.tagSeparator"),
                        )}
                      </td>
                      <td>
                        {record.monthlyBreakdown
                          .map((m) =>
                            m.status === "no_data" || m.averageRating === null
                              ? t("referralMonthly.governanceBreakdownNoData", {
                                  month: m.periodMonth,
                                })
                              : t("referralMonthly.governanceBreakdownRated", {
                                  month: m.periodMonth,
                                  average: m.averageRating.toFixed(2),
                                  count: m.ratingCount,
                                }),
                          )
                          .join(
                            t("referralMonthly.governanceBreakdownSeparator"),
                          )}
                      </td>
                      <td>{formatStatusCell(record)}</td>
                      <td>
                        <label>
                          {t("referralMonthly.governanceOutcomeLabel")}
                          <select
                            aria-label={t(
                              "referralMonthly.governanceOutcomeSelectAria",
                              {
                                driverId: record.driverId,
                                ruleType: record.ruleType,
                              },
                            )}
                            value={currentOutcome}
                            onChange={(e) =>
                              setDraftOutcomes((prev) => ({
                                ...prev,
                                [key]:
                                  e.target
                                    .value as ReferralMonthlyGovernanceOutcome,
                              }))
                            }
                          >
                            <option value="coached">
                              {t("referralMonthly.governanceOutcomeCoached")}
                            </option>
                            <option value="terminated">
                              {t("referralMonthly.governanceOutcomeTerminated")}
                            </option>
                            <option value="dismissed">
                              {t("referralMonthly.governanceOutcomeDismissed")}
                            </option>
                          </select>
                        </label>
                        <label>
                          {t("referralMonthly.governanceReasonLabel")}
                          <input
                            aria-label={t(
                              "referralMonthly.governanceReasonInputAria",
                              {
                                driverId: record.driverId,
                                ruleType: record.ruleType,
                              },
                            )}
                            value={currentReason}
                            placeholder={t(
                              "referralMonthly.governanceReasonPlaceholder",
                            )}
                            onChange={(e) =>
                              setDraftReasons((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <button
                          type="button"
                          aria-label={t(
                            "referralMonthly.governanceSaveButtonAria",
                            {
                              driverId: record.driverId,
                              ruleType: record.ruleType,
                            },
                          )}
                          disabled={submittingRecordKey === key}
                          onClick={() => void submitOutcome(record)}
                        >
                          {t("referralMonthly.governanceSaveButton")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {displayedGovernanceRecords.length === 0 ? (
              <p>{t("referralMonthly.governanceEmpty")}</p>
            ) : null}
          </section>
          <table>
            <caption>{t("referralMonthly.originalRatings")}</caption>
            <thead>
              <tr>
                <th>{t("referralMonthly.order")}</th>
                <th>{t("referralMonthly.tenantSource")}</th>
                <th>{t("referralMonthly.completedDriverTask")}</th>
                <th>{t("referralMonthly.score")}</th>
                <th>{t("referralMonthly.tags")}</th>
                <th>{t("referralMonthly.comment")}</th>
                <th>{t("referralMonthly.submittedAt")}</th>
                <th>{t("referralMonthly.contactCase")}</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.orderId}>
                  <td>
                    {row.orderNo}／{row.orderId}
                  </td>
                  <td>
                    {row.tenantId}／{row.partnerId}／{row.partnerProgramId}／
                    {row.entrySlug}
                  </td>
                  <td>
                    {row.driverId ?? t("referralMonthly.unattributed")}／
                    {row.taskId ?? "—"}
                  </td>
                  <td>{row.score}</td>
                  <td>{row.tags.join(t("referralMonthly.tagSeparator"))}</td>
                  <td>{row.comment ?? "—"}</td>
                  <td>{row.submittedAt}</td>
                  <td>
                    {row.contactRequested === null
                      ? t("referralMonthly.notProvided")
                      : row.contactRequested
                        ? t("referralMonthly.yes")
                        : t("referralMonthly.no")}
                    ／{row.complaintCaseNo ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.rows.length === 0 ? (
            <p>{t("referralMonthly.empty")}</p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
