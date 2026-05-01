"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@drts/ui-web";
import type {
  AttachCallRecordingCommand,
  CallbackTaskRecord,
  CallRecordingState,
  CallSessionRecord,
  ComplaintCategory,
  CreateCallCenterOrderCommand,
  DispatchTraceLogRecord,
  OpenCallSessionCommand,
  OwnedOrderRecord,
  TransferCallToComplaintCommand,
} from "@drts/contracts";
import { CALL_TYPES, COMPLAINT_CATEGORIES } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatOpsCodeLabel,
  formatOpsCodeList,
  getOpsLabel,
} from "@/lib/localized-labels";

const CALL_TYPE_OPTIONS = [...CALL_TYPES];
const COMPLAINT_CATEGORY_OPTIONS: ComplaintCategory[] = [
  ...COMPLAINT_CATEGORIES,
];

type RecordingFormState = AttachCallRecordingCommand & {
  agentId: string;
};

const INITIAL_INTAKE_FORM: OpenCallSessionCommand = {
  callType: "booking",
  callerPhone: "",
  agentId: "AGENT-OPS-001",
  agentIdentityAnnounced: true,
};

const INITIAL_ORDER_FORM = {
  passengerName: "",
  passengerPhone: "",
  pickupAddress: "",
  dropoffAddress: "",
  notes: "",
};

const INITIAL_RECORDING_FORM: RecordingFormState = {
  recordingId: "",
  providerRecordingRef: "",
  recordingUrl: "",
  agentId: "AGENT-OPS-001",
};

const INITIAL_COMPLAINT_TRANSFER_FORM: TransferCallToComplaintCommand = {
  category: "fare_dispute",
  severity: "normal",
  description: "",
};

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "-";
}

function toIsoString(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function getRecordingStateTone(recordingState: CallRecordingState) {
  switch (recordingState) {
    case "ready":
      return "state-chip state-ready";
    case "missing":
      return "state-chip state-missing";
    case "pending":
    default:
      return "state-chip state-pending";
  }
}

function getOverrideStatusTone(status: string) {
  switch (status) {
    case "approved":
      return "queue-badge badge-positive";
    case "rejected":
      return "queue-badge badge-danger";
    case "expired":
      return "queue-badge badge-warning";
    case "pending_approval":
    default:
      return "queue-badge badge-warning";
  }
}

export default function CallcenterPage() {
  const { t, locale } = useTranslation();
  const resolveErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : t("common.unknown");
  const [sessions, setSessions] = useState<CallSessionRecord[]>([]);
  const [callbacks, setCallbacks] = useState<CallbackTaskRecord[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OwnedOrderRecord | null>(
    null,
  );
  const [dispatchTrace, setDispatchTrace] = useState<DispatchTraceLogRecord[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showIntake, setShowIntake] = useState(false);
  const [intakeForm, setIntakeForm] = useState(INITIAL_INTAKE_FORM);
  const [orderForm, setOrderForm] = useState(INITIAL_ORDER_FORM);
  const [existingOrderId, setExistingOrderId] = useState("");
  const [quotedEtaMinutes, setQuotedEtaMinutes] = useState("12");
  const [recordingForm, setRecordingForm] = useState<RecordingFormState>(
    INITIAL_RECORDING_FORM,
  );
  const [callbackDueAt, setCallbackDueAt] = useState("");
  const [callbackNote, setCallbackNote] = useState("");
  const [callbackCompleteNote, setCallbackCompleteNote] = useState("");
  const [transferForm, setTransferForm] = useState(
    INITIAL_COMPLAINT_TRANSFER_FORM,
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const selectedSession = useMemo(
    () => sessions.find((session) => session.callId === selectedCallId) ?? null,
    [selectedCallId, sessions],
  );

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const linkedOrderId = selectedSession?.linkedOrderId;
    if (!linkedOrderId) {
      setSelectedOrder(null);
      setDispatchTrace([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const client = getOpsClient();
        const [order, trace] = await Promise.all([
          client.getOrder(linkedOrderId),
          client.getOrderDispatchTrace(linkedOrderId),
        ]);
        if (cancelled) {
          return;
        }
        setSelectedOrder(order as OwnedOrderRecord);
        setDispatchTrace(trace);
      } catch (nextError) {
        if (!cancelled) {
          setError(resolveErrorMessage(nextError));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSession?.linkedOrderId]);

  async function loadData(preferredCallId?: string) {
    setLoading(true);
    try {
      const client = getOpsClient();
      const [nextSessions, nextCallbacks] = await Promise.all([
        client.listCallSessions(),
        client.listCallbackTasks(),
      ]);
      setSessions(nextSessions);
      setCallbacks(nextCallbacks);
      const focusCallId =
        preferredCallId ??
        (nextSessions.some((session) => session.callId === selectedCallId)
          ? selectedCallId
          : (nextSessions[0]?.callId ?? null));
      setSelectedCallId(focusCallId);
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

  const filteredSessions = sessions.filter((session) => {
    if (!deferredQuery) {
      return true;
    }
    const haystack = [
      session.callId,
      session.callType,
      session.callerPhone,
      session.agentId ?? "",
      session.linkedOrderId ?? "",
      session.linkedCaseNo ?? "",
      session.status,
      session.flags.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(deferredQuery);
  });

  const openSessions = sessions.filter(
    (session) => session.status === "active",
  ).length;
  const bookingLinked = sessions.filter(
    (session) => session.linkedOrderId,
  ).length;
  const recordingPending = sessions.filter((session) =>
    session.flags.includes("recording_pending"),
  ).length;
  const hotlineTransfers = sessions.filter(
    (session) => session.linkedCaseNo,
  ).length;

  return (
    <>
      <PageHeader
        title={t("callcenter.title")}
        subtitle={t("callcenter.subtitle")}
      />
      <div>
        {error && (
          <div className="error-banner">
            <strong>{getOpsLabel(locale, "error")}:</strong> {error}
          </div>
        )}

        <section className="summary-grid">
          {[
            {
              label: t("callcenter.openSessions"),
              value: openSessions,
              note: t("callcenter.openSessionsSub"),
            },
            {
              label: t("callcenter.linkedOrders"),
              value: bookingLinked,
              note: t("callcenter.linkedOrdersSub"),
            },
            {
              label: t("callcenter.recordingPending"),
              value: recordingPending,
              note: t("callcenter.recordingPendingSub"),
            },
            {
              label: t("callcenter.hotlineTransfers"),
              value: hotlineTransfers,
              note: t("callcenter.hotlineTransfersSub"),
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
            placeholder={t("callcenter.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowIntake((current) => !current)}
          >
            {showIntake
              ? t("callcenter.hideIntake")
              : t("callcenter.openIntake")}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void loadData(selectedCallId ?? undefined)}
          >
            {t("common.refresh")}
          </button>
        </div>

        <section className="assumption-panel">
          <strong>{t("callcenter.integrationAssumptionsTitle")}</strong>
          <ul className="assumption-list">
            <li>{t("callcenter.integrationAssumption.screenPop")}</li>
            <li>{t("callcenter.integrationAssumption.recording")}</li>
            <li>{t("callcenter.integrationAssumption.storage")}</li>
          </ul>
        </section>

        {showIntake && (
          <section className="panel">
            <div className="panel-head">
              <h3>{t("callcenter.newIntake")}</h3>
              <p>{t("callcenter.intakeNote")}</p>
            </div>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction("open-intake", async () => {
                  const created =
                    await getOpsClient().openCallSession(intakeForm);
                  setShowIntake(false);
                  setIntakeForm(INITIAL_INTAKE_FORM);
                  setOrderForm((current) => ({
                    ...current,
                    passengerPhone: created.callerPhone,
                  }));
                  setRecordingForm((current) => ({
                    ...current,
                    agentId:
                      created.agentId ??
                      INITIAL_INTAKE_FORM.agentId ??
                      "AGENT-OPS-001",
                  }));
                  await loadData(created.callId);
                });
              }}
            >
              <label>
                {t("callcenter.form.callType")}
                <select
                  value={intakeForm.callType}
                  onChange={(event) =>
                    setIntakeForm((current) => ({
                      ...current,
                      callType: event.target
                        .value as OpenCallSessionCommand["callType"],
                    }))
                  }
                >
                  {CALL_TYPE_OPTIONS.map((callType) => (
                    <option key={callType} value={callType}>
                      {formatOpsCodeLabel(locale, callType)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("callcenter.form.callerPhone")}
                <input
                  type="text"
                  value={intakeForm.callerPhone}
                  onChange={(event) =>
                    setIntakeForm((current) => ({
                      ...current,
                      callerPhone: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                {t("callcenter.form.agentId")}
                <input
                  type="text"
                  value={intakeForm.agentId ?? ""}
                  onChange={(event) =>
                    setIntakeForm((current) => ({
                      ...current,
                      agentId: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(intakeForm.agentIdentityAnnounced)}
                  onChange={(event) =>
                    setIntakeForm((current) => ({
                      ...current,
                      agentIdentityAnnounced: event.target.checked,
                    }))
                  }
                />
                {t("callcenter.form.announced")}
              </label>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busyKey === "open-intake"}
              >
                {busyKey === "open-intake"
                  ? t("callcenter.form.opening")
                  : t("callcenter.form.openSession")}
              </button>
            </form>
          </section>
        )}

        {loading ? (
          <p>{t("callcenter.loading")}</p>
        ) : (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-head">
                <h3>{t("callcenter.sessions")}</h3>
                <p>
                  {t("callcenter.results", { count: filteredSessions.length })}
                </p>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("callcenter.col.call")}</th>
                      <th>{t("callcenter.col.type")}</th>
                      <th>{t("callcenter.col.caller")}</th>
                      <th>{t("callcenter.col.agent")}</th>
                      <th>{t("callcenter.col.status")}</th>
                      <th>{t("callcenter.col.recordingState")}</th>
                      <th>{t("callcenter.col.order")}</th>
                      <th>{t("callcenter.col.complaint")}</th>
                      <th>{t("callcenter.col.started")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.map((session) => (
                      <tr
                        key={session.callId}
                        className={
                          session.callId === selectedCallId
                            ? "selected-row"
                            : ""
                        }
                        onClick={() => setSelectedCallId(session.callId)}
                      >
                        <td>{session.callId}</td>
                        <td>{formatOpsCodeLabel(locale, session.callType)}</td>
                        <td>{session.callerPhone}</td>
                        <td>{session.agentId ?? "-"}</td>
                        <td>{formatOpsCodeLabel(locale, session.status)}</td>
                        <td>
                          <span
                            className={getRecordingStateTone(
                              session.recordingState,
                            )}
                          >
                            {t(
                              `callcenter.recordingState.${session.recordingState}`,
                            )}
                          </span>
                        </td>
                        <td>{session.linkedOrderId ?? "-"}</td>
                        <td>{session.linkedCaseNo ?? "-"}</td>
                        <td>{formatDateTime(session.startedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h3>{t("callcenter.sessionDetail")}</h3>
                <p>
                  {selectedSession
                    ? `${selectedSession.callId} / ${formatOpsCodeLabel(
                        locale,
                        selectedSession.callType,
                      )}`
                    : t("callcenter.selectSession")}
                </p>
              </div>

              {selectedSession ? (
                <div className="details-stack">
                  <section className="detail-card">
                    <div className="detail-grid">
                      <div>
                        <span className="label">
                          {t("callcenter.detail.identityAnnounced")}
                        </span>
                        <strong>
                          {selectedSession.agentIdentityAnnounced
                            ? t("common.yes")
                            : t("common.no")}
                        </strong>
                        <small>
                          {formatDateTime(
                            selectedSession.agentIdentityAnnouncedAt,
                          )}
                        </small>
                      </div>
                      <div>
                        <span className="label">
                          {t("callcenter.detail.recording")}
                        </span>
                        <span
                          className={getRecordingStateTone(
                            selectedSession.recordingState,
                          )}
                        >
                          {t(
                            `callcenter.recordingState.${selectedSession.recordingState}`,
                          )}
                        </span>
                        <strong>
                          {selectedSession.recordingId ??
                            (selectedSession.recordingState === "missing"
                              ? t("callcenter.detail.recordingMissing")
                              : t("callcenter.detail.recordingPending"))}
                        </strong>
                        <small>
                          {selectedSession.providerRecordingRef ?? "-"}
                        </small>
                      </div>
                      <div>
                        <span className="label">
                          {t("callcenter.detail.lastEtaReply")}
                        </span>
                        <strong>
                          {selectedSession.lastEtaQuotedMinutes
                            ? t("callcenter.detail.etaMin", {
                                value: selectedSession.lastEtaQuotedMinutes,
                              })
                            : t("callcenter.detail.etaNotSent")}
                        </strong>
                        <small>
                          {formatDateTime(selectedSession.lastEtaQuotedAt)}
                        </small>
                      </div>
                      <div>
                        <span className="label">
                          {t("callcenter.detail.flags")}
                        </span>
                        <strong>
                          {selectedSession.flags.length
                            ? formatOpsCodeList(locale, selectedSession.flags)
                            : "-"}
                        </strong>
                        <small>{formatDateTime(selectedSession.endedAt)}</small>
                      </div>
                    </div>
                    <div className="action-row">
                      {!selectedSession.agentIdentityAnnounced && (
                        <button
                          className="btn"
                          type="button"
                          disabled={busyKey === "announce-identity"}
                          onClick={() =>
                            void runAction("announce-identity", async () => {
                              await getOpsClient().announceCallAgentIdentity(
                                selectedSession.callId,
                                {
                                  agentId:
                                    selectedSession.agentId ??
                                    intakeForm.agentId ??
                                    "AGENT-OPS-001",
                                },
                              );
                              await loadData(selectedSession.callId);
                            })
                          }
                        >
                          {t("callcenter.markIdentityAnnounced")}
                        </button>
                      )}
                      {selectedSession.status !== "closed" && (
                        <button
                          className="btn"
                          type="button"
                          disabled={busyKey === "close-session"}
                          onClick={() =>
                            void runAction("close-session", async () => {
                              await getOpsClient().closeCallSession(
                                selectedSession.callId,
                              );
                              await loadData(selectedSession.callId);
                            })
                          }
                        >
                          {t("callcenter.closeSession")}
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
                          void runAction("attach-recording", async () => {
                            await getOpsClient().attachRecordingCallback(
                              selectedSession.callId,
                              {
                                ...recordingForm,
                                agentId:
                                  recordingForm.agentId ??
                                  selectedSession.agentId ??
                                  intakeForm.agentId,
                              },
                            );
                            setRecordingForm(INITIAL_RECORDING_FORM);
                            await loadData(selectedSession.callId);
                          });
                        }}
                      >
                        <h4>{t("callcenter.attachRecordingForm")}</h4>
                        <input
                          type="text"
                          placeholder={t("callcenter.recordingIdPlaceholder")}
                          value={recordingForm.recordingId}
                          onChange={(event) =>
                            setRecordingForm((current) => ({
                              ...current,
                              recordingId: event.target.value,
                            }))
                          }
                        />
                        <input
                          type="text"
                          placeholder={t("callcenter.providerRefPlaceholder")}
                          value={recordingForm.providerRecordingRef ?? ""}
                          onChange={(event) =>
                            setRecordingForm((current) => ({
                              ...current,
                              providerRecordingRef: event.target.value,
                            }))
                          }
                        />
                        <input
                          type="url"
                          placeholder={t("callcenter.recordingUrlPlaceholder")}
                          value={recordingForm.recordingUrl ?? ""}
                          onChange={(event) =>
                            setRecordingForm((current) => ({
                              ...current,
                              recordingUrl: event.target.value,
                            }))
                          }
                        />
                        <button
                          className="btn"
                          type="submit"
                          disabled={busyKey === "attach-recording"}
                        >
                          {t("callcenter.attachRecording")}
                        </button>
                      </form>

                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("quote-eta", async () => {
                            await getOpsClient().quoteCallEta(
                              selectedSession.callId,
                              {
                                etaMinutes: Number(quotedEtaMinutes),
                              },
                            );
                            await loadData(selectedSession.callId);
                          });
                        }}
                      >
                        <h4>{t("callcenter.replyEta")}</h4>
                        <input
                          type="number"
                          min={1}
                          value={quotedEtaMinutes}
                          onChange={(event) =>
                            setQuotedEtaMinutes(event.target.value)
                          }
                        />
                        <button
                          className="btn"
                          type="submit"
                          disabled={busyKey === "quote-eta"}
                        >
                          {t("callcenter.saveEtaReply")}
                        </button>
                      </form>

                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("create-callback", async () => {
                            await getOpsClient().createCallbackTask(
                              selectedSession.callId,
                              {
                                dueAt: toIsoString(callbackDueAt),
                                note: callbackNote,
                              },
                            );
                            setCallbackDueAt("");
                            setCallbackNote("");
                            await loadData(selectedSession.callId);
                          });
                        }}
                      >
                        <h4>{t("callcenter.callbackQueueForm")}</h4>
                        <input
                          type="datetime-local"
                          value={callbackDueAt}
                          onChange={(event) =>
                            setCallbackDueAt(event.target.value)
                          }
                        />
                        <textarea
                          rows={2}
                          placeholder={t("callcenter.callbackNotePlaceholder")}
                          value={callbackNote}
                          onChange={(event) =>
                            setCallbackNote(event.target.value)
                          }
                        />
                        <div className="action-row">
                          <button
                            className="btn"
                            type="submit"
                            disabled={busyKey === "create-callback"}
                          >
                            {t("callcenter.saveCallback")}
                          </button>
                          {selectedSession.callbackTask?.status ===
                            "pending" && (
                            <>
                              <input
                                type="text"
                                placeholder={t(
                                  "callcenter.completionNotePlaceholder",
                                )}
                                value={callbackCompleteNote}
                                onChange={(event) =>
                                  setCallbackCompleteNote(event.target.value)
                                }
                              />
                              <button
                                className="btn"
                                type="button"
                                disabled={busyKey === "complete-callback"}
                                onClick={() =>
                                  void runAction(
                                    "complete-callback",
                                    async () => {
                                      await getOpsClient().completeCallbackTask(
                                        selectedSession.callbackTask!
                                          .callbackTaskId,
                                        {
                                          note: callbackCompleteNote,
                                        },
                                      );
                                      setCallbackCompleteNote("");
                                      await loadData(selectedSession.callId);
                                    },
                                  )
                                }
                              >
                                {t("callcenter.completeCallback")}
                              </button>
                            </>
                          )}
                        </div>
                      </form>
                    </div>
                  </section>

                  <section className="detail-card">
                    <div className="detail-subgrid">
                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const command: CreateCallCenterOrderCommand = {
                            callId: selectedSession.callId,
                            agentId:
                              selectedSession.agentId ??
                              intakeForm.agentId ??
                              "AGENT-OPS-001",
                            recordingId: selectedSession.recordingId,
                            pickup: { address: orderForm.pickupAddress },
                            dropoff: { address: orderForm.dropoffAddress },
                            passenger: {
                              name: orderForm.passengerName,
                              phone:
                                orderForm.passengerPhone ||
                                selectedSession.callerPhone,
                            },
                            ...(orderForm.notes.trim()
                              ? { notes: orderForm.notes.trim() }
                              : {}),
                          };
                          void runAction("create-phone-order", async () => {
                            await getOpsClient().createCallCenterOrder(command);
                            setOrderForm(INITIAL_ORDER_FORM);
                            await loadData(selectedSession.callId);
                          });
                        }}
                      >
                        <h4>{t("callcenter.createPhoneBooking")}</h4>
                        <input
                          type="text"
                          placeholder={t("callcenter.passengerNamePlaceholder")}
                          value={orderForm.passengerName}
                          onChange={(event) =>
                            setOrderForm((current) => ({
                              ...current,
                              passengerName: event.target.value,
                            }))
                          }
                        />
                        <input
                          type="text"
                          placeholder={t(
                            "callcenter.passengerPhonePlaceholder",
                          )}
                          value={orderForm.passengerPhone}
                          onChange={(event) =>
                            setOrderForm((current) => ({
                              ...current,
                              passengerPhone: event.target.value,
                            }))
                          }
                        />
                        <input
                          type="text"
                          placeholder={t("callcenter.pickupAddressPlaceholder")}
                          value={orderForm.pickupAddress}
                          onChange={(event) =>
                            setOrderForm((current) => ({
                              ...current,
                              pickupAddress: event.target.value,
                            }))
                          }
                        />
                        <input
                          type="text"
                          placeholder={t(
                            "callcenter.dropoffAddressPlaceholder",
                          )}
                          value={orderForm.dropoffAddress}
                          onChange={(event) =>
                            setOrderForm((current) => ({
                              ...current,
                              dropoffAddress: event.target.value,
                            }))
                          }
                        />
                        <textarea
                          rows={2}
                          placeholder={t("callcenter.opsNotePlaceholder")}
                          value={orderForm.notes}
                          onChange={(event) =>
                            setOrderForm((current) => ({
                              ...current,
                              notes: event.target.value,
                            }))
                          }
                        />
                        <button
                          className="btn"
                          type="submit"
                          disabled={busyKey === "create-phone-order"}
                        >
                          {t("callcenter.createOrderFromCall")}
                        </button>
                      </form>

                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("link-order", async () => {
                            await getOpsClient().linkCallOrder(
                              selectedSession.callId,
                              {
                                orderId: existingOrderId,
                              },
                            );
                            setExistingOrderId("");
                            await loadData(selectedSession.callId);
                          });
                        }}
                      >
                        <h4>{t("callcenter.bindExistingOrder")}</h4>
                        <input
                          type="text"
                          placeholder={t(
                            "callcenter.existingOrderIdPlaceholder",
                          )}
                          value={existingOrderId}
                          onChange={(event) =>
                            setExistingOrderId(event.target.value)
                          }
                        />
                        <button
                          className="btn"
                          type="submit"
                          disabled={busyKey === "link-order"}
                        >
                          {t("callcenter.linkOrderToCall")}
                        </button>
                      </form>

                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("transfer-complaint", async () => {
                            await getOpsClient().transferCallToComplaint(
                              selectedSession.callId,
                              {
                                ...transferForm,
                                ...(selectedSession.linkedOrderId ||
                                transferForm.relatedOrderId
                                  ? {
                                      relatedOrderId:
                                        selectedSession.linkedOrderId ??
                                        transferForm.relatedOrderId ??
                                        null,
                                    }
                                  : {}),
                              },
                            );
                            setTransferForm(INITIAL_COMPLAINT_TRANSFER_FORM);
                            await loadData(selectedSession.callId);
                          });
                        }}
                      >
                        <h4>{t("callcenter.transferComplaintForm")}</h4>
                        <select
                          value={transferForm.category}
                          onChange={(event) =>
                            setTransferForm((current) => ({
                              ...current,
                              category: event.target.value as ComplaintCategory,
                            }))
                          }
                        >
                          {COMPLAINT_CATEGORY_OPTIONS.map((category) => (
                            <option key={category} value={category}>
                              {formatOpsCodeLabel(locale, category)}
                            </option>
                          ))}
                        </select>
                        <select
                          value={transferForm.severity}
                          onChange={(event) =>
                            setTransferForm((current) => ({
                              ...current,
                              severity: event.target
                                .value as TransferCallToComplaintCommand["severity"],
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
                        <textarea
                          rows={3}
                          placeholder={t(
                            "callcenter.complaintDescriptionPlaceholder",
                          )}
                          value={transferForm.description}
                          onChange={(event) =>
                            setTransferForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                        <button
                          className="btn"
                          type="submit"
                          disabled={busyKey === "transfer-complaint"}
                        >
                          {t("callcenter.createComplaintCase")}
                        </button>
                      </form>
                    </div>
                  </section>

                  <section className="detail-card">
                    <h4>{t("callcenter.linkedOrderTrace")}</h4>
                    {selectedOrder ? (
                      <div className="stack">
                        <div className="detail-grid">
                          <div>
                            <span className="label">
                              {t("callcenter.detail.order")}
                            </span>
                            <strong>{selectedOrder.orderNo}</strong>
                            <small>{selectedOrder.orderId}</small>
                          </div>
                          <div>
                            <span className="label">
                              {t("callcenter.detail.status")}
                            </span>
                            <strong>
                              {formatOpsCodeLabel(locale, selectedOrder.status)}
                            </strong>
                            <small>
                              ETA{" "}
                              {selectedOrder.etaSnapshot
                                ? t("callcenter.detail.etaMin", {
                                    value: selectedOrder.etaSnapshot.etaMinutes,
                                  })
                                : t("callcenter.detail.etaPending")}
                            </small>
                          </div>
                          <div>
                            <span className="label">
                              {t("callcenter.detail.pickup")}
                            </span>
                            <strong>{selectedOrder.pickup.address}</strong>
                            <small>{selectedOrder.dropoff.address}</small>
                          </div>
                          <div>
                            <span className="label">
                              {t("callcenter.detail.compliance")}
                            </span>
                            <strong>
                              {formatOpsCodeList(
                                locale,
                                selectedOrder.complianceFlags,
                              )}
                            </strong>
                            <small>{selectedOrder.recordingId ?? "-"}</small>
                          </div>
                        </div>
                        {selectedOrder.exceptionHold && (
                          <div className="detail-card nested-detail-card">
                            <div className="panel-head">
                              <div>
                                <h4>{t("callcenter.detail.exceptionHold")}</h4>
                                <p className="panel-note">
                                  {t("callcenter.detail.exceptionReason", {
                                    reason: formatOpsCodeLabel(
                                      locale,
                                      selectedOrder.exceptionHold.reasonCode,
                                    ),
                                  })}
                                </p>
                              </div>
                              {selectedOrder.exceptionHold.overrideRequest && (
                                <span
                                  className={getOverrideStatusTone(
                                    selectedOrder.exceptionHold.overrideRequest
                                      .status,
                                  )}
                                >
                                  {formatOpsCodeLabel(
                                    locale,
                                    selectedOrder.exceptionHold.overrideRequest
                                      .status,
                                  )}
                                </span>
                              )}
                            </div>
                            <div className="detail-grid">
                              <div>
                                <span className="label">
                                  {t("callcenter.detail.overrideActors")}
                                </span>
                                <strong>
                                  {selectedOrder.exceptionHold.overrideActors
                                    .map((actor) =>
                                      formatOpsCodeLabel(locale, actor),
                                    )
                                    .join(", ") || "-"}
                                </strong>
                                <small>
                                  {t("callcenter.detail.exceptionRaisedAt", {
                                    value: formatDateTime(
                                      selectedOrder.exceptionHold.raisedAt,
                                    ),
                                  })}
                                </small>
                              </div>
                              <div>
                                <span className="label">
                                  {t("callcenter.detail.overrideType")}
                                </span>
                                <strong>
                                  {selectedOrder.exceptionHold.overrideRequest
                                    ? formatOpsCodeLabel(
                                        locale,
                                        selectedOrder.exceptionHold
                                          .overrideRequest.overrideType,
                                      )
                                    : "-"}
                                </strong>
                                <small>
                                  {selectedOrder.exceptionHold.overrideRequest
                                    ? t(
                                        "callcenter.detail.overrideRequestedBy",
                                        {
                                          actor:
                                            selectedOrder.exceptionHold
                                              .overrideRequest.requestedBy
                                              .actorId,
                                        },
                                      )
                                    : t(
                                        "callcenter.detail.noOverrideRequested",
                                      )}
                                </small>
                              </div>
                              <div>
                                <span className="label">
                                  {t("callcenter.detail.overrideDecision")}
                                </span>
                                <strong>
                                  {selectedOrder.exceptionHold.overrideRequest
                                    ?.approval
                                    ? t("callcenter.detail.overrideApproved")
                                    : selectedOrder.exceptionHold
                                          .overrideRequest?.rejection
                                      ? t("callcenter.detail.overrideRejected")
                                      : selectedOrder.exceptionHold
                                            .overrideRequest?.expiredAt
                                        ? t("callcenter.detail.overrideExpired")
                                        : "-"}
                                </strong>
                                <small>
                                  {selectedOrder.exceptionHold.overrideRequest
                                    ?.approval
                                    ? t(
                                        "callcenter.detail.overrideApprovedBy",
                                        {
                                          actor:
                                            selectedOrder.exceptionHold
                                              .overrideRequest.approval.actorId,
                                        },
                                      )
                                    : selectedOrder.exceptionHold
                                          .overrideRequest?.rejection
                                      ? t(
                                          "callcenter.detail.overrideRejectedBy",
                                          {
                                            actor:
                                              selectedOrder.exceptionHold
                                                .overrideRequest.rejection
                                                .actorId,
                                          },
                                        )
                                      : selectedOrder.exceptionHold
                                            .overrideRequest?.expiredAt
                                        ? t(
                                            "callcenter.detail.overrideExpiredAt",
                                            {
                                              value: formatDateTime(
                                                selectedOrder.exceptionHold
                                                  .overrideRequest.expiredAt,
                                              ),
                                            },
                                          )
                                        : t(
                                            "callcenter.detail.overrideAwaitingApproval",
                                          )}
                                </small>
                              </div>
                              <div>
                                <span className="label">
                                  {t("callcenter.detail.lastResolution")}
                                </span>
                                <strong>
                                  {selectedOrder.exceptionHold.resolution
                                    ? formatOpsCodeLabel(
                                        locale,
                                        selectedOrder.exceptionHold.resolution
                                          .resolution,
                                      )
                                    : "-"}
                                </strong>
                                <small>
                                  {selectedOrder.exceptionHold.resolution
                                    ? t(
                                        "callcenter.detail.resolutionActorReason",
                                        {
                                          actor:
                                            selectedOrder.exceptionHold
                                              .resolution.actorId,
                                          reason:
                                            selectedOrder.exceptionHold
                                              .resolution.reason,
                                        },
                                      )
                                    : t(
                                        "callcenter.detail.noResolutionRecorded",
                                      )}
                                </small>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="toolbar">
                          <Link
                            className="btn"
                            href={`/dispatch?orderId=${encodeURIComponent(selectedOrder.orderId)}`}
                          >
                            {t("callcenter.openInDispatch")}
                          </Link>
                        </div>
                        <div className="trace-list">
                          {dispatchTrace.length > 0 ? (
                            dispatchTrace.map((trace) => (
                              <div key={trace.traceId} className="trace-item">
                                <strong>
                                  {formatOpsCodeLabel(locale, trace.eventType)}
                                </strong>
                                <span>{trace.message}</span>
                                <small>{formatDateTime(trace.createdAt)}</small>
                              </div>
                            ))
                          ) : (
                            <p className="empty-state">
                              {t("callcenter.noDispatchTrace")}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="empty-state">
                        {t("callcenter.linkOrderFirst")}
                      </p>
                    )}
                  </section>
                </div>
              ) : (
                <p className="empty-state">{t("callcenter.noSession")}</p>
              )}
            </section>
          </div>
        )}

        <section className="panel">
          <div className="panel-head">
            <h3>{t("callcenter.callbacks")}</h3>
            <p>{t("callcenter.callbackCount", { count: callbacks.length })}</p>
          </div>
          {callbacks.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("callcenter.col.callbackId")}</th>
                    <th>{t("callcenter.col.call")}</th>
                    <th>{t("callcenter.col.status")}</th>
                    <th>{t("callcenter.col.due")}</th>
                    <th>{t("callcenter.col.order")}</th>
                    <th>{t("callcenter.col.case")}</th>
                  </tr>
                </thead>
                <tbody>
                  {callbacks.map((callback) => (
                    <tr key={callback.callbackTaskId}>
                      <td>{callback.callbackTaskId}</td>
                      <td>{callback.callId}</td>
                      <td>{formatOpsCodeLabel(locale, callback.status)}</td>
                      <td>{formatDateTime(callback.dueAt)}</td>
                      <td>{callback.linkedOrderId ?? "-"}</td>
                      <td>{callback.linkedCaseNo ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{t("callcenter.emptyCallbacks")}</p>
          )}
        </section>

        <Link className="route-link" href="/">
          <strong>{t("callcenter.backToHome")}</strong>{" "}
          {t("callcenter.backToHomeSub")}
        </Link>

        <style jsx>{`
          .summary-grid,
          .content-grid,
          .detail-subgrid,
          .detail-grid,
          .form-grid {
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
          .state-chip {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            margin-bottom: 0.35rem;
            padding: 0.18rem 0.55rem;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 600;
          }
          .state-ready {
            background: #dcfce7;
            color: #166534;
          }
          .state-pending {
            background: #fef3c7;
            color: #92400e;
          }
          .state-missing {
            background: #fee2e2;
            color: #b91c1c;
          }
          .queue-badge {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            padding: 0.18rem 0.55rem;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 600;
          }
          .badge-positive {
            background: #dcfce7;
            color: #166534;
          }
          .badge-warning {
            background: #fef3c7;
            color: #92400e;
          }
          .badge-danger {
            background: #fee2e2;
            color: #b91c1c;
          }
          .assumption-panel {
            border: 1px solid #cbd5e1;
            border-radius: 1rem;
            background: #f8fafc;
            padding: 0.95rem 1rem;
            margin-bottom: 1rem;
          }
          .assumption-list {
            margin: 0.55rem 0 0;
            padding-left: 1.15rem;
            color: #334155;
            display: grid;
            gap: 0.4rem;
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
            border-color: #0f766e;
            background: #0f766e;
            color: #fff;
          }
          .content-grid {
            grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
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
          .panel-note {
            margin: 0.2rem 0 0;
            color: #64748b;
            font-size: 0.92rem;
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
            background: #ecfeff;
          }
          .details-stack,
          .trace-list,
          .stack,
          .stack-form {
            display: grid;
            gap: 0.8rem;
          }
          .detail-grid {
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          }
          .detail-subgrid {
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          }
          .nested-detail-card {
            margin-top: 0.25rem;
            border-style: dashed;
            background: #fffbeb;
          }
          .label {
            display: block;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #64748b;
            margin-bottom: 0.25rem;
          }
          .trace-item {
            border-left: 3px solid #0f766e;
            padding-left: 0.75rem;
          }
          .checkbox {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .checkbox input {
            width: auto;
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
