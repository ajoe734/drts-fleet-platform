import type { FareVersion } from "@drts/contracts";
import { PASSENGER_APP_FEE_POLICY_ROWS } from "@drts/passenger-client";
import { P5 } from "../auth/ui";
import { BOOK_T as T, effectiveDay } from "../../lib/booking/translations";
import { PLAN } from "./plan-screen";

const PROMOTION = "優惠活動";
const pill = (tone: "neutral" | "ok") => ({
  display: "inline-block",
  marginLeft: 8,
  padding: "1px 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  verticalAlign: "2px",
  color: tone === "ok" ? P5.ok : P5.mut,
  background: tone === "ok" ? P5.okBg : P5.bg,
  border: `1px solid ${tone === "ok" ? P5.okBd : P5.line}`,
});

/** E-19a 費用與優惠說明: the supplement's final fee policy, verbatim. */
export function FeeDisclosure({ fare }: { fare: FareVersion }) {
  return (
    <>
      <p style={{ ...PLAN.muted, margin: "0 16px 10px", fontSize: 13 }}>
        {T.feesIntro}
      </p>
      <section
        aria-label={T.disclosure}
        style={{ ...PLAN.card, padding: "4px 16px" }}
      >
        {PASSENGER_APP_FEE_POLICY_ROWS.map(([label, content], index) => (
          <div
            key={label}
            style={{
              padding: "12px 0",
              borderTop: index ? `1px solid ${P5.lineSoft}` : undefined,
            }}
          >
            <strong
              style={{
                display: label === PROMOTION ? "inline" : "block",
                color: P5.brand,
                fontSize: 14.5,
                fontWeight: 800,
              }}
            >
              {label}
            </strong>
            {/* 優惠活動 also carries the supplement's 目前無 status chip. */}
            {label === PROMOTION && (
              <span style={pill("neutral")}>{T.noPromotion}</span>
            )}
            <span style={{ display: "block", marginTop: 3 }}>{content}</span>
          </div>
        ))}
      </section>
      <p style={PLAN.stamp}>{T.feeStamp(fare.version, fare.effectiveAt)}</p>
    </>
  );
}

/** E-05 計費說明: the active API tariff and the fare change rule. */
export function FareTariff({ fare }: { fare: FareVersion }) {
  const effective = effectiveDay(fare.effectiveAt);
  const rows = T.tariffRows(fare);
  return (
    <>
      <section style={{ ...PLAN.card, padding: "14px 16px 6px" }}>
        <h2 style={{ ...PLAN.cardTitle, fontSize: 14.5 }}>
          {T.currentTariff}
          {/* Only a genuine, already-reached API date earns the badge. */}
          {effective && effective.instant.getTime() <= Date.now() && (
            <span style={pill("ok")}>{T.tariffEffective}</span>
          )}
        </h2>
        <p style={{ ...PLAN.muted, margin: "0 0 4px" }}>
          {T.tariffStamp(fare.version, fare.effectiveAt)}
        </p>
        {rows.map(([label, value], index) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 12,
              padding: "11px 0",
              borderTop: index ? `1px solid ${P5.lineSoft}` : undefined,
            }}
          >
            <span style={{ color: P5.mut }}>{label}</span>
            <b style={{ fontFamily: P5.mono, whiteSpace: "nowrap" }}>{value}</b>
          </div>
        ))}
      </section>
      <section style={{ ...PLAN.card, padding: "14px 16px" }}>
        <h2 style={{ ...PLAN.cardTitle, fontSize: 14.5 }}>
          {T.fareChangeTitle}
        </h2>
        <p style={{ margin: 0, color: P5.mut, lineHeight: 1.7 }}>
          {T.fareChangeRule}
        </p>
      </section>
    </>
  );
}
