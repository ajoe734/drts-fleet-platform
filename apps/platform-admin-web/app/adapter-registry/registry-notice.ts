import { createElement } from "react";
import type { PlatformAdapter } from "@drts/contracts";
import { CanvasBanner, type CanvasTheme } from "@drts/ui-web";

export const REGISTRY_NOTICE_COPY = {
  en: {
    title: (platformCode: string) => `${platformCode} requires attention`,
    body: (name: string, credential: string, health: string) =>
      `${name}: credential status ${credential}; health ${health}.`,
    unknownExpiry:
      "Credential expiry time is unknown; upcoming expiry cannot be determined.",
  },
  zh: {
    title: (platformCode: string) => `${platformCode} 需要檢查`,
    body: (name: string, credential: string, health: string) =>
      `${name}：憑證狀態為 ${credential}，健康狀態為 ${health}。`,
    unknownExpiry: "憑證到期時間未知，無法判斷是否即將到期。",
  },
};

export function findAttentionAdapter(adapters: readonly PlatformAdapter[]) {
  return adapters.find(
    (adapter) =>
      adapter.credentialStatus !== "VALID" ||
      adapter.healthStatus.status !== "HEALTHY" ||
      adapter.warn === true,
  );
}

/** A health/credential status is not a credential expiration timestamp. */
export function RegistryNotice({
  theme,
  adapters,
  loading,
  error,
  title,
  body,
}: {
  theme: CanvasTheme;
  adapters: readonly PlatformAdapter[];
  loading: boolean;
  error: string | null;
  title: (adapter: PlatformAdapter) => string;
  body: (adapter: PlatformAdapter) => string;
}) {
  if (loading || error !== null) return null;
  const adapter = findAttentionAdapter(adapters);
  if (!adapter) return null;

  return createElement(CanvasBanner, {
    theme,
    tone:
      adapter.credentialStatus === "INVALID" ||
      adapter.credentialStatus === "EXPIRED" ||
      adapter.healthStatus.status === "UNHEALTHY"
        ? "danger"
        : "warn",
    icon: "warn",
    title: title(adapter),
    body: body(adapter),
  });
}
