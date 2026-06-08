"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type RefreshOnIntervalProps = {
  intervalMs: number;
};

export function RefreshOnInterval({ intervalMs }: RefreshOnIntervalProps) {
  const router = useRouter();

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [intervalMs, router]);

  return null;
}
