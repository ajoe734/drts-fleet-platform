"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type {
  BusinessDispatchSubtype,
  TenantAddressRecord,
  TenantApprovalEvaluationResult,
  TenantBookingQuotaImpactPreview,
  TenantCostCenterRecord,
  TenantPassengerRecord,
} from "@drts/contracts";
import { SurfaceCard } from "@/components/page-primitives";
import {
  buildTenantBookingCreateCommand,
  getDefaultDateTimeLocalValue,
  getBlockingTenantBookingDraftErrors,
  isMissingRequiredBookingFields,
  isReadyForTenantBookingPolicyPreview,
  parseAmountMajor,
  type TenantBookingDraftValues,
} from "./tenant-booking-create-form-utils";

const BUSINESS_SUBTYPE_OPTIONS: Array<{
  value: BusinessDispatchSubtype;
  label: string;
}> = [
  {
    value: "credit_card_airport_transfer",
    label: "Credit-card airport transfer",
  },
  { value: "enterprise_dispatch", label: "Enterprise dispatch" },
];

const CURRENCY = "TWD";

function formatCurrency(amountMinor: number | null | undefined) {
  if (amountMinor == null || Number.isNaN(amountMinor)) {
    return "Not provided";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }

  return `${value}%`;
}

function describeSubtype(value: BusinessDispatchSubtype) {
  return BUSINESS_SUBTYPE_OPTIONS.find((option) => option.value === value)
    ?.label;
}

function describeDirection(value: "" | "pickup" | "dropoff") {
  switch (value) {
    case "pickup":
      return "Pickup";
    case "dropoff":
      return "Dropoff";
    default:
      return "Not set";
  }
}

function describeDecision(result: TenantApprovalEvaluationResult | null) {
  const decision = result?.outcome?.decision ?? "allow";
  switch (decision) {
    case "require_approval":
      return "Approval required";
    case "block":
      return "Blocked";
    case "warn":
      return "Warning";
    case "manual_review":
      return "Manual review";
    default:
      return "Allowed";
  }
}

function describeImpactLabel(
  scope: "tenant" | "cost_center",
  code: string | null,
) {
  if (scope === "cost_center") {
    return code ? `Cost center ${code}` : "Cost center";
  }
  return "Tenant";
}

export function TenantBookingCreateForm({
  passengers,
  addresses,
  costCenters,
  initialSelectedPassengerId = "",
}: {
  passengers: TenantPassengerRecord[];
  addresses: TenantAddressRecord[];
  costCenters: TenantCostCenterRecord[];
  initialSelectedPassengerId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const initialPickupAddress = addresses[0] ?? null;
  const initialDropoffAddress = addresses[1] ?? addresses[0] ?? null;

  const [businessDispatchSubtype, setBusinessDispatchSubtype] =
    useState<BusinessDispatchSubtype>("credit_card_airport_transfer");
  const [selectedPassengerId, setSelectedPassengerId] = useState(
    initialSelectedPassengerId,
  );
  const [pickupAddressId, setPickupAddressId] = useState(
    initialPickupAddress?.addressId ?? "",
  );
  const [dropoffAddressId, setDropoffAddressId] = useState(
    initialDropoffAddress?.addressId ?? "",
  );
  const [pickupAddress, setPickupAddress] = useState(
    initialPickupAddress?.addressText ?? "",
  );
  const [pickupLat, setPickupLat] = useState(
    initialPickupAddress?.lat == null ? "" : String(initialPickupAddress.lat),
  );
  const [pickupLng, setPickupLng] = useState(
    initialPickupAddress?.lng == null ? "" : String(initialPickupAddress.lng),
  );
  const [dropoffAddress, setDropoffAddress] = useState(
    initialDropoffAddress?.addressText ?? "",
  );
  const [dropoffLat, setDropoffLat] = useState(
    initialDropoffAddress?.lat == null ? "" : String(initialDropoffAddress.lat),
  );
  const [dropoffLng, setDropoffLng] = useState(
    initialDropoffAddress?.lng == null ? "" : String(initialDropoffAddress.lng),
  );
  const [reservationWindowStart, setReservationWindowStart] = useState("");
  const [reservationWindowEnd, setReservationWindowEnd] = useState("");
  const [passengerName, setPassengerName] = useState("");
  const [passengerPhone, setPassengerPhone] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [benefitReference, setBenefitReference] = useState("");
  const [vehiclePreference, setVehiclePreference] = useState("");
  const [direction, setDirection] = useState<"" | "pickup" | "dropoff">("");
  const [flightNo, setFlightNo] = useState("");
  const [terminal, setTerminal] = useState("");
  const [luggageCount, setLuggageCount] = useState("");
  const [notes, setNotes] = useState("");
  const [bookedByName, setBookedByName] = useState("");
  const [bookedByEmail, setBookedByEmail] = useState("");
  const [onsiteContactName, setOnsiteContactName] = useState("");
  const [onsiteContactPhone, setOnsiteContactPhone] = useState("");
  const [quotedFare, setQuotedFare] = useState("");
  const [signoffRequired, setSignoffRequired] = useState(false);
  const [expenseProofRequired, setExpenseProofRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [policyRefreshing, setPolicyRefreshing] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quotaPreview, setQuotaPreview] =
    useState<TenantBookingQuotaImpactPreview | null>(null);
  const [approvalEvaluation, setApprovalEvaluation] =
    useState<TenantApprovalEvaluationResult | null>(null);
  const estimatedAmountMinor = parseAmountMajor(quotedFare);
  const draft: TenantBookingDraftValues = {
    businessDispatchSubtype,
    selectedPassengerId,
    pickupAddressId,
    dropoffAddressId,
    pickupAddress,
    pickupLat,
    pickupLng,
    dropoffAddress,
    dropoffLat,
    dropoffLng,
    reservationWindowStart,
    reservationWindowEnd,
    passengerName,
    passengerPhone,
    costCenter,
    benefitReference,
    vehiclePreference,
    direction,
    flightNo,
    terminal,
    luggageCount,
    notes,
    bookedByName,
    bookedByEmail,
    onsiteContactName,
    onsiteContactPhone,
    estimatedAmount: quotedFare,
    signoffRequired,
    expenseProofRequired,
  };
  const draftValidationErrors = getBlockingTenantBookingDraftErrors(draft);
  const missingRequiredFields = isMissingRequiredBookingFields(
    draft,
    costCenters.length > 0,
  );
  const policyPreviewReady = isReadyForTenantBookingPolicyPreview(draft);

  useEffect(() => {
    setReservationWindowStart(
      (value) => value || getDefaultDateTimeLocalValue(30),
    );
    setReservationWindowEnd(
      (value) => value || getDefaultDateTimeLocalValue(60),
    );
  }, []);

  useEffect(() => {
    const passenger = passengers.find(
      (row) => row.passengerId === selectedPassengerId,
    );
    if (!passenger) {
      return;
    }

    setPassengerName(passenger.fullName);
    setPassengerPhone(passenger.mobile ?? "");
  }, [passengers, selectedPassengerId]);

  useEffect(() => {
    const pickup = addresses.find((row) => row.addressId === pickupAddressId);
    if (!pickup) {
      return;
    }

    setPickupAddress(pickup.addressText);
    setPickupLat(pickup.lat == null ? "" : String(pickup.lat));
    setPickupLng(pickup.lng == null ? "" : String(pickup.lng));
  }, [addresses, pickupAddressId]);

  useEffect(() => {
    const dropoff = addresses.find((row) => row.addressId === dropoffAddressId);
    if (!dropoff) {
      return;
    }

    setDropoffAddress(dropoff.addressText);
    setDropoffLat(dropoff.lat == null ? "" : String(dropoff.lat));
    setDropoffLng(dropoff.lng == null ? "" : String(dropoff.lng));
  }, [addresses, dropoffAddressId]);

  useEffect(() => {
    if (!policyPreviewReady) {
      setQuotaPreview(null);
      setApprovalEvaluation(null);
      setPolicyError(null);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setPolicyRefreshing(true);
      setPolicyError(null);
      try {
        const response = await fetch("/api/bookings/policy-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessDispatchSubtype,
            selectedPassengerId: selectedPassengerId || null,
            passengerName,
            passengerPhone,
            passengerRole:
              passengers.find((row) => row.passengerId === selectedPassengerId)
                ?.roles?.[0] ?? null,
            reservationWindowStart: new Date(
              reservationWindowStart,
            ).toISOString(),
            reservationWindowEnd: new Date(reservationWindowEnd).toISOString(),
            costCenter: costCenter.trim() || null,
            estimatedAmountMinor,
            vehiclePreference: vehiclePreference.trim() || null,
            direction: direction || null,
            flightNo: flightNo.trim() || null,
            signoffRequired,
            expenseProofRequired,
          }),
        });
        const result = (await response.json()) as {
          error?: string;
          quotaPreview?: TenantBookingQuotaImpactPreview;
          approvalEvaluation?: TenantApprovalEvaluationResult;
        };

        if (!response.ok) {
          throw new Error(
            result.error ?? `Policy preview failed (HTTP ${response.status}).`,
          );
        }

        setQuotaPreview(result.quotaPreview ?? null);
        setApprovalEvaluation(result.approvalEvaluation ?? null);
      } catch (error) {
        setPolicyError(
          error instanceof Error
            ? error.message
            : "Unknown policy preview failure.",
        );
      } finally {
        setPolicyRefreshing(false);
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [
    businessDispatchSubtype,
    costCenter,
    direction,
    dropoffAddress,
    estimatedAmountMinor,
    expenseProofRequired,
    flightNo,
    passengerName,
    passengerPhone,
    passengers,
    policyPreviewReady,
    pickupAddress,
    reservationWindowEnd,
    reservationWindowStart,
    selectedPassengerId,
    signoffRequired,
    vehiclePreference,
  ]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (draftValidationErrors.length > 0) {
      setSubmitError(draftValidationErrors[0] ?? "Booking draft is invalid.");
      return;
    }

    if (approvalEvaluation?.outcome?.blocked) {
      setSubmitError(
        "This booking is currently blocked by tenant approval or quota policy.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const command = buildTenantBookingCreateCommand({
        draft,
        passengers,
      });

      const response = await fetch("/api/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const result = (await response.json()) as {
        error?: string;
        booking?: { bookingId: string };
      };

      if (!response.ok || !result.booking?.bookingId) {
        throw new Error(
          result.error ?? `Create booking failed (HTTP ${response.status}).`,
        );
      }

      startTransition(() => {
        router.push(`/bookings/${result.booking!.bookingId}`);
        router.refresh();
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unknown booking failure.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const activePassenger = passengers.find(
    (row) => row.passengerId === selectedPassengerId,
  );
  const passengerPhoneLocked =
    !!activePassenger && !!activePassenger.mobile?.trim();
  const decision = approvalEvaluation?.outcome?.decision ?? "allow";
  const submitDisabled =
    submitting ||
    pending ||
    policyRefreshing ||
    approvalEvaluation?.outcome?.blocked === true ||
    missingRequiredFields;

  return (
    <form className="booking-create-layout" onSubmit={handleSubmit}>
      <section className="booking-create-main">
        <SurfaceCard
          kicker="Trip"
          title="Route and service"
          description="Choose the service bucket, timing, passenger, and address context that the tenant booking command already supports."
        >
          <div className="form-grid">
            <label className="field-stack">
              <span>Service subtype</span>
              <select
                onChange={(event) =>
                  setBusinessDispatchSubtype(
                    event.target.value as BusinessDispatchSubtype,
                  )
                }
                value={businessDispatchSubtype}
              >
                {BUSINESS_SUBTYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-stack">
              <span>Passenger</span>
              <select
                onChange={(event) => setSelectedPassengerId(event.target.value)}
                value={selectedPassengerId}
              >
                <option value="">Manual passenger entry</option>
                {passengers.map((passenger) => (
                  <option
                    key={passenger.passengerId}
                    value={passenger.passengerId}
                  >
                    {passenger.fullName}
                    {passenger.employeeNo ? ` · ${passenger.employeeNo}` : ""}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Select a directory passenger for booking-on-behalf, or stay on
                manual entry.
              </span>
            </label>

            <label className="field-stack">
              <span>Reservation start</span>
              <input
                onChange={(event) =>
                  setReservationWindowStart(event.target.value)
                }
                required
                type="datetime-local"
                value={reservationWindowStart}
              />
            </label>

            <label className="field-stack">
              <span>Reservation end</span>
              <input
                onChange={(event) =>
                  setReservationWindowEnd(event.target.value)
                }
                required
                type="datetime-local"
                value={reservationWindowEnd}
              />
            </label>

            <label className="field-stack">
              <span>Passenger name</span>
              <input
                disabled={!!activePassenger}
                onChange={(event) => setPassengerName(event.target.value)}
                required
                type="text"
                value={passengerName}
              />
              <span className="field-hint">
                {activePassenger
                  ? "Passenger name stays locked to the selected directory record."
                  : "Switch to a directory passenger if this booking is on behalf of someone else."}
              </span>
            </label>

            <label className="field-stack">
              <span>Passenger phone</span>
              <input
                disabled={passengerPhoneLocked}
                onChange={(event) => setPassengerPhone(event.target.value)}
                required
                type="tel"
                value={passengerPhone}
              />
              <span className="field-hint">
                {activePassenger
                  ? passengerPhoneLocked
                    ? "Passenger phone comes from the selected directory record."
                    : "This directory passenger has no published phone number; provide one here."
                  : "Manual passenger entry requires a direct contact phone."}
              </span>
            </label>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Pickup and drop"
          title="Address-book assisted routing"
          description="Saved addresses fill the command payload, but the final address text and coordinates remain editable so the page does not invent a separate geocoding workflow."
        >
          <div className="form-grid">
            <label className="field-stack">
              <span>Saved pickup</span>
              <select
                onChange={(event) => setPickupAddressId(event.target.value)}
                value={pickupAddressId}
              >
                <option value="">Manual pickup</option>
                {addresses.map((address) => (
                  <option key={address.addressId} value={address.addressId}>
                    {address.addressName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-stack">
              <span>Saved drop-off</span>
              <select
                onChange={(event) => setDropoffAddressId(event.target.value)}
                value={dropoffAddressId}
              >
                <option value="">Manual drop-off</option>
                {addresses.map((address) => (
                  <option key={address.addressId} value={address.addressId}>
                    {address.addressName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-stack booking-field-span">
              <span>Pickup address</span>
              <input
                onChange={(event) => {
                  setPickupAddressId("");
                  setPickupAddress(event.target.value);
                }}
                required
                type="text"
                value={pickupAddress}
              />
            </label>
            <label className="field-stack booking-field-span">
              <span>Drop-off address</span>
              <input
                onChange={(event) => {
                  setDropoffAddressId("");
                  setDropoffAddress(event.target.value);
                }}
                required
                type="text"
                value={dropoffAddress}
              />
            </label>
            <label className="field-stack">
              <span>Pickup lat</span>
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setPickupAddressId("");
                  setPickupLat(event.target.value);
                }}
                type="text"
                value={pickupLat}
              />
            </label>
            <label className="field-stack">
              <span>Pickup lng</span>
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setPickupAddressId("");
                  setPickupLng(event.target.value);
                }}
                type="text"
                value={pickupLng}
              />
            </label>
            <label className="field-stack">
              <span>Drop-off lat</span>
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setDropoffAddressId("");
                  setDropoffLat(event.target.value);
                }}
                type="text"
                value={dropoffLat}
              />
            </label>
            <label className="field-stack">
              <span>Drop-off lng</span>
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setDropoffAddressId("");
                  setDropoffLng(event.target.value);
                }}
                type="text"
                value={dropoffLng}
              />
            </label>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Governance"
          title="Cost center, finance, and submit metadata"
          description="This section stays inside the current booking command: canonical cost center, optional finance references, proof requirements, and contact metadata."
        >
          <div className="form-grid">
            {costCenters.length > 0 ? (
              <label className="field-stack">
                <span>Cost center</span>
                <select
                  onChange={(event) => setCostCenter(event.target.value)}
                  required
                  value={costCenter}
                >
                  <option value="">Select a cost center</option>
                  {costCenters.map((center) => (
                    <option key={center.code} value={center.code}>
                      {center.code} · {center.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field-stack">
                <span>Cost center</span>
                <input
                  onChange={(event) => setCostCenter(event.target.value)}
                  placeholder="Legacy free-text cost center"
                  type="text"
                  value={costCenter}
                />
                <span className="field-hint">
                  No active directory rows are published for this tenant.
                </span>
              </label>
            )}

            <label className="field-stack">
              <span>Estimated spend ({CURRENCY})</span>
              <input
                inputMode="decimal"
                onChange={(event) => setQuotedFare(event.target.value)}
                placeholder="1580"
                type="text"
                value={quotedFare}
              />
            </label>

            <label className="field-stack">
              <span>Benefit reference</span>
              <input
                onChange={(event) => setBenefitReference(event.target.value)}
                type="text"
                value={benefitReference}
              />
            </label>

            <label className="field-stack">
              <span>Vehicle preference</span>
              <input
                onChange={(event) => setVehiclePreference(event.target.value)}
                type="text"
                value={vehiclePreference}
              />
            </label>

            <label className="field-stack">
              <span>Direction</span>
              <select
                onChange={(event) =>
                  setDirection(event.target.value as "" | "pickup" | "dropoff")
                }
                value={direction}
              >
                <option value="">Not set</option>
                <option value="pickup">Pickup</option>
                <option value="dropoff">Dropoff</option>
              </select>
            </label>

            <label className="field-stack">
              <span>Flight no.</span>
              <input
                onChange={(event) => setFlightNo(event.target.value)}
                type="text"
                value={flightNo}
              />
            </label>

            <label className="field-stack">
              <span>Terminal</span>
              <input
                onChange={(event) => setTerminal(event.target.value)}
                type="text"
                value={terminal}
              />
            </label>

            <label className="field-stack">
              <span>Luggage count</span>
              <input
                inputMode="numeric"
                onChange={(event) => setLuggageCount(event.target.value)}
                type="text"
                value={luggageCount}
              />
            </label>

            <label className="field-stack booking-field-span">
              <span>Notes</span>
              <textarea
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                value={notes}
              />
            </label>

            <label className="field-stack">
              <span>Booked by name</span>
              <input
                onChange={(event) => setBookedByName(event.target.value)}
                type="text"
                value={bookedByName}
              />
            </label>

            <label className="field-stack">
              <span>Booked by email</span>
              <input
                onChange={(event) => setBookedByEmail(event.target.value)}
                type="email"
                value={bookedByEmail}
              />
            </label>

            <label className="field-stack">
              <span>Onsite contact</span>
              <input
                onChange={(event) => setOnsiteContactName(event.target.value)}
                type="text"
                value={onsiteContactName}
              />
            </label>

            <label className="field-stack">
              <span>Onsite phone</span>
              <input
                onChange={(event) => setOnsiteContactPhone(event.target.value)}
                type="tel"
                value={onsiteContactPhone}
              />
            </label>
          </div>

          <div className="chip-row">
            <label className="status-chip booking-toggle">
              <input
                checked={signoffRequired}
                onChange={(event) => setSignoffRequired(event.target.checked)}
                type="checkbox"
              />
              Signoff required
            </label>
            <label className="status-chip booking-toggle">
              <input
                checked={expenseProofRequired}
                onChange={(event) =>
                  setExpenseProofRequired(event.target.checked)
                }
                type="checkbox"
              />
              Expense proof required
            </label>
          </div>
        </SurfaceCard>
      </section>

      <aside className="booking-create-side">
        <SurfaceCard
          kicker="Readiness"
          title="Policy evaluation"
          description="Quota preview and approval evaluation are recomputed from the current draft after required booking fields are present."
        >
          <dl className="definition-grid">
            <div>
              <dt>Decision</dt>
              <dd>{describeDecision(approvalEvaluation)}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{describeSubtype(businessDispatchSubtype)}</dd>
            </div>
            <div>
              <dt>Direction</dt>
              <dd>{describeDirection(direction)}</dd>
            </div>
            <div>
              <dt>Estimated spend</dt>
              <dd>{formatCurrency(estimatedAmountMinor)}</dd>
            </div>
            <div>
              <dt>Passenger role</dt>
              <dd>{activePassenger?.roles?.[0] ?? "Not published"}</dd>
            </div>
            <div>
              <dt>Refresh</dt>
              <dd>{policyRefreshing ? "Updating…" : "Auto"}</dd>
            </div>
          </dl>

          {policyError ? (
            <div className="form-error" role="alert">
              {policyError}
            </div>
          ) : null}

          {approvalEvaluation?.approvalPlan ? (
            <div className="detail-stack">
              <strong>Approval plan</strong>
              <div className="chip-row">
                <span className="status-chip">
                  Mode: {approvalEvaluation.approvalPlan.approvalMode}
                </span>
                <span className="status-chip">
                  Timeout: {approvalEvaluation.approvalPlan.timeoutHours}h
                </span>
                <span className="status-chip">
                  Fallback: {approvalEvaluation.approvalPlan.fallbackPolicy}
                </span>
              </div>
              <ul className="panel-list">
                {approvalEvaluation.approvalPlan.approvers.map((approver) => (
                  <li
                    key={`${approver.kind}-${approver.userId ?? approver.roleCode ?? approver.costCenterCode ?? "unknown"}`}
                  >
                    {approver.displayName ??
                      approver.userId ??
                      approver.roleCode ??
                      approver.costCenterCode ??
                      approver.kind}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {(approvalEvaluation?.warnings?.length ?? 0) > 0 ? (
            <div className="detail-stack">
              <strong>Warnings</strong>
              <ul className="panel-list">
                {(approvalEvaluation?.warnings ?? []).map((warning) => (
                  <li key={`${warning.source}-${warning.code}`}>
                    {warning.message} ({warning.code})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SurfaceCard>

        <SurfaceCard
          kicker="Quota"
          title="Impact snapshot"
          description="The sidebar shows the backend preview response directly instead of inventing a separate forecast model."
        >
          {quotaPreview?.impacts?.length ? (
            <div className="detail-stack">
              <div className="chip-row">
                <span className="status-chip">
                  Period: {quotaPreview.periodKey}
                </span>
                <span className="status-chip">
                  Trigger: {quotaPreview.combinedTriggered}
                </span>
              </div>
              <ul className="panel-list">
                {quotaPreview.impacts.map((impact) => (
                  <li
                    key={`${impact.scope}-${impact.costCenterCode ?? "tenant"}-${impact.dimension}`}
                  >
                    {describeImpactLabel(impact.scope, impact.costCenterCode)} ·{" "}
                    {impact.dimension} · before{" "}
                    {impact.remainingBefore ?? "n/a"} /{" "}
                    {impact.limitValue ?? "n/a"} · after{" "}
                    {impact.remainingAfter ?? "n/a"} · remaining{" "}
                    {formatPercent(impact.remainingPercentAfter)} ·{" "}
                    {impact.triggered}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="muted-copy">
              Fill the core booking fields to get quota impact feedback.
            </p>
          )}
        </SurfaceCard>

        <SurfaceCard
          kicker="Submit"
          title="Create the booking"
          description="Submit is allowed for normal and approval-required outcomes, but blocked outcomes stay disabled until the draft changes."
        >
          {submitError ? (
            <div className="form-error" role="alert">
              {submitError}
            </div>
          ) : draftValidationErrors.length > 0 ? (
            <div className="form-error" role="alert">
              {draftValidationErrors[0]}
            </div>
          ) : null}

          <div className="chip-row">
            <span
              className={
                decision === "block"
                  ? "status-chip is-warning"
                  : "status-chip is-active"
              }
            >
              {describeDecision(approvalEvaluation)}
            </span>
            {costCenter ? (
              <span className="status-chip">{costCenter}</span>
            ) : null}
          </div>

          <div className="booking-action-row">
            <button
              className="booking-button booking-button-secondary"
              disabled
              type="button"
            >
              No draft action
            </button>
            <button
              className="booking-button"
              disabled={submitDisabled}
              type="submit"
            >
              {submitting || pending
                ? "Submitting…"
                : decision === "require_approval"
                  ? "Submit for approval"
                  : "Create booking"}
            </button>
          </div>
        </SurfaceCard>
      </aside>
    </form>
  );
}
