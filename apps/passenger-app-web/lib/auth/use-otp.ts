"use client";
import { useEffect, useRef, useState } from "react";
import { client, PassengerAuthError } from "./client";
import type { RequestOtpCommand } from "./types";
import {
  authErrorCopy,
  normalizedOtpTarget,
} from "../../../../packages/passenger-client/src/auth/state";

type Challenge = RequestOtpCommand & {
  challenge: string;
  resendAt: number;
  expiresAt: number;
  failures: number;
  blocked: boolean;
};
const keyOf = (c: RequestOtpCommand) =>
  `${c.provider}:${c.purpose}:${normalizedOtpTarget(c.provider, c.target)}`;
const prefix = "pax:otp:";
export function clearOtpState() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(prefix)) sessionStorage.removeItem(key);
  } catch {
    /* Storage may be unavailable. */
  }
}

export function useOtp(scope: string, allowed: readonly string[]) {
  const [records, setRecords] = useState<Record<string, Challenge>>({});
  const recordsRef = useRef(records);
  const [active, setActive] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const busy = useRef(false);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const publish = (next: Record<string, Challenge>) => {
    recordsRef.current = next;
    setRecords(next);
    try {
      sessionStorage.setItem(prefix + scope, JSON.stringify(next));
    } catch {
      /* Optional persistence only. */
    }
  };
  useEffect(() => {
    let next: Record<string, Challenge> = {};
    try {
      const saved = JSON.parse(sessionStorage.getItem(prefix + scope) ?? "{}");
      next = Object.fromEntries(
        Object.entries(saved).filter((entry): entry is [string, Challenge] => {
          const [key, value] = entry;
          const c = value as Challenge;
          return (
            !!c &&
            typeof c.target === "string" &&
            ["phone", "email"].includes(c.provider) &&
            ["login", "link", "verify_contact_phone"].includes(c.purpose) &&
            typeof c.challenge === "string" &&
            Number.isFinite(c.expiresAt) &&
            c.expiresAt > Date.now() &&
            Number.isFinite(c.resendAt) &&
            Number.isInteger(c.failures) &&
            c.failures >= 0 &&
            c.failures <= 5 &&
            key === keyOf(c)
          );
        }),
      );
    } catch {
      /* Untrusted storage is not auth authority. */
    }
    recordsRef.current = next;
    setRecords(next);
    setActive(null);
    setCode("");
    setError("");
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [scope]);
  const countdownFor = (command: RequestOtpCommand) =>
    Math.max(
      0,
      Math.ceil(((records[keyOf(command)]?.resendAt ?? 0) - now) / 1000),
    );
  const request = async (command: RequestOtpCommand) => {
    const key = keyOf(command);
    if (
      busy.current ||
      !allowed.includes(command.provider) ||
      !command.target.trim() ||
      (recordsRef.current[key]?.resendAt ?? 0) > Date.now()
    )
      return;
    const startedScope = scope;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const wire: RequestOtpCommand = {
        provider: command.provider,
        purpose: command.purpose,
        target: normalizedOtpTarget(command.provider, command.target),
      };
      const response = await client.requestOtp(wire);
      if (scopeRef.current !== startedScope) return;
      if (!response.success || !response.challenge)
        throw new Error("missing challenge");
      const timestamp = Date.now();
      const next = {
        ...wire,
        target: normalizedOtpTarget(command.provider, command.target),
        challenge: response.challenge,
        resendAt: timestamp + 60000,
        expiresAt: timestamp + 300000,
        failures: 0,
        blocked: false,
      };
      publish({ ...recordsRef.current, [key]: next });
      setActive(next);
      setCode("");
      setNow(timestamp);
    } catch (err) {
      if (scopeRef.current !== startedScope) return;
      setError(authErrorCopy(err));
      if (err instanceof PassengerAuthError && err.status === 429) {
        const timestamp = Date.now();
        publish({
          ...recordsRef.current,
          [key]: {
            ...command,
            challenge: "",
            failures: 0,
            blocked: true,
            expiresAt: timestamp + 3600000,
            resendAt: timestamp + (err.retryAfter ?? 60) * 1000,
          },
        });
      }
    } finally {
      busy.current = false;
      if (scopeRef.current === startedScope) setPending(false);
    }
  };
  const verify = async (onSuccess: () => Promise<void> | void) => {
    if (
      !active ||
      busy.current ||
      active.blocked ||
      active.expiresAt <= Date.now() ||
      !allowed.includes(active.provider) ||
      !/^[0-9]{6}$/.test(code)
    )
      return;
    const startedScope = scope;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await client.login({
        provider: active.provider,
        target: active.target,
        challenge: active.challenge,
        code,
      });
      if (scopeRef.current !== startedScope) return;
      const expected =
        active.purpose === "login"
          ? "logged_in"
          : active.purpose === "link"
            ? "linked"
            : "verified_contact_phone";
      if (result.result !== expected)
        throw new Error("unexpected auth purpose");
      const next = { ...recordsRef.current };
      delete next[keyOf(active)];
      publish(next);
      setActive(null);
      setCode("");
      await onSuccess();
    } catch (err) {
      if (scopeRef.current !== startedScope) return;
      setError(authErrorCopy(err));
      if (
        err instanceof PassengerAuthError &&
        ["invalid_code", "challenge_locked", "challenge_expired"].includes(
          err.code,
        )
      ) {
        const failures = Math.min(5, active.failures + 1);
        const next = {
          ...active,
          failures,
          blocked: failures >= 5 || err.code !== "invalid_code",
        };
        setActive(next);
        publish({ ...recordsRef.current, [keyOf(next)]: next });
      }
    } finally {
      busy.current = false;
      if (scopeRef.current === startedScope) setPending(false);
    }
  };
  return {
    active,
    code,
    setCode,
    pending,
    error,
    request,
    verify,
    countdownFor,
    countdown: active ? countdownFor(active) : 0,
    expiresIn: active
      ? Math.max(0, Math.ceil((active.expiresAt - now) / 1000))
      : 0,
    back: () => {
      if (!busy.current) {
        setActive(null);
        setCode("");
        setError("");
      }
    },
  };
}
