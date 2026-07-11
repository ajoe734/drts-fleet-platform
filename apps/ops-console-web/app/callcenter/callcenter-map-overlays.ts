import type {
  ServiceAreaGeoJsonResponse,
  ServiceProductType,
} from "@drts/contracts";

export type CallcenterMapStopKind = "pickup" | "dropoff";

export function filterCallcenterMapFeatures(
  geoJson: ServiceAreaGeoJsonResponse | null,
  stopKind: CallcenterMapStopKind,
  serviceProductType: ServiceProductType,
) {
  return (geoJson?.features ?? []).filter((feature) => {
    const properties = feature.properties;
    if (
      properties.status !== "active" ||
      !properties.serviceProductTypes.includes(serviceProductType)
    ) {
      return false;
    }
    return (
      properties.recordKind === "service_area" ||
      properties.direction === "both" ||
      properties.direction === stopKind
    );
  });
}
