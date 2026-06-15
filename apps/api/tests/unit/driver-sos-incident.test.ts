import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { IncidentService } from "../../src/modules/incident/incident.service";
import { resolveRouteAuthPolicy } from "../../src/common/auth/auth.policy";
import { AUTH_SCOPE_PRESETS } from "../../src/common/auth/auth.constants";
import type { BootstrapRequestIdentity } from "../../src/common/auth/auth.types";

function driverIdentity(actorId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap",
    actorType: "driver_user",
    actorId,
    realm: "driver",
    tenantId: null,
    roleFamilies: [],
    roles: [],
    scopes: AUTH_SCOPE_PRESETS.driver_user,
  } as unknown as BootstrapRequestIdentity;
}

describe("driver SOS / incident creation", () => {
  it("allows the driver realm to POST /incidents with incident:write", () => {
    const policy = resolveRouteAuthPolicy("POST", "/api/incidents");
    expect(policy?.allowedRealms).toContain("driver");
    expect(policy?.requiredScopes).toContain("incident:write");
  });

  it("does NOT allow the driver realm on the incident list route", () => {
    const policy = resolveRouteAuthPolicy("GET", "/api/incidents");
    expect(policy?.allowedRealms ?? []).not.toContain("driver");
  });

  it("grants driver_user the incident:write scope", () => {
    expect(AUTH_SCOPE_PRESETS.driver_user).toContain("incident:write");
  });

  it("forces a driver-created incident to be scoped to the authenticated driver", () => {
    const service = new IncidentService(new AuditNotificationService());
    const incident = service.createIncident(
      {
        title: "SOS",
        description: "driver pressed SOS",
        category: "safety",
        severity: "high",
        reportedBy: "SOMEONE-ELSE",
        relatedDriverId: "SOMEONE-ELSE",
      },
      "req-sos-1",
      driverIdentity("drv-demo-001"),
    );
    expect(incident.reportedBy).toBe("drv-demo-001");
    expect(incident.relatedDriverId).toBe("drv-demo-001");
  });

  it("keeps the provided reporter for non-driver (ops/platform) callers", () => {
    const service = new IncidentService(new AuditNotificationService());
    const incident = service.createIncident({
      title: "Ops-filed incident",
      description: "filed by ops",
      category: "operational",
      severity: "low",
      reportedBy: "ops-user-001",
      relatedDriverId: "DRV-201",
    });
    expect(incident.reportedBy).toBe("ops-user-001");
    expect(incident.relatedDriverId).toBe("DRV-201");
  });
});
