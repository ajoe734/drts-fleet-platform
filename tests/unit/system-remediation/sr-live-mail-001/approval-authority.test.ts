import { afterEach, describe, expect, it, vi } from "vitest";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import {
  resolveCiTenantActorGrant,
  type ResolvedGoogleWorkloadIdentity,
} from "../../../../apps/api/src/modules/auth/google-workload-identity.adapter";

const tenantId = "10000000-0000-0000-0000-000000000201";
const actorId = "10000000-0000-0000-0000-000000000901";
const approver = "tenant_user_00000000-0000-0000-0000-000000000001";
afterEach(() => vi.unstubAllEnvs());

describe("self-provisioned approval identity prerequisite", () => {
  it("production decision service rejects tenant_admin acting for the sole invited approver", async () => {
    const service = new TenantPartnerService(new AuditNotificationService());
    // In-memory repository state only; actual lookup and authorization execute.
    Reflect.set(service, "approvalRequests", [
      {
        tenantId,
        approvalRequestId: "approval-request-probe",
        status: "pending",
        resolvedApproverUserIds: [approver],
      },
    ]);
    await expect(
      service.approveApprovalRequest({
        tenantId,
        approvalRequestId: "approval-request-probe",
        actorUserId: actorId,
        actorRoleCode: "tenant_admin",
        command: {},
      }),
    ).rejects.toMatchObject({ status: 403, code: "APPROVAL_NOT_AUTHORIZED" });
  });
  it("production WIF grant resolution admits the registered actor and refuses the dynamic approver", () => {
    vi.stubEnv("WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "test");
    const grant = { tenantId, actorId, actorType: "tenant_admin" };
    const resolved = {
      ciTenantActorGrants: [grant],
    } as ResolvedGoogleWorkloadIdentity;
    expect(resolveCiTenantActorGrant(resolved, grant)).toEqual(grant);
    expect(
      resolveCiTenantActorGrant(resolved, { ...grant, actorId: approver }),
    ).toBeNull();
  });
});
