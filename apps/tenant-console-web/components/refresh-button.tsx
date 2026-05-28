"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type RefreshButtonProps = {
  label?: string;
};

export function RefreshButton({ label = "Refresh" }: RefreshButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastTriggeredAt, setLastTriggeredAt] = useState<number | null>(null);

  return (
    <button
      className="action-button action-button-secondary"
      disabled={isPending}
      type="button"
      onClick={() => {
        setLastTriggeredAt(Date.now());
        startTransition(() => {
          router.refresh();
        });
      }}
    >
      {isPending ? "Refreshing..." : lastTriggeredAt ? `${label} again` : label}
    </button>
  );
}
