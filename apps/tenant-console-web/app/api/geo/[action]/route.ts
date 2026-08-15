/**
 * Geo provider proxy for the tenant console booking surface.
 *
 * The shared `AddressMapPairPicker` (`@drts/ui-web`) runs in the browser and
 * calls these same-origin routes (via `lib/geo-map-provider.ts`), which forward
 * to the backend geo / service-area endpoints through the tenant API client.
 * Any backend failure surfaces as a non-2xx here so the picker degrades to the
 * manual-coordinate fallback (Gate E). Serviceability is evaluated by the
 * backend; the booking-create backend gate remains the authoritative check.
 */
import { NextRequest, NextResponse } from "next/server";
import type {
  EvaluateServiceAreaCommand,
  ResolveAddressCommand,
  ReverseGeocodeCommand,
  SearchGeoQuery,
} from "@drts/contracts";
import { getTenantClientForRouteHandler } from "@/lib/api-client";

export const dynamic = "force-dynamic";

function toErrorResponse(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof Error ? error.message : "Geo provider unavailable.",
    },
    { status: 502 },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  const client = await getTenantClientForRouteHandler();
  if (!client) {
    return NextResponse.json(
      { error: "AUTHENTICATION_REQUIRED", message: "Active tenant session required." },
      { status: 401 },
    );
  }

  try {
    if (action === "health") {
      return NextResponse.json(await client.getGeoProviderHealth());
    }

    if (action === "search") {
      const search = request.nextUrl.searchParams;
      const nearLat = search.get("nearLat");
      const nearLng = search.get("nearLng");
      const limitRaw = search.get("limit");
      const query: SearchGeoQuery = {
        q: search.get("q") ?? "",
        surface: "tenant_console",
        ...(search.get("locale") ? { locale: search.get("locale")! } : {}),
        ...(limitRaw && Number.isFinite(Number(limitRaw))
          ? { limit: Number(limitRaw) }
          : {}),
        ...(nearLat && nearLng
          ? { near: { lat: Number(nearLat), lng: Number(nearLng) } }
          : {}),
        ...(search.get("requestedByActorId")
          ? { requestedByActorId: search.get("requestedByActorId")! }
          : {}),
      };
      return NextResponse.json(await client.searchGeo(query));
    }

    return NextResponse.json({ error: "Unknown geo action." }, { status: 404 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  const client = await getTenantClientForRouteHandler();
  if (!client) {
    return NextResponse.json(
      { error: "AUTHENTICATION_REQUIRED", message: "Active tenant session required." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();

    if (action === "resolve") {
      return NextResponse.json(
        await client.resolveGeo(body as ResolveAddressCommand),
      );
    }

    if (action === "reverse") {
      return NextResponse.json(
        await client.reverseGeo(body as ReverseGeocodeCommand),
      );
    }

    if (action === "evaluate-service-area") {
      return NextResponse.json(
        await client.evaluateServiceArea(body as EvaluateServiceAreaCommand),
      );
    }

    return NextResponse.json({ error: "Unknown geo action." }, { status: 404 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
