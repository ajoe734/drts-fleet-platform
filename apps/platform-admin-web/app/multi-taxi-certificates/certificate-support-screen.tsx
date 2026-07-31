"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

import { usePlatformAdminClient } from "@/lib/admin-client";
import { usePlatformAdminAuthority } from "@/lib/platform-admin-authority";
import { useTranslation } from "@/lib/i18n";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasEmptyState,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";

import {
  CERTIFICATE_SUPPORT_STATES,
  classifyCertificateSupportError,
  hasCertificateReadScope,
  hasCertificateWriteScope,
  parseCertificateRegenerationResult,
  parseCertificateSupportList,
  parseCertificateSupportView,
  type CertificateSupportErrorKind,
  type CertificateSupportState,
  type CertificateSupportView,
} from "./certificate-support-model";
import styles from "./certificate-support.module.css";
import {
  certificateStateCopy,
  certificateSupportCopy,
  displayCertificateValue,
  formatCertificateDateTime,
  formatCertificateDistance,
  formatCertificateDuration,
  formatCertificateMoney,
  type CertificateSupportCopyKey,
  type CertificateSupportLocale,
  type CertificateTone,
} from "./translations";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });
const monoStyle: CSSProperties = { fontFamily: theme.monoFamily };

function StateCatalog({ locale }: { locale: CertificateSupportLocale }) {
  return (
    <CanvasCard
      theme={theme}
      title={certificateSupportCopy(locale, "stateCatalogTitle")}
    >
      <div className={styles.stateGrid} data-testid="certificate-state-catalog">
        {CERTIFICATE_SUPPORT_STATES.map((state) => {
          const copy = certificateStateCopy(locale, state);
          return (
            <div className={styles.stateCell} key={state}>
              <CanvasPill theme={theme} tone={copy.tone} dot>
                {copy.label}
              </CanvasPill>
              <span className={styles.stateCode}>{state}</span>
            </div>
          );
        })}
      </div>
    </CanvasCard>
  );
}

function StatePanel({
  state,
  title,
  body,
  action,
  testId,
  locale,
}: {
  state: CertificateSupportState;
  title: string;
  body: string;
  action?: ReactNode;
  testId: string;
  locale: CertificateSupportLocale;
}) {
  const stateCopy = certificateStateCopy(locale, state);
  return (
    <div className={styles.body} data-testid={testId}>
      <CanvasBanner
        theme={theme}
        tone={bannerTone(stateCopy.tone)}
        title={title}
        body={body}
        actions={action}
      />
      <StateCatalog locale={locale} />
    </div>
  );
}

export function CertificateSupportSearchScreen() {
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const { locale } = useTranslation();
  const copy = (
    key: CertificateSupportCopyKey,
    params?: Record<string, string | number>,
  ) => certificateSupportCopy(locale, key, params);
  const canRead = hasCertificateReadScope(authority.scopes);
  const [draftQuery, setDraftQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [state, setState] = useState<CertificateSupportState | "all">("all");
  const [items, setItems] = useState<CertificateSupportView[]>([]);
  const [loading, setLoading] = useState(canRead);
  const [error, setError] = useState<CertificateSupportErrorKind | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      setError("access_denied");
      setItems([]);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    if (submittedQuery) params.set("q", submittedQuery);
    if (state !== "all") params.set("state", state);
    const suffix = params.size ? `?${params.toString()}` : "";

    setLoading(true);
    setError(null);
    void client
      .get<unknown>(`/api/platform-admin/multi-taxi/certificates${suffix}`, {
        signal: controller.signal,
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setItems(parseCertificateSupportList(payload).items);
        }
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setItems([]);
          setError(classifyCertificateSupportError(loadError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [canRead, client, reloadToken, state, submittedQuery]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(draftQuery.trim());
  }

  return (
    <main
      className={styles.screen}
      data-screen-id="P5-COM-UI-03"
      data-testid="certificate-support-search"
    >
      <CanvasPageHeader
        theme={theme}
        title={copy("pageTitle")}
        subtitle={copy("pageSubtitle")}
        actions={
          <CanvasPill theme={theme} tone="neutral" dot>
            {copy("readOnlySupport")}
          </CanvasPill>
        }
      />
      <div className={styles.body}>
        <CanvasBanner
          theme={theme}
          tone="info"
          icon="lock"
          title={copy("authorityTitle")}
          body={copy("authorityBody")}
        />

        <CanvasCard theme={theme} title={copy("searchCardTitle")}>
          <form className={styles.searchForm} onSubmit={submitSearch}>
            <input
              className={styles.input}
              aria-label={copy("searchAria")}
              placeholder={copy("searchPlaceholder")}
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              maxLength={120}
            />
            <select
              className={styles.select}
              aria-label={copy("stateAria")}
              value={state}
              onChange={(event) =>
                setState(event.target.value as CertificateSupportState | "all")
              }
            >
              <option value="all">{copy("allStates")}</option>
              {CERTIFICATE_SUPPORT_STATES.map((itemState) => (
                <option value={itemState} key={itemState}>
                  {certificateStateCopy(locale, itemState).label} · {itemState}
                </option>
              ))}
            </select>
            <CanvasBtn theme={theme} variant="primary" type="submit">
              {copy("searchButton")}
            </CanvasBtn>
          </form>
        </CanvasCard>

        <StateCatalog locale={locale} />

        {loading ? (
          <CanvasEmptyState
            theme={theme}
            tone="info"
            title={copy("loadingTitle")}
            body={copy("loadingBody")}
          />
        ) : null}
        {error === "access_denied" ? (
          <CanvasEmptyState
            theme={theme}
            tone="danger"
            title={copy("accessDeniedTitle")}
            body={copy("accessDeniedSearchBody")}
          />
        ) : null}
        {error === "failed" ? (
          <CanvasEmptyState
            theme={theme}
            tone="danger"
            title={copy("readFailedTitle")}
            body={copy("readFailedBody")}
            action={
              <CanvasBtn
                theme={theme}
                onClick={() => setReloadToken((value) => value + 1)}
              >
                {copy("retryRead")}
              </CanvasBtn>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <CanvasEmptyState
            theme={theme}
            tone="neutral"
            title={copy("emptyTitle")}
            body={copy("emptyBody")}
          />
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <CanvasCard
            theme={theme}
            title={copy("resultsTitle", { count: items.length })}
          >
            <div className={styles.results}>
              {items.map((item) => (
                <article className={styles.resultCard} key={item.certificateId}>
                  <div>
                    <h3 className={styles.resultTitle}>{item.certificateNo}</h3>
                    <p className={styles.muted}>
                      {copy("orderLabel")}{" "}
                      <span className={styles.mono}>{item.orderId}</span>
                    </p>
                    <p className={styles.muted}>
                      {copy("tripLabel")}{" "}
                      <span className={styles.mono}>
                        {displayCertificateValue(locale, item.tripId)}
                      </span>
                    </p>
                  </div>
                  <div>
                    <CanvasPill
                      theme={theme}
                      tone={certificateStateCopy(locale, item.state).tone}
                      dot
                    >
                      {certificateStateCopy(locale, item.state).label} ·{" "}
                      {item.state}
                    </CanvasPill>
                    <p className={styles.muted}>
                      {copy("plateLabel")}{" "}
                      {displayCertificateValue(locale, item.plateNo)}
                    </p>
                    <p className={styles.muted}>
                      {copy("issuedLabel")}{" "}
                      {formatCertificateDateTime(locale, item.issuedAt)}
                    </p>
                  </div>
                  <Link
                    className={styles.openLink}
                    href={`/multi-taxi-certificates/${encodeURIComponent(
                      item.certificateId,
                    )}`}
                  >
                    {copy("openDetail")}
                  </Link>
                </article>
              ))}
            </div>
          </CanvasCard>
        ) : null}
      </div>
    </main>
  );
}

export function CertificateSupportDetailScreen({
  certificateId,
}: {
  certificateId: string;
}) {
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const { locale } = useTranslation();
  const copy = (
    key: CertificateSupportCopyKey,
    params?: Record<string, string | number>,
  ) => certificateSupportCopy(locale, key, params);
  const canRead = hasCertificateReadScope(authority.scopes);
  const canWrite = hasCertificateWriteScope(authority.scopes);
  const [view, setView] = useState<CertificateSupportView | null>(null);
  const [loading, setLoading] = useState(canRead);
  const [error, setError] = useState<CertificateSupportErrorKind | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [regenerationReason, setRegenerationReason] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenerationError, setRegenerationError] = useState<string | null>(
    null,
  );
  const [regenerationAuditId, setRegenerationAuditId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      setError("access_denied");
      setView(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setView(null);
    void client
      .get<unknown>(
        `/api/platform-admin/multi-taxi/certificates/${encodeURIComponent(
          certificateId,
        )}`,
        { signal: controller.signal },
      )
      .then((payload) => {
        if (!controller.signal.aborted) {
          setView(parseCertificateSupportView(payload));
        }
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(classifyCertificateSupportError(loadError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [canRead, certificateId, client, reloadToken]);

  async function regenerateCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !view?.regeneration.enabled ||
      !canWrite ||
      !regenerationReason.trim() ||
      regenerating
    ) {
      return;
    }
    setRegenerating(true);
    setRegenerationError(null);
    setRegenerationAuditId(null);
    try {
      const result = parseCertificateRegenerationResult(
        await client.post<unknown>(
          `/api/platform-admin/multi-taxi/certificates/${encodeURIComponent(
            view.certificateId,
          )}/actions/regenerate`,
          {
            headers: {
              "Idempotency-Key": globalThis.crypto.randomUUID(),
            },
            body: { reason: regenerationReason.trim() },
          },
        ),
      );
      setView(result.certificate);
      setRegenerationReason("");
      setRegenerationAuditId(result.actionReceipt.auditId);
      globalThis.history.replaceState(
        null,
        "",
        `/multi-taxi-certificates/${encodeURIComponent(
          result.certificate.certificateId,
        )}`,
      );
    } catch (regenerationFailure) {
      setRegenerationError(
        regenerationFailure instanceof Error
          ? regenerationFailure.message
          : String(regenerationFailure),
      );
    } finally {
      setRegenerating(false);
    }
  }

  const retry = (
    <CanvasBtn
      theme={theme}
      onClick={() => setReloadToken((value) => value + 1)}
    >
      {copy("retryRead")}
    </CanvasBtn>
  );

  if (loading) {
    return (
      <main className={styles.screen} data-screen-id="P5-COM-UI-03">
        <StatePanel
          state="generating"
          title={copy("loadingTitle")}
          body={copy("detailLoadingBody")}
          testId="certificate-detail-loading"
          locale={locale}
        />
      </main>
    );
  }
  if (error === "access_denied") {
    return (
      <main className={styles.screen} data-screen-id="P5-COM-UI-03">
        <StatePanel
          state="access_denied"
          title={copy("accessDeniedTitle")}
          body={copy("detailAccessDeniedBody")}
          testId="certificate-detail-access-denied"
          locale={locale}
        />
      </main>
    );
  }
  if (error === "not_found") {
    return (
      <main className={styles.screen} data-screen-id="P5-COM-UI-03">
        <StatePanel
          state="unavailable"
          title={copy("detailUnavailableTitle")}
          body={copy("detailUnavailableBody")}
          action={retry}
          testId="certificate-detail-unavailable"
          locale={locale}
        />
      </main>
    );
  }
  if (error || !view) {
    return (
      <main className={styles.screen} data-screen-id="P5-COM-UI-03">
        <StatePanel
          state="failed"
          title={copy("detailFailedTitle")}
          body={copy("detailFailedBody")}
          action={retry}
          testId="certificate-detail-failed"
          locale={locale}
        />
      </main>
    );
  }

  const stateCopy = certificateStateCopy(locale, view.state);
  const canOpenArtifacts = view.state === "available";

  return (
    <main
      className={styles.screen}
      data-screen-id="P5-COM-UI-03"
      data-testid="certificate-support-detail"
    >
      <CanvasPageHeader
        theme={theme}
        title={copy("detailPageTitle", {
          certificateNo: view.certificateNo,
        })}
        subtitle={copy("detailPageSubtitle")}
        actions={
          <CanvasPill theme={theme} tone={stateCopy.tone} dot>
            {stateCopy.label} · {view.state}
          </CanvasPill>
        }
      />
      <div className={styles.body}>
        <Link className={styles.backLink} href="/multi-taxi-certificates">
          {copy("backToSearch")}
        </Link>
        <CanvasBanner
          theme={theme}
          tone={bannerTone(stateCopy.tone)}
          title={stateCopy.label}
          body={stateCopy.detail}
        />
        {view.state === "superseded" ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            title={copy("supersededTitle")}
            body={copy("supersededBody", {
              certificateId: displayCertificateValue(
                locale,
                view.supersededByCertificateId,
              ),
            })}
          />
        ) : null}
        <div className={styles.detailGrid}>
          <CanvasCard theme={theme} title={copy("legalFieldsTitle")}>
            <CanvasDL
              theme={theme}
              cols={2}
              items={[
                {
                  k: copy("fieldCertificateVersion"),
                  v: `${view.certificateNo} / ${displayCertificateValue(
                    locale,
                    view.certificateVersion,
                  )}`,
                  mono: true,
                },
                {
                  k: copy("fieldOrderTrip"),
                  v: `${view.orderId} / ${displayCertificateValue(
                    locale,
                    view.tripId,
                  )}`,
                  mono: true,
                },
                {
                  k: copy("fieldPlate"),
                  v: displayCertificateValue(locale, view.plateNo),
                  mono: true,
                },
                {
                  k: copy("fieldPickup"),
                  v: formatCertificateDateTime(locale, view.pickupAt),
                  mono: true,
                },
                {
                  k: copy("fieldDropoff"),
                  v: formatCertificateDateTime(locale, view.dropoffAt),
                  mono: true,
                },
                {
                  k: copy("fieldDuration"),
                  v: formatCertificateDuration(
                    locale,
                    view.travelDurationSeconds,
                  ),
                  mono: true,
                },
                {
                  k: copy("fieldRoute"),
                  v: displayCertificateValue(locale, view.routeSummary),
                },
                {
                  k: copy("fieldDistance"),
                  v: formatCertificateDistance(locale, view.distanceMeters),
                  mono: true,
                },
                {
                  k: copy("fieldFare"),
                  v: formatCertificateMoney(
                    locale,
                    view.fareMinor,
                    view.currency,
                  ),
                  mono: true,
                },
                {
                  k: copy("fieldToll"),
                  v: formatCertificateMoney(
                    locale,
                    view.tollMinor,
                    view.currency,
                  ),
                  mono: true,
                },
                {
                  k: copy("fieldServicePhone"),
                  v: displayCertificateValue(locale, view.consumerServicePhone),
                  mono: true,
                },
                {
                  k: copy("fieldComplaintPhone"),
                  v: displayCertificateValue(
                    locale,
                    view.authorityComplaintPhone,
                  ),
                  mono: true,
                },
                {
                  k: copy("fieldIssuedAt"),
                  v: formatCertificateDateTime(locale, view.issuedAt),
                  mono: true,
                },
              ]}
            />
            <div className={styles.actions}>
              {canOpenArtifacts && view.htmlUrl ? (
                <a
                  className={styles.artifactLink}
                  href={view.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy("openHtml")}
                </a>
              ) : null}
              {canOpenArtifacts && view.pdfUrl ? (
                <a
                  className={styles.artifactLink}
                  href={view.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy("openPdf")}
                </a>
              ) : null}
              {!view.htmlUrl && !view.pdfUrl ? (
                <span className={styles.muted}>
                  {copy("artifactsUnavailable")}
                </span>
              ) : null}
            </div>
          </CanvasCard>
          <div style={{ display: "grid", gap: 16 }}>
            <StateCatalog locale={locale} />
            <CanvasCard
              theme={theme}
              title={copy("regenerationTitle")}
              subtitle={copy("regenerationSubtitle")}
            >
              {view.regeneration.enabled && canWrite ? (
                <form
                  className={styles.regenerationForm}
                  onSubmit={regenerateCertificate}
                >
                  <label className={styles.regenerationLabel}>
                    {copy("regenerationReasonLabel")}
                    <textarea
                      className={styles.reasonInput}
                      value={regenerationReason}
                      onChange={(event) =>
                        setRegenerationReason(event.target.value)
                      }
                      maxLength={500}
                      required
                    />
                  </label>
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    type="submit"
                    disabled={
                      regenerating || regenerationReason.trim().length === 0
                    }
                  >
                    {regenerating
                      ? copy("regenerating")
                      : copy("regenerationAction")}
                  </CanvasBtn>
                </form>
              ) : (
                <>
                  <CanvasPill theme={theme} tone="neutral" dot>
                    {copy("disabled")}
                  </CanvasPill>
                  <p className={styles.muted} style={monoStyle}>
                    {view.regeneration.reasonCode ??
                      "certificate_write_scope_required"}
                  </p>
                  <p className={styles.muted}>
                    {canWrite
                      ? copy("regenerationUnavailableBody")
                      : copy("regenerationScopeBody")}
                  </p>
                </>
              )}
              {regenerationAuditId ? (
                <CanvasBanner
                  theme={theme}
                  tone="success"
                  title={copy("regenerationSuccess")}
                  body={copy("regenerationAudit", {
                    auditId: regenerationAuditId,
                  })}
                />
              ) : null}
              {regenerationError ? (
                <CanvasBanner
                  theme={theme}
                  tone="danger"
                  title={copy("regenerationFailed")}
                  body={regenerationError}
                />
              ) : null}
            </CanvasCard>
          </div>
        </div>
      </div>
    </main>
  );
}

function bannerTone(tone: CertificateTone) {
  return tone === "neutral" ? ("info" as const) : tone;
}
