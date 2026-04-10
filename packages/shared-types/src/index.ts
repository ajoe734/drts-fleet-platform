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
