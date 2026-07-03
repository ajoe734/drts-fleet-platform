import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  GeoPoint,
  ServiceAreaBoundaryRecord,
  ServiceAreaGeometry,
  StopPolicyRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

@Injectable()
export class ServiceAreaRepository {
  private readonly logger = new Logger(ServiceAreaRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<{
    serviceAreas: ServiceAreaBoundaryRecord[];
    stopPolicies: StopPolicyRecord[];
  }> {
    if (!this.isEnabled()) {
      return { serviceAreas: [], stopPolicies: [] };
    }

    const [serviceAreas, stopPolicies] = await Promise.all([
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.service_area_boundaries
          ORDER BY area_code ASC, version DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.stop_policies
          ORDER BY policy_code ASC, version DESC
        `,
      ),
    ]);

    return {
      serviceAreas: serviceAreas.rows.map((row) =>
        this.normalizeServiceArea(row.record),
      ),
      stopPolicies: stopPolicies.rows.map((row) =>
        this.normalizeStopPolicy(row.record),
      ),
    };
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Service-area persistence skipped during ${context}: ${detail}`,
    );
  }

  async persistServiceArea(record: ServiceAreaBoundaryRecord) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO ops.service_area_boundaries (
          service_area_id,
          area_code,
          display_name,
          status,
          geometry,
          service_product_types,
          effective_from,
          effective_until,
          version,
          metadata,
          record,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4,
          ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)),
          $6::jsonb,
          $7,
          $8,
          $9,
          $10::jsonb,
          $11::jsonb,
          $12,
          $13
        )
        ON CONFLICT (service_area_id) DO UPDATE SET
          area_code = EXCLUDED.area_code,
          display_name = EXCLUDED.display_name,
          status = EXCLUDED.status,
          geometry = EXCLUDED.geometry,
          service_product_types = EXCLUDED.service_product_types,
          effective_from = EXCLUDED.effective_from,
          effective_until = EXCLUDED.effective_until,
          version = EXCLUDED.version,
          metadata = EXCLUDED.metadata,
          record = EXCLUDED.record,
          updated_at = EXCLUDED.updated_at
      `,
      [
        record.serviceAreaId,
        record.areaCode,
        record.displayName,
        record.status,
        JSON.stringify(this.geometryToGeoJson(record.geometry)),
        JSON.stringify(record.serviceProductTypes),
        record.effectiveFrom,
        record.effectiveUntil,
        record.version,
        JSON.stringify(record.metadata ?? {}),
        JSON.stringify(record),
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  async persistStopPolicy(record: StopPolicyRecord) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO ops.stop_policies (
          stop_policy_id,
          policy_code,
          display_name,
          status,
          direction,
          effect,
          geometry,
          service_area_codes,
          service_product_types,
          reason_code,
          reason_message,
          effective_from,
          effective_until,
          version,
          metadata,
          record,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          ST_SetSRID(ST_GeomFromGeoJSON($7), 4326),
          $8::jsonb,
          $9::jsonb,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15::jsonb,
          $16::jsonb,
          $17,
          $18
        )
        ON CONFLICT (stop_policy_id) DO UPDATE SET
          policy_code = EXCLUDED.policy_code,
          display_name = EXCLUDED.display_name,
          status = EXCLUDED.status,
          direction = EXCLUDED.direction,
          effect = EXCLUDED.effect,
          geometry = EXCLUDED.geometry,
          service_area_codes = EXCLUDED.service_area_codes,
          service_product_types = EXCLUDED.service_product_types,
          reason_code = EXCLUDED.reason_code,
          reason_message = EXCLUDED.reason_message,
          effective_from = EXCLUDED.effective_from,
          effective_until = EXCLUDED.effective_until,
          version = EXCLUDED.version,
          metadata = EXCLUDED.metadata,
          record = EXCLUDED.record,
          updated_at = EXCLUDED.updated_at
      `,
      [
        record.stopPolicyId,
        record.policyCode,
        record.displayName,
        record.status,
        record.direction,
        record.effect,
        JSON.stringify(this.geometryToGeoJson(record.geometry)),
        JSON.stringify(record.serviceAreaCodes),
        JSON.stringify(record.serviceProductTypes),
        record.reasonCode,
        record.reasonMessage,
        record.effectiveFrom,
        record.effectiveUntil,
        record.version,
        JSON.stringify(record.metadata ?? {}),
        JSON.stringify(record),
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  private normalizeServiceArea(record: unknown): ServiceAreaBoundaryRecord {
    if (!record || typeof record !== "object") {
      throw new Error("Invalid persisted service-area boundary record");
    }
    const candidate = record as Record<string, unknown>;
    if (typeof candidate.serviceAreaId !== "string") {
      throw new Error("Unknown service-area boundary record shape");
    }
    return candidate as unknown as ServiceAreaBoundaryRecord;
  }

  private normalizeStopPolicy(record: unknown): StopPolicyRecord {
    if (!record || typeof record !== "object") {
      throw new Error("Invalid persisted stop-policy record");
    }
    const candidate = record as Record<string, unknown>;
    if (typeof candidate.stopPolicyId !== "string") {
      throw new Error("Unknown stop-policy record shape");
    }
    return candidate as unknown as StopPolicyRecord;
  }

  private geometryToGeoJson(geometry: ServiceAreaGeometry) {
    if (geometry.type === "polygon") {
      return {
        type: "Polygon",
        coordinates: [this.closeRing(geometry.coordinates)],
      };
    }

    return {
      type: "Polygon",
      coordinates: [this.circleToRing(geometry.center, geometry.radiusMeters)],
    };
  }

  private closeRing(points: GeoPoint[]) {
    const ring = points.map((point) => [point.lng, point.lat]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      ring.push([...first]);
    }
    return ring;
  }

  private circleToRing(center: GeoPoint, radiusMeters: number) {
    const segments = 48;
    const latRadius = radiusMeters / 111_320;
    const lngRadius =
      radiusMeters /
      (111_320 * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01));
    const ring: number[][] = [];
    for (let index = 0; index < segments; index += 1) {
      const angle = (2 * Math.PI * index) / segments;
      ring.push([
        center.lng + lngRadius * Math.cos(angle),
        center.lat + latRadius * Math.sin(angle),
      ]);
    }
    ring.push([...ring[0]!]);
    return ring;
  }
}
