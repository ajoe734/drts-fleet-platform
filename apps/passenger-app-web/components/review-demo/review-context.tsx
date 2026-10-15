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
import { isDemoMode, subscribeDemo } from "../../lib/demo/store";

const ReviewContext = createContext(false);
const OpsUrlContext = createContext("");
export const useReviewDemo = () => useContext(ReviewContext);
export const useReviewOpsUrl = () => useContext(OpsUrlContext);

export function ReviewDemoProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [localDemo, setLocalDemo] = useState(false);
  const [opsUrl, setOpsUrl] = useState("");
  useEffect(() => {
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
    const update = () => setLocalDemo(isDemoMode());
    update();
    const unsubscribe = subscribeDemo(update);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const review = enabled && !localDemo;
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
