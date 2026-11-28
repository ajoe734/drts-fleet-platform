import { createHash } from "node:crypto";
import type { Page, Request, Response, Route } from "@playwright/test";
import type {
  SupplyDocumentType,
  SupplyRenewalSubmissionType,
} from "@drts/contracts";
import {
  assertOwnPair,
  camelWire,
  integer,
  object as protocolObject,
  records as protocolRecords,
  requireFact,
  text,
  type CallResult,
  type NativeTransport,
  type ObjectData,
} from "./protocol";
import type { UiPostIntent } from "./r04-current-month-governance";

function object(value: unknown, stage?: string): ObjectData {
  if (stage !== undefined) {
    requireFact(
      Boolean(value && typeof value === "object" && !Array.isArray(value)),
      stage,
    );
  }
  return protocolObject(value);
}

function records(value: unknown, stage?: string): ObjectData[] {
  if (stage !== undefined) {
    requireFact(Array.isArray(value), stage);
  }
  return protocolRecords(value);
}

export const R14_REPOSITORY = "ajoe734/drts-fleet-platform";
export const R14_PRIOR_TARGET_MANIFEST_PATH =
  ".artifacts/owned-referral-business-journey/r14-prior-owned-target.json";
export const R14_PRIOR_TARGET_MANIFEST_SCHEMA =
  "r14-prior-owned-target-manifest-v1";
export const R14_STAGE_A_SCHEMA = "r14-stage-a-owned-target-v1";
export const R14_STAGE_B_SCHEMA = "r14-stage-b-owned-renewal-v1";

export const R14_DRIVER_DOC_TYPES: readonly SupplyDocumentType[] = [
  "professional_driver_license",
  "taxi_driver_registration",
];
export const R14_VEHICLE_DOC_TYPES: readonly SupplyDocumentType[] = [
  "vehicle_registration",
  "fleet_participation_contract",
  "insurance_policy",
];
export const R14_ALL_STAGE_A_DOC_TYPES: readonly SupplyDocumentType[] = [
  ...R14_DRIVER_DOC_TYPES,
  ...R14_VEHICLE_DOC_TYPES,
];

const SHA40_RE = /^[0-9a-f]{40}$/;
const SHA64_RE = /^[0-9a-f]{64}$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ID_RE = /^[A-Za-z0-9_.:-]{3,128}$/;
const JWT_LIKE_RE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const FORBIDDEN_SECRET_KEYS = new Set([
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "secret",
  "apiKey",
  "plaintextKey",
  "invitation",
  "registrationCode",
  "cookie",
  "authorization",
  "x-drts-authorization",
  "x-serverless-authorization",
]);

export type R14StageADocumentFact = Readonly<{
  documentId: string;
  submissionId: string;
  documentType: SupplyDocumentType;
  effectiveFrom: string;
  effectiveUntil: string;
  sha256: string;
  readbackSha256: string;
  scanState: "clean";
  bytes: number;
  reviewStatus: "approved";
}>;

export type R14StageAApprovalFact = Readonly<{
  submissionId: string;
  status: "approved";
  submittedBy: string;
  reviewedBy: string;
  approvedAt: string;
  revisionNo: number;
}>;

export type R14StageAVehicleApprovalFact = R14StageAApprovalFact &
  Readonly<{
    sourceContractSubmissionId: string;
    sourcePolicySubmissionId: string;
  }>;

export type R14StageACleanupFact = Readonly<{
  driverWorkStateOffline: boolean;
  driverBindingRevoked: boolean;
  fleetSessionCleaned: boolean;
  mainOrderCompleted: boolean;
  secondSupplyProvisioned: boolean;
  cleanupErrors: readonly string[];
}>;

export type R14StageAProjection = Readonly<{
  schema: typeof R14_STAGE_A_SCHEMA;
  stage: "stageA";
  repository: typeof R14_REPOSITORY;
  definitionSha: string;
  runtimeSha: string;
  entrySlug: string;
  subject: string;
  fleetPartnerId: string;
  tenantId: string;
  nonce: string;
  approvedUtcDate: string;
  driverId: string;
  vehicleId: string;
  plateNo: string;
  driverSubmissionId: string;
  vehicleSubmissionId: string;
  canonicalContractId: string;
  canonicalPolicyId: string;
  contractEndAt: string;
  policyEndAt: string;
  professionalDriverLicenseExpiry: string;
  taxiDriverRegistrationExpiry: string;
  exclusivityEffectiveEnd: string;
  documents: readonly R14StageADocumentFact[];
  approvals: Readonly<{
    driver: R14StageAApprovalFact;
    vehicle: R14StageAVehicleApprovalFact;
  }>;
  cleanup: R14StageACleanupFact;
}>;

export type R14OfficialArtifactMetadata = Readonly<{
  runId: number;
  artifactId: number;
  artifactName: string;
  headSha: string;
  headBranch: string;
  archiveBytes: number;
  archiveSha256: string;
  memberCount: number;
  journeyEvidenceBytes: number;
  journeyEvidenceSha256: string;
  runtimeBeforeSha256: string;
  runtimeAfterSha256: string;
  bookingJournalSha256: string;
}>;

export type R14PriorTargetManifest =
  | Readonly<{
      schema: typeof R14_PRIOR_TARGET_MANIFEST_SCHEMA;
      decision: "stageA";
      repository: typeof R14_REPOSITORY;
      definitionSha: string;
      runtimeSha: string;
      evaluatedUtcDate: string;
      candidateCount: 0;
      officialArtifact: null;
      target: null;
    }>
  | Readonly<{
      schema: typeof R14_PRIOR_TARGET_MANIFEST_SCHEMA;
      decision: "stageB";
      repository: typeof R14_REPOSITORY;
      definitionSha: string;
      runtimeSha: string;
      evaluatedUtcDate: string;
      candidateCount: 1;
      officialArtifact: R14OfficialArtifactMetadata;
      target: R14StageAProjection;
    }>;

export type R14ExpectedContext = Readonly<{
  definitionSha: string;
  runtimeSha: string;
  currentUtcDate: string;
  entrySlug: string;
  subject: string;
  fleetPartnerId: string;
  tenantId: string;
}>;

export type R14VerifiedFleetRole = Readonly<{
  fleetPartnerId: string;
  tenantId: string;
  actorId: string;
}>;

export type R14VerifiedAdminRole = Readonly<{
  principalId: string;
  membershipId: string;
  sessionId: string;
  scopes: readonly string[];
}>;

export type R14UiPostReceipt = Readonly<{
  path: string;
  status: number;
  runtimeSha: string | undefined;
  requestId: string;
  idempotencyKey: string | null;
  body: ObjectData;
  data: ObjectData;
  meta: ObjectData;
}>;

export type R14TypedRenewalSubmissionSummary = Readonly<{
  submissionType: SupplyRenewalSubmissionType;
  submissionId: string;
  subjectId: string;
  submittedBy: string;
  reviewStartedBy: string;
  reviewedBy: string;
  approvedAt: string;
  finalRevisionNo: number;
  createRequestId: string;
  submitRequestId: string;
  startReviewRequestId: string;
  approveRequestId: string;
  documents: readonly R14StageADocumentFact[];
}>;

export type R14StageBProjection = Readonly<{
  schema: typeof R14_STAGE_B_SCHEMA;
  stage: "stageB";
  repository: typeof R14_REPOSITORY;
  definitionSha: string;
  runtimeSha: string;
  evaluatedUtcDate: string;
  sourceRunId: number;
  sourceArtifactId: number;
  sourceArchiveSha256: string;
  sourceJourneyEvidenceSha256: string;
  fleetPartnerId: string;
  tenantId: string;
  driverId: string;
  vehicleId: string;
  plateNo: string;
  priorDriverSubmissionId: string;
  priorVehicleSubmissionId: string;
  priorContractId: string;
  priorPolicyId: string;
  renewedContractId: string;
  renewedPolicyId: string;
  renewedEffectiveFrom: string;
  renewedEffectiveUntil: string;
  preRenewalSetup: Readonly<{
    driverWorkState: "available";
    driverLicensesValid: false;
    driverDispatchEligible: false;
    driverBlockedReasons: readonly string[];
    driverReadinessReasons: readonly string[];
    vehicleDispatchEligible: false;
    vehicleInsuranceStatus: "expired";
    vehicleContractStatus: "expired";
    vehicleBlockedReasons: readonly string[];
    vehicleReadinessReasons: readonly string[];
    absentFromNormalDispatchCandidates: true;
    driverAuthRefusal: "DRIVER_CERT_INVALID";
    dispatchJobId: string;
    orderId: string;
  }>;
  renewals: Readonly<{
    profileCorrection: R14TypedRenewalSubmissionSummary;
    contractUpdate: R14TypedRenewalSubmissionSummary;
    insuranceUpdate: R14TypedRenewalSubmissionSummary;
  }>;
  postRenewalVerification: Readonly<{
    sameCanonicalDriverId: true;
    sameCanonicalVehicleId: true;
    priorContractSupersededBy: string;
    priorPolicySupersededBy: string;
    driverReadinessState: "ready";
    vehicleReadinessState: "ready";
    driverDispatchEligible: true;
    vehicleDispatchEligible: true;
    dispatchJobStatusBeforeAssign: string;
    presentInNormalDispatchCandidates: true;
    driverSessionRestored: true;
    initialHeartbeatAccepted: true;
  }>;
}>;

function assertNoSecretMaterial(value: unknown, stage: string): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoSecretMaterial(item, stage);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as ObjectData)) {
      requireFact(!FORBIDDEN_SECRET_KEYS.has(key), `${stage}:secret-key`);
      assertNoSecretMaterial(item, stage);
    }
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    requireFact(
      !JWT_LIKE_RE.test(trimmed) && !/^Bearer\s+/i.test(trimmed),
      `${stage}:secret-value`,
    );
  }
}

export function validateR14StageATarget(
  rawTarget: unknown,
  expected: R14ExpectedContext,
  options?: { allowSameUtcDate?: boolean },
): R14StageAProjection {
  requireFact(
    SHA40_RE.test(expected.definitionSha) &&
      SHA40_RE.test(expected.runtimeSha) &&
      DATE_ONLY_RE.test(expected.currentUtcDate),
    "r14-target:expected-context-invalid",
  );
  const target = object(rawTarget, "r14-target:object-required");
  assertNoSecretMaterial(target, "r14-target");

  requireFact(
    target.schema === R14_STAGE_A_SCHEMA &&
      target.stage === "stageA" &&
      target.repository === R14_REPOSITORY &&
      target.definitionSha === expected.definitionSha &&
      target.runtimeSha === expected.runtimeSha &&
      target.entrySlug === expected.entrySlug &&
      target.subject === expected.subject &&
      target.fleetPartnerId === expected.fleetPartnerId &&
      target.tenantId === expected.tenantId &&
      typeof target.nonce === "string" &&
      target.nonce.trim().length > 0,
    "r14-target:identity-binding-mismatch",
  );

  const approvedUtcDate = text(
    target.approvedUtcDate,
    "r14-target:approvedUtcDate",
  );
  requireFact(
    DATE_ONLY_RE.test(approvedUtcDate),
    "r14-target:approvedUtcDate-format",
  );
  if (options?.allowSameUtcDate) {
    requireFact(
      approvedUtcDate === expected.currentUtcDate,
      "r14-stage-a:utc-day-changed-before-approval",
    );
  } else {
    requireFact(
      approvedUtcDate < expected.currentUtcDate,
      "r14-target:utc-rollover-not-reached",
    );
  }

  const driverId = text(target.driverId, "r14-target:driverId");
  const vehicleId = text(target.vehicleId, "r14-target:vehicleId");
  const plateNo = text(target.plateNo, "r14-target:plateNo");
  const driverSubmissionId = text(
    target.driverSubmissionId,
    "r14-target:driverSubmissionId",
  );
  const vehicleSubmissionId = text(
    target.vehicleSubmissionId,
    "r14-target:vehicleSubmissionId",
  );
  const canonicalContractId = text(
    target.canonicalContractId,
    "r14-target:canonicalContractId",
  );
  const canonicalPolicyId = text(
    target.canonicalPolicyId,
    "r14-target:canonicalPolicyId",
  );

  requireFact(
    [
      driverId,
      vehicleId,
      plateNo,
      driverSubmissionId,
      vehicleSubmissionId,
      canonicalContractId,
      canonicalPolicyId,
    ].every((id) => SAFE_ID_RE.test(id)) &&
      driverId !== vehicleId &&
      driverSubmissionId !== vehicleSubmissionId &&
      canonicalContractId !== canonicalPolicyId &&
      plateNo.startsWith("SIM-"),
    "r14-target:canonical-ids-invalid",
  );

  const expectedEndIso = `${approvedUtcDate}T23:59:59.000Z`;
  const exclusivityEffectiveEnd = text(
    target.exclusivityEffectiveEnd,
    "r14-target:exclusivityEffectiveEnd",
  );
  requireFact(
    target.professionalDriverLicenseExpiry === approvedUtcDate &&
      target.taxiDriverRegistrationExpiry === approvedUtcDate &&
      target.contractEndAt === expectedEndIso &&
      target.policyEndAt === expectedEndIso &&
      exclusivityEffectiveEnd.endsWith("T23:59:59.000Z") &&
      DATE_ONLY_RE.test(exclusivityEffectiveEnd.slice(0, 10)) &&
      exclusivityEffectiveEnd.slice(0, 10) > expected.currentUtcDate,
    "r14-target:expiry-dates-invalid",
  );

  const rawDocs = records(target.documents, "r14-target:documents");
  requireFact(rawDocs.length === 5, "r14-target:five-documents-required");
  const seenTypes = new Set<string>();
  const seenIds = new Set<string>();
  const documents: R14StageADocumentFact[] = rawDocs.map((doc) => {
    const documentId = text(doc.documentId, "r14-target:documentId");
    const submissionId = text(doc.submissionId, "r14-target:docSubmissionId");
    const documentType = text(
      doc.documentType,
      "r14-target:documentType",
    ) as SupplyDocumentType;
    const effectiveFrom = text(doc.effectiveFrom, "r14-target:effectiveFrom");
    const effectiveUntil = text(
      doc.effectiveUntil,
      "r14-target:effectiveUntil",
    );
    const sha256 = text(doc.sha256, "r14-target:docSha256");
    const readbackSha256 = text(
      doc.readbackSha256,
      "r14-target:docReadbackSha256",
    );
    const bytes = integer(doc.bytes, "r14-target:docBytes");

    requireFact(
      SAFE_ID_RE.test(documentId) && !seenIds.has(documentId),
      "r14-target:duplicate-or-invalid-documentId",
    );
    seenIds.add(documentId);
    requireFact(
      R14_ALL_STAGE_A_DOC_TYPES.includes(documentType) &&
        !seenTypes.has(documentType),
      "r14-target:invalid-or-duplicate-documentType",
    );
    seenTypes.add(documentType);

    const expectedSubId = R14_DRIVER_DOC_TYPES.includes(documentType)
      ? driverSubmissionId
      : vehicleSubmissionId;
    requireFact(
      submissionId === expectedSubId &&
        DATE_ONLY_RE.test(effectiveFrom) &&
        effectiveFrom <= approvedUtcDate &&
        effectiveUntil === approvedUtcDate &&
        SHA64_RE.test(sha256) &&
        sha256 === readbackSha256 &&
        doc.scanState === "clean" &&
        doc.reviewStatus === "approved" &&
        bytes > 0,
      "r14-target:document-provenance-invalid",
    );
    return {
      documentId,
      submissionId,
      documentType,
      effectiveFrom,
      effectiveUntil,
      sha256,
      readbackSha256,
      scanState: "clean",
      bytes,
      reviewStatus: "approved",
    };
  });

  const approvals = object(target.approvals, "r14-target:approvals");
  const driverApp = object(approvals.driver, "r14-target:driverApproval");
  const vehicleApp = object(approvals.vehicle, "r14-target:vehicleApproval");
  for (const [label, app, expectedSubId] of [
    ["driver", driverApp, driverSubmissionId],
    ["vehicle", vehicleApp, vehicleSubmissionId],
  ] as const) {
    const submittedBy = text(app.submittedBy, `r14-target:${label}SubmittedBy`);
    const reviewedBy = text(app.reviewedBy, `r14-target:${label}ReviewedBy`);
    const approvedAt = text(app.approvedAt, `r14-target:${label}ApprovedAt`);
    const revisionNo = integer(app.revisionNo, `r14-target:${label}RevisionNo`);
    requireFact(
      app.submissionId === expectedSubId &&
        app.status === "approved" &&
        SAFE_ID_RE.test(submittedBy) &&
        SAFE_ID_RE.test(reviewedBy) &&
        submittedBy !== reviewedBy &&
        approvedAt.startsWith(approvedUtcDate) &&
        revisionNo >= 1,
      `r14-target:${label}-approval-invalid`,
    );
  }
  requireFact(
    vehicleApp.sourceContractSubmissionId === vehicleSubmissionId &&
      vehicleApp.sourcePolicySubmissionId === vehicleSubmissionId,
    "r14-target:vehicle-source-submission-mismatch",
  );

  const cleanup = object(target.cleanup, "r14-target:cleanup");
  const cleanupErrors = Array.isArray(cleanup.cleanupErrors)
    ? cleanup.cleanupErrors.map((item) => text(item))
    : null;
  requireFact(
    cleanup.driverWorkStateOffline === true &&
      cleanup.driverBindingRevoked === true &&
      cleanup.fleetSessionCleaned === true &&
      cleanup.mainOrderCompleted === true &&
      cleanup.secondSupplyProvisioned === true &&
      cleanupErrors !== null &&
      cleanupErrors.length === 0,
    "r14-target:cleanup-facts-invalid",
  );

  return {
    schema: R14_STAGE_A_SCHEMA,
    stage: "stageA",
    repository: R14_REPOSITORY,
    definitionSha: expected.definitionSha,
    runtimeSha: expected.runtimeSha,
    entrySlug: expected.entrySlug,
    subject: expected.subject,
    fleetPartnerId: expected.fleetPartnerId,
    tenantId: expected.tenantId,
    nonce: text(target.nonce),
    approvedUtcDate,
    driverId,
    vehicleId,
    plateNo,
    driverSubmissionId,
    vehicleSubmissionId,
    canonicalContractId,
    canonicalPolicyId,
    contractEndAt: expectedEndIso,
    policyEndAt: expectedEndIso,
    professionalDriverLicenseExpiry: approvedUtcDate,
    taxiDriverRegistrationExpiry: approvedUtcDate,
    exclusivityEffectiveEnd,
    documents,
    approvals: {
      driver: {
        submissionId: driverSubmissionId,
        status: "approved",
        submittedBy: text(driverApp.submittedBy),
        reviewedBy: text(driverApp.reviewedBy),
        approvedAt: text(driverApp.approvedAt),
        revisionNo: integer(driverApp.revisionNo),
      },
      vehicle: {
        submissionId: vehicleSubmissionId,
        status: "approved",
        submittedBy: text(vehicleApp.submittedBy),
        reviewedBy: text(vehicleApp.reviewedBy),
        approvedAt: text(vehicleApp.approvedAt),
        revisionNo: integer(vehicleApp.revisionNo),
        sourceContractSubmissionId: vehicleSubmissionId,
        sourcePolicySubmissionId: vehicleSubmissionId,
      },
    },
    cleanup: {
      driverWorkStateOffline: true,
      driverBindingRevoked: true,
      fleetSessionCleaned: true,
      mainOrderCompleted: true,
      secondSupplyProvisioned: true,
      cleanupErrors: [],
    },
  };
}

export function parseR14PriorTargetManifest(
  raw: string | Buffer,
  expected: R14ExpectedContext,
): R14PriorTargetManifest {
  const content = typeof raw === "string" ? raw : raw.toString("utf8");
  requireFact(
    content.length > 0 && content.length <= 256 * 1024,
    "r14-manifest:bounds",
  );
  let parsed: ObjectData;
  try {
    parsed = object(JSON.parse(content), "r14-manifest:json-object");
  } catch {
    throw new Error("r14-manifest:invalid-json");
  }
  assertNoSecretMaterial(parsed, "r14-manifest");
  requireFact(
    parsed.schema === R14_PRIOR_TARGET_MANIFEST_SCHEMA &&
      parsed.repository === R14_REPOSITORY &&
      parsed.definitionSha === expected.definitionSha &&
      parsed.runtimeSha === expected.runtimeSha &&
      parsed.evaluatedUtcDate === expected.currentUtcDate,
    "r14-manifest:header-binding-mismatch",
  );

  if (parsed.decision === "stageA") {
    requireFact(
      parsed.candidateCount === 0 &&
        parsed.officialArtifact === null &&
        parsed.target === null,
      "r14-manifest:stage-a-shape-invalid",
    );
    return {
      schema: R14_PRIOR_TARGET_MANIFEST_SCHEMA,
      decision: "stageA",
      repository: R14_REPOSITORY,
      definitionSha: expected.definitionSha,
      runtimeSha: expected.runtimeSha,
      evaluatedUtcDate: expected.currentUtcDate,
      candidateCount: 0,
      officialArtifact: null,
      target: null,
    };
  }

  requireFact(
    parsed.decision === "stageB" && parsed.candidateCount === 1,
    "r14-manifest:decision-invalid",
  );
  const art = object(parsed.officialArtifact, "r14-manifest:officialArtifact");
  const runId = integer(art.runId, "r14-manifest:runId");
  const artifactId = integer(art.artifactId, "r14-manifest:artifactId");
  const artifactName = text(art.artifactName, "r14-manifest:artifactName");
  const headSha = text(art.headSha, "r14-manifest:headSha");
  const headBranch = text(art.headBranch, "r14-manifest:headBranch");
  const archiveBytes = integer(art.archiveBytes, "r14-manifest:archiveBytes");
  const archiveSha256 = text(art.archiveSha256, "r14-manifest:archiveSha256");
  const memberCount = integer(art.memberCount, "r14-manifest:memberCount");
  const journeyEvidenceBytes = integer(
    art.journeyEvidenceBytes,
    "r14-manifest:journeyEvidenceBytes",
  );
  const journeyEvidenceSha256 = text(
    art.journeyEvidenceSha256,
    "r14-manifest:journeyEvidenceSha256",
  );
  const runtimeBeforeSha256 = text(
    art.runtimeBeforeSha256,
    "r14-manifest:runtimeBeforeSha256",
  );
  const runtimeAfterSha256 = text(
    art.runtimeAfterSha256,
    "r14-manifest:runtimeAfterSha256",
  );
  const bookingJournalSha256 = text(
    art.bookingJournalSha256,
    "r14-manifest:bookingJournalSha256",
  );

  requireFact(
    runId > 0 &&
      artifactId > 0 &&
      artifactName ===
        `owned-referral-business-${expected.runtimeSha}-${runId}` &&
      headSha === expected.definitionSha &&
      headBranch.trim().length > 0 &&
      archiveBytes > 0 &&
      memberCount >= 4 &&
      journeyEvidenceBytes > 0 &&
      [
        archiveSha256,
        journeyEvidenceSha256,
        runtimeBeforeSha256,
        runtimeAfterSha256,
        bookingJournalSha256,
      ].every((digest) => SHA64_RE.test(digest)),
    "r14-manifest:official-artifact-metadata-invalid",
  );

  const target = validateR14StageATarget(parsed.target, expected);
  return {
    schema: R14_PRIOR_TARGET_MANIFEST_SCHEMA,
    decision: "stageB",
    repository: R14_REPOSITORY,
    definitionSha: expected.definitionSha,
    runtimeSha: expected.runtimeSha,
    evaluatedUtcDate: expected.currentUtcDate,
    candidateCount: 1,
    officialArtifact: {
      runId,
      artifactId,
      artifactName,
      headSha,
      headBranch,
      archiveBytes,
      archiveSha256,
      memberCount,
      journeyEvidenceBytes,
      journeyEvidenceSha256,
      runtimeBeforeSha256,
      runtimeAfterSha256,
      bookingJournalSha256,
    },
    target,
  };
}

export function buildR14StageAProjection(
  input: Omit<R14StageAProjection, "schema" | "stage" | "repository">,
  expected: R14ExpectedContext,
): R14StageAProjection {
  return validateR14StageATarget(
    {
      schema: R14_STAGE_A_SCHEMA,
      stage: "stageA",
      repository: R14_REPOSITORY,
      ...input,
    },
    expected,
    { allowSameUtcDate: true },
  );
}

export function verifyR14FleetSession(
  session: ObjectData,
  expected: R14VerifiedFleetRole,
): void {
  const identity = object(session.identity, "r14-fleet:identity");
  const scopes = Array.isArray(identity.scopes)
    ? identity.scopes.map((s) => String(s))
    : [];
  const hasPartnerWrite =
    scopes.includes("partner:read") && scopes.includes("partner:write");
  const hasFleetWrite =
    scopes.includes("fleet:read") && scopes.includes("fleet:supply:write");
  requireFact(
    session.active === true &&
      identity.realm === "partner" &&
      identity.authMode === "jwt_bearer" &&
      ["partner_api_key", "partner_user"].includes(
        String(identity.actorType),
      ) &&
      identity.partnerId === expected.fleetPartnerId &&
      identity.tenantId === expected.tenantId &&
      identity.actorId === expected.actorId &&
      (hasPartnerWrite || hasFleetWrite),
    "r14-fleet:session-realm-tenant-or-scope-invalid",
  );
}

export function verifyR14AdminSession(
  session: ObjectData,
  expected: R14VerifiedAdminRole,
  fleetActorId: string,
): void {
  const identity = object(session.identity, "r14-admin:identity");
  requireFact(
    session.active === true &&
      identity.realm === "platform" &&
      identity.actorType === "platform_admin" &&
      identity.authMode === "jwt_bearer" &&
      identity.principalId === expected.principalId &&
      identity.membershipId === expected.membershipId &&
      identity.sessionId === expected.sessionId &&
      identity.principalId !== fleetActorId,
    "r14-admin:session-realm-or-distinct-actor-invalid",
  );
}

export async function installR14FleetPageRoute(
  page: Page,
  fleetOrigin: string,
  tx: NativeTransport,
): Promise<void> {
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (new URL(url).origin !== fleetOrigin) return route.continue();
    return route.continue({
      headers: { ...route.request().headers(), ...tx.headers("fleet", url) },
    });
  });
}

export async function captureR14UiPost(
  page: Page,
  origin: string,
  path: string,
  runtimeSha: string,
  click: () => Promise<void>,
  beforeForward: (
    intent: UiPostIntent,
    forward: () => Promise<void>,
  ) => Promise<void>,
): Promise<R14UiPostReceipt> {
  const url = `${origin}/control-plane-proxy${path}`;
  const target = new URL(url);
  let count = 0;
  let intercepted = 0;
  let custodied: UiPostIntent | undefined;
  let headerRequestId: string | null = null;
  let rejectRouteFailure!: (error: unknown) => void;
  const routeFailure = new Promise<never>((_resolve, reject) => {
    rejectRouteFailure = reject;
  });
  void routeFailure.catch(() => undefined);

  const exact = (request: Pick<Request, "url" | "method">) => {
    const actual = new URL(request.url());
    return (
      request.method() === "POST" &&
      actual.origin === target.origin &&
      actual.pathname === target.pathname
    );
  };
  const onRequest = (request: Request) => {
    if (exact(request)) count++;
  };
  const matcher = (candidate: URL) =>
    candidate.origin === target.origin &&
    candidate.pathname === target.pathname;
  const onRoute = async (route: Route) => {
    const request = route.request();
    if (!exact(request)) return route.fallback();
    try {
      intercepted++;
      requireFact(
        intercepted === 1,
        "r14-ui-post:duplicate-post-not-forwarded",
      );
      const headers = new Headers(request.headers());
      const rawBody = request.postData() ?? "";
      const bodySha256 = createHash("sha256").update(rawBody).digest("hex");
      headerRequestId = headers.get("x-request-id");
      const idempotencyKey = headers.get("idempotency-key");
      const correlationId =
        headerRequestId ?? idempotencyKey ?? `r14-${bodySha256.slice(0, 24)}`;
      const intent: UiPostIntent = {
        url: request.url(),
        path: new URL(request.url()).pathname,
        method: "POST",
        requestId: correlationId,
        idempotencyKey,
        bodySha256,
        bodyBytes: Buffer.byteLength(rawBody),
      };
      custodied = intent;
      await beforeForward(intent, () => route.fallback());
    } catch (error) {
      await route.abort().catch(() => undefined);
      rejectRouteFailure(error);
    }
  };

  page.on("request", onRequest);
  await page.route(matcher, onRoute);
  const waiting = page.waitForResponse(
    (response) =>
      exact(response.request()) &&
      new URL(response.url()).pathname === target.pathname,
    { timeout: 15_000 },
  );
  void waiting.catch(() => undefined);

  try {
    await click();
    const response: Response = await Promise.race([waiting, routeFailure]);
    requireFact(
      count === 1 && intercepted === 1 && custodied !== undefined,
      "r14-ui-post:exactly-one-custodied-post-required",
    );
    requireFact(
      [200, 201].includes(response.status()) &&
        response.headers()["x-drts-candidate-sha"] === runtimeSha,
      "r14-ui-post:status-or-runtime-mismatch",
    );
    const payload = object(camelWire(await response.json()));
    requireFact(
      payload.data !== null &&
        typeof payload.data === "object" &&
        payload.meta !== null &&
        typeof payload.meta === "object" &&
        payload.error === undefined,
      "r14-ui-post:envelope-invalid",
    );
    const metaObj = object(payload.meta);
    const responseRequestId =
      typeof metaObj.requestId === "string" && metaObj.requestId.trim()
        ? metaObj.requestId.trim()
        : custodied.requestId;
    if (headerRequestId && typeof metaObj.requestId === "string") {
      requireFact(
        metaObj.requestId === headerRequestId,
        "r14-ui-post:request-id-mismatch",
      );
    }
    requireFact(
      custodied.url === response.request().url() &&
        custodied.bodySha256 ===
          createHash("sha256")
            .update(response.request().postData() ?? "")
            .digest("hex"),
      "r14-ui-post:response-body-binding-mismatch",
    );
    return {
      path: new URL(response.url()).pathname,
      status: response.status(),
      runtimeSha: response.headers()["x-drts-candidate-sha"],
      requestId: responseRequestId,
      idempotencyKey: custodied.idempotencyKey,
      body: object(response.request().postDataJSON()),
      data: object(payload.data),
      meta: metaObj,
    };
  } finally {
    await page.unroute(matcher, onRoute);
    page.off("request", onRequest);
  }
}

export type R14DocumentUploadSpec = Readonly<{
  submissionId: string;
  submissionType: SupplyRenewalSubmissionType;
  documentType: SupplyDocumentType;
  expectedRevisionNo: number;
  effectiveFrom: string;
  effectiveUntil: string;
}>;

export type R14DocumentDownloadProof = Readonly<{
  sha256: string;
  readbackSha256: string;
  bytes: number;
  scanState: "clean";
}>;

export type R14StageBPorts = {
  expected: R14ExpectedContext;
  officialArtifact: R14OfficialArtifactMetadata;
  target: R14StageAProjection;
  fleetRole: R14VerifiedFleetRole;
  adminRole: R14VerifiedAdminRole;
  renewedEffectiveFrom: string;
  renewedEffectiveUntil: string;
  orderId: string;
  dispatchJobId: string;
  readFleetSession(): Promise<ObjectData>;
  readAdminBrowserSession(): Promise<ObjectData>;
  restoreDriverAvailable(driverId: string): Promise<void>;
  probeExpiredDriverAuth(
    driverId: string,
  ): Promise<Pick<CallResult, "status" | "headers" | "data">>;
  rebindDriverSession(driverId: string): Promise<void>;
  sendInitialDriverHeartbeat(): Promise<void>;
  readRegistryDriver(driverId: string): Promise<ObjectData>;
  readRegistryVehicle(vehicleId: string): Promise<ObjectData>;
  readRegistryContracts(vehicleId: string): Promise<ObjectData[]>;
  readRegistryPolicies(vehicleId: string): Promise<ObjectData[]>;
  readRenewalTargets(): Promise<ObjectData>;
  readDriverReadiness(driverId: string): Promise<ObjectData>;
  readVehicleReadiness(vehicleId: string): Promise<ObjectData>;
  readFleetSubmission(submissionId: string): Promise<ObjectData>;
  readPreRenewalCandidates(): Promise<ObjectData[]>;
  openFleetRenewalNew(
    submissionType: SupplyRenewalSubmissionType,
    subjectId: string,
    plateNo: string,
  ): Promise<void>;
  createFleetRenewalDraft(
    submissionType: SupplyRenewalSubmissionType,
    subjectId: string,
  ): Promise<R14UiPostReceipt>;
  uploadFleetRenewalDocument(
    spec: R14DocumentUploadSpec,
  ): Promise<R14UiPostReceipt>;
  readbackFleetDocument(
    submissionId: string,
    documentId: string,
  ): Promise<R14DocumentDownloadProof>;
  submitFleetRenewal(
    submissionId: string,
    expectedRevisionNo: number,
  ): Promise<R14UiPostReceipt>;
  openAdminSupplyReview(submissionId: string): Promise<void>;
  startAdminSupplyReview(
    submissionId: string,
    expectedRevisionNo: number,
  ): Promise<R14UiPostReceipt>;
  approveAdminSupplyReview(
    submissionId: string,
    expectedRevisionNo: number,
  ): Promise<R14UiPostReceipt>;
  readAudit(submissionId: string): Promise<ObjectData[]>;
  readDispatchJobState(
    orderId: string,
    dispatchJobId: string,
  ): Promise<{ orderStatus: string; jobStatus: string }>;
  readPostRenewalCandidates(): Promise<ObjectData[]>;
};

const ALLOWED_EXPIRED_DRIVER_READINESS_REASONS = new Set([
  "DRIVER_LICENSE_EXPIRED",
  "DRIVER_REGISTRATION_EXPIRED",
]);
const ALLOWED_EXPIRED_VEHICLE_READINESS_REASONS = new Set([
  "INSURANCE_EXPIRED",
  "CONTRACT_INACTIVE",
  "VEHICLE_DOCUMENT_MISSING",
]);
const REUSABLE_DISPATCH_JOB_STATUSES = new Set([
  "matching",
  "reserved",
  "queued",
]);
const REUSABLE_ORDER_STATUSES = new Set([
  "created",
  "ready_for_dispatch",
  "preassigned",
  "redispatch_required",
]);

export async function runR14StageBRenewalLifecycle(
  ports: R14StageBPorts,
): Promise<R14StageBProjection> {
  const { expected, target, fleetRole, adminRole } = ports;
  validateR14StageATarget(target, expected);
  requireFact(
    DATE_ONLY_RE.test(ports.renewedEffectiveFrom) &&
      DATE_ONLY_RE.test(ports.renewedEffectiveUntil) &&
      ports.renewedEffectiveFrom <= expected.currentUtcDate &&
      ports.renewedEffectiveUntil > expected.currentUtcDate,
    "r14-stage-b:renewed-effective-dates-invalid",
  );

  // 1. Verify Fleet and Platform Admin sessions and distinct actors.
  verifyR14FleetSession(await ports.readFleetSession(), fleetRole);
  verifyR14AdminSession(
    await ports.readAdminBrowserSession(),
    adminRole,
    fleetRole.actorId,
  );

  // 2. Restore administrative work state without authenticating the expired Driver.
  await ports.restoreDriverAvailable(target.driverId);

  // 3. Revalidate prior submissions, live renewal targets, Registry expiry, and Readiness holds.
  const [
    priorDriverSubDetail,
    priorVehicleSubDetail,
    renewalTargets,
    driverBefore,
    vehicleBefore,
    contractsBefore,
    policiesBefore,
    driverReadinessBefore,
    vehicleReadinessBefore,
  ] = await Promise.all([
    ports.readFleetSubmission(target.driverSubmissionId),
    ports.readFleetSubmission(target.vehicleSubmissionId),
    ports.readRenewalTargets(),
    ports.readRegistryDriver(target.driverId),
    ports.readRegistryVehicle(target.vehicleId),
    ports.readRegistryContracts(target.vehicleId),
    ports.readRegistryPolicies(target.vehicleId),
    ports.readDriverReadiness(target.driverId),
    ports.readVehicleReadiness(target.vehicleId),
  ]);

  const priorDriverSub = object(priorDriverSubDetail.submission);
  const priorVehicleSub = object(priorVehicleSubDetail.submission);
  requireFact(
    priorDriverSub.submissionId === target.driverSubmissionId &&
      priorDriverSub.fleetPartnerId === expected.fleetPartnerId &&
      priorDriverSub.status === "approved" &&
      priorDriverSub.canonicalDriverId === target.driverId &&
      priorVehicleSub.submissionId === target.vehicleSubmissionId &&
      priorVehicleSub.fleetPartnerId === expected.fleetPartnerId &&
      priorVehicleSub.status === "approved" &&
      priorVehicleSub.canonicalVehicleId === target.vehicleId &&
      priorVehicleSub.canonicalContractId === target.canonicalContractId &&
      priorVehicleSub.canonicalPolicyId === target.canonicalPolicyId,
    "r14-stage-b:prior-approved-submissions-mismatch",
  );

  requireFact(
    renewalTargets.fleetPartnerId === expected.fleetPartnerId,
    "r14-stage-b:renewal-targets-fleet-mismatch",
  );
  const targetDriverItem = records(renewalTargets.drivers).find(
    (d) => d.driverId === target.driverId,
  );
  const targetVehicleItem = records(renewalTargets.vehicles).find(
    (v) => v.vehicleId === target.vehicleId,
  );
  requireFact(
    targetDriverItem !== undefined &&
      targetDriverItem.fleetPartnerId === expected.fleetPartnerId &&
      targetDriverItem.ready === false &&
      targetVehicleItem !== undefined &&
      targetVehicleItem.fleetPartnerId === expected.fleetPartnerId &&
      targetVehicleItem.plateNo === target.plateNo &&
      targetVehicleItem.ready === false,
    "r14-stage-b:live-renewal-targets-missing-own-pair",
  );

  const driverBlockedBefore = Array.isArray(
    driverBefore.eligibilityBlockedReasons,
  )
    ? driverBefore.eligibilityBlockedReasons.map((r) => String(r))
    : [];
  requireFact(
    driverBefore.driverId === target.driverId &&
      driverBefore.workState === "available" &&
      driverBefore.lifecycleStatus === "active" &&
      driverBefore.licensesValid === false &&
      driverBefore.dispatchEligible === false &&
      driverBlockedBefore.length === 1 &&
      driverBlockedBefore[0] === "licenses_invalid",
    "r14-stage-b:driver-pre-renewal-registry-state-invalid",
  );

  const vehicleLifecycleBefore = object(vehicleBefore.supplyLifecycle);
  const vehicleDispatchBefore = object(vehicleLifecycleBefore.dispatch);
  const vehicleContractBefore = object(vehicleLifecycleBefore.contract);
  const vehicleInsuranceBefore = object(vehicleLifecycleBefore.insurance);
  const vehicleOffboardingBefore = object(vehicleLifecycleBefore.offboarding);
  const vehicleBlockedBefore = Array.isArray(
    vehicleDispatchBefore.blockedReasons,
  )
    ? vehicleDispatchBefore.blockedReasons.map((r) => String(r))
    : [];
  requireFact(
    vehicleBefore.vehicleId === target.vehicleId &&
      vehicleBefore.plateNo === target.plateNo &&
      vehicleBefore.exclusivityApproved === true &&
      vehicleBefore.insuranceStatus === "expired" &&
      vehicleContractBefore.lifecycleStatus === "expired" &&
      vehicleInsuranceBefore.lifecycleStatus === "expired" &&
      vehicleOffboardingBefore.status === "none" &&
      vehicleDispatchBefore.eligible === false &&
      vehicleBlockedBefore.includes("insurance_invalid") &&
      vehicleBlockedBefore.includes("contract_inactive") &&
      vehicleBlockedBefore.every((r) =>
        ["insurance_invalid", "contract_inactive"].includes(r),
      ),
    "r14-stage-b:vehicle-pre-renewal-registry-state-invalid",
  );

  const priorContractBefore = contractsBefore.find(
    (c) => c.contractId === target.canonicalContractId,
  );
  const priorPolicyBefore = policiesBefore.find(
    (p) => p.policyId === target.canonicalPolicyId,
  );
  requireFact(
    priorContractBefore !== undefined &&
      priorContractBefore.vehicleId === target.vehicleId &&
      priorContractBefore.sourceSubmissionId === target.vehicleSubmissionId &&
      priorContractBefore.endAt === target.contractEndAt &&
      priorContractBefore.supersededByContractId == null &&
      priorPolicyBefore !== undefined &&
      priorPolicyBefore.vehicleId === target.vehicleId &&
      priorPolicyBefore.sourceSubmissionId === target.vehicleSubmissionId &&
      priorPolicyBefore.endAt === target.policyEndAt &&
      priorPolicyBefore.supersededByPolicyId == null,
    "r14-stage-b:prior-contract-or-policy-provenance-mismatch",
  );

  const driverReadinessReasonsBefore = Array.isArray(
    driverReadinessBefore.reasonCodes,
  )
    ? driverReadinessBefore.reasonCodes.map((r) => String(r))
    : [];
  const vehicleReadinessReasonsBefore = Array.isArray(
    vehicleReadinessBefore.reasonCodes,
  )
    ? vehicleReadinessBefore.reasonCodes.map((r) => String(r))
    : [];
  requireFact(
    driverReadinessBefore.subjectId === target.driverId &&
      driverReadinessBefore.state === "not_ready" &&
      driverReadinessReasonsBefore.includes("DRIVER_LICENSE_EXPIRED") &&
      driverReadinessReasonsBefore.includes("DRIVER_REGISTRATION_EXPIRED") &&
      driverReadinessReasonsBefore.every((r) =>
        ALLOWED_EXPIRED_DRIVER_READINESS_REASONS.has(r),
      ),
    "r14-stage-b:driver-pre-renewal-readiness-reasons-invalid",
  );
  requireFact(
    vehicleReadinessBefore.subjectId === target.vehicleId &&
      vehicleReadinessBefore.state === "not_ready" &&
      vehicleReadinessReasonsBefore.includes("INSURANCE_EXPIRED") &&
      vehicleReadinessReasonsBefore.includes("CONTRACT_INACTIVE") &&
      vehicleReadinessReasonsBefore.every((r) =>
        ALLOWED_EXPIRED_VEHICLE_READINESS_REASONS.has(r),
      ),
    "r14-stage-b:vehicle-pre-renewal-readiness-reasons-invalid",
  );

  // 4. Negative dispatch control: expired pair must be absent from normal candidates.
  const preCandidates = await ports.readPreRenewalCandidates();
  const expiredCandidateMatch = preCandidates.find(
    (c) => c.driverId === target.driverId || c.vehicleId === target.vehicleId,
  );
  requireFact(
    expiredCandidateMatch === undefined,
    "r14-stage-b:expired-pair-present-in-pre-renewal-candidates",
  );

  // Registration is expected to refuse this exact expired subject. A generic
  // 403 (or transport/runtime failure) cannot stand in for expiry evidence.
  const authRefusal = await ports.probeExpiredDriverAuth(target.driverId);
  const authError = object(object(authRefusal.data).error);
  const authDetails = object(authError.details);
  const authReasons = authDetails.eligibilityBlockedReasons;
  requireFact(
    authRefusal.status === 403 &&
      authRefusal.headers.get("x-drts-candidate-sha") === expected.runtimeSha &&
      authError.code === "DRIVER_CERT_INVALID" &&
      authDetails.driverId === target.driverId &&
      authDetails.lifecycleStatus === "active" &&
      Array.isArray(authReasons) &&
      authReasons.length === 1 &&
      authReasons[0] === "licenses_invalid",
    "r14-stage-b:expired-driver-auth-refusal-invalid",
  );

  // 5. Execute three distinct typed renewals via Fleet UI -> Platform Admin UI.
  const seenSubmissionIds = new Set<string>([
    target.driverSubmissionId,
    target.vehicleSubmissionId,
  ]);

  const executeSingleTypedRenewal = async (
    submissionType: SupplyRenewalSubmissionType,
    subjectId: string,
    requiredDocTypes: readonly SupplyDocumentType[],
  ): Promise<R14TypedRenewalSubmissionSummary> => {
    await ports.openFleetRenewalNew(submissionType, subjectId, target.plateNo);
    const createdReceipt = await ports.createFleetRenewalDraft(
      submissionType,
      subjectId,
    );
    const createdSub = object(createdReceipt.data.submission);
    const submissionId = text(
      createdSub.submissionId,
      `r14-stage-b:${submissionType}:submissionId`,
    );
    requireFact(
      SAFE_ID_RE.test(submissionId) &&
        !seenSubmissionIds.has(submissionId) &&
        createdSub.submissionType === submissionType &&
        createdSub.fleetPartnerId === expected.fleetPartnerId &&
        createdSub.status === "draft",
      `r14-stage-b:${submissionType}:draft-creation-invalid`,
    );
    if (submissionType === "profile_correction") {
      requireFact(
        createdSub.subjectDriverId === target.driverId &&
          createdSub.canonicalDriverId === target.driverId,
        "r14-stage-b:profile_correction:target-driver-mismatch",
      );
    } else {
      requireFact(
        createdSub.subjectVehicleId === target.vehicleId &&
          createdSub.canonicalVehicleId === target.vehicleId &&
          object(createdReceipt.data.vehicleDraft).plateNo === target.plateNo,
        `r14-stage-b:${submissionType}:target-vehicle-mismatch`,
      );
    }
    seenSubmissionIds.add(submissionId);

    let currentRevisionNo = integer(
      createdSub.revisionNo,
      `r14-stage-b:${submissionType}:initialRevisionNo`,
    );
    const uploadedDocs: R14StageADocumentFact[] = [];

    for (const documentType of requiredDocTypes) {
      const confirmReceipt = await ports.uploadFleetRenewalDocument({
        submissionId,
        submissionType,
        documentType,
        expectedRevisionNo: currentRevisionNo,
        effectiveFrom: ports.renewedEffectiveFrom,
        effectiveUntil: ports.renewedEffectiveUntil,
      });
      requireFact(
        confirmReceipt.body.expectedRevisionNo === currentRevisionNo &&
          confirmReceipt.body.documentType === documentType &&
          confirmReceipt.body.effectiveFrom === ports.renewedEffectiveFrom &&
          confirmReceipt.body.effectiveUntil === ports.renewedEffectiveUntil,
        `r14-stage-b:${submissionType}:${documentType}:confirm-body-mismatch`,
      );
      const docRecord = confirmReceipt.data;
      const documentId = text(
        docRecord.documentId,
        `r14-stage-b:${submissionType}:${documentType}:documentId`,
      );
      const checksumSha256 = text(
        docRecord.checksumSha256,
        `r14-stage-b:${submissionType}:${documentType}:checksumSha256`,
      );
      const fileSize = integer(
        docRecord.fileSize,
        `r14-stage-b:${submissionType}:${documentType}:fileSize`,
      );
      requireFact(
        docRecord.submissionId === submissionId &&
          docRecord.documentType === documentType &&
          docRecord.effectiveFrom === ports.renewedEffectiveFrom &&
          docRecord.effectiveUntil === ports.renewedEffectiveUntil &&
          SHA64_RE.test(checksumSha256) &&
          fileSize > 0,
        `r14-stage-b:${submissionType}:${documentType}:confirm-receipt-invalid`,
      );

      const downloadProof = await ports.readbackFleetDocument(
        submissionId,
        documentId,
      );
      requireFact(
        downloadProof.scanState === "clean" &&
          downloadProof.sha256 === checksumSha256 &&
          downloadProof.readbackSha256 === checksumSha256 &&
          downloadProof.bytes === fileSize,
        `r14-stage-b:${submissionType}:${documentType}:readback-digest-mismatch`,
      );

      const afterUploadDetail = await ports.readFleetSubmission(submissionId);
      const afterUploadSub = object(afterUploadDetail.submission);
      const nextRevisionNo = integer(afterUploadSub.revisionNo);
      requireFact(
        afterUploadSub.submissionId === submissionId &&
          nextRevisionNo > currentRevisionNo &&
          records(afterUploadDetail.documents).some(
            (d) =>
              d.documentId === documentId &&
              d.documentType === documentType &&
              d.checksumSha256 === checksumSha256,
          ),
        `r14-stage-b:${submissionType}:${documentType}:detail-revision-readback-invalid`,
      );
      currentRevisionNo = nextRevisionNo;

      uploadedDocs.push({
        documentId,
        submissionId,
        documentType,
        effectiveFrom: ports.renewedEffectiveFrom,
        effectiveUntil: ports.renewedEffectiveUntil,
        sha256: checksumSha256,
        readbackSha256: downloadProof.readbackSha256,
        scanState: "clean",
        bytes: fileSize,
        reviewStatus: "approved",
      });
    }

    const submitReceipt = await ports.submitFleetRenewal(
      submissionId,
      currentRevisionNo,
    );
    requireFact(
      submitReceipt.body.expectedRevisionNo === currentRevisionNo,
      `r14-stage-b:${submissionType}:submit-expected-revision-mismatch`,
    );
    const submittedSub = object(submitReceipt.data.submission);
    const submittedRevisionNo = integer(submittedSub.revisionNo);
    requireFact(
      submittedSub.submissionId === submissionId &&
        submittedSub.status === "submitted" &&
        submittedSub.submittedBy === fleetRole.actorId &&
        submittedRevisionNo > currentRevisionNo,
      `r14-stage-b:${submissionType}:submit-receipt-invalid`,
    );

    await ports.openAdminSupplyReview(submissionId);
    const startReceipt = await ports.startAdminSupplyReview(
      submissionId,
      submittedRevisionNo,
    );
    requireFact(
      startReceipt.body.expectedRevisionNo === submittedRevisionNo,
      `r14-stage-b:${submissionType}:start-review-expected-revision-mismatch`,
    );
    const inReviewSub = startReceipt.data.submission
      ? object(startReceipt.data.submission)
      : startReceipt.data;
    const inReviewRevisionNo = integer(inReviewSub.revisionNo);
    requireFact(
      inReviewSub.submissionId === submissionId &&
        inReviewSub.status === "in_review" &&
        inReviewSub.reviewStartedBy === adminRole.principalId &&
        inReviewRevisionNo > submittedRevisionNo,
      `r14-stage-b:${submissionType}:start-review-receipt-invalid`,
    );

    const approveReceipt = await ports.approveAdminSupplyReview(
      submissionId,
      inReviewRevisionNo,
    );
    requireFact(
      approveReceipt.body.expectedRevisionNo === inReviewRevisionNo,
      `r14-stage-b:${submissionType}:approve-expected-revision-mismatch`,
    );
    const approvedSub = approveReceipt.data.submission
      ? object(approveReceipt.data.submission)
      : approveReceipt.data;
    const finalRevisionNo = integer(approvedSub.revisionNo);
    requireFact(
      approvedSub.submissionId === submissionId &&
        approvedSub.status === "approved" &&
        approvedSub.submittedBy === fleetRole.actorId &&
        approvedSub.reviewedBy === adminRole.principalId &&
        approvedSub.reviewedBy !== approvedSub.submittedBy &&
        finalRevisionNo > inReviewRevisionNo,
      `r14-stage-b:${submissionType}:approve-receipt-invalid`,
    );

    const [finalDetail, audits] = await Promise.all([
      ports.readFleetSubmission(submissionId),
      ports.readAudit(submissionId),
    ]);
    const finalSub = object(finalDetail.submission);
    const reviewEvents = records(finalDetail.reviewEvents);
    const finalDocs = records(finalDetail.documents);
    requireFact(
      finalSub.submissionId === submissionId &&
        finalSub.status === "approved" &&
        finalSub.submittedBy === fleetRole.actorId &&
        finalSub.reviewedBy === adminRole.principalId &&
        finalSub.revisionNo === finalRevisionNo &&
        reviewEvents.some(
          (e) => e.eventType === "submitted" && e.actorId === fleetRole.actorId,
        ) &&
        reviewEvents.some(
          (e) =>
            e.eventType === "review_started" &&
            e.actorId === adminRole.principalId,
        ) &&
        reviewEvents.some(
          (e) =>
            e.eventType === "approved" && e.actorId === adminRole.principalId,
        ) &&
        uploadedDocs.every((u) =>
          finalDocs.some(
            (d) =>
              d.documentId === u.documentId && d.reviewStatus === "approved",
          ),
        ) &&
        audits.some((a) => a.resourceId === submissionId),
      `r14-stage-b:${submissionType}:canonical-approval-readback-invalid`,
    );

    return {
      submissionType,
      submissionId,
      subjectId,
      submittedBy: fleetRole.actorId,
      reviewStartedBy: adminRole.principalId,
      reviewedBy: adminRole.principalId,
      approvedAt: text(finalSub.reviewedAt ?? finalSub.updatedAt),
      finalRevisionNo,
      createRequestId: createdReceipt.requestId,
      submitRequestId: submitReceipt.requestId,
      startReviewRequestId: startReceipt.requestId,
      approveRequestId: approveReceipt.requestId,
      documents: uploadedDocs,
    };
  };

  const profileCorrection = await executeSingleTypedRenewal(
    "profile_correction",
    target.driverId,
    R14_DRIVER_DOC_TYPES,
  );
  const contractUpdate = await executeSingleTypedRenewal(
    "contract_update",
    target.vehicleId,
    ["fleet_participation_contract", "vehicle_registration"],
  );
  const insuranceUpdate = await executeSingleTypedRenewal(
    "insurance_update",
    target.vehicleId,
    ["insurance_policy"],
  );

  // 6. Verify post-renewal canonical history, supersession, and cleared holds.
  const [
    driverAfter,
    vehicleAfter,
    contractsAfter,
    policiesAfter,
    driverReadinessAfter,
    vehicleReadinessAfter,
    contractSubAfter,
    insuranceSubAfter,
  ] = await Promise.all([
    ports.readRegistryDriver(target.driverId),
    ports.readRegistryVehicle(target.vehicleId),
    ports.readRegistryContracts(target.vehicleId),
    ports.readRegistryPolicies(target.vehicleId),
    ports.readDriverReadiness(target.driverId),
    ports.readVehicleReadiness(target.vehicleId),
    ports.readFleetSubmission(contractUpdate.submissionId),
    ports.readFleetSubmission(insuranceUpdate.submissionId),
  ]);

  const renewedContractId = text(
    object(contractSubAfter.submission).canonicalContractId,
    "r14-stage-b:renewedContractId",
  );
  const renewedPolicyId = text(
    object(insuranceSubAfter.submission).canonicalPolicyId,
    "r14-stage-b:renewedPolicyId",
  );
  requireFact(
    renewedContractId !== target.canonicalContractId &&
      renewedPolicyId !== target.canonicalPolicyId,
    "r14-stage-b:renewed-contract-or-policy-id-not-rotated",
  );

  const expectedRenewedEndIso = `${ports.renewedEffectiveUntil}T23:59:59.000Z`;
  const priorContractAfter = contractsAfter.find(
    (c) => c.contractId === target.canonicalContractId,
  );
  const newContractAfter = contractsAfter.find(
    (c) => c.contractId === renewedContractId,
  );
  requireFact(
    priorContractAfter !== undefined &&
      priorContractAfter.sourceSubmissionId === target.vehicleSubmissionId &&
      priorContractAfter.supersededByContractId === renewedContractId &&
      typeof priorContractAfter.supersededAt === "string" &&
      priorContractAfter.supersededAt.length > 0 &&
      newContractAfter !== undefined &&
      newContractAfter.vehicleId === target.vehicleId &&
      newContractAfter.sourceSubmissionId === contractUpdate.submissionId &&
      newContractAfter.status === "active" &&
      newContractAfter.lifecycleStatus === "active" &&
      newContractAfter.endAt === expectedRenewedEndIso &&
      newContractAfter.supersededByContractId == null,
    "r14-stage-b:contract-supersession-history-invalid",
  );

  const priorPolicyAfter = policiesAfter.find(
    (p) => p.policyId === target.canonicalPolicyId,
  );
  const newPolicyAfter = policiesAfter.find(
    (p) => p.policyId === renewedPolicyId,
  );
  requireFact(
    priorPolicyAfter !== undefined &&
      priorPolicyAfter.sourceSubmissionId === target.vehicleSubmissionId &&
      priorPolicyAfter.supersededByPolicyId === renewedPolicyId &&
      typeof priorPolicyAfter.supersededAt === "string" &&
      priorPolicyAfter.supersededAt.length > 0 &&
      newPolicyAfter !== undefined &&
      newPolicyAfter.vehicleId === target.vehicleId &&
      newPolicyAfter.sourceSubmissionId === insuranceUpdate.submissionId &&
      newPolicyAfter.status === "active" &&
      newPolicyAfter.lifecycleStatus === "active" &&
      newPolicyAfter.endAt === expectedRenewedEndIso &&
      newPolicyAfter.supersededByPolicyId == null,
    "r14-stage-b:policy-supersession-history-invalid",
  );

  const driverBlockedAfter = Array.isArray(
    driverAfter.eligibilityBlockedReasons,
  )
    ? driverAfter.eligibilityBlockedReasons
    : ["invalid"];
  requireFact(
    driverAfter.driverId === target.driverId &&
      driverAfter.workState === "available" &&
      driverAfter.lifecycleStatus === "active" &&
      driverAfter.licensesValid === true &&
      driverAfter.dispatchEligible === true &&
      driverAfter.professionalDriverLicenseExpiry ===
        ports.renewedEffectiveUntil &&
      driverAfter.taxiDriverRegistrationExpiry ===
        ports.renewedEffectiveUntil &&
      driverBlockedAfter.length === 0,
    "r14-stage-b:driver-post-renewal-registry-state-invalid",
  );

  const vehicleLifecycleAfter = object(vehicleAfter.supplyLifecycle);
  const vehicleDispatchAfter = object(vehicleLifecycleAfter.dispatch);
  const vehicleBlockedAfter = Array.isArray(vehicleDispatchAfter.blockedReasons)
    ? vehicleDispatchAfter.blockedReasons
    : ["invalid"];
  requireFact(
    vehicleAfter.vehicleId === target.vehicleId &&
      vehicleAfter.plateNo === target.plateNo &&
      vehicleAfter.dispatchableFlag === true &&
      vehicleAfter.exclusivityApproved === true &&
      vehicleAfter.insuranceStatus === "valid" &&
      object(vehicleLifecycleAfter.contract).lifecycleStatus === "active" &&
      object(vehicleLifecycleAfter.insurance).lifecycleStatus === "active" &&
      vehicleDispatchAfter.eligible === true &&
      vehicleBlockedAfter.length === 0,
    "r14-stage-b:vehicle-post-renewal-registry-state-invalid",
  );

  const driverReadinessReasonsAfter = Array.isArray(
    driverReadinessAfter.reasonCodes,
  )
    ? driverReadinessAfter.reasonCodes
    : ["invalid"];
  const vehicleReadinessReasonsAfter = Array.isArray(
    vehicleReadinessAfter.reasonCodes,
  )
    ? vehicleReadinessAfter.reasonCodes
    : ["invalid"];
  requireFact(
    driverReadinessAfter.subjectId === target.driverId &&
      driverReadinessAfter.state === "ready" &&
      driverReadinessReasonsAfter.length === 0 &&
      vehicleReadinessAfter.subjectId === target.vehicleId &&
      vehicleReadinessAfter.state === "ready" &&
      vehicleReadinessReasonsAfter.length === 0,
    "r14-stage-b:post-renewal-readiness-holds-remained",
  );

  // 7. Verify dispatch job state before reuse (fail closed if terminal) and verify post-renewal candidate eligibility.
  const dispatchState = await ports.readDispatchJobState(
    ports.orderId,
    ports.dispatchJobId,
  );
  requireFact(
    REUSABLE_DISPATCH_JOB_STATUSES.has(dispatchState.jobStatus) &&
      REUSABLE_ORDER_STATUSES.has(dispatchState.orderStatus),
    "r14-stage-b:dispatch-job-or-order-terminal-before-assign",
  );

  // Restore Driver authority and location only after all canonical renewals
  // and readiness checks. Candidates and assignment need the fresh heartbeat.
  await ports.rebindDriverSession(target.driverId);
  await ports.sendInitialDriverHeartbeat();

  const postCandidates = await ports.readPostRenewalCandidates();
  const renewedOwnCandidate = postCandidates.find(
    (c) => c.driverId === target.driverId && c.vehicleId === target.vehicleId,
  );
  requireFact(
    renewedOwnCandidate !== undefined,
    "r14-stage-b:renewed-pair-missing-from-normal-candidates",
  );
  assertOwnPair(renewedOwnCandidate, {
    driverId: target.driverId,
    vehicleId: target.vehicleId,
  });

  return {
    schema: R14_STAGE_B_SCHEMA,
    stage: "stageB",
    repository: R14_REPOSITORY,
    definitionSha: expected.definitionSha,
    runtimeSha: expected.runtimeSha,
    evaluatedUtcDate: expected.currentUtcDate,
    sourceRunId: ports.officialArtifact.runId,
    sourceArtifactId: ports.officialArtifact.artifactId,
    sourceArchiveSha256: ports.officialArtifact.archiveSha256,
    sourceJourneyEvidenceSha256: ports.officialArtifact.journeyEvidenceSha256,
    fleetPartnerId: expected.fleetPartnerId,
    tenantId: expected.tenantId,
    driverId: target.driverId,
    vehicleId: target.vehicleId,
    plateNo: target.plateNo,
    priorDriverSubmissionId: target.driverSubmissionId,
    priorVehicleSubmissionId: target.vehicleSubmissionId,
    priorContractId: target.canonicalContractId,
    priorPolicyId: target.canonicalPolicyId,
    renewedContractId,
    renewedPolicyId,
    renewedEffectiveFrom: ports.renewedEffectiveFrom,
    renewedEffectiveUntil: ports.renewedEffectiveUntil,
    preRenewalSetup: {
      driverWorkState: "available",
      driverLicensesValid: false,
      driverDispatchEligible: false,
      driverBlockedReasons: driverBlockedBefore,
      driverReadinessReasons: driverReadinessReasonsBefore,
      vehicleDispatchEligible: false,
      vehicleInsuranceStatus: "expired",
      vehicleContractStatus: "expired",
      vehicleBlockedReasons: vehicleBlockedBefore,
      vehicleReadinessReasons: vehicleReadinessReasonsBefore,
      absentFromNormalDispatchCandidates: true,
      driverAuthRefusal: "DRIVER_CERT_INVALID",
      dispatchJobId: ports.dispatchJobId,
      orderId: ports.orderId,
    },
    renewals: {
      profileCorrection,
      contractUpdate,
      insuranceUpdate,
    },
    postRenewalVerification: {
      sameCanonicalDriverId: true,
      sameCanonicalVehicleId: true,
      priorContractSupersededBy: renewedContractId,
      priorPolicySupersededBy: renewedPolicyId,
      driverReadinessState: "ready",
      vehicleReadinessState: "ready",
      driverDispatchEligible: true,
      vehicleDispatchEligible: true,
      dispatchJobStatusBeforeAssign: dispatchState.jobStatus,
      presentInNormalDispatchCandidates: true,
      driverSessionRestored: true,
      initialHeartbeatAccepted: true,
    },
  };
}
