"use client";
import { t } from "./translations";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isDemoMode, subscribeDemo } from "../../lib/demo/store";

const ReviewContext = createContext(false);
const ReviewPendingContext = createContext(false);
const OpsUrlContext = createContext("");
export const useReviewDemo = () => useContext(ReviewContext);
export const useReviewDemoPending = () => useContext(ReviewPendingContext);
export const useReviewOpsUrl = () => useContext(OpsUrlContext);

export function ReviewDemoProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const demoEntry =
    pathname === "/demo" || pathname?.startsWith("/demo/") === true;
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(true);
  const [localDemo, setLocalDemo] = useState(false);
  const [opsUrl, setOpsUrl] = useState("");
  useEffect(() => {
    const update = () => setLocalDemo(isDemoMode());
    update();
    return subscribeDemo(update);
  }, []);
  useEffect(() => {
    // The existing local demo never needs a backend, including its initial
    // entry before startDemo and reloads of a persisted local journey.
    if (demoEntry || isDemoMode()) return;
    let active = true;
    let settled = false;
    const controller = new AbortController();
    setPending(true);
    const timeout = setTimeout(() => {
      settle(null);
      controller.abort();
    }, 30_000);
    function settle(
      body: {
        data?: { enabled?: boolean; ops_url?: string; opsUrl?: string };
      } | null,
    ) {
      if (!active || settled) return;
      settled = true;
      clearTimeout(timeout);
      setEnabled(body?.data?.enabled === true);
      const url = body?.data?.ops_url ?? body?.data?.opsUrl;
      if (typeof url === "string" && /^https?:\/\//.test(url)) setOpsUrl(url);
      setPending(false);
    }
    void fetch("/api/passenger-app/review-demo/config", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then(settle)
      .catch(() => settle(null));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [demoEntry, localDemo]);
  const review = enabled && !localDemo && !demoEntry;
  return (
    <ReviewContext.Provider value={review}>
      <ReviewPendingContext.Provider
        value={pending && !localDemo && !demoEntry}
      >
        <OpsUrlContext.Provider value={opsUrl}>
          {review && (
            <aside
              aria-label={t.bannerLabel}
              style={{ background: "#fff3cd", padding: 12, fontSize: 13 }}
            >
              <strong>{t.bannerTitle}</strong>
              <p>{t.bannerSimulation}</p>
              <p>{t.leadTimeNotice}</p>
              <nav>
                <Link href="/review">{t.reviewNav}</Link> ·{" "}
                <Link href="/">{t.bookingNav}</Link> ·{" "}
                <Link href="/rides">{t.historyNav}</Link> ·{" "}
                <Link href="/account/payment-methods">{t.paymentNav}</Link>
              </nav>
            </aside>
          )}
          {children}
        </OpsUrlContext.Provider>
      </ReviewPendingContext.Provider>
    </ReviewContext.Provider>
  );
}
