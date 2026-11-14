/** Where /login sends the browser after Google sign-in: a same-origin
 * relative path only (the auth route checks it again); anything else, such as
 * //host or https://host, returns to the dashboard. */
export function loginReturnPath(raw: string | undefined | null): string {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\")
  )
    return "/";
  try {
    const base = "https://fleet.invalid";
    const resolved = new URL(raw, base);
    return resolved.origin === base
      ? `${resolved.pathname}${resolved.search}`
      : "/";
  } catch {
    return "/";
  }
}
