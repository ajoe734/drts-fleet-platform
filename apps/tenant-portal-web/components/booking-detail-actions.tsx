"use client";

import { useRouter } from "next/navigation";
import type {
  BookingRecord,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

interface BookingDetailActionsProps {
  booking: BookingRecord;
}

export function BookingDetailActions({ booking }: BookingDetailActionsProps) {
  const router = useRouter();
  const isCancelable =
    booking.orderStatus !== "completed" && booking.orderStatus !== "cancelled";
  const isUpdatable =
    booking.orderStatus !== "completed" &&
    booking.orderStatus !== "cancelled" &&
    booking.orderStatus !== "on_trip";

  const handleCancel = async () => {
    const reason = prompt("Enter cancellation reason (optional):");
    if (reason === null) return;

    try {
      const client = getTenantClient();
      const command: { reason?: string } = {};
      if (reason) command.reason = reason;
      await client.cancelTenantBooking(booking.bookingId, command);
      alert("Booking cancelled successfully.");
      router.refresh();
    } catch (e) {
      alert(
        `Cancel failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  };

  const handleUpdate = async () => {
    // Simplified update flow - in production, this would be a form
    const notes = prompt(
      "Update booking notes (leave empty to keep current):",
      booking.notes || "",
    );
    if (notes === null) return;

    try {
      const client = getTenantClient();
      const updateCommand: UpdateTenantBookingCommand = {};
      if (notes) updateCommand.notes = notes;
      else updateCommand.notes = null;
      await client.updateTenantBooking(booking.bookingId, updateCommand);
      alert("Booking updated successfully.");
      router.refresh();
    } catch (e) {
      alert(
        `Update failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      {isUpdatable && (
        <button
          onClick={handleUpdate}
          style={{
            background: "none",
            border: "1px solid #007bff",
            color: "#007bff",
            padding: "0.5rem 1rem",
            cursor: "pointer",
            borderRadius: "4px",
          }}
        >
          Update
        </button>
      )}
      {isCancelable && (
        <button
          onClick={handleCancel}
          style={{
            background: "none",
            border: "1px solid #dc3545",
            color: "#dc3545",
            padding: "0.5rem 1rem",
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
