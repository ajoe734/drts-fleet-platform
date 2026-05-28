import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  CrossAppResourceLink,
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
  PublishPlacardVersionCommand,
  PublishPlatformPricingRuleCommand,
  ResourceActionDescriptor,
  PublishPublicInfoVersionCommand,
  PublicInfoVersionRecord,
  SetPlatformMaintenanceModeCommand,
  TenantInvoiceRecord,
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
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  PlatformAdminRepository,
  type PersistPlatformAdminChanges,
} from "./platform-admin.repository";

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
    title: "Planned maintenance window · dispatch pause",
    body: "Platform maintenance is scheduled for 2026-05-15 02:00–04:00 UTC. Dispatch, partner ingress, and webhook delivery will pause during the window.",
    severity: "maintenance",
    status: "scheduled",
    targetAudience: "all",
    scheduledAt: "2026-05-15T02:00:00.000Z",
    resolvedAt: null,
    createdBy: "pa-admin-001",
    createdAt: "2026-05-12T06:00:00.000Z",
    updatedAt: "2026-05-12T06:00:00.000Z",
    changeReason: "Planned infra patching",
  },
  {
    noticeId: "notice-demo-002",
    title: "Webhook delivery lag for selected tenants",
    body: "Cross-app banners remain available, but webhook retries are currently delayed for tenant integrations in APAC.",
    severity: "critical",
    status: "active",
    targetAudience: "ops",
    scheduledAt: null,
    resolvedAt: null,
    createdBy: "pa-operator-001",
    createdAt: "2026-05-23T01:10:00.000Z",
    updatedAt: "2026-05-23T01:18:00.000Z",
    changeReason: "Escalated after health checks failed",
  },
  {
    noticeId: "notice-demo-003",
    title: "Partner sandbox sync restored",
    body: "The partner sandbox backlog has cleared and downstream queues are back to expected latency.",
    severity: "info",
    status: "resolved",
    targetAudience: "tenants",
    scheduledAt: null,
    resolvedAt: "2026-05-20T05:45:00.000Z",
    createdBy: "pa-operator-001",
    createdAt: "2026-05-20T03:10:00.000Z",
    updatedAt: "2026-05-20T05:45:00.000Z",
    changeReason: null,
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
    scheduledStart: "2026-05-15T02:00:00.000Z",
    scheduledEnd: "2026-05-15T04:00:00.000Z",
    updatedBy: "pa-admin-001",
    updatedAt: "2026-05-12T06:00:00.000Z",
    lastEnabledAt: "2026-04-12T09:00:00.000Z",
    affectedServices: ["dispatch", "partner ingress", "webhook delivery"],
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

  private buildNoticeActions(
    notice: PlatformNoticeRecord,
  ): ResourceActionDescriptor[] {
    const actions: ResourceActionDescriptor[] = [
      {
        action: "view_broadcast_history",
        enabled: true,
        riskLevel: "low",
      },
    ];

    if (notice.status !== "resolved") {
      actions.unshift({
        action: "resolve_notice",
        enabled: true,
        riskLevel: "medium",
      });
    }

    return actions;
  }

  private buildNoticeCrossAppLinks(
    noticeId: string,
    audience: PlatformNoticeRecord["targetAudience"],
  ): CrossAppResourceLink[] {
    const links: CrossAppResourceLink[] = [
      {
        targetApp: "ops-console",
        route: `/audit?resourceType=platform_notice&resourceId=${noticeId}`,
        resourceType: "platform_notice",
        resourceId: noticeId,
        openMode: "new_tab",
        label: "Open ops audit view",
      },
    ];

    if (audience === "all" || audience === "tenants") {
      links.push({
        targetApp: "tenant-console",
        route: `/notifications?noticeId=${noticeId}`,
        resourceType: "platform_notice",
        resourceId: noticeId,
        openMode: "new_tab",
        label: "Open tenant banner preview",
      });
    }

    return links;
  }

  private decorateNotice(notice: PlatformNoticeRecord): PlatformNoticeRecord {
    const targets =
      notice.targetAudience === "all"
        ? (["ops", "tenant", "driver"] as const)
        : notice.targetAudience === "tenants"
          ? (["tenant"] as const)
          : notice.targetAudience === "drivers"
            ? (["driver"] as const)
            : (["ops"] as const);

    return {
      ...notice,
      availableActions: this.buildNoticeActions(notice),
      deliverySummary: {
        state:
          notice.status === "active"
            ? "delivering"
            : notice.status === "resolved"
              ? "delivered"
              : "pending",
        deliveredCount: notice.status === "scheduled" ? 0 : targets.length,
        totalCount: targets.length,
        targets: [...targets],
        broadcastAt:
          notice.status === "scheduled" ? notice.scheduledAt : notice.updatedAt,
      },
      crossAppLinks: this.buildNoticeCrossAppLinks(
        notice.noticeId,
        notice.targetAudience,
      ),
    };
  }

  private decorateMaintenanceMode(): PlatformMaintenanceModeRecord {
    return {
      ...this.maintenanceMode,
      availableActions: [
        {
          action: this.maintenanceMode.enabled
            ? "clear_maintenance_mode"
            : "set_maintenance_mode",
          enabled: true,
          requiresReason: true,
          riskLevel: "high",
        },
      ],
      crossAppLinks: [
        {
          targetApp: "ops-console",
          route: "/health",
          resourceType: "platform_maintenance_mode",
          resourceId: "global",
          openMode: "new_tab",
          label: "Open ops health board",
        },
        {
          targetApp: "tenant-console",
          route: "/notifications",
          resourceType: "platform_maintenance_mode",
          resourceId: "global",
          openMode: "new_tab",
          label: "Open tenant banner inbox",
        },
      ],
    };
  }

  listPlatformNotices(): PlatformNoticeRecord[] {
    return this.platformNotices.map((n) => this.decorateNotice(n));
  }

  createPlatformNotice(
    command: CreatePlatformNoticeCommand,
    requestId?: string,
  ): PlatformNoticeRecord {
    this.assertNonBlank(command.title, "title");
    this.assertNonBlank(command.body, "body");
    if (command.severity === "critical" || command.severity === "maintenance") {
      this.assertNonBlank(command.reason ?? "", "reason");
    }
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
      changeReason: command.reason ?? null,
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
    return this.decorateNotice(notice);
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
    return this.decorateNotice(notice);
  }

  // ── Maintenance Mode ──────────────────────────────────────────────────────

  getMaintenanceMode(): PlatformMaintenanceModeRecord {
    return this.decorateMaintenanceMode();
  }

  setMaintenanceMode(
    command: SetPlatformMaintenanceModeCommand,
    requestId?: string,
  ): PlatformMaintenanceModeRecord {
    const now = new Date().toISOString();
    this.assertNonBlank(command.reason ?? "", "reason");
    this.maintenanceMode = {
      enabled: command.enabled,
      reason: command.reason ?? null,
      scheduledStart: command.scheduledStart ?? null,
      scheduledEnd: command.scheduledEnd ?? null,
      updatedBy: null,
      updatedAt: now,
      lastEnabledAt: command.enabled
        ? now
        : (this.maintenanceMode.lastEnabledAt ?? now),
      affectedServices:
        command.enabled || command.scheduledStart || command.scheduledEnd
          ? ["dispatch", "partner ingress", "webhook delivery"]
          : (this.maintenanceMode.affectedServices ?? []),
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
    return this.decorateMaintenanceMode();
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
    this.auditNotificationService.recordAuditLog(auditLogInput);
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
