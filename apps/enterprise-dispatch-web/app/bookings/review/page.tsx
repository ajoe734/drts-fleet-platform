import Link from "next/link";
import { BookingSubmitButton } from "@/components/booking-submit-button";
import {
  EBanner,
  EBtnContent,
  ECard,
  EIcon,
  EPill,
  ERow,
  EStepper,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntParty, EntRoute } from "@/components/ent-screen-bits";
import { EntPageHead } from "@/components/enterprise-shell";
import {
  getEarliestBookableLabel,
  getEnterpriseBookingPreview,
  getEnterprisePassengerDisplayName,
  getVehicleLabelFromDraft,
  isEnterpriseDraftComplete,
  isReservationWindowInFuture,
  parseEnterpriseBookingDraft,
  serializeEnterpriseBookingDraft,
} from "@/lib/enterprise-booking-draft";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";

type ReviewSearchParams = Record<string, string | string[] | undefined>;

function displayDraftValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "—";
}

function formatLuggageLabel(
  value: string,
  tr: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "—";
  }

  return tr("review.luggage.count", { count: trimmed });
}

export default async function ReviewBookingPage({
  searchParams,
}: {
  searchParams?: Promise<ReviewSearchParams>;
}) {
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);
  const draft = parseEnterpriseBookingDraft((await searchParams) ?? {}, locale);
  const resolvedSearchParams = (await searchParams) ?? {};
  const bookingId = Array.isArray(resolvedSearchParams.bookingId)
    ? resolvedSearchParams.bookingId[0]
    : resolvedSearchParams.bookingId;
  const preview = getEnterpriseBookingPreview(draft, locale);
  const vehicleLabel = getVehicleLabelFromDraft(draft, locale);
  const airportParts = [draft.flight.trim(), draft.terminal.trim()].filter(
    Boolean,
  );
  const airportLabel =
    airportParts.length > 0 ? airportParts.join(" · ") : undefined;
  const passengerDisplayName = getEnterprisePassengerDisplayName(draft);
  const isReservationInFuture = isReservationWindowInFuture(draft);
  const isSubmittable = isEnterpriseDraftComplete(draft);

  return (
    <>
      <EntPageHead
        back={tr("review.back")}
        title={tr("review.title")}
        sub={tr("review.subtitle")}
      />
      <div style={{ marginBottom: 20 }}>
        <EStepper
          t={t}
          steps={[
            tr("new.step.fill"),
            tr("new.step.confirm"),
            tr("new.step.submit"),
          ]}
          active={1}
        />
      </div>

      <div
        className="ent-page-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.1fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ECard
            t={t}
            accent={t.primary}
            title={tr("review.card.approval")}
            sub={tr("card.sub.costOwnershipApproval")}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                background: t.primaryBg,
                border: "1px solid " + t.primaryBd,
                borderRadius: 12,
                marginBottom: 14,
              }}
            >
              <span style={{ color: t.primary }}>
                <EIcon name="building" size={22} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {draft.costCenterLabel}
                </div>
                <div style={{ fontSize: 12, color: t.muted, marginTop: 1 }}>
                  {tr("review.approval.costNote", {
                    remain: preview.remainingBudgetLabel,
                  })}
                </div>
              </div>
              <EPill t={t} tone="success" dot>
                {tr("new.check.valid")}
              </EPill>
            </div>
            <ERow
              t={t}
              k={tr("new.check.fare")}
              v={preview.estimatedFareLabel}
              mono
            />
            <ERow
              t={t}
              k={tr("review.approval.quotaImpact")}
              v={preview.quotaImpactLabel}
            />
            <ERow
              t={t}
              k={tr("new.policy.approval")}
              v={
                <EPill
                  t={t}
                  tone={preview.approvalRequired ? "warn" : "success"}
                  dot
                >
                  {preview.approvalLabel}
                </EPill>
              }
              last
            />
            <div style={{ marginTop: 12 }}>
              <EBanner
                t={t}
                tone={preview.bannerTone}
                icon={preview.approvalRequired ? "shield" : "check"}
                title={
                  preview.approvalRequired
                    ? tr("review.banner.title")
                    : tr("new.check.title")
                }
                body={preview.bannerBody}
              />
            </div>
          </ECard>

          <ECard
            t={t}
            title={tr("review.card.summary")}
            sub={tr("card.sub.passengerVsBookedBy")}
          >
            <EntParty
              t={t}
              passenger={passengerDisplayName}
              passengerLabel={tr("party.passenger")}
              subline={
                draft.passengerMode === "self" ? (
                  <div style={{ fontSize: 12, color: t.muted, marginTop: 1 }}>
                    {tr("party.self")}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: t.warn,
                      marginTop: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <EIcon name="users" size={13} />
                    {tr("party.delegate", { name: draft.bookedBy })}
                  </div>
                )
              }
            />
            <div
              className="ent-2col-grid"
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div
                style={{
                  background: t.surfaceLo,
                  border: "1px solid " + t.line,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 11, color: t.muted, marginBottom: 3 }}>
                  {tr("review.summary.contact")}
                </div>
                <div
                  style={{ fontSize: 13, fontWeight: 600, fontFamily: t.mono }}
                >
                  {displayDraftValue(draft.onsiteContactPhone)}
                </div>
              </div>
              <div
                style={{
                  background: t.surfaceLo,
                  border: "1px solid " + t.line,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 11, color: t.muted, marginBottom: 3 }}>
                  {tr("review.summary.placard")}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {displayDraftValue(passengerDisplayName)}
                </div>
              </div>
            </div>
          </ECard>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ECard t={t} title={tr("detail.card.trip")} sub={tr("card.sub.trip")}>
            <EntRoute
              t={t}
              from={draft.pickup}
              to={draft.dropoff}
              win={preview.reservationWindowLabel}
              airportLabel={airportLabel}
            />
            <div style={{ marginTop: 16 }}>
              <ERow t={t} k={tr("new.policy.vehicle")} v={vehicleLabel} />
              <ERow
                t={t}
                k={tr("new.airport.luggage")}
                v={formatLuggageLabel(draft.luggageCount, tr)}
              />
              <ERow
                t={t}
                k={tr("new.field.notes")}
                v={displayDraftValue(draft.notes)}
                last
              />
            </div>
          </ECard>
          <ECard
            t={t}
            title={tr("new.card.policy")}
            sub={tr("card.sub.enterprisePolicy")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  gap: 9,
                  fontSize: 12.5,
                  color: t.ink2,
                  lineHeight: 1.5,
                }}
              >
                <EIcon
                  name="clock"
                  size={15}
                  style={{ color: t.muted, flexShrink: 0 }}
                />
                {tr("review.policy.cancel")}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 9,
                  fontSize: 12.5,
                  color: t.ink2,
                  lineHeight: 1.5,
                }}
              >
                <EIcon
                  name="info"
                  size={15}
                  style={{ color: t.muted, flexShrink: 0 }}
                />
                {tr("review.policy.command")}
              </div>
            </div>
          </ECard>
          {!isSubmittable ? (
            <div data-testid="enterprise-booking-blocked">
              <EBanner
                t={t}
                tone="warn"
                icon="clock"
                body={
                  isReservationInFuture
                    ? locale === "zh"
                      ? "尚有必填欄位未完成，請返回上一步修改後再送出。"
                      : "Some required fields are still incomplete. Go back and complete them before submitting."
                    : locale === "zh"
                      ? `預約時間已過去或不在有效時區內，無法送出。${getEarliestBookableLabel(locale)}，請返回修改。`
                      : `This reservation time is in the past or outside the valid window, so it cannot be submitted. ${getEarliestBookableLabel(locale)}. Go back and update it.`
                }
              />
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 12 }}>
            <Link
              href={`/bookings/new?${serializeEnterpriseBookingDraft(draft).toString()}${bookingId ? `&bookingId=${encodeURIComponent(bookingId)}` : ""}`}
              style={entBtnStyle(t, { variant: "default", block: true })}
            >
              <EBtnContent>{tr("review.back")}</EBtnContent>
            </Link>
            {isSubmittable ? (
              <BookingSubmitButton
                draft={draft}
                {...(bookingId ? { bookingId } : {})}
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
