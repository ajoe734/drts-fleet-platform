"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  CalloutBanner,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
} from "@drts/ui-web";
import type {
  ComplaintCaseRecord,
  ComplaintCategory,
  ComplaintExportViewRecord,
  ComplaintResolutionCode,
  ComplaintTimelineEntry,
  ComplaintCaseStatus,
  CreateComplaintCaseCommand,
  EscalateComplaintToIncidentCommand,
} from "@drts/contracts";
import {
  COMPLAINT_CASE_STATUSES,
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_VALID_RESOLUTIONS,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";

const STATUS_OPTIONS: ComplaintCaseStatus[] = [...COMPLAINT_CASE_STATUSES];
const CATEGORY_OPTIONS: ComplaintCategory[] = [...COMPLAINT_CATEGORIES];

const INITIAL_CREATE_FORM: CreateComplaintCaseCommand = {
  caseSource: "ops",
  category: "fare_dispute",
  severity: "normal",
  description: "",
  relatedOrderId: "",
  relatedCallId: "",
};

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "-";
}

function isComplaintActive(status: ComplaintCaseStatus) {
  return ["new", "assigned", "under_investigation", "reopened"].includes(
    status,
  );
}

function compareComplaintPriority(
  a: ComplaintCaseRecord,
  b: ComplaintCaseRecord,
) {
  if (a.slaBreach !== b.slaBreach) {
    return a.slaBreach ? -1 : 1;
  }

  if (a.relatedIncidentId !== b.relatedIncidentId) {
    return a.relatedIncidentId ? 1 : -1;
  }

  if (a.severity !== b.severity) {
    return a.severity === "high" ? -1 : 1;
  }

  if (isComplaintActive(a.status) !== isComplaintActive(b.status)) {
    return isComplaintActive(a.status) ? -1 : 1;
  }

  return (
    new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime() ||
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function formatRelativeSla(value: string, locale: "en" | "zh") {
  const deltaMinutes = Math.round(
    (new Date(value).getTime() - Date.now()) / (1000 * 60),
  );

  if (deltaMinutes >= 0) {
    return locale === "en"
      ? `SLA due in ${deltaMinutes} min`
      : `SLA 還有 ${deltaMinutes} 分鐘`;
  }

  return locale === "en"
    ? `SLA breached by ${Math.abs(deltaMinutes)} min`
    : `SLA 已逾期 ${Math.abs(deltaMinutes)} 分鐘`;
}

function getComplaintSeverityTone(
  record: ComplaintCaseRecord,
): "danger" | "warning" | "neutral" {
  if (record.slaBreach) {
    return "danger";
  }
  if (record.severity === "high") {
    return "warning";
  }
  return "neutral";
}

function resolveSelectedComplaintCaseNo(
  records: ComplaintCaseRecord[],
  preferredCaseNo: string | null,
) {
  if (
    preferredCaseNo &&
    records.some((record) => record.caseNo === preferredCaseNo)
  ) {
    return preferredCaseNo;
  }

  return records[0]?.caseNo ?? null;
}

export default function ComplaintsPage() {
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();
  const resolveErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : t("common.unknown");
  const [records, setRecords] = useState<ComplaintCaseRecord[]>([]);
  const [timeline, setTimeline] = useState<ComplaintTimelineEntry[]>([]);
  const [exportView, setExportView] =
    useState<ComplaintExportViewRecord | null>(null);
  const [selectedCaseNo, setSelectedCaseNo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplaintCaseStatus | "all">(
    "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<
    ComplaintCategory | "all"
  >("all");
  const [createForm, setCreateForm] = useState(INITIAL_CREATE_FORM);
  const [assigneeId, setAssigneeId] = useState("AGENT-OPS-002");
  const [assignmentNote, setAssignmentNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [resolutionCode, setResolutionCode] =
    useState<ComplaintResolutionCode>("resolved_other");
  const [closingNote, setClosingNote] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [escalateTitle, setEscalateTitle] = useState("");
  const [escalateSeverity, setEscalateSeverity] =
    useState<EscalateComplaintToIncidentCommand["severity"]>("medium");
  const [escalateReason, setEscalateReason] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const caseNoFromQuery = searchParams.get("caseNo");

  const selectedRecord = useMemo(
    () => records.find((record) => record.caseNo === selectedCaseNo) ?? null,
    [records, selectedCaseNo],
  );

  const validResolutionCodes = useMemo(
    () =>
      selectedRecord
        ? (COMPLAINT_CATEGORY_VALID_RESOLUTIONS[selectedRecord.category] ?? [])
        : [],
    [selectedRecord],
  );

  useEffect(() => {
    if (!selectedRecord) {
      return;
    }
    setResolutionCode((current) =>
      validResolutionCodes.includes(current)
        ? current
        : (validResolutionCodes[0] ?? "resolved_other"),
    );
  }, [selectedRecord, validResolutionCodes]);

  useEffect(() => {
    if (caseNoFromQuery) {
      setSelectedCaseNo(caseNoFromQuery);
    }

    void loadRecords(caseNoFromQuery ?? undefined);
  }, [caseNoFromQuery]);

  useEffect(() => {
    if (!selectedCaseNo) {
      setTimeline([]);
      setExportView(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const client = getOpsClient();
        const [nextTimeline, nextExportView] = await Promise.all([
          client.getComplaintTimeline(selectedCaseNo),
          client.getComplaintExportView(selectedCaseNo),
        ]);
        if (cancelled) {
          return;
        }
        setTimeline(nextTimeline);
        setExportView(nextExportView);
      } catch (nextError) {
        if (!cancelled) {
          setError(resolveErrorMessage(nextError));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCaseNo]);

  async function loadRecords(preferredCaseNo?: string) {
    setLoading(true);
    try {
      const nextRecords = await getOpsClient().listComplaints();
      setRecords(nextRecords);
      const nextSelected = resolveSelectedComplaintCaseNo(
        nextRecords,
        preferredCaseNo ?? caseNoFromQuery ?? selectedCaseNo,
      );
      setSelectedCaseNo(nextSelected);
      setError(null);
    } catch (nextError) {
      setError(resolveErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    try {
      await action();
      setError(null);
    } catch (nextError) {
      setError(resolveErrorMessage(nextError));
    } finally {
      setBusyKey(null);
    }
  }

  const filteredRecords = records
    .filter((record) => {
      if (statusFilter !== "all" && record.status !== statusFilter) {
        return false;
      }
      if (categoryFilter !== "all" && record.category !== categoryFilter) {
        return false;
      }
      if (!deferredQuery) {
        return true;
      }
      const haystack = [
        record.caseNo,
        record.category,
        record.description,
        record.status,
        record.assigneeId ?? "",
        record.relatedOrderId ?? "",
        record.relatedCallId ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(deferredQuery);
    })
    .sort(compareComplaintPriority);

  const activeCases = records.filter((record) =>
    isComplaintActive(record.status),
  ).length;
  const hotlineLinked = records.filter((record) => record.relatedCallId).length;
  const slaBreached = records.filter((record) => record.slaBreach).length;
  const readyForAudit = records.filter(
    (record) => record.status === "closed",
  ).length;
  const escalationReadyCases = records
    .filter(
      (record) =>
        !record.relatedIncidentId &&
        (record.slaBreach || record.severity === "high"),
    )
    .sort(compareComplaintPriority);
  const unassignedCases = records.filter(
    (record) => isComplaintActive(record.status) && !record.assigneeId,
  ).length;
  const workspaceHeadline = selectedRecord
    ? locale === "en"
      ? `${selectedRecord.caseNo} is active in the complaints workspace.`
      : `${selectedRecord.caseNo} 已進入客訴 workspace。`
    : locale === "en"
      ? "Select a complaint to triage SLA, assignee state, and incident escalation."
      : "選擇客訴案件，處理 SLA、負責人狀態與 incident escalation。";
  const complaintGuardrails = [
    locale === "en"
      ? "Complaint ownership stays in ops until the audit-export packet is ready."
      : "客訴在 audit-export packet 就緒前，owner 仍維持在 ops。",
    locale === "en"
      ? "Escalate to incidents only when safety, operational outage, or service recovery coordination crosses the complaint boundary."
      : "只有在安全、營運中斷或 service recovery 需跨出客訴邊界時，才升級到 incidents。",
    locale === "en"
      ? "SLA breach marking is a control signal and should not replace timeline notes or assignee updates."
      : "SLA breach 是控制訊號，不可取代 timeline note 與 assignee 更新。",
  ];

  return (
    <>
      <PageHeader
        eyebrow={locale === "en" ? "Complaint workspace" : "客訴 Workspace"}
        title={t("complaints.title")}
        subtitle={t("complaints.subtitle")}
        meta={[
          {
            label: locale === "en" ? "Active" : "未結",
            value: activeCases,
          },
          {
            label: locale === "en" ? "SLA breach" : "SLA 違規",
            value: slaBreached,
            tone: slaBreached > 0 ? "danger" : "success",
          },
          {
            label: locale === "en" ? "Escalation ready" : "可升級",
            value: escalationReadyCases.length,
            tone: escalationReadyCases.length > 0 ? "warning" : "neutral",
          },
          {
            label: locale === "en" ? "Unassigned" : "未指派",
            value: unassignedCases,
            tone: unassignedCases > 0 ? "warning" : "neutral",
          },
        ]}
      />
      <div className="console-shell">
        {error && (
          <CalloutBanner
            tone="danger"
            title={getOpsLabel(locale, "error")}
            description={error}
          />
        )}

        <section className="workspace-headline">
          <p className="eyebrow workspace-kicker">
            {locale === "en" ? "Active case" : "目前案件"}
          </p>
          <h3>
            {selectedRecord
              ? `${selectedRecord.caseNo} · ${formatOpsCodeLabel(
                  locale,
                  selectedRecord.category,
                )}`
              : t("complaints.caseDetail")}
          </h3>
          <p>{workspaceHeadline}</p>
        </section>

        <KpiRow minWidth="170px">
          <KpiCard
            label={t("complaints.activeCases")}
            value={activeCases}
            detail={t("complaints.activeCasesSub")}
            tone={activeCases > 0 ? "ops" : "neutral"}
          />
          <KpiCard
            label={t("complaints.hotlineLinked")}
            value={hotlineLinked}
            detail={t("complaints.hotlineLinkedSub")}
            tone="info"
          />
          <KpiCard
            label={t("complaints.slaBreached")}
            value={slaBreached}
            detail={t("complaints.slaBreachedSub")}
            tone={slaBreached > 0 ? "danger" : "success"}
          />
          <KpiCard
            label={t("complaints.closedExport")}
            value={readyForAudit}
            detail={t("complaints.closedExportSub")}
            tone={readyForAudit > 0 ? "success" : "neutral"}
          />
        </KpiRow>

        <CalloutBanner
          tone="info"
          title={
            locale === "en"
              ? "Authority and escalation guardrails"
              : "權限與 escalation guardrails"
          }
        >
          <ul className="assumption-list">
            {complaintGuardrails.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CalloutBanner>

        <DataViewCard
          title={
            locale === "en"
              ? "Immediate complaints requiring ops attention"
              : "需立即處理的客訴案件"
          }
          subtitle={
            locale === "en"
              ? "SLA breach and high-severity cases ready for incident escalation."
              : "SLA 違規與高優先案件，已可升級 incident。"
          }
          tone="warning"
          density="compact"
          summary={
            locale === "en"
              ? `${Math.min(escalationReadyCases.length, 4)} shown of ${escalationReadyCases.length}`
              : `共 ${escalationReadyCases.length} 筆，顯示前 ${Math.min(escalationReadyCases.length, 4)} 筆`
          }
        >
          {escalationReadyCases.length > 0 ? (
            <div className="queue-grid">
              {escalationReadyCases.slice(0, 4).map((record) => (
                <button
                  key={record.caseNo}
                  className="queue-card"
                  type="button"
                  onClick={() => setSelectedCaseNo(record.caseNo)}
                >
                  <div className="queue-card-head">
                    <strong>{record.caseNo}</strong>
                    <StatusChip
                      tone={getComplaintSeverityTone(record)}
                      label={
                        record.slaBreach
                          ? locale === "en"
                            ? "SLA breach"
                            : "SLA 違規"
                          : formatOpsCodeLabel(locale, record.severity)
                      }
                    />
                  </div>
                  <div className="queue-card-subcopy">
                    {formatOpsCodeLabel(locale, record.category)} ·{" "}
                    {record.assigneeId ??
                      (locale === "en" ? "Unassigned" : "未指派")}
                  </div>
                  <p>{record.description}</p>
                  <small>{formatRelativeSla(record.slaDueAt, locale)}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {locale === "en"
                ? "No complaint currently needs immediate incident escalation."
                : "目前沒有需要立即升級 incident 的客訴案件。"}
            </p>
          )}
        </DataViewCard>

        <div className="toolbar">
          <input
            className="search-input"
            type="search"
            placeholder={t("complaints.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as ComplaintCaseStatus | "all")
            }
          >
            <option value="all">{t("complaints.allStatuses")}</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {formatOpsCodeLabel(locale, status)}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(event.target.value as ComplaintCategory | "all")
            }
          >
            <option value="all">{t("complaints.allCategories")}</option>
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {formatOpsCodeLabel(locale, category)}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowCreate((current) => !current)}
          >
            {showCreate
              ? t("complaints.hideCreate")
              : t("complaints.createComplaint")}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void loadRecords(selectedCaseNo ?? undefined)}
          >
            {t("common.refresh")}
          </button>
        </div>

        {showCreate && (
          <DataViewCard
            title={t("complaints.createTitle")}
            subtitle={t("complaints.createNote")}
            tone="ops"
            density="compact"
          >
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction("create-complaint", async () => {
                  const created = await getOpsClient().createComplaint({
                    ...createForm,
                    relatedOrderId: createForm.relatedOrderId || null,
                    relatedCallId: createForm.relatedCallId || null,
                  });
                  setCreateForm(INITIAL_CREATE_FORM);
                  setShowCreate(false);
                  await loadRecords(created.caseNo);
                });
              }}
            >
              <label>
                {t("complaints.form.source")}
                <select
                  value={createForm.caseSource}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      caseSource: event.target
                        .value as CreateComplaintCaseCommand["caseSource"],
                    }))
                  }
                >
                  <option value="ops">
                    {formatOpsCodeLabel(locale, "ops")}
                  </option>
                  <option value="phone">
                    {formatOpsCodeLabel(locale, "phone")}
                  </option>
                  <option value="web">
                    {formatOpsCodeLabel(locale, "web")}
                  </option>
                  <option value="app">
                    {formatOpsCodeLabel(locale, "app")}
                  </option>
                </select>
              </label>
              <label>
                {t("complaints.form.category")}
                <select
                  value={createForm.category}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      category: event.target.value as ComplaintCategory,
                    }))
                  }
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {formatOpsCodeLabel(locale, category)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("complaints.form.severity")}
                <select
                  value={createForm.severity}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      severity: event.target
                        .value as CreateComplaintCaseCommand["severity"],
                    }))
                  }
                >
                  <option value="normal">
                    {formatOpsCodeLabel(locale, "normal")}
                  </option>
                  <option value="high">
                    {formatOpsCodeLabel(locale, "high")}
                  </option>
                </select>
              </label>
              <label>
                {t("complaints.form.relatedOrder")}
                <input
                  type="text"
                  value={createForm.relatedOrderId ?? ""}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      relatedOrderId: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                {t("complaints.form.relatedCall")}
                <input
                  type="text"
                  value={createForm.relatedCallId ?? ""}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      relatedCallId: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="full-span">
                {t("complaints.form.description")}
                <textarea
                  rows={3}
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busyKey === "create-complaint"}
              >
                {busyKey === "create-complaint"
                  ? t("complaints.form.saving")
                  : t("complaints.form.createRecord")}
              </button>
            </form>
          </DataViewCard>
        )}

        {loading ? (
          <p>{t("complaints.loading")}</p>
        ) : (
          <div className="content-grid">
            <DataViewCard
              title={
                locale === "en"
                  ? "Registry and SLA queue"
                  : "案件台帳與 SLA 佇列"
              }
              subtitle={t("complaints.caseList")}
              tone="ops"
              density="compact"
              summary={t("complaints.results", {
                count: filteredRecords.length,
              })}
            >
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("complaints.col.case")}</th>
                      <th>{t("complaints.col.category")}</th>
                      <th>{t("complaints.col.status")}</th>
                      <th>{t("complaints.col.assignee")}</th>
                      <th>{t("complaints.col.order")}</th>
                      <th>{t("complaints.col.hotline")}</th>
                      <th>SLA</th>
                      <th>{t("complaints.col.created")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((record) => (
                      <tr
                        key={record.caseNo}
                        className={
                          record.caseNo === selectedCaseNo ? "selected-row" : ""
                        }
                        onClick={() => setSelectedCaseNo(record.caseNo)}
                      >
                        <td>
                          <div className="cell-title">{record.caseNo}</div>
                          <div className="table-subcopy">
                            {formatOpsCodeLabel(locale, record.severity)}
                          </div>
                        </td>
                        <td>
                          <span className="soft-pill">
                            {formatOpsCodeLabel(locale, record.category)}
                          </span>
                        </td>
                        <td>
                          <div>{formatOpsCodeLabel(locale, record.status)}</div>
                          <div className="table-subcopy">
                            {record.assigneeId ??
                              (locale === "en" ? "Ops queue" : "待 ops 指派")}
                          </div>
                        </td>
                        <td>{record.assigneeId ?? "-"}</td>
                        <td>{record.relatedOrderId ?? "-"}</td>
                        <td>{record.relatedCallId ?? "-"}</td>
                        <td>
                          {record.slaBreach ? (
                            <StatusChip
                              tone="danger"
                              label={locale === "en" ? "BREACH" : "違規"}
                            />
                          ) : (
                            <span className="table-subcopy">
                              {formatRelativeSla(record.slaDueAt, locale)}
                            </span>
                          )}
                        </td>
                        <td>{formatDateTime(record.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DataViewCard>

            <DataViewCard
              title={
                locale === "en"
                  ? "Embedded case workspace"
                  : "內嵌案件 workspace"
              }
              subtitle={t("complaints.caseDetail")}
              tone="neutral"
              density="compact"
              summary={
                selectedRecord
                  ? selectedRecord.caseNo
                  : t("complaints.selectCase")
              }
            >
              {selectedRecord ? (
                <div className="details-stack">
                  <section className="detail-card detail-hero-card">
                    <div className="detail-status-row">
                      <StatusChip
                        tone={getComplaintSeverityTone(selectedRecord)}
                        label={
                          selectedRecord.slaBreach
                            ? locale === "en"
                              ? "SLA breach"
                              : "SLA 違規"
                            : formatOpsCodeLabel(
                                locale,
                                selectedRecord.severity,
                              )
                        }
                      />
                      {!selectedRecord.relatedIncidentId &&
                        (selectedRecord.slaBreach ||
                          selectedRecord.severity === "high") && (
                          <Link
                            className="inline-link quick-link"
                            href={`/incidents?create=1&complaintCaseNo=${encodeURIComponent(selectedRecord.caseNo)}&title=${encodeURIComponent(selectedRecord.caseNo)}&description=${encodeURIComponent(selectedRecord.description)}&severity=${encodeURIComponent(selectedRecord.slaBreach ? "high" : "medium")}${selectedRecord.relatedOrderId ? `&relatedOrderId=${encodeURIComponent(selectedRecord.relatedOrderId)}` : ""}`}
                          >
                            {locale === "en"
                              ? "Prepare incident handoff"
                              : "準備 incident handoff"}
                          </Link>
                        )}
                    </div>
                    <div className="detail-grid">
                      <div>
                        <span className="label">{t("common.status")}</span>
                        <strong>
                          {formatOpsCodeLabel(locale, selectedRecord.status)}
                        </strong>
                        <small>
                          {t("complaints.detail.slaDue", {
                            value: formatDateTime(selectedRecord.slaDueAt),
                          })}
                        </small>
                      </div>
                      <div>
                        <span className="label">
                          {t("complaints.detail.assignee")}
                        </span>
                        <strong>
                          {selectedRecord.assigneeId ??
                            t("complaints.unassigned")}
                        </strong>
                        <small>
                          {t("complaints.detail.slaBreach", {
                            value: selectedRecord.slaBreach
                              ? t("common.yes")
                              : t("common.no"),
                          })}
                        </small>
                        {selectedRecord.slaBreach && (
                          <StatusChip tone="danger" label="SLA BREACH" />
                        )}
                      </div>
                      <div>
                        <span className="label">
                          {t("complaints.detail.reopenCount")}
                        </span>
                        <strong>{selectedRecord.reopenCount ?? 0}</strong>
                      </div>
                      <div>
                        <span className="label">
                          {t("complaints.detail.orderCall")}
                        </span>
                        <strong>{selectedRecord.relatedOrderId ?? "-"}</strong>
                        <small>{selectedRecord.relatedCallId ?? "-"}</small>
                      </div>
                      <div>
                        <span className="label">
                          {t("complaints.detail.resolution")}
                        </span>
                        <strong>
                          {selectedRecord.resolutionCode
                            ? formatOpsCodeLabel(
                                locale,
                                selectedRecord.resolutionCode,
                              )
                            : "-"}
                        </strong>
                        <small>{selectedRecord.closingNote ?? "-"}</small>
                      </div>
                      <div>
                        <span className="label">
                          {t("complaints.detail.linkedIncident")}
                        </span>
                        {selectedRecord.relatedIncidentId ? (
                          <Link
                            className="inline-link"
                            href={`/incidents?incidentId=${encodeURIComponent(
                              selectedRecord.relatedIncidentId,
                            )}`}
                          >
                            <strong>{selectedRecord.relatedIncidentId}</strong>
                          </Link>
                        ) : (
                          <strong>-</strong>
                        )}
                      </div>
                    </div>
                    <p className="description">{selectedRecord.description}</p>
                    <div className="action-row">
                      {!selectedRecord.slaBreach && (
                        <button
                          className="btn"
                          type="button"
                          disabled={busyKey === "sla-breach"}
                          onClick={() =>
                            void runAction("sla-breach", async () => {
                              await getOpsClient().markComplaintSlaBreach(
                                selectedRecord.caseNo,
                              );
                              await loadRecords(selectedRecord.caseNo);
                            })
                          }
                        >
                          {t("complaints.markSlaBreach")}
                        </button>
                      )}
                    </div>
                  </section>

                  <section className="detail-card">
                    <div className="detail-subgrid">
                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("assign-case", async () => {
                            await getOpsClient().assignComplaint(
                              selectedRecord.caseNo,
                              {
                                assigneeId,
                                note: assignmentNote,
                              },
                            );
                            setAssignmentNote("");
                            await loadRecords(selectedRecord.caseNo);
                          });
                        }}
                      >
                        <h4>{t("complaints.assignCase")}</h4>
                        <input
                          type="text"
                          placeholder={t("complaints.assigneeIdPlaceholder")}
                          value={assigneeId}
                          onChange={(event) =>
                            setAssigneeId(event.target.value)
                          }
                        />
                        <textarea
                          rows={2}
                          placeholder={t(
                            "complaints.assignmentNotePlaceholder",
                          )}
                          value={assignmentNote}
                          onChange={(event) =>
                            setAssignmentNote(event.target.value)
                          }
                        />
                        <button
                          className="btn"
                          type="submit"
                          disabled={busyKey === "assign-case"}
                        >
                          {t("complaints.assign")}
                        </button>
                      </form>

                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("add-note", async () => {
                            await getOpsClient().addComplaintNote(
                              selectedRecord.caseNo,
                              {
                                note: noteText,
                              },
                            );
                            setNoteText("");
                            await loadRecords(selectedRecord.caseNo);
                          });
                        }}
                      >
                        <h4>{t("complaints.addNote")}</h4>
                        <textarea
                          rows={3}
                          placeholder={t(
                            "complaints.investigationNotePlaceholder",
                          )}
                          value={noteText}
                          onChange={(event) => setNoteText(event.target.value)}
                        />
                        <button
                          className="btn"
                          type="submit"
                          disabled={busyKey === "add-note"}
                        >
                          {t("complaints.saveNote")}
                        </button>
                      </form>
                    </div>
                  </section>

                  <section className="detail-card">
                    <div className="detail-subgrid">
                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("resolve-case", async () => {
                            await getOpsClient().resolveComplaint(
                              selectedRecord.caseNo,
                              {
                                resolutionCode,
                                closingNote,
                              },
                            );
                            await loadRecords(selectedRecord.caseNo);
                          });
                        }}
                      >
                        <h4>{t("complaints.resolveCase")}</h4>
                        <select
                          value={resolutionCode}
                          onChange={(event) =>
                            setResolutionCode(
                              event.target.value as ComplaintResolutionCode,
                            )
                          }
                        >
                          {validResolutionCodes.map((code) => (
                            <option key={code} value={code}>
                              {formatOpsCodeLabel(locale, code)}
                            </option>
                          ))}
                        </select>
                        <textarea
                          rows={3}
                          placeholder={t("complaints.closingNotePlaceholder")}
                          value={closingNote}
                          onChange={(event) =>
                            setClosingNote(event.target.value)
                          }
                        />
                        <div className="action-row">
                          <button
                            className="btn"
                            type="submit"
                            disabled={busyKey === "resolve-case"}
                          >
                            {t("complaints.resolve")}
                          </button>
                          <button
                            className="btn"
                            type="button"
                            disabled={busyKey === "close-case"}
                            onClick={() =>
                              void runAction("close-case", async () => {
                                await getOpsClient().closeComplaint(
                                  selectedRecord.caseNo,
                                  {
                                    resolutionCode,
                                    closingNote,
                                  },
                                );
                                await loadRecords(selectedRecord.caseNo);
                              })
                            }
                          >
                            {t("complaints.close")}
                          </button>
                        </div>
                      </form>

                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("reopen-case", async () => {
                            await getOpsClient().reopenComplaint(
                              selectedRecord.caseNo,
                              {
                                reason: reopenReason,
                              },
                            );
                            setReopenReason("");
                            await loadRecords(selectedRecord.caseNo);
                          });
                        }}
                      >
                        <h4>{t("complaints.reopenCase")}</h4>
                        <textarea
                          rows={3}
                          placeholder={t("complaints.reopenReasonPlaceholder")}
                          value={reopenReason}
                          onChange={(event) =>
                            setReopenReason(event.target.value)
                          }
                        />
                        <button
                          className="btn"
                          type="submit"
                          disabled={busyKey === "reopen-case"}
                        >
                          {t("complaints.reopen")}
                        </button>
                      </form>
                    </div>
                  </section>

                  {!selectedRecord.relatedIncidentId && (
                    <section className="detail-card">
                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("escalate-incident", async () => {
                            await getOpsClient().escalateComplaintToIncident(
                              selectedRecord.caseNo,
                              {
                                title: escalateTitle,
                                severity: escalateSeverity,
                                reason: escalateReason,
                              },
                            );
                            setEscalateTitle("");
                            setEscalateReason("");
                            setEscalateSeverity("medium");
                            await loadRecords(selectedRecord.caseNo);
                          });
                        }}
                      >
                        <h4>{t("complaints.escalateToIncident")}</h4>
                        <input
                          type="text"
                          placeholder={t("complaints.escalateTitlePlaceholder")}
                          value={escalateTitle}
                          onChange={(event) =>
                            setEscalateTitle(event.target.value)
                          }
                          required
                        />
                        <select
                          value={escalateSeverity}
                          onChange={(event) =>
                            setEscalateSeverity(
                              event.target
                                .value as EscalateComplaintToIncidentCommand["severity"],
                            )
                          }
                        >
                          {(["low", "medium", "high", "critical"] as const).map(
                            (sev) => (
                              <option key={sev} value={sev}>
                                {formatOpsCodeLabel(locale, sev)}
                              </option>
                            ),
                          )}
                        </select>
                        <textarea
                          rows={3}
                          placeholder={t(
                            "complaints.escalateReasonPlaceholder",
                          )}
                          value={escalateReason}
                          onChange={(event) =>
                            setEscalateReason(event.target.value)
                          }
                          required
                        />
                        <button
                          className="btn btn-warning"
                          type="submit"
                          disabled={busyKey === "escalate-incident"}
                        >
                          {t("complaints.escalateBtn")}
                        </button>
                      </form>
                    </section>
                  )}

                  <section className="detail-card">
                    <h4>{t("complaints.timelineExport")}</h4>
                    <div className="export-banner">
                      <strong>
                        {exportView?.readyForAudit
                          ? t("complaints.readyForAudit")
                          : t("complaints.notExportReady")}
                      </strong>
                      <small>
                        {t("complaints.exportGenerated", {
                          value: formatDateTime(exportView?.exportGeneratedAt),
                        })}
                      </small>
                    </div>
                    <div className="timeline-list">
                      {timeline.length > 0 ? (
                        timeline.map((entry) => (
                          <div key={entry.entryId} className="timeline-item">
                            <strong>
                              {formatOpsCodeLabel(locale, entry.action)}
                            </strong>
                            <span>{entry.note}</span>
                            <small>{formatDateTime(entry.createdAt)}</small>
                          </div>
                        ))
                      ) : (
                        <p className="empty-state">
                          {t("complaints.timelineEmpty")}
                        </p>
                      )}
                    </div>
                  </section>
                </div>
              ) : (
                <p className="empty-state">{t("complaints.noSelection")}</p>
              )}
            </DataViewCard>
          </div>
        )}

        <Link className="route-link" href="/">
          <strong>{t("complaints.backToHome")}</strong>{" "}
          {t("complaints.backToHomeSub")}
        </Link>

        <style jsx>{`
          .console-shell {
            --line-soft: #dbe4f0;
            --line-strong: #cbd5e1;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --shadow-soft: 0 18px 40px -28px rgba(15, 23, 42, 0.35);
            color: var(--text-main);
            display: grid;
            gap: 1rem;
            padding: 0.25rem 0 1.5rem;
          }
          .workspace-headline {
            display: grid;
            gap: 0.4rem;
          }
          .workspace-headline h3 {
            margin: 0;
            font-size: 1.12rem;
            letter-spacing: -0.02em;
          }
          .workspace-kicker {
            color: #9a3412;
          }
          .detail-status-row {
            display: flex;
            gap: 0.65rem;
            flex-wrap: wrap;
            align-items: center;
          }
          .assumption-list {
            margin: 0;
            padding-left: 1.1rem;
            color: var(--text-muted);
          }
          .toolbar,
          .action-row {
            display: flex;
            gap: 0.75rem;
            flex-wrap: wrap;
            align-items: center;
          }
          .toolbar {
            padding: 0.95rem 1rem;
            border: 1px solid var(--line-soft);
            border-radius: 1.1rem;
            background: rgba(255, 255, 255, 0.86);
            box-shadow: var(--shadow-soft);
          }
          .form-grid,
          .detail-grid,
          .detail-subgrid,
          .queue-grid {
            display: grid;
            gap: 0.9rem;
          }
          .queue-grid {
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          }
          .queue-card {
            display: grid;
            gap: 0.5rem;
            padding: 0.9rem 1rem;
            border-radius: 1rem;
            border: 1px solid #fdba74;
            background: linear-gradient(
              180deg,
              rgba(255, 251, 235, 0.96),
              rgba(255, 255, 255, 0.98)
            );
            text-align: left;
            cursor: pointer;
            box-shadow: var(--shadow-soft);
          }
          .queue-card-head {
            display: flex;
            justify-content: space-between;
            gap: 0.75rem;
            align-items: center;
            flex-wrap: wrap;
          }
          .queue-card p {
            margin: 0;
            color: #334155;
          }
          .queue-card-subcopy,
          .table-subcopy {
            color: var(--text-muted);
            font-size: 0.82rem;
          }
          .search-input,
          input,
          select,
          textarea {
            width: 100%;
            border: 1px solid var(--line-strong);
            border-radius: 0.9rem;
            padding: 0.75rem 0.85rem;
            font: inherit;
            background: rgba(255, 255, 255, 0.96);
          }
          .btn {
            border: 1px solid var(--line-strong);
            border-radius: 999px;
            padding: 0.68rem 1rem;
            background: rgba(255, 255, 255, 0.94);
            cursor: pointer;
            color: var(--text-main);
          }
          .btn-primary {
            border-color: #0f172a;
            background: #0f172a;
            color: #fff;
          }
          .btn-warning {
            background: #fff7ed;
            border-color: #fb923c;
            color: #9a3412;
          }
          .inline-link {
            color: #0f172a;
            text-decoration: none;
          }
          .content-grid {
            display: grid;
            gap: 0.9rem;
            grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
            align-items: start;
          }
          .detail-card {
            padding: 1rem 1.05rem;
            border: 1px solid var(--line-soft);
            border-radius: 1.2rem;
            background: rgba(255, 255, 255, 0.96);
            box-shadow: var(--shadow-soft);
            backdrop-filter: blur(12px);
          }
          .table-wrap {
            overflow-x: auto;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
          }
          .table th,
          .table td {
            text-align: left;
            padding: 0.8rem 0.65rem;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
          }
          .table th {
            color: var(--text-muted);
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          tbody tr {
            cursor: pointer;
            transition: background 120ms ease;
          }
          .selected-row {
            background: #fff7ed;
          }
          .cell-title {
            color: var(--text-main);
            font-weight: 700;
          }
          .soft-pill {
            display: inline-flex;
            align-items: center;
            padding: 0.22rem 0.6rem;
            border-radius: 999px;
            background: #eef2ff;
            border: 1px solid #c7d2fe;
            color: #4338ca;
            font-size: 0.78rem;
            font-weight: 700;
          }
          .details-stack,
          .stack-form,
          .timeline-list {
            display: grid;
            gap: 0.8rem;
          }
          .detail-hero-card {
            background: linear-gradient(
              180deg,
              rgba(255, 247, 237, 0.92),
              rgba(255, 255, 255, 0.98)
            );
          }
          .quick-link {
            font-size: 0.88rem;
            font-weight: 600;
          }
          .detail-grid {
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          }
          .detail-subgrid {
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          }
          .label {
            display: block;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--text-muted);
            margin-bottom: 0.25rem;
          }
          .detail-grid strong,
          .detail-subgrid h4 {
            color: var(--text-main);
          }
          .detail-grid small {
            color: var(--text-muted);
          }
          .description {
            margin-top: 0.8rem;
            margin-bottom: 0;
            color: #334155;
          }
          .timeline-item {
            border-left: 3px solid #f97316;
            padding: 0.1rem 0 0.1rem 0.8rem;
            display: grid;
            gap: 0.18rem;
          }
          .export-banner {
            padding: 0.9rem 1rem;
            border-radius: 1rem;
            background: linear-gradient(135deg, #fff7ed, #ffffff);
            color: #9a3412;
            border: 1px solid #fed7aa;
            display: grid;
            gap: 0.25rem;
            margin-bottom: 0.8rem;
          }
          .full-span {
            grid-column: 1 / -1;
          }
          .empty-state {
            color: var(--text-muted);
          }
          .eyebrow {
            margin: 0 0 0.28rem;
            font-size: 0.74rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--text-muted);
          }
          @media (max-width: 960px) {
            .content-grid {
              grid-template-columns: 1fr;
            }
            .toolbar {
              padding: 0.9rem;
            }
          }
        `}</style>
      </div>
    </>
  );
}
