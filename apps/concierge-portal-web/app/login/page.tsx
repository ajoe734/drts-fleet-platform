"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDeskMode } from "@/lib/desk-catalog";
import { useTranslation } from "@/lib/i18n";
import { useConciergePortal } from "@/lib/portal-state";

export default function LoginPage() {
  const router = useRouter();
  const { ready, session, signIn } = useConciergePortal();
  const { t } = useTranslation();
  const [operatorName, setOperatorName] = useState(
    session?.operatorName ?? t("login.defaultName"),
  );
  const [operatorId, setOperatorId] = useState(
    session?.operatorId ?? t("login.defaultId"),
  );
  const [mode, setMode] = useState<
    "concierge_operator" | "call_point_operator"
  >(session?.mode ?? "concierge_operator");

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="section-kicker">{t("login.eyebrow")}</span>
        <h1>{t("login.title")}</h1>
        <p>{t("login.body")}</p>
      </section>

      <section className="panel-card">
        <span className="section-kicker">{t("login.form.eyebrow")}</span>
        <h2>{t("login.form.title")}</h2>
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
            <label htmlFor="operator-name">{t("login.field.name")}</label>
            <input
              id="operator-name"
              onChange={(event) => setOperatorName(event.target.value)}
              required
              value={operatorName}
            />
            <p className="form-help">{t("login.help.name")}</p>
          </div>

          <div className="field-stack">
            <label htmlFor="operator-id">{t("login.field.id")}</label>
            <input
              id="operator-id"
              onChange={(event) => setOperatorId(event.target.value)}
              required
              value={operatorId}
            />
            <p className="form-help">{t("login.help.id")}</p>
          </div>

          <div className="field-stack">
            <label htmlFor="operator-mode">{t("login.field.mode")}</label>
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
                {formatDeskMode("concierge_operator", t)}
              </option>
              <option value="call_point_operator">
                {formatDeskMode("call_point_operator", t)}
              </option>
            </select>
            <p className="form-help">{t("login.help.mode")}</p>
          </div>

          <div className="inline-actions">
            <button className="primary-button" disabled={!ready} type="submit">
              {t("login.submit")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
