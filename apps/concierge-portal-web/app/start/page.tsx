"use client";

import { useRouter } from "next/navigation";
import {
  conciergeDeskCatalog,
  formatDeskHealth,
  formatDeskMode,
  formatDeskType,
  formatQueuePolicy,
  formatRecordingAvailability,
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
          <span className="section-kicker">固定站點選擇</span>
          <h1>選擇此客服代訂工作階段所屬的櫃台。</h1>
          <p>
            每個電話站點都必須綁定站點。開始填寫代訂表單前，先確認健康狀態、錄音處理、佇列策略與角色限制。
          </p>
        </section>

        <section className="grid-columns">
          {conciergeDeskCatalog.map((desk) => {
            const access = session
              ? resolveDeskAccess(desk, session.mode)
              : { allowed: false as const };
            const healthLabel = formatDeskHealth(desk.health);

            return (
              <article className="info-card" key={desk.deskId}>
                <span className="section-kicker">
                  {formatDeskType(desk.deskType)}
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
                  <span className="chip">
                    {formatQueuePolicy(desk.queuePolicy)}
                  </span>
                  <span className="chip">
                    {desk.allowedModes.map(formatDeskMode).join(" / ")}
                  </span>
                </div>
                <div className="kv-grid">
                  <div className="kv-item">
                    <strong>站點</strong>
                    <p>{desk.siteName}</p>
                  </div>
                  <div className="kv-item">
                    <strong>服務範圍</strong>
                    <p>{desk.zoneLabel}</p>
                  </div>
                  <div className="kv-item">
                    <strong>錄音</strong>
                    <p>
                      {formatRecordingAvailability(desk.recordingAvailability)}
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
                    選擇 {desk.deskName}
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
