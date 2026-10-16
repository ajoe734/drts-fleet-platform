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
const OpsUrlContext = createContext("");
export const useReviewDemo = () => useContext(ReviewContext);
export const useReviewOpsUrl = () => useContext(OpsUrlContext);

export function ReviewDemoProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const demoEntry =
    pathname === "/demo" || pathname?.startsWith("/demo/") === true;
  const [enabled, setEnabled] = useState(false);
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
    void fetch("/api/passenger-app/review-demo/config", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (active) setEnabled(body?.data?.enabled === true);
        if (active) {
          const url = body?.data?.ops_url ?? body?.data?.opsUrl;
          if (typeof url === "string" && /^https?:\/\//.test(url))
            setOpsUrl(url);
        }
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [demoEntry, localDemo]);
  const review = enabled && !localDemo && !demoEntry;
  return (
    <ReviewContext.Provider value={review}>
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
    </ReviewContext.Provider>
  );
}
