"use client";

import Link from "next/link";
import { OPS_CALLCENTER_URL } from "@/lib/api-client";
import { localizeDeskRecord } from "@/lib/desk-catalog";
import { useTranslation } from "@/lib/i18n";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

export default function RecordingUnavailablePage() {
  const { session } = useConciergePortal();
  const { t } = useTranslation();
  const desk = localizeDeskRecord(useSelectedDesk(), t);

  return (
    <div className="page-shell">
      <section className="hero-card tone-warning">
        <span className="section-kicker">{t("recording.eyebrow")}</span>
        <h1>{t("recording.title")}</h1>
        <p>{t("recording.body")}</p>
      </section>

      <section className="detail-grid">
        <article className="panel-card tone-warning">
          <span className="section-kicker">
            {t("recording.posture.eyebrow")}
          </span>
          <h2>{desk ? desk.deskName : t("recording.posture.empty")}</h2>
          <p>
            {session?.activeCallId
              ? t("recording.posture.activeCall", {
                  callId: session.activeCallId,
                })
              : t("recording.posture.noCall")}
          </p>
          <div className="inline-actions">
            <Link className="primary-link" href="/callbacks">
              {t("recording.posture.callbacks")}
            </Link>
            <Link className="secondary-link" href="/lookup">
              {t("common.reviewLookup")}
            </Link>
          </div>
        </article>

        <article className="panel-card">
          <span className="section-kicker">{t("recording.seam.eyebrow")}</span>
          <h2>{t("recording.seam.title")}</h2>
          <p>{t("recording.seam.body")}</p>
          <div className="inline-actions">
            <a
              className="secondary-link"
              href={OPS_CALLCENTER_URL}
              rel="noreferrer"
              target="_blank"
            >
              {t("common.openOpsCallcenter")}
            </a>
          </div>
        </article>
      </section>
    </div>
  );
}
