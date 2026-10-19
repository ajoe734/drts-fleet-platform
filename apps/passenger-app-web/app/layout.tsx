import { ReactNode } from "react";
import "./globals.css";
import { DemoBanner } from "../components/demo/demo-banner";
import { ReviewDemoProvider } from "../components/review-demo/review-context";
import { PASSENGER_SUPPORT_PHONE } from "@drts/passenger-client";
import { BOOK_T } from "../lib/booking/translations";

export const metadata = {
  title: "智行叫車",
  description: "Passenger App",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        <div
          id="passenger-app-root"
          style={{ width: "100%", maxWidth: "390px", margin: "0 auto" }}
        >
          <ReviewDemoProvider>
            <DemoBanner />
            {children}
          </ReviewDemoProvider>
          <footer
            aria-label={BOOK_T.supportPhone(PASSENGER_SUPPORT_PHONE)}
            style={{
              padding: "12px 16px 16px",
              fontSize: 14,
              textAlign: "center",
            }}
          >
            <a
              href={`tel:${PASSENGER_SUPPORT_PHONE}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
                color: "inherit",
              }}
            >
              {BOOK_T.supportPhone(PASSENGER_SUPPORT_PHONE)}
            </a>
          </footer>
        </div>
      </body>
    </html>
  );
}
