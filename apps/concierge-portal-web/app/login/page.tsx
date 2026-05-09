"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDeskMode } from "@/lib/desk-catalog";
import { useConciergePortal } from "@/lib/portal-state";

export default function LoginPage() {
  const router = useRouter();
  const { session, signIn } = useConciergePortal();
  const [operatorName, setOperatorName] = useState(
    session?.operatorName ?? "Lobby Desk Operator",
  );
  const [operatorId, setOperatorId] = useState(
    session?.operatorId ?? "CP-OPS-001",
  );
  const [mode, setMode] = useState<
    "concierge_operator" | "call_point_operator"
  >(session?.mode ?? "concierge_operator");

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="section-kicker">Repo-local sign-in</span>
        <h1>Bootstrap the assisted-entry operator locally.</h1>
        <p>
          Canonical PRD truth requires site-bound sign-in, but the repo does not
          yet expose a dedicated call-point bootstrap session contract. This
          route therefore creates a local desk session and scopes API access to
          the narrow assisted-entry capabilities only.
        </p>
      </section>

      <section className="panel-card">
        <span className="section-kicker">Bootstrap form</span>
        <h2>Choose the desk role before selecting a site.</h2>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            signIn({
              operatorName,
              operatorId,
              mode,
            });
            router.push("/start");
          }}
        >
          <div className="field-stack">
            <label htmlFor="operator-name">Operator display name</label>
            <input
              id="operator-name"
              onChange={(event) => setOperatorName(event.target.value)}
              required
              value={operatorName}
            />
            <p className="form-help">
              Stored only in local browser state for the repo demo shell.
            </p>
          </div>

          <div className="field-stack">
            <label htmlFor="operator-id">Operator id</label>
            <input
              id="operator-id"
              onChange={(event) => setOperatorId(event.target.value)}
              required
              value={operatorId}
            />
            <p className="form-help">
              Reused as the limited-scope `x-actor-id` when the portal talks to
              callcenter and order APIs.
            </p>
          </div>

          <div className="field-stack">
            <label htmlFor="operator-mode">Desk lane</label>
            <select
              id="operator-mode"
              onChange={(event) =>
                setMode(
                  event.target.value as
                    | "concierge_operator"
                    | "call_point_operator",
                )
              }
              value={mode}
            >
              <option value="concierge_operator">
                {formatDeskMode("concierge_operator")}
              </option>
              <option value="call_point_operator">
                {formatDeskMode("call_point_operator")}
              </option>
            </select>
            <p className="form-help">
              Desk selection enforces role mismatch through the denied route.
            </p>
          </div>

          <div className="inline-actions">
            <button className="primary-button" type="submit">
              Continue to fixed site selector
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
