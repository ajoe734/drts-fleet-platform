"use client";
import { passengerChrome } from "../../lib/passenger-presentation";

export default function RidesListPage() {
  return (
    <div
      style={{
        padding: 16,
        margin: 16,
        background: passengerChrome.warning.bg,
        border: `1px solid ${passengerChrome.warning.border}`,
        borderRadius: 8,
        textAlign: "center",
        color: passengerChrome.warning.fg,
      }}
    >
      <div style={{ fontWeight: 800 }}>Screen Requirements Note</div>
      <div style={{ fontSize: 13, marginTop: 8 }}>
        History screen design is missing from the design canvas.
      </div>
    </div>
  );
}
