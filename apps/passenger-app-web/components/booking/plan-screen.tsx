"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { PASSENGER_SUPPORT_PHONE } from "@drts/passenger-client";
import { P5Header, P5Phone } from "../p5-ui";
import { P5 } from "../auth/ui";
import { BOOK_T as T } from "../../lib/booking/translations";

/** Public 費用與優惠說明 (E-19a) and 計費說明 (E-05) routes. */
export const FEES_PATH = "/fees";
export const FARES_PATH = "/fares";

/** Shared spacing of the operations-plan (附錄 E) passenger screens. */
export const PLAN = {
  inset: { margin: "0 14px 12px" } satisfies CSSProperties,
  card: {
    background: P5.surface,
    border: `1px solid ${P5.line}`,
    borderRadius: 14,
    margin: "0 14px 12px",
    padding: "12px 16px",
  } satisfies CSSProperties,
  cardTitle: {
    fontSize: 13.5,
    fontWeight: 700,
    margin: "0 0 8px",
  } satisfies CSSProperties,
  muted: {
    fontSize: 12,
    lineHeight: 1.6,
    color: P5.mut,
    margin: "8px 0 0",
  } satisfies CSSProperties,
  stamp: {
    fontSize: 11.5,
    lineHeight: 1.6,
    color: P5.dim,
    margin: "0 16px 12px",
  } satisfies CSSProperties,
  link: {
    color: P5.brand,
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "none",
  } satisfies CSSProperties,
  /** A link rendered like the secondary P5 button. */
  linkButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderRadius: 12,
    border: `1px solid ${P5.line}`,
    background: P5.surface,
    color: P5.ink,
    fontSize: 14,
    fontWeight: 700,
    textDecoration: "none",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  field: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 44,
    padding: "10px 12px",
    border: `1px solid ${P5.line}`,
    borderRadius: 10,
    background: P5.surface,
    color: P5.ink,
    fontSize: 15,
    fontFamily: "inherit",
  } satisfies CSSProperties,
};

/** The plan's in-app footer. The global layout footer hides itself while an
 * element carrying data-pax-footer is on the page. */
export function PlanFooter() {
  const quiet: CSSProperties = { color: "inherit", textDecoration: "none" };
  return (
    <div
      data-pax-footer
      style={{
        marginTop: "auto",
        padding: "14px 14px 16px",
        fontSize: 11,
        lineHeight: 1.7,
        color: P5.dim,
        textAlign: "center",
        flexShrink: 0,
      }}
    >
      <div>
        <a href={`tel:${PASSENGER_SUPPORT_PHONE}`} style={quiet}>
          {T.supportPhone(PASSENGER_SUPPORT_PHONE)}
        </a>
        {" · "}
        <a href="tel:1999" style={quiet}>
          {T.authorityComplaint}
        </a>
      </div>
      <div>{T.reservationOnly}</div>
    </div>
  );
}

/** Brand link with the plan's trailing chevron outside the accessible name. */
export function PlanLink({
  href,
  children,
  newTab = false,
  style,
}: {
  href: string;
  children: string;
  newTab?: boolean;
  style?: CSSProperties;
}) {
  return (
    <a
      href={href}
      style={{ ...PLAN.link, ...style }}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
      <span aria-hidden="true"> ›</span>
    </a>
  );
}

/** Wide screens draw the phone frame (globals.css drops it at ≤480 px). */
export function useFramedDevice() {
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 481px)");
    const update = () => setFramed(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return framed;
}

/**
 * 附錄 E screen: device frame and status bar on wide screens, the 智行叫車
 * header with a large white title, scrolling content and the in-app footer.
 * `overlay` (the E-19b bottom sheet) covers the content below the header.
 */
export function PlanScreen({
  title,
  right,
  url = "ride.smarttransport.tw",
  overlay,
  children,
}: {
  title: string;
  right?: string | undefined;
  url?: string;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      className="pax-device-stage"
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "16px 0 24px",
      }}
    >
      <P5Phone url={url}>
        <P5Header status={title} order={right ?? ""} />
        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            className="pax-scroll"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              paddingTop: 14,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {children}
            <PlanFooter />
          </div>
          {overlay}
        </div>
      </P5Phone>
    </main>
  );
}
