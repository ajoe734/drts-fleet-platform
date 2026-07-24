"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import {
  classifyRatingReadFailure,
  getRatingReview,
  invalidateRating,
  type RatingReadFailure,
  type RatingReviewDetail,
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

export function RatingReviewDetailScreen({ ratingId }: { ratingId: string }) {
  const client = usePlatformAdminClient();
  const { locale, t } = useRatingTranslator();
  const [detail, setDetail] = useState<RatingReviewDetail | null>(null);
  const [failure, setFailure] = useState<RatingReadFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInvalidate, setShowInvalidate] = useState(false);
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationSucceeded, setMutationSucceeded] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setFailure(null);
      try {
        setDetail(await getRatingReview(client, ratingId, signal));
      } catch (error) {
        if (signal?.aborted) return;
        setDetail(null);
        setFailure(classifyRatingReadFailure(error));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [client, ratingId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function openInvalidate() {
    if (!detail?.availableActions.invalidate.enabled || detail.refresh.stale) {
      return;
    }
    setReason("");
    setMutationError(null);
    setMutationSucceeded(false);
    setIdempotencyKey(crypto.randomUUID());
    setShowInvalidate(true);
  }

  async function confirmInvalidate() {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setMutationError(t("modal.reasonRequired"));
      return;
    }
    if (!idempotencyKey) return;

    setMutating(true);
    setMutationError(null);
    try {
      const result = await invalidateRating(
        client,
        ratingId,
        normalizedReason,
        idempotencyKey,
      );
      setDetail((current) =>
        current
          ? {
              ...current,
              rating: result.rating,
              driverRatingSummary: result.driverRatingSummary,
              moderationHistory: current.moderationHistory.some(
                (entry) => entry.auditId === result.audit.auditId,
              )
                ? current.moderationHistory
                : [...current.moderationHistory, result.audit],
              availableActions: {
                invalidate: {
                  enabled: false,
                  disabledReason: "rating_already_invalidated",
                },
              },
              refresh: {
                generatedAt: result.audit.createdAt,
                staleAfterMs: current.refresh.staleAfterMs,
                stale: false,
              },
            }
          : current,
      );
      setMutationSucceeded(true);
      setShowInvalidate(false);
    } catch (error) {
      const kind = classifyRatingReadFailure(error);
      setMutationError(
        kind === "forbidden"
          ? t("state.forbiddenBody")
          : kind === "unauthenticated"
            ? t("state.unauthenticatedBody")
            : t("modal.failed"),
      );
    } finally {
      setMutating(false);
    }
  }

  const retryButton = (
    <button type="button" className={styles.button} onClick={() => void load()}>
      {t("action.refresh")}
    </button>
  );

  return (
    <RatingPageFrame
      screenId="P5-RATE-UI-02"
      eyebrow={t("detail.eyebrow")}
      title={t("detail.title", { ratingId })}
      subtitle={t("detail.subtitle")}
      actions={
        <>
          <Link className={styles.linkButton} href="/p5-ratings">
            {t("action.back")}
          </Link>
          <button
            type="button"
            className={styles.buttonGhost}
            onClick={() => void load()}
            disabled={loading}
          >
            {t("action.refresh")}
          </button>
        </>
      }
    >
      {loading ? <RatingLoadingState t={t} /> : null}
      {!loading && failure ? (
        <RatingStateView kind={failure} t={t} action={retryButton} />
      ) : null}
      {!loading && !failure && detail?.refresh.stale ? (
        <RatingStaleBanner
          t={t}
          generatedAt={detail.refresh.generatedAt}
          locale={locale}
        />
      ) : null}
      {mutationSucceeded ? (
        <div className={styles.bannerSuccess} role="status">
          {t("modal.succeeded")}
        </div>
      ) : null}

      {!loading && !failure && detail ? (
        <div className={styles.detailGrid}>
          <div className={styles.stack}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>{t("detail.rating")}</h2>
                <RatingStatusPill status={detail.rating.status} t={t} />
              </div>
              <div className={styles.cardBody}>
                <dl className={styles.facts}>
                  <div>
                    <dt>{t("field.ratingId")}</dt>
                    <dd className={styles.mono}>{detail.rating.ratingId}</dd>
                  </div>
                  <div>
                    <dt>{t("column.score")}</dt>
                    <dd
                      className={`${styles.score} ${
                        detail.rating.score <= 2 ? styles.scoreLow : ""
                      }`}
                    >
                      {detail.rating.score} ★
                    </dd>
                  </div>
                  <div>
                    <dt>{t("column.tags")}</dt>
                    <dd>
                      <span className={styles.tags}>
                        {detail.rating.tags.length > 0
                          ? detail.rating.tags.map((tag) => (
                              <span key={tag} className={styles.tag}>
                                {tag}
                              </span>
                            ))
                          : t("common.none")}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>{t("detail.passenger")}</dt>
                    <dd className={styles.mono}>
                      {detail.passengerSubjectMasked ??
                        t("detail.passengerOmitted")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("field.submitted")}</dt>
                    <dd>
                      {formatRatingDate(detail.rating.submittedAt, locale)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("field.updated")}</dt>
                    <dd>{formatRatingDate(detail.rating.updatedAt, locale)}</dd>
                  </div>
                </dl>
                <blockquote className={styles.comment}>
                  {detail.rating.comment ?? t("detail.commentEmpty")}
                </blockquote>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>{t("detail.trip")}</h2>
              </div>
              <div className={styles.cardBody}>
                <dl className={styles.facts}>
                  <div>
                    <dt>{t("field.order")}</dt>
                    <dd className={styles.mono}>
                      {detail.orderNo ?? detail.rating.orderId}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("field.trip")}</dt>
                    <dd className={styles.mono}>{detail.rating.tripId}</dd>
                  </div>
                  <div>
                    <dt>{t("field.driver")}</dt>
                    <dd>
                      {detail.driverDisplayName ?? detail.rating.driverId}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("field.driver")} ID</dt>
                    <dd className={styles.mono}>{detail.rating.driverId}</dd>
                  </div>
                </dl>
                <div className={styles.toolbar} style={{ marginTop: 16 }}>
                  <Link
                    className={styles.linkButton}
                    href={`/p5-ratings/drivers/${encodeURIComponent(
                      detail.rating.driverId,
                    )}`}
                  >
                    {t("action.authority")}
                  </Link>
                </div>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>{t("detail.history")}</h2>
              </div>
              <div className={styles.cardBody}>
                {detail.moderationHistory.length > 0 ? (
                  <ol className={styles.timeline}>
                    {detail.moderationHistory.map((entry) => (
                      <li key={entry.auditId}>
                        <p className={styles.timelineTitle}>
                          {entry.action} · {entry.resultingStatus}
                        </p>
                        <p className={styles.timelineMeta}>
                          {entry.reason} · {entry.actorId} ·{" "}
                          {formatRatingDate(entry.createdAt, locale)}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.muted}>{t("detail.auditEmpty")}</p>
                )}
              </div>
            </section>
          </div>

          <aside className={styles.stack}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>{t("detail.aggregate")}</h2>
              </div>
              <div className={styles.cardBody}>
                {detail.driverRatingSummary.displayState === "rated" ? (
                  <div className={styles.aggregateValue}>
                    {detail.driverRatingSummary.averageRating}
                    <small>
                      {detail.driverRatingSummary.ratingCount} ·{" "}
                      {t("field.count")}
                    </small>
                  </div>
                ) : (
                  <p className={styles.authorityState}>
                    {t(
                      detail.driverRatingSummary.displayState === "new_driver"
                        ? "authority.new_driver"
                        : "authority.unavailable",
                    )}
                  </p>
                )}
                <dl className={styles.facts}>
                  <div>
                    <dt>{t("field.version")}</dt>
                    <dd className={styles.mono}>
                      v{detail.driverRatingSummary.aggregateVersion}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("field.calculated")}</dt>
                    <dd>
                      {formatRatingDate(
                        detail.driverRatingSummary.calculatedAt,
                        locale,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("field.lastRated")}</dt>
                    <dd>
                      {formatRatingDate(
                        detail.driverRatingSummary.lastRatedAt,
                        locale,
                      )}
                    </dd>
                  </div>
                </dl>
                <p className={`${styles.muted}`} style={{ marginBottom: 0 }}>
                  {t("detail.aggregateLocked")}
                </p>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>{t("action.invalidate")}</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.stack}>
                  <button
                    type="button"
                    className={styles.buttonDanger}
                    onClick={openInvalidate}
                    disabled={
                      !detail.availableActions.invalidate.enabled ||
                      detail.rating.status === "invalidated" ||
                      detail.refresh.stale
                    }
                  >
                    {t("action.invalidate")}
                  </button>
                  {!detail.availableActions.invalidate.enabled ? (
                    <p className={styles.stateBody}>
                      {detail.availableActions.invalidate.disabledReason ??
                        t("detail.invalidateUnavailable")}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className={styles.buttonGhost}
                    disabled
                    title="command-pending"
                  >
                    {t("action.restorePending")}
                  </button>
                </div>
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {showInvalidate && detail ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !mutating) {
              setShowInvalidate(false);
            }
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rating-invalidate-title"
          >
            <header className={styles.modalHeader}>
              <h2 id="rating-invalidate-title">{t("modal.title")}</h2>
              <p>{t("modal.body")}</p>
            </header>
            <div className={styles.modalBody}>
              <div className={styles.statusLine}>
                <span className={styles.mono}>{detail.rating.ratingId}</span>
                <span className={styles.score}>{detail.rating.score} ★</span>
                <RatingStatusPill status={detail.rating.status} t={t} />
              </div>
              <label className={styles.field}>
                <span className={styles.label}>{t("modal.reason")}</span>
                <textarea
                  className={styles.textarea}
                  value={reason}
                  placeholder={t("modal.reasonPlaceholder")}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={mutating}
                  autoFocus
                />
              </label>
              {mutationError ? (
                <div className={styles.bannerDanger} role="alert">
                  {mutationError}
                </div>
              ) : null}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.buttonGhost}
                  onClick={() => setShowInvalidate(false)}
                  disabled={mutating}
                >
                  {t("modal.cancel")}
                </button>
                <button
                  type="button"
                  className={styles.buttonDanger}
                  onClick={() => void confirmInvalidate()}
                  disabled={mutating || reason.trim().length === 0}
                >
                  {mutating ? t("action.invalidating") : t("modal.confirm")}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </RatingPageFrame>
  );
}
