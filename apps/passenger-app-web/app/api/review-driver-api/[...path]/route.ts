import { NextRequest, NextResponse } from "next/server";
import { applyUpstreamAuth } from "../../../../lib/api-upstream";

export const dynamic = "force-dynamic";

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (process.env.PAX_REVIEW_DEMO_ENABLED !== "true")
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { path } = await context.params;
  if (path.some((s) => !/^[A-Za-z0-9_-]+$/.test(s)))
    return NextResponse.json({ error: "not_found" }, { status: 404 });
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
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const target = new URL(
    route,
    `${process.env.DRTS_API_URL || "http://localhost:3001"}/`,
  );
  target.search = request.nextUrl.search;
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
    await applyUpstreamAuth(headers, target);
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
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "driver_authority_unavailable" },
      { status: 503 },
    );
  }
}
export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
