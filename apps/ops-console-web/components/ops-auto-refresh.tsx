"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type OpsAutoRefreshProps = {
  intervalMs: number;
};

export function OpsAutoRefresh({ intervalMs }: OpsAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, router]);

  return null;
}
