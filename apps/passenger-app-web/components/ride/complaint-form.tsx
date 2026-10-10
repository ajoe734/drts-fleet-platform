import { passengerChrome } from "../../lib/passenger-presentation";

/* eslint-disable @typescript-eslint/no-unused-vars */
export function ComplaintForm(props: {
  token: string;
  authMode?: "id" | "token" | undefined;
}) {
  return (
    <div
      style={{
        padding: 16,
        margin: "0 14px 16px",
        background: passengerChrome.warning.bg,
        border: `1px solid ${passengerChrome.warning.border}`,
        borderRadius: 8,
        textAlign: "center",
        color: passengerChrome.warning.fg,
      }}
    >
      <div style={{ fontWeight: 800 }}>Screen Requirements Note</div>
      <div style={{ fontSize: 13, marginTop: 8 }}>
        Complaint & lost item form design is missing from the design canvas.
      </div>
    </div>
  );
}
