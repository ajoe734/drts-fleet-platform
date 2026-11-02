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
import { isTrialMode, subscribeTrial } from "../../lib/trial/store";
import { passengerChrome } from "../../lib/passenger-presentation";
import { trialT } from "../trial/translations";

const ReviewContext = createContext(false);
const ReviewPendingContext = createContext(false);
const OpsUrlContext = createContext("");
const TrialContext = createContext(false);
export const useReviewDemo = () => useContext(ReviewContext);
export const useReviewDemoPending = () => useContext(ReviewPendingContext);
export const useReviewOpsUrl = () => useContext(OpsUrlContext);
/** The review backend presented as the self-serve trial (see lib/trial). */
export const useTrialMode = () => useContext(TrialContext);

const stripLink = {
  color: passengerChrome.shell,
  textDecoration: "none",
  fontWeight: 600,
} as const;

/** One quiet line above the app: the trial is a test environment, and where
 * to go next. The app's own screens stay as the plan draws them. */
function TrialStrip() {
  return (
    <aside
      aria-label={trialT.bannerLabel}
      style={{
        maxWidth: 430,
        margin: "0 auto",
        padding: "6px 14px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: 10,
        rowGap: 2,
        fontSize: 12,
        lineHeight: 1.5,
        color: passengerChrome.muted,
        fontFamily: passengerChrome.fontFamily,
      }}
    >
      <span>
        <strong style={{ color: passengerChrome.text }}>
          {trialT.bannerTitle}
        </strong>
        ：{trialT.bannerBody}
      </span>
      <nav style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
        <Link href="/" style={stripLink}>
          {trialT.bookingNav}
        </Link>
        <Link href="/rides" style={stripLink}>
          {trialT.historyNav}
        </Link>
        <Link href="/account/payment-methods" style={stripLink}>
          {trialT.paymentNav}
        </Link>
        <Link href="/trial" style={stripLink}>
          {trialT.restart}
        </Link>
      </nav>
    </aside>
  );
}

export function ReviewDemoProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const demoEntry =
    pathname === "/demo" || pathname?.startsWith("/demo/") === true;
  const trialEntry =
    pathname === "/trial" || pathname?.startsWith("/trial/") === true;
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(true);
  const [localDemo, setLocalDemo] = useState(false);
  const [trialFlag, setTrialFlag] = useState(false);
  const [opsUrl, setOpsUrl] = useState("");
  useEffect(() => {
    const update = () => setLocalDemo(isDemoMode());
    update();
    return subscribeDemo(update);
  }, []);
  useEffect(() => {
    const update = () => setTrialFlag(isTrialMode());
    update();
    return subscribeTrial(update);
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
  const trial = review && (trialFlag || trialEntry);
  return (
    <ReviewContext.Provider value={review}>
      <ReviewPendingContext.Provider
        value={pending && !localDemo && !demoEntry}
      >
        <OpsUrlContext.Provider value={opsUrl}>
          <TrialContext.Provider value={trial}>
            {trial && !trialEntry && <TrialStrip />}
            {review && !trial && (
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
          </TrialContext.Provider>
        </OpsUrlContext.Provider>
      </ReviewPendingContext.Provider>
    </ReviewContext.Provider>
  );
}
