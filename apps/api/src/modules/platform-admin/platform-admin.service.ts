import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  ActionReceipt,
  AuditLogRecord,
  CreatePlatformPricingRuleCommand,
  CreatePlatformAdminUserCommand,
  CreatePlatformNoticeCommand,
  CreatePublicInfoVersionCommand,
  GeneratePlacardVersionCommand,
  PlacardVersionRecord,
  PlatformAdminUserRecord,
  PlatformMaintenanceModeRecord,
  PlatformNoticeRecord,
  PlatformPricingRuleRecord,
  PlatformPricingRuleStatus,
  PublishPlacardVersionCommand,
  PublishPlatformPricingRuleCommand,
  PublishPublicInfoVersionCommand,
  PublicInfoVersionRecord,
  ResourceActionDescriptor,
  SetPlatformMaintenanceModeCommand,
  TenantInvoiceRecord,
  UpdatePlatformAdminUserRoleCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { AuditedActionResult } from "../../common/action-receipt";
import {
  DEFAULT_CONTROLLED_DOWNLOAD_HOST,
  DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
  DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
  DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION,
  DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES,
  createControlledDownloadMetadata,
  type ControlledDownloadMetadata,
} from "../../common/controlled-download";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  PlatformAdminRepository,
  type PersistPlatformAdminChanges,
} from "./platform-admin.repository";

type LegacyPlatformPricingRuleStatus = "active" | "archived";

type PricingRulePublishResult = {
  rule: PlatformPricingRuleRecord;
  receiptStatus: Extract<ActionReceipt["status"], "accepted" | "completed">;
  receiptMessage: string;
};

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
    status: "published",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    reviewRequestedBy: "pa-admin-001",
    reviewRequestedAt: "2025-12-20T00:00:00.000Z",
    scheduledBy: null,
    scheduledAt: null,
    publishedBy: "pa-admin-001",
    publishedAt: "2026-01-01T00:00:00.000Z",
    supersededByRuleId: null,
    supersededAt: null,
    rollbackHoldReason: null,
    rollbackHeldBy: null,
    rollbackHeldAt: null,
    notes: "Baseline fee plan for platform-wide enterprise dispatch tenants.",
    createdAt: "2025-12-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    availableActions: [],
  },
  {
    ruleId: "rule-demo-002",
    ruleName: "Enterprise Discount Tier",
    version: "2026.03",
    serviceFeeBps: 1000,
    reimbursementMode: "mixed",
    applicableTo: "t_demo",
    status: "published",
    effectiveFrom: "2026-03-01T00:00:00.000Z",
    effectiveTo: null,
    reviewRequestedBy: "pa-admin-001",
    reviewRequestedAt: "2026-02-20T00:00:00.000Z",
    scheduledBy: null,
    scheduledAt: null,
    publishedBy: "pa-admin-001",
    publishedAt: "2026-03-01T00:00:00.000Z",
    supersededByRuleId: null,
    supersededAt: null,
    rollbackHoldReason: null,
    rollbackHeldBy: null,
    rollbackHeldAt: null,
    notes: "Reduced fee schedule for the demo tenant enterprise program.",
    createdAt: "2026-02-15T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    availableActions: [],
  },
];

@Injectable()
export class PlatformAdminService implements OnModuleInit {
  private publicInfoVersions = PUBLIC_INFO_SEED.map((version) =>
    this.clonePublicInfoVersion(version),
  );

  private placardVersions = PLACARD_SEED.map((placard) =>
    this.clonePlacardVersion(placard),
  );

  private platformAdminUsers: PlatformAdminUserRecord[] =
    PLATFORM_ADMIN_USERS_SEED.map((u) => ({ ...u }));

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
    PLATFORM_PRICING_RULES_SEED.map((rule) => this.clonePricingRule(rule));

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
  ) {}

  async onModuleInit() {
    if (!this.platformAdminRepository) {
      return;
    }

    try {
      const persistedState = await this.platformAdminRepository.loadState();
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
        return;
      }

      this.publicInfoVersions = persistedState.publicInfoVersions.map(
        (version) => this.clonePublicInfoVersion(version),
      );
      this.placardVersions = persistedState.placardVersions.map((placard) =>
        this.clonePlacardVersion(placard),
      );
    } catch (error) {
      this.platformAdminRepository.reportPersistenceFailure(
        error,
        "module init",
      );
    }
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

  listPlatformAdminUsers(): PlatformAdminUserRecord[] {
    return this.platformAdminUsers.map((u) => ({ ...u }));
  }

  createPlatformAdminUser(
    command: CreatePlatformAdminUserCommand,
    requestId?: string,
  ): PlatformAdminUserRecord {
    this.assertNonBlank(command.email, "email");
    this.assertNonBlank(command.displayName, "displayName");
    const existing = this.platformAdminUsers.find(
      (u) => u.email.toLowerCase() === command.email.trim().toLowerCase(),
    );
    if (existing) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PLATFORM_USER_EMAIL_CONFLICT",
        "A platform admin user with this email already exists.",
        { email: command.email },
      );
    }
    const now = new Date().toISOString();
    const user: PlatformAdminUserRecord = {
      userId: `pa_${randomUUID()}`,
      email: command.email.trim().toLowerCase(),
      displayName: command.displayName.trim(),
      roleCode: command.roleCode,
      status: "invited",
      createdAt: now,
      updatedAt: now,
    };
    this.platformAdminUsers.push({ ...user });
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "create_platform_admin_user",
        resourceType: "platform_admin_user",
        resourceId: user.userId,
        newValuesSummary: { email: user.email, roleCode: user.roleCode },
      },
      requestId,
    );
    return { ...user };
  }

  updatePlatformAdminUserRole(
    userId: string,
    command: UpdatePlatformAdminUserRoleCommand,
    requestId?: string,
  ): PlatformAdminUserRecord {
    const user = this.platformAdminUsers.find((u) => u.userId === userId);
    if (!user) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PLATFORM_USER_NOT_FOUND",
        "Platform admin user not found.",
        { userId },
      );
    }
    const oldRole = user.roleCode;
    user.roleCode = command.roleCode;
    if (command.status) {
      user.status = command.status;
    }
    user.updatedAt = new Date().toISOString();
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "update_platform_admin_user_role",
        resourceType: "platform_admin_user",
        resourceId: userId,
        oldValuesSummary: { roleCode: oldRole },
        newValuesSummary: { roleCode: command.roleCode },
      },
      requestId,
    );
    return { ...user };
  }

  // ── Platform Notices ──────────────────────────────────────────────────────

  listPlatformNotices(): PlatformNoticeRecord[] {
    return this.platformNotices.map((n) => ({ ...n }));
  }

  createPlatformNotice(
    command: CreatePlatformNoticeCommand,
    requestId?: string,
  ): PlatformNoticeRecord {
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
    this.recordAudit(
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
    return { ...notice };
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
    const now = new Date().toISOString();
    this.maintenanceMode = {
      enabled: command.enabled,
      reason: command.reason ?? null,
      scheduledStart: command.scheduledStart ?? null,
      scheduledEnd: command.scheduledEnd ?? null,
      updatedBy: null,
      updatedAt: now,
    };
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: command.enabled
          ? "enable_maintenance_mode"
          : "disable_maintenance_mode",
        resourceType: "platform_maintenance_mode",
        resourceId: null,
        newValuesSummary: {
          enabled: command.enabled,
          reason: command.reason ?? null,
        },
      },
      requestId,
    );
    return { ...this.maintenanceMode };
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
      reviewRequestedBy: null,
      reviewRequestedAt: null,
      scheduledBy: null,
      scheduledAt: null,
      publishedBy: null,
      publishedAt: null,
      supersededByRuleId: null,
      supersededAt: null,
      rollbackHoldReason: null,
      rollbackHeldBy: null,
      rollbackHeldAt: null,
      notes: this.normalizeNullableText(command.notes),
      createdAt: now,
      updatedAt: now,
      availableActions: [],
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

  requestPlatformPricingRuleReview(
    ruleId: string,
    requestId?: string,
    actorId?: string | null,
  ): PlatformPricingRuleRecord {
    const rule = this.requirePricingRule(ruleId);
    if (rule.status !== "draft") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PRICING_RULE_REVIEW_STATE_INVALID",
        "Only draft pricing rules can be moved into review_required.",
        {
          ruleId,
          status: rule.status,
        },
      );
    }

    const reviewActorId = this.requirePlatformAdminActorId(
      actorId,
      "mark pricing rules as review required",
    );
    const reviewedAt = new Date().toISOString();

    rule.status = "review_required";
    rule.reviewRequestedBy = reviewActorId;
    rule.reviewRequestedAt = reviewedAt;
    rule.updatedAt = reviewedAt;

    this.recordAudit(
      {
        actorId: reviewActorId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "request_platform_pricing_rule_review",
        resourceType: "platform_pricing_rule",
        resourceId: rule.ruleId,
        oldValuesSummary: {
          previousStatus: "draft",
        },
        newValuesSummary: {
          status: rule.status,
          version: rule.version,
          applicableTo: rule.applicableTo,
          reviewedAt,
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
    actorId?: string | null,
  ): AuditedActionResult<PricingRulePublishResult> {
    const rule = this.requirePricingRule(ruleId);
    if (rule.status !== "review_required") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PRICING_RULE_REVIEW_REQUIRED",
        "Only review_required pricing rules can be published.",
        {
          ruleId,
          status: rule.status,
        },
      );
    }

    const publisherActorId = this.requirePlatformAdminActorId(
      actorId,
      "publish pricing rules",
    );
    const publishReason = this.requireReason(
      command.reason,
      "publish pricing rules",
    );
    const publishWindow = this.resolvePricingPublishWindow(rule, command);
    const now = new Date().toISOString();
    const publishMode =
      publishWindow.effectiveFrom > now ? "scheduled" : "published";
    const previousPublished = this.findPublishedPricingRule(rule);

    if (publishMode === "published" && previousPublished) {
      this.supersedePricingRule(previousPublished, rule.ruleId, now);
    }

    rule.status = publishMode;
    rule.effectiveFrom = publishWindow.effectiveFrom;
    rule.effectiveTo = publishWindow.effectiveTo;
    rule.updatedAt = now;

    if (publishMode === "scheduled") {
      rule.scheduledBy = publisherActorId;
      rule.scheduledAt = now;
      rule.publishedBy = null;
      rule.publishedAt = null;
    } else {
      rule.scheduledBy = null;
      rule.scheduledAt = null;
      rule.publishedBy = publisherActorId;
      rule.publishedAt = now;
      rule.rollbackHoldReason = null;
      rule.rollbackHeldBy = null;
      rule.rollbackHeldAt = null;
    }

    const auditLog = this.recordAudit(
      {
        actorId: publisherActorId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName:
          publishMode === "scheduled"
            ? "schedule_platform_pricing_rule_publish"
            : "publish_platform_pricing_rule",
        resourceType: "platform_pricing_rule",
        resourceId: rule.ruleId,
        oldValuesSummary: {
          previousStatus: "review_required",
          previousRuleId: previousPublished?.ruleId ?? null,
          previousVersion: previousPublished?.version ?? null,
          previousPublishedAt: previousPublished?.publishedAt ?? null,
        },
        newValuesSummary: {
          ruleId: rule.ruleId,
          version: rule.version,
          status: publishMode,
          effectiveFrom: publishWindow.effectiveFrom,
          effectiveTo: publishWindow.effectiveTo,
          reason: publishReason,
          applicableTo: rule.applicableTo,
          actorId: publisherActorId,
          versionDiff: this.buildPricingRuleVersionDiff(previousPublished, rule),
        },
      },
      requestId,
    );

    return {
      data: {
        rule: this.clonePricingRule(rule),
        receiptStatus: publishMode === "scheduled" ? "accepted" : "completed",
        receiptMessage:
          publishMode === "scheduled"
            ? "Pricing rule scheduled for publish."
            : "Pricing rule published.",
      },
      auditLog,
    };
  }

  activateScheduledPlatformPricingRule(
    ruleId: string,
    requestId?: string,
    actorId?: string | null,
  ): PlatformPricingRuleRecord {
    const rule = this.requirePricingRule(ruleId);
    if (rule.status !== "scheduled") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PRICING_RULE_SCHEDULE_STATE_INVALID",
        "Only scheduled pricing rules can be activated.",
        {
          ruleId,
          status: rule.status,
        },
      );
    }

    const activationAt = new Date().toISOString();
    if (rule.effectiveFrom > activationAt) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PRICING_RULE_SCHEDULE_NOT_READY",
        "Scheduled pricing rules can only be activated at or after effectiveFrom.",
        {
          ruleId,
          effectiveFrom: rule.effectiveFrom,
          activationAt,
        },
      );
    }

    const activationActorId = this.requirePlatformAdminActorId(
      actorId,
      "activate scheduled pricing rules",
    );
    const previousPublished = this.findPublishedPricingRule(rule);
    if (previousPublished) {
      this.supersedePricingRule(previousPublished, rule.ruleId, activationAt);
    }

    rule.status = "published";
    rule.scheduledBy = null;
    rule.scheduledAt = null;
    rule.publishedBy = activationActorId;
    rule.publishedAt = activationAt;
    rule.updatedAt = activationAt;

    this.recordAudit(
      {
        actorId: activationActorId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "activate_scheduled_platform_pricing_rule",
        resourceType: "platform_pricing_rule",
        resourceId: rule.ruleId,
        oldValuesSummary: {
          previousStatus: "scheduled",
          previousRuleId: previousPublished?.ruleId ?? null,
          previousVersion: previousPublished?.version ?? null,
        },
        newValuesSummary: {
          status: rule.status,
          effectiveFrom: rule.effectiveFrom,
          publishedAt: activationAt,
        },
      },
      requestId,
    );

    return this.clonePricingRule(rule);
  }

  setPlatformPricingRuleRollbackHold(
    ruleId: string,
    reason: string,
    requestId?: string,
    actorId?: string | null,
  ): PlatformPricingRuleRecord {
    const rule = this.requirePricingRule(ruleId);
    if (rule.status !== "published") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PRICING_RULE_ROLLBACK_HOLD_STATE_INVALID",
        "Only published pricing rules can enter rollback_hold.",
        {
          ruleId,
          status: rule.status,
        },
      );
    }

    const holdActorId = this.requirePlatformAdminActorId(
      actorId,
      "place pricing rules into rollback hold",
    );
    const holdReason = this.requireReason(
      reason,
      "place pricing rules into rollback hold",
    );
    const holdAt = new Date().toISOString();

    rule.status = "rollback_hold";
    rule.rollbackHoldReason = holdReason;
    rule.rollbackHeldBy = holdActorId;
    rule.rollbackHeldAt = holdAt;
    rule.updatedAt = holdAt;

    this.recordAudit(
      {
        actorId: holdActorId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "set_platform_pricing_rule_rollback_hold",
        resourceType: "platform_pricing_rule",
        resourceId: rule.ruleId,
        oldValuesSummary: {
          previousStatus: "published",
          publishedAt: rule.publishedAt,
        },
        newValuesSummary: {
          status: rule.status,
          rollbackHoldReason: holdReason,
          rollbackHeldAt: holdAt,
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
    return this.normalizePricingRuleRecord(rule);
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
    const normalizedRule = this.normalizePricingRuleRecord({ ...rule });

    return {
      ...normalizedRule,
      availableActions: this.buildPricingRuleAvailableActions(normalizedRule),
    };
  }

  private normalizePricingRuleRecord(
    rule: PlatformPricingRuleRecord,
  ): PlatformPricingRuleRecord {
    const legacyStatus = rule.status as LegacyPlatformPricingRuleStatus;
    rule.status =
      legacyStatus === "active"
        ? "published"
        : legacyStatus === "archived"
          ? "superseded"
          : rule.status;
    rule.reviewRequestedBy = rule.reviewRequestedBy ?? null;
    rule.reviewRequestedAt = rule.reviewRequestedAt ?? null;
    rule.scheduledBy = rule.scheduledBy ?? null;
    rule.scheduledAt = rule.scheduledAt ?? null;
    rule.publishedBy = rule.publishedBy ?? null;
    rule.publishedAt = rule.publishedAt ?? null;
    rule.supersededByRuleId = rule.supersededByRuleId ?? null;
    rule.supersededAt = rule.supersededAt ?? null;
    rule.rollbackHoldReason = rule.rollbackHoldReason ?? null;
    rule.rollbackHeldBy = rule.rollbackHeldBy ?? null;
    rule.rollbackHeldAt = rule.rollbackHeldAt ?? null;
    rule.availableActions = [];

    return rule;
  }

  private buildPricingRuleAvailableActions(
    rule: PlatformPricingRuleRecord,
  ): ResourceActionDescriptor[] {
    const actions: ResourceActionDescriptor[] = [];
    const publishDisabledReasonCode = this.getPricingPublishDisabledReasonCode(
      rule.status,
    );

    if (rule.status === "draft") {
      actions.push({
        action: "request_review",
        enabled: true,
        riskLevel: "medium",
      });
    }

    actions.push({
      action: "publish",
      enabled: rule.status === "review_required",
      ...(publishDisabledReasonCode
        ? {
            disabledReasonCode: publishDisabledReasonCode,
          }
        : {}),
      requiresReason: true,
      riskLevel: "high",
    });

    if (rule.status === "published") {
      actions.push({
        action: "rollback_hold",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      });
    }

    return actions;
  }

  private getPricingPublishDisabledReasonCode(
    status: PlatformPricingRuleStatus,
  ) {
    switch (status) {
      case "draft":
        return "pricing_review_required";
      case "scheduled":
        return "pricing_already_scheduled";
      case "published":
        return "pricing_already_published";
      case "superseded":
        return "pricing_superseded";
      case "rollback_hold":
        return "pricing_rollback_hold_active";
      default:
        return undefined;
    }
  }

  private requireReason(reason: string | null | undefined, action: string) {
    const normalizedReason = this.normalizeNullableText(reason);
    if (!normalizedReason) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ACTION_REASON_REQUIRED",
        `A non-empty reason is required to ${action}.`,
      );
    }

    return normalizedReason;
  }

  private resolvePricingPublishWindow(
    rule: PlatformPricingRuleRecord,
    command: PublishPlatformPricingRuleCommand,
  ) {
    const effectiveFrom =
      this.normalizeNullableText(command.effectiveFrom) ?? rule.effectiveFrom;
    const effectiveTo = this.normalizeNullableText(command.effectiveTo);
    const effectiveFromTime = Date.parse(effectiveFrom);

    if (Number.isNaN(effectiveFromTime)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PRICING_RULE_EFFECTIVE_FROM_INVALID",
        "effectiveFrom must be a valid ISO-8601 timestamp.",
        {
          effectiveFrom,
        },
      );
    }

    if (effectiveTo) {
      const effectiveToTime = Date.parse(effectiveTo);
      if (Number.isNaN(effectiveToTime)) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "PRICING_RULE_EFFECTIVE_TO_INVALID",
          "effectiveTo must be a valid ISO-8601 timestamp.",
          {
            effectiveTo,
          },
        );
      }
      if (effectiveToTime < effectiveFromTime) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "PRICING_RULE_EFFECTIVE_WINDOW_INVALID",
          "effectiveTo must be at or after effectiveFrom.",
          {
            effectiveFrom,
            effectiveTo,
          },
        );
      }
    }

    return {
      effectiveFrom: new Date(effectiveFromTime).toISOString(),
      effectiveTo: effectiveTo
        ? new Date(Date.parse(effectiveTo)).toISOString()
        : null,
    };
  }

  private findPublishedPricingRule(rule: PlatformPricingRuleRecord) {
    return this.pricingRules.find(
      (candidate) =>
        candidate.ruleId !== rule.ruleId &&
        candidate.ruleName === rule.ruleName &&
        candidate.applicableTo === rule.applicableTo &&
        this.normalizePricingRuleRecord(candidate).status === "published",
    );
  }

  private supersedePricingRule(
    rule: PlatformPricingRuleRecord,
    successorRuleId: string,
    supersededAt: string,
  ) {
    rule.status = "superseded";
    rule.effectiveTo = supersededAt;
    rule.supersededByRuleId = successorRuleId;
    rule.supersededAt = supersededAt;
    rule.updatedAt = supersededAt;
  }

  private buildPricingRuleVersionDiff(
    previousPublished: PlatformPricingRuleRecord | undefined,
    nextRule: PlatformPricingRuleRecord,
  ) {
    const changedFields = [
      previousPublished?.version !== nextRule.version ? "version" : null,
      previousPublished?.serviceFeeBps !== nextRule.serviceFeeBps
        ? "serviceFeeBps"
        : null,
      previousPublished?.reimbursementMode !== nextRule.reimbursementMode
        ? "reimbursementMode"
        : null,
      previousPublished?.effectiveFrom !== nextRule.effectiveFrom
        ? "effectiveFrom"
        : null,
      previousPublished?.effectiveTo !== nextRule.effectiveTo
        ? "effectiveTo"
        : null,
      previousPublished?.notes !== nextRule.notes ? "notes" : null,
    ].filter((field): field is string => field !== null);

    return {
      previousRuleId: previousPublished?.ruleId ?? null,
      previousVersion: previousPublished?.version ?? null,
      nextRuleId: nextRule.ruleId,
      nextVersion: nextRule.version,
      changedFields:
        changedFields.length > 0 ? changedFields : ["initial_publish"],
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
