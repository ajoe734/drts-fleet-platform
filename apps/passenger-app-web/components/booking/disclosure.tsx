import type { FareVersion } from "@drts/contracts";
import {
  PASSENGER_FEE_ROWS,
  PASSENGER_FREE_CANCELLATION_NOTICE,
} from "@drts/passenger-client";
import { P5, P5Card } from "../auth/ui";
import { BOOK_T as T } from "../../lib/booking/translations";

export function FeeDisclosure({ fare }: { fare: FareVersion }) {
  return (
    <>
      <P5Card title={T.disclosure}>
        {PASSENGER_FEE_ROWS.map(([label, content]) => (
          <div
            key={label}
            style={{
              padding: "9px 0",
              borderBottom: `1px solid ${P5.lineSoft}`,
            }}
          >
            <strong style={{ color: P5.brand }}>{label}</strong>
            <div>{content}</div>
          </div>
        ))}
        <p>{PASSENGER_FREE_CANCELLATION_NOTICE}</p>
      </P5Card>
      <p>{T.fareStamp(fare.version, fare.effectiveAt)}</p>
    </>
  );
}
