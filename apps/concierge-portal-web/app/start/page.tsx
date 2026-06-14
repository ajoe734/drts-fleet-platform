"use client";

import { useRouter } from "next/navigation";
import { SessionGuard } from "@/components/session-guard";
import {
  conciergeDeskCatalog,
  formatDeskHealth,
  formatDeskMode,
  formatQueuePolicy,
  formatRecordingAvailability,
  localizeDeskRecord,
  resolveDeskAccess,
} from "@/lib/desk-catalog";
import { useTranslation } from "@/lib/i18n";
import { useConciergePortal } from "@/lib/portal-state";

export default function StartPage() {
  const router = useRouter();
  const { session, selectDesk } = useConciergePortal();
  const { t } = useTranslation();

  return (
    <div className="page-shell">
      <SessionGuard>
        <section className="hero-card">
          <span className="section-kicker">{t("start.eyebrow")}</span>
          <h1>{t("start.title")}</h1>
          <p>{t("start.body")}</p>
        </section>

        <section className="grid-columns">
          {conciergeDeskCatalog.map((deskRecord) => {
            const desk = localizeDeskRecord(deskRecord, t)!;
            const access = session
              ? resolveDeskAccess(deskRecord, session.mode, t)
              : { allowed: false as const };

            return (
              <article className="info-card" key={desk.deskId}>
                <span className="section-kicker">
                  {desk.deskType === "concierge"
                    ? t("start.card.concierge")
                    : t("start.card.callPoint")}
                </span>
                <h3>{desk.deskName}</h3>
                <p>{desk.notes}</p>
                <div className="badge-row">
                  <span
                    className={`chip${
                      desk.health === "healthy"
                        ? " chip-success"
                        : " chip-warning"
                    }`}
                  >
                    {formatDeskHealth(desk.health, t)}
                  </span>
                  <span className="chip">
                    {formatQueuePolicy(desk.queuePolicy, t)}
                  </span>
                  <span className="chip">
                    {desk.allowedModes
                      .map((mode) => formatDeskMode(mode, t))
                      .join(" / ")}
                  </span>
                </div>
                <div className="kv-grid">
                  <div className="kv-item">
                    <strong>{t("start.kv.site")}</strong>
                    <p>{desk.siteName}</p>
                  </div>
                  <div className="kv-item">
                    <strong>{t("start.kv.zone")}</strong>
                    <p>{desk.zoneLabel}</p>
                  </div>
                  <div className="kv-item">
                    <strong>{t("start.kv.recording")}</strong>
                    <p>
                      {formatRecordingAvailability(
                        desk.recordingAvailability,
                        t,
                      )}
                    </p>
                  </div>
                </div>
                <div className="inline-actions">
                  <button
                    className="primary-button"
                    onClick={() => {
                      if (!session) {
                        router.push("/login");
                        return;
                      }

                      if (!access.allowed) {
                        router.push(
                          `/denied?desk=${desk.deskId}&mode=${session.mode}`,
                        );
                        return;
                      }

                      selectDesk(desk.deskId);
                      router.push(
                        desk.health === "degraded"
                          ? `/degraded?desk=${desk.deskId}`
                          : "/bookings/new",
                      );
                    }}
                    type="button"
                  >
                    {t("start.selectDesk", { deskName: desk.deskName })}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </SessionGuard>
    </div>
  );
}
