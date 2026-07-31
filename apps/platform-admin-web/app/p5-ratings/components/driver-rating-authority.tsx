"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import {
  classifyRatingReadFailure,
  getDriverRatingAuthority,
  type DriverRatingAuthorityView,
  type RatingReadFailure,
} from "../rating-api";
import styles from "../rating-governance.module.css";
import {
  formatRatingDate,
  RatingLoadingState,
  RatingPageFrame,
  RatingStaleBanner,
  RatingStateView,
  useRatingTranslator,
} from "./rating-shared";

export function DriverRatingAuthorityScreen({
  driverId,
}: {
  driverId: string;
}) {
  const client = usePlatformAdminClient();
  const { locale, t } = useRatingTranslator();
  const [authority, setAuthority] = useState<DriverRatingAuthorityView | null>(
    null,
  );
  const [failure, setFailure] = useState<RatingReadFailure | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setFailure(null);
      try {
        setAuthority(await getDriverRatingAuthority(client, driverId, signal));
      } catch (error) {
        if (signal?.aborted) return;
        setAuthority(null);
        setFailure(classifyRatingReadFailure(error));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [client, driverId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const retryButton = (
    <button type="button" className={styles.button} onClick={() => void load()}>
      {t("action.refresh")}
    </button>
  );

  return (
    <RatingPageFrame
      screenId="P5-RATE-UI-03"
      eyebrow={t("authority.eyebrow")}
      title={t("authority.title")}
      subtitle={t("authority.subtitle")}
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
      {!loading && !failure && authority?.refresh.stale ? (
        <RatingStaleBanner
          t={t}
          generatedAt={authority.refresh.generatedAt}
          locale={locale}
        />
      ) : null}
      {!loading && !failure && authority ? (
        <section className={`${styles.panel} ${styles.authorityStage}`}>
          <article className={styles.authorityCard}>
            <p className={styles.authorityState}>
              {t(`authority.${authority.summary.displayState}`)}
            </p>

            {authority.summary.displayState === "rated" ? (
              <>
                <p className={styles.authorityNumber}>
                  {authority.summary.averageRating} ★
                </p>
                <p className={styles.authorityText}>
                  {t("field.count")}: {authority.summary.ratingCount}
                </p>
              </>
            ) : (
              <p className={styles.authorityText}>
                {t(
                  authority.summary.displayState === "new_driver"
                    ? "authority.newDriverBody"
                    : "authority.unavailableBody",
                )}
                {authority.unavailableReason
                  ? ` ${authority.unavailableReason}`
                  : ""}
              </p>
            )}

            <dl className={styles.facts}>
              <div>
                <dt>{t("field.driver")} ID</dt>
                <dd className={styles.mono}>{authority.summary.driverId}</dd>
              </div>
              <div>
                <dt>{t("field.version")}</dt>
                <dd className={styles.mono}>
                  v{authority.summary.aggregateVersion}
                </dd>
              </div>
              <div>
                <dt>{t("field.calculated")}</dt>
                <dd>
                  {formatRatingDate(authority.summary.calculatedAt, locale)}
                </dd>
              </div>
              <div>
                <dt>{t("field.lastRated")}</dt>
                <dd>
                  {formatRatingDate(authority.summary.lastRatedAt, locale)}
                </dd>
              </div>
            </dl>
          </article>
        </section>
      ) : null}
    </RatingPageFrame>
  );
}
