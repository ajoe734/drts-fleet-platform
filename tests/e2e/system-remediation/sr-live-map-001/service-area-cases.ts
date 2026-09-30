import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  GeoPoint,
  ServiceAreaEvaluationResult,
  ServiceProductType,
} from "@drts/contracts";
import { ServiceAreaService } from "../../../../apps/api/src/modules/service-area/service-area.service";

// Run the production evaluator, without repositories/notifications, on its V0049
// baseline. The live response is still mandatory; this is the expected oracle.
export function baselineService() {
  const service = new ServiceAreaService();
  const sql = readFileSync(
    "infra/migrations/V0049__service_area_baseline_seed.sql",
    "utf8",
  );
  for (const row of [
    ...service.listServiceAreas(),
    ...service.listStopPolicies(),
  ]) {
    const idKey = "serviceAreaId" in row ? "serviceAreaId" : "stopPolicyId";
    const id = "serviceAreaId" in row ? row.serviceAreaId : row.stopPolicyId;
    const start = sql.indexOf(`'${idKey}', '${id}'`);
    assert(start >= 0, "Runtime baseline ID must exist in V0049");
    const block = sql.slice(start, sql.indexOf("    ),", start));
    for (const [key, value] of Object.entries(row)) {
      if (["createdAt", "updatedAt"].includes(key)) continue;
      const literal =
        value === null
          ? "NULL"
          : typeof value === "number"
            ? String(value)
            : typeof value === "object"
              ? `'${JSON.stringify(value)}'::jsonb`
              : `'${value}'`;
      assert(
        block.includes(`'${key}', ${literal}`),
        `Runtime ${key} must match V0049; review baseline drift`,
      );
    }
  }
  return service;
}

export const SERVICE_CASES: ReadonlyArray<{
  id: string;
  address: string;
  product: ServiceProductType;
  decision: ServiceAreaEvaluationResult["decision"];
  area: string | null;
  reason: string | null;
  basis: string;
}> = [
  {
    id: "taipei-core",
    address: "台北市中正區中山南路21號",
    product: "taxi_realtime",
    decision: "serviceable",
    area: "TAIPEI_CORE",
    reason: null,
    basis:
      "V0049 Taipei polygon: lat 25.0005..25.125, lng 121.4505..121.625; taxi_realtime; outside both stop policies.",
  },
  {
    id: "airport",
    address: "桃園市大園區航站南路9號",
    product: "credit_card_airport_transfer",
    decision: "serviceable",
    area: "TAOYUAN_AIRPORT",
    reason: null,
    basis:
      "V0049 airport circle: (25.0797,121.2342), radius 6500 m; credit_card_airport_transfer only.",
  },
  {
    id: "outside-taipei",
    address: "新竹市東區中華路二段445號",
    product: "taxi_realtime",
    decision: "not_serviceable",
    area: null,
    reason: "PICKUP_AREA_NOT_SERVICEABLE",
    basis:
      "Hsinchu station must be outside the V0049 Taipei polygon; evaluateStop rejects no matched active area.",
  },
  {
    id: "outside-airport",
    address: "新竹市東區中華路二段445號",
    product: "credit_card_airport_transfer",
    decision: "not_serviceable",
    area: null,
    reason: "PICKUP_AREA_NOT_SERVICEABLE",
    basis:
      "Same real geocode must also be outside the 6500 m airport circle, proving outside both products' areas.",
  },
  {
    id: "pickup-policy",
    address: "台北市中正區北平西路3號",
    product: "taxi_realtime",
    decision: "not_serviceable",
    area: "TAIPEI_CORE",
    reason: "PICKUP_NOT_ALLOWED",
    basis:
      "V0049 station pickup deny circle: (25.0478,121.517), radius 220 m, direction pickup; deny wins inside Taipei.",
  },
];

export function expectedServiceDecision(
  service: ServiceAreaService,
  scenario: (typeof SERVICE_CASES)[number],
  point: GeoPoint,
) {
  assert(
    Number.isFinite(point.lat) &&
      point.lat >= 21 &&
      point.lat <= 26.5 &&
      Number.isFinite(point.lng) &&
      point.lng >= 119 &&
      point.lng <= 123,
    "Google result must be in Taiwan",
  );
  const expected = service.evaluate({
    serviceProductType: scenario.product,
    pickup: point,
  });
  // A moved/ambiguous Google result must fail the intended coverage instead of
  // quietly accepting an oracle result for a different geographical scenario.
  assert.equal(
    expected.decision,
    scenario.decision,
    `${scenario.id}: geocode does not cover intended V0049 scenario`,
  );
  assert.deepEqual(
    expected.serviceAreaCodes,
    scenario.area ? [scenario.area] : [],
  );
  assert.deepEqual(
    expected.reasonCodes,
    scenario.reason ? [scenario.reason] : [],
  );
  return expected;
}

export function decisionProjection(result: ServiceAreaEvaluationResult) {
  return {
    decision: result.decision,
    serviceProductType: result.serviceProductType,
    serviceAreaCodes: result.serviceAreaCodes,
    reasonCodes: result.reasonCodes,
    geometryVersionRefs: result.geometryVersionRefs,
    stops: result.stops.map((stop) => ({
      kind: stop.kind,
      location: stop.location,
      serviceAreaCodes: stop.serviceAreaCodes,
      policyCodes: stop.policyCodes,
      geometryVersionRefs: stop.geometryVersionRefs,
      decision: stop.decision,
      reasonCodes: stop.reasonCodes,
    })),
  };
}
