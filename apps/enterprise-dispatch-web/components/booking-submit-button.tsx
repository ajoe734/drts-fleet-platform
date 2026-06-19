"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EBtnContent, entBtnStyle } from "@/components/ent-kit";
import {
  enterpriseTenant,
  getEnterpriseBookingCommandFixture,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as theme } from "@/lib/enterprise-theme";
import { getEnterpriseDispatchTenantClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";

export function BookingSubmitButton() {
  const router = useRouter();
  const { t: tr } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitBooking() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await getEnterpriseDispatchTenantClient(
        enterpriseTenant.id,
      ).createBookingFromFixture(getEnterpriseBookingCommandFixture());

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

  return (
    <div style={{ flex: 1 }}>
      <button
        type="button"
        data-testid="enterprise-booking-submit"
        disabled={isSubmitting}
        onClick={submitBooking}
        style={entBtnStyle(theme, {
          variant: "primary",
          block: true,
          disabled: isSubmitting,
        })}
      >
        <EBtnContent icon="check">
          {isSubmitting ? tr("review.submit.submitting") : tr("review.submit")}
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
