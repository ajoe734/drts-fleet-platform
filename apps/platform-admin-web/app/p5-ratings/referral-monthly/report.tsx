"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReferralMonthlyRatingReport } from "@drts/contracts";
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
