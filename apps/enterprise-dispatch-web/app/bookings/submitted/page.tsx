import { cookies } from "next/headers";
import Link from "next/link";
import type { BookingRecord } from "@drts/contracts";
import { EnterpriseGatePage } from "../../../components/enterprise-state-page";
import {
  EBtnContent,
  ECard,
  EIcon,
  EPill,
  ERow,
  entBtnStyle,
} from "../../../components/ent-kit";
import {
  classifyEnterpriseBookingFetchError,
  getEnterpriseDispatchTenantClient,
  type EnterpriseBookingFetchErrorState,
} from "../../../lib/api-client";
import {
  ENTERPRISE_TENANT_SESSION_COOKIE,
  verifyEnterpriseTenantSession,
} from "../../../lib/enterprise-session.server";
import { enterpriseTheme as t } from "../../../lib/enterprise-theme";
import { getServerLocale } from "../../../lib/server-locale";
import { type TranslationKey, t as translate } from "../../../lib/translations";

type SubmittedSearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SubmittedBookingPage({
  searchParams,
}: {
  searchParams?: Promise<SubmittedSearchParams>;
}) {
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);

  const cookieStore = await cookies();
  const verified = await verifyEnterpriseTenantSession(
    cookieStore.get(ENTERPRISE_TENANT_SESSION_COOKIE)?.value,
  );
  if (!verified.session) {
    return (
      <EnterpriseGatePage
        kind={verified.status === 503 ? "degraded" : "auth-required"}
      />
    );
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedBookingId = firstParam(resolvedSearchParams.bookingId)?.trim();

  let booking: BookingRecord | null = null;
  let lookupErrorState: "missing-id" | EnterpriseBookingFetchErrorState | null =
    requestedBookingId ? null : "missing-id";

  if (requestedBookingId) {
    try {
      const fetched = await getEnterpriseDispatchTenantClient(
        verified.session,
      ).getBooking(requestedBookingId);
      if (
        fetched &&
        typeof fetched.bookingId === "string" &&
        fetched.bookingId.trim().length > 0 &&
        typeof fetched.orderId === "string" &&
        fetched.orderId.trim().length > 0 &&
        (!fetched.tenantId || fetched.tenantId === verified.session.tenantId)
      ) {
        booking = fetched;
      } else {
        lookupErrorState = "not-found";
      }
    } catch (error) {
      const statusCode =
        error && typeof error === "object"
          ? (error as { statusCode?: unknown }).statusCode
          : undefined;
      if (statusCode === 401) {
        return <EnterpriseGatePage kind="auth-required" />;
      }
      if (statusCode === 403 || statusCode === 404) {
        lookupErrorState = "not-found";
      } else {
        lookupErrorState = classifyEnterpriseBookingFetchError(error);
      }
    }
  }

  const hasBackendProof = Boolean(
    booking && booking.bookingId && booking.orderId,
  );
  const canonicalStatus = booking
    ? (booking.orderStatus ?? booking.status)
    : lookupErrorState === "not-found"
      ? "not_found"
      : lookupErrorState === "missing-id"
        ? "missing_booking_id"
        : (lookupErrorState ?? "unavailable");
  const canonicalSource = booking
    ? (booking.businessDispatchSubtype ?? booking.serviceBucket)
    : "backend response required";
  const passengerSummary = booking
    ? `${booking.passenger.name} · ${booking.bookedBy?.name ?? booking.passenger.name}`
    : "—";
  const contactSummary = booking
    ? (booking.onsiteContact?.phone ?? booking.passenger.phone ?? "—")
    : "—";
  const costCenterSummary = booking ? (booking.costCenter?.trim() || "—") : "—";
  const notesSummary = booking ? (booking.notes?.trim() || "—") : "—";

  const effectiveBookingId = booking?.bookingId ?? requestedBookingId;
  const refreshHref = effectiveBookingId
    ? `/bookings/submitted?${new URLSearchParams({
        bookingId: effectiveBookingId,
      }).toString()}`
    : "/bookings/submitted";

  return (
    <div style={{ maxWidth: 620, margin: "10px auto" }}>
      <ECard t={t} accent={hasBackendProof ? t.success : t.warn}>
        <div style={{ textAlign: "center", padding: "14px 8px 4px" }}>
          <div
            style={{
              width: 66,
              height: 66,
              borderRadius: 33,
              margin: "0 auto 16px",
              background: hasBackendProof ? t.successBg : t.warnBg,
              color: hasBackendProof ? t.success : t.warn,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <EIcon name={hasBackendProof ? "check" : "shield"} size={30} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>
            {hasBackendProof
              ? tr("submitted.title")
              : lookupErrorState === "not-found"
                ? tr("bookingLifecycle.detail.notFound.title")
                : tr("submitted.pending")}
          </h1>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              marginBottom: 4,
            }}
          >
            <EPill t={t} tone={hasBackendProof ? "success" : "warn"} dot>
              {hasBackendProof
                ? tr("submitted.summary.backendProof")
                : tr("submitted.subtitle")}
              <span
                style={{
                  fontFamily: t.mono,
                  fontSize: 9.5,
                  marginLeft: 4,
                  opacity: 0.7,
                }}
              >
                {canonicalStatus}
              </span>
            </EPill>
          </div>
          <p
            style={{
              fontSize: 13.5,
              color: t.muted,
              lineHeight: 1.65,
              maxWidth: 440,
              margin: "10px auto 0",
            }}
          >
            {hasBackendProof
              ? tr("submitted.banner.body")
              : tr("submitted.summary.missingBackend")}
          </p>
        </div>
        <div
          data-testid="enterprise-booking-submission-proof"
          data-submission-state={
            hasBackendProof ? "verified" : (lookupErrorState ?? "unverified")
          }
          style={{
            marginTop: 18,
            background: t.surfaceLo,
            border: "1px solid " + t.line,
            borderRadius: 12,
            padding: "14px 16px",
          }}
        >
          <ERow
            t={t}
            k={tr("submitted.summary.bookingId")}
            v={
              booking
                ? booking.bookingId
                : tr("submitted.summary.missingBackend")
            }
            mono={Boolean(booking)}
          />
          <ERow
            t={t}
            k={tr("submitted.summary.orderId")}
            v={
              booking ? booking.orderId : tr("submitted.summary.missingBackend")
            }
            mono={Boolean(booking)}
          />
          <ERow
            t={t}
            k={tr("submitted.summary.status")}
            v={canonicalStatus}
            mono
          />
          <ERow
            t={t}
            k={tr("submitted.summary.source")}
            v={canonicalSource}
            mono={Boolean(booking)}
          />
          <ERow
            t={t}
            k={tr("review.card.summary")}
            v={passengerSummary}
          />
          <ERow
            t={t}
            k={tr("review.summary.contact")}
            v={contactSummary}
            mono={Boolean(booking)}
          />
          <ERow
            t={t}
            k={tr("new.field.costCenter")}
            v={costCenterSummary}
            mono={Boolean(booking)}
          />
          <ERow
            t={t}
            k={tr("new.field.notes")}
            v={notesSummary}
          />
          <ERow
            t={t}
            k={tr("submitted.summary.estimatedResult")}
            v={
              <EPill
                t={t}
                tone={
                  !hasBackendProof
                    ? "warn"
                    : booking?.approvalState === "pending"
                      ? "warn"
                      : "success"
                }
                dot
              >
                {!hasBackendProof
                  ? tr("submitted.pending")
                  : booking?.approvalState === "pending"
                    ? `${tr("submitted.summary.backendProof")} · ${tr("submitted.pending")}`
                    : tr("submitted.summary.backendProof")}
              </EPill>
            }
            last
          />
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <Link
            href={refreshHref}
            data-testid="enterprise-submitted-refresh"
            style={entBtnStyle(t, { variant: "default", block: true })}
          >
            <EBtnContent icon="refresh">{tr("submitted.refresh")}</EBtnContent>
          </Link>
          <Link
            href={
              booking
                ? `/bookings/${encodeURIComponent(booking.bookingId)}`
                : "/bookings"
            }
            data-testid="enterprise-submitted-bookings-link"
            style={entBtnStyle(t, { variant: "primary", block: true })}
          >
            <EBtnContent iconR="arrow">{tr("submitted.bookings")}</EBtnContent>
          </Link>
        </div>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <Link
            href="/"
            style={entBtnStyle(t, { variant: "ghost", size: "sm" })}
          >
            <EBtnContent size="sm">{tr("home.cta.backHome")}</EBtnContent>
          </Link>
        </div>
      </ECard>
    </div>
  );
}
