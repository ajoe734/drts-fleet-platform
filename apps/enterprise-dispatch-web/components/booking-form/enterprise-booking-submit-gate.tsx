"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { BookingSubmitButton } from "@/components/booking-submit-button";
import { EBanner } from "@/components/ent-kit";
import {
  isReservationWindowInFuture,
  type EnterpriseBookingDraftForm,
} from "@/lib/enterprise-booking-draft";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";

const REVALIDATE_INTERVAL_MS = 15_000;

/**
 * `review/page.tsx` only knows the reservation window is still in the future
 * as of server render time. If the visitor sits on the review page past that
 * point and then clicks submit, the client button (components/booking-submit-button.tsx,
 * outside this task's write_scopes) has no way to know the window has since
 * expired and would still call the create/update API. This wraps it with a
 * capture-phase click guard that re-evaluates the reservation window against
 * the current client clock and swaps to the blocked banner instead of letting
 * the click reach the button, plus a periodic re-check so a stale window
 * surfaces even without a click attempt.
 */
export function EnterpriseBookingSubmitGate({
  draft,
  bookingId,
  blockedLabel,
}: {
  draft: EnterpriseBookingDraftForm;
  bookingId?: string;
  blockedLabel: ReactNode;
}) {
  const [expired, setExpired] = useState(
    () => !isReservationWindowInFuture(draft),
  );

  useEffect(() => {
    if (expired) {
      return;
    }

    const interval = setInterval(() => {
      if (!isReservationWindowInFuture(draft)) {
        setExpired(true);
      }
    }, REVALIDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [draft, expired]);

  if (expired) {
    return (
      <div data-testid="enterprise-booking-blocked-at-submit" style={{ flex: 1 }}>
        <EBanner t={t} tone="warn" icon="clock" body={blockedLabel} />
      </div>
    );
  }

  return (
    <div
      style={{ flex: 1 }}
      onClickCapture={(event: MouseEvent<HTMLDivElement>) => {
        if (!isReservationWindowInFuture(draft)) {
          event.preventDefault();
          event.stopPropagation();
          setExpired(true);
        }
      }}
    >
      <BookingSubmitButton
        draft={draft}
        {...(bookingId ? { bookingId } : {})}
      />
    </div>
  );
}
