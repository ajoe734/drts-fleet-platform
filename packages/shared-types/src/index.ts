export type ProductSurface =
  | "tenant-portal-web"
  | "platform-admin-web"
  | "ops-console-web"
  | "driver-app"
  | "api";

export type PhaseBoundary = "phase-1" | "phase-2";

export interface TenantSummary {
  id: string;
  name: string;
  status: "draft" | "active" | "paused";
}

export interface AuditStubRecord {
  id: string;
  actorId: string;
  surface: ProductSurface;
  createdAt: string;
}

export interface DegradedService {
  name: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
}

export interface UiHealthEnvelope {
  service: string;
  status: "healthy" | "degraded" | "down";
  mode: string;
  execution_mode: string;
  lastCheckedAt: string;
  degradedServices: DegradedService[];
}
