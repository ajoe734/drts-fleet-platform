"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

import { usePlatformAdminClient } from "@/lib/admin-client";
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
  FARE_ANOMALY_REASON_COPY,
  formatFareMinor,
  formatRoute,
  hasFareAnomalyReadScope,
  hasFareAnomalyWriteScope,
  parseFareAnomalyListReadModel,
  parseFareAnomalyResourceReadModel,
  resolveFareAnomalyPageState,
  resolveRetryAction,
} from "./fare-anomaly-model";
import styles from "./fare-anomaly.module.css";

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
        title="費率異常 · Fare Anomalies"
        subtitle="P5-COM-UI-01 · 正式報價完成前不確認訂單 · 不提供人工金額欄位"
        actions={
          <CanvasPill
            theme={theme}
            tone={items.length ? "warn" : "neutral"}
            dot
          >
            {items.length} 筆待處理
          </CanvasPill>
        }
      />
      <div style={pageStyle}>
        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="lock"
          title="Fail closed"
          body="異常報價不可自動確認固定車資；所有回復動作只依後端 availableActions 顯示。"
        />

        {state === "permission_denied" ? (
          <CanvasEmptyState
            theme={theme}
            tone="danger"
            title="無權檢視費率異常"
            body="需要 foundation:read。頁面不會在前端推算或顯示替代資料。"
          />
        ) : null}
        {state === "loading" ? (
          <CanvasEmptyState
            theme={theme}
            tone="info"
            title="載入費率異常"
            body="正在讀取伺服器權威資料。"
          />
        ) : null}
        {state === "error" ? (
          <CanvasEmptyState
            theme={theme}
            tone="danger"
            title="費率異常資料無法使用"
            body={error ?? "讀取失敗"}
            action={
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                重新讀取
              </CanvasBtn>
            }
          />
        ) : null}
        {state === "empty" ? (
          <CanvasEmptyState
            theme={theme}
            tone="success"
            title="目前沒有待處理異常"
            body="伺服器目前未回傳未解決的報價異常。"
          />
        ) : null}

        {state === "ready" ? (
          <>
            <CanvasCard theme={theme} padding={12}>
              <label style={{ fontSize: 12, color: theme.textMuted }}>
                異常原因{" "}
                <select
                  aria-label="異常原因"
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
                  <option value="all">全部</option>
                  {Object.entries(FARE_ANOMALY_REASON_COPY).map(
                    ([code, copy]) => (
                      <option key={code} value={code}>
                        {copy.title}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </CanvasCard>

            {items.map((item) => {
              const quoteSnapshotId = item.snapshot.quoteSnapshotId;
              const copy = FARE_ANOMALY_REASON_COPY[item.reason];
              const retry = resolveRetryAction(item, canWrite);
              return (
                <CanvasCard key={quoteSnapshotId} theme={theme} padding={14}>
                  <div style={cardRowStyle}>
                    <CanvasPill theme={theme} tone="warn" dot>
                      {copy.title}
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
                      {formatFareMinor(item.snapshot.estimatedFareMinor)}
                      {item.reason === "calculation_mismatch"
                        ? ` / ${formatFareMinor(
                            item.snapshot.payableFareMinor,
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
                            ? "重新報價處理中"
                            : "重新取得報價"}
                        </CanvasBtn>
                      </span>
                    ) : (
                      <CanvasPill theme={theme} tone="neutral">
                        無伺服器回復動作
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
                    費率版本 {item.snapshot.farePolicyVersion}
                    {" · "}
                    可否重試由後端回傳
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
            body={`Audit ${receipt.auditId} · ${receipt.status}`}
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
            ? `${item.snapshot.orderId} · ${FARE_ANOMALY_REASON_COPY[item.reason].title}`
            : "費率異常明細"
        }
        subtitle="P5-COM-UI-01 · Fare Anomaly Detail"
        actions={
          <Link href="/p5-fare-anomalies" style={linkStyle}>
            返回異常清單
          </Link>
        }
      />
      <div style={pageStyle}>
        {state === "permission_denied" ? (
          <CanvasEmptyState
            theme={theme}
            tone="danger"
            title="無權檢視費率異常"
            body="需要 foundation:read。"
          />
        ) : null}
        {state === "loading" ? (
          <CanvasEmptyState
            theme={theme}
            tone="info"
            title="載入異常明細"
            body="正在讀取伺服器權威資料。"
          />
        ) : null}
        {state === "error" ? (
          <CanvasEmptyState
            theme={theme}
            tone="danger"
            title="異常明細無法使用"
            body={error ?? "讀取失敗"}
            action={
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                重新讀取
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
              title={FARE_ANOMALY_REASON_COPY[item.reason].title}
              body={FARE_ANOMALY_REASON_COPY[item.reason].guidance}
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
              <CanvasCard theme={theme} title="路線與報價快照">
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      k: "訂單",
                      v: item.snapshot.orderId,
                      mono: true,
                    },
                    {
                      k: "Quote Snapshot",
                      v: item.snapshot.quoteSnapshotId,
                      mono: true,
                    },
                    { k: "路線", v: formatRoute(item) },
                    {
                      k: "計費模式",
                      v: item.snapshot.chargingMode,
                      mono: true,
                    },
                    {
                      k: "預估車資",
                      v: formatFareMinor(item.snapshot.estimatedFareMinor),
                      mono: true,
                    },
                    {
                      k: "應付車資",
                      v: formatFareMinor(item.snapshot.payableFareMinor),
                      mono: true,
                    },
                    {
                      k: "費率版本",
                      v: item.snapshot.farePolicyVersion,
                      mono: true,
                    },
                    {
                      k: "乘客確認",
                      v: "未確認 · anomaly fail-closed",
                    },
                  ]}
                />
              </CanvasCard>
              <CanvasCard
                theme={theme}
                title="伺服器回復權威"
                subtitle="availableActions"
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
                          ? "重新報價處理中"
                          : "重新取得報價"}
                      </CanvasBtn>
                    </span>
                  ) : (
                    <CanvasPill theme={theme} tone="neutral">
                      無伺服器回復動作
                    </CanvasPill>
                  )}
                  {item.lastRecoveryRequestedAt ? (
                    <span style={{ fontSize: 11, color: theme.textMuted }}>
                      最近要求：{item.lastRecoveryRequestedAt}
                    </span>
                  ) : null}
                  <CanvasBanner
                    theme={theme}
                    tone="info"
                    icon="info"
                    body="此畫面沒有人工金額覆寫、套用草稿費率或直接確認訂單的控制。"
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
            body={`Audit ${receipt.auditId} · ${receipt.status}`}
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
  return (
    <div
      role="dialog"
      aria-label="確認重新取得報價"
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
        確認向正式報價服務重新取得報價？此操作不會接受人工車資。
      </span>
      <CanvasBtn theme={theme} size="xs" disabled={busy} onClick={onCancel}>
        取消
      </CanvasBtn>
      <CanvasBtn
        theme={theme}
        size="xs"
        variant="primary"
        disabled={busy}
        onClick={onConfirm}
      >
        {busy ? "送出中" : "確認重新報價"}
      </CanvasBtn>
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "FARE_ANOMALY_READ_FAILED";
}
