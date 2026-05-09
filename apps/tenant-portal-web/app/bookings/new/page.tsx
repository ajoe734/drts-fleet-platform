import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  type BusinessDispatchSubtype,
  type CreateTenantBookingCommand,
  type IdentityContext,
  type ProductRuleCatalog,
  type TenantAddressRecord,
  type TenantPassengerRecord,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

const MANUAL_ENTRY = "__manual__";
const SUBTYPE_LABELS: Record<
  BusinessDispatchSubtype,
  {
    label: string;
    reservationPolicy: string;
    guidance: string;
  }
> = {
  enterprise_dispatch: {
    label: "Enterprise Dispatch",
    reservationPolicy: "Modify or cancel up to 30 minutes before the window.",
    guidance:
      "Best for internal employee or department travel with tenant-side policy tracking.",
  },
  credit_card_airport_transfer: {
    label: "Credit Card Airport Transfer",
    reservationPolicy: "Modify or cancel up to 60 minutes before the window.",
    guidance:
      "Use when airport routing, flight context, or sponsor/benefit references matter.",
  },
};

function toIsoString(localDateTime: string): string {
  if (!localDateTime) return "";
  return new Date(localDateTime).toISOString();
}

function trimFormValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDirectorySelection(value: FormDataEntryValue | null) {
  const normalized = trimFormValue(value);
  if (!normalized || normalized === MANUAL_ENTRY) {
    return undefined;
  }
  return normalized;
}

function parseOptionalInteger(value: FormDataEntryValue | null) {
  const normalized = trimFormValue(value);
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function redirectWithError(message: string) {
  redirect(`/bookings/new?error=${encodeURIComponent(message)}`);
}

function getSubtypeLabel(subtype: BusinessDispatchSubtype) {
  return SUBTYPE_LABELS[subtype]?.label ?? subtype;
}

function describePassenger(passenger: TenantPassengerRecord) {
  const details = [
    passenger.employeeNo,
    passenger.departmentName,
    passenger.mobile,
  ].filter(Boolean);

  if (!passenger.mobile) {
    details.push("phone missing");
  }

  if ((passenger.qualityIssues?.length ?? 0) > 0) {
    details.push(`issues: ${passenger.qualityIssues?.join(", ")}`);
  }

  return `${passenger.fullName}${details.length > 0 ? ` · ${details.join(" · ")}` : ""}`;
}

function describeAddress(
  address: TenantAddressRecord,
  passengerNameById: Map<string, string>,
) {
  const details: string[] = [];

  if (address.tags.length > 0) {
    details.push(address.tags.join(", "));
  }

  if (address.ownerPassengerId) {
    details.push(
      `owner ${passengerNameById.get(address.ownerPassengerId) ?? address.ownerPassengerId}`,
    );
  }

  if ((address.qualityIssues?.length ?? 0) > 0) {
    details.push(`issues: ${address.qualityIssues?.join(", ")}`);
  }

  return `${address.addressName}${details.length > 0 ? ` · ${details.join(" · ")}` : ""}`;
}

const pageStyle: React.CSSProperties = {
  display: "grid",
  gap: "20px",
};

const alertStyle: React.CSSProperties = {
  borderRadius: "16px",
  padding: "14px 16px",
  border: "1px solid rgba(180, 83, 9, 0.22)",
  background: "rgba(255, 248, 235, 0.9)",
  color: "#9a3412",
  lineHeight: 1.5,
};

const warningListStyle: React.CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: "18px",
};

const overviewGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "14px",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  marginBottom: "18px",
};

const overviewCardStyle: React.CSSProperties = {
  borderRadius: "16px",
  padding: "16px",
  background: "rgba(255, 255, 255, 0.78)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  display: "grid",
  gap: "8px",
};

const overviewLabelStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#475569",
};

const roleListStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "6px 10px",
  background: "rgba(15, 118, 110, 0.12)",
  color: "#0f766e",
  fontSize: "0.82rem",
  fontWeight: 600,
};

const subtleBadgeStyle: React.CSSProperties = {
  ...badgeStyle,
  background: "rgba(15, 23, 42, 0.06)",
  color: "#334155",
};

const formStyle: React.CSSProperties = {
  display: "grid",
  gap: "18px",
};

const sectionStyle: React.CSSProperties = {
  display: "grid",
  gap: "14px",
  padding: "18px",
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.72)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "1.05rem",
};

const sectionDescriptionStyle: React.CSSProperties = {
  margin: 0,
  color: "#475569",
  lineHeight: 1.5,
};

const inputGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "14px",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const formFieldStyle: React.CSSProperties = {
  display: "grid",
  gap: "8px",
};

const fullWidthFieldStyle: React.CSSProperties = {
  ...formFieldStyle,
  gridColumn: "1 / -1",
};

const fieldLabelStyle: React.CSSProperties = {
  fontWeight: 600,
};

const fieldHintStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: "0.9rem",
  lineHeight: 1.45,
};

const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid rgba(15, 23, 42, 0.14)",
  background: "rgba(255, 255, 255, 0.92)",
  color: "#0f172a",
  font: "inherit",
};

const checkboxStackStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "10px",
  color: "#0f172a",
  lineHeight: 1.5,
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  alignItems: "center",
};

const primaryButtonStyle: React.CSSProperties = {
  appearance: "none",
  border: "1px solid #0f766e",
  borderRadius: "999px",
  background: "#0f766e",
  color: "#fff",
  padding: "12px 18px",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

const mutedNoteStyle: React.CSSProperties = {
  margin: 0,
  color: "#475569",
  lineHeight: 1.5,
};

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const client = getTenantClient();
  const params = await searchParams;
  const formError = params.error ?? null;

  const [identityResult, passengersResult, addressesResult, catalogResult] =
    await Promise.allSettled([
      client.getIdentityContext(),
      client.listPassengers(),
      client.listAddresses(),
      client.getProductRuleCatalog(),
    ]);

  const identity =
    identityResult.status === "fulfilled"
      ? (identityResult.value as IdentityContext)
      : null;
  const passengers =
    passengersResult.status === "fulfilled" ? passengersResult.value : [];
  const addresses =
    addressesResult.status === "fulfilled" ? addressesResult.value : [];
  const productRuleCatalog =
    catalogResult.status === "fulfilled"
      ? (catalogResult.value as ProductRuleCatalog)
      : null;

  const warnings = [
    identityResult.status === "rejected"
      ? "Identity context unavailable. Submit still uses tenant bootstrap headers, but this page cannot confirm live roles/scopes."
      : null,
    passengersResult.status === "rejected"
      ? "Passenger directory unavailable. Manual passenger entry remains available."
      : null,
    addressesResult.status === "rejected"
      ? "Address book unavailable. Manual pickup and dropoff entry remains available."
      : null,
    catalogResult.status === "rejected"
      ? "Product rule catalog unavailable. Using built-in subtype labels and pricing authority defaults."
      : null,
  ].filter(Boolean) as string[];

  const activePassengers = passengers.filter(
    (passenger) => passenger.activeFlag,
  );
  const activeAddresses = addresses.filter((address) => address.activeFlag);
  const passengerNameById = new Map(
    activePassengers.map((passenger) => [
      passenger.passengerId,
      passenger.fullName,
    ]),
  );
  const subtypeOptions = productRuleCatalog?.businessDispatchSubtypes?.length
    ? productRuleCatalog.businessDispatchSubtypes
    : [...BUSINESS_DISPATCH_SUBTYPES];
  const pricingAuthority = productRuleCatalog?.pricingAuthority ?? {
    canonicalQuotedFareSource: "platform_pricing_rule",
    canonicalPricingRuleVersion: "enterprise_dispatch.default.v1",
    tenantCanSetQuotedFare: false,
  };
  const isPartnerMode =
    identity?.realm === "partner" || identity?.actorType === "partner_api_key";

  async function createBooking(formData: FormData) {
    "use server";

    const client = getTenantClient();
    const businessDispatchSubtype = trimFormValue(
      formData.get("businessDispatchSubtype"),
    ) as BusinessDispatchSubtype;
    const pickupAddressId = normalizeDirectorySelection(
      formData.get("pickupAddressId"),
    );
    const dropoffAddressId = normalizeDirectorySelection(
      formData.get("dropoffAddressId"),
    );
    const passengerId = normalizeDirectorySelection(
      formData.get("passengerId"),
    );
    const pickupAddress = trimFormValue(formData.get("pickupAddress"));
    const dropoffAddress = trimFormValue(formData.get("dropoffAddress"));
    const windowStartLocal = trimFormValue(
      formData.get("reservationWindowStart"),
    );
    const windowEndLocal = trimFormValue(formData.get("reservationWindowEnd"));
    const passengerName = trimFormValue(formData.get("passengerName"));
    const passengerPhone = trimFormValue(formData.get("passengerPhone"));
    const directionValue = trimFormValue(formData.get("direction"));
    const direction =
      directionValue === "pickup" || directionValue === "dropoff"
        ? directionValue
        : undefined;
    const costCenter = trimFormValue(formData.get("costCenter"));
    const vehiclePreference = trimFormValue(formData.get("vehiclePreference"));
    const flightNo = trimFormValue(formData.get("flightNo"));
    const terminal = trimFormValue(formData.get("terminal"));
    const onsiteContactName = trimFormValue(formData.get("onsiteContactName"));
    const onsiteContactPhone = trimFormValue(
      formData.get("onsiteContactPhone"),
    );
    const notes = trimFormValue(formData.get("notes"));
    const luggageCount = parseOptionalInteger(formData.get("luggageCount"));
    const minPhotoCount = parseOptionalInteger(formData.get("minPhotoCount"));
    const signoffRequired = formData.get("signoffRequired") !== null;
    const expenseProofRequired = formData.get("expenseProofRequired") !== null;

    const validationErrors: string[] = [];

    if (!BUSINESS_DISPATCH_SUBTYPES.includes(businessDispatchSubtype)) {
      validationErrors.push("Choose a supported booking subtype.");
    }

    if (!windowStartLocal || !windowEndLocal) {
      validationErrors.push("Reservation window start and end are required.");
    } else if (
      Number.isNaN(new Date(windowStartLocal).getTime()) ||
      Number.isNaN(new Date(windowEndLocal).getTime()) ||
      new Date(windowStartLocal).getTime() >= new Date(windowEndLocal).getTime()
    ) {
      validationErrors.push(
        "Reservation window end must be after the reservation window start.",
      );
    }

    if (!pickupAddressId && !pickupAddress) {
      validationErrors.push(
        "Select a pickup address from the address book or enter one manually.",
      );
    }

    if (!dropoffAddressId && !dropoffAddress) {
      validationErrors.push(
        "Select a dropoff address from the address book or enter one manually.",
      );
    }

    if (!passengerId && (!passengerName || !passengerPhone)) {
      validationErrors.push(
        "Select a passenger from the directory or provide manual passenger name and phone.",
      );
    }

    if (
      businessDispatchSubtype === "credit_card_airport_transfer" &&
      direction === "pickup" &&
      !flightNo
    ) {
      validationErrors.push(
        "Flight number is required for airport pickup bookings.",
      );
    }

    if (
      (onsiteContactName && !onsiteContactPhone) ||
      (!onsiteContactName && onsiteContactPhone)
    ) {
      validationErrors.push(
        "Provide both onsite contact name and phone, or leave both blank.",
      );
    }

    if (
      Number.isNaN(luggageCount) ||
      (luggageCount != null && luggageCount < 0)
    ) {
      validationErrors.push(
        "Luggage count must be a whole number of 0 or more.",
      );
    }

    if (
      Number.isNaN(minPhotoCount) ||
      (minPhotoCount != null && (minPhotoCount < 1 || minPhotoCount > 5))
    ) {
      validationErrors.push(
        "Completion photo requirement must stay between 1 and 5 photos.",
      );
    }

    if (validationErrors.length > 0) {
      redirectWithError(validationErrors.join(" "));
    }

    const command: CreateTenantBookingCommand = {
      businessDispatchSubtype,
      pickup: { address: pickupAddress || "" },
      dropoff: { address: dropoffAddress || "" },
      reservationWindowStart: toIsoString(windowStartLocal),
      reservationWindowEnd: toIsoString(windowEndLocal),
      passenger: {
        name: passengerName || "",
        phone: passengerPhone || "",
      },
      signoffRequired,
      expenseProofRequired,
      ...(passengerId ? { passengerId } : {}),
      ...(pickupAddressId ? { pickupAddressId } : {}),
      ...(dropoffAddressId ? { dropoffAddressId } : {}),
      ...(direction ? { direction } : {}),
      ...(costCenter ? { costCenter } : {}),
      ...(vehiclePreference ? { vehiclePreference } : {}),
      ...(flightNo ? { flightNo } : {}),
      ...(terminal ? { terminal } : {}),
      ...(luggageCount !== undefined ? { luggageCount } : {}),
      ...(notes ? { notes } : {}),
      ...(minPhotoCount !== undefined ? { minPhotoCount } : {}),
      ...(onsiteContactName && onsiteContactPhone
        ? {
            onsiteContact: {
              name: onsiteContactName,
              phone: onsiteContactPhone,
            },
          }
        : {}),
    };

    try {
      await client.createTenantBooking(command);
      revalidatePath("/booking-list");
      redirect("/booking-list");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown booking error";
      redirectWithError(message);
    }
  }

  return (
    <main className="app-grid" style={pageStyle}>
      <AppShellCard
        title="New Booking"
        description="Create a tenant booking against the live create-booking command, with passenger and address masters folded in where available."
      >
        {formError ? (
          <div style={alertStyle}>
            <strong>Submit blocked:</strong> {formError}
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div style={alertStyle}>
            <strong>Fallback mode:</strong>
            <ul style={warningListStyle}>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div style={overviewGridStyle}>
          <div style={overviewCardStyle}>
            <span style={overviewLabelStyle}>Authority Context</span>
            <strong>
              {identity
                ? `${identity.actorType} in ${identity.realm} scope`
                : "Bootstrap tenant scope"}
            </strong>
            <div style={roleListStyle}>
              {(identity?.roles.length ?? 0) > 0 ? (
                identity?.roles.map((role) => (
                  <span key={role} style={badgeStyle}>
                    {role}
                  </span>
                ))
              ) : (
                <span style={subtleBadgeStyle}>roles unavailable</span>
              )}
            </div>
            <p style={mutedNoteStyle}>
              {isPartnerMode
                ? "Partner mode remains create-only. Tenant-admin governance actions stay hidden and out of scope here."
                : "This page only exposes tenant-safe create fields. Status edits, dispatch overrides, and fare overrides stay server-side."}
            </p>
          </div>

          <div style={overviewCardStyle}>
            <span style={overviewLabelStyle}>Pricing Authority</span>
            <strong>{pricingAuthority.canonicalQuotedFareSource}</strong>
            <p style={mutedNoteStyle}>
              Quoted fare resolves from rule version{" "}
              <code>{pricingAuthority.canonicalPricingRuleVersion}</code>.
              Tenant submitters can create the booking, but cannot set or
              override fare values from this form.
            </p>
          </div>

          <div style={overviewCardStyle}>
            <span style={overviewLabelStyle}>Policy Framing</span>
            <strong>Cost center + proof requirements</strong>
            <p style={mutedNoteStyle}>
              Cost center persists as free text today. Sign-off and expense
              proof flags shape downstream evidence expectations, but there is
              no tenant-visible approval queue or save-draft command yet.
            </p>
          </div>
        </div>

        <form action={createBooking} style={formStyle}>
          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>Service And Schedule</h2>
              <p style={sectionDescriptionStyle}>
                Pick the booking subtype, booking direction, and reservation
                window that define the backend policy envelope for this request.
              </p>
            </div>

            <div style={inputGridStyle}>
              <div style={formFieldStyle}>
                <label
                  htmlFor="businessDispatchSubtype"
                  style={fieldLabelStyle}
                >
                  Booking subtype
                </label>
                <select
                  id="businessDispatchSubtype"
                  name="businessDispatchSubtype"
                  defaultValue="enterprise_dispatch"
                  style={fieldInputStyle}
                  required
                >
                  {subtypeOptions.map((subtype) => (
                    <option key={subtype} value={subtype}>
                      {getSubtypeLabel(subtype)}
                    </option>
                  ))}
                </select>
                <p style={fieldHintStyle}>
                  {SUBTYPE_LABELS.enterprise_dispatch.guidance}{" "}
                  {SUBTYPE_LABELS.credit_card_airport_transfer.guidance}
                </p>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="direction" style={fieldLabelStyle}>
                  Direction
                </label>
                <select
                  id="direction"
                  name="direction"
                  defaultValue="pickup"
                  style={fieldInputStyle}
                >
                  <option value="pickup">Pickup</option>
                  <option value="dropoff">Dropoff</option>
                </select>
                <p style={fieldHintStyle}>
                  Airport-transfer pickup requests must include a flight number.
                </p>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="reservationWindowStart" style={fieldLabelStyle}>
                  Window start
                </label>
                <input
                  id="reservationWindowStart"
                  name="reservationWindowStart"
                  type="datetime-local"
                  style={fieldInputStyle}
                  required
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="reservationWindowEnd" style={fieldLabelStyle}>
                  Window end
                </label>
                <input
                  id="reservationWindowEnd"
                  name="reservationWindowEnd"
                  type="datetime-local"
                  style={fieldInputStyle}
                  required
                />
              </div>
            </div>

            <div style={roleListStyle}>
              {subtypeOptions.map((subtype) => (
                <span key={subtype} style={subtleBadgeStyle}>
                  {getSubtypeLabel(subtype)}:{" "}
                  {SUBTYPE_LABELS[subtype]?.reservationPolicy ??
                    "Submit to view policy window."}
                </span>
              ))}
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>Passenger Selection</h2>
              <p style={sectionDescriptionStyle}>
                Reuse a passenger master record when possible. Manual fallback
                fields still travel with the command and can cover missing
                contact data.
              </p>
            </div>

            <div style={inputGridStyle}>
              <div style={fullWidthFieldStyle}>
                <label htmlFor="passengerId" style={fieldLabelStyle}>
                  Passenger directory entry
                </label>
                <select
                  id="passengerId"
                  name="passengerId"
                  defaultValue={MANUAL_ENTRY}
                  style={fieldInputStyle}
                >
                  <option value={MANUAL_ENTRY}>
                    Manual entry / no saved passenger
                  </option>
                  {activePassengers.map((passenger) => (
                    <option
                      key={passenger.passengerId}
                      value={passenger.passengerId}
                    >
                      {describePassenger(passenger)}
                    </option>
                  ))}
                </select>
                <p style={fieldHintStyle}>
                  {activePassengers.length} active passenger record(s)
                  available. Use{" "}
                  <Link href="/passengers">
                    <strong>/passengers</strong>
                  </Link>{" "}
                  to repair missing mobile numbers before relying on
                  directory-only submit.
                </p>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="passengerName" style={fieldLabelStyle}>
                  Manual passenger name
                </label>
                <input
                  id="passengerName"
                  name="passengerName"
                  type="text"
                  style={fieldInputStyle}
                  placeholder="Passenger full name"
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="passengerPhone" style={fieldLabelStyle}>
                  Manual or fallback phone
                </label>
                <input
                  id="passengerPhone"
                  name="passengerPhone"
                  type="tel"
                  style={fieldInputStyle}
                  placeholder="+886 9xx xxx xxx"
                />
              </div>
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>Route And Address Book</h2>
              <p style={sectionDescriptionStyle}>
                Each stop can reference the tenant address book or accept a
                fresh manual address. The backend resolves saved addresses by
                `addressId` and falls back to manual text when no directory
                entry is selected.
              </p>
            </div>

            <div style={inputGridStyle}>
              <div style={formFieldStyle}>
                <label htmlFor="pickupAddressId" style={fieldLabelStyle}>
                  Pickup address book entry
                </label>
                <select
                  id="pickupAddressId"
                  name="pickupAddressId"
                  defaultValue={MANUAL_ENTRY}
                  style={fieldInputStyle}
                >
                  <option value={MANUAL_ENTRY}>
                    Manual pickup / no saved address
                  </option>
                  {activeAddresses.map((address) => (
                    <option key={address.addressId} value={address.addressId}>
                      {describeAddress(address, passengerNameById)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="dropoffAddressId" style={fieldLabelStyle}>
                  Dropoff address book entry
                </label>
                <select
                  id="dropoffAddressId"
                  name="dropoffAddressId"
                  defaultValue={MANUAL_ENTRY}
                  style={fieldInputStyle}
                >
                  <option value={MANUAL_ENTRY}>
                    Manual dropoff / no saved address
                  </option>
                  {activeAddresses.map((address) => (
                    <option key={address.addressId} value={address.addressId}>
                      {describeAddress(address, passengerNameById)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fullWidthFieldStyle}>
                <label htmlFor="pickupAddress" style={fieldLabelStyle}>
                  Manual pickup address
                </label>
                <textarea
                  id="pickupAddress"
                  name="pickupAddress"
                  rows={3}
                  style={fieldInputStyle}
                  placeholder="Enter a pickup address when not reusing the address book."
                />
              </div>

              <div style={fullWidthFieldStyle}>
                <label htmlFor="dropoffAddress" style={fieldLabelStyle}>
                  Manual dropoff address
                </label>
                <textarea
                  id="dropoffAddress"
                  name="dropoffAddress"
                  rows={3}
                  style={fieldInputStyle}
                  placeholder="Enter a dropoff address when not reusing the address book."
                />
              </div>
            </div>

            <p style={fieldHintStyle}>
              {activeAddresses.length} active address record(s) available. Use{" "}
              <Link href="/addresses">
                <strong>/addresses</strong>
              </Link>{" "}
              to maintain owner-linked addresses, tags, and geocode hygiene.
            </p>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>Policy And Service Attributes</h2>
              <p style={sectionDescriptionStyle}>
                These fields capture fulfillment context without leaking
                authority that belongs to pricing, approvals, or dispatch
                operations.
              </p>
            </div>

            <div style={inputGridStyle}>
              <div style={formFieldStyle}>
                <label htmlFor="costCenter" style={fieldLabelStyle}>
                  Cost center
                </label>
                <input
                  id="costCenter"
                  name="costCenter"
                  type="text"
                  style={fieldInputStyle}
                  placeholder="DEPT-001 / Travel Ops"
                />
                <p style={fieldHintStyle}>
                  Recorded as free text today. No server-backed cost-center
                  catalog or quota lookup is available yet.
                </p>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="vehiclePreference" style={fieldLabelStyle}>
                  Vehicle preference
                </label>
                <input
                  id="vehiclePreference"
                  name="vehiclePreference"
                  type="text"
                  style={fieldInputStyle}
                  placeholder="Sedan, van, executive, wheelchair..."
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="flightNo" style={fieldLabelStyle}>
                  Flight number
                </label>
                <input
                  id="flightNo"
                  name="flightNo"
                  type="text"
                  style={fieldInputStyle}
                  placeholder="CI101 / BR18"
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="terminal" style={fieldLabelStyle}>
                  Terminal
                </label>
                <input
                  id="terminal"
                  name="terminal"
                  type="text"
                  style={fieldInputStyle}
                  placeholder="T1 / T2 / Arrival Hall B"
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="luggageCount" style={fieldLabelStyle}>
                  Luggage count
                </label>
                <input
                  id="luggageCount"
                  name="luggageCount"
                  type="number"
                  min={0}
                  step={1}
                  style={fieldInputStyle}
                  placeholder="0"
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="minPhotoCount" style={fieldLabelStyle}>
                  Completion photo minimum
                </label>
                <select
                  id="minPhotoCount"
                  name="minPhotoCount"
                  defaultValue="1"
                  style={fieldInputStyle}
                >
                  <option value="1">1 photo</option>
                  <option value="2">2 photos</option>
                  <option value="3">3 photos</option>
                  <option value="4">4 photos</option>
                  <option value="5">5 photos</option>
                </select>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="onsiteContactName" style={fieldLabelStyle}>
                  Onsite contact name
                </label>
                <input
                  id="onsiteContactName"
                  name="onsiteContactName"
                  type="text"
                  style={fieldInputStyle}
                  placeholder="Lobby or event contact"
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="onsiteContactPhone" style={fieldLabelStyle}>
                  Onsite contact phone
                </label>
                <input
                  id="onsiteContactPhone"
                  name="onsiteContactPhone"
                  type="tel"
                  style={fieldInputStyle}
                  placeholder="+886 9xx xxx xxx"
                />
              </div>

              <div style={fullWidthFieldStyle}>
                <label htmlFor="notes" style={fieldLabelStyle}>
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
                  style={fieldInputStyle}
                  placeholder="Arrival instructions, gate constraints, rider preferences, or other authority-safe notes."
                />
              </div>
            </div>

            <div style={checkboxStackStyle}>
              <label style={checkboxRowStyle}>
                <input type="checkbox" name="signoffRequired" />
                <span>
                  Require onsite sign-off. This increases downstream completion
                  proof requirements; it does not open a separate tenant
                  approval queue.
                </span>
              </label>
              <label style={checkboxRowStyle}>
                <input type="checkbox" name="expenseProofRequired" />
                <span>
                  Require expense proof for reimbursement or finance follow-up.
                </span>
              </label>
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>Submit Flow</h2>
              <p style={sectionDescriptionStyle}>
                Submit creates a live booking through{" "}
                <code>POST /api/tenant/bookings</code>. Save-draft is
                intentionally absent because there is no authority-safe draft
                command in the current contract.
              </p>
            </div>

            <div style={footerStyle}>
              <button type="submit" style={primaryButtonStyle}>
                Submit Booking
              </button>
              <Link className="route-link" href="/booking-list">
                <strong>Back to booking list</strong>
                Return to the tenant booking registry.
              </Link>
            </div>

            <p style={mutedNoteStyle}>
              Draft save, approval-routing selection, and cost-center catalog
              lookup remain explicit backend gaps. This form only materializes
              the create flow that is already backed by canonical tenant
              commands.
            </p>
          </section>
        </form>
      </AppShellCard>
    </main>
  );
}
