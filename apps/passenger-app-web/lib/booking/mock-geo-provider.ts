import {
  AddressMapPickerProvider,
  GeoSearchResponse,
  GeoResolveResponse,
  GeoReverseResponse,
  SearchGeoQuery,
  ReverseGeocodeCommand,
  ServiceAreaEvaluationResult,
  ServiceAreaPreviewCommand,
  AddressProviderHealth,
} from "@drts/ui-web";

export function createMockGeoProvider(): AddressMapPickerProvider {
  return {
    async search(query: SearchGeoQuery): Promise<GeoSearchResponse> {
      return {
        provider: "mock",
        generatedAt: new Date().toISOString(),
        candidates: [
          {
            candidateId: "mock-1",
            provider: "mock",
            displayName: query.q || "台北車站",
            address: "中正區北平西路 3 號",
            location: { lat: 25.0478, lng: 121.517 },
            confidence: "exact",
          },
          {
            candidateId: "mock-2",
            provider: "mock",
            displayName: "松山機場",
            address: "松山區敦化北路 340-9 號",
            location: { lat: 25.0697, lng: 121.5526 },
            confidence: "exact",
          },
        ],
      };
    },
    async resolve(): Promise<GeoResolveResponse> {
      return {
        address: {
          addressName: "台北車站",
          address: "中正區北平西路 3 號",
          lat: 25.0478,
          lng: 121.517,
        },
        provider: "mock",
        resolvedAt: new Date().toISOString(),
      };
    },
    async reverse(command: ReverseGeocodeCommand): Promise<GeoReverseResponse> {
      return {
        address: {
          addressName: "已知地點",
          address: "目前經緯度對應的地址",
          lat: command.location.lat,
          lng: command.location.lng,
        },
        provider: "mock",
        resolvedAt: new Date().toISOString(),
      };
    },
    async evaluateServiceArea(
      command: ServiceAreaPreviewCommand,
    ): Promise<ServiceAreaEvaluationResult> {
      return {
        decision: "serviceable",
        serviceProductType: command.serviceProductType,
        evaluatedAt: new Date().toISOString(),
        stops: [],
        serviceAreaCodes: [],
        geometryVersionRefs: [],
        reasonCodes: [],
        reasonMessages: [],
      };
    },
    async getHealth(): Promise<AddressProviderHealth> {
      return { provider: "mock", mode: "mock", status: "healthy" };
    },
  };
}
