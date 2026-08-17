"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EBtnContent, entBtnStyle } from "@/components/ent-kit";
import {
  buildEnterpriseBookingCommand,
  buildEnterpriseBookingUpdateCommand,
  type EnterpriseBookingDraftForm,
} from "@/lib/enterprise-booking-draft";
import { enterpriseTenant } from "@/lib/enterprise-fixtures";
import { enterpriseTheme as theme } from "@/lib/enterprise-theme";
import { getEnterpriseDispatchTenantClient } from "@/lib/api-client";
import { createIdempotencyKey } from "@drts/api-client";
import { useTranslation } from "@/lib/i18n";

export function BookingSubmitButton({
  draft,
  bookingId,
}: {
  draft: EnterpriseBookingDraftForm;
  bookingId?: string;
}) {
  const router = useRouter();
  const { t: tr } = useTranslation();
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() =>
    createIdempotencyKey("enterprise-booking"),
  );

  async function submitBooking() {
    if (!isHydrated || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const client = getEnterpriseDispatchTenantClient(enterpriseTenant.id);
      if (bookingId) {
        await client.updateBooking(
          bookingId,
          buildEnterpriseBookingUpdateCommand(draft),
        );
        router.push(`/bookings/${encodeURIComponent(bookingId)}`);
        router.refresh();
        return;
      }

      const result = await client.createBooking(
        buildEnterpriseBookingCommand(draft),
        { idempotencyKey },
      );

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

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const isDisabled = !isHydrated || isSubmitting;

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
