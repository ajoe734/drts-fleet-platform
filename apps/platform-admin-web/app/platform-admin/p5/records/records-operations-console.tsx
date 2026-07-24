"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { usePlatformAdminAuthority } from "@/lib/platform-admin-authority";
import type {
  MultiTaxiTripOperationalAdminView,
  MultiTaxiTripOperationalExportDownload,
  MultiTaxiTripOperationalExportJobAccepted,
  MultiTaxiTripOperationalExportJobStatus,
  MultiTaxiTripOperationalExportJobView,
  MultiTaxiTripOperationalExportPreview,
  MultiTaxiTripOperationalRecordQuery,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasEmptyState,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

import {
  buildRecordsQueryPath,
  calculateRetentionCoverage,
  createExportIdempotencyKey,
  formatRecordDateTime,
  formatRecordDistance,
  formatRecordDuration,
  formatRecordMoney,
  getApiErrorMessage,
  isExportTerminal,
  isPermissionError,
  isRetentionFloorMet,
  normalizeRecordsScope,
  requireControlledDownloadUrl,
  TAIPEI_TIME_ZONE,
} from "./records-operations-model";
import styles from "./records-operations.module.css";
import { recordsT, type RecordsTranslationKey } from "./records-translations";

type OperationalRecordRow = MultiTaxiTripOperationalAdminView &
  Record<string, unknown>;

type RecordsError = {
  message: string;
  permission: boolean;
};

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });
const EXPORT_JOB_PATH =
  "/api/platform-admin/multi-taxi-trip-records/export-jobs";

function statusTone(
  status: MultiTaxiTripOperationalExportJobStatus,
): CanvasTone {
  if (status === "completed") {
    return "success";
  }
  if (status === "failed") {
    return "danger";
  }
  if (status === "running") {
    return "info";
  }
  return "warn";
}

function unavailable(value: string | null, fallback: string) {
  return value ?? fallback;
}

export function RecordsOperationsConsole() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const tx = (
    key: RecordsTranslationKey,
    params?: Record<string, string | number>,
  ) => recordsT(locale, key, params);
  const featureScopesDeclared = authority.scopes.some((scope) =>
    scope.startsWith("multi_taxi_records:"),
  );
  const canAttemptRead =
    !featureScopesDeclared ||
    authority.scopes.includes("multi_taxi_records:read");
  const canAttemptExport =
    !featureScopesDeclared ||
    authority.scopes.includes("multi_taxi_records:export");

  const [draftScope, setDraftScope] =
    useState<MultiTaxiTripOperationalRecordQuery>({});
  const [appliedScope, setAppliedScope] =
    useState<MultiTaxiTripOperationalRecordQuery>({});
  const [records, setRecords] = useState<OperationalRecordRow[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<RecordsError | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPurpose, setExportPurpose] = useState("");
  const [exportPreview, setExportPreview] =
    useState<MultiTaxiTripOperationalExportPreview | null>(null);
  const [exportAccepted, setExportAccepted] =
    useState<MultiTaxiTripOperationalExportJobAccepted | null>(null);
  const [exportJob, setExportJob] =
    useState<MultiTaxiTripOperationalExportJobView | null>(null);
  const [issuedDownload, setIssuedDownload] =
    useState<MultiTaxiTripOperationalExportDownload | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [exportBusy, setExportBusy] = useState<
    "preview" | "create" | "status" | "download" | null
  >(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!canAttemptRead) {
      setRecords([]);
      setSelectedRecordId(null);
      setRecordsLoading(false);
      setRecordsError({
        message: tx("error.permissionBody"),
        permission: true,
      });
      return;
    }

    let active = true;
    async function loadRecords() {
      setRecordsLoading(true);
      setRecordsError(null);
      try {
        const payload = await client.get<{
          items?: MultiTaxiTripOperationalAdminView[];
        }>(buildRecordsQueryPath(appliedScope));
        if (!active) {
          return;
        }
        const nextRecords = (payload.items ?? []) as OperationalRecordRow[];
        setRecords(nextRecords);
        setSelectedRecordId((current) =>
          current && nextRecords.some((record) => record.recordId === current)
            ? current
            : (nextRecords[0]?.recordId ?? null),
        );
      } catch (error) {
        if (!active) {
          return;
        }
        setRecords([]);
        setSelectedRecordId(null);
        setRecordsError({
          message: getApiErrorMessage(error, tx("error.title")),
          permission: isPermissionError(error),
        });
      } finally {
        if (active) {
          setRecordsLoading(false);
        }
      }
    }

    void loadRecords();
    return () => {
      active = false;
    };
  }, [appliedScope, canAttemptRead, client, locale]);

  const currentJobStatus = exportJob?.status ?? exportAccepted?.status ?? null;
  useEffect(() => {
    const jobId = exportAccepted?.jobId;
    if (
      !jobId ||
      (currentJobStatus !== null && isExportTerminal(currentJobStatus))
    ) {
      return;
    }
    const jobPath = `${EXPORT_JOB_PATH}/${encodeURIComponent(jobId)}`;

    let active = true;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    async function poll() {
      try {
        const detail =
          await client.get<MultiTaxiTripOperationalExportJobView>(jobPath);
        if (!active) {
          return;
        }
        setExportJob(detail);
        if (!isExportTerminal(detail.status)) {
          timeout = setTimeout(() => void poll(), 1200);
        }
      } catch (error) {
        if (active) {
          setExportError(getApiErrorMessage(error, tx("export.errorTitle")));
        }
      }
    }

    timeout = setTimeout(() => void poll(), 400);
    return () => {
      active = false;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [client, currentJobStatus, exportAccepted?.jobId, locale]);

  const selectedRecord =
    records.find((record) => record.recordId === selectedRecordId) ?? null;
  const retentionCoverage = calculateRetentionCoverage(records);

  function resetExportWorkflow() {
    setExportPreview(null);
    setExportAccepted(null);
    setExportJob(null);
    setIssuedDownload(null);
    setIdempotencyKey("");
    setExportError(null);
    setExportBusy(null);
  }

  function applyQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextScope = normalizeRecordsScope(draftScope);
    setAppliedScope(nextScope);
    resetExportWorkflow();
  }

  async function previewExport() {
    setExportBusy("preview");
    setExportError(null);
    setIssuedDownload(null);
    try {
      const preview = await client.post<MultiTaxiTripOperationalExportPreview>(
        `${EXPORT_JOB_PATH}/preview`,
        {
          body: appliedScope,
        },
      );
      setExportPreview(preview);
      setExportAccepted(null);
      setExportJob(null);
      setIdempotencyKey(createExportIdempotencyKey());
    } catch (error) {
      setExportError(getApiErrorMessage(error, tx("export.errorTitle")));
    } finally {
      setExportBusy(null);
    }
  }

  async function createExportJob() {
    if (!exportPurpose.trim()) {
      setExportError(tx("export.validationPurpose"));
      return;
    }
    if (!exportPreview) {
      setExportError(tx("export.previewMissing"));
      return;
    }

    const requestKey = idempotencyKey || createExportIdempotencyKey();
    setIdempotencyKey(requestKey);
    setExportBusy("create");
    setExportError(null);
    setIssuedDownload(null);
    try {
      const accepted =
        await client.post<MultiTaxiTripOperationalExportJobAccepted>(
          EXPORT_JOB_PATH,
          {
            headers: {
              "Idempotency-Key": requestKey,
            },
            body: {
              scope: exportPreview.scope,
              purpose: exportPurpose.trim(),
              idempotencyKey: requestKey,
            },
          },
        );
      setExportAccepted(accepted);
      const detail = await client.get<MultiTaxiTripOperationalExportJobView>(
        `${EXPORT_JOB_PATH}/${encodeURIComponent(accepted.jobId)}`,
      );
      setExportJob(detail);
    } catch (error) {
      setExportError(getApiErrorMessage(error, tx("export.errorTitle")));
    } finally {
      setExportBusy(null);
    }
  }

  async function refreshExportStatus() {
    const jobId = exportAccepted?.jobId;
    if (!jobId) {
      return;
    }
    setExportBusy("status");
    setExportError(null);
    try {
      setExportJob(
        await client.get<MultiTaxiTripOperationalExportJobView>(
          `${EXPORT_JOB_PATH}/${encodeURIComponent(jobId)}`,
        ),
      );
    } catch (error) {
      setExportError(getApiErrorMessage(error, tx("export.errorTitle")));
    } finally {
      setExportBusy(null);
    }
  }

  async function issueDownload() {
    const jobId = exportAccepted?.jobId;
    if (!jobId || currentJobStatus !== "completed") {
      return;
    }
    setExportBusy("download");
    setExportError(null);
    try {
      const issued = await client.get<MultiTaxiTripOperationalExportDownload>(
        `${EXPORT_JOB_PATH}/${encodeURIComponent(jobId)}/download`,
      );
      const safeUrl = requireControlledDownloadUrl(issued.download.downloadUrl);
      setIssuedDownload({
        ...issued,
        download: {
          ...issued.download,
          downloadUrl: safeUrl,
        },
      });
    } catch (error) {
      setExportError(getApiErrorMessage(error, tx("export.errorTitle")));
    } finally {
      setExportBusy(null);
    }
  }

  const recordColumns: CanvasTableColumn<OperationalRecordRow>[] = [
    {
      h: tx("table.order"),
      w: 190,
      r: (row) => (
        <div className={styles.orderCell}>
          <span className={styles.primaryMono}>{row.orderNo}</span>
          <span className={styles.secondary}>{row.tripId}</span>
        </div>
      ),
    },
    {
      h: tx("table.plate"),
      w: 120,
      r: (row) => (
        <div className={styles.orderCell}>
          <span className={styles.mono}>{row.plateNo}</span>
          <span className={styles.secondary}>{row.vehicleId}</span>
        </div>
      ),
    },
    {
      h: tx("table.reserved"),
      w: 178,
      r: (row) =>
        unavailable(
          formatRecordDateTime(row.reservedAt, locale),
          tx("table.unavailable"),
        ),
    },
    {
      h: tx("table.fare"),
      w: 118,
      align: "right",
      r: (row) => formatRecordMoney(row.actualFareMinor, locale),
    },
    {
      h: tx("table.retention"),
      w: 178,
      r: (row) => (
        <div className={styles.orderCell}>
          <span>
            {unavailable(
              formatRecordDateTime(row.retainUntil, locale),
              tx("table.unavailable"),
            )}
          </span>
          <CanvasPill
            theme={theme}
            tone={isRetentionFloorMet(row) ? "success" : "warn"}
          >
            {isRetentionFloorMet(row)
              ? tx("retention.pass")
              : tx("retention.fail")}
          </CanvasPill>
        </div>
      ),
    },
    {
      h: tx("table.action"),
      w: 104,
      r: (row) => (
        <CanvasBtn
          theme={theme}
          size="xs"
          variant={row.recordId === selectedRecordId ? "primary" : "ghost"}
          icon="search"
          onClick={() => setSelectedRecordId(row.recordId)}
        >
          {tx("table.detail")}
        </CanvasBtn>
      ),
    },
  ];

  return (
    <div
      className={styles.page}
      data-screen-id="P5-COM-UI-04"
      data-testid="p5-records-page"
    >
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{tx("page.eyebrow")}</p>
          <h1 className={styles.title}>{tx("page.title")}</h1>
          <p className={styles.subtitle}>{tx("page.subtitle")}</p>
        </div>
        <div className={styles.heroMeta}>
          <Stat value={records.length} label={tx("stats.records")} />
          <Stat
            value={`${retentionCoverage.percent}%`}
            label={tx("stats.retention")}
          />
          <Stat value="UTC+8" label={tx("stats.timezone")} />
        </div>
        <span className={styles.screenId}>{tx("page.screen")}</span>
      </header>

      <div className={styles.workspace}>
        <main className={styles.mainColumn}>
          <CanvasCard
            theme={theme}
            title={tx("query.title")}
            subtitle={tx("query.subtitle")}
            actions={
              <CanvasBtn
                theme={theme}
                variant="primary"
                icon="reports"
                onClick={() => setExportOpen((current) => !current)}
              >
                {exportOpen ? tx("export.close") : tx("export.open")}
              </CanvasBtn>
            }
          >
            <form className={styles.queryForm} onSubmit={applyQuery}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{tx("query.month")}</span>
                <input
                  className={styles.input}
                  type="month"
                  value={draftScope.month ?? ""}
                  onChange={(event) =>
                    setDraftScope((current) => ({
                      ...current,
                      month: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{tx("query.search")}</span>
                <input
                  className={styles.input}
                  type="search"
                  value={draftScope.q ?? ""}
                  placeholder={tx("query.searchPlaceholder")}
                  onChange={(event) =>
                    setDraftScope((current) => ({
                      ...current,
                      q: event.target.value,
                    }))
                  }
                />
              </label>
              <CanvasBtn
                theme={theme}
                variant="primary"
                icon="search"
                type="submit"
                disabled={recordsLoading}
              >
                {recordsLoading ? tx("query.loading") : tx("query.apply")}
              </CanvasBtn>
            </form>
            <div className={styles.toolbarMeta}>
              <CanvasPill theme={theme} tone="info" dot>
                {tx("query.resultCount", { count: records.length })}
              </CanvasPill>
              <CanvasPill
                theme={theme}
                tone={canAttemptRead ? "success" : "warn"}
              >
                {tx("query.readScope")} ·{" "}
                {featureScopesDeclared
                  ? tx(canAttemptRead ? "scope.available" : "scope.denied")
                  : tx("scope.serverChecked")}
              </CanvasPill>
              <CanvasPill
                theme={theme}
                tone={canAttemptExport ? "success" : "warn"}
              >
                {tx("query.exportScope")} ·{" "}
                {featureScopesDeclared
                  ? tx(canAttemptExport ? "scope.available" : "scope.denied")
                  : tx("scope.serverChecked")}
              </CanvasPill>
            </div>
          </CanvasCard>

          {recordsError ? (
            <CanvasBanner
              theme={theme}
              tone="danger"
              icon="warn"
              title={
                recordsError.permission
                  ? tx("error.permissionTitle")
                  : tx("error.title")
              }
              body={
                recordsError.permission
                  ? tx("error.permissionBody")
                  : recordsError.message
              }
            />
          ) : null}

          <CanvasCard theme={theme} padding={0}>
            {recordsLoading ? (
              <div style={{ padding: 28 }}>{tx("query.loading")}</div>
            ) : records.length === 0 ? (
              <CanvasEmptyState
                theme={theme}
                title={tx("empty.title")}
                body={tx("empty.body")}
              />
            ) : (
              <>
                <div className={styles.tableWrap}>
                  <CanvasTable
                    theme={theme}
                    columns={recordColumns}
                    rows={records}
                  />
                </div>
                <div className={styles.tableFooter}>
                  <span>
                    {tx("query.resultCount", { count: records.length })}
                  </span>
                  <span>
                    {TAIPEI_TIME_ZONE} · {tx("retention.floorValue")}
                  </span>
                </div>
              </>
            )}
          </CanvasCard>
        </main>

        <aside className={styles.sideColumn}>
          <RecordDetail record={selectedRecord} locale={locale} tx={tx} />
        </aside>
      </div>

      {exportOpen ? (
        <section
          className={styles.exportPanel}
          data-screen-id="P5-COM-UI-05"
          data-testid="controlled-export-panel"
        >
          <div className={styles.exportHeader}>
            <div>
              <h2>{tx("export.title")}</h2>
              <p>{tx("export.subtitle")}</p>
            </div>
            <CanvasBtn
              theme={theme}
              size="xs"
              variant="ghost"
              onClick={() => setExportOpen(false)}
            >
              {tx("export.close")}
            </CanvasBtn>
          </div>

          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title={tx("export.noticeTitle")}
            body={tx("export.noticeBody")}
          />
          {!canAttemptExport ? (
            <div style={{ marginTop: 10 }}>
              <CanvasBanner
                theme={theme}
                tone="warn"
                icon="audit"
                body={tx("export.permission")}
              />
            </div>
          ) : null}
          {exportError ? (
            <div style={{ marginTop: 10 }}>
              <CanvasBanner
                theme={theme}
                tone="danger"
                icon="warn"
                title={tx("export.errorTitle")}
                body={exportError}
              />
            </div>
          ) : null}

          <div className={styles.exportGrid}>
            <div className={styles.scopeBox}>
              <p className={styles.sectionLabel}>{tx("export.scopeTitle")}</p>
              <div className={styles.scopeRows}>
                <ScopeRow
                  label={tx("export.scopeMonth")}
                  value={appliedScope.month ?? tx("export.scopeAll")}
                />
                <ScopeRow
                  label={tx("export.scopeSearch")}
                  value={appliedScope.q ?? tx("export.scopeAll")}
                />
                <ScopeRow
                  label={tx("export.previewCount")}
                  value={
                    exportPreview
                      ? String(exportPreview.recordCount)
                      : tx("export.previewMissing")
                  }
                />
              </div>
              <div className={styles.actionRow}>
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  icon="search"
                  disabled={!canAttemptExport || exportBusy !== null}
                  onClick={() => void previewExport()}
                >
                  {exportBusy === "preview"
                    ? tx("export.previewing")
                    : tx("export.preview")}
                </CanvasBtn>
              </div>
            </div>

            <div className={styles.jobBox}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {tx("export.purpose")}
                </span>
                <textarea
                  className={styles.textarea}
                  value={exportPurpose}
                  placeholder={tx("export.purposePlaceholder")}
                  disabled={Boolean(exportAccepted)}
                  onChange={(event) => setExportPurpose(event.target.value)}
                />
              </label>
              <p className={styles.helper}>{tx("export.purposeHelp")}</p>
              <div className={styles.actionRow}>
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  icon="reports"
                  disabled={
                    !canAttemptExport ||
                    !exportPreview ||
                    Boolean(exportAccepted) ||
                    exportBusy !== null
                  }
                  onClick={() => void createExportJob()}
                >
                  {exportBusy === "create"
                    ? tx("export.creating")
                    : tx("export.create")}
                </CanvasBtn>
                {exportAccepted ? (
                  <CanvasBtn
                    theme={theme}
                    variant="ghost"
                    disabled={exportBusy !== null}
                    onClick={() => void refreshExportStatus()}
                  >
                    {tx("export.refresh")}
                  </CanvasBtn>
                ) : null}
              </div>

              <ExportJobSummary
                accepted={exportAccepted}
                detail={exportJob}
                locale={locale}
                tx={tx}
              />

              {currentJobStatus === "completed" && !issuedDownload ? (
                <div className={styles.actionRow}>
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    icon="reports"
                    disabled={exportBusy !== null}
                    onClick={() => void issueDownload()}
                  >
                    {exportBusy === "download"
                      ? tx("export.downloadPreparing")
                      : tx("export.downloadPrepare")}
                  </CanvasBtn>
                </div>
              ) : null}

              {issuedDownload ? (
                <div
                  className={styles.downloadReady}
                  data-testid="controlled-download-ready"
                >
                  <CanvasPill theme={theme} tone="success" dot>
                    {tx("export.downloadReady")}
                  </CanvasPill>
                  <div>
                    <a
                      className={styles.downloadLink}
                      href={issuedDownload.download.downloadUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {tx("export.downloadLink")}
                    </a>
                  </div>
                  <div className={styles.downloadMeta}>
                    {tx("export.downloadExpiry")}:{" "}
                    {formatRecordDateTime(
                      issuedDownload.download.expiresAt,
                      locale,
                    ) ?? tx("table.unavailable")}
                    <br />
                    {tx("export.downloadPolicy")}
                  </div>
                </div>
              ) : null}

              {exportAccepted && isExportTerminal(currentJobStatus!) ? (
                <div className={styles.actionRow}>
                  <CanvasBtn
                    theme={theme}
                    size="xs"
                    variant="ghost"
                    onClick={resetExportWorkflow}
                  >
                    {tx("export.reset")}
                  </CanvasBtn>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function ScopeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.scopeRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RecordDetail({
  record,
  locale,
  tx,
}: {
  record: OperationalRecordRow | null;
  locale: "zh" | "en";
  tx: (
    key: RecordsTranslationKey,
    params?: Record<string, string | number>,
  ) => string;
}) {
  if (!record) {
    return (
      <CanvasCard
        theme={theme}
        title={tx("detail.title")}
        subtitle={tx("detail.subtitle")}
      >
        <CanvasEmptyState
          theme={theme}
          title={tx("detail.title")}
          body={tx("detail.empty")}
        />
      </CanvasCard>
    );
  }

  const missing = tx("table.unavailable");
  const retentionMet = isRetentionFloorMet(record);
  return (
    <div className={styles.detailStack} data-testid="record-detail">
      <CanvasCard
        theme={theme}
        title={tx("detail.title")}
        subtitle={tx("detail.subtitle")}
      >
        <div className={styles.detailBand}>
          <div>
            <strong>{record.orderNo}</strong>
            <span>{record.tripId}</span>
          </div>
          <CanvasPill theme={theme} tone="info">
            {record.chargingMode}
          </CanvasPill>
        </div>

        <p className={styles.sectionLabel} style={{ marginTop: 14 }}>
          {tx("table.order")}
        </p>
        <CanvasDL
          theme={theme}
          cols={1}
          items={[
            { k: tx("detail.order"), v: record.orderNo, mono: true },
            { k: tx("detail.orderId"), v: record.orderId, mono: true },
            { k: tx("detail.tripId"), v: record.tripId, mono: true },
            {
              k: tx("detail.assignmentId"),
              v: record.assignmentId ?? missing,
              mono: true,
            },
            { k: tx("detail.vehicleId"), v: record.vehicleId, mono: true },
            { k: tx("detail.plate"), v: record.plateNo, mono: true },
            {
              k: tx("detail.reserved"),
              v: formatRecordDateTime(record.reservedAt, locale) ?? missing,
            },
            {
              k: tx("detail.pickup"),
              v: formatRecordDateTime(record.pickupAt, locale) ?? missing,
            },
            {
              k: tx("detail.dropoff"),
              v: formatRecordDateTime(record.dropoffAt, locale) ?? missing,
            },
          ]}
        />

        <p className={styles.sectionLabel} style={{ marginTop: 14 }}>
          {tx("detail.routeSource")}
        </p>
        <CanvasDL
          theme={theme}
          cols={1}
          items={[
            { k: tx("detail.routeSource"), v: record.route.source },
            {
              k: tx("detail.routeDistance"),
              v: formatRecordDistance(record.route.distanceMeters) ?? missing,
            },
            {
              k: tx("detail.routeDuration"),
              v: formatRecordDuration(record.route.durationSeconds) ?? missing,
            },
            {
              k: tx("detail.routePoints"),
              v: String(record.route.pointCount),
              mono: true,
            },
            {
              k: tx("detail.routeGeometry"),
              v: record.route.encodedPolyline
                ? tx("detail.routeAvailable")
                : tx("detail.routeUnavailable"),
            },
          ]}
        />

        <p className={styles.sectionLabel} style={{ marginTop: 14 }}>
          {tx("table.fare")}
        </p>
        <CanvasDL
          theme={theme}
          cols={1}
          items={[
            {
              k: tx("detail.payableFare"),
              v: formatRecordMoney(record.payableFareMinor, locale),
              mono: true,
            },
            {
              k: tx("detail.actualFare"),
              v: formatRecordMoney(record.actualFareMinor, locale),
              mono: true,
            },
            {
              k: tx("detail.toll"),
              v: formatRecordMoney(record.tollMinor, locale),
              mono: true,
            },
            {
              k: tx("detail.fareVersion"),
              v: record.farePolicyVersion,
              mono: true,
            },
            { k: tx("detail.chargingMode"), v: record.chargingMode },
            { k: tx("detail.currency"), v: record.currency, mono: true },
          ]}
        />
      </CanvasCard>

      <CanvasCard
        theme={theme}
        title={tx("retention.title")}
        subtitle={tx("retention.subtitle")}
      >
        <CanvasDL
          theme={theme}
          cols={1}
          items={[
            {
              k: tx("retention.generated"),
              v: formatRecordDateTime(record.generatedAt, locale) ?? missing,
            },
            {
              k: tx("retention.until"),
              v: formatRecordDateTime(record.retainUntil, locale) ?? missing,
            },
            {
              k: tx("retention.floor"),
              v: tx("retention.floorValue"),
              mono: true,
            },
            {
              k: tx("retention.title"),
              v: (
                <CanvasPill
                  theme={theme}
                  tone={retentionMet ? "success" : "warn"}
                  dot
                >
                  {retentionMet ? tx("retention.pass") : tx("retention.fail")}
                </CanvasPill>
              ),
            },
          ]}
        />
      </CanvasCard>

      <CanvasBanner
        theme={theme}
        tone="info"
        icon="audit"
        title={tx("hold.title")}
        body={
          <>
            {tx("hold.body")}
            <br />
            {tx("hold.pending")}
          </>
        }
      />
    </div>
  );
}

function ExportJobSummary({
  accepted,
  detail,
  locale,
  tx,
}: {
  accepted: MultiTaxiTripOperationalExportJobAccepted | null;
  detail: MultiTaxiTripOperationalExportJobView | null;
  locale: "zh" | "en";
  tx: (
    key: RecordsTranslationKey,
    params?: Record<string, string | number>,
  ) => string;
}) {
  if (!accepted) {
    return null;
  }
  const status = detail?.status ?? accepted.status;
  const stage =
    status === "pending"
      ? 1
      : status === "running"
        ? 2
        : status === "completed"
          ? 4
          : 3;
  return (
    <div className={styles.jobBox} style={{ marginTop: 12 }}>
      <p className={styles.sectionLabel}>{tx("export.jobTitle")}</p>
      <div className={styles.timeline} aria-hidden="true">
        {[1, 2, 3, 4].map((value) => (
          <span
            key={value}
            className={`${styles.timelineStep} ${
              value <= stage ? styles.timelineStepActive : ""
            }`}
          />
        ))}
      </div>
      <div className={styles.scopeRows}>
        <ScopeRow label={tx("export.jobId")} value={accepted.jobId} />
        <div className={styles.scopeRow}>
          <span>{tx("export.jobStatus")}</span>
          <CanvasPill theme={theme} tone={statusTone(status)} dot>
            {tx(`export.status.${status}`)}
          </CanvasPill>
        </div>
        {detail ? (
          <>
            <ScopeRow
              label={tx("export.jobActor")}
              value={detail.requestedByActorId}
            />
            <ScopeRow
              label={tx("export.jobCount")}
              value={String(detail.recordCount)}
            />
            <ScopeRow
              label={tx("export.jobCreated")}
              value={
                formatRecordDateTime(detail.createdAt, locale) ??
                tx("table.unavailable")
              }
            />
            <ScopeRow
              label={tx("export.jobUpdated")}
              value={
                formatRecordDateTime(detail.updatedAt, locale) ??
                tx("table.unavailable")
              }
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
