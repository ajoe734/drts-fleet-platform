"use client";

import { useMemo, type ReactNode } from "react";
import { useTranslation } from "@/lib/i18n";
import type { RatingReviewStatus } from "../rating-api";
import {
  createRatingTranslator,
  type RatingMessageKey,
} from "../rating-translations";
import styles from "../rating-governance.module.css";

export type RatingTranslator = (
  key: RatingMessageKey,
  params?: Record<string, string | number>,
) => string;

export function useRatingTranslator() {
  const { locale } = useTranslation();
  const t = useMemo(() => createRatingTranslator(locale), [locale]);
  return { locale, t };
}

export function formatRatingDate(value: string | null, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Taipei",
    timeZoneName: "short",
  }).format(date);
}

export function RatingPageFrame({
  screenId,
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  screenId: string;
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className={styles.page} data-screen-id={screenId}>
      <div className={styles.frame}>
        <header className={styles.hero}>
          <div className={styles.heroTop}>
            <div>
              <p className={styles.eyebrow}>{eyebrow}</p>
              <h1 className={styles.title}>{title}</h1>
            </div>
            <div className={styles.actions}>
              <span className={styles.screenId}>{screenId}</span>
              {actions}
            </div>
          </div>
          <p className={styles.subtitle}>{subtitle}</p>
        </header>
        {children}
      </div>
    </main>
  );
}

export function RatingStatusPill({
  status,
  t,
}: {
  status: RatingReviewStatus;
  t: RatingTranslator;
}) {
  const statusClass =
    status === "active"
      ? styles.statusActive
      : status === "under_review"
        ? styles.statusReview
        : styles.statusInvalid;
  return (
    <span className={`${styles.status} ${statusClass}`}>
      {t(`status.${status}`)}
    </span>
  );
}

export function RatingLoadingState({ t }: { t: RatingTranslator }) {
  return (
    <section className={`${styles.panel} ${styles.state}`} aria-live="polite">
      <div className={styles.skeleton}>
        <div className={styles.skeletonLine} style={{ width: "42%" }} />
        <div className={styles.skeletonLine} style={{ width: "86%" }} />
        <div className={styles.skeletonLine} style={{ width: "72%" }} />
        <h2 className={styles.stateTitle}>{t("state.loading")}</h2>
        <p className={styles.stateBody}>{t("state.loadingBody")}</p>
      </div>
    </section>
  );
}

export function RatingStateView({
  kind,
  t,
  action,
}: {
  kind:
    | "empty"
    | "forbidden"
    | "unauthenticated"
    | "not_found"
    | "request_failed";
  t: RatingTranslator;
  action?: ReactNode;
}) {
  const key =
    kind === "request_failed"
      ? "error"
      : kind === "not_found"
        ? "notFound"
        : kind;
  return (
    <section className={`${styles.panel} ${styles.state}`} role="status">
      <div className={styles.stateInner}>
        <div className={styles.stateMark} aria-hidden="true">
          {kind === "empty" ? "0" : "!"}
        </div>
        <h2 className={styles.stateTitle}>
          {t(`state.${key}` as RatingMessageKey)}
        </h2>
        <p className={styles.stateBody}>
          {t(`state.${key}Body` as RatingMessageKey)}
        </p>
        {action}
      </div>
    </section>
  );
}

export function RatingStaleBanner({
  t,
  generatedAt,
  locale,
}: {
  t: RatingTranslator;
  generatedAt: string;
  locale: string;
}) {
  return (
    <div className={styles.banner} role="status">
      <strong>{t("state.stale")}</strong>
      <span>
        {t("state.staleBody")}{" "}
        <span className={styles.mono}>
          {formatRatingDate(generatedAt, locale)}
        </span>
      </span>
    </div>
  );
}
