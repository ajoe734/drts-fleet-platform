"use client";
import { useEffect, useRef, useState } from "react";
import { client } from "../../lib/auth/client";
import { consentPolicy } from "../../lib/auth/policy";
import { AUTH_COPY as C } from "../../../../packages/passenger-client/src/auth/copy";
import { consentDecision } from "../../../../packages/passenger-client/src/auth/state";
import { P5Card, P5Btn, P5 } from "./ui";

export function ConsentGate({
  onComplete,
  onExit,
}: {
  onComplete: () => void;
  onExit: () => void;
}) {
  const [state, setState] = useState<
    "loading" | "required" | "unconfigured" | "error"
  >("loading");
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const policy = consentPolicy();
  const load = async () => {
    if (busy.current) return;
    busy.current = true;
    setState("loading");
    setError("");
    try {
      const result = consentDecision(
        await client.getAccount(),
        consentPolicy(),
      );
      if (result === "accepted") complete.current();
      else setState(result);
    } catch {
      setState("error");
      setError(C.consentReadFailed);
    } finally {
      busy.current = false;
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const save = async () => {
    if (!checked || state !== "required" || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await client.updateAccount({
        termsVersion: policy.termsVersion,
        privacyVersion: policy.privacyVersion,
      });
      if (consentDecision(response.account, policy) !== "accepted")
        throw new Error("consent not stored");
      complete.current();
    } catch {
      setError(C.consentSaveFailed);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return (
    <P5Card title={C.consentTitle}>
      {state === "loading" ? (
        <p role="status">{C.loading}</p>
      ) : (
        <>
          <p>{state === "unconfigured" ? C.consentPending : C.consentIntro}</p>
          {policy.termsUrl && (
            <p>
              <a
                href={policy.termsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: P5.brand }}
              >
                {C.terms}
              </a>
            </p>
          )}
          {policy.privacyUrl && (
            <p>
              <a
                href={policy.privacyUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: P5.brand }}
              >
                {C.privacy}
              </a>
            </p>
          )}
          {state === "required" && (
            <>
              <label style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={saving}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                {C.consentCheckbox}
              </label>
              <P5Btn
                kind="primary"
                disabled={!checked || saving}
                onClick={() => void save()}
              >
                {saving ? C.loading : C.consentContinue}
              </P5Btn>
            </>
          )}
          {error && (
            <p role="alert" style={{ color: P5.danger }}>
              {error}
            </p>
          )}
          {state === "error" && (
            <P5Btn onClick={() => void load()}>{C.retry}</P5Btn>
          )}
          <P5Btn kind="ghost" disabled={saving} onClick={onExit}>
            {C.backLogin}
          </P5Btn>
        </>
      )}
    </P5Card>
  );
}
