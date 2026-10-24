"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  REFERRAL_MONTHLY_COACHING_THRESHOLD,
  REFERRAL_MONTHLY_TERMINATION_THRESHOLD,
  type RecordReferralMonthlyGovernanceOutcomeCommand,
  type ReferralMonthlyGovernanceOutcome,
  type ReferralMonthlyRatingGovernanceRecord,
  type ReferralMonthlyRatingGovernanceReport,
  type ReferralMonthlyRatingReport,
} from "@drts/contracts";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatGovernanceRuleLabel,
  formatGovernanceStatusCell,
  formatMonthlyBreakdownItem,
  formatOutcomeSelectAriaLabel,
  formatReasonInputAriaLabel,
  formatSaveOutcomeAriaLabel,
  referralMonthlyGovernanceCopy as govCopy,
} from "./translations";

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
      if (!controller.signal.aborted) setReport(envelope.data);
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
        err instanceof Error ? err.message : govCopy.loadGovernanceFailed,
      );
    } finally {
      setGovernanceLoading(false);
    }
  }

  function buildDisplayedGovernanceRecords(
    currentReport: ReferralMonthlyRatingReport,
  ): ReferralMonthlyRatingGovernanceRecord[] {
    const byKey = new Map<string, ReferralMonthlyRatingGovernanceRecord>();

    if (governance && governance.periodMonth === currentReport.periodMonth) {
      for (const rec of governance.records) {
        const key = `${rec.driverId}::${rec.periodMonth}::${rec.ruleType}`;
        byKey.set(key, savedRecordsByKey[key] ?? rec);
      }
    } else {
      for (const driver of currentReport.drivers) {
        if (driver.averageRating < REFERRAL_MONTHLY_COACHING_THRESHOLD) {
          const key = `${driver.driverId}::${currentReport.periodMonth}::coaching`;
          const saved = savedRecordsByKey[key];
          byKey.set(
            key,
            saved ?? {
              recordId: `r04-gov:${driver.driverId}:${currentReport.periodMonth}:coaching`,
              driverId: driver.driverId,
              periodMonth: currentReport.periodMonth,
              ruleType: "coaching",
              threshold: REFERRAL_MONTHLY_COACHING_THRESHOLD,
              averageRating: driver.averageRating,
              ratingCount: driver.ratingCount,
              consecutiveLowMonths:
                driver.averageRating < REFERRAL_MONTHLY_TERMINATION_THRESHOLD
                  ? 1
                  : 0,
              triggeredMonths: [currentReport.periodMonth],
              monthlyBreakdown: [
                {
                  periodMonth: currentReport.periodMonth,
                  ratingCount: driver.ratingCount,
                  averageRating: driver.averageRating,
                  status: "rated",
                  belowCoachingThreshold: true,
                  belowTerminationThreshold:
                    driver.averageRating <
                    REFERRAL_MONTHLY_TERMINATION_THRESHOLD,
                },
              ],
              status: "pending",
              outcome: null,
              outcomeReason: null,
              handledByActorId: null,
              handledAt: null,
              auditId: null,
              createdAt: driver.lastRatedAt,
              updatedAt: driver.lastRatedAt,
            },
          );
        }
      }
      for (const [key, saved] of Object.entries(savedRecordsByKey)) {
        if (saved.periodMonth === currentReport.periodMonth) {
          byKey.set(key, saved);
        }
      }
    }

    return [...byKey.values()].sort(
      (a, b) =>
        a.driverId.localeCompare(b.driverId) ||
        a.ruleType.localeCompare(b.ruleType),
    );
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
      setGovernanceError(govCopy.reasonRequiredError);
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
        err instanceof Error ? err.message : govCopy.saveOutcomeFailed,
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
          <section aria-label={govCopy.sectionAriaLabel}>
            <h3>{govCopy.sectionTitle}</h3>
            <p>{govCopy.ruleSummary}</p>
            <button
              type="button"
              disabled={governanceLoading}
              onClick={() => void loadGovernance()}
            >
              {govCopy.evaluateButton}
            </button>
            {governanceError ? (
              <p role="alert">{governanceError}</p>
            ) : null}
            <table>
              <caption>{govCopy.tableCaption}</caption>
              <thead>
                <tr>
                  <th>{govCopy.colDriver}</th>
                  <th>{govCopy.colRuleType}</th>
                  <th>{govCopy.colTriggeredMonths}</th>
                  <th>{govCopy.colMonthlyBreakdown}</th>
                  <th>{govCopy.colHandlingStatus}</th>
                  <th>{govCopy.colActions}</th>
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
                      <td>{formatGovernanceRuleLabel(record.ruleType)}</td>
                      <td>
                        {record.triggeredMonths.join(govCopy.monthSeparator)}
                      </td>
                      <td>
                        {record.monthlyBreakdown
                          .map((m) => formatMonthlyBreakdownItem(m))
                          .join(govCopy.breakdownSeparator)}
                      </td>
                      <td>{formatGovernanceStatusCell(record)}</td>
                      <td>
                        <label>
                          {govCopy.outcomeLabelText}
                          <select
                            aria-label={formatOutcomeSelectAriaLabel(
                              record.driverId,
                              record.ruleType,
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
                              {govCopy.outcomeOptionCoached}
                            </option>
                            <option value="terminated">
                              {govCopy.outcomeOptionTerminated}
                            </option>
                            <option value="dismissed">
                              {govCopy.outcomeOptionDismissed}
                            </option>
                          </select>
                        </label>
                        <label>
                          {govCopy.reasonLabelText}
                          <input
                            aria-label={formatReasonInputAriaLabel(
                              record.driverId,
                              record.ruleType,
                            )}
                            value={currentReason}
                            placeholder={govCopy.reasonPlaceholder}
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
                          aria-label={formatSaveOutcomeAriaLabel(
                            record.driverId,
                            record.ruleType,
                          )}
                          disabled={submittingRecordKey === key}
                          onClick={() => void submitOutcome(record)}
                        >
                          {govCopy.saveButtonText}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {displayedGovernanceRecords.length === 0 ? (
              <p>{govCopy.emptyText}</p>
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
