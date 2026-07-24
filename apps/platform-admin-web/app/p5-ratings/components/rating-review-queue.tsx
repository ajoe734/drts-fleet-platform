"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import {
  classifyRatingReadFailure,
  listRatingReviews,
  type RatingReadFailure,
  type RatingReviewFilters,
  type RatingReviewList,
} from "../rating-api";
import {
  formatRatingDate,
  RatingLoadingState,
  RatingPageFrame,
  RatingStaleBanner,
  RatingStateView,
  RatingStatusPill,
  useRatingTranslator,
} from "./rating-shared";
import styles from "../rating-governance.module.css";

const EMPTY_FILTERS: RatingReviewFilters = {
  status: "",
  score: "",
  tag: "",
  driverId: "",
  tripOrOrder: "",
  from: "",
  to: "",
};

export function RatingReviewQueue() {
  const client = usePlatformAdminClient();
  const { locale, t } = useRatingTranslator();
  const [draftFilters, setDraftFilters] =
    useState<RatingReviewFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<RatingReviewFilters>(EMPTY_FILTERS);
  const [result, setResult] = useState<RatingReviewList | null>(null);
  const [failure, setFailure] = useState<RatingReadFailure | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (filters: RatingReviewFilters, signal?: AbortSignal) => {
      setLoading(true);
      setFailure(null);
      try {
        setResult(await listRatingReviews(client, filters, signal));
      } catch (error) {
        if (signal?.aborted) return;
        setResult(null);
        setFailure(classifyRatingReadFailure(error));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(appliedFilters, controller.signal);
    return () => controller.abort();
  }, [appliedFilters, load]);

  function updateFilter<Key extends keyof RatingReviewFilters>(
    key: Key,
    value: RatingReviewFilters[Key],
  ) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  const retryButton = (
    <button
      type="button"
      className={styles.button}
      onClick={() => void load(appliedFilters)}
    >
      {t("action.refresh")}
    </button>
  );

  return (
    <RatingPageFrame
      screenId="P5-RATE-UI-01"
      eyebrow={t("queue.eyebrow")}
      title={t("queue.title")}
      subtitle={t("queue.subtitle")}
      actions={
        <button
          type="button"
          className={styles.buttonGhost}
          onClick={() => void load(appliedFilters)}
          disabled={loading}
        >
          {t("action.refresh")}
        </button>
      }
    >
      <section className={styles.panel} aria-label={t("queue.title")}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>{t("queue.title")}</h2>
          <span className={styles.muted}>
            {t("queue.total", { count: result?.pageInfo.totalItems ?? 0 })}
          </span>
        </div>
        <form
          className={styles.filters}
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedFilters({ ...draftFilters });
          }}
        >
          <label className={styles.field}>
            <span className={styles.label}>{t("filter.status")}</span>
            <select
              className={styles.select}
              value={draftFilters.status}
              onChange={(event) =>
                updateFilter(
                  "status",
                  event.target.value as RatingReviewFilters["status"],
                )
              }
            >
              <option value="">{t("filter.all")}</option>
              <option value="active">{t("status.active")}</option>
              <option value="under_review">{t("status.under_review")}</option>
              <option value="invalidated">{t("status.invalidated")}</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t("filter.score")}</span>
            <select
              className={styles.select}
              value={draftFilters.score}
              onChange={(event) =>
                updateFilter(
                  "score",
                  event.target.value as RatingReviewFilters["score"],
                )
              }
            >
              <option value="">{t("filter.all")}</option>
              {[5, 4, 3, 2, 1].map((score) => (
                <option key={score} value={score}>
                  {score}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t("filter.tag")}</span>
            <input
              className={styles.input}
              value={draftFilters.tag}
              onChange={(event) => updateFilter("tag", event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t("filter.driver")}</span>
            <input
              className={styles.input}
              value={draftFilters.driverId}
              onChange={(event) => updateFilter("driverId", event.target.value)}
            />
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.label}>{t("filter.trip")}</span>
            <input
              className={styles.input}
              value={draftFilters.tripOrOrder}
              onChange={(event) =>
                updateFilter("tripOrOrder", event.target.value)
              }
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t("filter.from")}</span>
            <input
              className={styles.input}
              type="date"
              value={draftFilters.from}
              onChange={(event) => updateFilter("from", event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t("filter.to")}</span>
            <input
              className={styles.input}
              type="date"
              value={draftFilters.to}
              onChange={(event) => updateFilter("to", event.target.value)}
            />
          </label>
          <div className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.label} aria-hidden="true">
              &nbsp;
            </span>
            <div className={styles.toolbar}>
              <button type="submit" className={styles.button}>
                {t("action.apply")}
              </button>
              <button
                type="button"
                className={styles.buttonGhost}
                onClick={() => {
                  setDraftFilters(EMPTY_FILTERS);
                  setAppliedFilters(EMPTY_FILTERS);
                }}
              >
                {t("action.clear")}
              </button>
            </div>
          </div>
        </form>
      </section>

      <div style={{ height: 14 }} />

      {loading ? <RatingLoadingState t={t} /> : null}
      {!loading && failure ? (
        <RatingStateView kind={failure} t={t} action={retryButton} />
      ) : null}
      {!loading && !failure && result?.refresh.stale ? (
        <RatingStaleBanner
          t={t}
          generatedAt={result.refresh.generatedAt}
          locale={locale}
        />
      ) : null}
      {!loading && !failure && result?.items.length === 0 ? (
        <RatingStateView kind="empty" t={t} action={retryButton} />
      ) : null}
      {!loading && !failure && result && result.items.length > 0 ? (
        <section className={styles.panel}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("column.score")}</th>
                  <th>{t("column.tags")}</th>
                  <th>{t("column.comment")}</th>
                  <th>{t("column.driver")}</th>
                  <th>{t("column.trip")}</th>
                  <th>{t("column.status")}</th>
                  <th>{t("column.submitted")}</th>
                  <th>{t("column.updated")}</th>
                  <th aria-label={t("action.review")} />
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.ratingId}>
                    <td>
                      <span
                        className={`${styles.score} ${
                          row.score <= 2 ? styles.scoreLow : ""
                        }`}
                      >
                        {row.score} ★
                      </span>
                    </td>
                    <td>
                      <div className={styles.tags}>
                        {row.tags.length > 0 ? (
                          row.tags.map((tag) => (
                            <span key={tag} className={styles.tag}>
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className={styles.muted}>
                            {t("common.none")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={styles.muted}>
                      {row.commentExcerpt ?? t("detail.commentEmpty")}
                    </td>
                    <td>
                      <div>{row.driverDisplayName ?? row.driverId}</div>
                      {row.driverDisplayName ? (
                        <div className={`${styles.mono} ${styles.muted}`}>
                          {row.driverId}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className={styles.mono}>{row.tripId}</div>
                      <div className={`${styles.mono} ${styles.muted}`}>
                        {row.orderId}
                      </div>
                    </td>
                    <td>
                      <RatingStatusPill status={row.status} t={t} />
                    </td>
                    <td>{formatRatingDate(row.submittedAt, locale)}</td>
                    <td>{formatRatingDate(row.updatedAt, locale)}</td>
                    <td>
                      <Link
                        className={styles.linkButton}
                        href={`/p5-ratings/${encodeURIComponent(row.ratingId)}`}
                      >
                        {t("action.review")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </RatingPageFrame>
  );
}
