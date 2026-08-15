import { ApiClient } from "@drts/api-client";
import {
  TENANT_CSRF_COOKIE_NAME,
  TENANT_CSRF_HEADER_NAME,
} from "./auth/constants";

export function createBrowserApiClient(): ApiClient {
  return new ApiClient({
    baseUrl: typeof window !== "undefined" ? window.location.origin : "",
    pathTransform: (path: string) => {
      if (path.startsWith("/api/")) {
        return `/control-plane-proxy/${path.slice(5)}`;
      }
      if (path.startsWith("/control-plane-proxy/")) {
        return path;
      }
      return `/control-plane-proxy/${path.replace(/^\//, "")}`;
    },
    defaultHeaders: {
      get [TENANT_CSRF_HEADER_NAME]() {
        if (typeof document === "undefined") return "";
        const match = document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith(`${TENANT_CSRF_COOKIE_NAME}=`));
        return match ? decodeURIComponent(match.split("=")[1] ?? "") : "";
      },
    },
  });
}
