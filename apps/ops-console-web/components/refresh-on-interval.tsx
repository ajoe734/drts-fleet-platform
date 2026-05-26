"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

type RefreshOnIntervalProps = {
  intervalMs: number;
};

export function RefreshOnInterval({ intervalMs }: RefreshOnIntervalProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

    const refresh = () => {
      startTransition(() => {
        router.refresh();
      });
    };

    const schedule = () => {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }

      timeoutId = globalThis.setTimeout(() => {
        if (document.visibilityState === "visible") {
          refresh();
        }
        schedule();
      }, intervalMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    schedule();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs, router, startTransition]);

  return null;
}
