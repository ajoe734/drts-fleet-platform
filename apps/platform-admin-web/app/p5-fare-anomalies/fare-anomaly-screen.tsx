"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { usePlatformAdminAuthority } from "@/lib/platform-admin-authority";
import type {
  ActionReceipt,
  FareQuoteAnomaly,
  FareQuoteAnomalyAdminView,
} from "@drts/contracts";
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
  formatRoute,
  hasFareAnomalyReadScope,
  hasFareAnomalyWriteScope,
  parseFareAnomalyListReadModel,
  parseFareAnomalyResourceReadModel,
  resolveFareAnomalyPageState,
  resolveRetryAction,
} from "./fare-anomaly-model";
import styles from "./fare-anomaly.module.css";
import { formatFareMinor, getFareAnomalyCopy } from "./translations";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });
const pageStyle: CSSProperties = {
  padding: "clamp(12px, 3vw, 24px)",
  display: "grid",
  gap: 14,
};
const cardRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 10,
};
const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
  fontSize: 11,
};
const linkStyle: CSSProperties = {
  color: theme.accent,
  textDecoration: "none",
  fontWeight: 700,
};

export function FareAnomalyQueueScreen() {
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const { locale } = useTranslation();
  const copy = getFareAnomalyCopy(locale);
  const canRead = hasFareAnomalyReadScope(authority.scopes);
  const canWrite = hasFareAnomalyWriteScope(authority.scopes);
  const [items, setItems] = useState<FareQuoteAnomalyAdminView[]>([]);
  const [loading, setLoading] = useState(canRead);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<FareQuoteAnomaly | "all">("all");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      setItems([]);
      return;
    }

    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const query =
          reason === "all" ? "" : `?reason=${encodeURIComponent(reason)}`;
        const payload = await client.get<unknown>(
          `/api/product-rule/fare-anomalies${query}`,
          { signal: controller.signal },
        );
        setItems(parseFareAnomalyListReadModel(payload).items);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setItems([]);
          setError(errorMessage(loadError));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [canRead, client, reason, reloadToken]);

  async function recover(item: FareQuoteAnomalyAdminView) {
    const descriptor = resolveRetryAction(item, canWrite);
    if (!descriptor?.enabled) return;

    const quoteSnapshotId = item.snapshot.quoteSnapshotId;
    setRecoveringId(quoteSnapshotId);
    setError(null);
    try {
      const nextReceipt = await client.post<ActionReceipt>(
        `/api/product-rule/fare-anomalies/${encodeURIComponent(
          quoteSnapshotId,
        )}/actions/retry-quote`,
      );
      setReceipt(nextReceipt);
      setConfirmingId(null);
      setReloadToken((token) => token + 1);
    } catch (recoveryError) {
      setError(errorMessage(recoveryError));
    } finally {
      setRecoveringId(null);
    }
  }

  const state = resolveFareAnomalyPageState({
    canRead,
    loading,
    error,
    itemCount: items.length,
  });

  return (
    <main className={styles.screen} data-screen-id="P5-COM-UI-01">
      <CanvasPageHeader
        theme={theme}
        title={copy.queue.title}
        subtitle={copy.queue.subtitle}
        actions={
          <CanvasPill
            theme={theme}
            tone={items.length ? "warn" : "neutral"}
            dot
          >
            {copy.queue.pendingCount(items.length)}
          </CanvasPill>
        }
      />
      <div style={pageStyle}>
        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="lock"
          title={copy.queue.failClosedTitle}
          body={copy.queue.failClosedBody}
        />

        {state === "permission_denied" ? (
          <CanvasEmptyState
            theme={theme}
            tone="danger"
            title={copy.queue.permissionDeniedTitle}
            body={copy.queue.permissionDeniedBody}
          />
        ) : null}
        {state === "loading" ? (
          <CanvasEmptyState
            theme={theme}
            tone="info"
            title={copy.queue.loadingTitle}
            body={copy.common.authorityLoading}
          />
        ) : null}
        {state === "error" ? (
          <CanvasEmptyState
            theme={theme}
            tone="danger"
            title={copy.queue.errorTitle}
            body={error ?? copy.common.readFailed}
            action={
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                {copy.common.reload}
              </CanvasBtn>
            }
          />
        ) : null}
        {state === "empty" ? (
          <CanvasEmptyState
            theme={theme}
            tone="success"
            title={copy.queue.emptyTitle}
            body={copy.queue.emptyBody}
          />
        ) : null}

        {state === "ready" ? (
          <>
            <CanvasCard theme={theme} padding={12}>
              <label style={{ fontSize: 12, color: theme.textMuted }}>
                {copy.queue.reasonLabel}{" "}
                <select
                  aria-label={copy.queue.reasonLabel}
                  value={reason}
                  onChange={(event) =>
                    setReason(event.target.value as FareQuoteAnomaly | "all")
                  }
                  style={{
                    marginLeft: 8,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 7,
                    padding: "6px 9px",
                    color: theme.text,
                    background: theme.surface,
                  }}
                >
                  <option value="all">{copy.queue.allReasons}</option>
                  {Object.entries(copy.reasons).map(([code, reasonCopy]) => (
                    <option key={code} value={code}>
                      {reasonCopy.title}
                    </option>
                  ))}
                </select>
              </label>
            </CanvasCard>

            {items.map((item) => {
              const quoteSnapshotId = item.snapshot.quoteSnapshotId;
              const reasonCopy = copy.reasons[item.reason];
              const retry = resolveRetryAction(item, canWrite);
              return (
                <CanvasCard key={quoteSnapshotId} theme={theme} padding={14}>
                  <div style={cardRowStyle}>
                    <CanvasPill theme={theme} tone="warn" dot>
                      {reasonCopy.title}
                    </CanvasPill>
                    <Link
                      href={`/p5-fare-anomalies/${encodeURIComponent(
                        quoteSnapshotId,
                      )}`}
                      style={linkStyle}
                    >
                      {item.snapshot.orderId}
                    </Link>
                    <span style={{ flex: 1, minWidth: 220, fontSize: 12.5 }}>
                      {formatRoute(item)}
                    </span>
                    <span style={monoStyle}>
                      {formatFareMinor(
                        item.snapshot.estimatedFareMinor,
                        locale,
                      )}
                      {item.reason === "calculation_mismatch"
                        ? ` / ${formatFareMinor(
                            item.snapshot.payableFareMinor,
                            locale,
                          )}`
                        : ""}
                    </span>
                    {retry ? (
                      <span title={retry.disabledReasonCode}>
                        <CanvasBtn
                          theme={theme}
                          size="xs"
                          variant="primary"
                          disabled={
                            !retry.enabled || recoveringId === quoteSnapshotId
                          }
                          onClick={() => setConfirmingId(quoteSnapshotId)}
                        >
                          {item.recoveryPending
                            ? copy.common.recoveryPending
                            : copy.common.retryQuote}
                        </CanvasBtn>
                      </span>
                    ) : (
                      <CanvasPill theme={theme} tone="neutral">
                        {copy.common.noServerRecoveryAction}
                      </CanvasPill>
                    )}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      color: theme.textDim,
                      fontSize: 10.5,
                    }}
                  >
                    <span style={monoStyle}>{item.reason}</span>
                    {" · "}
                    {copy.queue.farePolicyVersion(
                      item.snapshot.farePolicyVersion,
                    )}
                    {" · "}
                    {copy.queue.retryAuthority}
                  </div>
                  {confirmingId === quoteSnapshotId ? (
                    <RecoveryConfirmation
                      busy={recoveringId === quoteSnapshotId}
                      onCancel={() => setConfirmingId(null)}
                      onConfirm={() => void recover(item)}
                    />
                  ) : null}
                </CanvasCard>
              );
            })}
          </>
        ) : null}

        {receipt ? (
          <CanvasBanner
            theme={theme}
            tone="success"
            icon="check"
            title={receipt.message}
            body={copy.common.auditReceipt(receipt.auditId, receipt.status)}
          />
        ) : null}
      </div>
    </main>
  );
}

export function FareAnomalyDetailScreen({
  quoteSnapshotId,
}: {
  quoteSnapshotId: string;
}) {
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const { locale } = useTranslation();
  const copy = getFareAnomalyCopy(locale);
  const canRead = hasFareAnomalyReadScope(authority.scopes);
  const canWrite = hasFareAnomalyWriteScope(authority.scopes);
  const [item, setItem] = useState<FareQuoteAnomalyAdminView | null>(null);
  const [loading, setLoading] = useState(canRead);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await client.get<unknown>(
          `/api/product-rule/fare-anomalies/${encodeURIComponent(
            quoteSnapshotId,
          )}`,
          { signal: controller.signal },
        );
        setItem(parseFareAnomalyResourceReadModel(payload).item);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setItem(null);
          setError(errorMessage(loadError));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [canRead, client, quoteSnapshotId, reloadToken]);

  async function recover() {
    if (!item || !resolveRetryAction(item, canWrite)?.enabled) return;
    setRecovering(true);
    setError(null);
    try {
      const nextReceipt = await client.post<ActionReceipt>(
        `/api/product-rule/fare-anomalies/${encodeURIComponent(
          quoteSnapshotId,
        )}/actions/retry-quote`,
      );
      setReceipt(nextReceipt);
      setConfirming(false);
      setReloadToken((token) => token + 1);
    } catch (recoveryError) {
      setError(errorMessage(recoveryError));
    } finally {
      setRecovering(false);
    }
  }

  const state = resolveFareAnomalyPageState({
    canRead,
    loading,
    error,
    itemCount: item ? 1 : 0,
  });
  const retry = item ? resolveRetryAction(item, canWrite) : null;

  return (
    <main
      className={styles.screen}
      data-screen-id="P5-COM-UI-01"
      data-screen-variant="detail"
    >
      <CanvasPageHeader
        theme={theme}
        title={
          item
            ? copy.detail.title(
                item.snapshot.orderId,
                copy.reasons[item.reason].title,
              )
            : copy.detail.fallbackTitle
        }
        subtitle={copy.detail.subtitle}
        actions={
          <Link href="/p5-fare-anomalies" style={linkStyle}>
            {copy.detail.backToQueue}
          </Link>
        }
      />
      <div style={pageStyle}>
        {state === "permission_denied" ? (
          <CanvasEmptyState
            theme={theme}
            tone="danger"
            title={copy.detail.permissionDeniedTitle}
            body={copy.detail.permissionDeniedBody}
          />
        ) : null}
        {state === "loading" ? (
          <CanvasEmptyState
            theme={theme}
            tone="info"
            title={copy.detail.loadingTitle}
            body={copy.common.authorityLoading}
          />
        ) : null}
        {state === "error" ? (
          <CanvasEmptyState
            theme={theme}
            tone="danger"
            title={copy.detail.errorTitle}
            body={error ?? copy.common.readFailed}
            action={
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                {copy.common.reload}
              </CanvasBtn>
            }
          />
        ) : null}
        {state === "ready" && item ? (
          <>
            <CanvasBanner
              theme={theme}
              tone="warn"
              icon="lock"
              title={copy.reasons[item.reason].title}
              body={copy.reasons[item.reason].guidance}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
                gap: 14,
                alignItems: "start",
              }}
            >
              <CanvasCard theme={theme} title={copy.detail.snapshotCardTitle}>
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      k: copy.detail.orderLabel,
                      v: item.snapshot.orderId,
                      mono: true,
                    },
                    {
                      k: copy.detail.quoteSnapshotLabel,
                      v: item.snapshot.quoteSnapshotId,
                      mono: true,
                    },
                    { k: copy.detail.routeLabel, v: formatRoute(item) },
                    {
                      k: copy.detail.chargingModeLabel,
                      v: item.snapshot.chargingMode,
                      mono: true,
                    },
                    {
                      k: copy.detail.estimatedFareLabel,
                      v: formatFareMinor(
                        item.snapshot.estimatedFareMinor,
                        locale,
                      ),
                      mono: true,
                    },
                    {
                      k: copy.detail.payableFareLabel,
                      v: formatFareMinor(
                        item.snapshot.payableFareMinor,
                        locale,
                      ),
                      mono: true,
                    },
                    {
                      k: copy.detail.farePolicyVersionLabel,
                      v: item.snapshot.farePolicyVersion,
                      mono: true,
                    },
                    {
                      k: copy.detail.passengerConfirmationLabel,
                      v: copy.detail.passengerUnconfirmed,
                    },
                  ]}
                />
              </CanvasCard>
              <CanvasCard
                theme={theme}
                title={copy.detail.recoveryCardTitle}
                subtitle={copy.detail.recoveryCardSubtitle}
              >
                <div style={{ display: "grid", gap: 10 }}>
                  <span style={monoStyle}>{item.reason}</span>
                  {retry ? (
                    <span title={retry.disabledReasonCode}>
                      <CanvasBtn
                        theme={theme}
                        variant="primary"
                        disabled={!retry.enabled || recovering}
                        onClick={() => setConfirming(true)}
                      >
                        {item.recoveryPending
                          ? copy.common.recoveryPending
                          : copy.common.retryQuote}
                      </CanvasBtn>
                    </span>
                  ) : (
                    <CanvasPill theme={theme} tone="neutral">
                      {copy.common.noServerRecoveryAction}
                    </CanvasPill>
                  )}
                  {item.lastRecoveryRequestedAt ? (
                    <span style={{ fontSize: 11, color: theme.textMuted }}>
                      {copy.detail.lastRequestedAt(
                        item.lastRecoveryRequestedAt,
                      )}
                    </span>
                  ) : null}
                  <CanvasBanner
                    theme={theme}
                    tone="info"
                    icon="info"
                    body={copy.detail.noManualControls}
                  />
                </div>
              </CanvasCard>
            </div>
            {confirming ? (
              <RecoveryConfirmation
                busy={recovering}
                onCancel={() => setConfirming(false)}
                onConfirm={() => void recover()}
              />
            ) : null}
          </>
        ) : null}
        {receipt ? (
          <CanvasBanner
            theme={theme}
            tone="success"
            icon="check"
            title={receipt.message}
            body={copy.common.auditReceipt(receipt.auditId, receipt.status)}
          />
        ) : null}
      </div>
    </main>
  );
}

function RecoveryConfirmation({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { locale } = useTranslation();
  const copy = getFareAnomalyCopy(locale);

  return (
    <div
      role="dialog"
      aria-label={copy.confirmation.ariaLabel}
      style={{
        marginTop: 12,
        padding: 12,
        border: `1px solid ${theme.warnBorder}`,
        borderRadius: 8,
        background: theme.warnBg,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span style={{ flex: 1, fontSize: 12, color: theme.warn }}>
        {copy.confirmation.prompt}
      </span>
      <CanvasBtn theme={theme} size="xs" disabled={busy} onClick={onCancel}>
        {copy.confirmation.cancel}
      </CanvasBtn>
      <CanvasBtn
        theme={theme}
        size="xs"
        variant="primary"
        disabled={busy}
        onClick={onConfirm}
      >
        {busy ? copy.confirmation.submitting : copy.confirmation.confirm}
      </CanvasBtn>
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "FARE_ANOMALY_READ_FAILED";
}
