import type { IamStepUpActionId } from "@drts/contracts";

import type { AuthRealm } from "./auth.types";

const MINUTE_MS = 60_000;

export interface StepUpRoutePolicy {
  actionId: IamStepUpActionId;
  description: string;
  freshnessWindowMs: number;
  enforcedRealms: AuthRealm[];
}

export interface ResolvedStepUpRoutePolicy extends StepUpRoutePolicy {
  routeKey: string;
}

interface StepUpRouteRule extends StepUpRoutePolicy {
  matches(method: string, routePath: string): boolean;
}

function normalizeRoutePath(url: string): string {
  const withoutQuery = url.split("?", 1)[0] ?? url;
  const trimmed = withoutQuery
    .replace(/^\/+/, "")
    .replace(/^(api\/+)?(v[0-9]+\/+)?/, "");
  return trimmed.replace(/\/+$/, "");
}

function exactMatch(expectedMethod: string, expectedPath: string) {
  return (method: string, routePath: string) =>
    method === expectedMethod && routePath === expectedPath;
}

function regexMatch(expectedMethod: string, pattern: RegExp) {
  return (method: string, routePath: string) =>
    method === expectedMethod && pattern.test(routePath);
}

const STEP_UP_ROUTE_RULES: readonly StepUpRouteRule[] = [
  {
    actionId: "platform:tenants:create",
    description: "Platform tenant creation",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: exactMatch("POST", "platform-admin/tenants"),
  },
  {
    actionId: "platform:tenants:settings:update",
    description: "Platform tenant settings update",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch("POST", /^platform-admin\/tenants\/[^/]+\/settings$/),
  },
  {
    actionId: "platform:tenants:onboarding:update",
    description: "Platform tenant onboarding update",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch("POST", /^platform-admin\/tenants\/[^/]+\/onboarding$/),
  },
  {
    actionId: "platform:tenants:rollout:update",
    description: "Platform tenant rollout stage update",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch("POST", /^platform-admin\/tenants\/[^/]+\/rollout$/),
  },
  {
    actionId: "platform:users:create",
    description: "Platform user invitation and privileged user creation",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: exactMatch("POST", "platform-admin/users"),
  },
  {
    actionId: "platform:users:role:update",
    description: "Platform privileged role assignment",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch("POST", /^platform-admin\/users\/[^/]+\/role$/),
  },
  {
    actionId: "platform:access-reviews:decide",
    description: "Privileged access review decision",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch(
      "POST",
      /^platform-admin\/access-reviews\/[^/]+\/decision$/,
    ),
  },
  {
    actionId: "platform:break-glass:request",
    description: "Break-glass request creation",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: exactMatch("POST", "platform-admin/break-glass/requests"),
  },
  {
    actionId: "platform:break-glass:approve",
    description: "Break-glass approval",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch(
      "POST",
      /^platform-admin\/break-glass\/requests\/[^/]+\/approve$/,
    ),
  },
  {
    actionId: "platform:partner-entries:create",
    description: "Platform partner entry creation",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: exactMatch("POST", "platform-admin/partner-entries"),
  },
  {
    actionId: "platform:partner-entries:activate",
    description: "Platform partner entry activation",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch(
      "POST",
      /^platform-admin\/partner-entries\/[^/]+\/activate$/,
    ),
  },
  {
    actionId: "platform:partner-entries:deactivate",
    description: "Platform partner entry deactivation",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch(
      "POST",
      /^platform-admin\/partner-entries\/[^/]+\/deactivate$/,
    ),
  },
  {
    actionId: "platform:partner-entries:revoke",
    description: "Platform partner entry revocation",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch(
      "POST",
      /^platform-admin\/partner-entries\/[^/]+\/revoke$/,
    ),
  },
  {
    actionId: "platform:partner-credentials:issue",
    description: "Partner ingress credential issuance",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch(
      "POST",
      /^platform-admin\/partner-entries\/[^/]+\/credentials\/issue$/,
    ),
  },
  {
    actionId: "platform:partner-credentials:revoke",
    description: "Partner ingress credential revocation",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch(
      "POST",
      /^platform-admin\/partner-entries\/[^/]+\/credentials\/[^/]+\/revoke$/,
    ),
  },
  {
    actionId: "platform:partner-entries:update",
    description: "Partner entry configuration update",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch("POST", /^platform-admin\/partner-entries\/[^/]+$/),
  },
  {
    actionId: "platform:tenants:roles:invite",
    description: "Platform tenant role invitation",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch(
      "POST",
      /^platform-admin\/tenants\/[^/]+\/roles\/invite$/,
    ),
  },
  {
    actionId: "platform:tenants:rollback-hold",
    description: "Platform tenant rollback hold",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch(
      "POST",
      /^platform-admin\/tenants\/[^/]+\/rollback-hold$/,
    ),
  },
  {
    actionId: "platform:tenants:suspend",
    description: "Platform tenant suspension",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch("POST", /^platform-admin\/tenants\/[^/]+\/suspend$/),
  },
  {
    actionId: "platform:tenants:activate",
    description: "Platform tenant activation",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch("POST", /^platform-admin\/tenants\/[^/]+\/activate$/),
  },
  {
    actionId: "platform:maintenance-mode:update",
    description: "Platform maintenance mode mutation",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: exactMatch("POST", "platform-admin/maintenance-mode"),
  },
  {
    actionId: "platform:pricing-rules:create",
    description: "Platform pricing rule creation",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: exactMatch("POST", "platform-admin/pricing-rules"),
  },
  {
    actionId: "platform:pricing-rules:publish",
    description: "Platform pricing rule publication",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch(
      "POST",
      /^platform-admin\/pricing-rules\/[^/]+\/publish$/,
    ),
  },
  {
    actionId: "platform:feature-flags:tenant-override:update",
    description: "Tenant-scoped feature flag override update",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: regexMatch("POST", /^admin\/flags\/[^/]+\/tenant-overrides$/),
  },
  {
    actionId: "platform:multi-taxi-trip-records:export",
    description: "Controlled operational export",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform"],
    matches: exactMatch(
      "POST",
      "platform-admin/multi-taxi-trip-records/export-jobs",
    ),
  },
  {
    actionId: "platform:evidence-exports:request",
    description: "Controlled evidence export request",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: exactMatch("POST", "platform-admin/evidence/exports/request"),
  },
  {
    actionId: "platform:evidence-exports:approve",
    description: "Controlled evidence export approval",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: regexMatch(
      "POST",
      /^platform-admin\/evidence\/exports\/[^/]+\/approve$/,
    ),
  },
  {
    actionId: "platform:legal-holds:release-approve",
    description: "Legal-hold release approval",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: regexMatch(
      "POST",
      /^platform-admin\/evidence\/legal-holds\/[^/]+\/release-approve$/,
    ),
  },
  {
    actionId: "platform:regulatory-exclusivities:approve",
    description: "Regulatory exclusivity approval",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: regexMatch(
      "POST",
      /^regulatory-registry\/exclusivities\/[^/]+\/approve$/,
    ),
  },
  {
    actionId: "platform:regulatory-exclusivities:reject",
    description: "Regulatory exclusivity rejection",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: regexMatch(
      "POST",
      /^regulatory-registry\/exclusivities\/[^/]+\/reject$/,
    ),
  },
  {
    actionId: "ops:partner-eligibility:reviews:resolve",
    description: "Partner eligibility manual review resolution",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: exactMatch("POST", "ops/partner/eligibility/reviews/resolve"),
  },
  {
    actionId: "ops:approval-requests:acknowledge-breach",
    description: "Ops approval SLA breach acknowledgement",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: regexMatch(
      "POST",
      /^ops\/approval-requests\/[^/]+\/acknowledge-breach$/,
    ),
  },
  {
    actionId: "ops:approval-requests:approve",
    description: "Ops approval request approval",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: regexMatch("POST", /^ops\/approval-requests\/[^/]+\/approve$/),
  },
  {
    actionId: "ops:approval-requests:reject",
    description: "Ops approval request rejection",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: regexMatch("POST", /^ops\/approval-requests\/[^/]+\/reject$/),
  },
  {
    actionId: "ops:approval-requests:escalate",
    description: "Ops approval request escalation",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: regexMatch("POST", /^ops\/approval-requests\/[^/]+\/escalate$/),
  },
  {
    actionId: "ops:orders:manual-fare-override",
    description: "Operational manual fare override",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: regexMatch("POST", /^orders\/[^/]+\/manual-fare-override$/),
  },
  {
    actionId: "ops:orders:approve-override",
    description: "Operational exception override approval",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: regexMatch("POST", /^orders\/[^/]+\/approve-override$/),
  },
  {
    actionId: "ops:orders:reject-override",
    description: "Operational exception override rejection",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: regexMatch("POST", /^orders\/[^/]+\/reject-override$/),
  },
  {
    actionId: "ops:driver-device:revoke",
    description: "Remote driver device revoke",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: exactMatch("POST", "auth/driver/device/revoke"),
  },
  {
    actionId: "finance:reimbursements:approve",
    description: "Reimbursement approval",
    freshnessWindowMs: 10 * MINUTE_MS,
    enforcedRealms: ["platform", "ops"],
    matches: regexMatch("POST", /^reimbursements\/[^/]+\/approve$/),
  },
  {
    actionId: "tenant:approval-requests:approve",
    description: "Tenant approval request approval",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["tenant", "platform"],
    matches: regexMatch("POST", /^tenant\/approval-requests\/[^/]+\/approve$/),
  },
  {
    actionId: "tenant:approval-requests:reject",
    description: "Tenant approval request rejection",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["tenant", "platform"],
    matches: regexMatch("POST", /^tenant\/approval-requests\/[^/]+\/reject$/),
  },
  {
    actionId: "tenant:approval-requests:escalate",
    description: "Tenant approval request escalation",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["tenant", "platform"],
    matches: regexMatch("POST", /^tenant\/approval-requests\/[^/]+\/escalate$/),
  },
  {
    actionId: "tenant:users:create",
    description: "Tenant privileged user invite",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["tenant", "platform"],
    matches: exactMatch("POST", "tenant/users"),
  },
  {
    actionId: "tenant:users:role:update",
    description: "Tenant role assignment",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["tenant", "platform"],
    matches: regexMatch("POST", /^tenant\/users\/[^/]+\/role$/),
  },
  {
    actionId: "tenant:api-keys:issue",
    description: "Tenant API key issuance",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["tenant", "platform"],
    matches: exactMatch("POST", "tenant/api-keys"),
  },
  {
    actionId: "tenant:api-keys:revoke",
    description: "Tenant API key revocation",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["tenant", "platform"],
    matches: regexMatch("POST", /^tenant\/api-keys\/[^/]+\/revoke$/),
  },
  {
    actionId: "tenant:api-keys:rotate",
    description: "Tenant API key rotation",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["tenant", "platform"],
    matches: regexMatch("POST", /^tenant\/api-keys\/[^/]+\/rotate$/),
  },
  {
    actionId: "tenant:webhooks:create",
    description: "Tenant webhook endpoint creation",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["tenant", "platform"],
    matches: exactMatch("POST", "tenant/webhooks"),
  },
  {
    actionId: "tenant:webhooks:update",
    description: "Tenant webhook endpoint update",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["tenant", "platform"],
    matches: regexMatch("POST", /^tenant\/webhooks\/[^/]+$/),
  },
  {
    actionId: "tenant:webhooks:delete",
    description: "Tenant webhook endpoint deletion",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["tenant", "platform"],
    matches: regexMatch("DELETE", /^tenant\/webhooks\/[^/]+$/),
  },
  {
    actionId: "tenant:webhooks:rotate-secret",
    description: "Tenant webhook secret rotation",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["tenant", "platform"],
    matches: regexMatch("POST", /^tenant\/webhooks\/[^/]+\/rotate-secret$/),
  },
  {
    actionId: "tenant:billing:profile:update",
    description: "Tenant billing profile update",
    freshnessWindowMs: 15 * MINUTE_MS,
    enforcedRealms: ["tenant", "platform"],
    matches: exactMatch("POST", "tenant/billing/profile"),
  },
] as const;

export function resolveRouteStepUpPolicy(
  method: string,
  url: string,
  realm?: AuthRealm,
): ResolvedStepUpRoutePolicy | null {
  const routePath = normalizeRoutePath(url);
  const upperMethod = method.toUpperCase();

  for (const rule of STEP_UP_ROUTE_RULES) {
    if (realm && !rule.enforcedRealms.includes(realm)) {
      continue;
    }
    if (!rule.matches(upperMethod, routePath)) {
      continue;
    }
    return {
      actionId: rule.actionId,
      description: rule.description,
      freshnessWindowMs: rule.freshnessWindowMs,
      enforcedRealms: [...rule.enforcedRealms],
      routeKey: rule.actionId,
    };
  }

  return null;
}

export function resolveStepUpActionPolicy(
  actionId: IamStepUpActionId,
  realm?: AuthRealm,
): StepUpRoutePolicy | null {
  const matched = STEP_UP_ROUTE_RULES.find(
    (rule) => rule.actionId === actionId,
  );
  if (!matched) {
    return null;
  }
  if (realm && !matched.enforcedRealms.includes(realm)) {
    return null;
  }
  return {
    actionId: matched.actionId,
    description: matched.description,
    freshnessWindowMs: matched.freshnessWindowMs,
    enforcedRealms: [...matched.enforcedRealms],
  };
}
