"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@drts/ui-web";
import type {
  ComplaintCaseRecord,
  ComplaintCategory,
  ComplaintExportViewRecord,
  ComplaintTimelineEntry,
  ComplaintCaseStatus,
  CreateComplaintCaseCommand,
} from "@drts/contracts";
import { COMPLAINT_CASE_STATUSES, COMPLAINT_CATEGORIES } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";

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

export default function ComplaintsPage() {
  const { t } = useTranslation();
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
  const [resolutionCode, setResolutionCode] = useState("RESOLVED");
  const [closingNote, setClosingNote] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const selectedRecord = useMemo(
    () => records.find((record) => record.caseNo === selectedCaseNo) ?? null,
    [records, selectedCaseNo],
  );

  useEffect(() => {
    void loadRecords();
  }, []);

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
      const nextSelected =
        preferredCaseNo ??
        (nextRecords.some((record) => record.caseNo === selectedCaseNo)
          ? selectedCaseNo
          : (nextRecords[0]?.caseNo ?? null));
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

  const filteredRecords = records.filter((record) => {
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
  });

  const activeCases = records.filter((record) =>
    ["new", "assigned", "under_investigation", "reopened"].includes(
      record.status,
    ),
  ).length;
  const hotlineLinked = records.filter((record) => record.relatedCallId).length;
  const slaBreached = records.filter((record) => record.slaBreach).length;
  const readyForAudit = records.filter(
    (record) => record.status === "closed",
  ).length;

  return (
    <>
      <PageHeader
        title={t("complaints.title")}
        subtitle={t("complaints.subtitle")}
      />
      <div>
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

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
                {status}
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
                {category.replace(/_/g, " ")}
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
                  <option value="ops">ops</option>
                  <option value="phone">phone</option>
                  <option value="web">web</option>
                  <option value="app">app</option>
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
                      {category.replace(/_/g, " ")}
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
                  <option value="normal">normal</option>
                  <option value="high">high</option>
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
                        <td>{record.caseNo}</td>
                        <td>{record.category}</td>
                        <td>{record.status}</td>
                        <td>{record.assigneeId ?? "-"}</td>
                        <td>{record.relatedOrderId ?? "-"}</td>
                        <td>{record.relatedCallId ?? "-"}</td>
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
                    <div className="detail-grid">
                      <div>
                        <span className="label">{t("common.status")}</span>
                        <strong>{selectedRecord.status}</strong>
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
                        <strong>{selectedRecord.resolutionCode ?? "-"}</strong>
                        <small>{selectedRecord.closingNote ?? "-"}</small>
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
                        <input
                          type="text"
                          placeholder={t(
                            "complaints.resolutionCodePlaceholder",
                          )}
                          value={resolutionCode}
                          onChange={(event) =>
                            setResolutionCode(event.target.value)
                          }
                        />
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
                            <strong>{entry.action}</strong>
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
          .detail-subgrid {
            display: grid;
            gap: 0.9rem;
          }
          .summary-grid {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            margin-bottom: 1rem;
          }
          .summary-card,
          .panel,
          .detail-card {
            border: 1px solid #dbe4f0;
            border-radius: 1rem;
            background: #fff;
          }
          .summary-card {
            padding: 0.95rem 1rem;
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
          .empty-state {
            color: #64748b;
          }
          @media (max-width: 960px) {
            .content-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </>
  );
}
