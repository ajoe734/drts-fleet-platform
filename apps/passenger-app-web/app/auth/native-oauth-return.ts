export const NATIVE_PASSENGER_OAUTH_CALLBACK_URI =
  "drtspassenger://auth/callback";
export const NATIVE_PASSENGER_OAUTH_STATE_PREFIX = "drtspassenger.";

export function isNativePassengerOAuthState(
  state: string | null | undefined,
): state is string {
  return (
    typeof state === "string" &&
    /^drtspassenger\.[A-Za-z0-9_-]{16,}$/.test(state)
  );
}

export function buildNativePassengerOAuthReturnUrl(
  provider: string | string[] | undefined,
  search: { get(name: string): string | null },
): string | null {
  if (provider !== "google") return null;
  const state = search.get("state");
  if (!isNativePassengerOAuthState(state)) return null;
  const code = search.get("code")?.trim() ?? "";
  const error = search.get("error")?.trim() ?? "";
  const params = new URLSearchParams();
  if (error) {
    params.set("error", error);
  } else if (code) {
    params.set("code", code);
  } else {
    params.set("error", "invalid_grant");
  }
  params.set("state", state);
  return `${NATIVE_PASSENGER_OAUTH_CALLBACK_URI}?${params.toString()}`;
}

export function redirectToNativePassengerApp(url: string) {
  if (!url.startsWith(`${NATIVE_PASSENGER_OAUTH_CALLBACK_URI}?`)) {
    throw new Error("Invalid native passenger OAuth callback redirect");
  }
  if (
    typeof window !== "undefined" &&
    typeof window.location?.assign === "function"
  ) {
    try {
      window.location.assign(url);
    } catch {
      /* Fallback anchor remains interactive when custom-scheme assign is blocked. */
    }
  }
}
