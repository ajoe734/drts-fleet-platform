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
  CERTIFICATE_STATE_COPY,
  CERTIFICATE_SUPPORT_STATES,
  classifyCertificateSupportError,
  displayValue,
  formatDistance,
  formatDuration,
  formatMoney,
  hasCertificateReadScope,
  parseCertificateSupportList,
  parseCertificateSupportView,
  type CertificateSupportErrorKind,
  type CertificateSupportState,
  type CertificateSupportView,
} from "./certificate-support-model";
import styles from "./certificate-support.module.css";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });
const monoStyle: CSSProperties = { fontFamily: theme.monoFamily };

function StateCatalog() {
  return (
    <CanvasCard theme={theme} title="支援狀態 × 6">
      <div className={styles.stateGrid} data-testid="certificate-state-catalog">
        {CERTIFICATE_SUPPORT_STATES.map((state) => {
          const copy = CERTIFICATE_STATE_COPY[state];
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
}: {
  state: CertificateSupportState;
  title: string;
  body: string;
  action?: ReactNode;
  testId: string;
}) {
  return (
    <div className={styles.body} data-testid={testId}>
      <CanvasBanner
        theme={theme}
        tone={bannerTone(CERTIFICATE_STATE_COPY[state].tone)}
        title={title}
        body={body}
        actions={action}
      />
      <StateCatalog />
    </div>
  );
}

export function CertificateSupportSearchScreen() {
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
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
        title="電子乘車證明支援 · Certificate Support"
        subtitle="P5-COM-UI-03 · 搜尋與開啟既有證明 · 重新產生維持 command pending"
        actions={
          <CanvasPill theme={theme} tone="neutral" dot>
            只讀支援
          </CanvasPill>
        }
      />
      <div className={styles.body}>
        <CanvasBanner
          theme={theme}
          tone="info"
          icon="lock"
          title="既有憑證 authority"
          body="本頁只讀取 reporting.multi_taxi_electronic_receipts；缺少的法定欄位顯示「未取得」，不以前端推算或補零。"
        />

        <CanvasCard theme={theme} title="定位乘車證明">
          <form className={styles.searchForm} onSubmit={submitSearch}>
            <input
              className={styles.input}
              aria-label="搜尋訂單、行程或證明編號"
              placeholder="訂單 / 行程 / 證明編號"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              maxLength={120}
            />
            <select
              className={styles.select}
              aria-label="乘車證明狀態"
              value={state}
              onChange={(event) =>
                setState(event.target.value as CertificateSupportState | "all")
              }
            >
              <option value="all">全部狀態</option>
              {CERTIFICATE_SUPPORT_STATES.map((itemState) => (
                <option value={itemState} key={itemState}>
                  {CERTIFICATE_STATE_COPY[itemState].label} · {itemState}
                </option>
              ))}
            </select>
            <CanvasBtn theme={theme} variant="primary" type="submit">
              搜尋既有證明
            </CanvasBtn>
          </form>
        </CanvasCard>

        <StateCatalog />

        {loading ? (
          <CanvasEmptyState
            theme={theme}
            tone="info"
            title="讀取乘車證明"
            body="正在查詢伺服器權威資料。"
          />
        ) : null}
        {error === "access_denied" ? (
          <CanvasEmptyState
            theme={theme}
            tone="danger"
            title="無存取權"
            body="需要 Platform Admin 的 foundation:read；頁面不會顯示憑證資料。"
          />
        ) : null}
        {error === "failed" ? (
          <CanvasEmptyState
            theme={theme}
            tone="danger"
            title="讀取失敗"
            body="無法取得既有乘車證明。可重新執行只讀查詢，不會觸發重產生。"
            action={
              <CanvasBtn
                theme={theme}
                onClick={() => setReloadToken((value) => value + 1)}
              >
                重新讀取
              </CanvasBtn>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <CanvasEmptyState
            theme={theme}
            tone="neutral"
            title="沒有符合的既有乘車證明"
            body="此結果為 unavailable；請確認訂單、行程或證明編號。"
          />
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <CanvasCard theme={theme} title={`搜尋結果 · ${items.length} 筆`}>
            <div className={styles.results}>
              {items.map((item) => (
                <article className={styles.resultCard} key={item.certificateId}>
                  <div>
                    <h3 className={styles.resultTitle}>{item.certificateNo}</h3>
                    <p className={styles.muted}>
                      訂單 <span className={styles.mono}>{item.orderId}</span>
                    </p>
                    <p className={styles.muted}>
                      行程{" "}
                      <span className={styles.mono}>
                        {displayValue(item.tripId)}
                      </span>
                    </p>
                  </div>
                  <div>
                    <CanvasPill
                      theme={theme}
                      tone={CERTIFICATE_STATE_COPY[item.state].tone}
                      dot
                    >
                      {CERTIFICATE_STATE_COPY[item.state].label} · {item.state}
                    </CanvasPill>
                    <p className={styles.muted}>
                      車牌 {displayValue(item.plateNo)}
                    </p>
                    <p className={styles.muted}>
                      簽發 {formatDateTime(item.issuedAt)}
                    </p>
                  </div>
                  <Link
                    className={styles.openLink}
                    href={`/multi-taxi-certificates/${encodeURIComponent(
                      item.certificateId,
                    )}`}
                  >
                    開啟明細
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
  const canRead = hasCertificateReadScope(authority.scopes);
  const [view, setView] = useState<CertificateSupportView | null>(null);
  const [loading, setLoading] = useState(canRead);
  const [error, setError] = useState<CertificateSupportErrorKind | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

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

  const retry = (
    <CanvasBtn
      theme={theme}
      onClick={() => setReloadToken((value) => value + 1)}
    >
      重新讀取
    </CanvasBtn>
  );

  if (loading) {
    return (
      <main className={styles.screen} data-screen-id="P5-COM-UI-03">
        <StatePanel
          state="generating"
          title="讀取乘車證明"
          body="正在讀取既有憑證與法定欄位。"
          testId="certificate-detail-loading"
        />
      </main>
    );
  }
  if (error === "access_denied") {
    return (
      <main className={styles.screen} data-screen-id="P5-COM-UI-03">
        <StatePanel
          state="access_denied"
          title="無存取權"
          body="需要 Platform Admin 的 foundation:read；憑證資料未顯示。"
          testId="certificate-detail-access-denied"
        />
      </main>
    );
  }
  if (error === "not_found") {
    return (
      <main className={styles.screen} data-screen-id="P5-COM-UI-03">
        <StatePanel
          state="unavailable"
          title="乘車證明不可用"
          body="找不到指定的既有乘車證明，沒有產生替代資料。"
          action={retry}
          testId="certificate-detail-unavailable"
        />
      </main>
    );
  }
  if (error || !view) {
    return (
      <main className={styles.screen} data-screen-id="P5-COM-UI-03">
        <StatePanel
          state="failed"
          title="乘車證明讀取失敗"
          body="可重新執行只讀查詢；重新產生命令仍未核准。"
          action={retry}
          testId="certificate-detail-failed"
        />
      </main>
    );
  }

  const stateCopy = CERTIFICATE_STATE_COPY[view.state];
  const canOpenArtifacts = view.state === "available";

  return (
    <main
      className={styles.screen}
      data-screen-id="P5-COM-UI-03"
      data-testid="certificate-support-detail"
    >
      <CanvasPageHeader
        theme={theme}
        title={`電子乘車證明 · ${view.certificateNo}`}
        subtitle="P5-COM-UI-03 · 既有憑證明細 · 缺值不補零"
        actions={
          <CanvasPill theme={theme} tone={stateCopy.tone} dot>
            {stateCopy.label} · {view.state}
          </CanvasPill>
        }
      />
      <div className={styles.body}>
        <Link className={styles.backLink} href="/multi-taxi-certificates">
          返回乘車證明搜尋
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
            title="版本已被取代"
            body={`後續憑證：${displayValue(
              view.supersededByCertificateId,
            )}。本頁不把舊版標示為有效版本。`}
          />
        ) : null}
        <div className={styles.detailGrid}>
          <CanvasCard theme={theme} title="法定乘車證明欄位">
            <CanvasDL
              theme={theme}
              cols={2}
              items={[
                {
                  k: "證明編號 / 版本",
                  v: `${view.certificateNo} / ${displayValue(
                    view.certificateVersion,
                  )}`,
                  mono: true,
                },
                {
                  k: "訂單 / 行程",
                  v: `${view.orderId} / ${displayValue(view.tripId)}`,
                  mono: true,
                },
                {
                  k: "車號",
                  v: displayValue(view.plateNo),
                  mono: true,
                },
                {
                  k: "上車時間",
                  v: formatDateTime(view.pickupAt),
                  mono: true,
                },
                {
                  k: "下車時間",
                  v: formatDateTime(view.dropoffAt),
                  mono: true,
                },
                {
                  k: "行駛時間",
                  v: formatDuration(view.travelDurationSeconds),
                  mono: true,
                },
                {
                  k: "路線",
                  v: displayValue(view.routeSummary),
                },
                {
                  k: "里程",
                  v: formatDistance(view.distanceMeters),
                  mono: true,
                },
                {
                  k: "車資",
                  v: formatMoney(view.fareMinor, view.currency),
                  mono: true,
                },
                {
                  k: "通行費",
                  v: formatMoney(view.tollMinor, view.currency),
                  mono: true,
                },
                {
                  k: "客服電話",
                  v: displayValue(view.consumerServicePhone),
                  mono: true,
                },
                {
                  k: "主管機關申訴電話",
                  v: displayValue(view.authorityComplaintPhone),
                  mono: true,
                },
                {
                  k: "簽發時間",
                  v: formatDateTime(view.issuedAt),
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
                  開啟 HTML
                </a>
              ) : null}
              {canOpenArtifacts && view.pdfUrl ? (
                <a
                  className={styles.artifactLink}
                  href={view.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  開啟 PDF
                </a>
              ) : null}
              {!view.htmlUrl && !view.pdfUrl ? (
                <span className={styles.muted}>既有 HTML/PDF 連結未取得</span>
              ) : null}
              <button
                className={styles.disabledAction}
                type="button"
                disabled
                title={view.regeneration.reasonCode}
              >
                重新產生 · 命令未核准
              </button>
            </div>
          </CanvasCard>
          <div style={{ display: "grid", gap: 16 }}>
            <StateCatalog />
            <CanvasCard
              theme={theme}
              title="重新產生"
              subtitle="production command posture"
            >
              <CanvasPill theme={theme} tone="neutral" dot>
                disabled
              </CanvasPill>
              <p className={styles.muted} style={monoStyle}>
                {view.regeneration.reasonCode}
              </p>
              <p className={styles.muted}>
                尚無 canonical command；本頁不提供假動作。
              </p>
            </CanvasCard>
          </div>
        </div>
      </div>
    </main>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "未取得";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(date);
}

function bannerTone(
  tone: (typeof CERTIFICATE_STATE_COPY)[CertificateSupportState]["tone"],
) {
  return tone === "neutral" ? ("info" as const) : tone;
}
