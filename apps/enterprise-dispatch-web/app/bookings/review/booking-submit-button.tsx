"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EBtnContent, entBtnStyle } from "@/components/ent-kit";
import {
  buildEnterpriseBookingCommand,
  buildEnterpriseBookingUpdateCommand,
  resolveCopyByLocale,
  validateReservationWindow,
  type EnterpriseBookingDraftForm,
  type Locale,
} from "@/lib/enterprise-booking-draft";
import { enterpriseTenant } from "@/lib/enterprise-fixtures";
import { tenantEnterpriseTheme as theme } from "@/components/booking-form/theme";
import { getEnterpriseDispatchTenantClient } from "@/lib/api-client";
import { createIdempotencyKey } from "@drts/api-client";
import { useTranslation } from "@/lib/i18n";

export function BookingSubmitButton({
  draft,
  bookingId,
  locale = "zh",
  approvalRequired = false,
}: {
  draft: EnterpriseBookingDraftForm;
  bookingId?: string;
  locale?: Locale;
  approvalRequired?: boolean;
}) {
  const router = useRouter();
  const { t: tr } = useTranslation();
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTimeExpired, setIsTimeExpired] = useState(false);
  const [idempotencyKey] = useState(() =>
    createIdempotencyKey("enterprise-booking"),
  );

  // Live periodic check on client to detect expired reservation window while viewing review page
  useEffect(() => {
    setIsHydrated(true);

    function checkLiveValidity() {
      const check = validateReservationWindow(
        draft.reservationDate,
        draft.reservationTime,
        new Date(),
        locale,
      );
      if (!check.isValid) {
        setIsTimeExpired(true);
      } else {
        setIsTimeExpired(false);
      }
    }

    checkLiveValidity();
    const interval = setInterval(checkLiveValidity, 5000);
    return () => clearInterval(interval);
  }, [draft.reservationDate, draft.reservationTime, locale]);

  async function submitBooking() {
    if (!isHydrated || isSubmitting) {
      return;
    }

    const clickNow = new Date();
    const clickValidation = validateReservationWindow(
      draft.reservationDate,
      draft.reservationTime,
      clickNow,
      locale,
    );

    if (!clickValidation.isValid) {
      setIsTimeExpired(true);
      setError(
        clickValidation.errorMessage ??
          (clickValidation.isPast
            ? "預約時間不能為過去時間，請返回修改用車時間。"
            : "預約需至少提前 15 分鐘，請返回修改用車時間。"),
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const client = getEnterpriseDispatchTenantClient(enterpriseTenant.id);
      if (bookingId) {
        const updateCmd = buildEnterpriseBookingUpdateCommand(draft, clickNow);
        await client.updateBooking(bookingId, updateCmd);
        router.push(`/bookings/${encodeURIComponent(bookingId)}`);
        router.refresh();
        return;
      }

      const createCmd = buildEnterpriseBookingCommand(draft, clickNow);
      const result = await client.createBooking(createCmd, { idempotencyKey });

      if (!result.bookingId || !result.orderId) {
        throw new Error("Enterprise dispatch API did not return booking proof");
      }

      const params = new URLSearchParams({
        bookingId: result.bookingId,
        orderId: result.orderId,
        status: result.status,
        source: "enterprise-dispatch-web",
      });

      router.push(`/bookings/submitted?${params.toString()}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setIsSubmitting(false);
    }
  }

  const isDisabled = !isHydrated || isSubmitting || isTimeExpired;

  return (
    <div style={{ flex: 1 }}>
      <button
        type="button"
        data-testid="enterprise-booking-submit"
        data-drt-operation={
          bookingId ? "enterprise-update" : "enterprise-create"
        }
        data-ready={isHydrated ? "true" : "false"}
        disabled={isDisabled}
        onClick={submitBooking}
        style={entBtnStyle(theme, {
          variant: "primary",
          block: true,
          disabled: isDisabled,
        })}
      >
        <EBtnContent icon="check">
          {isSubmitting
            ? tr("review.submit.submitting")
            : isTimeExpired
              ? resolveCopyByLocale(
                  locale,
                  "確認送出（時間已過期）",
                  "Submit (Time Expired)",
                )
              : tr("review.submit")}
        </EBtnContent>
      </button>
      {error ? (
        <div
          aria-live="polite"
          data-testid="enterprise-booking-submit-error"
          style={{ color: theme.danger, fontSize: 12, marginTop: 8 }}
        >
          {tr("review.submit.failed")}: {error}
        </div>
      ) : null}
    </div>
  );
}
