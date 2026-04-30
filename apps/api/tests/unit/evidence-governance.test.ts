import { describe, expect, it } from "vitest";

import {
  assertEvidenceAccess,
  getEvidenceGovernanceCatalog,
} from "../../src/common/evidence-governance";
import { ApiRequestError } from "../../src/common/api-envelope";

describe("evidence-governance policy catalog", () => {
  it("publishes all phase1 evidence families with legal-hold workflow", () => {
    const catalog = getEvidenceGovernanceCatalog();

    expect(catalog.version).toBe("phase1-2026-04-29");
    expect(catalog.policies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: "call_recording" }),
        expect.objectContaining({ family: "report_artifact" }),
        expect.objectContaining({ family: "filing_package" }),
        expect.objectContaining({ family: "audit_log" }),
        expect.objectContaining({ family: "webhook_delivery" }),
        expect.objectContaining({ family: "eligibility_verification" }),
        expect.objectContaining({ family: "proof_bundle" }),
      ]),
    );
    expect(catalog.legalHoldWorkflow).toHaveLength(3);
  });

  it("denies tenant access to call-recording evidence but allows tenant-scoped reports", () => {
    const tenantIdentity = {
      actorType: "tenant_admin" as const,
      actorId: "tenant-admin-001",
      realm: "tenant" as const,
      scopes: ["reports:read"],
      tenantId: "tenant-demo-001",
    };

    expect(() =>
      assertEvidenceAccess({
        family: "call_recording",
        identity: tenantIdentity,
        tenantId: "tenant-demo-001",
      }),
    ).toThrowError(ApiRequestError);

    const policy = assertEvidenceAccess({
      family: "report_artifact",
      identity: tenantIdentity,
      tenantId: "tenant-demo-001",
    });
    expect(policy.family).toBe("report_artifact");
  });
});
