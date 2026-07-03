/**
 * Geo provider proxy for the tenant portal address surfaces.
 *
 * The shared `AddressMapPicker` (`@drts/ui-web`) runs in the browser and needs a
 * provider seam. Rather than exposing the backend geo/service-area endpoints to
 * the browser directly, the picker's client adapter (`lib/geo-map-provider.ts`)
 * calls these same-origin routes, which forward to the backend through the
 * tenant API client. When no session is present we fall back to the public
 * client so the picker still works pre-login; any backend failure surfaces as a
 * non-2xx here and the adapter degrades to the manual-coordinate fallback.
 */
import { NextRequest, NextResponse } from "next/server";
import type {
  EvaluateServiceAreaCommand,
  ResolveAddressCommand,
  ReverseGeocodeCommand,
  SearchGeoQuery,
} from "@drts/contracts";
import { createPublicClient } from "@drts/api-client";
import { API_URL, getTenantClientForRouteHandler } from "@/lib/api-client";

export const dynamic = "force-dynamic";

async function resolveClient() {
  return (await getTenantClientForRouteHandler()) ?? createPublicClient(API_URL);
}

function toErrorResponse(error: unknown) {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Geo provider unavailable.",
    },
    { status: 502 },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  const client = await resolveClient();

  try {
    if (action === "health") {
      return NextResponse.json(await client.getGeoProviderHealth());
    }

    if (action === "search") {
      const search = request.nextUrl.searchParams;
      const q = search.get("q") ?? "";
      const nearLat = search.get("nearLat");
      const nearLng = search.get("nearLng");
      const limitRaw = search.get("limit");
      const query: SearchGeoQuery = {
        q,
        surface: "tenant_portal",
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
  const client = await resolveClient();

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
