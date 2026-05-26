"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@drts/ui-web";
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

function getComplaintQueueTone(record: ComplaintCaseRecord) {
  if (record.slaBreach) {
    return "queue-badge badge-danger";
  }
  if (record.severity === "high") {
    return "queue-badge badge-warning";
  }
  return "queue-badge";
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
        title={t("complaints.title")}
        subtitle={t("complaints.subtitle")}
      />
      <div>
        {error && (
          <div className="error-banner">
            <strong>{getOpsLabel(locale, "error")}:</strong> {error}
          </div>
        )}

        <section className="workspace-hero">
          <div>
            <p className="eyebrow">
              {locale === "en" ? "Complaint workspace" : "Complaint Workspace"}
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
          </div>
          <div className="hero-chip-row">
            <span className="hero-chip hero-chip-critical">
              {locale === "en"
                ? `${slaBreached} breached SLA case(s)`
                : `${slaBreached} 筆 SLA 違規案件`}
            </span>
            <span className="hero-chip">
              {locale === "en"
                ? `${escalationReadyCases.length} escalation-ready`
                : `${escalationReadyCases.length} 筆可升級 incident`}
            </span>
            <span className="hero-chip">
              {locale === "en"
                ? `${unassignedCases} unassigned active case(s)`
                : `${unassignedCases} 筆活躍案件未指派`}
            </span>
          </div>
        </section>

        <section className="summary-grid">
          {[
            {
              label: t("complaints.activeCases"),
              value: activeCases,
              note: t("complaints.activeCasesSub"),
            },
            {
              label: t("complaints.hotlineLinked"),
              value: hotlineLinked,
              note: t("complaints.hotlineLinkedSub"),
            },
            {
              label: t("complaints.slaBreached"),
              value: slaBreached,
              note: t("complaints.slaBreachedSub"),
            },
            {
              label: t("complaints.closedExport"),
              value: readyForAudit,
              note: t("complaints.closedExportSub"),
            },
          ].map((card) => (
            <div key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </div>
          ))}
        </section>

        <section className="assumption-panel">
          <strong>
            {locale === "en"
              ? "Authority and escalation guardrails"
              : "權限與 escalation guardrails"}
          </strong>
          <ul className="assumption-list">
            {complaintGuardrails.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="priority-queue">
          <div className="panel-head">
            <div>
              <p className="eyebrow">
                {locale === "en"
                  ? "SLA + escalation queue"
                  : "SLA / escalation 佇列"}
              </p>
              <h3>
                {locale === "en"
                  ? "Immediate complaints requiring ops attention"
                  : "需立即處理的客訴案件"}
              </h3>
            </div>
            <span className="panel-note">
              {locale === "en"
                ? `${Math.min(escalationReadyCases.length, 4)} shown`
                : `顯示 ${Math.min(escalationReadyCases.length, 4)} 筆`}
            </span>
          </div>
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
                    <span className={getComplaintQueueTone(record)}>
                      {record.slaBreach
                        ? locale === "en"
                          ? "SLA breach"
                          : "SLA 違規"
                        : formatOpsCodeLabel(locale, record.severity)}
                    </span>
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
        </section>

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
          <section className="panel">
            <div className="panel-head">
              <h3>{t("complaints.createTitle")}</h3>
              <p>{t("complaints.createNote")}</p>
            </div>
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
          </section>
        )}

        {loading ? (
          <p>{t("complaints.loading")}</p>
        ) : (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-head">
                <h3>{t("complaints.caseList")}</h3>
                <p>
                  {t("complaints.results", { count: filteredRecords.length })}
                </p>
              </div>
              <div className="table-wrap">
                <table>
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
                          <Link
                            className="inline-link"
                            href={`/complaints/${encodeURIComponent(record.caseNo)}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {record.caseNo}
                          </Link>
                        </td>
                        <td>{formatOpsCodeLabel(locale, record.category)}</td>
                        <td>
                          <div>{formatOpsCodeLabel(locale, record.status)}</div>
                          <div className="table-subcopy">
                            {formatOpsCodeLabel(locale, record.severity)}
                          </div>
                        </td>
                        <td>{record.assigneeId ?? "-"}</td>
                        <td>{record.relatedOrderId ?? "-"}</td>
                        <td>{record.relatedCallId ?? "-"}</td>
                        <td>
                          {record.slaBreach ? (
                            <span className="sla-badge">
                              {locale === "en" ? "BREACH" : "違規"}
                            </span>
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
            </section>

            <section className="panel">
              <div className="panel-head">
                <h3>{t("complaints.caseDetail")}</h3>
                <p>
                  {selectedRecord
                    ? selectedRecord.caseNo
                    : t("complaints.selectCase")}
                </p>
              </div>

              {selectedRecord ? (
                <div className="details-stack">
                  <section className="detail-card">
                    <div className="detail-status-row">
                      <span className={getComplaintQueueTone(selectedRecord)}>
                        {selectedRecord.slaBreach
                          ? locale === "en"
                            ? "SLA breach"
                            : "SLA 違規"
                          : formatOpsCodeLabel(locale, selectedRecord.severity)}
                      </span>
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
                          <span className="sla-badge">SLA BREACH</span>
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
                      <Link
                        className="btn"
                        href={`/complaints/${encodeURIComponent(selectedRecord.caseNo)}`}
                      >
                        {locale === "en"
                          ? "Open full workspace"
                          : "開啟完整詳情"}
                      </Link>
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
            </section>
          </div>
        )}

        <Link className="route-link" href="/">
          <strong>{t("complaints.backToHome")}</strong>{" "}
          {t("complaints.backToHomeSub")}
        </Link>

        <style jsx>{`
          .summary-grid,
          .content-grid,
          .form-grid,
          .detail-grid,
          .detail-subgrid,
          .queue-grid {
            display: grid;
            gap: 0.9rem;
          }
          .workspace-hero,
          .priority-queue,
          .assumption-panel,
          .panel,
          .detail-card {
            border: 1px solid #dbe4f0;
            border-radius: 1rem;
            background: #fff;
          }
          .workspace-hero,
          .priority-queue,
          .assumption-panel {
            padding: 1rem;
            margin-bottom: 1rem;
          }
          .workspace-hero {
            display: grid;
            gap: 1rem;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: start;
            background: linear-gradient(135deg, #fff7ed, #fff1f2 65%, #ffffff);
          }
          .hero-chip-row,
          .detail-status-row {
            display: flex;
            gap: 0.65rem;
            flex-wrap: wrap;
            align-items: center;
          }
          .hero-chip,
          .queue-badge {
            display: inline-flex;
            align-items: center;
            padding: 0.22rem 0.6rem;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 700;
          }
          .hero-chip {
            background: rgba(255, 255, 255, 0.86);
            border: 1px solid #fdba74;
            color: #9a3412;
          }
          .hero-chip-critical,
          .badge-danger {
            background: #fee2e2;
            border: 1px solid #fca5a5;
            color: #b91c1c;
          }
          .queue-badge,
          .badge-warning {
            background: #fef3c7;
            border: 1px solid #fcd34d;
            color: #a16207;
          }
          .assumption-panel strong {
            display: block;
            margin-bottom: 0.55rem;
          }
          .assumption-list {
            margin: 0;
            padding-left: 1.1rem;
            color: #475569;
          }
          .summary-grid {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            margin-bottom: 1rem;
          }
          .summary-card {
            padding: 0.95rem 1rem;
            border: 1px solid #dbe4f0;
            border-radius: 1rem;
            background: #fff;
          }
          .summary-card strong {
            display: block;
            font-size: 1.35rem;
            margin: 0.2rem 0;
          }
          .toolbar,
          .action-row {
            display: flex;
            gap: 0.75rem;
            flex-wrap: wrap;
            align-items: center;
          }
          .toolbar {
            margin-bottom: 1rem;
          }
          .queue-grid {
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          }
          .queue-card {
            display: grid;
            gap: 0.5rem;
            padding: 0.9rem 1rem;
            border-radius: 0.95rem;
            border: 1px solid #fed7aa;
            background: #fffbeb;
            text-align: left;
            cursor: pointer;
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
            color: #64748b;
            font-size: 0.82rem;
          }
          .search-input,
          input,
          select,
          textarea {
            width: 100%;
            border: 1px solid #cbd5e1;
            border-radius: 0.85rem;
            padding: 0.7rem 0.8rem;
            font: inherit;
            background: #fff;
          }
          .btn {
            border: 1px solid #cbd5e1;
            border-radius: 999px;
            padding: 0.65rem 1rem;
            background: #fff;
            cursor: pointer;
          }
          .btn-primary {
            border-color: #9a3412;
            background: #9a3412;
            color: #fff;
          }
          .btn-warning {
            background: #fef3c7;
            border-color: #f59e0b;
            color: #92400e;
          }
          .inline-link {
            color: #0f172a;
            text-decoration: none;
          }
          .content-grid {
            grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
            margin-top: 1rem;
            margin-bottom: 1rem;
          }
          .panel,
          .detail-card {
            padding: 1rem;
          }
          .panel-head {
            display: flex;
            justify-content: space-between;
            gap: 0.75rem;
            align-items: baseline;
            margin-bottom: 0.8rem;
          }
          .table-wrap {
            overflow-x: auto;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th,
          td {
            text-align: left;
            padding: 0.75rem 0.65rem;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
          }
          tbody tr {
            cursor: pointer;
          }
          .selected-row {
            background: #fff7ed;
          }
          .details-stack,
          .stack-form,
          .timeline-list {
            display: grid;
            gap: 0.8rem;
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
            color: #64748b;
            margin-bottom: 0.25rem;
          }
          .description {
            margin-top: 0.8rem;
            margin-bottom: 0;
            color: #334155;
          }
          .timeline-item {
            border-left: 3px solid #c2410c;
            padding-left: 0.75rem;
          }
          .export-banner {
            padding: 0.85rem 1rem;
            border-radius: 0.9rem;
            background: #fff7ed;
            color: #9a3412;
            display: grid;
            gap: 0.25rem;
            margin-bottom: 0.8rem;
          }
          .full-span {
            grid-column: 1 / -1;
          }
          .sla-badge {
            display: inline-flex;
            margin-top: 0.3rem;
            padding: 0.2rem 0.6rem;
            border-radius: 999px;
            background: #fef2f2;
            color: #dc2626;
            font-size: 0.7rem;
            font-weight: 700;
            letter-spacing: 0.05em;
            border: 1px solid #fca5a5;
          }
          .empty-state {
            color: #64748b;
          }
          @media (max-width: 960px) {
            .workspace-hero,
            .content-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </>
  );
}
