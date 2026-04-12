import type {
  DispatchSemantics,
  FoundationModuleStatus,
  FutureServiceBucket,
  OrderDomain,
  Phase1ServiceBucket,
  SupervisorExecutionMode,
  BusinessDispatchSubtype,
} from "@drts/contracts";

export const EXECUTION_MODE: SupervisorExecutionMode =
  "supervisor_managed_execution";

export const ORDER_DOMAIN_VALUES: readonly OrderDomain[] = [
  "owned",
  "forwarded",
];

export const PHASE1_SERVICE_BUCKET_VALUES: readonly Phase1ServiceBucket[] = [
  "standard_taxi",
  "business_dispatch",
];

export const FUTURE_SERVICE_BUCKET_VALUES: readonly FutureServiceBucket[] = [
  "av_pilot",
];

export const DISPATCH_SEMANTIC_VALUES: readonly DispatchSemantics[] = [
  "realtime",
  "reservation",
  "queue",
  "forwarder_broadcast",
];

export const BUSINESS_DISPATCH_SUBTYPE_VALUES: readonly BusinessDispatchSubtype[] =
  ["credit_card_airport_transfer", "enterprise_dispatch"];

export const FOUNDATION_MODULE_STATUSES: readonly FoundationModuleStatus[] = [
  {
    name: "identity",
    stage: "scaffolded",
    notes: [
      "Bootstrap identity context is available for platform, tenant, ops, and system actors.",
      "Real auth, session, and RBAC enforcement still need deeper implementation.",
    ],
  },
  {
    name: "tenant-partner",
    stage: "scaffolded",
    notes: [
      "Tenant, partner, site, and call-point roots are reserved.",
      "Source of truth stays with the future tenant-partner service slice.",
    ],
  },
  {
    name: "regulatory-registry",
    stage: "scaffolded",
    notes: [
      "Vehicle, driver, qualification, and placard-related registry entities are mapped.",
      "Bootstrap sources point to the extracted migration bundle and CSV templates.",
    ],
  },
  {
    name: "product-rule",
    stage: "scaffolded",
    notes: [
      "Phase 1 formal service buckets remain standard_taxi and business_dispatch.",
      "av_pilot stays future-only and is not activated in the foundation catalog.",
    ],
  },
  {
    name: "audit-notification",
    stage: "in_progress",
    notes: [
      "Append-only audit listing and notification read endpoints are live.",
      "Webhook delivery and retry policy remain future implementation work.",
    ],
  },
];

export const CANONICAL_HARD_RULES = [
  "owned and forwarded stay separated.",
  "Phase 1 formal service buckets are standard_taxi and business_dispatch.",
  "av_pilot remains future-only.",
  "audit logs are append-only.",
  "complaint_case, incident, notification, and audit_log are distinct concepts.",
] as const;
