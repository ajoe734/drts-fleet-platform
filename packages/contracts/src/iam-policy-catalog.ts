export const IAM_POLICY_CATALOG_VERSION = "2026-08-01.rbac-001" as const;

export const IAM_ACTOR_TYPES = [
  "system",
  "platform_admin",
  "tenant_admin",
  "ops_user",
  "driver_user",
  "partner_api_key",
  "referral_passenger",
] as const;

export type IamActorType = (typeof IAM_ACTOR_TYPES)[number];

export const IAM_REALMS = [
  "system",
  "platform",
  "tenant",
  "ops",
  "driver",
  "partner",
] as const;

export type IamRealm = (typeof IAM_REALMS)[number];

export const IAM_ROLE_FAMILIES = [
  "platform",
  "tenant",
  "ops",
  "driver",
  "partner",
] as const;

export type IamRoleFamily = (typeof IAM_ROLE_FAMILIES)[number];

export const IAM_RESOURCE_CONSTRAINT_KINDS = [
  "tenant",
  "partner",
  "partner_entry",
  "driver",
  "actor",
  "object",
] as const;

export type IamResourceConstraintKind =
  (typeof IAM_RESOURCE_CONSTRAINT_KINDS)[number];

export interface IamResourceConstraint {
  kind: IamResourceConstraintKind;
  claimKey: string;
  description: string;
}

export interface IamScopeDefinition {
  scope: string;
  allowedRealms: readonly IamRealm[];
  description: string;
  resourceConstraints: readonly IamResourceConstraint[];
  impliedScopes?: readonly string[];
  deprecatedAliasFor?: readonly string[];
}

export interface IamActorPolicyDefinition {
  actorType: IamActorType;
  realm: IamRealm;
  roleFamilies: readonly IamRoleFamily[];
  defaultRoles: readonly string[];
  scopes: readonly string[];
}

export interface IamTenantRolePolicyDefinition {
  roleCode: string;
  roleFamily: "tenant";
  scopes: readonly string[];
}

const TENANT_CONSTRAINT: IamResourceConstraint = {
  kind: "tenant",
  claimKey: "tenantId",
  description: "Must stay within the resolved tenant boundary.",
};

const PARTNER_CONSTRAINT: IamResourceConstraint = {
  kind: "partner",
  claimKey: "partnerId",
  description: "Must stay within the resolved partner boundary.",
};

const PARTNER_ENTRY_CONSTRAINT: IamResourceConstraint = {
  kind: "partner_entry",
  claimKey: "partnerEntrySlug",
  description: "Must stay within the resolved partner entry boundary.",
};

const DRIVER_CONSTRAINT: IamResourceConstraint = {
  kind: "driver",
  claimKey: "actorId",
  description: "Must stay within the bound driver identity or assignment.",
};

const ACTOR_CONSTRAINT: IamResourceConstraint = {
  kind: "actor",
  claimKey: "actorId",
  description: "Must stay within the caller's actor-owned records.",
};

const OBJECT_CONSTRAINT: IamResourceConstraint = {
  kind: "object",
  claimKey: "resourceId",
  description: "Requires an object-level ownership or assignment check.",
};

const SANDBOX_COMPLIANCE_SCOPES = [
  "sandbox.compliance.read",
  "sandbox.compliance.manage",
  "sandbox.investigation.read",
  "sandbox.investigation.manage",
  "sandbox.evidence.preview",
  "sandbox.evidence.export.request",
  "sandbox.evidence.export.approve",
  "sandbox.legal_hold.place",
  "sandbox.legal_hold.release.request",
  "sandbox.legal_hold.release.approve",
  "sandbox.regulatory_report.review",
  "sandbox.regulatory_report.submit",
] as const;

const MULTI_TAXI_RATING_GOVERNANCE_SCOPES = [
  "multi_taxi_ratings:read",
  "multi_taxi_ratings:moderate",
] as const;

const MULTI_TAXI_RECORD_GOVERNANCE_SCOPES = [
  "multi_taxi_records:read",
  "multi_taxi_records:export",
] as const;

const IDENTITY_BREAK_GLASS_SCOPES = [
  "identity:break-glass:request",
  "identity:break-glass:approve",
  "identity:break-glass:activate",
] as const;

const ASSISTANT_SCOPES = ["assistant:write"] as const;

export const IAM_SCOPE_DEFINITIONS: readonly IamScopeDefinition[] = [
  {
    scope: "identity:read",
    allowedRealms: ["system", "platform", "tenant", "ops"],
    description:
      "Migration alias for bounded identity visibility without mutation or export.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      ACTOR_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
    impliedScopes: [
      "identity:users:read",
      "identity:roles:read",
      "identity:sessions:read",
    ],
  },
  {
    scope: "identity:users:read",
    allowedRealms: ["system", "platform", "tenant", "ops"],
    description: "Read user identities within the resolved authority boundary.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      ACTOR_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "identity:roles:read",
    allowedRealms: ["system", "platform", "tenant", "ops"],
    description:
      "Read assignable roles within the resolved authority boundary.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "identity:sessions:read",
    allowedRealms: ["system", "platform", "tenant", "ops"],
    description: "Read active session inventory within the resolved boundary.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      ACTOR_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "identity:sessions:write",
    allowedRealms: ["system", "platform", "tenant", "ops"],
    description:
      "Revoke active sessions within the resolved authority boundary.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      ACTOR_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "foundation:read",
    allowedRealms: ["system", "platform", "ops"],
    description: "Read platform foundation configuration and master data.",
    resourceConstraints: [OBJECT_CONSTRAINT],
  },
  {
    scope: "foundation:write",
    allowedRealms: ["system", "platform", "ops"],
    description: "Mutate platform foundation configuration and master data.",
    resourceConstraints: [OBJECT_CONSTRAINT],
  },
  {
    scope: "audit:read",
    allowedRealms: ["system", "platform", "tenant", "ops"],
    description: "Read audit trails within the caller boundary.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "notifications:read",
    allowedRealms: ["system", "platform", "ops"],
    description: "Read notification inbox data.",
    resourceConstraints: [ACTOR_CONSTRAINT],
  },
  {
    scope: "notifications:write",
    allowedRealms: ["system", "platform", "ops", "driver"],
    description: "Mutate notification inbox data.",
    resourceConstraints: [ACTOR_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "tenant:read",
    allowedRealms: ["system", "platform", "tenant", "ops"],
    description: "Read tenant-scoped operational data.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "tenant:write",
    allowedRealms: ["system", "platform", "tenant"],
    description: "Mutate tenant-scoped operational data.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "tenant:webhooks:read",
    allowedRealms: ["system", "platform", "tenant"],
    description: "Read tenant webhook configuration and delivery state.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "tenant:webhooks:write",
    allowedRealms: ["system", "platform", "tenant"],
    description: "Mutate tenant webhook configuration and delivery state.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "tenant:sla:read",
    allowedRealms: ["system", "platform", "tenant"],
    description: "Read tenant SLA and governance profile data.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "tenant:sla:write",
    allowedRealms: ["system", "platform", "tenant"],
    description: "Mutate tenant SLA and governance profile data.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "tenant:billing:read",
    allowedRealms: ["system", "platform", "tenant"],
    description: "Read tenant billing and invoice data.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "tenant:billing:write",
    allowedRealms: ["system", "platform", "tenant"],
    description: "Mutate tenant billing and invoice data.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "billing:read",
    allowedRealms: ["system", "platform", "tenant", "ops", "partner"],
    description: "Read billing and settlement data within the caller boundary.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      PARTNER_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "billing:write",
    allowedRealms: ["system", "platform", "tenant", "ops"],
    description:
      "Mutate billing and settlement data within the caller boundary.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "regulatory:read",
    allowedRealms: ["system", "platform", "ops"],
    description: "Read regulatory cases and filing state.",
    resourceConstraints: [OBJECT_CONSTRAINT],
  },
  {
    scope: "regulatory:write",
    allowedRealms: ["system", "platform", "ops"],
    description: "Mutate regulatory cases and filing state.",
    resourceConstraints: [OBJECT_CONSTRAINT],
  },
  {
    scope: "callcenter:read",
    allowedRealms: ["system", "ops"],
    description: "Read callcenter operations data.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "callcenter:write",
    allowedRealms: ["system", "ops"],
    description: "Mutate callcenter operations data.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "complaints:read",
    allowedRealms: ["system", "ops"],
    description: "Read complaint case data.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "complaints:write",
    allowedRealms: ["system", "ops"],
    description: "Mutate complaint case data.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "incident:read",
    allowedRealms: ["system", "platform", "ops"],
    description: "Read incident and SOS data.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      DRIVER_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "incident:write",
    allowedRealms: ["system", "platform", "ops", "driver"],
    description: "Mutate incident and SOS data.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      DRIVER_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "maintenance:read",
    allowedRealms: ["system", "platform", "ops"],
    description: "Read maintenance operations data.",
    resourceConstraints: [OBJECT_CONSTRAINT],
  },
  {
    scope: "maintenance:write",
    allowedRealms: ["system", "platform", "ops"],
    description: "Mutate maintenance operations data.",
    resourceConstraints: [OBJECT_CONSTRAINT],
  },
  {
    scope: "owned:read",
    allowedRealms: ["system", "ops", "driver"],
    description: "Read owned-mobility records within assignment bounds.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      DRIVER_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "owned:write",
    allowedRealms: ["system", "ops", "driver"],
    description: "Mutate owned-mobility records within assignment bounds.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      DRIVER_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "dispatch:read",
    allowedRealms: ["system", "platform", "ops", "driver"],
    description: "Read dispatch data within assignment bounds.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      DRIVER_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "dispatch:write",
    allowedRealms: ["system", "platform", "ops", "driver"],
    description: "Mutate dispatch data within assignment bounds.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      DRIVER_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "driver:read",
    allowedRealms: ["system", "platform", "ops", "driver"],
    description: "Read driver profile and task state.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      DRIVER_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "driver:write",
    allowedRealms: ["system", "driver"],
    description: "Mutate driver profile and device-bound state.",
    resourceConstraints: [DRIVER_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "reports:read",
    allowedRealms: ["system", "platform", "tenant", "ops"],
    description: "Read reporting jobs and generated artifacts.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "reports:write",
    allowedRealms: ["system", "platform", "tenant", "ops"],
    description: "Mutate reporting jobs and generated artifacts.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT],
  },
  {
    scope: "forwarder:read",
    allowedRealms: ["system", "platform", "ops"],
    description: "Read forwarder adapter and integration health data.",
    resourceConstraints: [OBJECT_CONSTRAINT],
  },
  {
    scope: "forwarder:write",
    allowedRealms: ["system", "ops"],
    description: "Mutate forwarder adapter operational state.",
    resourceConstraints: [OBJECT_CONSTRAINT],
  },
  ...SANDBOX_COMPLIANCE_SCOPES.map((scope) => ({
    scope,
    allowedRealms: ["system", "platform", "ops"] as const,
    description: "Sandbox compliance and regulator workflow control.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT] as const,
  })),
  ...MULTI_TAXI_RATING_GOVERNANCE_SCOPES.map((scope) => ({
    scope,
    allowedRealms: ["system", "platform"] as const,
    description: "Multi-taxi rating governance access.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT] as const,
  })),
  ...MULTI_TAXI_RECORD_GOVERNANCE_SCOPES.map((scope) => ({
    scope,
    allowedRealms: ["system", "platform"] as const,
    description:
      "Multi-taxi P5 canonical operational-record read and controlled export.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT] as const,
  })),
  {
    scope: "assistant:write",
    allowedRealms: ["system", "platform", "tenant", "ops"] as const,
    description: "Interact with the operational assistant and propose actions.",
    resourceConstraints: [TENANT_CONSTRAINT, OBJECT_CONSTRAINT] as const,
  },
  {
    scope: "identity:break-glass:request",
    allowedRealms: ["system", "platform", "ops"] as const,
    description: "Submit an emergency break-glass elevation request.",
    resourceConstraints: [ACTOR_CONSTRAINT, OBJECT_CONSTRAINT] as const,
  },
  {
    scope: "identity:break-glass:approve",
    allowedRealms: ["system", "platform", "ops"] as const,
    description:
      "Review and approve an emergency break-glass elevation request.",
    resourceConstraints: [ACTOR_CONSTRAINT, OBJECT_CONSTRAINT] as const,
  },
  {
    scope: "identity:break-glass:activate",
    allowedRealms: ["system", "platform", "ops"] as const,
    description:
      "Activate or close an approved emergency break-glass elevation session.",
    resourceConstraints: [ACTOR_CONSTRAINT, OBJECT_CONSTRAINT] as const,
  },
  {
    scope: "partner:entries:read",
    allowedRealms: ["partner"],
    description: "Read partner entry configuration.",
    resourceConstraints: [
      PARTNER_CONSTRAINT,
      PARTNER_ENTRY_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "partner:eligibility:read",
    allowedRealms: ["partner"],
    description: "Read partner eligibility verification state.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      PARTNER_CONSTRAINT,
      PARTNER_ENTRY_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "partner:eligibility:write",
    allowedRealms: ["partner"],
    description: "Create or mutate partner eligibility verification state.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      PARTNER_CONSTRAINT,
      PARTNER_ENTRY_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "partner:handoff",
    allowedRealms: ["partner"],
    description: "Use a referral handoff session for a single entry boundary.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      PARTNER_ENTRY_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    scope: "partner:book",
    allowedRealms: ["partner"],
    description:
      "Create and view partner-scoped bookings for one entry boundary.",
    resourceConstraints: [
      TENANT_CONSTRAINT,
      PARTNER_CONSTRAINT,
      PARTNER_ENTRY_CONSTRAINT,
      OBJECT_CONSTRAINT,
    ],
  },
  {
    // UV-EXEC-003 / SD §4.2: gates the *first* stage of the two-stage voice
    // identity exchange. Only a workload service principal already holding
    // this scope may exchange itself for a short-lived, session-scoped
    // voice-tool-gateway capability token (see VoiceCapabilityService). It
    // does not grant any voice tool action itself -- those are the separate
    // VOICE_CAPABILITY_SCOPES minted onto the exchanged token.
    scope: "voice:capability:issue",
    allowedRealms: ["system"],
    description:
      "Exchange an authenticated workload service principal for a short-lived voice-tool-gateway session capability token.",
    resourceConstraints: [ACTOR_CONSTRAINT],
  },
];

export const IAM_SCOPE_DEFINITION_BY_SCOPE = new Map(
  IAM_SCOPE_DEFINITIONS.map((definition) => [definition.scope, definition]),
);

export const IAM_ACTOR_POLICY_DEFINITIONS: readonly IamActorPolicyDefinition[] =
  [
    {
      actorType: "system",
      realm: "system",
      roleFamilies: [],
      defaultRoles: [],
      scopes: [
        "identity:read",
        "identity:sessions:read",
        "identity:sessions:write",
        "foundation:read",
        "foundation:write",
        "audit:read",
        "notifications:read",
        "notifications:write",
        "tenant:read",
        "tenant:write",
        "tenant:webhooks:read",
        "tenant:webhooks:write",
        "tenant:sla:read",
        "tenant:sla:write",
        "tenant:billing:read",
        "tenant:billing:write",
        "billing:read",
        "billing:write",
        "regulatory:read",
        "regulatory:write",
        "callcenter:read",
        "callcenter:write",
        "complaints:read",
        "complaints:write",
        "incident:read",
        "incident:write",
        "maintenance:read",
        "maintenance:write",
        "owned:read",
        "owned:write",
        "dispatch:read",
        "dispatch:write",
        "driver:read",
        "driver:write",
        "reports:read",
        "reports:write",
        "forwarder:read",
        "forwarder:write",
        "voice:capability:issue",
        ...SANDBOX_COMPLIANCE_SCOPES,
        ...MULTI_TAXI_RATING_GOVERNANCE_SCOPES,
        ...MULTI_TAXI_RECORD_GOVERNANCE_SCOPES,
        ...IDENTITY_BREAK_GLASS_SCOPES,
        ...ASSISTANT_SCOPES,
      ],
    },
    {
      actorType: "platform_admin",
      realm: "platform",
      roleFamilies: ["platform"],
      defaultRoles: ["platform_admin"],
      scopes: [
        "identity:read",
        "identity:sessions:read",
        "identity:sessions:write",
        "foundation:read",
        "foundation:write",
        "audit:read",
        "notifications:read",
        "notifications:write",
        "tenant:read",
        "tenant:write",
        "tenant:webhooks:read",
        "tenant:webhooks:write",
        "tenant:sla:read",
        "tenant:sla:write",
        "tenant:billing:read",
        "tenant:billing:write",
        "billing:read",
        "billing:write",
        "regulatory:read",
        "regulatory:write",
        "incident:read",
        "incident:write",
        "maintenance:read",
        "maintenance:write",
        "reports:read",
        "reports:write",
        "forwarder:read",
        ...SANDBOX_COMPLIANCE_SCOPES,
        ...MULTI_TAXI_RATING_GOVERNANCE_SCOPES,
        ...MULTI_TAXI_RECORD_GOVERNANCE_SCOPES,
        ...IDENTITY_BREAK_GLASS_SCOPES,
      ],
    },
    {
      actorType: "tenant_admin",
      realm: "tenant",
      roleFamilies: ["tenant"],
      defaultRoles: ["tenant_admin"],
      scopes: [
        "identity:read",
        "identity:sessions:read",
        "identity:sessions:write",
        "audit:read",
        "tenant:read",
        "tenant:write",
        "tenant:webhooks:read",
        "tenant:webhooks:write",
        "tenant:sla:read",
        "tenant:sla:write",
        "tenant:billing:read",
        "tenant:billing:write",
        "billing:read",
        "billing:write",
        "reports:read",
        "reports:write",
      ],
    },
    {
      actorType: "ops_user",
      realm: "ops",
      roleFamilies: ["ops"],
      defaultRoles: ["ops_user"],
      scopes: [
        "identity:read",
        "audit:read",
        "notifications:read",
        "notifications:write",
        "regulatory:read",
        "regulatory:write",
        "callcenter:read",
        "callcenter:write",
        "complaints:read",
        "complaints:write",
        "incident:read",
        "incident:write",
        "maintenance:read",
        "maintenance:write",
        "owned:read",
        "owned:write",
        "dispatch:read",
        "dispatch:write",
        "driver:read",
        "billing:read",
        "billing:write",
        "reports:read",
        "reports:write",
        "forwarder:read",
        "forwarder:write",
        "sandbox.compliance.read",
        "sandbox.investigation.read",
        "sandbox.evidence.preview",
        ...ASSISTANT_SCOPES,
      ],
    },
    {
      actorType: "driver_user",
      realm: "driver",
      roleFamilies: ["driver"],
      defaultRoles: ["driver_user"],
      scopes: [
        "owned:read",
        "driver:read",
        "driver:write",
        "dispatch:read",
        "incident:write",
        "notifications:write",
      ],
    },
    {
      actorType: "partner_api_key",
      realm: "partner",
      roleFamilies: ["partner"],
      defaultRoles: ["partner_api_key"],
      scopes: [
        "partner:entries:read",
        "partner:eligibility:read",
        "partner:eligibility:write",
      ],
    },
    {
      actorType: "referral_passenger",
      realm: "partner",
      roleFamilies: ["partner"],
      defaultRoles: ["referral_passenger"],
      scopes: [
        "partner:handoff",
        "partner:eligibility:read",
        "partner:eligibility:write",
        "partner:book",
      ],
    },
  ];

export const IAM_ACTOR_POLICY_BY_TYPE = new Map(
  IAM_ACTOR_POLICY_DEFINITIONS.map((definition) => [
    definition.actorType,
    definition,
  ]),
);

export const IAM_TENANT_ROLE_POLICY_DEFINITIONS: readonly IamTenantRolePolicyDefinition[] =
  [
    {
      roleCode: "tenant_admin",
      roleFamily: "tenant",
      scopes: [
        "identity:read",
        "identity:sessions:read",
        "identity:sessions:write",
        "audit:read",
        "tenant:read",
        "tenant:write",
        "tenant:webhooks:read",
        "tenant:webhooks:write",
        "tenant:sla:read",
        "tenant:sla:write",
        "tenant:billing:read",
        "tenant:billing:write",
        "reports:read",
        "reports:write",
      ],
    },
    {
      roleCode: "tenant_ops_admin",
      roleFamily: "tenant",
      scopes: [
        "identity:read",
        "audit:read",
        "tenant:read",
        "tenant:write",
        "tenant:webhooks:read",
        "tenant:webhooks:write",
        "tenant:sla:read",
        "tenant:sla:write",
        "tenant:billing:read",
        "owned:read",
        "owned:write",
        "reports:read",
        "reports:write",
      ],
    },
    {
      roleCode: "tenant_finance_admin",
      roleFamily: "tenant",
      scopes: [
        "identity:read",
        "audit:read",
        "tenant:read",
        "tenant:webhooks:read",
        "tenant:sla:read",
        "tenant:billing:read",
        "tenant:billing:write",
        "reports:read",
        "reports:write",
      ],
    },
    {
      roleCode: "tenant_viewer",
      roleFamily: "tenant",
      scopes: [
        "identity:read",
        "audit:read",
        "tenant:read",
        "tenant:webhooks:read",
        "tenant:sla:read",
        "tenant:billing:read",
        "reports:read",
      ],
    },
  ];

export const IAM_TENANT_ROLE_POLICY_BY_CODE = new Map(
  IAM_TENANT_ROLE_POLICY_DEFINITIONS.map((definition) => [
    definition.roleCode,
    definition,
  ]),
);

export function getIamScopeDefinition(
  scope: string,
): IamScopeDefinition | null {
  return IAM_SCOPE_DEFINITION_BY_SCOPE.get(scope) ?? null;
}

export function isKnownIamScope(scope: string): boolean {
  return IAM_SCOPE_DEFINITION_BY_SCOPE.has(scope);
}

export function getIamActorPolicy(
  actorType: IamActorType,
): IamActorPolicyDefinition {
  const definition = IAM_ACTOR_POLICY_BY_TYPE.get(actorType);
  if (!definition) {
    throw new Error(`Unknown IAM actor type '${actorType}'.`);
  }
  return definition;
}

export function getIamActorScopePreset(
  actorType: IamActorType,
): readonly string[] {
  return getIamActorPolicy(actorType).scopes;
}

export function getIamActorScopePresets(): Record<
  IamActorType,
  readonly string[]
> {
  return Object.fromEntries(
    IAM_ACTOR_POLICY_DEFINITIONS.map((definition) => [
      definition.actorType,
      definition.scopes,
    ]),
  ) as Record<IamActorType, readonly string[]>;
}

export function getIamTenantRolePolicy(
  roleCode: string,
): IamTenantRolePolicyDefinition | null {
  return IAM_TENANT_ROLE_POLICY_BY_CODE.get(roleCode) ?? null;
}

export function getIamTenantRoleScopePresets(): Record<
  string,
  readonly string[]
> {
  return Object.fromEntries(
    IAM_TENANT_ROLE_POLICY_DEFINITIONS.map((definition) => [
      definition.roleCode,
      definition.scopes,
    ]),
  );
}

export function getIamTenantRoleScopes(
  roleCode: string,
): readonly string[] | null {
  return getIamTenantRolePolicy(roleCode)?.scopes ?? null;
}
