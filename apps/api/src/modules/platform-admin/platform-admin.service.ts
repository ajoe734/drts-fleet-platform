import { createHash, randomUUID } from "node:crypto";

import {
  HttpStatus,
  Inject,
  Injectable,
  OnModuleInit,
  Optional,
} from "@nestjs/common";

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
  DOCUMENT_ARTIFACT_REBUILD_REGISTRY,
  DOCUMENT_ARTIFACT_STORE,
  InMemoryDocumentArtifactStore,
  type DocumentArtifactRebuildRegistry,
  type DocumentArtifactRecord,
  type DocumentArtifactStore,
} from "../../common/document-artifacts";
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

/**
 * Attempts `restorePlacardArtifactWithRetry` makes before giving up on a
 * transient store failure (R10-F, Codex REOPEN generation
 * fdc2511b33d844c8b89d74ad71a982c9) -- see that method's own doc for why a
 * retry here is always safe.
 */
const PLACARD_PUBLICATION_RESTORE_ATTEMPTS = 3;

// ── Placard PDF rendering (SR-PLACARD-001) ──────────────────────────────────
// Dependency-free, minimal PDF-1.4 writer for vehicle placards.
// Matches the minimal PDF-1.4 writer used by billing settlement (SR-INVOICE-001).

const PLACARD_PDF_LINES_PER_PAGE = 40;

function toPdfAsciiText(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, "?");
}

function escapePdfLiteralText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function chunkPdfLines(lines: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < lines.length; index += size) {
    chunks.push(lines.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function buildPdfPageContentStream(lines: string[]): string {
  const operators: string[] = ["BT", "/F1 10 Tf", "40 760 Td"];
  lines.forEach((line, index) => {
    if (index > 0) {
      operators.push("0 -16 Td");
    }
    operators.push(`(${escapePdfLiteralText(toPdfAsciiText(line))}) Tj`);
  });
  operators.push("ET");
  return operators.join("\n");
}

function buildMinimalPdf(lines: string[]): Buffer {
  const pages = chunkPdfLines(lines, PLACARD_PDF_LINES_PER_PAGE);
  const pageCount = pages.length;
  const fontId = 3 + pageCount * 2;
  const totalObjects = fontId;
  const objectBodies: string[] = new Array(totalObjects + 1).fill("");
  const kids = Array.from(
    { length: pageCount },
    (_, index) => `${3 + index * 2} 0 R`,
  ).join(" ");

  objectBodies[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objectBodies[2] = `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`;

  pages.forEach((pageLines, index) => {
    const pageId = 3 + index * 2;
    const contentId = 4 + index * 2;
    const content = buildPdfPageContentStream(pageLines);
    const contentByteLength = Buffer.byteLength(content, "latin1");
    objectBodies[pageId] =
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> /MediaBox [0 0 612 792] /Contents ${contentId} 0 R >>\nendobj\n`;
    objectBodies[contentId] =
      `${contentId} 0 obj\n<< /Length ${contentByteLength} >>\nstream\n${content}\nendstream\nendobj\n`;
  });

  objectBodies[fontId] =
    `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

  const header = "%PDF-1.4\n";
  const offsets: number[] = new Array(totalObjects + 1).fill(0);
  let offset = Buffer.byteLength(header, "latin1");
  let body = "";
  for (let id = 1; id <= totalObjects; id += 1) {
    offsets[id] = offset;
    const objectBody = objectBodies[id]!;
    body += objectBody;
    offset += Buffer.byteLength(objectBody, "latin1");
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= totalObjects; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(header + body + xref + trailer, "latin1");
}

function buildPlacardPdfRows(
  placard: Pick<
    PlacardVersionRecord,
    | "placardVersionId"
    | "versionCode"
    | "templateName"
    | "publishedAt"
    | "createdAt"
  >,
  source: PublicInfoVersionRecord,
): string[] {
  return [
    `Vehicle Service Placard`,
    `========================================`,
    `Version Code: ${placard.versionCode}`,
    `Placard ID: ${placard.placardVersionId}`,
    `Template: ${placard.templateName}`,
    `Public Info Source: ${toPdfAsciiText(source.title)} (${source.versionId})`,
    `Source Status: ${source.status}`,
    `Booking / Dispatch Phone: ${toPdfAsciiText(source.callPhone ?? "N/A")}`,
    `Customer Complaint Hotline: ${toPdfAsciiText(source.complaintPhone ?? "N/A")}`,
    `Call Rate: ${toPdfAsciiText(source.callRateText ?? "N/A")}`,
    `Fare Rule: ${toPdfAsciiText(source.fareText ?? "N/A")}`,
    `Payment Methods: ${toPdfAsciiText(source.paymentMethodText ?? "N/A")}`,
    `Effective Period: ${source.effectiveFrom ?? "N/A"} to ${source.effectiveTo ?? "indefinite"}`,
    `Published At: ${placard.publishedAt ?? "Draft"}`,
    `Generated At: ${placard.createdAt}`,
    `========================================`,
  ];
}

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

/**
 * `__publishClaimToken` (R7-followthrough/R8/R9) marks a placard record as
 * a durable publish claim that has not been finalized yet -- see
 * `PlatformAdminRepository.claimPlacardPublish`/`finalizePlacardPublish`.
 * It is never part of the public `PlacardVersionRecord` contract; every
 * path that returns a placard to a caller outside this module goes through
 * `stripClaimToken`/`clonePlacardVersion` first.
 */
type PlacardWithClaimToken = PlacardVersionRecord & {
  __publishClaimToken?: string | null;
};

function withClaimToken(
  record: PlacardVersionRecord,
  token: string,
): PlacardWithClaimToken {
  return { ...record, __publishClaimToken: token };
}

function stripClaimToken(record: PlacardVersionRecord): PlacardVersionRecord {
  const clean: PlacardWithClaimToken = { ...record };
  delete clean.__publishClaimToken;
  return clean;
}

function hasPendingPublishClaim(record: PlacardVersionRecord): boolean {
  return Boolean((record as PlacardWithClaimToken).__publishClaimToken);
}

@Injectable()
export class PlatformAdminService implements OnModuleInit {
  private publicInfoVersions = PUBLIC_INFO_SEED.map((version) =>
    this.clonePublicInfoVersion(version),
  );

  private placardVersions: PlacardVersionRecord[] = [];

  /**
   * Serializes `publishPlacardVersion` calls per `placardVersionId` within
   * this process. Without it, two concurrent publish requests for the same
   * placard can both pass the `publishedAt` guard before either awaits
   * anything, race the durable-store write, and leave the live placard's
   * metadata pointing at a hash a *different* completion's bytes actually
   * occupy (R7). A later publish for the same id chains onto whatever
   * promise is already queued, so it only runs -- and only re-checks the
   * guard -- after every earlier one has fully settled, success or failure.
   */
  private readonly placardPublishQueue = new Map<string, Promise<unknown>>();

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
    @Optional()
    @Inject(DOCUMENT_ARTIFACT_STORE)
    private readonly documentArtifactStore: DocumentArtifactStore = new InMemoryDocumentArtifactStore(),
    @Optional()
    @Inject(DOCUMENT_ARTIFACT_REBUILD_REGISTRY)
    documentArtifactRebuildRegistry?: DocumentArtifactRebuildRegistry,
  ) {
    // Materialising real PDF bytes requires awaiting `documentArtifactStore`,
    // which a constructor cannot do; seed placards start as plain clones here
    // and are actually rendered (via `clonePlacardVersion`) in `onModuleInit`,
    // which already runs -- and is already awaited -- before the app accepts
    // any request.
    this.placardVersions = PLACARD_SEED.map((placard) => ({ ...placard }));

    // Registered unconditionally, same convention as
    // `BillingSettlementService`'s "tenant-invoice"/"report" rebuilders: a
    // placard whose `artifactManifestHash` was recorded under a process-local
    // store that predates this durable one (or under a sibling instance, or
    // before this instance restarted) has metadata that proves nothing about
    // what the shared store currently holds. `resolveDocumentArtifact`
    // reports that as "not_found" the same way it would a never-materialised
    // placard, and this rebuilder answers it by deterministically
    // re-deriving the file from this instance's own durably persisted
    // placard + public-info records -- returning null, not throwing, when
    // this instance's own list genuinely has no such id.
    documentArtifactRebuildRegistry?.register(
      "placard",
      (subjectId, expectedSha256) =>
        this.rebuildPlacardArtifact(subjectId, expectedSha256),
    );
  }

  async onModuleInit() {
    if (this.platformAdminRepository) {
      try {
        const persistedState = await this.platformAdminRepository.loadState();
        const persistedAdapters = persistedState.platformAdapters ?? [];
        const hasPersistedState =
          persistedState.publicInfoVersions.length > 0 ||
          persistedState.placardVersions.length > 0;

        if (!hasPersistedState) {
          this.placardVersions = await Promise.all(
            this.placardVersions.map((placard) =>
              this.resolvePlacardVersion(placard),
            ),
          );
          this.persistChanges(
            {
              publicInfoVersions: this.publicInfoVersions.map((version) =>
                this.clonePublicInfoVersion(version),
              ),
              placardVersions: this.placardVersions.map((placard) => ({
                ...placard,
                downloadMetadata: placard.downloadMetadata
                  ? { ...placard.downloadMetadata }
                  : null,
              })),
            },
            "module init bootstrap",
          );
        } else {
          this.publicInfoVersions = persistedState.publicInfoVersions.map(
            (version) => this.clonePublicInfoVersion(version),
          );
          // Keeps a still-pending `__publishClaimToken`, if a sibling
          // instance's claim for one of these placards has not finalized
          // yet (R9) -- `resolvePlacardVersion`, not the external-facing
          // `clonePlacardVersion`, is what populates this cache.
          this.placardVersions = await Promise.all(
            persistedState.placardVersions.map((placard) =>
              this.resolvePlacardVersion(placard),
            ),
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
    } else {
      this.placardVersions = await Promise.all(
        this.placardVersions.map((placard) =>
          this.clonePlacardVersion(placard),
        ),
      );
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
    version.effectiveTo =
      this.normalizeNullableText(command.effectiveTo) ?? version.effectiveTo;
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

  async listPlacardVersions() {
    return Promise.all(
      this.placardVersions.map((placard) => this.clonePlacardVersion(placard)),
    );
  }

  async getPlacardVersion(
    placardVersionId: string,
  ): Promise<PlacardVersionRecord> {
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
    return this.clonePlacardVersion(placard);
  }

  async publishPlacardVersion(
    placardVersionId: string,
    command: PublishPlacardVersionCommand = {},
    requestId?: string,
    publishActorId?: string | null,
  ) {
    void command;
    return this.runExclusivePlacardPublish(placardVersionId, () =>
      this.publishPlacardVersionExclusive(
        placardVersionId,
        requestId,
        publishActorId,
      ),
    );
  }

  /**
   * Chains `fn` onto whatever publish for this `placardVersionId` is already
   * queued, so concurrent calls run one at a time, in call order, and a
   * later one always observes an earlier one's fully-settled result (success
   * or failure) before it re-checks `placard.publishedAt` -- see
   * `placardPublishQueue`'s own comment for why this matters (R7). `fn` runs
   * via `.then(fn, fn)` so a rejected predecessor still unblocks the next
   * queued call instead of wedging it forever.
   */
  private runExclusivePlacardPublish<T>(
    placardVersionId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous =
      this.placardPublishQueue.get(placardVersionId) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    this.placardPublishQueue.set(placardVersionId, next);
    return next;
  }

  private async publishPlacardVersionExclusive(
    placardVersionId: string,
    requestId?: string,
    publishActorId?: string | null,
  ) {
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
    // (R8-followthrough, Codex REOPEN generation 2b738adf3c2d4a508800cb3a8df0f553)
    // This cached `placard` can be a restarted/freshly-booted instance's
    // bootstrap snapshot of ANOTHER instance's claim that has since been
    // abandoned (crashed/lost network before finalize/release). Such a
    // snapshot still carries `publishedAt` (set when the claim was taken)
    // AND the pending `__publishClaimToken` -- it is not proof of a
    // finalized publish (see `hasPendingPublishClaim`). Rejecting here
    // purely on cached `publishedAt`, without ever reaching
    // `claimPlacardPublish`'s own stale-claim reclaim guard below, would
    // make every instance booted after an abandoned claim permanently
    // unable to publish this placard even once the abandonment window has
    // elapsed. Only a cached record that is ALREADY known-finalized (no
    // repository to double-check against, or no pending claim token) is
    // trustworthy enough to reject without a round trip.
    if (
      placard.publishedAt &&
      (!this.platformAdminRepository || !hasPendingPublishClaim(placard))
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PLACARD_VERSION_ALREADY_PUBLISHED",
        "This placard version has already been published.",
        { placardVersionId, publishedAt: placard.publishedAt },
      );
    }

    const now = new Date().toISOString();
    // Render against a staged copy, not the live placard: `ensurePlacardArtifact`
    // performs a real durable-store write (`put`), which can fail after this
    // instance has already decided to publish (network blip, throttled
    // storage, etc). Mutating `placard.publishedAt` before that write is
    // confirmed would leave a transient failure indistinguishable from a
    // genuine publish -- `placard.publishedAt` truthy blocks every retry with
    // ALREADY_PUBLISHED even though no durable bytes exist. Staging first
    // means a failed write leaves the original record untouched and
    // retryable; only a successful write's results are copied back.
    // `__publishClaimToken` (R8/R9) is this attempt's own unique marker --
    // never part of the public contract, always stripped before this
    // placard is returned to any caller -- see `claimPlacardPublish`.
    const claimToken = randomUUID();
    const staged: PlacardVersionRecord = withClaimToken(
      { ...placard, publishedAt: now, updatedAt: now },
      claimToken,
    );

    // `runExclusivePlacardPublish` only rules out another publish call IN
    // THIS PROCESS reaching here concurrently -- it cannot see a different
    // Cloud Run instance racing to publish the same never-before-published
    // placard. Claim the publish in the durable record BEFORE either
    // instance touches the document-artifact store: the claim is an atomic
    // `WHERE publishedAt IS NULL` conditional write, so exactly one
    // concurrent caller wins it. A losing caller must never render or store
    // bytes -- it adopts whatever the winner actually persisted instead.
    const claim = this.platformAdminRepository
      ? await this.platformAdminRepository.claimPlacardPublish(staged)
      : { claimed: true, currentRecord: null };

    if (!claim.claimed) {
      if (claim.currentRecord) {
        const winnerIndex = this.placardVersions.findIndex(
          (candidate) => candidate.placardVersionId === placardVersionId,
        );
        if (winnerIndex >= 0) {
          // The winner's own claim snapshot, cached verbatim -- including
          // its `__publishClaimToken` if it has not finalized yet (R9).
          // `clonePlacardVersion`/`ensurePlacardArtifact` must not treat a
          // record carrying that token as proof of a completed publish;
          // they re-resolve it against the repository instead of trusting
          // this snapshot's `artifactManifestHash`.
          this.placardVersions[winnerIndex] = { ...claim.currentRecord };
        }
      }
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PLACARD_VERSION_ALREADY_PUBLISHED",
        "This placard version has already been published.",
        {
          placardVersionId,
          publishedAt: claim.currentRecord?.publishedAt ?? null,
        },
      );
    }

    // The repository may have reconciled an earlier, ambiguously-acked
    // attempt by THIS caller (R8) and returned that earlier attempt's own
    // committed claim instead of rejecting outright. Keep working against
    // whatever claim actually landed, not necessarily `staged` itself.
    const wonClaim = claim.currentRecord ?? staged;

    try {
      // (R7/R8 byte-ownership fix, Codex REOPEN generation
      // f556818456f9441c80a29478e7910bea) The claim above only fences the
      // durable *record* -- it does not stop this attempt's own object
      // write from landing late. A previous version of this method relied
      // solely on the read-back below, which only catches a stale write
      // that lands BEFORE it runs; a write delayed past finalize (a slow
      // network, not a slow claimant) still silently clobbered the actual
      // winner's bytes. Capturing this attempt's baseline generation here,
      // before render, and fencing the write itself against it (see
      // `renderPlacardArtifact`'s `fenceGeneration`) closes that gap: ANY
      // write that lands after another writer has changed the object is
      // rejected by the store, no matter how late it arrives.
      const baselineArtifact = await this.documentArtifactStore.get(
        "placard",
        placard.placardVersionId,
      );
      // Force re-render so PDF reflects the actual publishedAt timestamp
      await this.ensurePlacardArtifact(
        wonClaim,
        true,
        baselineArtifact?.record.generation ?? null,
      );

      // The claim above only fences the durable *record*; the fenced write
      // just above only fences against THIS call's own stale baseline. Both
      // leave a gap this re-read closes: a generic writer outside this
      // method's own claim/fence protocol (or a store-level anomaly) that
      // mutates the same object immediately after this call's write landed,
      // with no repository involved at all to detect it via `finalize`
      // below (that path requires a real, configured repository). Trust
      // what the store actually has now, not only what this call's own
      // render produced, before committing metadata to it.
      //
      // (R10-A, Codex REOPEN generation 9f5f14e9954f4ee9bbb2cb629880b777)
      // A transport failure on THIS read -- or this check's own mismatch
      // throw -- used to fall straight through to the generic `catch`
      // below, which only released the DB claim and never restored the
      // object. The `catch` now also calls
      // `repairPlacardArtifactAfterLostClaim`, so either outcome from this
      // read is covered, not just a clean `finalize` rejection.
      const storedEntry = await this.documentArtifactStore.get(
        "placard",
        placard.placardVersionId,
      );
      if (
        !storedEntry ||
        storedEntry.record.sha256 !== wonClaim.artifactManifestHash
      ) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "PLACARD_PUBLISH_CONFLICT",
          "This placard's durable artifact changed during publish. Retry the publish.",
          {
            placardVersionId,
            expectedSha256: wonClaim.artifactManifestHash,
            actualSha256: storedEntry?.record.sha256 ?? null,
          },
        );
      }

      // Fenced, awaited commit of the claim this call already won: the
      // caller never observes success before the durable record actually
      // reflects it, unlike the fire-and-forget `persistChanges` used
      // elsewhere in this service. Dropping the token here is what tells a
      // later reader this row is actually finalized, not merely claimed
      // (R9); a `false` result means something unexpected already moved
      // the row out from under this claim, so treat it as a conflict
      // rather than reporting success for a record that does not actually
      // reflect it.
      if (this.platformAdminRepository) {
        const finalized = await this.platformAdminRepository.finalizePlacardPublish(
          stripClaimToken(wonClaim),
          claimToken,
        );
        if (!finalized) {
          // (R10 byte-ownership compensation) The DB CAS above is the
          // actual source of truth on ownership and has just said this
          // attempt lost it, which can happen even though this attempt's
          // own object write above legitimately passed its own fence (its
          // baseline read stalled long enough to alias a reclaiming
          // instance's already-finalized bytes as "unchanged" -- R10). The
          // object must not keep reflecting this attempt's bytes; see
          // `repairPlacardArtifactAfterLostClaim` for how it is put back.
          await this.repairPlacardArtifactAfterLostClaim(
            placard.placardVersionId,
          );
          throw new ApiRequestError(
            HttpStatus.CONFLICT,
            "PLACARD_PUBLISH_CONFLICT",
            "This placard's publish claim was superseded before it could be finalized. Retry the publish.",
            { placardVersionId },
          );
        }

        // (R10-C byte-ownership compensation, Codex REOPEN generation
        // ac45f6a18eb347a397a7f5faf84f00d7) This call just won the DB race,
        // but that does not prove the object still holds the bytes this
        // call verified above: a losing sibling can read the object AFTER
        // this call's own write (passing ITS fence legitimately, since it
        // is reading current state, not a stale baseline), overwrite it,
        // then lose the DB race and call `repairPlacardArtifactAfterLostClaim`
        // itself -- but at that moment this row still carries THIS call's
        // now-dropped claim token as "pending" from the loser's point of
        // view, so the loser's own repair correctly no-ops and defers to
        // "whichever attempt eventually finalizes", i.e. here. Calling it
        // unconditionally closes that loop; it is a cheap no-op on the
        // overwhelmingly common case where the store already matches
        // `wonClaim.artifactManifestHash`.
        await this.repairPlacardArtifactAfterLostClaim(
          placard.placardVersionId,
        );
      }
    } catch (error) {
      if (this.platformAdminRepository) {
        const reverted: PlacardVersionRecord = {
          ...placard,
          publishedAt: null,
          updatedAt: now,
        };
        await this.platformAdminRepository.releasePlacardPublishClaim(
          placardVersionId,
          wonClaim.publishedAt!,
          reverted,
          claimToken,
        );
        // (R10-A byte-ownership compensation on a failed/ambiguous
        // attempt, Codex REOPEN generation
        // 9f5f14e9954f4ee9bbb2cb629880b777) An error here is not only "the
        // DB CAS reported loss" (handled above, before this attempt even
        // reaches `catch`) -- it can be any failure AFTER this attempt's
        // own object write already landed, e.g. a transport error on
        // whatever this attempt did next. Whether or not this attempt's
        // own write actually clobbered the real winner, repairing is
        // idempotent and safe (see `repairPlacardArtifactAfterLostClaim`),
        // so it always runs here too rather than only on the clean
        // `!finalized` path above.
        await this.repairPlacardArtifactAfterLostClaim(placardVersionId);
      }
      throw error;
    }

    placard.publishedAt = wonClaim.publishedAt;
    placard.updatedAt = wonClaim.updatedAt;
    placard.artifactFileId = wonClaim.artifactFileId;
    placard.artifactManifestHash = wonClaim.artifactManifestHash;
    placard.artifactDownloadUrl = wonClaim.artifactDownloadUrl;
    placard.artifactExpiresAt = wonClaim.artifactExpiresAt;
    placard.downloadMetadata = wonClaim.downloadMetadata ?? null;

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

  async generatePlacardVersion(
    command: GeneratePlacardVersionCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.versionCode, "versionCode");
    this.assertNonBlank(command.publicInfoVersionId, "publicInfoVersionId");
    this.assertNonBlank(command.templateName, "templateName");
    const publicInfoVersion = this.requirePublicInfoVersion(
      command.publicInfoVersionId,
    );
    if (publicInfoVersion.status === "retired") {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PUBLIC_INFO_VERSION_RETIRED",
        "Cannot generate placard from a retired public info version.",
        {
          publicInfoVersionId: command.publicInfoVersionId,
          status: publicInfoVersion.status,
        },
      );
    }
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

    // Materialise real PDF bytes and sign the URL
    await this.ensurePlacardArtifact(placard);

    this.placardVersions = [
      await this.clonePlacardVersion(placard),
      ...this.placardVersions,
    ];
    // Awaited, not fire-and-forget (R7-followthrough): this id is about to
    // be returned to the caller, who can immediately try to publish it on
    // this instance or a sibling one. If this draft write were still in
    // flight when that publish's claim/finalize committed, it could land
    // after them and regress the row back to pre-publish content.
    await this.persistChanges(
      {
        placardVersions: [await this.clonePlacardVersion(placard)],
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
          ...(await this.clonePlacardVersion(placard)),
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

  private isPlacardArtifactExpired(
    artifactUrl: string | null | undefined,
    artifactExpiresAt: string | null | undefined,
  ): boolean {
    if (artifactExpiresAt) {
      const expiry = Date.parse(artifactExpiresAt);
      if (!Number.isNaN(expiry)) {
        return expiry <= Date.now();
      }
    }
    if (!artifactUrl) {
      return true;
    }
    try {
      const parsed = new URL(artifactUrl, "http://controlled-download.invalid");
      const param = parsed.searchParams.get("expires_at");
      if (!param) return true;
      const expiry = Date.parse(param);
      return Number.isNaN(expiry) ? true : expiry <= Date.now();
    } catch {
      return true;
    }
  }

  /**
   * `DOCUMENT_ARTIFACT_STORE` is now a durable, shared backend (see
   * `document-artifact-runtime.config.ts`): the exact bytes `put` there at
   * render time survive a restart and are visible from every instance, so
   * once `placard.artifactManifestHash` is set it is permanent proof the
   * bytes exist -- there is no need to re-check the store on every read.
   * Only an explicit `forceRerender` (the placard's own mutable fields, e.g.
   * `publishedAt`, are deliberately baked into its PDF) or a
   * never-before-materialised placard actually renders and calls `put`.
   */
  private async ensurePlacardArtifact(
    placard: PlacardVersionRecord,
    forceRerender = false,
    fenceGeneration?: string | null,
  ): Promise<PlacardVersionRecord> {
    const materialised = !forceRerender && placard.artifactManifestHash != null;
    const expired = this.isPlacardArtifactExpired(
      placard.artifactDownloadUrl,
      placard.artifactExpiresAt,
    );

    if (materialised && !expired && placard.artifactDownloadUrl) {
      return placard;
    }

    if (materialised) {
      // Only the signed link's window has lapsed; the durable store already
      // holds the exact bytes behind `artifactManifestHash` -- reissue the
      // signature over that same unchanged hash, never re-render.
      const downloadMetadata = this.createPlacardDownloadMetadata(
        placard.placardVersionId,
        placard.artifactManifestHash!,
      );
      placard.artifactDownloadUrl = downloadMetadata.downloadUrl;
      placard.artifactExpiresAt = downloadMetadata.expiresAt;
      placard.downloadMetadata = downloadMetadata;
      return placard;
    }

    const record = await this.renderPlacardArtifact(placard, {
      fenceGeneration,
    });

    const downloadMetadata = this.createPlacardDownloadMetadata(
      placard.placardVersionId,
      record.sha256,
    );

    placard.artifactFileId =
      this.normalizeNullableText(placard.artifactFileId) ??
      `placard-${record.sha256.slice(0, 16)}`;
    placard.artifactManifestHash = record.sha256;
    placard.artifactDownloadUrl = downloadMetadata.downloadUrl;
    placard.artifactExpiresAt = downloadMetadata.expiresAt;
    placard.downloadMetadata = downloadMetadata;

    return placard;
  }

  /**
   * Renders this placard's PDF bytes from its own fields and the source
   * `PublicInfoVersionRecord` it was generated from. The one rendering logic
   * both `ensurePlacardArtifact`'s first materialisation/republish and
   * `rebuildPlacardArtifact` go through, so a sibling instance or a
   * post-restart instance recovering a verified link gets byte-identical
   * content to what was originally issued (as long as the source public-info
   * record has not itself changed since -- see `rebuildPlacardArtifact` for
   * what happens when it has).
   *
   * `recover: true` (used only by `rebuildPlacardArtifact`) writes with
   * `putIfAbsent` instead of `put`: that recovery path can race a sibling
   * instance's own concurrent recovery of the exact same (kind, subjectId),
   * and an unconditional overwrite could clobber bytes the sibling already
   * correctly restored. A producer's own explicit issuance/republish
   * (`recover` left `false` and `fenceGeneration` left `undefined`) is never
   * racing a *recovery* in this sense -- writing its own newly rendered
   * bytes is the legitimate, intended overwrite -- so it keeps using `put`.
   *
   * `fenceGeneration` (R7/R8 byte-ownership fix, Codex REOPEN generation
   * f556818456f9441c80a29478e7910bea), used only by the publish path via
   * `ensurePlacardArtifact`, conditions the write on the object's state not
   * having moved since the caller's own baseline read: `null` means the
   * caller believed nothing was stored yet, a string means the caller
   * observed exactly that generation. This is what actually stops a
   * publish attempt whose claim was reclaimed and finalized by another
   * instance while this attempt's own write was still in flight (a slow
   * network, not a slow claimant) from clobbering the real winner's bytes
   * on arrival -- the DB claim token alone fences the *record*, never the
   * object. A fenced-out write throws `PLACARD_PUBLISH_CONFLICT` instead of
   * returning a record for bytes that were never actually stored.
   */
  /**
   * The pure rendering step `renderPlacardArtifact` builds on: a placard's
   * PDF bytes are solely a function of its own fields and the source
   * `PublicInfoVersionRecord` currently held in memory -- no store access,
   * no side effects.
   *
   * (R10-E, Codex REOPEN generation fdc2511b33d844c8b89d74ad71a982c9) A
   * repair/restore no longer re-renders through this at all -- it copies
   * `preservePlacardPublicationBytes`'s own durable, content-addressed copy
   * of whatever a winner's render originally produced instead, which stays
   * correct even after `this.publicInfoVersions` (or the durable source row
   * itself) has legitimately moved on since. This stays the one rendering
   * path `renderPlacardArtifact` uses for an actual new issuance.
   */
  private renderPlacardBytes(placard: PlacardVersionRecord): Buffer {
    const publicInfoVersion =
      this.publicInfoVersions.find(
        (v) => v.versionId === placard.publicInfoVersionId,
      ) ?? null;
    return publicInfoVersion
      ? buildMinimalPdf(buildPlacardPdfRows(placard, publicInfoVersion))
      : buildMinimalPdf([
          `Vehicle Service Placard ${placard.versionCode}`,
          `Placard ID: ${placard.placardVersionId}`,
          `Source Version: ${placard.publicInfoVersionId}`,
          `Generated At: ${placard.createdAt}`,
        ]);
  }

  private async renderPlacardArtifact(
    placard: PlacardVersionRecord,
    options: {
      recover?: boolean;
      fenceGeneration?: string | null | undefined;
    } = {},
  ): Promise<DocumentArtifactRecord> {
    const bytes = this.renderPlacardBytes(placard);
    const mimeType = "application/pdf";
    // (R10-E/R10-F byte-ownership fix, Codex REOPEN generation
    // fdc2511b33d844c8b89d74ad71a982c9) Preserve this exact render BEFORE
    // issuing any of the writes below, regardless of which one actually
    // runs -- see `preservePlacardPublicationBytes` for why a durable,
    // content-addressed copy is what lets a later repair restore these
    // precise bytes even after the source they came from has legitimately
    // moved on.
    await this.preservePlacardPublicationBytes(
      placard.placardVersionId,
      bytes,
      mimeType,
    );
    const command = {
      kind: "placard" as const,
      subjectId: placard.placardVersionId,
      mimeType,
      bytes,
    };

    if (options.recover) {
      const { record } = await this.documentArtifactStore.putIfAbsent(
        command,
      );
      return record;
    }
    if (options.fenceGeneration !== undefined) {
      const result = await this.documentArtifactStore.putIfUnchanged(
        command,
        options.fenceGeneration,
      );
      if (!result.applied) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "PLACARD_PUBLISH_CONFLICT",
          "This placard's durable artifact changed during publish. Retry the publish.",
          {
            placardVersionId: placard.placardVersionId,
            expectedSha256: createHash("sha256").update(bytes).digest("hex"),
            actualSha256: result.record?.sha256 ?? null,
          },
        );
      }
      return result.record;
    }
    return this.documentArtifactStore.put(command);
  }

  /**
   * (R10 byte-ownership compensation, Codex REOPEN generation
   * 9f5f14e9954f4ee9bbb2cb629880b777) Called after a publish attempt has
   * lost (or cannot prove it won) ownership of `placardVersionId`'s DB row,
   * from both `publishPlacardVersionExclusive`'s `!finalized` branch and
   * its generic `catch`. Never trusts "whatever I personally observed
   * before I wrote" as the thing to restore -- a prior design did exactly
   * that (restore this attempt's own pre-write baseline), which is only
   * correct for a single loser overwriting the actual winner. With two or
   * more overlapping losers, a later loser's baseline can itself already
   * be an earlier loser's corruption, so "restore my baseline" durably
   * reinstates THAT corruption instead of the real winner's bytes (R10-B).
   *
   * - If the repository has no row yet, or the row is unpublished, or it
   *   still carries a pending `__publishClaimToken` (someone else's claim
   *   has not finalized yet), there is no authoritative winner to restore
   *   TO yet -- do nothing. Whichever attempt eventually finalizes that
   *   row calls this same method on every one of its own losing siblings'
   *   behalf once IT is the authoritative winner, so the gap closes on the
   *   next actual finalize, not on a guess made before one exists.
   *   (R10-C, Codex REOPEN generation ac45f6a18eb347a397a7f5faf84f00d7)
   *   That last sentence was only a design intent until this generation:
   *   `publishPlacardVersionExclusive`'s success path did not actually call
   *   this method, so a loser whose repair deferred to "the eventual
   *   winner's own finalize" was deferring to a call that never happened,
   *   permanently stranding its own corrupting write. The winner's success
   *   path now calls this unconditionally after its own finalize commits.
   * - Otherwise, restore from `restorePlacardArtifactWithRetry` -- see its
   *   own doc for what changed and why (R10-E/R10-F, Codex REOPEN
   *   generation fdc2511b33d844c8b89d74ad71a982c9): this used to re-render
   *   deterministically from the authoritative row and a FRESH read of the
   *   source `PublicInfoVersionRecord`, which was correct only as long as
   *   that source had not itself legitimately moved on since the real
   *   winner's own original render (R10-D fenced the loser's STALE cache,
   *   but not a legitimate mutation landing between render and repair).
   *   Copying the winner's own durably preserved bytes instead of
   *   re-deriving them makes that question moot -- and makes retrying a
   *   transient store failure here always safe, never a risk of landing on
   *   different (wrong) content between attempts.
   */
  private async repairPlacardArtifactAfterLostClaim(
    placardVersionId: string,
  ): Promise<void> {
    if (!this.platformAdminRepository) {
      return;
    }

    let authoritative: PlacardVersionRecord | null;
    try {
      authoritative = await this.platformAdminRepository.getPlacardVersionRecord(
        placardVersionId,
      );
    } catch {
      return;
    }
    if (!authoritative) {
      return;
    }

    await this.restorePlacardArtifactWithRetry(authoritative);
  }

  private placardPublicationBackupSubjectId(
    placardVersionId: string,
    sha256: string,
  ): string {
    return `${placardVersionId}::publication-backup::${sha256}`;
  }

  /**
   * (R10-E/R10-F byte-ownership fix, Codex REOPEN generation
   * fdc2511b33d844c8b89d74ad71a982c9) A durable, content-addressed copy of
   * this exact render -- `renderPlacardArtifact` calls this before issuing
   * ANY of its own writes, regardless of which one actually runs -- stored
   * under a key only this hash can ever name, independent of whatever the
   * shared (kind, subjectId) public slot holds afterward, and independent
   * of whatever the source `PublicInfoVersionRecord` looks like later.
   * `restorePlacardPublicationBackup` reads this back instead of
   * re-deriving bytes from current state, which is what let a legitimate
   * source mutation between a render and a later repair make an
   * already-issued publication's own bytes permanently unrecoverable
   * (R10-E): the source can move on; this copy never does.
   *
   * `putIfAbsent` is the right primitive here, not `put`: two renders that
   * happen to produce identical bytes (same placard, same source) safely
   * agree on the same backup key and never re-write it; renders that differ
   * land at different keys and can never collide or clobber each other.
   * Best-effort on purpose -- a failure here must not block the render this
   * call is actually performing; a missing backup just means a later
   * repair/restore attempt safely declines instead of corrupting anything,
   * the same abstain-on-uncertainty posture every durable read in this area
   * already has.
   */
  private async preservePlacardPublicationBytes(
    placardVersionId: string,
    bytes: Buffer,
    mimeType: string,
  ): Promise<void> {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    try {
      await this.documentArtifactStore.putIfAbsent({
        kind: "placard",
        subjectId: this.placardPublicationBackupSubjectId(
          placardVersionId,
          sha256,
        ),
        mimeType,
        bytes,
      });
    } catch (error) {
      this.platformAdminRepository?.reportPersistenceFailure(
        error,
        "placard publication backup",
      );
    }
  }

  /**
   * Restores `authoritative`'s own durably preserved bytes (see
   * `preservePlacardPublicationBytes`) into the shared public slot, if the
   * slot does not already hold them. Never re-derives from current state --
   * only ever copies bytes a winner already successfully rendered under
   * this EXACT hash, so a legitimate source mutation since that render can
   * never make them unrecoverable (R10-E). Deliberately lets a store
   * failure propagate (rather than swallowing it) so
   * `restorePlacardArtifactWithRetry` can retry; returns null only for a
   * genuine "nothing to restore" (already correct, row not actually
   * published/finalized yet, or no backup exists for this hash) -- never
   * for a transient failure.
   */
  private async restorePlacardPublicationBackup(
    authoritative: PlacardVersionRecord,
  ): Promise<DocumentArtifactRecord | null> {
    if (
      !authoritative.publishedAt ||
      !authoritative.artifactManifestHash ||
      hasPendingPublishClaim(authoritative)
    ) {
      return null;
    }
    const { placardVersionId, artifactManifestHash } = authoritative;

    const current = await this.documentArtifactStore.get(
      "placard",
      placardVersionId,
    );
    if (current && current.record.sha256 === artifactManifestHash) {
      return current.record;
    }

    const backup = await this.documentArtifactStore.get(
      "placard",
      this.placardPublicationBackupSubjectId(
        placardVersionId,
        artifactManifestHash,
      ),
    );
    if (!backup || backup.record.sha256 !== artifactManifestHash) {
      return null;
    }

    const result = await this.documentArtifactStore.putIfUnchanged(
      {
        kind: "placard",
        subjectId: placardVersionId,
        mimeType: backup.record.mimeType,
        bytes: backup.bytes,
      },
      current?.record.generation ?? null,
    );
    return result.applied ? result.record : null;
  }

  /**
   * (R10-F fix, Codex REOPEN generation fdc2511b33d844c8b89d74ad71a982c9) A
   * single transient store failure anywhere inside
   * `restorePlacardPublicationBackup` used to permanently abandon the
   * fix-up with no retry -- the exact gap this round's reopen reproduced
   * (one modeled `GetObjectCommand` failure inside the success-path repair
   * left a winner's finalized row pointing at a stale writer's bytes
   * forever). Restoring is now a pure copy of immutable, content-addressed
   * bytes, so unlike the old re-render-from-current-source approach a
   * retry can never land on different (wrong) content; only a failure that
   * persists across every attempt is treated as "could not repair this
   * time", not swallowed on the first blip.
   */
  private async restorePlacardArtifactWithRetry(
    authoritative: PlacardVersionRecord,
    attempts = PLACARD_PUBLICATION_RESTORE_ATTEMPTS,
  ): Promise<DocumentArtifactRecord | null> {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.restorePlacardPublicationBackup(authoritative);
      } catch (error) {
        if (attempt >= attempts) {
          this.platformAdminRepository?.reportPersistenceFailure(
            error,
            "placard publication backup restore",
          );
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Registered with `DocumentArtifactRebuildRegistry` for kind "placard":
   * lets `ControlledDownloadController` recover a verified, unexpired link
   * whose bytes are genuinely missing from the durable store -- including a
   * placard whose `artifactManifestHash` was only ever recorded against an
   * older process-local store, never this durable one -- by re-deriving the
   * file from this placard's own durably persisted record. Returns null, not
   * a thrown error, when this instance's own placard list has no such id,
   * which the registry contract treats as "nothing to rebuild", not a
   * rebuild failure.
   *
   * The re-derived bytes depend on the CURRENT `PublicInfoVersionRecord` --
   * `buildPlacardPdfRows` bakes in its `status`/`effectiveTo`, which
   * `publishPublicInfoVersion` mutates for any version a later one retires.
   * A placard generated before that mutation has an `artifactManifestHash`
   * recovery can no longer reproduce: exact-byte recovery is not possible
   * without a durable snapshot of those inputs at issuance time, which this
   * store does not keep. Rather than silently write mismatching bytes under
   * a hash that still claims to be the original -- or leave this placard's
   * own get/reissue path advertising a hash the store can now never produce
   * again -- `migratePlacardArtifactAfterSourceDrift` adopts the
   * deterministic current-state render as this placard's new canonical
   * artifact, explicitly and audited, once that drift is detected.
   *
   * `expectedSha256` (R10-E/R10-F fix, Codex REOPEN generation
   * fdc2511b33d844c8b89d74ad71a982c9), when supplied, is
   * `ControlledDownloadController`'s own "content_mismatch" recovery
   * attempt -- an object already exists at this (kind, subjectId), just
   * not matching this one verified link's own manifest hash. That case
   * must NEVER fall through to the current-state re-render below: doing so
   * could legitimately disagree with a real object other still-valid links
   * depend on and overwrite it (see `ControlledDownloadController`'s own
   * comment). Instead this only ever asks the durable repository whether
   * `expectedSha256` is STILL the row's own current, finalized hash --
   * never trusting the caller's claim on its own -- and if so restores that
   * exact publication's own durably preserved bytes (`preservePlacardPublicationBytes`)
   * via the same path `repairPlacardArtifactAfterLostClaim` uses. A hash
   * that is not (or no longer) the row's own returns null here, same as
   * having nothing registered: it is a genuinely stale or forged link, and
   * restoring it would resurrect bytes a later, legitimate republish has
   * already superseded.
   */
  private async rebuildPlacardArtifact(
    placardVersionId: string,
    expectedSha256?: string,
  ): Promise<DocumentArtifactRecord | null> {
    if (expectedSha256 !== undefined) {
      if (!this.platformAdminRepository) {
        return null;
      }
      let authoritative: PlacardVersionRecord | null;
      try {
        authoritative =
          await this.platformAdminRepository.getPlacardVersionRecord(
            placardVersionId,
          );
      } catch {
        return null;
      }
      if (
        !authoritative ||
        authoritative.artifactManifestHash !== expectedSha256
      ) {
        return null;
      }
      return this.restorePlacardArtifactWithRetry(authoritative);
    }

    const placard = this.placardVersions.find(
      (candidate) => candidate.placardVersionId === placardVersionId,
    );
    if (!placard) {
      return null;
    }
    try {
      const record = await this.renderPlacardArtifact(placard, {
        recover: true,
      });
      if (
        placard.artifactManifestHash &&
        record.sha256 !== placard.artifactManifestHash
      ) {
        await this.migratePlacardArtifactAfterSourceDrift(placard, record);
      }
      return record;
    } catch {
      return null;
    }
  }

  /**
   * Called only when a recovery render's hash disagrees with this placard's
   * own recorded `artifactManifestHash` -- the source has drifted since
   * issuance (see `rebuildPlacardArtifact`). Adopts `record` as this
   * placard's new canonical artifact: an explicit, audited migration to the
   * best currently-derivable render, not a claim that these are the
   * originally issued bytes.
   */
  private async migratePlacardArtifactAfterSourceDrift(
    placard: PlacardVersionRecord,
    record: DocumentArtifactRecord,
  ): Promise<void> {
    const previousManifestHash = placard.artifactManifestHash;
    const downloadMetadata = this.createPlacardDownloadMetadata(
      placard.placardVersionId,
      record.sha256,
    );
    placard.artifactManifestHash = record.sha256;
    placard.artifactFileId = `placard-${record.sha256.slice(0, 16)}`;
    placard.artifactDownloadUrl = downloadMetadata.downloadUrl;
    placard.artifactExpiresAt = downloadMetadata.expiresAt;
    placard.downloadMetadata = downloadMetadata;
    placard.updatedAt = new Date().toISOString();

    this.persistChanges(
      { placardVersions: [await this.clonePlacardVersion(placard)] },
      "migrate_placard_artifact_after_source_drift",
    );
    this.recordAudit({
      actorId: null,
      actorType: "platform_admin",
      tenantId: null,
      moduleName: "platform-admin",
      actionName: "migrate_placard_artifact_after_source_drift",
      resourceType: "placard_version",
      resourceId: placard.placardVersionId,
      oldValuesSummary: { artifactManifestHash: previousManifestHash },
      newValuesSummary: { artifactManifestHash: record.sha256 },
    });
  }

  /**
   * (R9) `placard` can be a losing/booting instance's cached snapshot of
   * another instance's still-pending publish claim -- carrying
   * `publishedAt` already set, but an `artifactManifestHash` that is only
   * the pre-publish value (see `claimPlacardPublish`'s own comment). Taking
   * that at face value would sign download links for bytes the claim owner
   * has not actually produced yet. Resolve the authoritative row from the
   * repository first whenever the cached copy still carries a pending
   * claim token; once the claim has actually finalized (token gone), adopt
   * that authoritative copy into this instance's own cache so later reads
   * of the same id do not need to repeat the round trip. If the claim is
   * still genuinely in flight elsewhere, there is nothing more authoritative
   * to serve yet -- fall through on the last-known snapshot, same as
   * before this fix.
   *
   * (R9 additional reader gap, Codex REOPEN generation
   * 2b738adf3c2d4a508800cb3a8df0f553) An instance that never itself
   * attempted a claim -- e.g. booted before any publish and only ever
   * holding the plain, never-published draft -- carries NO claim token at
   * all, so the original `hasPendingPublishClaim` gate above never fires
   * for it even after a sibling instance finishes publishing elsewhere.
   * Any cached snapshot that is not yet a known-finalized row (`publishedAt`
   * unset, OR set but still carrying a pending token) must re-resolve
   * against the repository on every read; only a snapshot this instance
   * already knows is finalized (no token) is safe to trust without a round
   * trip, because a finalized `publishedAt` never regresses.
   *
   * Returns the RAW resolved record -- including a still-pending
   * `__publishClaimToken`, if that is genuinely the best known state -- so
   * a caller populating `this.placardVersions` (bootstrap) keeps that
   * marker instead of laundering it away before anything actually
   * finalized. `clonePlacardVersion` is the external-facing wrapper that
   * strips it.
   */
  private async resolvePlacardVersion(
    placard: PlacardVersionRecord,
  ): Promise<PlacardVersionRecord> {
    let resolved = placard;
    if (
      this.platformAdminRepository &&
      (!resolved.publishedAt || hasPendingPublishClaim(resolved))
    ) {
      const authoritative =
        await this.platformAdminRepository.getPlacardVersionRecord(
          resolved.placardVersionId,
        );
      if (authoritative) {
        resolved = authoritative;
      }
    }

    const ensured = await this.ensurePlacardArtifact(resolved);
    if (!hasPendingPublishClaim(ensured)) {
      const idx = this.placardVersions.findIndex(
        (candidate) => candidate.placardVersionId === ensured.placardVersionId,
      );
      if (idx >= 0) {
        this.placardVersions[idx] = { ...ensured };
      }
    }

    return ensured;
  }

  private async clonePlacardVersion(
    placard: PlacardVersionRecord,
  ): Promise<PlacardVersionRecord> {
    const ensured = await this.resolvePlacardVersion(placard);
    const clean = stripClaimToken(ensured);

    return {
      ...clean,
      downloadMetadata: clean.downloadMetadata
        ? { ...clean.downloadMetadata }
        : null,
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

  /**
   * Fire-and-forget by default -- most callers persist in the background and
   * do not await the returned promise. `generatePlacardVersion` is the one
   * exception (R7-followthrough): it awaits this so a placard's draft
   * creation is durably committed before its id is ever handed back to a
   * caller, closing the window where that same write could otherwise land
   * late, after a competing publish claim/finalize for the same id.
   */
  private persistChanges(
    changes: PersistPlatformAdminChanges,
    context: string,
  ): Promise<void> {
    if (!this.platformAdminRepository) {
      return Promise.resolve();
    }

    return this.platformAdminRepository
      .persistChanges(changes)
      .catch((error: unknown) => {
        this.platformAdminRepository!.reportPersistenceFailure(error, context);
      });
  }
}
