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
      <P5Header status="計費說明" order="公開資訊" />
      {fares ? (
        <P5Card
          title="現行計費表"
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
              已生效
            </span>
          }
        >
          <div style={{ fontSize: 11, color: P5.mut, marginBottom: 6 }}>
            版本 {fares.currentVersion.version} · 生效日{" "}
            {fares.currentVersion.effectiveAt
              .substring(0, 10)
              .replace(/-/g, "/")}{" "}
            · 依臺北市政府公告計程車運價
          </div>
          {R(
            `起程運價（${fares.currentVersion.baseDistanceMeters / 1000} 公里）`,
            `NT$ ${fares.currentVersion.baseFare}`,
          )}
          {R(
            `續程運價（每 ${fares.currentVersion.distanceIncrementMeters} 公尺）`,
            `NT$ ${fares.currentVersion.distanceRate}`,
          )}
          {R(
            `延滯計時（每 ${fares.currentVersion.delayIncrementSeconds} 秒）`,
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
              夜間加成（{fares.currentVersion.nightSurchargeWindowStart}–
              {fares.currentVersion.nightSurchargeWindowEnd}）
            </span>
            <b style={{ fontFamily: P5.mono }}>
              +{fares.currentVersion.nightSurcharge}
            </b>
          </div>
        </P5Card>
      ) : error ? (
        <P5Card title="載入失敗">
          <div style={{ fontSize: 12, color: P5.danger }}>{error}</div>
        </P5Card>
      ) : (
        <P5Card title="載入中...">
          <div style={{ fontSize: 12, color: P5.mut }}>Loading...</div>
        </P5Card>
      )}

      <P5Card title="車資變更規則">
        <div style={{ fontSize: 12, color: P5.mut, lineHeight: 1.65 }}>
          若乘客要求變更目的地、增加停靠點，或因依法需支付通行費，實際車資可能調整。固定報價行程以確認時之應付金額為準。
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
        本頁依主管機關備查之現行版本公告
      </div>
      <P5Notice />
    </P5Phone>
  );
}
