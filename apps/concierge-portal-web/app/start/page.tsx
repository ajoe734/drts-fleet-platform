"use client";

import { useRouter } from "next/navigation";
import {
  conciergeDeskCatalog,
  formatDeskMode,
  resolveDeskAccess,
} from "@/lib/desk-catalog";
import { SessionGuard } from "@/components/session-guard";
import { useConciergePortal } from "@/lib/portal-state";

export default function StartPage() {
  const router = useRouter();
  const { session, selectDesk } = useConciergePortal();

  return (
    <div className="page-shell">
      <SessionGuard>
        <section className="hero-card">
          <span className="section-kicker">Fixed site selection</span>
          <h1>Choose the desk that owns this assisted-entry session.</h1>
          <p>
            Every call point remains bound to a site. The picker makes health,
            recording posture, queue policy, and role restrictions visible
            before the operator touches a booking form.
          </p>
        </section>

        <section className="grid-columns">
          {conciergeDeskCatalog.map((desk) => {
            const access = session
              ? resolveDeskAccess(desk, session.mode)
              : { allowed: false as const };
            const healthLabel =
              desk.health === "healthy" ? "Healthy" : "Degraded";

            return (
              <article className="info-card" key={desk.deskId}>
                <span className="section-kicker">
                  {desk.deskType === "concierge"
                    ? "Concierge desk"
                    : "Call point"}
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
                    {healthLabel}
                  </span>
                  <span className="chip">{desk.queuePolicy}</span>
                  <span className="chip">
                    {desk.allowedModes.map(formatDeskMode).join(" / ")}
                  </span>
                </div>
                <div className="kv-grid">
                  <div className="kv-item">
                    <strong>Site</strong>
                    <p>{desk.siteName}</p>
                  </div>
                  <div className="kv-item">
                    <strong>Zone</strong>
                    <p>{desk.zoneLabel}</p>
                  </div>
                  <div className="kv-item">
                    <strong>Recording</strong>
                    <p>
                      {desk.recordingAvailability === "ops_callback_only"
                        ? "Ops callback only"
                        : "Inline callback"}
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
                    Select {desk.deskName}
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
