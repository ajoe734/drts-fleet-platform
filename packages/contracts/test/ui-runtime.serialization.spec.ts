import { describe, expect, it } from "vitest";

import type {
  ActionReceipt,
  ActionRiskLevel,
  CrossAppResourceLink,
  DriverMatchingSuppression,
  DriverOpsInstruction,
  EmptyReason,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  SearchResultRecord,
  TenantIntegrationReadinessSummary,
  TenantRolloutGateStatus,
  TenantRolloutStage,
  TenantRolloutStateMachineRecord,
  UiActorRealm,
  UiHealthEnvelope,
  UiRefreshMetadata,
  UiSeverity,
  UserNotificationRecord,
} from "../src/ui-runtime";

type ContractCase<T> = {
  name: string;
  surface: string;
  sample: T;
  consume: (value: T) => string;
  expectedConsumption: string;
};

function jsonRoundTrip<T>(sample: T): T {
  return JSON.parse(JSON.stringify(sample)) as T;
}

function expectVariants<T extends string>(
  label: string,
  actual: Iterable<T>,
  expected: readonly T[],
): void {
  expect([...new Set(actual)].sort(), label).toEqual([...expected].sort());
}

function runContractCases<T>(
  contractName: string,
  cases: readonly ContractCase<T>[],
): void {
  describe(contractName, () => {
    for (const testCase of cases) {
      it(`${testCase.name} round-trips and drives ${testCase.surface}`, () => {
        const parsed = jsonRoundTrip(testCase.sample);

        expect(parsed).toEqual(testCase.sample);
        expect(testCase.consume(parsed)).toBe(testCase.expectedConsumption);
      });
    }
  });
}

const healthCases: readonly ContractCase<UiHealthEnvelope>[] = [
  {
    name: "minimal healthy shell footer state",
    surface: "shared app shell health footer",
    sample: {
      status: "healthy",
      degradedServices: [],
      lastCheckedAt: "2026-05-26T08:00:00Z",
    },
    consume: (value) =>
      `${value.status}:${value.degradedServices.length}:${value.lastCheckedAt}`,
    expectedConsumption: "healthy:0:2026-05-26T08:00:00Z",
  },
  {
    name: "degraded banner with warning detail",
    surface: "ops console degraded banner",
    sample: {
      status: "degraded",
      degradedServices: [
        {
          service: "dispatch-projection",
          impact: "ETA cards lag by one refresh cycle",
          severity: "warning",
        },
      ],
      lastCheckedAt: "2026-05-26T08:05:00Z",
    },
    consume: (value) =>
      value.degradedServices
        .map(
          (service) => `${value.status}:${service.service}:${service.severity}`,
        )
        .join("|"),
    expectedConsumption: "degraded:dispatch-projection:warning",
  },
  {
    name: "down banner with critical fan-out",
    surface: "tenant console outage banner",
    sample: {
      status: "down",
      degradedServices: [
        {
          service: "billing-read-model",
          impact: "Invoices cannot be loaded",
          severity: "critical",
        },
        {
          service: "notification-feed",
          impact: "Notification inbox may be stale",
          severity: "warning",
        },
      ],
      lastCheckedAt: "2026-05-26T08:10:00Z",
    },
    consume: (value) =>
      `${value.status}:${value.degradedServices
        .map((service) => service.service)
        .join(",")}`,
    expectedConsumption: "down:billing-read-model,notification-feed",
  },
];

const refreshCases: readonly ContractCase<UiRefreshMetadata>[] = [
  {
    name: "fresh live snapshot",
    surface: "driver cockpit freshness badge",
    sample: {
      generatedAt: "2026-05-26T08:00:00Z",
      staleAfterMs: 5000,
      dataFreshness: "fresh",
      source: "live",
    },
    consume: (value) =>
      `${value.dataFreshness}:${value.source}:${value.staleAfterMs}`,
    expectedConsumption: "fresh:live:5000",
  },
  {
    name: "stale cached snapshot",
    surface: "platform admin stale placard",
    sample: {
      generatedAt: "2026-05-26T07:55:00Z",
      staleAfterMs: 15000,
      dataFreshness: "stale",
      source: "cache",
    },
    consume: (value) =>
      `${value.dataFreshness}:${value.source}:${value.staleAfterMs}`,
    expectedConsumption: "stale:cache:15000",
  },
  {
    name: "degraded sandbox snapshot",
    surface: "tenant governance module banner",
    sample: {
      generatedAt: "2026-05-26T07:45:00Z",
      staleAfterMs: 30000,
      dataFreshness: "degraded",
      source: "sandbox",
    },
    consume: (value) =>
      `${value.dataFreshness}:${value.source}:${value.staleAfterMs}`,
    expectedConsumption: "degraded:sandbox:30000",
  },
  {
    name: "unknown static snapshot",
    surface: "documentation-backed placeholder panel",
    sample: {
      generatedAt: "2026-05-26T00:00:00Z",
      staleAfterMs: 0,
      dataFreshness: "unknown",
      source: "static",
    },
    consume: (value) =>
      `${value.dataFreshness}:${value.source}:${value.staleAfterMs}`,
    expectedConsumption: "unknown:static:0",
  },
];

const actionCases: readonly ContractCase<ResourceActionDescriptor>[] = [
  {
    name: "low-risk enabled direct action",
    surface: "list row action strip",
    sample: {
      action: "open_order",
      enabled: true,
      riskLevel: "low",
    },
    consume: (value) =>
      `${value.action}:${value.enabled}:${value.riskLevel}:${value.requiresReason ?? false}`,
    expectedConsumption: "open_order:true:low:false",
  },
  {
    name: "medium-risk disabled action with reason",
    surface: "empty-state call-to-action",
    sample: {
      action: "configure_webhook",
      enabled: false,
      disabledReasonCode: "tenant_missing_admin",
      riskLevel: "medium",
    },
    consume: (value) =>
      `${value.action}:${value.enabled}:${value.riskLevel}:${value.disabledReasonCode ?? "none"}`,
    expectedConsumption: "configure_webhook:false:medium:tenant_missing_admin",
  },
  {
    name: "high-risk reason-required action",
    surface: "rollback hold confirmation modal",
    sample: {
      action: "force_rollback",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
    consume: (value) =>
      `${value.action}:${value.enabled}:${value.riskLevel}:${value.requiresReason ?? false}`,
    expectedConsumption: "force_rollback:true:high:true",
  },
];

const emptyStateCases: readonly ContractCase<EmptyStateEnvelope>[] = [
  {
    name: "no-data empty state",
    surface: "driver trip list zero-state",
    sample: {
      reason: "no_data",
      messageCode: "driver.no_tasks",
    },
    consume: (value) =>
      `${value.reason}:${value.messageCode}:${value.nextAction?.action ?? "none"}`,
    expectedConsumption: "no_data:driver.no_tasks:none",
  },
  {
    name: "not-provisioned empty state with next action",
    surface: "tenant integration readiness panel",
    sample: {
      reason: "not_provisioned",
      messageCode: "tenant.webhook.not_provisioned",
      nextAction: {
        action: "create_webhook",
        enabled: true,
        riskLevel: "medium",
      },
    },
    consume: (value) =>
      `${value.reason}:${value.messageCode}:${value.nextAction?.action ?? "none"}`,
    expectedConsumption:
      "not_provisioned:tenant.webhook.not_provisioned:create_webhook",
  },
  {
    name: "fetch-failed empty state",
    surface: "ops incident backlog panel",
    sample: {
      reason: "fetch_failed",
      messageCode: "ops.incidents.fetch_failed",
    },
    consume: (value) =>
      `${value.reason}:${value.messageCode}:${value.nextAction?.action ?? "none"}`,
    expectedConsumption: "fetch_failed:ops.incidents.fetch_failed:none",
  },
  {
    name: "permission-denied empty state",
    surface: "platform admin restricted section",
    sample: {
      reason: "permission_denied",
      messageCode: "platform.audit.permission_denied",
    },
    consume: (value) =>
      `${value.reason}:${value.messageCode}:${value.nextAction?.action ?? "none"}`,
    expectedConsumption:
      "permission_denied:platform.audit.permission_denied:none",
  },
  {
    name: "external-unavailable empty state",
    surface: "partner adapter availability card",
    sample: {
      reason: "external_unavailable",
      messageCode: "adapter.registry.external_unavailable",
    },
    consume: (value) =>
      `${value.reason}:${value.messageCode}:${value.nextAction?.action ?? "none"}`,
    expectedConsumption:
      "external_unavailable:adapter.registry.external_unavailable:none",
  },
  {
    name: "driver-not-eligible empty state",
    surface: "driver dispatch eligibility card",
    sample: {
      reason: "driver_not_eligible",
      messageCode: "driver.eligibility.suppressed",
    },
    consume: (value) =>
      `${value.reason}:${value.messageCode}:${value.nextAction?.action ?? "none"}`,
    expectedConsumption:
      "driver_not_eligible:driver.eligibility.suppressed:none",
  },
  {
    name: "filtered-empty empty state",
    surface: "search result panel",
    sample: {
      reason: "filtered_empty",
      messageCode: "search.filtered_empty",
    },
    consume: (value) =>
      `${value.reason}:${value.messageCode}:${value.nextAction?.action ?? "none"}`,
    expectedConsumption: "filtered_empty:search.filtered_empty:none",
  },
];

const receiptCases: readonly ContractCase<ActionReceipt>[] = [
  {
    name: "accepted write receipt",
    surface: "toast queue with pending external dependency",
    sample: {
      actionId: "act-001",
      auditId: "aud-001",
      resourceType: "booking",
      resourceId: "bkg-001",
      status: "accepted",
      message: "Command accepted and queued for partner confirmation.",
    },
    consume: (value) =>
      `${value.status}:${value.resourceType}:${value.resourceId}:${value.auditId}`,
    expectedConsumption: "accepted:booking:bkg-001:aud-001",
  },
  {
    name: "completed write receipt",
    surface: "ops success toast",
    sample: {
      actionId: "act-002",
      auditId: "aud-002",
      resourceType: "incident",
      resourceId: "inc-002",
      status: "completed",
      message: "Incident was acknowledged.",
    },
    consume: (value) =>
      `${value.status}:${value.resourceType}:${value.resourceId}:${value.auditId}`,
    expectedConsumption: "completed:incident:inc-002:aud-002",
  },
  {
    name: "failed write receipt",
    surface: "tenant retry toast",
    sample: {
      actionId: "act-003",
      auditId: "aud-003",
      resourceType: "webhook",
      resourceId: "whk-003",
      status: "failed",
      message: "Delivery failed before the adapter accepted the command.",
    },
    consume: (value) =>
      `${value.status}:${value.resourceType}:${value.resourceId}:${value.auditId}`,
    expectedConsumption: "failed:webhook:whk-003:aud-003",
  },
];

const linkCases: readonly ContractCase<CrossAppResourceLink>[] = [
  {
    name: "ops-console deep link",
    surface: "notification link renderer",
    sample: {
      targetApp: "ops-console",
      route: "/dispatch/orders/ord-001",
      resourceType: "order",
      resourceId: "ord-001",
      openMode: "new_tab",
      label: "Open order",
    },
    consume: (value) =>
      `${value.targetApp}:${value.openMode}:${value.route}:${value.label}`,
    expectedConsumption:
      "ops-console:new_tab:/dispatch/orders/ord-001:Open order",
  },
  {
    name: "platform-admin same-tab link",
    surface: "audit receipt deep link",
    sample: {
      targetApp: "platform-admin",
      route: "/audit?auditId=aud-045",
      resourceType: "audit_event",
      resourceId: "aud-045",
      openMode: "same_tab",
      label: "View audit trail",
    },
    consume: (value) =>
      `${value.targetApp}:${value.openMode}:${value.route}:${value.label}`,
    expectedConsumption:
      "platform-admin:same_tab:/audit?auditId=aud-045:View audit trail",
  },
  {
    name: "tenant-console invoice link",
    surface: "tenant inbox cross-app card",
    sample: {
      targetApp: "tenant-console",
      route: "/invoices/inv-778",
      resourceType: "invoice",
      resourceId: "inv-778",
      openMode: "new_tab",
      label: "Review invoice",
    },
    consume: (value) =>
      `${value.targetApp}:${value.openMode}:${value.route}:${value.label}`,
    expectedConsumption:
      "tenant-console:new_tab:/invoices/inv-778:Review invoice",
  },
];

const notificationCases: readonly ContractCase<UserNotificationRecord>[] = [
  {
    name: "platform info notification",
    surface: "platform admin bell badge",
    sample: {
      notificationId: "ntf-001",
      recipientActorId: "usr-platform-1",
      recipientRealm: "platform",
      tenantId: null,
      severity: "info",
      eventType: "tenant.rollout_gate.ready",
      title: "Rollout gate ready",
      message: "Tenant T-001 is ready for pilot approval.",
      resourceLink: linkCases[1].sample,
      readAt: null,
      createdAt: "2026-05-26T08:15:00Z",
    },
    consume: (value) =>
      `${value.recipientRealm}:${value.severity}:${value.resourceLink?.route ?? "inbox"}:${value.readAt ?? "unread"}`,
    expectedConsumption: "platform:info:/audit?auditId=aud-045:unread",
  },
  {
    name: "ops warning notification",
    surface: "ops console inbox row",
    sample: {
      notificationId: "ntf-002",
      recipientActorId: "usr-ops-2",
      recipientRealm: "ops",
      tenantId: "tenant-001",
      severity: "warning",
      eventType: "adapter.health.degraded",
      title: "Adapter health degraded",
      message: "Partner dispatch adapter retrying on elevated latency.",
      resourceLink: linkCases[0].sample,
      readAt: "2026-05-26T08:20:00Z",
      createdAt: "2026-05-26T08:18:00Z",
    },
    consume: (value) =>
      `${value.recipientRealm}:${value.severity}:${value.resourceLink?.route ?? "inbox"}:${value.readAt ?? "unread"}`,
    expectedConsumption:
      "ops:warning:/dispatch/orders/ord-001:2026-05-26T08:20:00Z",
  },
  {
    name: "tenant critical notification without link",
    surface: "tenant inbox fallback card",
    sample: {
      notificationId: "ntf-003",
      recipientActorId: "usr-tenant-3",
      recipientRealm: "tenant",
      tenantId: "tenant-009",
      severity: "critical",
      eventType: "invoice.ready",
      title: "Invoice export failed",
      message: "Retry the invoice job after billing service recovers.",
      resourceLink: null,
      readAt: null,
      createdAt: "2026-05-26T08:25:00Z",
    },
    consume: (value) =>
      `${value.recipientRealm}:${value.severity}:${value.resourceLink?.route ?? "inbox"}:${value.readAt ?? "unread"}`,
    expectedConsumption: "tenant:critical:inbox:unread",
  },
  {
    name: "driver info notification with tenant null",
    surface: "driver app notification drawer",
    sample: {
      notificationId: "ntf-004",
      recipientActorId: "drv-004",
      recipientRealm: "driver",
      tenantId: null,
      severity: "info",
      eventType: "driver.shift.end_reminder",
      title: "Shift ending soon",
      message: "Return to the hub before 22:00 for inspection.",
      resourceLink: null,
      readAt: "2026-05-26T08:32:00Z",
      createdAt: "2026-05-26T08:30:00Z",
    },
    consume: (value) =>
      `${value.recipientRealm}:${value.severity}:${value.resourceLink?.route ?? "inbox"}:${value.readAt ?? "unread"}`,
    expectedConsumption: "driver:info:inbox:2026-05-26T08:32:00Z",
  },
];

const searchCases: readonly ContractCase<SearchResultRecord>[] = [
  {
    name: "minimal grouped search result",
    surface: "ops search dropdown",
    sample: {
      category: "orders",
      resourceType: "order",
      resourceId: "ord-101",
      primaryLabel: "ORD-101",
      link: linkCases[0].sample,
    },
    consume: (value) =>
      `${value.category}:${value.primaryLabel}:${value.link.route}:${value.matchedFields?.join(",") ?? "primary"}`,
    expectedConsumption: "orders:ORD-101:/dispatch/orders/ord-001:primary",
  },
  {
    name: "maximal grouped search result with highlights",
    surface: "tenant search results popover",
    sample: {
      category: "invoices",
      resourceType: "invoice",
      resourceId: "inv-778",
      primaryLabel: "Invoice INV-778",
      secondaryLabel: "May 2026 settlement",
      link: linkCases[2].sample,
      matchedFields: ["invoiceNo", "billingMonth"],
    },
    consume: (value) =>
      `${value.category}:${value.primaryLabel}:${value.link.route}:${value.matchedFields?.join(",") ?? "primary"}`,
    expectedConsumption:
      "invoices:Invoice INV-778:/invoices/inv-778:invoiceNo,billingMonth",
  },
];

const instructionCases: readonly ContractCase<DriverOpsInstruction>[] = [
  {
    name: "minimal manual-fallback instruction",
    surface: "driver trip banner",
    sample: {
      instructionId: "ins-001",
      taskId: "task-001",
      message: "Stage near gate B and call dispatch if passenger is missing.",
      issuedBy: "ops-supervisor-1",
      issuedAt: "2026-05-26T08:40:00Z",
    },
    consume: (value) =>
      `${value.taskId}:${value.issuedBy}:${value.expiresAt ?? "no-expiry"}`,
    expectedConsumption: "task-001:ops-supervisor-1:no-expiry",
  },
  {
    name: "instruction with explicit expiry",
    surface: "driver push detail panel",
    sample: {
      instructionId: "ins-002",
      taskId: "task-002",
      message: "Switch to radio channel 3 for passenger handoff.",
      issuedBy: "ops-supervisor-2",
      issuedAt: "2026-05-26T08:45:00Z",
      expiresAt: "2026-05-26T09:00:00Z",
    },
    consume: (value) =>
      `${value.taskId}:${value.issuedBy}:${value.expiresAt ?? "no-expiry"}`,
    expectedConsumption: "task-002:ops-supervisor-2:2026-05-26T09:00:00Z",
  },
];

const suppressionCases: readonly ContractCase<DriverMatchingSuppression>[] = [
  {
    name: "incident-driven active suppression",
    surface: "ops driver banner",
    sample: {
      active: true,
      reasonCode: "incident",
      sourceIncidentId: "inc-201",
      expiresAt: "2026-05-27T08:50:00Z",
      liftedAt: null,
    },
    consume: (value) =>
      `${value.active}:${value.reasonCode}:${value.sourceIncidentId ?? "none"}:${value.liftedAt ?? "active"}`,
    expectedConsumption: "true:incident:inc-201:active",
  },
  {
    name: "compliance hold suppression without incident link",
    surface: "driver eligibility explainer",
    sample: {
      active: true,
      reasonCode: "compliance_hold",
      sourceIncidentId: null,
      expiresAt: "2026-05-27T10:00:00Z",
      liftedAt: null,
    },
    consume: (value) =>
      `${value.active}:${value.reasonCode}:${value.sourceIncidentId ?? "none"}:${value.liftedAt ?? "active"}`,
    expectedConsumption: "true:compliance_hold:none:active",
  },
  {
    name: "manual ops hold that was lifted",
    surface: "driver history chip",
    sample: {
      active: false,
      reasonCode: "manual_ops_hold",
      sourceIncidentId: null,
      expiresAt: "2026-05-26T07:00:00Z",
      liftedAt: "2026-05-26T06:45:00Z",
    },
    consume: (value) =>
      `${value.active}:${value.reasonCode}:${value.sourceIncidentId ?? "none"}:${value.liftedAt ?? "active"}`,
    expectedConsumption: "false:manual_ops_hold:none:2026-05-26T06:45:00Z",
  },
];

const readinessCases: readonly ContractCase<TenantIntegrationReadinessSummary>[] =
  [
    {
      name: "minimal readiness summary",
      surface: "tenant governance overview card",
      sample: {
        tenantId: "tenant-001",
        items: [
          {
            subSystem: "api_keys",
            status: "ready",
          },
        ],
        computedAt: "2026-05-26T09:00:00Z",
      },
      consume: (value) =>
        `${value.tenantId}:${value.items.length}:${value.items
          .map((item) => `${item.subSystem}:${item.status}`)
          .join(",")}`,
      expectedConsumption: "tenant-001:1:api_keys:ready",
    },
    {
      name: "maximal readiness summary across all subsystems",
      surface: "tenant integration governance table",
      sample: {
        tenantId: "tenant-777",
        items: [
          {
            subSystem: "api_keys",
            status: "ready",
            detail: "Primary and rollback keys are present.",
          },
          {
            subSystem: "webhooks",
            status: "partial",
            detail: "One destination still points to staging.",
            nextAction: {
              action: "rotate_webhook_destination",
              enabled: true,
              riskLevel: "medium",
            },
          },
          {
            subSystem: "notifications",
            status: "not_provisioned",
            detail: "No notification routing policy exists yet.",
            nextAction: {
              action: "create_notification_route",
              enabled: true,
              riskLevel: "low",
            },
          },
          {
            subSystem: "sla",
            status: "blocked",
            detail: "Legal sign-off is still pending.",
            nextAction: {
              action: "request_sla_approval",
              enabled: false,
              disabledReasonCode: "awaiting_legal_review",
              riskLevel: "medium",
            },
          },
          {
            subSystem: "reports",
            status: "ready",
            detail: "Monthly export jobs are scheduled.",
          },
          {
            subSystem: "modules",
            status: "partial",
            detail: "One optional module is disabled for pilot.",
          },
          {
            subSystem: "partner_entries",
            status: "blocked",
            detail: "Partner cutover window not approved.",
            nextAction: {
              action: "request_partner_cutover",
              enabled: true,
              requiresReason: true,
              riskLevel: "high",
            },
          },
        ],
        computedAt: "2026-05-26T09:05:00Z",
      },
      consume: (value) =>
        `${value.items.filter((item) => item.status === "blocked").length}:${value.items
          .map((item) => item.subSystem)
          .join(",")}`,
      expectedConsumption:
        "2:api_keys,webhooks,notifications,sla,reports,modules,partner_entries",
    },
  ];

const rolloutCases: readonly ContractCase<TenantRolloutStateMachineRecord>[] = [
  {
    name: "sandbox pending stage",
    surface: "tenant governance stage chip",
    sample: {
      tenantId: "tenant-101",
      stage: "sandbox",
      gateStatus: "pending",
      cutoverOwnerUserId: null,
      cutoverOwnerDisplayName: null,
      rollbackOwnerUserId: null,
      rollbackOwnerDisplayName: null,
      rollbackPrepared: false,
      enteredStageAt: "2026-05-20T08:00:00Z",
      enteredGateAt: "2026-05-20T08:00:00Z",
      lastUpdatedBy: "usr-platform-1",
      lastUpdatedAt: "2026-05-26T09:10:00Z",
      availableActions: [],
    },
    consume: (value) =>
      `${value.stage}:${value.gateStatus}:${value.availableActions.length}:${value.rollbackPrepared}`,
    expectedConsumption: "sandbox:pending:0:false",
  },
  {
    name: "pilot ready stage",
    surface: "pilot approval rail",
    sample: {
      tenantId: "tenant-102",
      stage: "pilot",
      gateStatus: "ready",
      cutoverOwnerUserId: "usr-platform-2",
      cutoverOwnerDisplayName: "Avery Chen",
      rollbackOwnerUserId: null,
      rollbackOwnerDisplayName: null,
      rollbackPrepared: false,
      enteredStageAt: "2026-05-21T08:00:00Z",
      enteredGateAt: "2026-05-24T08:00:00Z",
      lastUpdatedBy: "usr-platform-2",
      lastUpdatedAt: "2026-05-26T09:12:00Z",
      availableActions: [
        {
          action: "approve_pilot",
          enabled: true,
          riskLevel: "medium",
        },
      ],
    },
    consume: (value) =>
      `${value.stage}:${value.gateStatus}:${value.availableActions.length}:${value.rollbackPrepared}`,
    expectedConsumption: "pilot:ready:1:false",
  },
  {
    name: "production approved stage",
    surface: "cutover owner summary",
    sample: {
      tenantId: "tenant-103",
      stage: "production",
      gateStatus: "approved",
      cutoverOwnerUserId: "usr-platform-3",
      cutoverOwnerDisplayName: "Morgan Patel",
      rollbackOwnerUserId: "usr-platform-4",
      rollbackOwnerDisplayName: "Jordan Lin",
      rollbackPrepared: true,
      enteredStageAt: "2026-05-22T08:00:00Z",
      enteredGateAt: "2026-05-25T08:00:00Z",
      lastUpdatedBy: "usr-platform-3",
      lastUpdatedAt: "2026-05-26T09:14:00Z",
      availableActions: [
        {
          action: "open_cutover_runbook",
          enabled: true,
          riskLevel: "low",
        },
      ],
    },
    consume: (value) =>
      `${value.stage}:${value.gateStatus}:${value.availableActions.length}:${value.rollbackPrepared}`,
    expectedConsumption: "production:approved:1:true",
  },
  {
    name: "rollback hold blocked stage",
    surface: "rollback hold banner",
    sample: {
      tenantId: "tenant-104",
      stage: "rollback_hold",
      gateStatus: "blocked",
      cutoverOwnerUserId: "usr-platform-5",
      cutoverOwnerDisplayName: "Kai Huang",
      rollbackOwnerUserId: "usr-platform-6",
      rollbackOwnerDisplayName: "Drew Park",
      rollbackPrepared: true,
      enteredStageAt: "2026-05-23T08:00:00Z",
      enteredGateAt: "2026-05-26T08:00:00Z",
      lastUpdatedBy: "usr-platform-6",
      lastUpdatedAt: "2026-05-26T09:16:00Z",
      availableActions: [
        {
          action: "release_rollback_hold",
          enabled: false,
          disabledReasonCode: "postmortem_pending",
          riskLevel: "high",
          requiresReason: true,
        },
      ],
    },
    consume: (value) =>
      `${value.stage}:${value.gateStatus}:${value.availableActions.length}:${value.rollbackPrepared}`,
    expectedConsumption: "rollback_hold:blocked:1:true",
  },
];

const refreshTiers: readonly RefreshTier[] = [
  "urgent",
  "fast",
  "dispatch",
  "medium",
  "medium_slow",
  "slow",
  "manual",
];

const expectedActorRealms: readonly UiActorRealm[] = [
  "platform",
  "ops",
  "tenant",
  "driver",
];
const expectedSeverities: readonly UiSeverity[] = [
  "info",
  "warning",
  "critical",
];
const expectedHealthStatuses = ["healthy", "degraded", "down"] as const;
const expectedHealthServiceSeverities = ["warning", "critical"] as const;
const expectedRefreshFreshnesses = [
  "fresh",
  "stale",
  "degraded",
  "unknown",
] as const;
const expectedRefreshSources = ["live", "cache", "sandbox", "static"] as const;
const expectedActionRiskLevels: readonly ActionRiskLevel[] = [
  "low",
  "medium",
  "high",
];
const expectedEmptyReasons: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "driver_not_eligible",
  "filtered_empty",
];
const expectedReceiptStatuses = ["accepted", "completed", "failed"] as const;
const expectedTargetApps = [
  "ops-console",
  "platform-admin",
  "tenant-console",
] as const;
const expectedOpenModes = ["new_tab", "same_tab"] as const;
const expectedSuppressionReasons = [
  "incident",
  "compliance_hold",
  "manual_ops_hold",
] as const;
const expectedReadinessSubsystems = [
  "api_keys",
  "webhooks",
  "notifications",
  "sla",
  "reports",
  "modules",
  "partner_entries",
] as const;
const expectedReadinessStatuses = [
  "ready",
  "partial",
  "not_provisioned",
  "blocked",
] as const;
const expectedRolloutStages: readonly TenantRolloutStage[] = [
  "sandbox",
  "pilot",
  "production",
  "rollback_hold",
];
const expectedRolloutGateStatuses: readonly TenantRolloutGateStatus[] = [
  "pending",
  "ready",
  "approved",
  "blocked",
];

runContractCases("UiHealthEnvelope", healthCases);
runContractCases("UiRefreshMetadata", refreshCases);
runContractCases("ResourceActionDescriptor", actionCases);
runContractCases("EmptyStateEnvelope", emptyStateCases);
runContractCases("ActionReceipt", receiptCases);
runContractCases("CrossAppResourceLink", linkCases);
runContractCases("UserNotificationRecord", notificationCases);
runContractCases("SearchResultRecord", searchCases);
runContractCases("DriverOpsInstruction", instructionCases);
runContractCases("DriverMatchingSuppression", suppressionCases);
runContractCases("TenantIntegrationReadinessSummary", readinessCases);
runContractCases("TenantRolloutStateMachineRecord", rolloutCases);

describe("ui-runtime variant coverage", () => {
  it("round-trips every RefreshTier value", () => {
    const parsed = jsonRoundTrip(refreshTiers);

    expect(parsed).toEqual(refreshTiers);
    expect(parsed.join("|")).toBe(
      "urgent|fast|dispatch|medium|medium_slow|slow|manual",
    );
  });

  it("exercises every documented union and enum variant in ui-runtime", () => {
    expectVariants(
      "UiActorRealm",
      notificationCases.map(({ sample }) => sample.recipientRealm),
      expectedActorRealms,
    );
    expectVariants(
      "UiSeverity",
      notificationCases.map(({ sample }) => sample.severity),
      expectedSeverities,
    );
    expectVariants(
      "UiHealthEnvelope.status",
      healthCases.map(({ sample }) => sample.status),
      expectedHealthStatuses,
    );
    expectVariants(
      "UiHealthDegradedService.severity",
      healthCases.flatMap(({ sample }) =>
        sample.degradedServices.map((service) => service.severity),
      ),
      expectedHealthServiceSeverities,
    );
    expectVariants(
      "UiRefreshMetadata.dataFreshness",
      refreshCases.map(({ sample }) => sample.dataFreshness),
      expectedRefreshFreshnesses,
    );
    expectVariants(
      "UiRefreshMetadata.source",
      refreshCases.map(({ sample }) => sample.source),
      expectedRefreshSources,
    );
    expectVariants("RefreshTier", refreshTiers, refreshTiers);
    expectVariants(
      "ActionRiskLevel",
      [
        ...actionCases.map(({ sample }) => sample.riskLevel),
        ...emptyStateCases.flatMap(({ sample }) =>
          sample.nextAction ? [sample.nextAction.riskLevel] : [],
        ),
        ...readinessCases.flatMap(({ sample }) =>
          sample.items.flatMap((item) =>
            item.nextAction ? [item.nextAction.riskLevel] : [],
          ),
        ),
        ...rolloutCases.flatMap(({ sample }) =>
          sample.availableActions.map((action) => action.riskLevel),
        ),
      ],
      expectedActionRiskLevels,
    );
    expectVariants(
      "EmptyReason",
      emptyStateCases.map(({ sample }) => sample.reason),
      expectedEmptyReasons,
    );
    expectVariants(
      "ActionReceipt.status",
      receiptCases.map(({ sample }) => sample.status),
      expectedReceiptStatuses,
    );
    expectVariants(
      "CrossAppResourceLink.targetApp",
      [
        ...linkCases.map(({ sample }) => sample.targetApp),
        ...notificationCases.flatMap(({ sample }) =>
          sample.resourceLink ? [sample.resourceLink.targetApp] : [],
        ),
        ...searchCases.map(({ sample }) => sample.link.targetApp),
      ],
      expectedTargetApps,
    );
    expectVariants(
      "CrossAppResourceLink.openMode",
      [
        ...linkCases.map(({ sample }) => sample.openMode),
        ...notificationCases.flatMap(({ sample }) =>
          sample.resourceLink ? [sample.resourceLink.openMode] : [],
        ),
        ...searchCases.map(({ sample }) => sample.link.openMode),
      ],
      expectedOpenModes,
    );
    expectVariants(
      "DriverMatchingSuppression.reasonCode",
      suppressionCases.map(({ sample }) => sample.reasonCode),
      expectedSuppressionReasons,
    );
    expectVariants(
      "TenantIntegrationReadinessItem.subSystem",
      readinessCases.flatMap(({ sample }) =>
        sample.items.map((item) => item.subSystem),
      ),
      expectedReadinessSubsystems,
    );
    expectVariants(
      "TenantIntegrationReadinessItem.status",
      readinessCases.flatMap(({ sample }) =>
        sample.items.map((item) => item.status),
      ),
      expectedReadinessStatuses,
    );
    expectVariants(
      "TenantRolloutStage",
      rolloutCases.map(({ sample }) => sample.stage),
      expectedRolloutStages,
    );
    expectVariants(
      "TenantRolloutGateStatus",
      rolloutCases.map(({ sample }) => sample.gateStatus),
      expectedRolloutGateStatuses,
    );
  });
});
