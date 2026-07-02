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
  formatDeskHealth,
  formatQueuePolicy,
  formatRecordingAvailability,
  formatRequestedProduct,
  localizeDeskRecord,
  type RequestedServiceProduct,
  resolveDeskAccess,
} from "@/lib/desk-catalog";
import {
  formatCallStatus,
  formatComplianceFlag,
  formatDateTime,
  formatOrderStatus,
  formatRecordingState,
  formatTraceEventType,
} from "@/lib/formatters";
import { useTranslation } from "@/lib/i18n";
import {
  buildConciergeManualPinAddress,
  getConciergeMapBookingGate,
  parseConciergeMapProviderState,
  type ConciergeMapProviderState,
} from "@/lib/map-booking";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

type SubmissionSummary = {
  order: OwnedOrderRecord;
  trace: DispatchTraceLogRecord[];
  callbackTask: CallbackTaskRecord | null;
};

const CONCIERGE_PICKUP_FIXTURE_PIN = {
  lat: "25.037519",
  lng: "121.56368",
};

const CONCIERGE_DROPOFF_FIXTURE_PIN = {
  lat: "25.033879",
  lng: "121.568743",
};

type ConciergeMapPinState = "missing" | "confirmed" | "invalid";

function getConciergeMapPinState(
  lat: string,
  lng: string,
): ConciergeMapPinState {
  if (!lat.trim() && !lng.trim()) {
    return "missing";
  }

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  return Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLng) &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLng >= -180 &&
    parsedLng <= 180
    ? "confirmed"
    : "invalid";
}

export default function ConciergeBookingCreatePage() {
  const router = useRouter();
  const { locale, t } = useTranslation();
  const {
    session,
    recordCall,
    clearActiveCall,
    recordOrder,
    recordCallbackTask,
  } = useConciergePortal();
  const deskRecord = useSelectedDesk();
  const desk = localizeDeskRecord(deskRecord, t);
  const [passengerName, setPassengerName] = useState(
    t("booking.defaultPassengerName"),
  );
  const [passengerPhone, setPassengerPhone] = useState(
    t("booking.defaultPassengerPhone"),
  );
  const [pickupAddress, setPickupAddress] = useState(
    desk?.location ?? t("booking.defaultPickup"),
  );
  const [pickupLat, setPickupLat] = useState("");
  const [pickupLng, setPickupLng] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState(
    t("booking.defaultDropoff"),
  );
  const [dropoffLat, setDropoffLat] = useState("");
  const [dropoffLng, setDropoffLng] = useState("");
  const [manualPinReason, setManualPinReason] = useState(
    t("booking.map.defaultReason"),
  );
  const [mapProviderState, setMapProviderState] =
    useState<ConciergeMapProviderState>("manual_fallback");
  const [requestedProduct, setRequestedProduct] =
    useState<RequestedServiceProduct>("standard_taxi");
  const [quotedEtaMinutes, setQuotedEtaMinutes] = useState("12");
  const [callbackDueAt, setCallbackDueAt] = useState("");
  const [callbackNote, setCallbackNote] = useState("");
  const [notes, setNotes] = useState(t("booking.defaultNotes"));
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSession, setCurrentSession] =
    useState<CallSessionRecord | null>(null);
  const [submission, setSubmission] = useState<SubmissionSummary | null>(null);

  useEffect(() => {
    const syncMapProviderState = () => {
      const query = new URLSearchParams(window.location.search);
      setMapProviderState(
        parseConciergeMapProviderState(query.get("mapProviderState")),
      );
    };
    syncMapProviderState();
    window.addEventListener("popstate", syncMapProviderState);
    window.addEventListener(
      "drts:map-provider-state-change",
      syncMapProviderState,
    );
    return () => {
      window.removeEventListener("popstate", syncMapProviderState);
      window.removeEventListener(
        "drts:map-provider-state-change",
        syncMapProviderState,
      );
    };
  }, []);

  useEffect(() => {
    const activeCallId = session?.activeCallId;
    if (!activeCallId) {
      setCurrentSession(null);
      return;
    }

    let cancelled = false;
    const client = createConciergeClient(session.operatorId, session.mode);

    void (async () => {
      try {
        const nextSession = await client.getCallSession(activeCallId);
        if (!cancelled) {
          setCurrentSession(nextSession);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : t("booking.error.loadSession"),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.activeCallId, session?.mode, session?.operatorId, t]);

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
  const mapGate = getConciergeMapBookingGate({
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng,
  });
  const mapGateState = mapGate.canSubmit ? "coordinates_ready" : mapGate.reason;

  const pickupPinState = getConciergeMapPinState(pickupLat, pickupLng);
  const dropoffPinState = getConciergeMapPinState(dropoffLat, dropoffLng);
  const mapProviderUnavailable = mapProviderState === "provider_unavailable";

  function updatePickupAddress(nextAddress: string) {
    setPickupAddress(nextAddress);
    setPickupLat("");
    setPickupLng("");
  }

  function updateDropoffAddress(nextAddress: string) {
    setDropoffAddress(nextAddress);
    setDropoffLat("");
    setDropoffLng("");
  }

  function confirmPickupPin() {
    setPickupLat(CONCIERGE_PICKUP_FIXTURE_PIN.lat);
    setPickupLng(CONCIERGE_PICKUP_FIXTURE_PIN.lng);
  }

  function confirmDropoffPin() {
    setDropoffLat(CONCIERGE_DROPOFF_FIXTURE_PIN.lat);
    setDropoffLng(CONCIERGE_DROPOFF_FIXTURE_PIN.lng);
  }

  return (
    <div className="page-shell">
      <SessionGuard requireDesk>
        <section className="hero-card">
          <span className="section-kicker">{t("booking.eyebrow")}</span>
          <h1>{t("booking.title")}</h1>
          <p>{t("booking.body")}</p>
        </section>

        {error ? <section className="error-copy">{error}</section> : null}

        <section className="detail-grid">
          <article className="panel-card">
            <span className="section-kicker">
              {t("booking.posture.eyebrow")}
            </span>
            <h2>{desk?.deskName}</h2>
            <p>
              {desk
                ? `${desk.siteName} · ${desk.zoneLabel} · ${t(
                    "booking.posture.queuePolicy",
                    {
                      policy: formatQueuePolicy(desk.queuePolicy, t),
                    },
                  )}`
                : null}
            </p>
            <div className="badge-row">
              <span
                className={`chip${
                  desk?.health === "healthy" ? " chip-success" : " chip-warning"
                }`}
              >
                {desk ? formatDeskHealth(desk.health, t) : null}
              </span>
              <span className="chip">
                {desk
                  ? formatRecordingAvailability(desk.recordingAvailability, t)
                  : null}
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
                        : t("booking.error.openSession"),
                    );
                  } finally {
                    setBusyKey(null);
                  }
                }}
                type="button"
              >
                {activeDeskSession
                  ? t("booking.posture.active")
                  : t("booking.posture.open")}
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
                          : t("booking.error.closeSession"),
                      );
                    } finally {
                      setBusyKey(null);
                    }
                  }}
                  type="button"
                >
                  {t("booking.posture.close")}
                </button>
              ) : null}
            </div>
            {currentSession ? (
              <div className="kv-grid">
                <div className="kv-item">
                  <strong>{t("booking.summary.callId")}</strong>
                  <p>{currentSession.callId}</p>
                </div>
                <div className="kv-item">
                  <strong>{t("booking.currentSession.status")}</strong>
                  <p>{formatCallStatus(currentSession.status, t)}</p>
                </div>
                <div className="kv-item">
                  <strong>{t("common.recording")}</strong>
                  <p>
                    {formatRecordingState(currentSession.recordingState, t)}
                  </p>
                </div>
                <div className="kv-item">
                  <strong>{t("booking.summary.eta")}</strong>
                  <p>
                    {currentSession.lastEtaQuotedMinutes
                      ? t("common.minutesShort", {
                          count: currentSession.lastEtaQuotedMinutes,
                        })
                      : t("common.notSet")}
                  </p>
                </div>
              </div>
            ) : null}
          </article>

          <article className="panel-card">
            <span className="section-kicker">
              {t("booking.guardrails.eyebrow")}
            </span>
            <h2>{t("booking.guardrails.title")}</h2>
            <p>{t("booking.guardrails.body")}</p>
            <div className="inline-actions">
              <Link className="secondary-link" href="/denied">
                {t("booking.guardrails.denied")}
              </Link>
              <Link className="secondary-link" href="/ineligible">
                {t("booking.guardrails.ineligible")}
              </Link>
              <Link className="secondary-link" href="/recording-unavailable">
                {t("booking.guardrails.recording")}
              </Link>
            </div>
          </article>
        </section>

        <section className="panel-card">
          <span className="section-kicker">{t("booking.form.eyebrow")}</span>
          <h2>{t("booking.form.title")}</h2>
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!session || !deskRecord || !desk) {
                return;
              }

              const access = resolveDeskAccess(deskRecord, session.mode, t);
              if (!access.allowed) {
                router.push(`/denied?desk=${desk.deskId}&mode=${session.mode}`);
                return;
              }

              if (desk.health === "degraded") {
                router.push(`/degraded?desk=${desk.deskId}`);
                return;
              }

              const eligibility = evaluateDeskEligibility(
                deskRecord,
                requestedProduct,
                pickupAddress,
                dropoffAddress,
                t,
              );
              if (eligibility.state === "ineligible") {
                router.push(
                  `/ineligible?desk=${desk.deskId}&reason=${eligibility.reasonCode}`,
                );
                return;
              }

              if (!mapGate.canSubmit) {
                setError(t(`booking.map.error.${mapGate.reason}`));
                return;
              }

              setBusyKey("submit-order");
              setError(null);
              setSubmission(null);

              try {
                const selectedAt = new Date().toISOString();
                const pickup = buildConciergeManualPinAddress({
                  address: pickupAddress,
                  lat: pickupLat,
                  lng: pickupLng,
                  actorId: session.operatorId,
                  selectedAt,
                  manualOverrideReason: manualPinReason,
                });
                const dropoff = buildConciergeManualPinAddress({
                  address: dropoffAddress,
                  lat: dropoffLat,
                  lng: dropoffLng,
                  actorId: session.operatorId,
                  selectedAt,
                  manualOverrideReason: manualPinReason,
                });
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
                  pickup,
                  dropoff,
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
                    : t("booking.error.submit"),
                );
              } finally {
                setBusyKey(null);
              }
            }}
          >
            <div className="field-stack">
              <label htmlFor="passenger-name">
                {t("booking.field.passengerName")}
              </label>
              <input
                id="passenger-name"
                onChange={(event) => setPassengerName(event.target.value)}
                required
                value={passengerName}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="passenger-phone">
                {t("booking.field.passengerPhone")}
              </label>
              <input
                id="passenger-phone"
                onChange={(event) => setPassengerPhone(event.target.value)}
                required
                value={passengerPhone}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="requested-product">
                {t("booking.field.product")}
              </label>
              <select
                id="requested-product"
                onChange={(event) =>
                  setRequestedProduct(
                    event.target.value as RequestedServiceProduct,
                  )
                }
                value={requestedProduct}
              >
                <option value="standard_taxi">
                  {formatRequestedProduct("standard_taxi", t)}
                </option>
                <option value="airport_assist">
                  {formatRequestedProduct("airport_assist", t)}
                </option>
                <option value="medical_discharge">
                  {formatRequestedProduct("medical_discharge", t)}
                </option>
              </select>
              <p className="form-help">{t("booking.help.product")}</p>
            </div>
            <div className="field-stack">
              <label htmlFor="quoted-eta">{t("booking.field.eta")}</label>
              <input
                id="quoted-eta"
                min="1"
                onChange={(event) => setQuotedEtaMinutes(event.target.value)}
                type="number"
                value={quotedEtaMinutes}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="pickup-address">
                {t("booking.field.pickup")}
              </label>
              <textarea
                id="pickup-address"
                onChange={(event) => updatePickupAddress(event.target.value)}
                required
                value={pickupAddress}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="dropoff-address">
                {t("booking.field.dropoff")}
              </label>
              <textarea
                id="dropoff-address"
                onChange={(event) => updateDropoffAddress(event.target.value)}
                required
                value={dropoffAddress}
              />
            </div>
            <div
              className="field-stack"
              data-concierge-map-booking-gate={mapGateState}
              data-concierge-map-provider-state={mapProviderState}
            >
              <span className="section-kicker">{t("booking.map.eyebrow")}</span>
              <h3>{t("booking.map.title")}</h3>
              <p className="form-help">{t("booking.map.body")}</p>
              {mapProviderUnavailable ? (
                <p className="form-help" data-concierge-map-provider-outage>
                  <strong>{t("booking.map.providerUnavailableTitle")}</strong>{" "}
                  {t("booking.map.providerUnavailableBody")}
                </p>
              ) : null}
              <div
                className="form-grid"
                data-concierge-map-coordinate-entry
                data-concierge-map-pickup-state={pickupPinState}
                data-concierge-map-dropoff-state={dropoffPinState}
              >
                <div className="field-stack">
                  <strong>{t("booking.map.pin.pickup")}</strong>
                  <span className="form-help">
                    {pickupPinState === "confirmed"
                      ? t("booking.map.pin.confirmed")
                      : t("booking.map.pin.required")}
                  </span>
                  <div className="inline-actions">
                    <button
                      className="secondary-button"
                      data-concierge-map-confirm-pickup
                      disabled={mapProviderUnavailable}
                      onClick={confirmPickupPin}
                      type="button"
                    >
                      {t("booking.map.pin.confirmPickup")}
                    </button>
                    <button
                      className="secondary-button"
                      data-concierge-map-clear-pickup
                      onClick={() => {
                        setPickupLat("");
                        setPickupLng("");
                      }}
                      type="button"
                    >
                      {t("booking.map.pin.clearPickup")}
                    </button>
                  </div>
                </div>
                <div className="field-stack">
                  <strong>{t("booking.map.pin.dropoff")}</strong>
                  <span className="form-help">
                    {dropoffPinState === "confirmed"
                      ? t("booking.map.pin.confirmed")
                      : t("booking.map.pin.required")}
                  </span>
                  <div className="inline-actions">
                    <button
                      className="secondary-button"
                      data-concierge-map-confirm-dropoff
                      disabled={mapProviderUnavailable}
                      onClick={confirmDropoffPin}
                      type="button"
                    >
                      {t("booking.map.pin.confirmDropoff")}
                    </button>
                    <button
                      className="secondary-button"
                      data-concierge-map-clear-dropoff
                      onClick={() => {
                        setDropoffLat("");
                        setDropoffLng("");
                      }}
                      type="button"
                    >
                      {t("booking.map.pin.clearDropoff")}
                    </button>
                  </div>
                </div>
                <div className="field-stack">
                  <label htmlFor="manual-pin-reason">
                    {t("booking.map.field.reason")}
                  </label>
                  <textarea
                    id="manual-pin-reason"
                    onChange={(event) => setManualPinReason(event.target.value)}
                    value={manualPinReason}
                  />
                </div>
              </div>
              <p className="form-help">
                {mapGate.canSubmit
                  ? t("booking.map.ready")
                  : t(`booking.map.error.${mapGate.reason}`)}
              </p>
            </div>
            <div className="field-stack">
              <label htmlFor="callback-due-at">
                {t("booking.field.callbackDue")}
              </label>
              <input
                id="callback-due-at"
                onChange={(event) => setCallbackDueAt(event.target.value)}
                type="datetime-local"
                value={callbackDueAt}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="callback-note">
                {t("booking.field.callbackNote")}
              </label>
              <textarea
                id="callback-note"
                onChange={(event) => setCallbackNote(event.target.value)}
                value={callbackNote}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="booking-notes">{t("booking.field.notes")}</label>
              <textarea
                id="booking-notes"
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </div>

            <div className="inline-actions">
              <button
                className="primary-button"
                disabled={busyKey === "submit-order" || !mapGate.canSubmit}
                type="submit"
              >
                {t("booking.submit")}
              </button>
            </div>
          </form>
        </section>

        {submission ? (
          <section className="detail-grid">
            <article className="detail-card">
              <header>
                <div>
                  <span className="section-kicker">
                    {t("booking.summary.eyebrow")}
                  </span>
                  <h3>{submission.order.orderNo}</h3>
                </div>
                <span
                  className={`chip${
                    submission.order.status === "recording_pending"
                      ? " chip-warning"
                      : " chip-success"
                  }`}
                >
                  {formatOrderStatus(submission.order.status, t)}
                </span>
              </header>
              <div className="kv-grid">
                <div className="kv-item">
                  <strong>{t("booking.summary.orderId")}</strong>
                  <p>{submission.order.orderId}</p>
                </div>
                <div className="kv-item">
                  <strong>{t("booking.summary.callId")}</strong>
                  <p>{submission.order.callId ?? t("common.notSet")}</p>
                </div>
                <div className="kv-item">
                  <strong>{t("booking.summary.eta")}</strong>
                  <p>
                    {submission.order.etaSnapshot
                      ? t("common.minutesShort", {
                          count: submission.order.etaSnapshot.etaMinutes,
                        })
                      : t("common.notAvailable")}
                  </p>
                </div>
                <div className="kv-item">
                  <strong>{t("booking.summary.recording")}</strong>
                  <p>
                    {submission.order.complianceFlags.length > 0
                      ? submission.order.complianceFlags
                          .map((flag) => formatComplianceFlag(flag, t))
                          .join(", ")
                      : t("common.none")}
                  </p>
                </div>
              </div>
              {submission.callbackTask ? (
                <p>
                  {t("booking.summary.callbackDue", {
                    callbackTaskId: submission.callbackTask.callbackTaskId,
                    dueAt: formatDateTime(
                      submission.callbackTask.dueAt,
                      locale,
                      t,
                    ),
                  })}
                </p>
              ) : null}
              <div className="inline-actions">
                <Link className="secondary-link" href="/lookup">
                  {t("common.openLookup")}
                </Link>
                <Link className="secondary-link" href="/callbacks">
                  {t("common.openCallbacks")}
                </Link>
                {desk?.recordingAvailability === "ops_callback_only" ? (
                  <Link
                    className="secondary-link"
                    href="/recording-unavailable"
                  >
                    {t("common.reviewRecordingGate")}
                  </Link>
                ) : null}
              </div>
            </article>

            <article className="detail-card">
              <header>
                <div>
                  <span className="section-kicker">
                    {t("booking.trace.eyebrow")}
                  </span>
                  <h3>{t("booking.trace.title")}</h3>
                </div>
              </header>
              <ul className="trace-list">
                {submission.trace.map((entry) => (
                  <li key={entry.traceId}>
                    <strong>{formatTraceEventType(entry.eventType, t)}</strong>
                    <p>{entry.message}</p>
                    <p>{formatDateTime(entry.createdAt, locale, t)}</p>
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
