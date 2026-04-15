"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BookingRecord } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

interface BookingActionsProps {
  booking: BookingRecord;
}

export function BookingActions({ booking }: BookingActionsProps) {
  const router = useRouter();
  const isCancelable =
    booking.orderStatus !== "completed" && booking.orderStatus !== "cancelled";

  const handleCancel = async () => {
    const reason = prompt("Enter cancellation reason (optional):");
    if (reason === null) return;

    try {
      const client = getTenantClient();
      const command: { reason?: string } = {};
      if (reason) command.reason = reason;
      await client.cancelTenantBooking(booking.bookingId, command);
      router.refresh();
    } catch (e) {
      alert(
        `Cancel failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <Link href={`/booking-list/${booking.bookingId}`} className="action-link">
        View
      </Link>
      {isCancelable && (
        <button
          onClick={handleCancel}
          style={{
            background: "none",
            border: "1px solid #dc3545",
            color: "#dc3545",
            padding: "0.25rem 0.5rem",
            cursor: "pointer",
            borderRadius: "4px",
          }}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
