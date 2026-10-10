"use client";

import React, { useEffect, useState } from "react";
import { PassengerClient } from "@drts/passenger-client";
import {
  P5Phone,
  P5Header,
  P5Card,
  P5Notice,
  P5,
} from "../../components/p5-ui";
import type { FaresResponse } from "@drts/contracts";
import { bookingTranslations as t } from "../../lib/booking/translations";

// P5_A03: 公開費率頁
export default function FaresPage() {
  const [fares, setFares] = useState<FaresResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only need PassengerClient to fetch public fares. No auth needed.
    const client = new PassengerClient({ baseUrl: "" });
    client
      .getFares()
      .then((res: FaresResponse) => {
        setFares(res);
      })
      .catch((err: any) => {
        setError(err.message || "Failed to load fares.");
      });
  }, []);

  const R = (k: string, v: string) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid " + P5.lineSoft,
        fontSize: 12.5,
      }}
    >
      <span style={{ color: P5.mut }}>{k}</span>
      <b style={{ fontFamily: P5.mono }}>{v}</b>
    </div>
  );

  return (
    <P5Phone url="ride.smarttransport.tw/fares">
      <P5Header status={t.fares.headerTitle} order={t.fares.headerOrder} />
      {fares ? (
        <P5Card
          title={t.fares.cardTitle}
          tag={
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: P5.ok,
                background: P5.okBg,
                border: "1px solid " + P5.okBd,
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              {t.fares.activeTag}
            </span>
          }
        >
          <div style={{ fontSize: 11, color: P5.mut, marginBottom: 6 }}>
            {t.fares.versionInfoPrefix}{fares.currentVersion.version}{t.fares.versionInfoDate}
            {fares.currentVersion.effectiveAt
              .substring(0, 10)
              .replace(/-/g, "/")}{" "}
            {t.fares.versionInfoSuffix}
          </div>
          {R(
            `${t.fares.baseDistanceLabel}${fares.currentVersion.baseDistanceMeters / 1000}${t.fares.baseDistanceSuffix}`,
            `NT$ ${fares.currentVersion.baseFare}`,
          )}
          {R(
            `${t.fares.distanceRateLabel}${fares.currentVersion.distanceIncrementMeters}${t.fares.distanceRateSuffix}`,
            `NT$ ${fares.currentVersion.distanceRate}`,
          )}
          {R(
            `${t.fares.delayRateLabel}${fares.currentVersion.delayIncrementSeconds}${t.fares.delayRateSuffix}`,
            `NT$ ${fares.currentVersion.delayRate}`,
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 0",
              fontSize: 12.5,
            }}
          >
            <span style={{ color: P5.mut }}>
              {t.fares.nightSurchargeLabel}{fares.currentVersion.nightSurchargeWindowStart}
              {t.fares.nightSurchargeMiddle}
              {fares.currentVersion.nightSurchargeWindowEnd}{t.fares.nightSurchargeSuffix}
            </span>
            <b style={{ fontFamily: P5.mono }}>
              +{fares.currentVersion.nightSurcharge}
            </b>
          </div>
        </P5Card>
      ) : error ? (
        <P5Card title={t.fares.loadingFailed}>
          <div style={{ fontSize: 12, color: P5.danger }}>{error}</div>
        </P5Card>
      ) : (
        <P5Card title={t.fares.loading}>
          <div style={{ fontSize: 12, color: P5.mut }}>Loading...</div>
        </P5Card>
      )}

      <P5Card title={t.fares.rulesCardTitle}>
        <div style={{ fontSize: 12, color: P5.mut, lineHeight: 1.65 }}>
          {t.fares.rulesDesc}
        </div>
      </P5Card>
      <div
        style={{
          margin: "0 14px",
          fontSize: 10.5,
          color: P5.dim,
          textAlign: "center",
        }}
      >
        {t.fares.footerText}
      </div>
      <P5Notice />
    </P5Phone>
  );
}
