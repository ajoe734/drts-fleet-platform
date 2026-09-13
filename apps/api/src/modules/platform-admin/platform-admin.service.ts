import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import {
  AdapterType,
  CredentialStatus,
  Environment,
  FinanceAuthorityMode,
  RolloutStatus,
} from "@drts/contracts";
import type {
  AdapterCredentialExpiry,
  AdapterCredentialExpiryWarning,
  AuditLogRecord,
  CanonicalAccountStatus,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
  CreatePlatformPricingRuleCommand,
  CreatePlatformAdminUserCommand,
  CreatePlatformNoticeCommand,
  CreatePublicInfoVersionCommand,
  CredentialExpiryWarningState,
  GeneratePlacardVersionCommand,
  PlacardVersionRecord,
  PlatformAdapter,
  PlatformAdapterAuditEvidence,
  PlatformAdminUserRecord,
  PlatformAdminUserRole,
  PlatformAdminUserStatus,
  PlatformMaintenanceModeRecord,
  PlatformNoticeRecord,
  PlatformPricingRuleRecord,
  PublishPlacardVersionCommand,
  PublishPlatformPricingRuleCommand,
  PublishPublicInfoVersionCommand,
  PublicInfoVersionRecord,
  SetPlatformMaintenanceModeCommand,
  TenantInvoiceRecord,
  UpdatePlatformAdapterCommand,
  UpdatePlatformAdminUserRoleCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  DEFAULT_CONTROLLED_DOWNLOAD_HOST,
  DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
  DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
  DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION,
  DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES,
  createControlledDownloadMetadata,
  type ControlledDownloadMetadata,
} from "../../common/controlled-download";
import type { AuditedActionResult } from "../../common/action-receipt";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { IdentityRepository } from "../identity/identity.repository";
import {
  PlatformAdapterRevisionConflictError,
  PlatformAdminRepository,
  type PersistPlatformAdminChanges,
} from "./platform-admin.repository";

/**
 * Warning window for adapter credential expiry (SR-ADMIN-ADAPTER-001):
 * server-computed at read time, never persisted (schema-allocation.json
 * V0100 note). Replaces the previous UI-side fixed "expires in 6 days /
 * 2026-05-31" copy, which did not reflect any real adapter's credential
 * expiry.
 */
const CREDENTIAL_EXPIRY_WARNING_WINDOW_DAYS = 14;

const PUBLIC_INFO_SEED: PublicInfoVersionRecord[] = [
  {
    versionId: "public-info-demo-001",
    title: "2026 Q2 公開資訊版",
    callPhone: "0800-000-123",
    complaintPhone: "0800-000-456",
    callRateText: "依表計費",
    fareText: "夜間與偏遠加成依公告",
    paymentMethodText: "現金、信用卡、企業簽單",
    status: "published",
    effectiveFrom: "2026-04-01T00:00:00.000Z",
    effectiveTo: null,
    publishedBy: "platform-admin-demo-001",
    publishedAt: "2026-04-01T00:00:00.000Z",
    createdAt: "2026-03-25T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  },
];

const PLACARD_SEED: PlacardVersionRecord[] = [
  {
    placardVersionId: "placard-demo-001",
    versionCode: "placard-2026-q2",
    publicInfoVersionId: "public-info-demo-001",
    templateName: "seatback-default",
    artifactFileId: "artifact-demo-001",
    artifactManifestHash: null,
    artifactDownloadUrl: null,
    artifactExpiresAt: null,
    publishedAt: "2026-04-01T00:00:00.000Z",
    createdAt: "2026-03-25T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    downloadMetadata: null,
  },
];

const PLATFORM_ADAPTERS_SEED: PlatformAdapter[] = [
  {
    id: "owned-dispatch",
    platformCode: "DRTS",
    name: "DRTS Native Dispatch",
    description: "Fleet-owned booking and dispatch pipeline.",
    version: "1.0.0",
    environment: Environment.PRODUCTION,
    rolloutStage: Environment.PRODUCTION,
    adapterType: AdapterType.NATIVE,
    isForwarded: false,
    config: { isEnabled: true },
    rolloutStatus: RolloutStatus.COMPLETED,
    credentialStatus: CredentialStatus.VALID,
    webhookStatus: null,
    healthStatus: {
      lastCheckTimestamp: "2026-09-10T08:00:00.000Z",
      status: "HEALTHY",
      message: null,
    },
    policies: {
      serviceBuckets: ["standard", "accessible"],
      maxCandidates: 3,
      acceptTimeoutSeconds: 25,
      manualFallbackThresholdSeconds: 90,
      financeAuthorityMode: FinanceAuthorityMode.OWNED,
    },
    featureFlags: {
      driverSafeActions: true,
      proofRequired: false,
      manualFallback: true,
    },
    supportedActions: [
      { name: "accept", description: "Driver accepts a native task." },
      { name: "complete", description: "Driver closes owned trip workflow." },
      { name: "incident", description: "Driver raises safety incident." },
    ],
    revision: 1,
    credentialExpiry: null,
    lastMutationAudit: null,
    createdAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
  },
  {
    id: "cityride-forwarder",
    platformCode: "CITY",
    name: "CityRide Forwarded Orders",
    description:
      "External forwarded-order source with platform-owned fare authority.",
    version: "1.0.0",
    environment: Environment.PRODUCTION,
    rolloutStage: Environment.PRODUCTION,
    adapterType: AdapterType.EXTERNAL_COMBINED,
    isForwarded: true,
    config: { isEnabled: true },
    rolloutStatus: RolloutStatus.COMPLETED,
    credentialStatus: CredentialStatus.VALID,
    webhookStatus: {
      url: "https://cityride.example.com/webhooks/drts",
      isEnabled: true,
      lastEventTimestamp: "2026-09-10T07:45:00.000Z",
      lastStatus: "SUCCESS",
      lastStatusCode: "200",
    },
    healthStatus: {
      lastCheckTimestamp: "2026-09-10T08:00:00.000Z",
      status: "HEALTHY",
      message: null,
    },
    policies: {
      serviceBuckets: ["standard", "accessible"],
      maxCandidates: 3,
      acceptTimeoutSeconds: 25,
      manualFallbackThresholdSeconds: 90,
      financeAuthorityMode: FinanceAuthorityMode.EXTERNAL,
    },
    featureFlags: {
      driverSafeActions: true,
      proofRequired: true,
      manualFallback: true,
    },
    supportedActions: [
      { name: "accept", description: "Forward acceptance to CityRide." },
      {
        name: "reject",
        description: "Forward rejection reason to CityRide.",
      },
      {
        name: "proof_upload",
        description: "Upload completion proof for reconciliation.",
      },
    ],
    revision: 1,
    credentialExpiry: {
      reference: "cityride-oauth-client-2026-09",
      expiresAt: "2026-09-17T00:00:00.000Z",
    },
    lastMutationAudit: null,
    createdAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
  },
  {
    id: "grab_taiwan",
    platformCode: "grab_taiwan",
    name: "Grab Taiwan (Stub)",
    description:
      "Stub-only external forwarded adapter for local integration scaffolding.",
    version: "1.0.0",
    environment: Environment.SANDBOX,
    rolloutStage: Environment.SANDBOX,
    adapterType: AdapterType.EXTERNAL_REST,
    isForwarded: true,
    config: { isEnabled: false },
    rolloutStatus: RolloutStatus.NOT_STARTED,
    credentialStatus: CredentialStatus.NOT_CONFIGURED,
    webhookStatus: null,
    healthStatus: {
      lastCheckTimestamp: null,
      status: "DEGRADED",
      message:
        "Stub-only adapter; not approved for production live auth or callback governance.",
    },
    policies: {
      serviceBuckets: ["standard"],
      maxCandidates: 1,
      acceptTimeoutSeconds: 30,
      manualFallbackThresholdSeconds: 120,
      financeAuthorityMode: FinanceAuthorityMode.EXTERNAL,
    },
    featureFlags: {
      driverSafeActions: false,
      proofRequired: true,
      manualFallback: true,
    },
    supportedActions: [
      { name: "accept", description: "Stub accept for Grab Taiwan." },
      { name: "reject", description: "Stub reject for Grab Taiwan." },
    ],
    revision: 1,
    credentialExpiry: null,
    lastMutationAudit: null,
    createdAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
  },
];

const PLATFORM_ADMIN_USERS_SEED: PlatformAdminUserRecord[] = [
  {
    userId: "pa-admin-001",
    email: "admin@platform.drts",
    displayName: "Platform Superadmin",
    roleCode: "superadmin",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  },
  {
    userId: "pa-operator-001",
    email: "ops@platform.drts",
    displayName: "Ops Operator",
    roleCode: "operator",
    status: "active",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  },
];

const PLATFORM_NOTICES_SEED: PlatformNoticeRecord[] = [
  {
    noticeId: "notice-demo-001",
    title: "Scheduled Maintenance Window",
    body: "Platform will undergo maintenance from 02:00–04:00 on 2026-04-20. Brief service interruptions expected.",
    severity: "warning",
    status: "scheduled",
    targetAudience: "all",
    scheduledAt: "2026-04-20T02:00:00.000Z",
    resolvedAt: null,
    createdBy: "pa-admin-001",
    createdAt: "2026-04-15T00:00:00.000Z",
    updatedAt: "2026-04-15T00:00:00.000Z",
  },
];

const PLATFORM_PRICING_RULES_SEED: PlatformPricingRuleRecord[] = [
  {
    ruleId: "rule-demo-001",
    ruleName: "Standard Service Fee",
    version: "2026.04",
    serviceFeeBps: 1500,
    reimbursementMode: "platform_funded",
    applicableTo: "all",
    status: "active",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    publishedBy: "pa-admin-001",
    publishedAt: "2026-01-01T00:00:00.000Z",
    notes: "Baseline fee plan for platform-wide enterprise dispatch tenants.",
    createdAt: "2025-12-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  },
  {
    ruleId: "rule-demo-002",
    ruleName: "Enterprise Discount Tier",
    version: "2026.03",
    serviceFeeBps: 1000,
    reimbursementMode: "mixed",
    applicableTo: "t_demo",
    status: "active",
    effectiveFrom: "2026-03-01T00:00:00.000Z",
    effectiveTo: null,
    publishedBy: "pa-admin-001",
    publishedAt: "2026-03-01T00:00:00.000Z",
    notes: "Reduced fee schedule for the demo tenant enterprise program.",
    createdAt: "2026-02-15T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  },
];

const CONTROL_PLANE_SCOPE_REF = "platform:control_plane";
const CONTROL_PLANE_REALMS = ["platform", "ops"] as const;
const PLATFORM_ADMIN_PLACEHOLDER_ISSUER = "platform_admin_email";

type ControlPlaneRealm = (typeof CONTROL_PLANE_REALMS)[number];
type InternalPlatformUserRoleCode =
  | PlatformAdminUserRole
  | "platform_admin"
  | "ops_user";

type PlatformAdminUserSnapshot = {
  principal: CanonicalIdentityPrincipalRecord;
  membership: CanonicalIdentityMembershipRecord;
  roleBinding: CanonicalIdentityRoleBindingRecord;
  roleCode: PlatformAdminUserRole;
  status: PlatformAdminUserStatus;
};

@Injectable()
export class PlatformAdminService implements OnModuleInit {
  private publicInfoVersions = PUBLIC_INFO_SEED.map((version) =>
    this.clonePublicInfoVersion(version),
  );

  private placardVersions = PLACARD_SEED.map((placard) =>
    this.clonePlacardVersion(placard),
  );

  private adapters: PlatformAdapter[] = PLATFORM_ADAPTERS_SEED.map((adapter) =>
    this.clonePlatformAdapter(adapter),
  );

  private platformNotices: PlatformNoticeRecord[] = PLATFORM_NOTICES_SEED.map(
    (n) => ({ ...n }),
  );

  private maintenanceMode: PlatformMaintenanceModeRecord = {
    enabled: false,
    reason: null,
    scheduledStart: null,
    scheduledEnd: null,
    updatedBy: null,
    updatedAt: new Date().toISOString(),
  };

  private pricingRules: PlatformPricingRuleRecord[] =
    PLATFORM_PRICING_RULES_SEED.map((r) => ({ ...r }));

  private readonly placardDownloadHost = DEFAULT_CONTROLLED_DOWNLOAD_HOST;

  private readonly placardSigningKeyId = DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID;

  private readonly placardSigningSecret = DEFAULT_CONTROLLED_DOWNLOAD_SECRET;

  private readonly placardSignatureVersion =
    DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION;

  private readonly placardExpiryMinutes =
    DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES;

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional()
    private readonly platformAdminRepository?: PlatformAdminRepository,
    @Optional()
    private readonly identityRepository: IdentityRepository = new IdentityRepository(),
  ) {}

  async onModuleInit() {
    if (this.platformAdminRepository) {
      try {
        const persistedState = await this.platformAdminRepository.loadState();
        const persistedAdapters = persistedState.platformAdapters ?? [];
        const hasPersistedState =
          persistedState.publicInfoVersions.length > 0 ||
          persistedState.placardVersions.length > 0;

        if (!hasPersistedState) {
          this.persistChanges(
            {
              publicInfoVersions: this.publicInfoVersions.map((version) =>
                this.clonePublicInfoVersion(version),
              ),
              placardVersions: this.placardVersions.map((placard) =>
                this.clonePlacardVersion(placard),
              ),
            },
            "module init bootstrap",
          );
        } else {
          this.publicInfoVersions = persistedState.publicInfoVersions.map(
            (version) => this.clonePublicInfoVersion(version),
          );
          this.placardVersions = persistedState.placardVersions.map((placard) =>
            this.clonePlacardVersion(placard),
          );
        }

        if (persistedAdapters.length === 0) {
          this.persistChanges(
            {
              platformAdapters: this.adapters.map((adapter) =>
                this.clonePlatformAdapter(adapter),
              ),
            },
            "module init bootstrap adapters",
          );
        } else {
          this.adapters = persistedAdapters.map((adapter) =>
            this.clonePlatformAdapter(adapter),
          );
        }
      } catch (error) {
        this.platformAdminRepository.reportPersistenceFailure(
          error,
          "module init",
        );
      }
    }

    await this.bootstrapSeedPlatformAdminUsers();
  }

  listPublicInfoVersions() {
    return this.publicInfoVersions.map((version) =>
      this.clonePublicInfoVersion(version),
    );
  }

  createPublicInfoVersion(
    command: CreatePublicInfoVersionCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.title, "title");

    const now = new Date().toISOString();
    const version: PublicInfoVersionRecord = {
      versionId: `public_info_${randomUUID()}`,
      title: command.title.trim(),
      callPhone: this.normalizeNullableText(command.callPhone),
      complaintPhone: this.normalizeNullableText(command.complaintPhone),
      callRateText: this.normalizeNullableText(command.callRateText),
      fareText: this.normalizeNullableText(command.fareText),
      paymentMethodText: this.normalizeNullableText(command.paymentMethodText),
      status: "draft",
      effectiveFrom: this.normalizeNullableText(command.effectiveFrom),
      effectiveTo: this.normalizeNullableText(command.effectiveTo),
      publishedBy: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.publicInfoVersions = [
      this.clonePublicInfoVersion(version),
      ...this.publicInfoVersions,
    ];
    this.persistChanges(
      {
        publicInfoVersions: [this.clonePublicInfoVersion(version)],
      },
      "create_public_info_version",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "create_public_info_version",
        resourceType: "public_info_version",
        resourceId: version.versionId,
        newValuesSummary: {
          ...this.clonePublicInfoVersion(version),
        },
      },
      requestId,
    );

    return this.clonePublicInfoVersion(version);
  }

  publishPublicInfoVersion(
    versionId: string,
    command: PublishPublicInfoVersionCommand,
    requestId?: string,
    publisherActorId?: string | null,
  ) {
    const version = this.requirePublicInfoVersion(versionId);
    if (version.status !== "draft") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PUBLIC_INFO_VERSION_NOT_DRAFT",
        "Only draft public info versions can be published.",
        {
          versionId,
          status: version.status,
        },
      );
    }
    const publishedAt = new Date().toISOString();
    const publishedBy = this.requirePlatformAdminActorId(
      publisherActorId,
      "publish public info versions",
    );
    const previousPublished = this.publicInfoVersions.find(
      (candidate) =>
        candidate.status === "published" &&
        candidate.versionId !== version.versionId,
    );

    if (previousPublished) {
      previousPublished.status = "retired";
      previousPublished.effectiveTo = publishedAt;
      previousPublished.updatedAt = publishedAt;
    }

    version.status = "published";
    version.publishedBy = publishedBy;
    version.publishedAt = publishedAt;
    version.effectiveFrom =
      this.normalizeNullableText(command.effectiveFrom) ??
      version.effectiveFrom;
    version.effectiveTo = this.normalizeNullableText(command.effectiveTo);
    version.updatedAt = publishedAt;

    const changedVersions = previousPublished
      ? [
          this.clonePublicInfoVersion(previousPublished),
          this.clonePublicInfoVersion(version),
        ]
      : [this.clonePublicInfoVersion(version)];
    this.persistChanges(
      {
        publicInfoVersions: changedVersions,
      },
      "publish_public_info_version",
    );
    this.recordAudit(
      {
        actorId: publishedBy,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "publish_public_info_version",
        resourceType: "public_info_version",
        resourceId: version.versionId,
        ...(previousPublished
          ? {
              oldValuesSummary: {
                previousVersionId: previousPublished.versionId,
                previousStatus: "published",
              },
            }
          : {}),
        newValuesSummary: {
          previousVersionId: previousPublished?.versionId ?? null,
          newVersionId: version.versionId,
          publishedAt,
          publishedBy,
        },
      },
      requestId,
    );

    return this.clonePublicInfoVersion(version);
  }

  deleteDraftPublicInfoVersion(
    versionId: string,
    requestId?: string,
    deleteActorId?: string | null,
  ) {
    const version = this.requirePublicInfoVersion(versionId);
    if (version.status !== "draft") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PUBLIC_INFO_VERSION_NOT_DRAFT",
        "Only draft public info versions can be deleted.",
        {
          versionId,
          status: version.status,
        },
      );
    }

    this.publicInfoVersions = this.publicInfoVersions.filter(
      (candidate) => candidate.versionId !== versionId,
    );
    this.persistChanges(
      {
        deletedPublicInfoVersionIds: [versionId],
      },
      "delete_draft_public_info_version",
    );
    this.recordAudit(
      {
        actorId: this.normalizeNullableText(deleteActorId),
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "delete_draft_public_info_version",
        resourceType: "public_info_version",
        resourceId: versionId,
        oldValuesSummary: {
          ...this.clonePublicInfoVersion(version),
        },
        newValuesSummary: {
          deleted: true,
        },
      },
      requestId,
    );

    return this.clonePublicInfoVersion(version);
  }

  listPlacardVersions() {
    return this.placardVersions.map((placard) =>
      this.clonePlacardVersion(placard),
    );
  }

  publishPlacardVersion(
    placardVersionId: string,
    command: PublishPlacardVersionCommand = {},
    requestId?: string,
    publishActorId?: string | null,
  ) {
    void command;
    const placard = this.placardVersions.find(
      (candidate) => candidate.placardVersionId === placardVersionId,
    );
    if (!placard) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PLACARD_VERSION_NOT_FOUND",
        "The placard version could not be found.",
        { placardVersionId },
      );
    }
    if (placard.publishedAt) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PLACARD_VERSION_ALREADY_PUBLISHED",
        "This placard version has already been published.",
        { placardVersionId, publishedAt: placard.publishedAt },
      );
    }

    const now = new Date().toISOString();
    placard.publishedAt = now;
    placard.updatedAt = now;

    this.persistChanges(
      { placardVersions: [this.clonePlacardVersion(placard)] },
      "publish_placard_version",
    );
    this.recordAudit(
      {
        actorId: this.normalizeNullableText(publishActorId),
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "publish_placard_version",
        resourceType: "placard_version",
        resourceId: placard.placardVersionId,
        newValuesSummary: {
          placardVersionId: placard.placardVersionId,
          versionCode: placard.versionCode,
          publishedAt: now,
        },
      },
      requestId,
    );

    return this.clonePlacardVersion(placard);
  }

  generatePlacardVersion(
    command: GeneratePlacardVersionCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.versionCode, "versionCode");
    this.assertNonBlank(command.publicInfoVersionId, "publicInfoVersionId");
    this.assertNonBlank(command.templateName, "templateName");
    const publicInfoVersion = this.requirePublicInfoVersion(
      command.publicInfoVersionId,
    );
    const normalizedVersionCode = command.versionCode.trim();
    const duplicate = this.placardVersions.find(
      (candidate) =>
        candidate.versionCode.toLowerCase() ===
        normalizedVersionCode.toLowerCase(),
    );
    if (duplicate) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PLACARD_VERSION_CODE_CONFLICT",
        "A placard version with this version code already exists.",
        {
          versionCode: normalizedVersionCode,
          placardVersionId: duplicate.placardVersionId,
        },
      );
    }

    const now = new Date().toISOString();
    const placardVersionId = `placard_${randomUUID()}`;
    const derivedPublishedAt =
      publicInfoVersion.status === "published"
        ? (this.normalizeNullableText(command.publishedAt) ??
          publicInfoVersion.publishedAt ??
          now)
        : null;
    const placard: PlacardVersionRecord = {
      placardVersionId,
      versionCode: normalizedVersionCode,
      publicInfoVersionId: command.publicInfoVersionId.trim(),
      templateName: command.templateName.trim(),
      artifactFileId:
        this.normalizeNullableText(command.artifactFileId) ??
        `placard-artifact-${placardVersionId}`,
      artifactManifestHash: null,
      artifactDownloadUrl: null,
      artifactExpiresAt: null,
      publishedAt: derivedPublishedAt,
      createdAt: now,
      updatedAt: now,
      downloadMetadata: null,
    };

    this.placardVersions = [
      this.clonePlacardVersion(placard),
      ...this.placardVersions,
    ];
    this.persistChanges(
      {
        placardVersions: [this.clonePlacardVersion(placard)],
      },
      "generate_placard_version",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "generate_placard_version",
        resourceType: "placard_version",
        resourceId: placard.placardVersionId,
        newValuesSummary: {
          ...this.clonePlacardVersion(placard),
          sourcePublicInfoStatus: publicInfoVersion.status,
        },
      },
      requestId,
    );

    return this.clonePlacardVersion(placard);
  }

  // ── Platform Admin Users ──────────────────────────────────────────────────

  async listPlatformAdminUsers(): Promise<PlatformAdminUserRecord[]> {
    const snapshots = await this.listPlatformAdminUserSnapshots();
    return snapshots.map((snapshot) =>
      this.toPlatformAdminUserRecord(snapshot),
    );
  }

  async createPlatformAdminUser(
    command: CreatePlatformAdminUserCommand,
    requestId?: string,
    actorId?: string | null,
  ): Promise<PlatformAdminUserRecord> {
    this.assertNonBlank(command.email, "email");
    this.assertNonBlank(command.displayName, "displayName");
    const reason = this.requireNonBlank(command.reason, "reason");
    const auditActorId = this.requirePlatformAdminActorId(
      actorId,
      "create platform admin users",
    );
    const normalizedEmail = command.email.trim().toLowerCase();
    const realm = this.resolveRealmForPlatformAdminRole(command.roleCode);
    const existingPrincipal =
      await this.findControlPlanePrincipalByEmail(normalizedEmail);
    if (existingPrincipal?.status === "suspended") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PLATFORM_USER_SUSPENDED",
        "This workforce principal is suspended and must be reactivated instead of reinvited.",
        { email: command.email },
      );
    }

    const principal =
      existingPrincipal ??
      this.buildPlatformAdminPrincipal({
        email: normalizedEmail,
        displayName: command.displayName.trim(),
        status: "invited",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    const existingMemberships =
      await this.identityRepository.findMembershipsByPrincipalId(
        principal.principalId,
      );
    const duplicateMembership = existingMemberships.find(
      (membership) =>
        membership.scopeRef === CONTROL_PLANE_SCOPE_REF &&
        membership.realm === realm,
    );
    if (duplicateMembership) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PLATFORM_USER_EMAIL_CONFLICT",
        "A platform admin user with this email already exists for this control-plane realm.",
        { email: command.email, realm },
      );
    }

    const now = new Date().toISOString();
    const membership = this.buildPlatformAdminMembership({
      principalId: principal.principalId,
      email: normalizedEmail,
      realm,
      status: "invited",
      invitedByPrincipalId: auditActorId,
      createdAt: now,
      updatedAt: now,
    });
    const roleBinding = this.buildPlatformAdminRoleBinding({
      email: normalizedEmail,
      realm,
      membershipId: membership.membershipId,
      roleCode: command.roleCode,
      actorPrincipalId: auditActorId,
      createdAt: now,
      updatedAt: now,
      validFrom: now,
    });
    const persisted = await this.identityRepository.upsertWorkforceIdentity(
      existingPrincipal
        ? {
            ...principal,
            displayName: principal.displayName || command.displayName.trim(),
          }
        : principal,
      membership,
      [roleBinding],
    );
    const snapshot = this.createPlatformAdminSnapshot(
      persisted.principal,
      persisted.membership,
      persisted.roleBindings[0]!,
    );
    const user = this.toPlatformAdminUserRecord(snapshot);
    this.recordAudit(
      {
        actorId: auditActorId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "create_platform_admin_user",
        resourceType: "platform_admin_user",
        resourceId: user.userId,
        newValuesSummary: {
          ...user,
          realm,
          reason,
          principalId: persisted.principal.principalId,
        },
      },
      requestId,
    );
    return user;
  }

  async updatePlatformAdminUserRole(
    userId: string,
    command: UpdatePlatformAdminUserRoleCommand,
    requestId?: string,
    actorId?: string | null,
  ): Promise<PlatformAdminUserRecord> {
    const reason = this.requireNonBlank(command.reason, "reason");
    const auditActorId = this.requirePlatformAdminActorId(
      actorId,
      "update platform admin users",
    );
    const membership = await this.identityRepository.findMembershipById(userId);
    if (
      !membership ||
      membership.scopeRef !== CONTROL_PLANE_SCOPE_REF ||
      !CONTROL_PLANE_REALMS.includes(membership.realm as ControlPlaneRealm)
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PLATFORM_USER_NOT_FOUND",
        "Platform admin user not found.",
        { userId },
      );
    }

    const principal = await this.identityRepository.findPrincipalById(
      membership.principalId,
    );
    if (!principal) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PLATFORM_USER_NOT_FOUND",
        "Platform admin user principal could not be found.",
        { userId, principalId: membership.principalId },
      );
    }

    const roleBindings =
      await this.identityRepository.findRoleBindingsByMembershipId(
        membership.membershipId,
      );
    const currentRoleBinding = this.selectCurrentRoleBinding(roleBindings);
    if (!currentRoleBinding) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PLATFORM_USER_ROLE_BINDING_MISSING",
        "Platform admin user has no active durable role binding.",
        { userId, membershipId: membership.membershipId },
      );
    }

    const beforeSnapshot = this.createPlatformAdminSnapshot(
      principal,
      membership,
      currentRoleBinding,
    );
    const now = new Date().toISOString();
    const targetMembershipStatus = this.toCanonicalAccountStatus(
      command.status ?? beforeSnapshot.status,
    );
    const controlPlaneMemberships =
      await this.identityRepository.findMembershipsByPrincipalId(
        principal.principalId,
      );
    const updatedPrincipalStatus = this.resolvePrincipalStatusAfterMutation(
      principal.status,
      controlPlaneMemberships,
      membership.membershipId,
      targetMembershipStatus,
    );
    const updatedPrincipal: CanonicalIdentityPrincipalRecord = {
      ...principal,
      status: updatedPrincipalStatus,
      updatedAt:
        updatedPrincipalStatus === principal.status ? principal.updatedAt : now,
    };
    const updatedMembership: CanonicalIdentityMembershipRecord = {
      ...membership,
      status: targetMembershipStatus,
      updatedAt: now,
    };
    const updatedRoleBinding: CanonicalIdentityRoleBindingRecord = {
      ...currentRoleBinding,
      roleCode: this.toInternalRoleCode(command.roleCode),
      grantedByPrincipalId: auditActorId,
      validFrom:
        currentRoleBinding.roleCode ===
        this.toInternalRoleCode(command.roleCode)
          ? currentRoleBinding.validFrom
          : now,
      updatedAt: now,
    };
    const persisted = await this.identityRepository.upsertWorkforceIdentity(
      updatedPrincipal,
      updatedMembership,
      [updatedRoleBinding],
    );
    const revokedSessionIds = await this.revokePlatformAdminSessions({
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      revokeReason: reason,
      revokedByPrincipalId: auditActorId,
      revokeAllMemberships: updatedPrincipalStatus !== "active",
    });
    const snapshot = this.createPlatformAdminSnapshot(
      persisted.principal,
      persisted.membership,
      persisted.roleBindings[0]!,
    );
    const user = this.toPlatformAdminUserRecord(snapshot);
    this.recordAudit(
      {
        actorId: auditActorId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "update_platform_admin_user_role",
        resourceType: "platform_admin_user",
        resourceId: user.userId,
        oldValuesSummary: {
          ...this.toPlatformAdminUserRecord(beforeSnapshot),
          principalId: principal.principalId,
          canonicalStatus: membership.status,
        },
        newValuesSummary: {
          ...user,
          principalId: persisted.principal.principalId,
          canonicalStatus: persisted.membership.status,
          reason,
          revokedSessionIds,
        },
      },
      requestId,
    );
    return user;
  }

  // ── Platform Adapters ───────────────────────────────────────────────────

  listPlatformAdapters(): PlatformAdapter[] {
    return this.adapters.map((adapter) =>
      this.attachCredentialExpiryWarning(this.clonePlatformAdapter(adapter)),
    );
  }

  getPlatformAdapter(id: string): PlatformAdapter | undefined {
    const adapter = this.adapters.find((a) => a.id === id);
    return adapter
      ? this.attachCredentialExpiryWarning(this.clonePlatformAdapter(adapter))
      : undefined;
  }

  /**
   * Server-computed credential-expiry-warning read (contracts:
   * AdapterCredentialExpiryWarning). Never fabricates a success/"ok" result:
   * a missing adapter is a 404, not a synthesized "unknown" warning.
   */
  getPlatformAdapterCredentialExpiryWarning(
    id: string,
  ): AdapterCredentialExpiryWarning {
    const adapter = this.adapters.find((a) => a.id === id);
    if (!adapter) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PLATFORM_ADAPTER_NOT_FOUND",
        `Platform adapter ${id} not found.`,
        { id },
      );
    }

    return this.evaluateCredentialExpiryWarning(adapter.credentialExpiry);
  }

  async updatePlatformAdapter(
    id: string,
    command: UpdatePlatformAdapterCommand,
    requestId?: string,
    actorId?: string | null,
  ): Promise<PlatformAdapter | undefined> {
    const index = this.adapters.findIndex((a) => a.id === id);
    if (index === -1) {
      return undefined;
    }

    const current = this.adapters[index]!;
    if (
      command.expectedRevision !== undefined &&
      command.expectedRevision !== (current.revision ?? 1)
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PLATFORM_ADAPTER_REVISION_CONFLICT",
        `Platform adapter ${id} was not at expected revision ${command.expectedRevision}.`,
        {
          id,
          expectedRevision: command.expectedRevision,
          actualRevision: current.revision ?? 1,
        },
      );
    }

    const previousRevision = current.revision ?? 1;
    const newRevision = previousRevision + 1;
    const now = new Date().toISOString();
    const reason = this.normalizeNullableText(command.reason) ?? "not provided";
    const mutationAudit: PlatformAdapterAuditEvidence = {
      auditId: `platform-adapter-audit_${randomUUID()}`,
      actorId: this.normalizeNullableText(actorId),
      reason,
      previousRevision,
      newRevision,
      occurredAt: now,
    };

    const updated: PlatformAdapter = {
      ...current,
      config: command.config
        ? { ...current.config, ...command.config }
        : current.config,
      rolloutStatus: command.rolloutStatus ?? current.rolloutStatus,
      rolloutStage: command.rolloutStage ?? current.rolloutStage,
      credentialExpiry:
        command.credentialExpiry !== undefined
          ? command.credentialExpiry
          : (current.credentialExpiry ?? null),
      policies: command.policies
        ? {
            ...current.policies,
            ...command.policies,
            serviceBuckets:
              command.policies.serviceBuckets ??
              current.policies.serviceBuckets,
          }
        : current.policies,
      featureFlags: command.featureFlags
        ? { ...current.featureFlags, ...command.featureFlags }
        : current.featureFlags,
      webhookStatus:
        current.webhookStatus || command.webhookStatus
          ? {
              url: null,
              isEnabled: false,
              lastEventTimestamp: null,
              lastStatus: "UNKNOWN",
              ...current.webhookStatus,
              ...command.webhookStatus,
            }
          : null,
      revision: newRevision,
      lastMutationAudit: mutationAudit,
      updatedAt: now,
    };

    this.adapters[index] = updated;

    await this.persistAdapterMutation(
      current.id,
      previousRevision,
      updated,
      mutationAudit,
    );

    this.recordAudit(
      {
        actorId: mutationAudit.actorId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "update_platform_adapter",
        resourceType: "platform_adapter",
        resourceId: updated.id,
        oldValuesSummary: {
          revision: previousRevision,
          config: current.config,
          rolloutStatus: current.rolloutStatus,
          credentialExpiry: current.credentialExpiry ?? null,
        },
        newValuesSummary: {
          revision: newRevision,
          reason,
          config: updated.config,
          rolloutStatus: updated.rolloutStatus,
          credentialExpiry: updated.credentialExpiry ?? null,
        },
      },
      requestId,
    );

    return this.attachCredentialExpiryWarning(
      this.clonePlatformAdapter(updated),
    );
  }

  registerPlatformAdapter(adapter: PlatformAdapter): PlatformAdapter {
    const existingIndex = this.adapters.findIndex((a) => a.id === adapter.id);
    const now = new Date().toISOString();
    const cloned = this.clonePlatformAdapter({
      ...adapter,
      revision: adapter.revision ?? 1,
      lastMutationAudit: adapter.lastMutationAudit ?? null,
      updatedAt: now,
    });
    if (existingIndex >= 0) {
      this.adapters[existingIndex] = cloned;
    } else {
      this.adapters.push(cloned);
    }

    this.persistChanges(
      { platformAdapters: [this.clonePlatformAdapter(cloned)] },
      "register_platform_adapter",
    );
    this.recordAudit({
      actorId: null,
      actorType: "platform_admin",
      tenantId: null,
      moduleName: "platform-admin",
      actionName: "register_platform_adapter",
      resourceType: "platform_adapter",
      resourceId: cloned.id,
      newValuesSummary: { id: cloned.id, platformCode: cloned.platformCode },
    });

    return this.attachCredentialExpiryWarning(
      this.clonePlatformAdapter(cloned),
    );
  }

  private async persistAdapterMutation(
    adapterId: string,
    previousRevision: number,
    updated: PlatformAdapter,
    audit: PlatformAdapterAuditEvidence,
  ) {
    if (!this.platformAdminRepository?.isEnabled()) {
      return;
    }

    try {
      await this.platformAdminRepository.mutateAdapterWithAudit(
        adapterId,
        previousRevision,
        this.clonePlatformAdapter(updated),
        {
          previousRevision,
          newRevision: audit.newRevision,
          reason: audit.reason,
          actorId: audit.actorId,
        },
      );
    } catch (error) {
      if (error instanceof PlatformAdapterRevisionConflictError) {
        // The in-memory row above is this process's authority for the HTTP
        // response already returned; a persisted-row mismatch here means the
        // durable copy has not caught up (e.g. first mutation before the
        // initial seed row landed) rather than a real concurrent writer in
        // this single-instance service, so it is logged, not surfaced to the
        // caller who already has a consistent in-memory result.
        this.platformAdminRepository.reportPersistenceFailure(
          error,
          "update_platform_adapter revision",
        );
        return;
      }

      this.platformAdminRepository.reportPersistenceFailure(
        error,
        "update_platform_adapter",
      );
    }
  }

  /**
   * Missing or unparsable expiry data resolves to "unknown", never "ok" --
   * absent/unrecorded expiry is a distinct valid state, not evidence of
   * health (contracts: AdapterCredentialExpiryWarning). This function itself
   * never throws: an evaluation failure belongs to the caller (e.g. a 404 for
   * a missing adapter), never fabricated into a warning-state value.
   */
  private evaluateCredentialExpiryWarning(
    credentialExpiry: AdapterCredentialExpiry | null | undefined,
  ): AdapterCredentialExpiryWarning {
    const evaluatedAt = new Date().toISOString();
    const state = this.resolveCredentialExpiryWarningState(
      credentialExpiry,
      evaluatedAt,
    );

    return {
      state,
      warningWindowDays: CREDENTIAL_EXPIRY_WARNING_WINDOW_DAYS,
      evaluatedAt,
    };
  }

  private resolveCredentialExpiryWarningState(
    credentialExpiry: AdapterCredentialExpiry | null | undefined,
    evaluatedAt: string,
  ): CredentialExpiryWarningState {
    const expiresAt = credentialExpiry?.expiresAt;
    if (!expiresAt) {
      return "unknown";
    }

    const expiresAtMs = Date.parse(expiresAt);
    if (Number.isNaN(expiresAtMs)) {
      return "unknown";
    }

    const nowMs = Date.parse(evaluatedAt);
    if (expiresAtMs <= nowMs) {
      return "expired";
    }

    const warningThresholdMs =
      nowMs + CREDENTIAL_EXPIRY_WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return expiresAtMs <= warningThresholdMs ? "warning" : "ok";
  }

  private attachCredentialExpiryWarning(
    adapter: PlatformAdapter,
  ): PlatformAdapter {
    return {
      ...adapter,
      credentialExpiryWarning: this.evaluateCredentialExpiryWarning(
        adapter.credentialExpiry,
      ),
    };
  }

  private clonePlatformAdapter(adapter: PlatformAdapter): PlatformAdapter {
    return {
      ...adapter,
      config: { ...adapter.config },
      healthStatus: { ...adapter.healthStatus },
      policies: {
        ...adapter.policies,
        serviceBuckets: [...adapter.policies.serviceBuckets],
      },
      featureFlags: { ...adapter.featureFlags },
      supportedActions: adapter.supportedActions.map((action) => ({
        ...action,
      })),
      webhookStatus: adapter.webhookStatus
        ? { ...adapter.webhookStatus }
        : null,
      credentialExpiry: adapter.credentialExpiry
        ? { ...adapter.credentialExpiry }
        : (adapter.credentialExpiry ?? null),
      lastMutationAudit: adapter.lastMutationAudit
        ? { ...adapter.lastMutationAudit }
        : (adapter.lastMutationAudit ?? null),
    };
  }

  // ── Platform Notices ──────────────────────────────────────────────────────

  listPlatformNotices(): PlatformNoticeRecord[] {
    return this.platformNotices.map((n) => ({ ...n }));
  }

  createPlatformNotice(
    command: CreatePlatformNoticeCommand,
    requestId?: string,
  ): PlatformNoticeRecord {
    return this.createPlatformNoticeWithAudit(command, requestId).data;
  }

  createPlatformNoticeWithAudit(
    command: CreatePlatformNoticeCommand,
    requestId?: string,
  ): AuditedActionResult<PlatformNoticeRecord> {
    this.assertNonBlank(command.title, "title");
    this.assertNonBlank(command.body, "body");
    const now = new Date().toISOString();
    const notice: PlatformNoticeRecord = {
      noticeId: `notice_${randomUUID()}`,
      title: command.title.trim(),
      body: command.body.trim(),
      severity: command.severity,
      status: command.scheduledAt ? "scheduled" : "active",
      targetAudience: command.targetAudience,
      scheduledAt: command.scheduledAt ?? null,
      resolvedAt: null,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    };
    this.platformNotices.unshift({ ...notice });
    const auditLog = this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "create_platform_notice",
        resourceType: "platform_notice",
        resourceId: notice.noticeId,
        newValuesSummary: { title: notice.title, severity: notice.severity },
      },
      requestId,
    );
    return {
      data: { ...notice },
      auditLog,
    };
  }

  resolveNotice(noticeId: string, requestId?: string): PlatformNoticeRecord {
    const notice = this.platformNotices.find((n) => n.noticeId === noticeId);
    if (!notice) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOTICE_NOT_FOUND",
        "Platform notice not found.",
        { noticeId },
      );
    }
    notice.status = "resolved";
    notice.resolvedAt = new Date().toISOString();
    notice.updatedAt = notice.resolvedAt;
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "resolve_platform_notice",
        resourceType: "platform_notice",
        resourceId: noticeId,
        newValuesSummary: { status: "resolved" },
      },
      requestId,
    );
    return { ...notice };
  }

  // ── Maintenance Mode ──────────────────────────────────────────────────────

  getMaintenanceMode(): PlatformMaintenanceModeRecord {
    return { ...this.maintenanceMode };
  }

  setMaintenanceMode(
    command: SetPlatformMaintenanceModeCommand,
    requestId?: string,
  ): PlatformMaintenanceModeRecord {
    return this.setMaintenanceModeWithAudit(command, requestId).data;
  }

  setMaintenanceModeWithAudit(
    command: SetPlatformMaintenanceModeCommand,
    requestId?: string,
  ): AuditedActionResult<PlatformMaintenanceModeRecord> {
    const now = new Date().toISOString();
    this.maintenanceMode = {
      enabled: command.enabled,
      reason: command.reason ?? null,
      scheduledStart: command.scheduledStart ?? null,
      scheduledEnd: command.scheduledEnd ?? null,
      updatedBy: null,
      updatedAt: now,
    };
    const auditLog = this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: command.enabled
          ? "enable_maintenance_mode"
          : "disable_maintenance_mode",
        resourceType: "platform_maintenance_mode",
        resourceId: "platform",
        newValuesSummary: {
          enabled: command.enabled,
          reason: command.reason ?? null,
        },
      },
      requestId,
    );
    return {
      data: { ...this.maintenanceMode },
      auditLog,
    };
  }

  // ── Platform Pricing Rules ────────────────────────────────────────────────

  listPlatformPricingRules(): PlatformPricingRuleRecord[] {
    return this.pricingRules.map((rule) => this.clonePricingRule(rule));
  }

  createPlatformPricingRule(
    command: CreatePlatformPricingRuleCommand,
    requestId?: string,
  ): PlatformPricingRuleRecord {
    this.assertNonBlank(command.ruleName, "ruleName");
    this.assertNonBlank(command.version, "version");

    const duplicate = this.pricingRules.find(
      (rule) =>
        rule.ruleName === command.ruleName.trim() &&
        rule.version === command.version.trim() &&
        rule.applicableTo === command.applicableTo,
    );
    if (duplicate) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PRICING_RULE_VERSION_CONFLICT",
        "A pricing rule with this version already exists.",
        {
          ruleName: command.ruleName,
          version: command.version,
          applicableTo: command.applicableTo,
        },
      );
    }

    const now = new Date().toISOString();
    const rule: PlatformPricingRuleRecord = {
      ruleId: `rule_${randomUUID()}`,
      ruleName: command.ruleName.trim(),
      version: command.version.trim(),
      serviceFeeBps: command.serviceFeeBps,
      reimbursementMode: command.reimbursementMode,
      applicableTo: command.applicableTo,
      status: "draft",
      effectiveFrom: this.normalizeNullableText(command.effectiveFrom) ?? now,
      effectiveTo: null,
      publishedBy: null,
      publishedAt: null,
      notes: this.normalizeNullableText(command.notes),
      createdAt: now,
      updatedAt: now,
    };

    this.pricingRules = [
      this.clonePricingRule(rule),
      ...this.pricingRules.map((existing) => this.clonePricingRule(existing)),
    ];
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "create_platform_pricing_rule",
        resourceType: "platform_pricing_rule",
        resourceId: rule.ruleId,
        newValuesSummary: {
          ruleName: rule.ruleName,
          version: rule.version,
          applicableTo: rule.applicableTo,
          serviceFeeBps: rule.serviceFeeBps,
          status: rule.status,
        },
      },
      requestId,
    );
    return this.clonePricingRule(rule);
  }

  publishPlatformPricingRule(
    ruleId: string,
    command: PublishPlatformPricingRuleCommand,
    requestId?: string,
  ): PlatformPricingRuleRecord {
    const rule = this.requirePricingRule(ruleId);
    const previousActive = this.pricingRules.find(
      (candidate) =>
        candidate.ruleId !== rule.ruleId &&
        candidate.ruleName === rule.ruleName &&
        candidate.applicableTo === rule.applicableTo &&
        candidate.status === "active",
    );
    const publishedAt = new Date().toISOString();

    if (previousActive) {
      previousActive.status = "archived";
      previousActive.effectiveTo =
        this.normalizeNullableText(command.effectiveFrom) ?? publishedAt;
      previousActive.updatedAt = publishedAt;
    }

    rule.status = "active";
    rule.publishedBy = this.normalizeNullableText(command.publishedBy);
    rule.publishedAt = publishedAt;
    rule.effectiveFrom =
      this.normalizeNullableText(command.effectiveFrom) ?? rule.effectiveFrom;
    rule.effectiveTo = this.normalizeNullableText(command.effectiveTo);
    rule.updatedAt = publishedAt;

    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "publish_platform_pricing_rule",
        resourceType: "platform_pricing_rule",
        resourceId: rule.ruleId,
        ...(previousActive
          ? {
              oldValuesSummary: {
                previousRuleId: previousActive.ruleId,
                previousVersion: previousActive.version,
                previousStatus: "active",
              },
            }
          : {}),
        newValuesSummary: {
          ruleId: rule.ruleId,
          version: rule.version,
          publishedAt,
          applicableTo: rule.applicableTo,
        },
      },
      requestId,
    );

    return this.clonePricingRule(rule);
  }

  // ── Platform Invoices (cross-tenant view) ─────────────────────────────────

  listPlatformInvoices(): TenantInvoiceRecord[] {
    // Returns seeded platform-level invoice overview for demo purposes.
    const now = new Date().toISOString();
    return [
      {
        invoiceId: "inv-demo-001",
        tenantId: "t_demo",
        periodStart: "2026-03-01T00:00:00.000Z",
        periodEnd: "2026-03-31T23:59:59.000Z",
        amount: { amountMinor: 25000, currency: "TWD" },
        status: "paid",
        artifactUrl: null,
        pricingVersionSnapshot: "rule-demo-001",
        lines: [],
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: now,
      },
      {
        invoiceId: "inv-demo-002",
        tenantId: "t_demo",
        periodStart: "2026-04-01T00:00:00.000Z",
        periodEnd: "2026-04-30T23:59:59.000Z",
        amount: { amountMinor: 18500, currency: "TWD" },
        status: "draft",
        artifactUrl: null,
        pricingVersionSnapshot: "rule-demo-001",
        lines: [],
        createdAt: "2026-04-15T00:00:00.000Z",
        updatedAt: now,
      },
    ];
  }

  private async bootstrapSeedPlatformAdminUsers() {
    for (const seedUser of PLATFORM_ADMIN_USERS_SEED) {
      const normalizedEmail = seedUser.email.trim().toLowerCase();
      const realm = this.resolveRealmForPlatformAdminRole(seedUser.roleCode);
      const existingMembership =
        await this.identityRepository.findMembershipById(
          this.createStableId(
            "membership_platform_user",
            `${normalizedEmail}:${realm}`,
          ),
        );
      if (existingMembership) {
        continue;
      }
      const canonicalStatus =
        seedUser.status === "active"
          ? "migration_pending"
          : this.toCanonicalAccountStatus(seedUser.status);
      const existingPrincipal =
        await this.findControlPlanePrincipalByEmail(normalizedEmail);
      const principal =
        existingPrincipal ??
        this.buildPlatformAdminPrincipal({
          email: normalizedEmail,
          displayName: seedUser.displayName,
          status: canonicalStatus,
          createdAt: seedUser.createdAt,
          updatedAt: seedUser.updatedAt,
        });
      const membership = this.buildPlatformAdminMembership({
        principalId: principal.principalId,
        email: normalizedEmail,
        realm,
        status: canonicalStatus,
        invitedByPrincipalId: null,
        createdAt: seedUser.createdAt,
        updatedAt: seedUser.updatedAt,
      });
      const roleBinding = this.buildPlatformAdminRoleBinding({
        email: normalizedEmail,
        realm,
        membershipId: membership.membershipId,
        roleCode: seedUser.roleCode,
        actorPrincipalId: null,
        createdAt: seedUser.createdAt,
        updatedAt: seedUser.updatedAt,
        validFrom: seedUser.createdAt,
      });

      await this.identityRepository.upsertWorkforceIdentity(
        principal,
        membership,
        [roleBinding],
      );
    }
  }

  private async findControlPlanePrincipalByEmail(email: string) {
    const principals =
      await this.identityRepository.findPrincipalsByEmail(email);
    for (const principal of principals) {
      const memberships =
        await this.identityRepository.findMembershipsByPrincipalId(
          principal.principalId,
        );
      if (
        memberships.some((membership) =>
          this.isControlPlaneMembership(membership),
        )
      ) {
        return principal;
      }
    }
    return null;
  }

  private async listPlatformAdminUserSnapshots(): Promise<
    PlatformAdminUserSnapshot[]
  > {
    const memberships = await this.identityRepository.listMembershipsByScope(
      CONTROL_PLANE_SCOPE_REF,
      CONTROL_PLANE_REALMS,
    );
    const snapshots: PlatformAdminUserSnapshot[] = [];

    for (const membership of memberships) {
      const principal = await this.identityRepository.findPrincipalById(
        membership.principalId,
      );
      if (!principal) {
        continue;
      }
      const roleBindings =
        await this.identityRepository.findRoleBindingsByMembershipId(
          membership.membershipId,
        );
      const currentRoleBinding = this.selectCurrentRoleBinding(roleBindings);
      if (!currentRoleBinding) {
        continue;
      }
      snapshots.push(
        this.createPlatformAdminSnapshot(
          principal,
          membership,
          currentRoleBinding,
        ),
      );
    }

    return snapshots.sort((left, right) =>
      this.toPlatformAdminUserRecord(right).updatedAt.localeCompare(
        this.toPlatformAdminUserRecord(left).updatedAt,
      ),
    );
  }

  private createPlatformAdminSnapshot(
    principal: CanonicalIdentityPrincipalRecord,
    membership: CanonicalIdentityMembershipRecord,
    roleBinding: CanonicalIdentityRoleBindingRecord,
  ): PlatformAdminUserSnapshot {
    const roleCode = this.toExternalRoleCode(roleBinding.roleCode);
    if (!roleCode) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PLATFORM_USER_ROLE_UNSUPPORTED",
        "Platform admin user uses an unsupported durable role binding.",
        {
          principalId: principal.principalId,
          membershipId: membership.membershipId,
          roleCode: roleBinding.roleCode,
        },
      );
    }
    const effectiveStatus =
      principal.status === "active" ? membership.status : principal.status;

    return {
      principal,
      membership,
      roleBinding,
      roleCode,
      status: this.toPlatformAdminUserStatus(effectiveStatus),
    };
  }

  private toPlatformAdminUserRecord(
    snapshot: PlatformAdminUserSnapshot,
  ): PlatformAdminUserRecord {
    return {
      userId: snapshot.membership.membershipId,
      email:
        snapshot.principal.email?.trim().toLowerCase() ??
        snapshot.principal.subject,
      displayName:
        snapshot.principal.displayName?.trim() ||
        snapshot.principal.email?.trim().toLowerCase() ||
        snapshot.principal.subject,
      roleCode: snapshot.roleCode,
      status: snapshot.status,
      createdAt: snapshot.membership.createdAt,
      updatedAt: this.maxTimestamp(
        snapshot.principal.updatedAt,
        snapshot.membership.updatedAt,
        snapshot.roleBinding.updatedAt,
      ),
    };
  }

  private buildPlatformAdminPrincipal(input: {
    email: string;
    displayName: string;
    status: CanonicalAccountStatus;
    createdAt: string;
    updatedAt: string;
  }): CanonicalIdentityPrincipalRecord {
    return {
      principalId: this.createStableId("principal_platform_user", input.email),
      sourceRef: this.buildPlatformAdminPrincipalSourceRef(input.email),
      issuer: PLATFORM_ADMIN_PLACEHOLDER_ISSUER,
      subject: this.buildPlatformAdminPlaceholderSubject(input.email),
      principalType: "human",
      email: input.email,
      emailVerified: false,
      displayName: input.displayName,
      status: input.status,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
  }

  private buildPlatformAdminMembership(input: {
    principalId: string;
    email: string;
    realm: ControlPlaneRealm;
    status: CanonicalAccountStatus;
    invitedByPrincipalId: string | null;
    createdAt: string;
    updatedAt: string;
  }): CanonicalIdentityMembershipRecord {
    return {
      membershipId: this.createStableId(
        "membership_platform_user",
        `${input.email}:${input.realm}`,
      ),
      sourceRef: this.buildPlatformAdminMembershipSourceRef(
        input.email,
        input.realm,
      ),
      principalId: input.principalId,
      realm: input.realm,
      scopeRef: CONTROL_PLANE_SCOPE_REF,
      tenantId: null,
      partnerId: null,
      status: input.status,
      invitedByPrincipalId: input.invitedByPrincipalId,
      invitationId: null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
  }

  private buildPlatformAdminRoleBinding(input: {
    email: string;
    realm: ControlPlaneRealm;
    membershipId: string;
    roleCode: PlatformAdminUserRole;
    actorPrincipalId: string | null;
    createdAt: string;
    updatedAt: string;
    validFrom: string;
  }): CanonicalIdentityRoleBindingRecord {
    return {
      roleBindingId: this.createStableId(
        "role_binding_platform_user",
        `${input.email}:${input.realm}`,
      ),
      sourceRef: this.buildPlatformAdminRoleBindingSourceRef(
        input.email,
        input.realm,
      ),
      membershipId: input.membershipId,
      roleCode: this.toInternalRoleCode(input.roleCode),
      grantedByPrincipalId: input.actorPrincipalId,
      approvalId: null,
      validFrom: input.validFrom,
      validTo: null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
  }

  private resolveRealmForPlatformAdminRole(
    roleCode: PlatformAdminUserRole | InternalPlatformUserRoleCode,
  ): ControlPlaneRealm {
    return roleCode === "operator" || roleCode === "ops_user"
      ? "ops"
      : "platform";
  }

  private toInternalRoleCode(
    roleCode: PlatformAdminUserRole,
  ): InternalPlatformUserRoleCode {
    return roleCode;
  }

  private toExternalRoleCode(roleCode: string): PlatformAdminUserRole | null {
    switch (roleCode) {
      case "superadmin":
      case "admin":
      case "operator":
      case "viewer":
        return roleCode;
      case "platform_admin":
        return "admin";
      case "ops_user":
        return "operator";
      default:
        return null;
    }
  }

  private toCanonicalAccountStatus(
    status: PlatformAdminUserStatus,
  ): CanonicalAccountStatus {
    switch (status) {
      case "active":
        return "active";
      case "suspended":
        return "suspended";
      case "invited":
      default:
        return "invited";
    }
  }

  private toPlatformAdminUserStatus(
    status: CanonicalAccountStatus,
  ): PlatformAdminUserStatus {
    switch (status) {
      case "active":
        return "active";
      case "suspended":
        return "suspended";
      case "invited":
      case "migration_pending":
      default:
        return "invited";
    }
  }

  private selectCurrentRoleBinding(
    roleBindings: CanonicalIdentityRoleBindingRecord[],
  ) {
    const now = Date.now();
    return roleBindings
      .filter((binding) => {
        const validFromMs = Date.parse(binding.validFrom);
        const validToMs = binding.validTo ? Date.parse(binding.validTo) : null;
        if (!Number.isNaN(validFromMs) && validFromMs > now) {
          return false;
        }
        if (
          validToMs !== null &&
          !Number.isNaN(validToMs) &&
          validToMs <= now
        ) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  }

  private resolvePrincipalStatusAfterMutation(
    currentStatus: CanonicalAccountStatus,
    memberships: CanonicalIdentityMembershipRecord[],
    membershipId: string,
    nextMembershipStatus: CanonicalAccountStatus,
  ): CanonicalAccountStatus {
    const statuses = memberships
      .filter((membership) => this.isControlPlaneMembership(membership))
      .map((membership) =>
        membership.membershipId === membershipId
          ? nextMembershipStatus
          : membership.status,
      );

    if (statuses.includes("active")) {
      return "active";
    }
    if (statuses.includes("invited")) {
      return "invited";
    }
    if (statuses.includes("migration_pending")) {
      return "migration_pending";
    }
    if (statuses.includes("suspended")) {
      return "suspended";
    }
    return currentStatus;
  }

  private async revokePlatformAdminSessions(input: {
    principalId: string;
    membershipId: string;
    revokeReason: string;
    revokedByPrincipalId: string;
    revokeAllMemberships: boolean;
  }) {
    const sessions = await this.identityRepository.listSessionsByPrincipal(
      input.principalId,
    );
    const revokedSessionIds: string[] = [];
    for (const session of sessions) {
      if (session.status !== "active") {
        continue;
      }
      if (
        !input.revokeAllMemberships &&
        session.membershipId !== input.membershipId
      ) {
        continue;
      }
      const revoked = await this.identityRepository.revokeSession(
        session.sessionId,
        input.revokeReason,
        input.revokedByPrincipalId,
      );
      if (revoked) {
        revokedSessionIds.push(revoked.sessionId);
      }
    }
    return revokedSessionIds;
  }

  private isControlPlaneMembership(
    membership: CanonicalIdentityMembershipRecord,
  ) {
    return (
      membership.scopeRef === CONTROL_PLANE_SCOPE_REF &&
      CONTROL_PLANE_REALMS.includes(membership.realm as ControlPlaneRealm)
    );
  }

  private buildPlatformAdminPrincipalSourceRef(email: string) {
    return `platform_admin_user:${email}:principal`;
  }

  private buildPlatformAdminMembershipSourceRef(
    email: string,
    realm: ControlPlaneRealm,
  ) {
    return `platform_admin_user:${email}:${realm}:membership`;
  }

  private buildPlatformAdminRoleBindingSourceRef(
    email: string,
    realm: ControlPlaneRealm,
  ) {
    return `platform_admin_user:${email}:${realm}:role_binding`;
  }

  private buildPlatformAdminPlaceholderSubject(email: string) {
    return `platform_user_email:${email}`;
  }

  private createStableId(prefix: string, seed: string) {
    return `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 24)}`;
  }

  private maxTimestamp(...timestamps: string[]) {
    return timestamps
      .filter((timestamp) => timestamp.trim().length > 0)
      .sort((left, right) => right.localeCompare(left))[0]!;
  }

  private requireNonBlank(value: string | null | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PLATFORM_ADMIN_INVALID_INPUT",
        `The ${field} field is required.`,
        { field },
      );
    }
    return normalized;
  }

  private requirePublicInfoVersion(versionId: string) {
    const version = this.publicInfoVersions.find(
      (candidate) => candidate.versionId === versionId,
    );
    if (!version) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PUBLIC_INFO_VERSION_NOT_FOUND",
        "The public info version could not be found.",
        {
          versionId,
        },
      );
    }
    return version;
  }

  private requirePricingRule(ruleId: string) {
    const rule = this.pricingRules.find(
      (candidate) => candidate.ruleId === ruleId,
    );
    if (!rule) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PLATFORM_PRICING_RULE_NOT_FOUND",
        "The platform pricing rule could not be found.",
        {
          ruleId,
        },
      );
    }
    return rule;
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const auditLogInput: Omit<
      AuditLogRecord,
      "auditId" | "createdAt" | "requestId"
    > & {
      requestId?: string;
    } = {
      ...input,
    };
    if (requestId) {
      auditLogInput.requestId = requestId;
    }
    return this.auditNotificationService.recordAuditLog(auditLogInput);
  }

  private clonePublicInfoVersion(
    version: PublicInfoVersionRecord,
  ): PublicInfoVersionRecord {
    return {
      ...version,
    };
  }

  private clonePlacardVersion(
    placard: PlacardVersionRecord,
  ): PlacardVersionRecord {
    const artifactFileId =
      this.normalizeNullableText(placard.artifactFileId) ??
      `placard-artifact-${placard.placardVersionId}`;
    const artifactManifestHash =
      placard.artifactManifestHash ??
      this.computeHash({
        placardVersionId: placard.placardVersionId,
        versionCode: placard.versionCode,
        publicInfoVersionId: placard.publicInfoVersionId,
        templateName: placard.templateName,
        artifactFileId,
      });
    const downloadMetadata =
      placard.downloadMetadata &&
      placard.downloadMetadata.manifestHash === artifactManifestHash
        ? { ...placard.downloadMetadata }
        : this.createPlacardDownloadMetadata(
            placard.placardVersionId,
            artifactManifestHash,
          );

    return {
      ...placard,
      artifactFileId,
      artifactManifestHash,
      artifactDownloadUrl: downloadMetadata.downloadUrl,
      artifactExpiresAt: downloadMetadata.expiresAt,
      downloadMetadata,
    };
  }

  private clonePricingRule(
    rule: PlatformPricingRuleRecord,
  ): PlatformPricingRuleRecord {
    return {
      ...rule,
    };
  }

  private requirePlatformAdminActorId(
    actorId: string | null | undefined,
    action: string,
  ) {
    const normalizedActorId = this.normalizeNullableText(actorId);
    if (!normalizedActorId) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "PLATFORM_ADMIN_IDENTITY_REQUIRED",
        `Platform admin routes require an authenticated actorId to ${action}.`,
      );
    }

    return normalizedActorId;
  }

  private normalizeNullableText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private assertNonBlank(value: string, fieldName: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_REQUIRED",
        `${fieldName} is required.`,
        {
          field: fieldName,
        },
      );
    }
  }

  private createPlacardDownloadMetadata(
    subjectId: string,
    manifestHash: string,
  ): ControlledDownloadMetadata {
    return createControlledDownloadMetadata({
      kind: "placard",
      subjectId,
      manifestHash,
      createdAt: new Date().toISOString(),
      host: this.placardDownloadHost,
      keyId: this.placardSigningKeyId,
      signingSecret: this.placardSigningSecret,
      ttlMinutes: this.placardExpiryMinutes,
      signatureVersion: this.placardSignatureVersion,
    });
  }

  private computeHash(value: unknown) {
    return createHash("sha256")
      .update(this.stableSerialize(value))
      .digest("hex");
  }

  private stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableSerialize(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
      return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => {
          const nestedValue = (value as Record<string, unknown>)[key];
          return `${JSON.stringify(key)}:${this.stableSerialize(nestedValue)}`;
        })
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }

  private persistChanges(
    changes: PersistPlatformAdminChanges,
    context: string,
  ) {
    if (!this.platformAdminRepository) {
      return;
    }

    void this.platformAdminRepository
      .persistChanges(changes)
      .catch((error: unknown) => {
        this.platformAdminRepository!.reportPersistenceFailure(error, context);
      });
  }
}
