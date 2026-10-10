"use client";
import type { useOtp } from "../../lib/auth/use-otp";
import { AUTH_COPY as C } from "../../../../packages/passenger-client/src/auth/copy";
import { P5Card, P5Btn, P5 } from "./ui";

export const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${P5.line}`,
  fontSize: 15,
  boxSizing: "border-box" as const,
  marginBottom: 8,
};
export function OtpPanel({
  otp,
  onSuccess,
}: {
  otp: ReturnType<typeof useOtp>;
  onSuccess: () => Promise<void> | void;
}) {
  const active = otp.active;
  if (!active) return null;
  return (
    <P5Card title={C.otpTitle}>
      <p>{C.sentTo(active.target)}</p>
      <label>
        {C.code}
        <input
          aria-label={C.code}
          autoComplete="one-time-code"
          inputMode="numeric"
          value={otp.code}
          maxLength={6}
          disabled={otp.pending}
          onChange={(e) => otp.setCode(e.target.value.replace(/[^0-9]/g, ""))}
          style={inputStyle}
        />
      </label>
      <p role="status">{otp.expiresIn ? C.expiry(otp.expiresIn) : C.expired}</p>
      {active.failures > 0 && <p>{C.attempts(active.failures)}</p>}
      {active.blocked && <p>{C.locked}</p>}
      {otp.error && (
        <p role="alert" style={{ color: P5.danger }}>
          {otp.error}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <P5Btn
          kind="primary"
          disabled={
            otp.pending ||
            active.blocked ||
            !otp.expiresIn ||
            !/^[0-9]{6}$/.test(otp.code)
          }
          onClick={() => void otp.verify(onSuccess)}
        >
          {otp.pending
            ? C.loading
            : active.purpose === "login"
              ? C.verifyLogin
              : C.verify}
        </P5Btn>
        <P5Btn
          kind="ghost"
          disabled={otp.pending || otp.countdown > 0}
          onClick={() => void otp.request(active)}
        >
          {otp.countdown > 0 ? C.cooldown(otp.countdown) : C.resend}
        </P5Btn>
        <P5Btn kind="ghost" disabled={otp.pending} onClick={otp.back}>
          {C.back}
        </P5Btn>
      </div>
    </P5Card>
  );
}
