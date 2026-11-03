import { ReactNode } from "react";
import { headers } from "next/headers";
import "./globals.css";
import { DemoBanner } from "../components/demo/demo-banner";
import { ReviewDemoProvider } from "../components/review-demo/review-context";
import { PASSENGER_SUPPORT_PHONE } from "@drts/passenger-client";
import { BOOK_T } from "../lib/booking/translations";
import { PassengerMapConfigProvider } from "../components/map/map-config-context";
import {
  resolvePassengerMapConfig,
  resolvePassengerPublicOrigin,
} from "../lib/map/map-config";

export const metadata = {
  title: "智行叫車",
  description: "Passenger App",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // The Google Maps browser key leaves the server only for an allowed public
  // origin (MAP_PROVIDER_ALLOWED_ORIGINS); see lib/map/map-config.ts.
  const mapConfig = resolvePassengerMapConfig(
    process.env,
    resolvePassengerPublicOrigin(await headers()),
  );
  return (
    <html lang="zh-TW">
      <body>
        <div id="passenger-app-root">
          <PassengerMapConfigProvider config={mapConfig}>
            <ReviewDemoProvider>
              <DemoBanner />
              {children}
            </ReviewDemoProvider>
          </PassengerMapConfigProvider>
          <footer
            id="passenger-root-footer"
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
