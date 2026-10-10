import React from "react";
import { P5Phone, P5Header, P5Card, P5Btn, P5Notice, P5 } from "../p5-ui";
import { bookingTranslations as t } from "../../lib/booking/translations";

interface P5E19aProps {
  onAgree: () => void;
  fareVersion: string;
  effectiveAt: string;
  error?: string | null;
}

export function P5E19a({ onAgree, fareVersion, effectiveAt, error }: P5E19aProps) {
  const E_FEES = [
    [t.e19a.fees.fareTitle, t.e19a.fees.fareDesc],
    [t.e19a.fees.bookingFeeTitle, t.e19a.fees.bookingFeeDesc],
    [t.e19a.fees.cancellationFeeTitle, t.e19a.fees.cancellationFeeDesc],
    [t.e19a.fees.waitingFeeTitle, t.e19a.fees.waitingFeeDesc],
    [t.e19a.fees.lostItemFeeTitle, t.e19a.fees.lostItemFeeDesc],
    [t.e19a.fees.cleaningFeeTitle, t.e19a.fees.cleaningFeeDesc],
    [t.e19a.fees.tollFeeTitle, t.e19a.fees.tollFeeDesc],
    [t.e19a.fees.promoTitle, t.e19a.fees.promoDesc],
  ];

  return (
    <P5Phone url="ride.smarttransport.tw/fares">
      <P5Header status={t.e19a.headerTitle} order={t.e19a.headerOrder} />
      <div style={{ margin: "12px 14px 10px", fontSize: 12.5, color: P5.mut }}>
        {t.e19a.subtitle}
      </div>
      {error && (
        <div style={{ margin: "0 14px 10px", color: P5.danger, fontSize: 12.5 }}>
          {error}
        </div>
      )}
      <P5Card>
        {E_FEES.map(([k, v], i) => (
          <div
            key={k}
            style={{
              padding: "9px 0",
              borderBottom:
                i < E_FEES.length - 1 ? "1px solid " + P5.lineSoft : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: P5.brand }}>
                {k}
              </span>
              {k === t.e19a.fees.promoTitle && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: P5.mut,
                    background: P5.bg,
                    border: "1px solid " + P5.line,
                    padding: "1px 8px",
                    borderRadius: 999,
                  }}
                >
                  {t.e19a.promoNone}
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: P5.ink,
                marginTop: 3,
                lineHeight: 1.55,
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </P5Card>
      <div style={{ margin: "0 14px 12px", fontSize: 10.5, color: P5.dim }}>
        {t.e19a.versionInfoPrefix}{fareVersion}{t.e19a.versionInfoDate}
        {effectiveAt.substring(0, 10).replace(/-/g, "/")}{t.e19a.versionInfoSuffix}
      </div>
      <div style={{ margin: "0 14px 8px" }}>
        <div onClick={onAgree}>
          <P5Btn kind="primary" icon="check">
            {t.e19a.agreeButton}
          </P5Btn>
        </div>
      </div>
      <div
        style={{
          margin: "0 14px 12px",
          fontSize: 10.5,
          color: P5.mut,
          textAlign: "center",
        }}
      >
        {t.e19a.footerText}
      </div>
      <P5Notice />
    </P5Phone>
  );
}
