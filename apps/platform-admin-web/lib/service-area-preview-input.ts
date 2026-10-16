import type {
  EvaluateServiceAreaCommand,
  GeoPoint,
  ServiceProductType,
} from "@drts/contracts";

const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export type ParsedCoordinatePair =
  | { status: "omitted" }
  | { status: "partial" }
  | { status: "malformed" }
  | { status: "point"; point: GeoPoint };

export interface ServiceAreaPreviewFormInput {
  serviceProductType?: ServiceProductType;
  pickupLat: string;
  pickupLng: string;
  dropoffLat: string;
  dropoffLng: string;
}

export type ServiceAreaPreviewParseResult =
  | {
      ok: true;
      pickup: GeoPoint;
      dropoff: GeoPoint | null;
      command: EvaluateServiceAreaCommand;
    }
  | {
      ok: false;
      field: "pickup" | "dropoff";
      reason: "omitted" | "partial" | "malformed";
    };

function parseFiniteDecimalCoordinate(trimmed: string): number | null {
  if (!DECIMAL_NUMBER_PATTERN.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value === 0 ? 0 : value;
}

export function parseCoordinatePairInput(
  latInput: string,
  lngInput: string,
): ParsedCoordinatePair {
  const latTrimmed = latInput.trim();
  const lngTrimmed = lngInput.trim();

  if (latTrimmed.length === 0 && lngTrimmed.length === 0) {
    return { status: "omitted" };
  }
  if (latTrimmed.length === 0 || lngTrimmed.length === 0) {
    return { status: "partial" };
  }

  const lat = parseFiniteDecimalCoordinate(latTrimmed);
  const lng = parseFiniteDecimalCoordinate(lngTrimmed);
  if (lat === null || lng === null) {
    return { status: "malformed" };
  }

  return {
    status: "point",
    point: { lat, lng },
  };
}

export function parseServiceAreaPreviewInput(
  input: ServiceAreaPreviewFormInput,
): ServiceAreaPreviewParseResult {
  const pickup = parseCoordinatePairInput(input.pickupLat, input.pickupLng);
  if (pickup.status !== "point") {
    return {
      ok: false,
      field: "pickup",
      reason: pickup.status,
    };
  }

  const dropoff = parseCoordinatePairInput(input.dropoffLat, input.dropoffLng);
  if (dropoff.status === "partial" || dropoff.status === "malformed") {
    return {
      ok: false,
      field: "dropoff",
      reason: dropoff.status,
    };
  }

  const dropoffPoint = dropoff.status === "point" ? dropoff.point : null;

  return {
    ok: true,
    pickup: pickup.point,
    dropoff: dropoffPoint,
    command: {
      serviceProductType: input.serviceProductType ?? "taxi_realtime",
      pickup: pickup.point,
      dropoff: dropoffPoint,
    },
  };
}
