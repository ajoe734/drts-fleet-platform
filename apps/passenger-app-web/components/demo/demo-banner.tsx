"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  isDemoMode,
  resetDemo,
  stopDemo,
  subscribeDemo,
} from "../../lib/demo/store";
import { DEMO_T as T } from "../../lib/demo/translations";
import { P5 } from "../auth/ui";

export function DemoBanner() {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    const update = () => setDemo(isDemoMode());
    update();
    return subscribeDemo(update);
  }, []);
  if (!demo)
    return (
      <div style={{ padding: "10px 16px", textAlign: "right", fontSize: 13 }}>
        <Link href="/demo">{T.entry}</Link>
      </div>
    );
  return (
    <aside
      aria-label={T.mode}
      style={{
        background: P5.warnBg,
        color: P5.ink,
        padding: "12px 16px",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <strong>{T.mode}</strong>
      <div>{T.notice}</div>
      <div>{T.otpHint}</div>
      <nav
        aria-label={T.navigation}
        style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}
      >
        <Link href="/">{T.booking}</Link>
        <Link href="/rides">{T.history}</Link>
        <Link href="/account/payment-methods">{T.payment}</Link>
        <Link href="/account">{T.account}</Link>
        <Link href="/demo">{T.about}</Link>
      </nav>
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button
          type="button"
          onClick={() => {
            resetDemo();
            window.location.assign("/login");
          }}
        >
          {T.reset}
        </button>
        <button
          type="button"
          onClick={() => {
            stopDemo();
            window.location.assign("/login");
          }}
        >
          {T.exit}
        </button>
      </div>
    </aside>
  );
}
