import { ApiClientError } from "@drts/api-client";

export const IDENTITY_SESSION_CSRF_ENDPOINT = "/api/identity-session-csrf";
export const IDENTITY_SESSION_CSRF_HEADER = "x-csrf-token";
export const IDENTITY_SESSION_CSRF_COOKIE = "__Host-platform-session-csrf";

export async function identitySessionCsrfHeaders(
  apiBaseUrl: string,
): Promise<Record<string, string>> {
  // Direct bearer API callers retain their existing contract. The browser BFF
  // creates upstream authority and therefore always needs app-local proof.
  const base = new URL(apiBaseUrl, "https://platform.invalid");
  if (base.pathname.replace(/\/$/, "") !== "/control-plane-proxy") return {};

  const response = await fetch(IDENTITY_SESSION_CSRF_ENDPOINT, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "same-origin",
  });
  if (!response.ok) {
    throw new ApiClientError({
      statusCode: response.status,
      code: "CSRF_PROOF_UNAVAILABLE",
      message: "Unable to acquire session revocation CSRF proof.",
      retryable: false,
      rawBody: "",
    });
  }
  const body: unknown = await response.json();
  const token = (body as { token?: unknown } | null)?.token;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error("Invalid session revocation CSRF proof response.");
  }
  return { [IDENTITY_SESSION_CSRF_HEADER]: token };
}
