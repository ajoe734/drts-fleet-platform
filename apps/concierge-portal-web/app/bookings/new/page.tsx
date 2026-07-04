"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  AddressPayload,
  CallSessionRecord,
  CallbackTaskRecord,
  DispatchTraceLogRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import {
  AddressMapPairPicker,
  buildAddressPickerLabels,
  buildCanvasTheme,
  createConfiguredMockAddressProvider,
  evaluateAddressSubmitGate,
  type AddressMapPairChange,
  type AddressProviderMode,
} from "@drts/ui-web";
import { SessionGuard } from "@/components/session-guard";
import { createConciergeClient } from "@/lib/api-client";
import {
  evaluateDeskProductEligibility,
  evaluateDeskTextServiceAreaEligibility,
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
  buildCallCenterMapFallbackReview,
  formatConciergeApiError,
} from "@/lib/map-booking";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

type SubmissionSummary = {
  order: OwnedOrderRecord;
  trace: DispatchTraceLogRecord[];
  callbackTask: CallbackTaskRecord | null;
};

const mapTheme = buildCanvasTheme({
  surface: "ops",
  density: "compact",
});

function buildFallbackAddress(
  address: string,
  selected: AddressPayload | null,
) {
  if (!selected) {
    return { address };
  }

  return {
    ...selected,
    address,
  };
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
  const [dropoffAddress, setDropoffAddress] = useState(
    t("booking.defaultDropoff"),
  );
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
  const [mapSelection, setMapSelection] = useState<AddressMapPairChange>({
    pickup: null,
    dropoff: null,
    serviceability: null,
    providerState: {
      available: true,
      degraded: false,
      reasonCode: "available",
    },
    bothDispatchReady: false,
  });

  const mapProviderMode =
    (process.env.NEXT_PUBLIC_ADDRESS_PICKER_PROVIDER_MODE as
      | AddressProviderMode
      | undefined) ?? "healthy";
  const mapProvider = useMemo(
    () => createConfiguredMockAddressProvider(mapProviderMode),
    [mapProviderMode],
  );
  const mapLabels = useMemo(() => buildAddressPickerLabels(locale), [locale]);

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
            formatConciergeApiError(nextError, t, "booking.error.loadSession"),
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
                      formatConciergeApiError(
                        nextError,
                        t,
                        "booking.error.openSession",
                      ),
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
                        formatConciergeApiError(
                          nextError,
                          t,
                          "booking.error.closeSession",
                        ),
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

              const productEligibility = evaluateDeskProductEligibility(
                deskRecord,
                requestedProduct,
                t,
              );
              if (productEligibility.state === "ineligible") {
                router.push(
                  `/ineligible?desk=${desk.deskId}&reason=${productEligibility.reasonCode}`,
                );
                return;
              }

              const mapGate = evaluateAddressSubmitGate({
                pickup: mapSelection.pickup,
                dropoff: mapSelection.dropoff,
                serviceability: mapSelection.serviceability,
                providerState: mapSelection.providerState,
              });
              const mapFallbackReview = buildCallCenterMapFallbackReview({
                mapGate,
                providerState: mapSelection.providerState,
              });
              if (mapGate.code === "outside_service_area") {
                router.push(
                  `/ineligible?desk=${desk.deskId}&reason=service_area`,
                );
                return;
              }
              if (mapGate.blocking) {
                setError(t("booking.error.coordinatesRequired"));
                return;
              }
              if (mapGate.code === "ready") {
                const textServiceAreaEligibility =
                  evaluateDeskTextServiceAreaEligibility(
                    deskRecord,
                    pickupAddress,
                    dropoffAddress,
                    t,
                  );
                if (textServiceAreaEligibility.state === "ineligible") {
                  router.push(
                    `/ineligible?desk=${desk.deskId}&reason=${textServiceAreaEligibility.reasonCode}`,
                  );
                  return;
                }
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
                  pickup: buildFallbackAddress(
                    pickupAddress,
                    mapSelection.pickup,
                  ),
                  dropoff: buildFallbackAddress(
                    dropoffAddress,
                    mapSelection.dropoff,
                  ),
                  passenger: {
                    name: passengerName,
                    phone: passengerPhone,
                  },
                  notes,
                  mapFallbackReview,
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
                  formatConciergeApiError(nextError, t, "booking.error.submit"),
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
              <label>{t("booking.field.route")}</label>
              <div style={{ gridColumn: "1 / -1" }}>
                <AddressMapPairPicker
                  actorId={session?.operatorId ?? null}
                  bounds={{
                    minLat: 24.9,
                    maxLat: 25.2,
                    minLng: 121.4,
                    maxLng: 121.7,
                  }}
                  dropoffTitle={t("booking.field.dropoff")}
                  onChange={(change) => {
                    setMapSelection(change);
                    setPickupAddress(change.pickup?.address ?? "");
                    setDropoffAddress(change.dropoff?.address ?? "");
                    if (error === t("booking.error.coordinatesRequired")) {
                      setError(null);
                    }
                  }}
                  pickupTitle={t("booking.field.pickup")}
                  provider={mapProvider}
                  serviceProductType={requestedProduct}
                  surface="concierge_portal"
                  theme={mapTheme}
                  {...(mapLabels ? { labels: mapLabels } : {})}
                />
                <p className="form-help">{t("booking.help.route")}</p>
                {!evaluateAddressSubmitGate({
                  pickup: mapSelection.pickup,
                  dropoff: mapSelection.dropoff,
                  serviceability: mapSelection.serviceability,
                  providerState: mapSelection.providerState,
                }).blocking &&
                evaluateAddressSubmitGate({
                  pickup: mapSelection.pickup,
                  dropoff: mapSelection.dropoff,
                  serviceability: mapSelection.serviceability,
                  providerState: mapSelection.providerState,
                }).code === "dispatch_manual_review_required" ? (
                  <p className="form-help">{t("booking.help.manualReview")}</p>
                ) : null}
              </div>
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
                disabled={
                  busyKey === "submit-order" ||
                  evaluateAddressSubmitGate({
                    pickup: mapSelection.pickup,
                    dropoff: mapSelection.dropoff,
                    serviceability: mapSelection.serviceability,
                    providerState: mapSelection.providerState,
                  }).blocking
                }
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
