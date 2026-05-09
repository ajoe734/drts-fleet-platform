"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  CallSessionRecord,
  CallbackTaskRecord,
  DispatchTraceLogRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import { SessionGuard } from "@/components/session-guard";
import { createConciergeClient } from "@/lib/api-client";
import {
  evaluateDeskEligibility,
  type RequestedServiceProduct,
  resolveDeskAccess,
} from "@/lib/desk-catalog";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

type SubmissionSummary = {
  order: OwnedOrderRecord;
  trace: DispatchTraceLogRecord[];
  callbackTask: CallbackTaskRecord | null;
};

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

export default function ConciergeBookingCreatePage() {
  const router = useRouter();
  const {
    session,
    recordCall,
    clearActiveCall,
    recordOrder,
    recordCallbackTask,
  } = useConciergePortal();
  const desk = useSelectedDesk();
  const [passengerName, setPassengerName] = useState("陳旅客");
  const [passengerPhone, setPassengerPhone] = useState("0911222333");
  const [pickupAddress, setPickupAddress] = useState(
    desk?.location ?? "台北市信義區市府路 1 號 1F",
  );
  const [dropoffAddress, setDropoffAddress] =
    useState("台北市大安區仁愛路 4 段 12 號");
  const [requestedProduct, setRequestedProduct] =
    useState<RequestedServiceProduct>("standard_taxi");
  const [quotedEtaMinutes, setQuotedEtaMinutes] = useState("12");
  const [callbackDueAt, setCallbackDueAt] = useState("");
  const [callbackNote, setCallbackNote] = useState("");
  const [notes, setNotes] = useState(
    "Desk-created assisted-entry booking from the concierge portal.",
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSession, setCurrentSession] =
    useState<CallSessionRecord | null>(null);
  const [submission, setSubmission] = useState<SubmissionSummary | null>(null);

  useEffect(() => {
    if (!session?.activeCallId) {
      setCurrentSession(null);
      return;
    }

    let cancelled = false;
    const client = createConciergeClient(session.operatorId, session.mode);

    void (async () => {
      try {
        const nextSession = await client.getCallSession(session.activeCallId!);
        if (!cancelled) {
          setCurrentSession(nextSession);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Failed to load the active desk session.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.activeCallId, session?.mode, session?.operatorId]);

  useEffect(() => {
    if (desk?.location) {
      setPickupAddress((current) =>
        current.trim().length === 0 ? desk.location : current,
      );
    }
  }, [desk?.location]);

  const activeDeskSession =
    currentSession && currentSession.status === "active"
      ? currentSession
      : null;

  return (
    <div className="page-shell">
      <SessionGuard requireDesk>
        <section className="hero-card">
          <span className="section-kicker">Proxy booking</span>
          <h1>
            Open a desk session, create the booking, then read back the trace.
          </h1>
          <p>
            This route reuses the callcenter order seam for assisted entry. Site
            eligibility, denied access, degraded desks, and recording
            unavailability are surfaced as first-class routes instead of silent
            failures.
          </p>
        </section>

        {error ? <section className="error-copy">{error}</section> : null}

        <section className="detail-grid">
          <article className="panel-card">
            <span className="section-kicker">Desk posture</span>
            <h2>{desk?.deskName}</h2>
            <p>
              {desk?.siteName} · {desk?.zoneLabel} · queue policy{" "}
              {desk?.queuePolicy}
            </p>
            <div className="badge-row">
              <span
                className={`chip${
                  desk?.health === "healthy" ? " chip-success" : " chip-warning"
                }`}
              >
                {desk?.health === "healthy" ? "Healthy" : "Degraded"}
              </span>
              <span className="chip">
                {desk?.recordingAvailability === "ops_callback_only"
                  ? "Ops callback only"
                  : "Inline recording callback"}
              </span>
            </div>
            <div className="inline-actions">
              <button
                className="primary-button"
                disabled={busyKey === "open-session"}
                onClick={async () => {
                  if (!session || !desk) {
                    return;
                  }

                  setBusyKey("open-session");
                  setError(null);
                  try {
                    const client = createConciergeClient(
                      session.operatorId,
                      session.mode,
                    );
                    const opened = await client.openCallSession({
                      callType: "booking",
                      callerPhone: desk.phone,
                      agentId: session.operatorId,
                      agentIdentityAnnounced: true,
                    });
                    recordCall(opened.callId);
                    setCurrentSession(opened);
                  } catch (nextError) {
                    setError(
                      nextError instanceof Error
                        ? nextError.message
                        : "Failed to open the desk session.",
                    );
                  } finally {
                    setBusyKey(null);
                  }
                }}
                type="button"
              >
                {activeDeskSession
                  ? "Desk session active"
                  : "Open desk session"}
              </button>
              {activeDeskSession ? (
                <button
                  className="secondary-button"
                  disabled={busyKey === "close-session"}
                  onClick={async () => {
                    if (!session) {
                      return;
                    }

                    setBusyKey("close-session");
                    setError(null);
                    try {
                      const client = createConciergeClient(
                        session.operatorId,
                        session.mode,
                      );
                      const closed = await client.closeCallSession(
                        activeDeskSession.callId,
                      );
                      clearActiveCall();
                      setCurrentSession(closed);
                    } catch (nextError) {
                      setError(
                        nextError instanceof Error
                          ? nextError.message
                          : "Failed to close the desk session.",
                      );
                    } finally {
                      setBusyKey(null);
                    }
                  }}
                  type="button"
                >
                  Close desk session
                </button>
              ) : null}
            </div>
            {currentSession ? (
              <div className="kv-grid">
                <div className="kv-item">
                  <strong>Call id</strong>
                  <p>{currentSession.callId}</p>
                </div>
                <div className="kv-item">
                  <strong>Status</strong>
                  <p>{currentSession.status}</p>
                </div>
                <div className="kv-item">
                  <strong>Recording</strong>
                  <p>{currentSession.recordingState}</p>
                </div>
                <div className="kv-item">
                  <strong>Last ETA</strong>
                  <p>
                    {currentSession.lastEtaQuotedMinutes
                      ? `${currentSession.lastEtaQuotedMinutes} min`
                      : "Not quoted"}
                  </p>
                </div>
              </div>
            ) : null}
          </article>

          <article className="panel-card">
            <span className="section-kicker">Guardrails</span>
            <h2>Negative paths are explicit before submission.</h2>
            <p>
              Unauthorized desk lanes route to denied. Unsupported product or
              service area routes to ineligible. Degraded desks block create and
              redirect to read-only fallback. Recording callback stays explicit
              as an ops-only escalation step.
            </p>
            <div className="inline-actions">
              <Link className="secondary-link" href="/denied">
                Denied route
              </Link>
              <Link className="secondary-link" href="/ineligible">
                Ineligible route
              </Link>
              <Link className="secondary-link" href="/recording-unavailable">
                Recording gate
              </Link>
            </div>
          </article>
        </section>

        <section className="panel-card">
          <span className="section-kicker">Create order</span>
          <h2>Submit the proxy booking through the assisted-entry desk.</h2>
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!session || !desk) {
                return;
              }

              const access = resolveDeskAccess(desk, session.mode);
              if (!access.allowed) {
                router.push(`/denied?desk=${desk.deskId}&mode=${session.mode}`);
                return;
              }

              if (desk.health === "degraded") {
                router.push(`/degraded?desk=${desk.deskId}`);
                return;
              }

              const eligibility = evaluateDeskEligibility(
                desk,
                requestedProduct,
                pickupAddress,
                dropoffAddress,
              );
              if (eligibility.state === "ineligible") {
                router.push(
                  `/ineligible?desk=${desk.deskId}&reason=${eligibility.reasonCode}`,
                );
                return;
              }

              setBusyKey("submit-order");
              setError(null);
              setSubmission(null);

              try {
                const client = createConciergeClient(
                  session.operatorId,
                  session.mode,
                );
                const workingSession =
                  activeDeskSession ??
                  (await client.openCallSession({
                    callType: "booking",
                    callerPhone: desk.phone,
                    agentId: session.operatorId,
                    agentIdentityAnnounced: true,
                  }));

                if (!activeDeskSession) {
                  recordCall(workingSession.callId);
                }

                const accepted = await client.createCallCenterOrder({
                  callId: workingSession.callId,
                  agentId: session.operatorId,
                  pickup: {
                    address: pickupAddress,
                  },
                  dropoff: {
                    address: dropoffAddress,
                  },
                  passenger: {
                    name: passengerName,
                    phone: passengerPhone,
                  },
                  notes,
                });

                recordOrder(accepted.orderId);

                const etaMinutes = Number.parseInt(quotedEtaMinutes, 10);
                if (Number.isFinite(etaMinutes) && etaMinutes > 0) {
                  await client.quoteCallEta(workingSession.callId, {
                    etaMinutes,
                  });
                }

                let callbackTask: CallbackTaskRecord | null = null;
                if (callbackDueAt.trim().length > 0) {
                  callbackTask = await client.createCallbackTask(
                    workingSession.callId,
                    {
                      dueAt: new Date(callbackDueAt).toISOString(),
                      note: callbackNote.trim() || null,
                    },
                  );
                  recordCallbackTask(callbackTask.callbackTaskId);
                }

                const [order, trace, refreshedSession] = await Promise.all([
                  client.getOrder(accepted.orderId),
                  client.getOrderDispatchTrace(accepted.orderId),
                  client.getCallSession(workingSession.callId),
                ]);

                setCurrentSession(refreshedSession);
                setSubmission({
                  order,
                  trace,
                  callbackTask,
                });
              } catch (nextError) {
                setError(
                  nextError instanceof Error
                    ? nextError.message
                    : "Failed to create the assisted-entry booking.",
                );
              } finally {
                setBusyKey(null);
              }
            }}
          >
            <div className="field-stack">
              <label htmlFor="passenger-name">Passenger name</label>
              <input
                id="passenger-name"
                onChange={(event) => setPassengerName(event.target.value)}
                required
                value={passengerName}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="passenger-phone">Passenger phone</label>
              <input
                id="passenger-phone"
                onChange={(event) => setPassengerPhone(event.target.value)}
                required
                value={passengerPhone}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="requested-product">Requested product</label>
              <select
                id="requested-product"
                onChange={(event) =>
                  setRequestedProduct(
                    event.target.value as RequestedServiceProduct,
                  )
                }
                value={requestedProduct}
              >
                <option value="standard_taxi">standard_taxi</option>
                <option value="airport_assist">airport_assist</option>
                <option value="medical_discharge">medical_discharge</option>
              </select>
              <p className="form-help">
                Portal validates authorized products before using the existing
                callcenter order seam.
              </p>
            </div>
            <div className="field-stack">
              <label htmlFor="quoted-eta">Quoted ETA minutes</label>
              <input
                id="quoted-eta"
                min="1"
                onChange={(event) => setQuotedEtaMinutes(event.target.value)}
                type="number"
                value={quotedEtaMinutes}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="pickup-address">Pickup address</label>
              <textarea
                id="pickup-address"
                onChange={(event) => setPickupAddress(event.target.value)}
                required
                value={pickupAddress}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="dropoff-address">Drop-off address</label>
              <textarea
                id="dropoff-address"
                onChange={(event) => setDropoffAddress(event.target.value)}
                required
                value={dropoffAddress}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="callback-due-at">
                Optional callback due time
              </label>
              <input
                id="callback-due-at"
                onChange={(event) => setCallbackDueAt(event.target.value)}
                type="datetime-local"
                value={callbackDueAt}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="callback-note">Callback note</label>
              <textarea
                id="callback-note"
                onChange={(event) => setCallbackNote(event.target.value)}
                value={callbackNote}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="booking-notes">Desk notes</label>
              <textarea
                id="booking-notes"
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </div>

            <div className="inline-actions">
              <button
                className="primary-button"
                disabled={busyKey === "submit-order"}
                type="submit"
              >
                Submit assisted-entry booking
              </button>
            </div>
          </form>
        </section>

        {submission ? (
          <section className="detail-grid">
            <article className="detail-card">
              <header>
                <div>
                  <span className="section-kicker">Submission accepted</span>
                  <h3>{submission.order.orderNo}</h3>
                </div>
                <span
                  className={`chip${
                    submission.order.status === "recording_pending"
                      ? " chip-warning"
                      : " chip-success"
                  }`}
                >
                  {submission.order.status}
                </span>
              </header>
              <div className="kv-grid">
                <div className="kv-item">
                  <strong>Order id</strong>
                  <p>{submission.order.orderId}</p>
                </div>
                <div className="kv-item">
                  <strong>Call id</strong>
                  <p>{submission.order.callId ?? "Not linked"}</p>
                </div>
                <div className="kv-item">
                  <strong>ETA snapshot</strong>
                  <p>
                    {submission.order.etaSnapshot
                      ? `${submission.order.etaSnapshot.etaMinutes} min`
                      : "Not available"}
                  </p>
                </div>
                <div className="kv-item">
                  <strong>Recording posture</strong>
                  <p>{submission.order.complianceFlags.join(", ")}</p>
                </div>
              </div>
              {submission.callbackTask ? (
                <p>
                  Callback task {submission.callbackTask.callbackTaskId} is due{" "}
                  {formatDateTime(submission.callbackTask.dueAt)}.
                </p>
              ) : null}
              <div className="inline-actions">
                <Link className="secondary-link" href="/lookup">
                  Open lookup surface
                </Link>
                <Link className="secondary-link" href="/callbacks">
                  Open callbacks
                </Link>
                {desk?.recordingAvailability === "ops_callback_only" ? (
                  <Link
                    className="secondary-link"
                    href="/recording-unavailable"
                  >
                    Review recording gate
                  </Link>
                ) : null}
              </div>
            </article>

            <article className="detail-card">
              <header>
                <div>
                  <span className="section-kicker">Dispatch trace</span>
                  <h3>Order lifecycle evidence</h3>
                </div>
              </header>
              <ul className="trace-list">
                {submission.trace.map((entry) => (
                  <li key={entry.traceId}>
                    <strong>{entry.eventType}</strong>
                    <p>{entry.message}</p>
                    <p>{formatDateTime(entry.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        ) : null}
      </SessionGuard>
    </div>
  );
}
