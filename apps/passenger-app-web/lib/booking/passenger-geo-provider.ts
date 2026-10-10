import {
  AddressMapPickerProvider,
  GeoSearchResponse,
  GeoResolveResponse,
  GeoReverseResponse,
  SearchGeoQuery,
  ResolveAddressCommand,
  ReverseGeocodeCommand,
  ServiceAreaEvaluationResult,
  ServiceAreaPreviewCommand,
  AddressProviderHealth,
} from "@drts/ui-web";

export function createPassengerGeoProvider(): AddressMapPickerProvider {
  const fetchBFF = async (path: string, options?: RequestInit) => {
    const res = await fetch(`/api/passenger-app/geo/${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`Geo API error: ${res.status}`);
    }
    const envelope = await res.json();
    return envelope.data;
  };

  return {
    async search(query: SearchGeoQuery): Promise<GeoSearchResponse> {
      const qs = new URLSearchParams();
      if (query.q) qs.set("q", query.q);
      if (query.near) {
        qs.set("nearLat", query.near.lat.toString());
        qs.set("nearLng", query.near.lng.toString());
      }
      return fetchBFF(`search?${qs.toString()}`);
    },
    async resolve(command: ResolveAddressCommand): Promise<GeoResolveResponse> {
      return fetchBFF("resolve", {
        method: "POST",
        body: JSON.stringify(command),
      });
    },
    async reverse(command: ReverseGeocodeCommand): Promise<GeoReverseResponse> {
      return fetchBFF("reverse", {
        method: "POST",
        body: JSON.stringify(command),
      });
    },
  };
}
