"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { usePlatformAdminAuthority } from "@/lib/platform-admin-authority";
import type { MultiTaxiTripOperationalAdminView } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

import {
  listDisclosureReviews,
  getDisclosureReview,
  decideDisclosureReview,
  disclosureReviewKey,
  disclosureReviewFailure,
  type DisclosureReviewItem,
} from "./p5-disclosure-review-model";
import { PublicFareManagement } from "./fares/public-fare-management";

type P5View = "disclosure" | "queue" | "fares" | "records";

type TripOperationalRow = MultiTaxiTripOperationalAdminView &
  Record<string, unknown>;

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const splitStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 1fr)",
  alignItems: "start",
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const inputStyle: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  background: theme.bgRaised,
  color: theme.text,
  padding: "8px 10px",
  minHeight: 36,
};

function requiresAnyScope(scopeSet: Set<string>, scopes: string[]) {
  return scopes.some((scope) => scopeSet.has(scope));
}

function formatCurrencyMinor(amountMinor: number, locale: string) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function formatMonthLabel(month: string, locale: string) {
  const [year, value] = month.split("-");
  return locale === "zh" ? `${year}-${value}` : `${year}-${value}`;
}

export function P5AdminConsole({ view }: { view: P5View }) {
  return view === "disclosure" || view === "queue" ? (
    <P5DisclosureReview view={view} />
  ) : (
    <P5OtherAdminConsole view={view} />
  );
}
function P5DisclosureReview({ view }: { view: "disclosure" | "queue" }) {
  const { locale, t } = useTranslation();
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const canRead = authority.scopes.includes("regulatory:read");
  const canReview = authority.scopes.includes("regulatory:write");
  const zh = locale === "zh";
  const [items, setItems] = useState<DisclosureReviewItem[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<DisclosureReviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<
    typeof disclosureReviewFailure
  > | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    setError(null);
    setDetail(null);
    setItems([]);
    setLoading(true);
    if (!canRead) {
      setLoading(false);
      return;
    }
    void listDisclosureReviews(client)
      .then((result) => {
        if (active) {
          setItems(result.items);
          setSelected((current) =>
            result.items.some((item) => disclosureReviewKey(item) === current)
              ? current
              : result.items[0]
                ? disclosureReviewKey(result.items[0])
                : "",
          );
        }
      })
      .catch((failure: unknown) => {
        if (active) setError(disclosureReviewFailure(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canRead, client, view]);
  const item = items.find(
    (candidate) => disclosureReviewKey(candidate) === selected,
  );
  const subjectType = item?.subjectType;
  const subjectId = item?.subjectId;
  useEffect(() => {
    let active = true;
    setDetail(null);
    setReason("");
    attempt.current = null;
    if (!subjectType || !subjectId) return;
    void getDisclosureReview(client, { subjectType, subjectId })
      .then((result) => {
        if (active) {
          setDetail(result);
          setError(null);
        }
      })
      .catch((failure: unknown) => {
        if (active) setError(disclosureReviewFailure(failure));
      });
    return () => {
      active = false;
    };
  }, [client, subjectType, subjectId]);
  async function decide(action: "approve" | "return") {
    if (!detail || !canReview || busy || !reason.trim()) return;
    setBusy(true);
    setError(null);
    const command = {
      action,
      reason: reason.trim(),
      expectedVersion: detail.version,
      sourceSubmissionId: detail.sourceSubmissionId,
    };
    const payload = JSON.stringify({ subject: selected, ...command });
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: `p5-review-${crypto.randomUUID()}` };
    try {
      await decideDisclosureReview(
        client,
        detail,
        command,
        attempt.current.key,
      );
      const refreshed = await getDisclosureReview(client, detail);
      const queue = await listDisclosureReviews(client);
      setItems(queue.items);
      setDetail(refreshed);
      attempt.current = null;
    } catch (failure: unknown) {
      setError(disclosureReviewFailure(failure));
    } finally {
      setBusy(false);
    }
  }
  const record = detail?.record;
  return (
    <div style={pageBodyStyle}>
      <CanvasPageHeader
        theme={theme}
        title={t(view === "queue" ? "p5.queue.title" : "p5.disclosure.title")}
        subtitle={t(
          view === "queue" ? "p5.queue.subtitle" : "p5.disclosure.subtitle",
        )}
      />
      {!canRead ? (
        <CanvasBanner theme={theme} tone="info" body={t("p5.scope.denied")} />
      ) : (
        <>
          {error ? (
            <div role="alert" data-kind={error.kind}>
              <strong>
                {error.kind === "denied"
                  ? zh
                    ? "沒有審核讀取權限"
                    : "Access denied"
                  : error.kind === "missing"
                    ? zh
                      ? "主體已不存在"
                      : "Subject not found"
                    : zh
                      ? "暫時無法讀取或儲存"
                      : "Unavailable"}
              </strong>{" "}
              · {error.message}
            </div>
          ) : null}
          {loading ? (
            <div role="status">{t("p5.loading")}</div>
          ) : !items.length && !error ? (
            <div role="status">
              {zh ? "目前沒有揭露審核主體" : "No disclosure subjects"}
            </div>
          ) : null}
          <div style={splitStyle}>
            <CanvasCard
              theme={theme}
              title={zh ? "正式審核主體" : "Disclosure subjects"}
            >
              <ul>
                {items.map((candidate) => (
                  <li key={disclosureReviewKey(candidate)}>
                    <button
                      disabled={busy}
                      onClick={() =>
                        setSelected(disclosureReviewKey(candidate))
                      }
                    >
                      {candidate.label} · {candidate.subjectType} ·{" "}
                      {candidate.record.status}
                    </button>
                  </li>
                ))}
              </ul>
            </CanvasCard>
            <CanvasCard
              theme={theme}
              title={detail?.label ?? t("p5.queue.detailCard")}
            >
              {detail && record ? (
                <>
                  <div>
                    {detail.subjectType} · {detail.subjectId} ·{" "}
                    {zh ? "版本" : "Version"} {detail.version}
                  </div>
                  <div>
                    {zh ? "來源申請" : "Source submission"}:{" "}
                    {detail.sourceSubmissionId ?? "—"}
                  </div>
                  <div>
                    {zh ? "狀態" : "Status"}: {record.status}
                  </div>
                  {"vehicleId" in record ? (
                    <CanvasDL
                      theme={theme}
                      cols={2}
                      items={[
                        { k: t("p5.field.make"), v: record.make },
                        { k: t("p5.field.model"), v: record.model },
                        { k: t("p5.field.modelYear"), v: record.modelYear },
                        { k: t("p5.field.doorCount"), v: record.doorCount },
                        { k: t("p5.field.color"), v: record.color ?? "—" },
                      ]}
                    />
                  ) : (
                    <CanvasDL
                      theme={theme}
                      cols={2}
                      items={[
                        {
                          k: t("p5.field.registrationArea"),
                          v: record.registrationArea ?? "—",
                        },
                        {
                          k: t("p5.field.registrationNo"),
                          v: record.maskedDisplay,
                        },
                        {
                          k: t("p5.field.effectiveFrom"),
                          v: record.effectiveFrom ?? "—",
                        },
                        {
                          k: t("p5.field.effectiveUntil"),
                          v: record.effectiveUntil ?? "—",
                        },
                      ]}
                    />
                  )}
                  <div>
                    {zh ? "查核人員" : "Verified by"}:{" "}
                    {record.verifiedByActorId ?? "—"} ·{" "}
                    {record.verifiedAt ?? "—"}
                  </div>
                  {detail.missingFieldCodes.length ? (
                    <div role="status">
                      {zh ? "缺漏或失效欄位" : "Missing or invalid fields"}:{" "}
                      {detail.missingFieldCodes.join(", ")}
                    </div>
                  ) : null}
                  <label>
                    {zh ? "審核原因" : "Review reason"}
                    <textarea
                      aria-label="Review reason"
                      disabled={busy || !canReview}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <div style={actionRowStyle}>
                    <CanvasBtn
                      theme={theme}
                      disabled={!canReview || busy || !reason.trim()}
                      onClick={() => void decide("return")}
                    >
                      {t("p5.action.return")}
                    </CanvasBtn>
                    <CanvasBtn
                      theme={theme}
                      disabled={
                        !canReview ||
                        busy ||
                        !reason.trim() ||
                        !!detail.missingFieldCodes.length
                      }
                      onClick={() => void decide("approve")}
                    >
                      {t("p5.action.approve")}
                    </CanvasBtn>
                  </div>
                  {!canReview ? (
                    <CanvasBanner
                      theme={theme}
                      tone="info"
                      body={t("p5.scope.reviewOnly")}
                    />
                  ) : null}
                  <h3>{zh ? "審核歷史" : "Review history"}</h3>
                  <ol>
                    {detail.history.map((decision) => (
                      <li key={decision.decisionId}>
                        {decision.action} · {decision.actorId} ·{" "}
                        {decision.reason} · {decision.decidedAt} · v
                        {decision.toVersion}
                      </li>
                    ))}
                  </ol>
                </>
              ) : !loading && item && !error ? (
                <div role="status">{t("p5.loading")}</div>
              ) : null}
            </CanvasCard>
          </div>
        </>
      )}
    </div>
  );
}

function P5OtherAdminConsole({ view }: { view: P5View }) {
  const { locale, t } = useTranslation();
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const scopeSet = useMemo(() => new Set(authority.scopes), [authority.scopes]);
  const canReadTripRecords = requiresAnyScope(scopeSet, [
    "multi_taxi_records:read",
  ]);
  const [recordsRows, setRecordsRows] = useState<TripOperationalRow[]>([]);
  const [recordsMonthOptions, setRecordsMonthOptions] = useState<string[]>([]);
  const [recordsMonth, setRecordsMonth] = useState("");
  const [recordsLoading, setRecordsLoading] = useState(view === "records");
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const canAccessView =
    view === "records" ? canReadTripRecords : scopeSet.has("foundation:read");

  useEffect(() => {
    if (view !== "records" || !canReadTripRecords) {
      setRecordsLoading(false);
      setRecordsError(null);
      return;
    }

    let active = true;
    async function load() {
      setRecordsLoading(true);
      setRecordsError(null);
      try {
        const params = new URLSearchParams();
        if (recordsMonth) {
          params.set("month", recordsMonth);
        }
        const payload = await client.get<{
          items?: MultiTaxiTripOperationalAdminView[];
        }>(
          `/api/platform-admin/multi-taxi-trip-records${params.size > 0 ? `?${params.toString()}` : ""}`,
        );
        if (!active) {
          return;
        }
        const nextRows = (payload.items ?? []) as TripOperationalRow[];
        setRecordsRows(nextRows);
        if (!recordsMonth) {
          setRecordsMonthOptions(
            Array.from(
              new Set(nextRows.map((row) => row.reservedAt.slice(0, 7))),
            ).sort((left, right) => right.localeCompare(left)),
          );
        }
        if (!recordsMonth && nextRows[0]?.reservedAt) {
          setRecordsMonth(nextRows[0].reservedAt.slice(0, 7));
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setRecordsRows([]);
        setRecordsError(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) {
          setRecordsLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [canReadTripRecords, client, recordsMonth, view]);

  if (!canAccessView) {
    return (
      <div style={pageBodyStyle}>
        <CanvasPageHeader
          theme={theme}
          title={t(`p5.${view}.title`)}
          subtitle={t(`p5.${view}.subtitle`)}
        />
        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="lock"
          title={t("p5.scope.locked.title")}
          body={
            view === "records"
              ? t("p5.records.scope.locked.body")
              : t("p5.scope.locked.body")
          }
        />
      </div>
    );
  }

  if (view === "records") {
    if (!canReadTripRecords) {
      return (
        <div style={pageBodyStyle}>
          <CanvasPageHeader
            theme={theme}
            title={t("p5.records.title")}
            subtitle={t("p5.records.subtitle")}
          />
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="lock"
            title={t("p5.scope.locked.title")}
            body={t("p5.records.scope.locked.body")}
          />
        </div>
      );
    }

    const monthOptions = recordsMonthOptions;
    const coverageCount = recordsRows.filter((row) => {
      const generatedAt = Date.parse(row.generatedAt);
      const retainUntil = Date.parse(row.retainUntil);
      if (!Number.isFinite(generatedAt) || !Number.isFinite(retainUntil)) {
        return false;
      }
      return retainUntil - generatedAt >= 730 * 24 * 60 * 60 * 1000;
    }).length;
    const coveragePercent =
      recordsRows.length === 0
        ? 100
        : Math.round((coverageCount / recordsRows.length) * 100);
    const recordColumns: CanvasTableColumn<TripOperationalRow>[] = [
      {
        h: t("p5.records.col.order"),
        w: 150,
        r: (row) => (
          <span style={{ color: theme.accent, fontWeight: 600, ...monoStyle }}>
            {row.orderNo}
          </span>
        ),
      },
      { h: t("p5.records.col.plate"), k: "plateNo", w: 96, mono: true },
      {
        h: t("p5.records.col.reserved"),
        k: "reservedAt",
        w: 160,
        mono: true,
      },
      { h: t("p5.records.col.pickup"), k: "pickupAt", w: 160, mono: true },
      { h: t("p5.records.col.dropoff"), k: "dropoffAt", w: 160, mono: true },
      {
        h: t("p5.records.col.fare"),
        w: 108,
        align: "right",
        r: (row) => formatCurrencyMinor(row.actualFareMinor, locale),
      },
      {
        h: t("p5.records.col.retainUntil"),
        k: "retainUntil",
        w: 160,
        mono: true,
      },
      {
        h: "",
        w: 96,
        r: () => (
          <CanvasBtn theme={theme} size="xs" variant="ghost" icon="eye">
            {t("p5.records.detail")}
          </CanvasBtn>
        ),
      },
    ];

    return (
      <div style={pageBodyStyle}>
        <CanvasPageHeader
          theme={theme}
          title={t("p5.records.title")}
          subtitle={t("p5.records.subtitle")}
          actions={
            <div style={actionRowStyle}>
              <select
                aria-label={t("p5.records.filter.month")}
                value={recordsMonth}
                onChange={(event) => setRecordsMonth(event.target.value)}
                style={inputStyle}
              >
                {monthOptions.length === 0 ? (
                  <option value="">{t("p5.records.filter.empty")}</option>
                ) : null}
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {t("p5.records.filter.monthLabel", {
                      month: formatMonthLabel(month, locale),
                    })}
                  </option>
                ))}
              </select>
              <CanvasPill theme={theme} tone="success" dot>
                {t("p5.records.coverage", { percent: coveragePercent })}
              </CanvasPill>
            </div>
          }
        />
        {recordsError ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warning"
            title={t("p5.records.error.title")}
            body={recordsError}
          />
        ) : null}
        <CanvasCard theme={theme} padding={0}>
          <CanvasTable
            theme={theme}
            columns={recordColumns}
            rows={recordsLoading ? [] : recordsRows}
          />
          <div
            style={{
              padding: "10px 16px",
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            <span style={{ fontSize: 11, color: theme.textMuted }}>
              {t("p5.records.footer")}
            </span>
          </div>
        </CanvasCard>
      </div>
    );
  }

  return <PublicFareManagement />;
}
