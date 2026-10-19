import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  getDriverClient,
  registerProtectedCacheClearHandler,
} from "../lib/api-client";

type Notice = {
  noticeId: string;
  title: string;
  body: string;
  severity: string;
  outcome: {
    outcomeId: string;
    notificationId: string | null;
    readAt: string | null;
  };
};
export function PlatformNoticeBanner() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const observer = useRef<{ read: (n: Notice) => Promise<void> } | null>(null);
  useEffect(() => {
    const client = getDriverClient();
    let disposed = false;
    let generation = 0;
    let active: AbortController | null = null;
    async function refresh() {
      if (disposed) return;
      active?.abort();
      const request = new AbortController();
      active = request;
      const current = ++generation;
      try {
        const items = await client.getList<Notice>(
          "/api/driver/platform-notices",
          { signal: request.signal },
        );
        if (!disposed && !request.signal.aborted && generation === current) {
          setNotices(items);
          setError(null);
        }
      } catch (e) {
        if (!disposed && !request.signal.aborted && generation === current) {
          setNotices([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (generation === current) active = null;
      }
    }
    const timer = setInterval(() => {
      if (!active) void refresh();
    }, 30_000);
    const clear = () => {
      disposed = true;
      generation++;
      active?.abort();
      clearInterval(timer);
      observer.current = null;
    };
    const unregister = registerProtectedCacheClearHandler(() => {
      clear();
      setNotices([]);
      setError(null);
    });
    observer.current = {
      async read(n) {
        setPending(n.noticeId);
        setError(null);
        try {
          const ack = await client.post<Notice["outcome"]>(
            `/api/driver/platform-notices/${encodeURIComponent(n.noticeId)}/read`,
            { body: { outcomeId: n.outcome.outcomeId } },
          );
          if (!ack?.readAt || ack.outcomeId !== n.outcome.outcomeId)
            throw new Error("讀取未獲確認");
          if (!disposed) await refresh();
        } catch (e) {
          if (!disposed) setError(e instanceof Error ? e.message : String(e));
        } finally {
          if (!disposed) setPending(null);
        }
      },
    };
    void refresh();
    return () => {
      clear();
      unregister();
    };
  }, []);
  return (
    <View accessibilityLabel="平台公告">
      {error && <Text accessibilityRole="alert">{error}</Text>}
      {notices.map((n) => (
        <View
          key={n.noticeId}
          accessibilityRole={
            n.severity === "critical" || n.severity === "maintenance"
              ? "alert"
              : "summary"
          }
          style={{
            padding: 12,
            borderWidth: 1,
            borderColor: "#94a3b8",
            marginBottom: 8,
          }}
        >
          <Text style={{ fontWeight: "bold" }}>{n.title}</Text>
          <Text>{n.body}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={Boolean(pending) || Boolean(n.outcome.readAt)}
            onPress={() => void observer.current?.read(n)}
          >
            <Text>{n.outcome.readAt ? "已讀" : "標示已讀"}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
