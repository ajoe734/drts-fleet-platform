"use client";
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
export const useReviewDemo = () => useContext(ReviewContext);

export function ReviewDemoProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [localDemo, setLocalDemo] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/passenger-app/review-demo/config", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (active) setEnabled(body?.data?.enabled === true);
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
      {review && (
        <aside
          aria-label="同單審查演練"
          style={{ background: "#fff3cd", padding: 12, fontSize: 13 }}
        >
          <strong>同單審查演練・真實後端資料</strong>
          <p>
            簡訊、圖資、車司資格、定位、付款與通知為模擬，不出車、不扣真款、不通知真人。下載資料非正式憑證。
          </p>
          <nav>
            <Link href="/review">演練操作</Link> · <Link href="/">預約</Link> ·{" "}
            <Link href="/rides">歷史</Link> ·{" "}
            <Link href="/account/payment-methods">演練付款方式</Link>
          </nav>
        </aside>
      )}
      {children}
    </ReviewContext.Provider>
  );
}
