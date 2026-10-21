import path from "node:path";

const METADATA_IDENTITY_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

/** Existing Cloud Run BFF transport: the Google service credential goes in its
 * own header; the product role Bearer remains the passenger/driver credential.
 */
export async function applyUpstreamAuth(
  headers: Headers,
  targetUrl: URL,
  token?: string,
) {
  if (token) headers.set("authorization", `Bearer ${token}`);
  const audience =
    process.env.DRTS_API_AUTH_AUDIENCE?.trim() ||
    (targetUrl.hostname.endsWith(".a.run.app") ? targetUrl.origin : null);
  if (!audience) return;
  const metadataUrl = new URL(METADATA_IDENTITY_TOKEN_URL);
  metadataUrl.searchParams.set("audience", audience);
  metadataUrl.searchParams.set("format", "full");
  const response = await fetch(metadataUrl.toString(), {
    cache: "no-store",
    headers: { "Metadata-Flavor": "Google" },
  });
  if (!response.ok)
    throw new Error(`Metadata fetch failed: ${response.status}`);
  const identityToken = await response.text();
  if (!identityToken)
    throw new Error("Metadata identity token fetch returned empty");
  headers.set("x-serverless-authorization", `Bearer ${identityToken}`);
  headers.set("x-drts-google-id-token", identityToken);
}

/** Expo's existing SPA router owns Driver paths below the build's baseUrl.
 * Static JS/WASM/assets are served from public/review-driver at the same SHA.
 */
export async function serveReviewDriverPage() {
  if (
    process.env.PAX_PUBLIC_PASSENGER_ONLY === "true" ||
    process.env.PAX_REVIEW_DEMO_ENABLED !== "true"
  )
    return new Response("Not found", { status: 404 });
  try {
    const { readFile } = await import("node:fs/promises");
    const html = await readFile(
      path.join(process.cwd(), "public/review-driver/index.html"),
      "utf8",
    );
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Driver rehearsal export is unavailable.", {
      status: 503,
    });
  }
}

export async function forwardReviewDriver(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
  authenticateUpstream: typeof applyUpstreamAuth = applyUpstreamAuth,
) {
  if (
    process.env.PAX_PUBLIC_PASSENGER_ONLY === "true" ||
    process.env.PAX_REVIEW_DEMO_ENABLED !== "true"
  )
    return Response.json({ error: "not_found" }, { status: 404 });
  const { path } = await context.params;
  if (path.some((s) => !/^[A-Za-z0-9_-]+$/.test(s)))
    return Response.json({ error: "not_found" }, { status: 404 });
  const route = path.join("/");
  const driverRoute =
    /^api\/(?:driver(?:\/|$)|auth\/driver\/device(?:\/|$)|orders\/[A-Za-z0-9_-]+$)/.test(
      route,
    );
  const sharedRead =
    request.method === "GET" &&
    ["api/feature-flags", "api/identity/context"].includes(route);
  const geoRoute = /^api\/geo\/(?:route|resolve|reverse|search)$/.test(route);
  if (!driverRoute && !sharedRead && !geoRoute)
    return Response.json({ error: "not_found" }, { status: 404 });
  const target = new URL(
    route,
    `${process.env.DRTS_API_URL || "http://localhost:3001"}/`,
  );
  target.search = new URL(request.url).search;
  const headers = new Headers();
  for (const name of [
    "authorization",
    "content-type",
    "idempotency-key",
    "x-idempotency-key",
    "x-request-id",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    await authenticateUpstream(headers, target);
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: request.signal,
      ...(request.method === "GET"
        ? {}
        : { body: await request.arrayBuffer() }),
    });
    // No role substitution: the original API checks driver device binding,
    // session, task ownership and business rules on every call and stream.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "driver_authority_unavailable" },
      { status: 503 },
    );
  }
}
