"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OwnedOrderRecord } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

interface BookingActionsProps {
  order: OwnedOrderRecord;
}

export function BookingActions({ order }: BookingActionsProps) {
  const router = useRouter();
  const isCancelable =
    order.status !== "completed" && order.status !== "cancelled";

  const handleCancel = async () => {
    const reason = prompt("Enter cancellation reason (optional):");
    if (reason === null) return;

    try {
      const client = getTenantClient();
      const command: { reason?: string } = {};
      if (reason) command.reason = reason;
      await client.cancelOrder(order.orderId, command);
      router.refresh();
    } catch (e) {
      alert(
        `Cancel failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <Link href={`/booking-list/${order.orderId}`} className="action-link">
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
