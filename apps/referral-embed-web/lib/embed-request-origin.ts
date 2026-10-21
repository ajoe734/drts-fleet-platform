/** Resolve request authority without trusting caller forwarding/provenance headers. */
export function resolveReferralRequestUrl(
  requestUrl: URL,
  headers: Headers,
): URL | null {
  // Direct Next invocations retain their original URL semantics. Cloud Run
  // terminates TLS before the standalone HTTP listener, as in the existing
  // control-plane runtime's ingressOrigin rule.
  if (!process.env.K_SERVICE?.trim()) return new URL(requestUrl);

  const authority = headers.get("host");
  if (!authority) return null;
  const match = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?$/i.exec(
    authority,
  );
  if (!match) return null;
  const [, hostname, port] = match;
  if (!hostname) return null;
  if (
    (port && (Number(port) < 1 || Number(port) > 65535)) ||
    (!hostname.startsWith("[") &&
      (hostname.length > 253 ||
        hostname
          .split(".")
          .some(
            (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
          )))
  ) {
    return null;
  }
  try {
    const publicUrl = new URL(`https://${authority}`);
    if (publicUrl.hostname !== hostname.toLowerCase()) return null;
    publicUrl.pathname = requestUrl.pathname;
    publicUrl.search = requestUrl.search;
    publicUrl.hash = requestUrl.hash;
    return publicUrl;
  } catch {
    return null;
  }
}
