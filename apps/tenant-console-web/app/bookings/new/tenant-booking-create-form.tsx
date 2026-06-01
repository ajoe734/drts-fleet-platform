"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type {
  ActionReceipt,
  BusinessDispatchSubtype,
  CrossAppResourceLink,
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  TenantAddressRecord,
  TenantApprovalEvaluationResult,
  TenantBookingQuotaImpactPreview,
  TenantCostCenterRecord,
  TenantPassengerRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import { SurfaceCard } from "@/components/page-primitives";
import { formatDateTime } from "@/lib/formatters";
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

const EMPTY_REASON_ORDER: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

const CROSS_APP_BASES: Record<CrossAppResourceLink["targetApp"], string> = {
  "ops-console": "https://ops-console.drts.local",
  "platform-admin": "https://platform-admin.drts.local",
  "tenant-console": "https://tenant-console.drts.local",
};

const CURRENCY = "TWD";

export interface BookingCreateDirectorySnapshot {
  kind: "passengers" | "addresses" | "cost_centers";
  label: string;
  href: string;
  ctaLabel: string;
  count: number;
  reason: EmptyReason | null;
  message: string;
}

export interface BookingCreatePrefill {
  passengerId: string | null;
  pickupAddressId: string | null;
  dropoffAddressId: string | null;
}

type TenantBookingCreateFormProps = {
  passengers: TenantPassengerRecord[];
  addresses: TenantAddressRecord[];
  costCenters: TenantCostCenterRecord[];
  directorySnapshots: BookingCreateDirectorySnapshot[];
  initialPrefill: BookingCreatePrefill;
  refreshMetadata: UiRefreshMetadata;
  refreshTier: RefreshTier;
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: CrossAppResourceLink[];
};

type SubmitReceiptState = {
  receipt: ActionReceipt;
  bookingId: string | null;
};

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

function getAction(
  availableActions: ResourceActionDescriptor[],
  action: string,
) {
  return availableActions.find((item) => item.action === action) ?? null;
}

function getActionLabel(action: string) {
  switch (action) {
    case "submit_booking":
      return "Submit booking";
    case "cancel_form":
      return "Cancel form";
    case "save_draft":
      return "Save as draft";
    default:
      return action;
  }
}

function getActionTone(action: ResourceActionDescriptor | null) {
  switch (action?.riskLevel) {
    case "high":
      return "is-danger";
    case "medium":
      return "is-warning";
    default:
      return "is-active";
  }
}

function getEmptyReasonMeta(reason: EmptyReason) {
  switch (reason) {
    case "not_provisioned":
      return {
        label: "Not provisioned",
        toneClassName: "is-warning",
        summary:
          "The tenant dependency exists in the model, but no live directory has been published yet.",
      };
    case "fetch_failed":
      return {
        label: "Fetch failed",
        toneClassName: "is-danger",
        summary:
          "The UI could not load the prerequisite resource and should encourage retry instead of silent fallback.",
      };
    case "permission_denied":
      return {
        label: "Permission denied",
        toneClassName: "is-danger",
        summary:
          "The actor can open the page but lacks read permission for the backing directory.",
      };
    case "external_unavailable":
      return {
        label: "External unavailable",
        toneClassName: "is-warning",
        summary:
          "The dependency exists, but the upstream source is degraded or offline.",
      };
    case "filtered_empty":
      return {
        label: "Filtered empty",
        toneClassName: "is-neutral",
        summary:
          "No eligible rows remain after current filters, inactive state, or search scope.",
      };
    case "no_data":
    default:
      return {
        label: "No data",
        toneClassName: "is-neutral",
        summary: "The resource loaded successfully and truly has no rows yet.",
      };
  }
}

function resolveCrossAppHref(link: CrossAppResourceLink) {
  return `${CROSS_APP_BASES[link.targetApp]}${link.route}`;
}

function resolveReceiptAuditHref(auditId: string) {
  return `${CROSS_APP_BASES["ops-console"]}/audit?auditId=${encodeURIComponent(auditId)}`;
}

function getRefreshLabel(refreshTier: RefreshTier) {
  return refreshTier === "manual" ? "Manual / form scoped" : refreshTier;
}

export function TenantBookingCreateForm({
  passengers,
  addresses,
  costCenters,
  directorySnapshots,
  initialPrefill,
  refreshMetadata,
  refreshTier,
  availableActions,
  crossAppLinks,
}: TenantBookingCreateFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const initialPickupAddress =
    addresses.find(
      (address) => address.addressId === initialPrefill.pickupAddressId,
    ) ??
    addresses[0] ??
    null;
  const initialDropoffAddress =
    addresses.find(
      (address) => address.addressId === initialPrefill.dropoffAddressId,
    ) ??
    addresses[1] ??
    initialPickupAddress ??
    null;

  const [businessDispatchSubtype, setBusinessDispatchSubtype] =
    useState<BusinessDispatchSubtype>("credit_card_airport_transfer");
  const [selectedPassengerId, setSelectedPassengerId] = useState(
    initialPrefill.passengerId ?? "",
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
  const [submitReceipt, setSubmitReceipt] = useState<SubmitReceiptState | null>(
    null,
  );

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
    estimatedAmountMinor,
    expenseProofRequired,
    flightNo,
    passengerName,
    passengerPhone,
    passengers,
    policyPreviewReady,
    reservationWindowEnd,
    reservationWindowStart,
    selectedPassengerId,
    signoffRequired,
    vehiclePreference,
  ]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitReceipt(null);

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
        receipt?: ActionReceipt;
      };

      if (!response.ok) {
        throw new Error(
          result.error ?? `Create booking failed (HTTP ${response.status}).`,
        );
      }

      if (result.receipt?.status === "accepted") {
        setSubmitReceipt({
          receipt: result.receipt,
          bookingId: result.booking?.bookingId ?? null,
        });
        return;
      }

      if (!result.booking?.bookingId) {
        throw new Error("Backend did not return a booking identifier.");
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
  const submitAction = getAction(availableActions, "submit_booking");
  const cancelAction = getAction(availableActions, "cancel_form");
  const saveDraftAction = getAction(availableActions, "save_draft");
  const prefillChips = [
    initialPrefill.passengerId ? "Passenger prefill" : null,
    initialPrefill.pickupAddressId ? "Pickup prefill" : null,
    initialPrefill.dropoffAddressId ? "Drop-off prefill" : null,
  ].filter((value): value is string => value !== null);
  const emptyDirectories = directorySnapshots.filter(
    (snapshot) => snapshot.reason !== null,
  );
  const submitDisabled =
    !submitAction?.enabled ||
    submitting ||
    pending ||
    policyRefreshing ||
    approvalEvaluation?.outcome?.blocked === true ||
    missingRequiredFields;

  return (
    <form className="booking-command-shell" onSubmit={handleSubmit}>
      <section className="booking-command-hero">
        <div className="booking-command-heading">
          <span className="eyebrow">Bookings / Create</span>
          <h1>Booking command workspace</h1>
          <p>
            Build the tenant booking command from directory-backed passenger and
            address context, preview approval impact, then submit the
            synchronous command defined in Q-TEN04.
          </p>
        </div>

        <div className="booking-command-topline">
          <div className="booking-command-stat">
            <span>Refresh tier</span>
            <strong>{getRefreshLabel(refreshTier)}</strong>
            <small>{formatDateTime(refreshMetadata.generatedAt)}</small>
          </div>
          <div className="booking-command-stat">
            <span>Directory coverage</span>
            <strong>
              {directorySnapshots.length - emptyDirectories.length}/
              {directorySnapshots.length} ready
            </strong>
            <small>{refreshMetadata.dataFreshness}</small>
          </div>
          <div className="booking-command-stat">
            <span>Submit path</span>
            <strong>POST /api/tenant/bookings/commands/create</strong>
            <small>accepted+pending aware</small>
          </div>
        </div>

        <div className="booking-sitemap-strip">
          <Link className="booking-sitemap-link" href="/">
            Workspace
          </Link>
          <Link className="booking-sitemap-link" href="/bookings">
            Booking list
          </Link>
          <Link
            className="booking-sitemap-link is-current"
            href="/bookings/new"
          >
            Create booking
          </Link>
          <Link className="booking-sitemap-link" href="/passengers">
            Passengers
          </Link>
          <Link className="booking-sitemap-link" href="/addresses">
            Addresses
          </Link>
          <Link className="booking-sitemap-link" href="/rules">
            Rules
          </Link>
        </div>

        <div className="chip-row">
          <span className="status-chip is-active">Role-aware CTAs</span>
          <span className="status-chip">{refreshMetadata.source}</span>
          {prefillChips.map((chip) => (
            <span className="status-chip" key={chip}>
              {chip}
            </span>
          ))}
        </div>
      </section>

      <div className="booking-command-grid">
        <section className="booking-command-main">
          <SurfaceCard
            kicker="Step 1"
            title="Trip blueprint"
            description="Choose the service bucket, time window, and passenger context. Passenger and address shortcuts come from canonical tenant directories rather than local-only drafts."
          >
            <div className="booking-form-grid">
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
                <span>Passenger directory</span>
                <select
                  onChange={(event) =>
                    setSelectedPassengerId(event.target.value)
                  }
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
                  Row shortcuts from `/passengers` land here with prefill.
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
                    ? "Locked to the selected directory record."
                    : "Use manual entry only when no directory passenger fits."}
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
                      ? "Directory mobile is authoritative."
                      : "This directory row has no phone; add one here."
                    : "Manual passenger entry requires a direct contact phone."}
                </span>
              </label>
            </div>
          </SurfaceCard>

          <SurfaceCard
            kicker="Step 2"
            title="Route context"
            description="Address-book rows can prefill the payload, but final route text and coordinates stay editable so the booking page does not invent a separate map workflow."
          >
            <div className="booking-form-grid">
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
                <span>Pickup latitude</span>
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
                <span>Pickup longitude</span>
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
                <span>Drop-off latitude</span>
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
                <span>Drop-off longitude</span>
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
            kicker="Step 3"
            title="Governance and contact details"
            description="Keep cost-center, spend, approval-sensitive fields, and onsite metadata inside the canonical create command instead of branching into tenant-local side flows."
          >
            <div className="booking-form-grid">
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
                    setDirection(
                      event.target.value as "" | "pickup" | "dropoff",
                    )
                  }
                  value={direction}
                >
                  <option value="">Not set</option>
                  <option value="pickup">Pickup</option>
                  <option value="dropoff">Dropoff</option>
                </select>
              </label>

              <label className="field-stack">
                <span>Flight number</span>
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
                  onChange={(event) =>
                    setOnsiteContactPhone(event.target.value)
                  }
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

        <aside className="booking-command-side">
          <SurfaceCard
            kicker="Prerequisites"
            title="Directory readiness"
            description="Passenger, address, and cost-center sources stay visible while composing the command so operators can see whether prefill and policy context are trustworthy."
          >
            <div className="booking-directory-stack">
              {directorySnapshots.map((snapshot) => {
                const emptyMeta = snapshot.reason
                  ? getEmptyReasonMeta(snapshot.reason)
                  : null;
                return (
                  <section
                    className={`booking-directory-card${snapshot.reason ? " is-empty" : ""}`}
                    key={snapshot.kind}
                  >
                    <div className="booking-directory-head">
                      <div>
                        <strong>{snapshot.label}</strong>
                        <p>{snapshot.message}</p>
                      </div>
                      <span
                        className={`status-chip${emptyMeta ? ` ${emptyMeta.toneClassName}` : " is-active"}`}
                      >
                        {snapshot.reason
                          ? emptyMeta?.label
                          : `${snapshot.count} ready`}
                      </span>
                    </div>
                    <div className="booking-directory-actions">
                      <Link className="text-link" href={snapshot.href}>
                        {snapshot.ctaLabel}
                      </Link>
                    </div>
                  </section>
                );
              })}
            </div>
          </SurfaceCard>

          <SurfaceCard
            kicker="Preview"
            title="Approval and quota posture"
            description="The sidebar reflects the backend policy preview directly. Approval-required outcomes remain submittable; blocked outcomes disable the command until the draft changes."
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
                <dt>Preview refresh</dt>
                <dd>{policyRefreshing ? "Updating..." : "Auto"}</dd>
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

            {quotaPreview?.impacts?.length ? (
              <div className="detail-stack">
                <strong>Quota impact</strong>
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
                      {describeImpactLabel(impact.scope, impact.costCenterCode)}{" "}
                      · {impact.dimension} · before{" "}
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
                Fill the core booking fields to unlock quota impact feedback.
              </p>
            )}
          </SurfaceCard>

          <SurfaceCard
            kicker="Deep Links"
            title="Related surfaces"
            description="Use in-app prerequisites for fast correction, and open cross-app operational detail in a new tab when command or delivery ownership lives elsewhere."
          >
            <div className="booking-link-stack">
              <Link className="text-link" href="/passengers">
                Passenger directory
              </Link>
              <Link className="text-link" href="/addresses">
                Address book
              </Link>
              <Link className="text-link" href="/rules">
                Approval rules
              </Link>
              {crossAppLinks.map((link) => (
                <a
                  className="text-link"
                  href={resolveCrossAppHref(link)}
                  key={`${link.targetApp}-${link.route}`}
                  rel="noreferrer"
                  target={link.openMode === "new_tab" ? "_blank" : undefined}
                >
                  {link.label} ({link.targetApp})
                </a>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard
            kicker="EmptyReason"
            title="Six empty-state variants"
            description="The route keeps the shared empty-state contract visible so operators can distinguish missing data, provisioning gaps, permission issues, and upstream outages."
          >
            <div className="booking-empty-reason-grid">
              {EMPTY_REASON_ORDER.map((reason) => {
                const meta = getEmptyReasonMeta(reason);
                return (
                  <article className="booking-empty-reason-card" key={reason}>
                    <span className={`status-chip ${meta.toneClassName}`}>
                      {meta.label}
                    </span>
                    <p>{meta.summary}</p>
                  </article>
                );
              })}
            </div>
          </SurfaceCard>

          <SurfaceCard
            kicker="Submit"
            title="Create the booking"
            description="Primary and secondary CTAs come from `availableActions`. Disabled actions stay visible with their reason instead of disappearing."
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

            {submitReceipt ? (
              <div className="booking-receipt-panel" role="status">
                <strong>Command accepted and pending</strong>
                <p>{submitReceipt.receipt.message}</p>
                <div className="chip-row">
                  <span className="status-chip is-warning">
                    {submitReceipt.receipt.status}
                  </span>
                  <span className="status-chip">
                    Audit {submitReceipt.receipt.auditId}
                  </span>
                </div>
                <div className="booking-link-stack">
                  {submitReceipt.bookingId ? (
                    <Link
                      className="text-link"
                      href={`/bookings/${submitReceipt.bookingId}`}
                    >
                      Open pending booking
                    </Link>
                  ) : null}
                  <a
                    className="text-link"
                    href={resolveReceiptAuditHref(
                      submitReceipt.receipt.auditId,
                    )}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open ops audit
                  </a>
                  <Link className="text-link" href="/bookings">
                    Return to booking list
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="chip-row">
              <span
                className={`status-chip ${decision === "block" ? "is-danger" : decision === "require_approval" ? "is-warning" : "is-active"}`}
              >
                {describeDecision(approvalEvaluation)}
              </span>
              {costCenter ? (
                <span className="status-chip">{costCenter}</span>
              ) : null}
              {saveDraftAction ? (
                <span
                  className={`status-chip ${getActionTone(saveDraftAction)}`}
                >
                  {saveDraftAction.disabledReasonCode ?? "draft action"}
                </span>
              ) : null}
            </div>

            <div className="booking-action-row">
              <button
                className="booking-button booking-button-secondary"
                disabled={!cancelAction?.enabled || submitting || pending}
                onClick={() => router.push("/bookings")}
                type="button"
              >
                {getActionLabel(cancelAction?.action ?? "cancel_form")}
              </button>
              <button
                className="booking-button booking-button-tertiary"
                disabled
                title={saveDraftAction?.disabledReasonCode ?? undefined}
                type="button"
              >
                {getActionLabel(saveDraftAction?.action ?? "save_draft")}
              </button>
              <button
                className="booking-button"
                disabled={submitDisabled}
                title={submitAction?.disabledReasonCode ?? undefined}
                type="submit"
              >
                {submitting || pending
                  ? "Submitting..."
                  : decision === "require_approval"
                    ? "Submit for approval"
                    : getActionLabel(submitAction?.action ?? "submit_booking")}
              </button>
            </div>
          </SurfaceCard>
        </aside>
      </div>
    </form>
  );
}
