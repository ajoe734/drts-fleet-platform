"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Keep a server-rendered review from retaining a submit control after expiry. */
export function ReservationExpiryGate({
  expiresAt,
  children,
  fallback,
}: {
  expiresAt: number;
  children: ReactNode;
  fallback: ReactNode;
}) {
  // Start closed so an expired server response cannot briefly enable submission.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      if (current < expiresAt) {
        timer = setTimeout(refresh, Math.min(expiresAt - current, 1000));
      }
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [expiresAt]);

  if (now === null) return null;
  return now < expiresAt ? children : fallback;
}
