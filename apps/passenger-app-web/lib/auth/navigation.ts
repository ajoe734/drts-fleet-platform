import { isDemoMode } from "../demo/store";

/** Browser navigation is an external boundary for jsdom component tests. */
export function redirectToProvider(url: string) {
  const parsed = new URL(url);
  if (isDemoMode()) {
    if (parsed.origin !== window.location.origin)
      throw new Error("Invalid demo callback");
    window.location.assign(url);
    return;
  }
  if (parsed.protocol !== "https:")
    throw new Error("Invalid provider redirect");
  window.location.assign(url);
}
