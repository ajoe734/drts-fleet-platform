"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserApiClient } from "../lib/browser-api-client";
import { useTranslation } from "../lib/i18n";

type Notice = {
  noticeId: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical" | "maintenance";
  outcome: {
    outcomeId: string;
    notificationId: string | null;
    state: string;
    readAt: string | null;
  };
};
export function PlatformNoticeBanner() {
  const { t } = useTranslation();
  const client = useMemo(() => createBrowserApiClient(), []);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    let disposed = false;
    let generation = 0;
    let active: AbortController | null = null;
    async function refresh() {
      active?.abort();
      const request = new AbortController();
      active = request;
      const current = ++generation;
      try {
        const items = await client.getList<Notice>(
          "/api/tenant/notifications/platform-notices",
          { signal: request.signal },
        );
        if (!disposed && current === generation && !request.signal.aborted) {
          setNotices(items);
          setError(null);
        }
      } catch (e) {
        if (!disposed && current === generation && !request.signal.aborted) {
          setNotices([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (current === generation) active = null;
      }
    }
    refreshRef.current = refresh;
    void refresh();
    const timer = setInterval(() => {
      if (!active) void refresh();
    }, 30_000);
    return () => {
      disposed = true;
      alive.current = false;
      generation++;
      active?.abort();
      clearInterval(timer);
      refreshRef.current = null;
    };
  }, [client]);
  const read = useCallback(
    async (notice: Notice) => {
      setPending(notice.noticeId);
      setError(null);
      try {
        const ack = await client.post<Notice["outcome"]>(
          `/api/tenant/notifications/platform-notices/${encodeURIComponent(notice.noticeId)}/read`,
          { body: { outcomeId: notice.outcome.outcomeId } },
        );
        if (!ack?.readAt || ack.outcomeId !== notice.outcome.outcomeId)
          throw new Error(t("platformNotice.readNotAcknowledged"));
        if (alive.current) await refreshRef.current?.();
      } catch (e) {
        if (alive.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive.current) setPending(null);
      }
    },
    [client, t],
  );
  return (
    <section aria-label={t("platformNotice.section")} aria-live="polite">
      {error && <p role="alert">{error}</p>}
      {notices.map((n) => (
        <article
          key={n.noticeId}
          role={
            n.severity === "critical" || n.severity === "maintenance"
              ? "alert"
              : "status"
          }
          style={{
            padding: 12,
            border: `1px solid ${n.severity === "critical" ? "#dc2626" : "#94a3b8"}`,
            marginBottom: 8,
          }}
        >
          <strong>{n.title}</strong>
          <p>{n.body}</p>
          <button
            type="button"
            disabled={Boolean(pending) || Boolean(n.outcome.readAt)}
            onClick={() => void read(n)}
          >
            {t(
              n.outcome.readAt
                ? "platformNotice.read"
                : "platformNotice.markRead",
            )}
          </button>
        </article>
      ))}
    </section>
  );
}
