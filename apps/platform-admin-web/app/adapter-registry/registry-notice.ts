import { createElement } from "react";
import type { PlatformAdapter } from "@drts/contracts";
import { CanvasBanner, type CanvasTheme } from "@drts/ui-web";

export { REGISTRY_NOTICE_COPY } from "./translations";

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
