"use client";

import type { OwnedOrderStatus } from "@drts/contracts";
import { useRouter } from "next/navigation";

interface BookingFilterBarProps {
  availableStatuses: OwnedOrderStatus[];
  currentStatus: OwnedOrderStatus | undefined;
}

export function BookingFilterBar({
  availableStatuses,
  currentStatus,
}: BookingFilterBarProps) {
  const router = useRouter();

  return (
    <div className="filter-bar" style={{ marginBottom: "1rem" }}>
      <label htmlFor="status-filter" style={{ marginRight: "0.5rem" }}>
        Filter by status:
      </label>
      <select
        id="status-filter"
        value={currentStatus || ""}
        onChange={(e) => {
          const val = e.target.value;
          router.push(val ? `/booking-list?status=${val}` : "/booking-list");
        }}
        style={{ padding: "0.25rem 0.5rem" }}
      >
        <option value="">All Statuses</option>
        {availableStatuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </div>
  );
}
