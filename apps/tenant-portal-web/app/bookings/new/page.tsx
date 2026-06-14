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
import { getTenantRoleSnapshot, requireCapability } from "@/lib/rbac";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";

const MANUAL_ENTRY = "__manual__";
const SUBTYPE_KEYS: BusinessDispatchSubtype[] = [
  "enterprise_dispatch",
  "credit_card_airport_transfer",
  "insurance_replacement_vehicle",
  "travel_agency_transfer",
];

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

function getSubtypeLabel(subtype: BusinessDispatchSubtype, locale: Locale) {
  if (SUBTYPE_KEYS.includes(subtype)) {
    return t(`bookingNew.subtype.${subtype}.label`, locale);
  }
  return subtype;
}

function getSubtypeReservationPolicy(
  subtype: BusinessDispatchSubtype,
  locale: Locale,
) {
  if (SUBTYPE_KEYS.includes(subtype)) {
    return t(`bookingNew.subtype.${subtype}.reservationPolicy`, locale);
  }
  return t("bookingNew.subtype.policyFallback", locale);
}

function describePassenger(passenger: TenantPassengerRecord, locale: Locale) {
  const details = [
    passenger.employeeNo,
    passenger.departmentName,
    passenger.mobile,
  ].filter(Boolean);

  if (!passenger.mobile) {
    details.push(t("bookingNew.passenger.phoneMissing", locale));
  }

  if ((passenger.qualityIssues?.length ?? 0) > 0) {
    details.push(
      t("bookingNew.passenger.issues", locale, {
        issues: passenger.qualityIssues?.join(", ") ?? "",
      }),
    );
  }

  return `${passenger.fullName}${details.length > 0 ? ` · ${details.join(" · ")}` : ""}`;
}

function describeAddress(
  address: TenantAddressRecord,
  passengerNameById: Map<string, string>,
  locale: Locale,
) {
  const details: string[] = [];

  if (address.tags.length > 0) {
    details.push(address.tags.join(", "));
  }

  if (address.ownerPassengerId) {
    details.push(
      t("bookingNew.address.owner", locale, {
        owner:
          passengerNameById.get(address.ownerPassengerId) ??
          address.ownerPassengerId,
      }),
    );
  }

  if ((address.qualityIssues?.length ?? 0) > 0) {
    details.push(
      t("bookingNew.address.issues", locale, {
        issues: address.qualityIssues?.join(", ") ?? "",
      }),
    );
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
  const locale = await getServerLocale();
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();
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
      ? t("bookingNew.warning.identity", locale)
      : null,
    passengersResult.status === "rejected"
      ? t("bookingNew.warning.passengers", locale)
      : null,
    addressesResult.status === "rejected"
      ? t("bookingNew.warning.addresses", locale)
      : null,
    catalogResult.status === "rejected"
      ? t("bookingNew.warning.catalog", locale)
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

    const actionLocale = await getServerLocale();
    const actionRoleSnapshot = await getTenantRoleSnapshot();
    requireCapability(
      actionRoleSnapshot.capabilities.canWriteTenant,
      t("bookingNew.action.writeAuthorityRequired", actionLocale),
    );
    const client = await getTenantClient();
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
      validationErrors.push(
        t("bookingNew.validation.subtype", actionLocale),
      );
    }

    if (!windowStartLocal || !windowEndLocal) {
      validationErrors.push(
        t("bookingNew.validation.windowRequired", actionLocale),
      );
    } else if (
      Number.isNaN(new Date(windowStartLocal).getTime()) ||
      Number.isNaN(new Date(windowEndLocal).getTime()) ||
      new Date(windowStartLocal).getTime() >= new Date(windowEndLocal).getTime()
    ) {
      validationErrors.push(
        t("bookingNew.validation.windowOrder", actionLocale),
      );
    }

    if (!pickupAddressId && !pickupAddress) {
      validationErrors.push(
        t("bookingNew.validation.pickupRequired", actionLocale),
      );
    }

    if (!dropoffAddressId && !dropoffAddress) {
      validationErrors.push(
        t("bookingNew.validation.dropoffRequired", actionLocale),
      );
    }

    if (!passengerId && (!passengerName || !passengerPhone)) {
      validationErrors.push(
        t("bookingNew.validation.passengerRequired", actionLocale),
      );
    }

    if (
      businessDispatchSubtype === "credit_card_airport_transfer" &&
      direction === "pickup" &&
      !flightNo
    ) {
      validationErrors.push(
        t("bookingNew.validation.flightRequired", actionLocale),
      );
    }

    if (
      (onsiteContactName && !onsiteContactPhone) ||
      (!onsiteContactName && onsiteContactPhone)
    ) {
      validationErrors.push(
        t("bookingNew.validation.onsiteContact", actionLocale),
      );
    }

    if (
      Number.isNaN(luggageCount) ||
      (luggageCount != null && luggageCount < 0)
    ) {
      validationErrors.push(
        t("bookingNew.validation.luggageCount", actionLocale),
      );
    }

    if (
      Number.isNaN(minPhotoCount) ||
      (minPhotoCount != null && (minPhotoCount < 1 || minPhotoCount > 5))
    ) {
      validationErrors.push(
        t("bookingNew.validation.photoCount", actionLocale),
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
        error instanceof Error
          ? error.message
          : t("bookingNew.error.unknown", actionLocale);
      redirectWithError(message);
    }
  }

  return (
    <main className="app-grid" style={pageStyle}>
      <AppShellCard
        title={t("bookingNew.card.title", locale)}
        description={t("bookingNew.card.description", locale)}
      >
        {formError ? (
          <div style={alertStyle}>
            <strong>{t("bookingNew.alert.submitBlocked", locale)}</strong>{" "}
            {formError}
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div style={alertStyle}>
            <strong>{t("bookingNew.alert.fallbackMode", locale)}</strong>
            <ul style={warningListStyle}>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {!roleSnapshot.capabilities.canWriteTenant ? (
          <div style={alertStyle}>
            <strong>{t("bookingNew.alert.readOnly.label", locale)}</strong>{" "}
            {t("bookingNew.alert.readOnly.body", locale)}
          </div>
        ) : null}

        <div style={overviewGridStyle}>
          <div style={overviewCardStyle}>
            <span style={overviewLabelStyle}>
              {t("bookingNew.overview.authority.label", locale)}
            </span>
            <strong>
              {identity
                ? t("bookingNew.overview.authority.value", locale, {
                    actorType: identity.actorType,
                    realm: identity.realm,
                  })
                : t("bookingNew.overview.authority.bootstrap", locale)}
            </strong>
            <div style={roleListStyle}>
              {(identity?.roles.length ?? 0) > 0 ? (
                identity?.roles.map((role) => (
                  <span key={role} style={badgeStyle}>
                    {role}
                  </span>
                ))
              ) : (
                <span style={subtleBadgeStyle}>
                  {t("bookingNew.overview.authority.rolesUnavailable", locale)}
                </span>
              )}
            </div>
            <p style={mutedNoteStyle}>
              {isPartnerMode
                ? t("bookingNew.overview.authority.partnerNote", locale)
                : t("bookingNew.overview.authority.tenantNote", locale)}
            </p>
          </div>

          <div style={overviewCardStyle}>
            <span style={overviewLabelStyle}>
              {t("bookingNew.overview.pricing.label", locale)}
            </span>
            <strong>{pricingAuthority.canonicalQuotedFareSource}</strong>
            <p style={mutedNoteStyle}>
              {t("bookingNew.overview.pricing.notePrefix", locale)}{" "}
              <code>{pricingAuthority.canonicalPricingRuleVersion}</code>
              {t("bookingNew.overview.pricing.noteSuffix", locale)}
            </p>
          </div>

          <div style={overviewCardStyle}>
            <span style={overviewLabelStyle}>
              {t("bookingNew.overview.policy.label", locale)}
            </span>
            <strong>{t("bookingNew.overview.policy.value", locale)}</strong>
            <p style={mutedNoteStyle}>
              {t("bookingNew.overview.policy.note", locale)}
            </p>
          </div>
        </div>

        <form action={createBooking} style={formStyle}>
          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>
                {t("bookingNew.section.schedule.title", locale)}
              </h2>
              <p style={sectionDescriptionStyle}>
                {t("bookingNew.section.schedule.description", locale)}
              </p>
            </div>

            <div style={inputGridStyle}>
              <div style={formFieldStyle}>
                <label
                  htmlFor="businessDispatchSubtype"
                  style={fieldLabelStyle}
                >
                  {t("bookingNew.field.subtype.label", locale)}
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
                      {getSubtypeLabel(subtype, locale)}
                    </option>
                  ))}
                </select>
                <p style={fieldHintStyle}>
                  {t("bookingNew.subtype.enterprise_dispatch.guidance", locale)}{" "}
                  {t(
                    "bookingNew.subtype.credit_card_airport_transfer.guidance",
                    locale,
                  )}
                </p>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="direction" style={fieldLabelStyle}>
                  {t("bookingNew.field.direction.label", locale)}
                </label>
                <select
                  id="direction"
                  name="direction"
                  defaultValue="pickup"
                  style={fieldInputStyle}
                >
                  <option value="pickup">
                    {t("bookingNew.direction.pickup", locale)}
                  </option>
                  <option value="dropoff">
                    {t("bookingNew.direction.dropoff", locale)}
                  </option>
                </select>
                <p style={fieldHintStyle}>
                  {t("bookingNew.field.direction.hint", locale)}
                </p>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="reservationWindowStart" style={fieldLabelStyle}>
                  {t("bookingNew.field.windowStart.label", locale)}
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
                  {t("bookingNew.field.windowEnd.label", locale)}
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
                  {getSubtypeLabel(subtype, locale)}:{" "}
                  {getSubtypeReservationPolicy(subtype, locale)}
                </span>
              ))}
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>
                {t("bookingNew.section.passenger.title", locale)}
              </h2>
              <p style={sectionDescriptionStyle}>
                {t("bookingNew.section.passenger.description", locale)}
              </p>
            </div>

            <div style={inputGridStyle}>
              <div style={fullWidthFieldStyle}>
                <label htmlFor="passengerId" style={fieldLabelStyle}>
                  {t("bookingNew.field.passengerId.label", locale)}
                </label>
                <select
                  id="passengerId"
                  name="passengerId"
                  defaultValue={MANUAL_ENTRY}
                  style={fieldInputStyle}
                >
                  <option value={MANUAL_ENTRY}>
                    {t("bookingNew.field.passengerId.manualOption", locale)}
                  </option>
                  {activePassengers.map((passenger) => (
                    <option
                      key={passenger.passengerId}
                      value={passenger.passengerId}
                    >
                      {describePassenger(passenger, locale)}
                    </option>
                  ))}
                </select>
                <p style={fieldHintStyle}>
                  {t("bookingNew.field.passengerId.hintPrefix", locale, {
                    count: activePassengers.length,
                  })}{" "}
                  <Link href="/passengers">
                    <strong>/passengers</strong>
                  </Link>{" "}
                  {t("bookingNew.field.passengerId.hintSuffix", locale)}
                </p>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="passengerName" style={fieldLabelStyle}>
                  {t("bookingNew.field.passengerName.label", locale)}
                </label>
                <input
                  id="passengerName"
                  name="passengerName"
                  type="text"
                  style={fieldInputStyle}
                  placeholder={t(
                    "bookingNew.field.passengerName.placeholder",
                    locale,
                  )}
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="passengerPhone" style={fieldLabelStyle}>
                  {t("bookingNew.field.passengerPhone.label", locale)}
                </label>
                <input
                  id="passengerPhone"
                  name="passengerPhone"
                  type="tel"
                  style={fieldInputStyle}
                  placeholder={t(
                    "bookingNew.field.passengerPhone.placeholder",
                    locale,
                  )}
                />
              </div>
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>
                {t("bookingNew.section.route.title", locale)}
              </h2>
              <p style={sectionDescriptionStyle}>
                {t("bookingNew.section.route.description", locale)}
              </p>
            </div>

            <div style={inputGridStyle}>
              <div style={formFieldStyle}>
                <label htmlFor="pickupAddressId" style={fieldLabelStyle}>
                  {t("bookingNew.field.pickupAddressId.label", locale)}
                </label>
                <select
                  id="pickupAddressId"
                  name="pickupAddressId"
                  defaultValue={MANUAL_ENTRY}
                  style={fieldInputStyle}
                >
                  <option value={MANUAL_ENTRY}>
                    {t("bookingNew.field.pickupAddressId.manualOption", locale)}
                  </option>
                  {activeAddresses.map((address) => (
                    <option key={address.addressId} value={address.addressId}>
                      {describeAddress(address, passengerNameById, locale)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="dropoffAddressId" style={fieldLabelStyle}>
                  {t("bookingNew.field.dropoffAddressId.label", locale)}
                </label>
                <select
                  id="dropoffAddressId"
                  name="dropoffAddressId"
                  defaultValue={MANUAL_ENTRY}
                  style={fieldInputStyle}
                >
                  <option value={MANUAL_ENTRY}>
                    {t("bookingNew.field.dropoffAddressId.manualOption", locale)}
                  </option>
                  {activeAddresses.map((address) => (
                    <option key={address.addressId} value={address.addressId}>
                      {describeAddress(address, passengerNameById, locale)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fullWidthFieldStyle}>
                <label htmlFor="pickupAddress" style={fieldLabelStyle}>
                  {t("bookingNew.field.pickupAddress.label", locale)}
                </label>
                <textarea
                  id="pickupAddress"
                  name="pickupAddress"
                  rows={3}
                  style={fieldInputStyle}
                  placeholder={t(
                    "bookingNew.field.pickupAddress.placeholder",
                    locale,
                  )}
                />
              </div>

              <div style={fullWidthFieldStyle}>
                <label htmlFor="dropoffAddress" style={fieldLabelStyle}>
                  {t("bookingNew.field.dropoffAddress.label", locale)}
                </label>
                <textarea
                  id="dropoffAddress"
                  name="dropoffAddress"
                  rows={3}
                  style={fieldInputStyle}
                  placeholder={t(
                    "bookingNew.field.dropoffAddress.placeholder",
                    locale,
                  )}
                />
              </div>
            </div>

            <p style={fieldHintStyle}>
              {t("bookingNew.field.addressBook.hintPrefix", locale, {
                count: activeAddresses.length,
              })}{" "}
              <Link href="/addresses">
                <strong>/addresses</strong>
              </Link>{" "}
              {t("bookingNew.field.addressBook.hintSuffix", locale)}
            </p>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>
                {t("bookingNew.section.policy.title", locale)}
              </h2>
              <p style={sectionDescriptionStyle}>
                {t("bookingNew.section.policy.description", locale)}
              </p>
            </div>

            <div style={inputGridStyle}>
              <div style={formFieldStyle}>
                <label htmlFor="costCenter" style={fieldLabelStyle}>
                  {t("bookingNew.field.costCenter.label", locale)}
                </label>
                <input
                  id="costCenter"
                  name="costCenter"
                  type="text"
                  style={fieldInputStyle}
                  placeholder={t(
                    "bookingNew.field.costCenter.placeholder",
                    locale,
                  )}
                />
                <p style={fieldHintStyle}>
                  {t("bookingNew.field.costCenter.hint", locale)}
                </p>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="vehiclePreference" style={fieldLabelStyle}>
                  {t("bookingNew.field.vehiclePreference.label", locale)}
                </label>
                <input
                  id="vehiclePreference"
                  name="vehiclePreference"
                  type="text"
                  style={fieldInputStyle}
                  placeholder={t(
                    "bookingNew.field.vehiclePreference.placeholder",
                    locale,
                  )}
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="flightNo" style={fieldLabelStyle}>
                  {t("bookingNew.field.flightNo.label", locale)}
                </label>
                <input
                  id="flightNo"
                  name="flightNo"
                  type="text"
                  style={fieldInputStyle}
                  placeholder={t("bookingNew.field.flightNo.placeholder", locale)}
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="terminal" style={fieldLabelStyle}>
                  {t("bookingNew.field.terminal.label", locale)}
                </label>
                <input
                  id="terminal"
                  name="terminal"
                  type="text"
                  style={fieldInputStyle}
                  placeholder={t("bookingNew.field.terminal.placeholder", locale)}
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="luggageCount" style={fieldLabelStyle}>
                  {t("bookingNew.field.luggageCount.label", locale)}
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
                  {t("bookingNew.field.minPhotoCount.label", locale)}
                </label>
                <select
                  id="minPhotoCount"
                  name="minPhotoCount"
                  defaultValue="1"
                  style={fieldInputStyle}
                >
                  <option value="1">
                    {t("bookingNew.field.minPhotoCount.option", locale, {
                      count: 1,
                    })}
                  </option>
                  <option value="2">
                    {t("bookingNew.field.minPhotoCount.option", locale, {
                      count: 2,
                    })}
                  </option>
                  <option value="3">
                    {t("bookingNew.field.minPhotoCount.option", locale, {
                      count: 3,
                    })}
                  </option>
                  <option value="4">
                    {t("bookingNew.field.minPhotoCount.option", locale, {
                      count: 4,
                    })}
                  </option>
                  <option value="5">
                    {t("bookingNew.field.minPhotoCount.option", locale, {
                      count: 5,
                    })}
                  </option>
                </select>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="onsiteContactName" style={fieldLabelStyle}>
                  {t("bookingNew.field.onsiteContactName.label", locale)}
                </label>
                <input
                  id="onsiteContactName"
                  name="onsiteContactName"
                  type="text"
                  style={fieldInputStyle}
                  placeholder={t(
                    "bookingNew.field.onsiteContactName.placeholder",
                    locale,
                  )}
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="onsiteContactPhone" style={fieldLabelStyle}>
                  {t("bookingNew.field.onsiteContactPhone.label", locale)}
                </label>
                <input
                  id="onsiteContactPhone"
                  name="onsiteContactPhone"
                  type="tel"
                  style={fieldInputStyle}
                  placeholder={t(
                    "bookingNew.field.onsiteContactPhone.placeholder",
                    locale,
                  )}
                />
              </div>

              <div style={fullWidthFieldStyle}>
                <label htmlFor="notes" style={fieldLabelStyle}>
                  {t("bookingNew.field.notes.label", locale)}
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
                  style={fieldInputStyle}
                  placeholder={t("bookingNew.field.notes.placeholder", locale)}
                />
              </div>
            </div>

            <div style={checkboxStackStyle}>
              <label style={checkboxRowStyle}>
                <input type="checkbox" name="signoffRequired" />
                <span>{t("bookingNew.field.signoffRequired.label", locale)}</span>
              </label>
              <label style={checkboxRowStyle}>
                <input type="checkbox" name="expenseProofRequired" />
                <span>
                  {t("bookingNew.field.expenseProofRequired.label", locale)}
                </span>
              </label>
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>
                {t("bookingNew.section.submit.title", locale)}
              </h2>
              <p style={sectionDescriptionStyle}>
                {t("bookingNew.section.submit.descriptionPrefix", locale)}{" "}
                <code>POST /api/tenant/bookings</code>
                {t("bookingNew.section.submit.descriptionSuffix", locale)}
              </p>
            </div>

            <div style={footerStyle}>
              <button
                type="submit"
                style={primaryButtonStyle}
                disabled={!roleSnapshot.capabilities.canWriteTenant}
              >
                {t("bookingNew.submit.button", locale)}
              </button>
              <Link className="route-link" href="/booking-list">
                <strong>{t("bookingNew.submit.backLink.title", locale)}</strong>
                {t("bookingNew.submit.backLink.subtitle", locale)}
              </Link>
            </div>

            <p style={mutedNoteStyle}>
              {t("bookingNew.submit.note", locale)}
            </p>
          </section>
        </form>
      </AppShellCard>
    </main>
  );
}
