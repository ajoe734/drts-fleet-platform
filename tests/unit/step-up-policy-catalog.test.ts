import { describe, expect, it } from "vitest";

import {
  IAM_STEP_UP_ACTION_IDS,
  type IamStepUpActionId,
} from "@drts/contracts";

import {
  resolveRouteStepUpPolicy,
  resolveStepUpActionPolicy,
} from "../../apps/api/src/common/auth/step-up.policy";

const PRIVILEGED_ROUTE_FIXTURES: Array<{
  method: string;
  path: string;
  realm: "platform" | "ops" | "tenant";
  actionId: IamStepUpActionId;
}> = [
  {
    method: "POST",
    path: "/api/platform-admin/tenants",
    realm: "platform",
    actionId: "platform:tenants:create",
  },
  {
    method: "POST",
    path: "/api/v1/platform-admin/tenants",
    realm: "platform",
    actionId: "platform:tenants:create",
  },
  {
    method: "POST",
    path: "/v1/platform-admin/tenants",
    realm: "platform",
    actionId: "platform:tenants:create",
  },
  {
    method: "POST",
    path: "/api/platform-admin/tenants/tenant-001/settings",
    realm: "platform",
    actionId: "platform:tenants:settings:update",
  },
  {
    method: "POST",
    path: "/api/platform-admin/tenants/tenant-001/onboarding",
    realm: "platform",
    actionId: "platform:tenants:onboarding:update",
  },
  {
    method: "POST",
    path: "/api/platform-admin/tenants/tenant-001/rollout",
    realm: "platform",
    actionId: "platform:tenants:rollout:update",
  },
  {
    method: "POST",
    path: "/api/platform-admin/users",
    realm: "platform",
    actionId: "platform:users:create",
  },
  {
    method: "POST",
    path: "/api/platform-admin/users/user-001/role",
    realm: "platform",
    actionId: "platform:users:role:update",
  },
  {
    method: "POST",
    path: "/api/platform-admin/access-reviews/review-001/decision",
    realm: "platform",
    actionId: "platform:access-reviews:decide",
  },
  {
    method: "POST",
    path: "/api/platform-admin/break-glass/requests",
    realm: "platform",
    actionId: "platform:break-glass:request",
  },
  {
    method: "POST",
    path: "/api/platform-admin/break-glass/requests/request-001/approve",
    realm: "platform",
    actionId: "platform:break-glass:approve",
  },
  {
    method: "POST",
    path: "/api/platform-admin/partner-entries/entry-001/credentials/issue",
    realm: "platform",
    actionId: "platform:partner-credentials:issue",
  },
  {
    method: "POST",
    path: "/api/platform-admin/tenants/tenant-001/rollback-hold",
    realm: "platform",
    actionId: "platform:tenants:rollback-hold",
  },
  {
    method: "POST",
    path: "/api/platform-admin/tenants/tenant-001/suspend",
    realm: "platform",
    actionId: "platform:tenants:suspend",
  },
  {
    method: "POST",
    path: "/api/platform-admin/maintenance-mode",
    realm: "platform",
    actionId: "platform:maintenance-mode:update",
  },
  {
    method: "POST",
    path: "/api/platform-admin/pricing-rules",
    realm: "platform",
    actionId: "platform:pricing-rules:create",
  },
  {
    method: "POST",
    path: "/api/platform-admin/pricing-rules/rule-001/publish",
    realm: "platform",
    actionId: "platform:pricing-rules:publish",
  },
  {
    method: "POST",
    path: "/api/admin/flags/phase1.smoke-paths/tenant-overrides?tenantId=tenant-001",
    realm: "platform",
    actionId: "platform:feature-flags:tenant-override:update",
  },
  {
    method: "POST",
    path: "/api/tenant/users",
    realm: "tenant",
    actionId: "tenant:users:create",
  },
  {
    method: "POST",
    path: "/api/tenant/api-keys/api-key-001/rotate",
    realm: "tenant",
    actionId: "tenant:api-keys:rotate",
  },
  {
    method: "POST",
    path: "/api/ops/partner/eligibility/reviews/resolve",
    realm: "ops",
    actionId: "ops:partner-eligibility:reviews:resolve",
  },
];

describe("step-up policy catalog", () => {
  it("declares a step-up policy for every named privileged action id", () => {
    for (const actionId of IAM_STEP_UP_ACTION_IDS) {
      expect(resolveStepUpActionPolicy(actionId)).toMatchObject({ actionId });
    }
  });

  it("maps named privileged routes to the declared step-up action ids", () => {
    for (const fixture of PRIVILEGED_ROUTE_FIXTURES) {
      expect(
        resolveRouteStepUpPolicy(fixture.method, fixture.path, fixture.realm),
      ).toMatchObject({
        actionId: fixture.actionId,
      });
    }
  });
});
