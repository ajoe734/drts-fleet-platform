import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import type { Page } from "@playwright/test";
import { describe, expect, it } from "vitest";
import {
  Evidence,
  JourneyFailure,
  NativeTransport,
  assertOwnPair,
  object,
  records,
  requireFact,
  text,
  type CallOptions,
  type Role,
} from "../../e2e/owned-referral-business-journey/protocol";
import {
  R14_ALL_STAGE_A_DOC_TYPES,
  R14_DRIVER_DOC_TYPES,
  R14_PRIOR_TARGET_MANIFEST_SCHEMA,
  R14_REPOSITORY,
  R14_STAGE_A_SCHEMA,
  R14_STAGE_B_SCHEMA,
  buildR14StageAProjection,
  captureR14UiPost,
  parseR14PriorTargetManifest,
  runR14StageBRenewalLifecycle,
  type R14DocumentUploadSpec,
  type R14ExpectedContext,
  type R14OfficialArtifactMetadata,
  type R14StageADocumentFact,
  type R14StageAProjection,
  type R14StageBPorts,
  type R14UiPostReceipt,
  type R14VerifiedAdminRole,
  type R14VerifiedFleetRole,
} from "../../e2e/owned-referral-business-journey/r14-approved-renewal";

const definitionSha = "a".repeat(40);
const runtimeSha = "b".repeat(40);
const stageADate = "2026-11-22";
const stageBDate = "2026-11-23";
const renewedFrom = "2026-11-22";
const renewedUntil = "2027-11-23";
const entrySlug = "yuhe-residence";
const subject = "referral-demo-yuhe-residence";
const fleetPartnerId = "fleet-demo-001";
const tenantId = "10000000-0000-0000-0000-000000000201";
const nonce = "owned-referral-45000000101-11111111-2222-3333-4444-555555555555";
const driverId = "drv_11111111-2222-3333-4444-555555555555";
const vehicleId = "veh_66666666-7777-8888-9999-000000000000";
const plateNo = "SIM-1234ABCD";
const driverSubmissionId = "11111111-2222-4333-8444-555555555501";
const vehicleSubmissionId = "11111111-2222-4333-8444-555555555502";
const priorContractId = "contract_11111111-2222-4333-8444-555555555503";
const priorPolicyId = "policy_11111111-2222-4333-8444-555555555504";
const renewedContractId = "contract_99999999-2222-4333-8444-555555555503";
const renewedPolicyId = "policy_99999999-2222-4333-8444-555555555504";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const expectedStageBContext: R14ExpectedContext = {
  definitionSha,
  runtimeSha,
  currentUtcDate: stageBDate,
  entrySlug,
  subject,
  fleetPartnerId,
  tenantId,
};

const fleetRole: R14VerifiedFleetRole = {
  fleetPartnerId,
  tenantId,
  actorId: "key_fleet_submitter_001",
};

const adminRole: R14VerifiedAdminRole = {
  principalId: "usr_platform_admin_001",
  membershipId: "mem_platform_admin_001",
  sessionId: "ses_platform_admin_001",
  scopes: ["supply:review", "regulatory:write", "audit:read"],
};

function makeStageADocuments(
  effectiveUntil = stageADate,
): R14StageADocumentFact[] {
  return R14_ALL_STAGE_A_DOC_TYPES.map((documentType, index) => {
    const digest = sha256(`stage-a-doc-${index + 1}-${documentType}`);
    const submissionId = R14_DRIVER_DOC_TYPES.includes(documentType)
      ? driverSubmissionId
      : vehicleSubmissionId;
    return {
      documentId: `doc_stage_a_${index + 1}_${documentType}`,
      submissionId,
      documentType,
      effectiveFrom: "2026-11-21",
      effectiveUntil,
      sha256: digest,
      readbackSha256: digest,
      scanState: "clean",
      bytes: 248,
      reviewStatus: "approved",
    };
  });
}

function makeStageATarget(approvedUtcDate = stageADate): R14StageAProjection {
  return {
    schema: R14_STAGE_A_SCHEMA,
    stage: "stageA",
    repository: R14_REPOSITORY,
    definitionSha,
    runtimeSha,
    entrySlug,
    subject,
    fleetPartnerId,
    tenantId,
    nonce,
    approvedUtcDate,
    driverId,
    vehicleId,
    plateNo,
    driverSubmissionId,
    vehicleSubmissionId,
    canonicalContractId: priorContractId,
    canonicalPolicyId: priorPolicyId,
    contractEndAt: `${approvedUtcDate}T23:59:59.000Z`,
    policyEndAt: `${approvedUtcDate}T23:59:59.000Z`,
    professionalDriverLicenseExpiry: approvedUtcDate,
    taxiDriverRegistrationExpiry: approvedUtcDate,
    exclusivityEffectiveEnd: `${renewedUntil}T23:59:59.000Z`,
    documents: makeStageADocuments(approvedUtcDate),
    approvals: {
      driver: {
        submissionId: driverSubmissionId,
        status: "approved",
        submittedBy: fleetRole.actorId,
        reviewedBy: adminRole.principalId,
        approvedAt: `${approvedUtcDate}T10:15:00.000Z`,
        revisionNo: 4,
      },
      vehicle: {
        submissionId: vehicleSubmissionId,
        status: "approved",
        submittedBy: fleetRole.actorId,
        reviewedBy: adminRole.principalId,
        approvedAt: `${approvedUtcDate}T10:16:00.000Z`,
        revisionNo: 5,
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

const officialArtifact: R14OfficialArtifactMetadata = {
  runId: 45000000101,
  artifactId: 14000000101,
  artifactName: `owned-referral-business-${runtimeSha}-45000000101`,
  headSha: definitionSha,
  headBranch: "dev",
  archiveBytes: 54321,
  archiveSha256: sha256("official-archive"),
  memberCount: 34,
  journeyEvidenceBytes: 4321,
  journeyEvidenceSha256: sha256("journey-evidence"),
  runtimeBeforeSha256: sha256("runtime-before"),
  runtimeAfterSha256: sha256("runtime-after"),
  bookingJournalSha256: sha256("booking-journal"),
};

function makeReceipt(
  path: string,
  body: Record<string, unknown>,
  data: Record<string, unknown>,
  requestId: string,
): R14UiPostReceipt {
  return {
    path: `/control-plane-proxy${path}`,
    status: 200,
    runtimeSha,
    requestId,
    idempotencyKey: null,
    body,
    data,
    meta: { requestId },
  };
}

function expiredAuthRefusal() {
  return {
    status: 403,
    headers: new Headers({ "x-drts-candidate-sha": runtimeSha }),
    data: {
      error: {
        code: "DRIVER_CERT_INVALID",
        details: {
          driverId,
          lifecycleStatus: "active",
          eligibilityBlockedReasons: ["licenses_invalid"],
        },
      },
    },
  };
}

function createStageBPorts(): R14StageBPorts & {
  actions: string[];
  state: {
    driverWorkState: string;
    driverRenewed: boolean;
    contractRenewed: boolean;
    insuranceRenewed: boolean;
    driverBound: boolean;
    heartbeatSent: boolean;
    jobStatus: string;
    orderStatus: string;
    submissions: Map<
      string,
      {
        submission: Record<string, unknown>;
        driverDraft: Record<string, unknown> | null;
        vehicleDraft: Record<string, unknown> | null;
        documents: Array<Record<string, unknown>>;
        reviewEvents: Array<Record<string, unknown>>;
      }
    >;
  };
} {
  const actions: string[] = [];
  const target = makeStageATarget();
  const submissions = new Map<
    string,
    {
      submission: Record<string, unknown>;
      driverDraft: Record<string, unknown> | null;
      vehicleDraft: Record<string, unknown> | null;
      documents: Array<Record<string, unknown>>;
      reviewEvents: Array<Record<string, unknown>>;
    }
  >();

  submissions.set(driverSubmissionId, {
    submission: {
      submissionId: driverSubmissionId,
      fleetPartnerId,
      submissionType: "driver_onboarding",
      status: "approved",
      revisionNo: 4,
      canonicalDriverId: driverId,
      submittedBy: fleetRole.actorId,
      reviewedBy: adminRole.principalId,
      reviewedAt: `${stageADate}T10:15:00.000Z`,
      updatedAt: `${stageADate}T10:15:00.000Z`,
    },
    driverDraft: {
      submissionId: driverSubmissionId,
      professionalDriverLicenseExpiry: stageADate,
      taxiDriverRegistrationExpiry: stageADate,
    },
    vehicleDraft: null,
    documents: target.documents
      .filter((d) => d.submissionId === driverSubmissionId)
      .map((d) => ({ ...d, checksumSha256: d.sha256, fileSize: d.bytes })),
    reviewEvents: [],
  });
  submissions.set(vehicleSubmissionId, {
    submission: {
      submissionId: vehicleSubmissionId,
      fleetPartnerId,
      submissionType: "vehicle_onboarding",
      status: "approved",
      revisionNo: 5,
      canonicalVehicleId: vehicleId,
      canonicalContractId: priorContractId,
      canonicalPolicyId: priorPolicyId,
      submittedBy: fleetRole.actorId,
      reviewedBy: adminRole.principalId,
      reviewedAt: `${stageADate}T10:16:00.000Z`,
      updatedAt: `${stageADate}T10:16:00.000Z`,
    },
    driverDraft: null,
    vehicleDraft: {
      submissionId: vehicleSubmissionId,
      plateNo,
    },
    documents: target.documents
      .filter((d) => d.submissionId === vehicleSubmissionId)
      .map((d) => ({ ...d, checksumSha256: d.sha256, fileSize: d.bytes })),
    reviewEvents: [],
  });

  const state = {
    driverWorkState: "offline",
    driverRenewed: false,
    contractRenewed: false,
    insuranceRenewed: false,
    driverBound: false,
    heartbeatSent: false,
    jobStatus: "reserved",
    orderStatus: "preassigned",
    submissions,
  };

  let createdCounter = 0;
  let docCounter = 0;

  return {
    actions,
    state,
    expected: expectedStageBContext,
    officialArtifact,
    target,
    fleetRole,
    adminRole,
    renewedEffectiveFrom: renewedFrom,
    renewedEffectiveUntil: renewedUntil,
    orderId: "order_stage_b_main_001",
    dispatchJobId: "job_stage_b_main_001",
    readFleetSession: async () => ({
      active: true,
      identity: {
        realm: "partner",
        authMode: "jwt_bearer",
        actorType: "partner_api_key",
        partnerId: fleetPartnerId,
        tenantId,
        actorId: fleetRole.actorId,
        scopes: ["billing:read", "partner:read", "partner:write"],
      },
    }),
    readAdminBrowserSession: async () => ({
      active: true,
      identity: {
        realm: "platform",
        authMode: "jwt_bearer",
        actorType: "platform_admin",
        principalId: adminRole.principalId,
        membershipId: adminRole.membershipId,
        sessionId: adminRole.sessionId,
        scopes: [...adminRole.scopes],
      },
    }),
    restoreDriverAvailable: async (id) => {
      expect(id).toBe(driverId);
      state.driverWorkState = "available";
      actions.push("restore-available");
    },
    rebindDriverSession: async (id) => {
      expect(id).toBe(driverId);
      if (
        !state.driverRenewed ||
        !state.contractRenewed ||
        !state.insuranceRenewed
      )
        throw new JourneyFailure(
          "driver-auth-session",
          403,
          "DRIVER_CERT_INVALID",
        );
      state.driverBound = true;
      actions.push("rebind-driver");
    },
    probeExpiredDriverAuth: async (id) => {
      expect(id).toBe(driverId);
      expect(state.driverRenewed).toBe(false);
      actions.push("expired-driver-auth-refusal");
      return expiredAuthRefusal();
    },
    sendInitialDriverHeartbeat: async () => {
      if (!state.driverBound)
        throw new Error("heartbeat requires fresh Driver binding");
      state.heartbeatSent = true;
      actions.push("initial-driver-heartbeat");
    },
    readRegistryDriver: async (id) => ({
      driverId: id,
      workState: state.driverWorkState,
      lifecycleStatus: "active",
      licensesValid: state.driverRenewed,
      dispatchEligible:
        state.driverWorkState === "available" && state.driverRenewed,
      professionalDriverLicenseExpiry: state.driverRenewed
        ? renewedUntil
        : stageADate,
      taxiDriverRegistrationExpiry: state.driverRenewed
        ? renewedUntil
        : stageADate,
      eligibilityBlockedReasons: state.driverRenewed
        ? []
        : ["licenses_invalid"],
    }),
    readRegistryVehicle: async (id) => {
      const allVehicleReady = state.contractRenewed && state.insuranceRenewed;
      const blockedReasons = [
        ...(state.contractRenewed ? [] : ["contract_inactive"]),
        ...(state.insuranceRenewed ? [] : ["insurance_invalid"]),
      ];
      return {
        vehicleId: id,
        plateNo,
        dispatchableFlag: allVehicleReady,
        exclusivityApproved: true,
        insuranceStatus: state.insuranceRenewed ? "valid" : "expired",
        supplyLifecycle: {
          contract: {
            contractId: state.contractRenewed
              ? renewedContractId
              : priorContractId,
            lifecycleStatus: state.contractRenewed ? "active" : "expired",
            endAt: `${state.contractRenewed ? renewedUntil : stageADate}T23:59:59.000Z`,
          },
          insurance: {
            policyId: state.insuranceRenewed ? renewedPolicyId : priorPolicyId,
            lifecycleStatus: state.insuranceRenewed ? "active" : "expired",
            endAt: `${state.insuranceRenewed ? renewedUntil : stageADate}T23:59:59.000Z`,
          },
          offboarding: { status: "none" },
          dispatch: {
            eligible: allVehicleReady,
            blockedReasons,
          },
        },
      };
    },
    readRegistryContracts: async () => [
      {
        contractId: priorContractId,
        vehicleId,
        sourceSubmissionId: vehicleSubmissionId,
        status: state.contractRenewed ? "terminated" : "active",
        lifecycleStatus: "expired",
        endAt: `${stageADate}T23:59:59.000Z`,
        supersededByContractId: state.contractRenewed
          ? renewedContractId
          : null,
        supersededAt: state.contractRenewed
          ? `${stageBDate}T02:00:00.000Z`
          : null,
      },
      ...(state.contractRenewed
        ? [
            {
              contractId: renewedContractId,
              vehicleId,
              sourceSubmissionId: "sub_renewal_contract_update",
              status: "active",
              lifecycleStatus: "active",
              endAt: `${renewedUntil}T23:59:59.000Z`,
              supersededByContractId: null,
              supersededAt: null,
            },
          ]
        : []),
    ],
    readRegistryPolicies: async () => [
      {
        policyId: priorPolicyId,
        vehicleId,
        sourceSubmissionId: vehicleSubmissionId,
        status: "expired",
        lifecycleStatus: "expired",
        endAt: `${stageADate}T23:59:59.000Z`,
        supersededByPolicyId: state.insuranceRenewed ? renewedPolicyId : null,
        supersededAt: state.insuranceRenewed
          ? `${stageBDate}T02:05:00.000Z`
          : null,
      },
      ...(state.insuranceRenewed
        ? [
            {
              policyId: renewedPolicyId,
              vehicleId,
              sourceSubmissionId: "sub_renewal_insurance_update",
              status: "active",
              lifecycleStatus: "active",
              endAt: `${renewedUntil}T23:59:59.000Z`,
              supersededByPolicyId: null,
              supersededAt: null,
            },
          ]
        : []),
    ],
    readRenewalTargets: async () => ({
      fleetPartnerId,
      drivers: [
        {
          driverId,
          fleetPartnerId,
          ready: state.driverRenewed,
          reasonCodes: state.driverRenewed
            ? []
            : ["DRIVER_LICENSE_EXPIRED", "DRIVER_REGISTRATION_EXPIRED"],
        },
      ],
      vehicles: [
        {
          vehicleId,
          fleetPartnerId,
          plateNo,
          ready: state.contractRenewed && state.insuranceRenewed,
          reasonCodes: [
            ...(state.contractRenewed
              ? []
              : ["CONTRACT_INACTIVE", "VEHICLE_DOCUMENT_MISSING"]),
            ...(state.insuranceRenewed ? [] : ["INSURANCE_EXPIRED"]),
          ],
        },
      ],
    }),
    readDriverReadiness: async (id) => ({
      subjectType: "driver",
      subjectId: id,
      state: state.driverRenewed ? "ready" : "not_ready",
      reasonCodes: state.driverRenewed
        ? []
        : ["DRIVER_LICENSE_EXPIRED", "DRIVER_REGISTRATION_EXPIRED"],
    }),
    readVehicleReadiness: async (id) => {
      const reasons = [
        ...(state.contractRenewed
          ? []
          : ["CONTRACT_INACTIVE", "VEHICLE_DOCUMENT_MISSING"]),
        ...(state.insuranceRenewed ? [] : ["INSURANCE_EXPIRED"]),
      ];
      return {
        subjectType: "vehicle",
        subjectId: id,
        state: reasons.length === 0 ? "ready" : "not_ready",
        reasonCodes: reasons,
      };
    },
    readFleetSubmission: async (submissionId) => {
      const record = submissions.get(submissionId);
      if (!record) throw new Error(`missing submission ${submissionId}`);
      return structuredClone(record);
    },
    readPreRenewalCandidates: async () => [
      {
        driverId: "drv-demo-001",
        vehicleId: "veh-demo-001",
        serviceBuckets: ["business_dispatch"],
        etaMinutes: 8,
      },
    ],
    openFleetRenewalNew: async (submissionType, subjectId) => {
      actions.push(`fleet-open-new:${submissionType}:${subjectId}`);
    },
    createFleetRenewalDraft: async (submissionType, subjectId) => {
      createdCounter++;
      const submissionId = `sub_renewal_${submissionType}`;
      actions.push(`fleet-create:${submissionType}:${submissionId}`);
      const isDriver = submissionType === "profile_correction";
      const detail = {
        submission: {
          submissionId,
          fleetPartnerId,
          submissionType,
          status: "draft",
          revisionNo: 1,
          subjectDriverId: isDriver ? subjectId : null,
          subjectVehicleId: isDriver ? null : subjectId,
          canonicalDriverId: isDriver ? subjectId : null,
          canonicalVehicleId: isDriver ? null : subjectId,
          canonicalContractId: isDriver ? null : priorContractId,
          canonicalPolicyId: isDriver ? null : priorPolicyId,
          submittedBy: null,
          reviewedBy: null,
          updatedAt: `${stageBDate}T01:00:00.000Z`,
        },
        driverDraft: isDriver
          ? {
              submissionId,
              professionalDriverLicenseExpiry: renewedUntil,
              taxiDriverRegistrationExpiry: renewedUntil,
            }
          : null,
        vehicleDraft: isDriver ? null : { submissionId, plateNo },
        documents: [],
        reviewEvents: [],
      };
      submissions.set(submissionId, detail);
      return makeReceipt(
        "/fleet-partner/supply-submissions/renewals",
        { submissionType },
        structuredClone(detail),
        `req-create-${createdCounter}`,
      );
    },
    uploadFleetRenewalDocument: async (spec: R14DocumentUploadSpec) => {
      docCounter++;
      const detail = submissions.get(spec.submissionId)!;
      const documentId = `doc_renewed_${docCounter}_${spec.documentType}`;
      const digest = sha256(`renewed-bytes-${documentId}`);
      const docRecord = {
        documentId,
        submissionId: spec.submissionId,
        documentType: spec.documentType,
        effectiveFrom: spec.effectiveFrom,
        effectiveUntil: spec.effectiveUntil,
        checksumSha256: digest,
        fileSize: 312,
        reviewStatus: "pending",
      };
      detail.documents.push(docRecord);
      detail.submission.revisionNo = Number(detail.submission.revisionNo) + 1;
      actions.push(`fleet-upload:${spec.submissionType}:${spec.documentType}`);
      return makeReceipt(
        `/fleet-partner/supply-submissions/${spec.submissionId}/documents/confirm`,
        {
          expectedRevisionNo: spec.expectedRevisionNo,
          documentType: spec.documentType,
          effectiveFrom: spec.effectiveFrom,
          effectiveUntil: spec.effectiveUntil,
        },
        structuredClone(docRecord),
        `req-upload-${docCounter}`,
      );
    },
    readbackFleetDocument: async (_submissionId, documentId) => {
      const digest = sha256(`renewed-bytes-${documentId}`);
      return {
        sha256: digest,
        readbackSha256: digest,
        bytes: 312,
        scanState: "clean",
      };
    },
    submitFleetRenewal: async (submissionId, expectedRevisionNo) => {
      const detail = submissions.get(submissionId)!;
      detail.submission.status = "submitted";
      detail.submission.submittedBy = fleetRole.actorId;
      detail.submission.revisionNo = expectedRevisionNo + 1;
      detail.reviewEvents.push({
        eventId: `evt-submit-${submissionId}`,
        submissionId,
        eventType: "submitted",
        actorId: fleetRole.actorId,
      });
      actions.push(`fleet-submit:${submissionId}`);
      return makeReceipt(
        `/fleet-partner/supply-submissions/${submissionId}/submit`,
        { expectedRevisionNo },
        structuredClone(detail),
        `req-submit-${submissionId}`,
      );
    },
    openAdminSupplyReview: async (submissionId) => {
      actions.push(`admin-open:${submissionId}`);
    },
    startAdminSupplyReview: async (submissionId, expectedRevisionNo) => {
      const detail = submissions.get(submissionId)!;
      detail.submission.status = "in_review";
      detail.submission.reviewStartedBy = adminRole.principalId;
      detail.submission.revisionNo = expectedRevisionNo + 1;
      detail.reviewEvents.push({
        eventId: `evt-start-${submissionId}`,
        submissionId,
        eventType: "review_started",
        actorId: adminRole.principalId,
      });
      actions.push(`admin-start:${submissionId}`);
      return makeReceipt(
        `/admin/supply-review/submissions/${submissionId}/start`,
        { expectedRevisionNo },
        structuredClone(detail.submission),
        `req-start-${submissionId}`,
      );
    },
    approveAdminSupplyReview: async (submissionId, expectedRevisionNo) => {
      const detail = submissions.get(submissionId)!;
      detail.submission.status = "approved";
      detail.submission.reviewedBy = adminRole.principalId;
      detail.submission.reviewedAt = `${stageBDate}T02:10:00.000Z`;
      detail.submission.revisionNo = expectedRevisionNo + 1;
      for (const doc of detail.documents) doc.reviewStatus = "approved";
      detail.reviewEvents.push({
        eventId: `evt-approve-${submissionId}`,
        submissionId,
        eventType: "approved",
        actorId: adminRole.principalId,
      });
      const subType = detail.submission.submissionType;
      if (subType === "profile_correction") {
        state.driverRenewed = true;
      } else if (subType === "contract_update") {
        state.contractRenewed = true;
        detail.submission.canonicalContractId = renewedContractId;
      } else if (subType === "insurance_update") {
        state.insuranceRenewed = true;
        detail.submission.canonicalPolicyId = renewedPolicyId;
      }
      actions.push(`admin-approve:${submissionId}`);
      return makeReceipt(
        `/admin/supply-review/submissions/${submissionId}/approve`,
        { expectedRevisionNo },
        structuredClone(detail.submission),
        `req-approve-${submissionId}`,
      );
    },
    readAudit: async (submissionId) => [
      {
        auditId: `audit-${submissionId}`,
        resourceId: submissionId,
        moduleName: "fleet-partner",
        actionName: "create_supply_submission_renewal",
        actorId: fleetRole.actorId,
      },
    ],
    readDispatchJobState: async () => ({
      orderStatus: state.orderStatus,
      jobStatus: state.jobStatus,
    }),
    readPostRenewalCandidates: async () =>
      state.driverRenewed &&
      state.contractRenewed &&
      state.insuranceRenewed &&
      state.heartbeatSent
        ? [
            {
              driverId,
              vehicleId,
              serviceBuckets: ["business_dispatch"],
              eligibilityDecision: "eligible",
              hardReasonCodes: [],
              etaMinutes: 6,
            },
          ]
        : [],
  };
}

describe("R14 manifest & Stage A provenance validation", () => {
  it("validates zero-candidate Stage A and uniquely valid Stage B manifests", () => {
    const stageAManifest = parseR14PriorTargetManifest(
      JSON.stringify({
        schema: R14_PRIOR_TARGET_MANIFEST_SCHEMA,
        decision: "stageA",
        repository: R14_REPOSITORY,
        definitionSha,
        runtimeSha,
        evaluatedUtcDate: stageBDate,
        candidateCount: 0,
        officialArtifact: null,
        target: null,
      }),
      expectedStageBContext,
    );
    expect(stageAManifest.decision).toBe("stageA");
    expect(stageAManifest.target).toBeNull();

    const stageBManifest = parseR14PriorTargetManifest(
      JSON.stringify({
        schema: R14_PRIOR_TARGET_MANIFEST_SCHEMA,
        decision: "stageB",
        repository: R14_REPOSITORY,
        definitionSha,
        runtimeSha,
        evaluatedUtcDate: stageBDate,
        candidateCount: 1,
        officialArtifact,
        target: makeStageATarget(stageADate),
      }),
      expectedStageBContext,
    );
    expect(stageBManifest.decision).toBe("stageB");
    if (stageBManifest.decision === "stageB") {
      expect(stageBManifest.target.driverId).toBe(driverId);
      expect(stageBManifest.target.vehicleId).toBe(vehicleId);
      expect(stageBManifest.target.documents).toHaveLength(5);
    }
  });

  it("builds Stage A projection on same UTC day and rejects rollover or secret leakage", () => {
    const stageAContext: R14ExpectedContext = {
      ...expectedStageBContext,
      currentUtcDate: stageADate,
    };
    const target = makeStageATarget(stageADate);
    const projection = buildR14StageAProjection(target, stageAContext);
    expect(projection.approvedUtcDate).toBe(stageADate);
    expect(projection.documents).toHaveLength(5);

    // If UTC day changed before Stage A approval persisted, fail closed.
    expect(() =>
      buildR14StageAProjection(target, expectedStageBContext),
    ).toThrow(/utc-day-changed-before-approval/);

    // Stage B manifest rejects a target whose approvedUtcDate has not rolled over.
    expect(() =>
      parseR14PriorTargetManifest(
        JSON.stringify({
          schema: R14_PRIOR_TARGET_MANIFEST_SCHEMA,
          decision: "stageB",
          repository: R14_REPOSITORY,
          definitionSha,
          runtimeSha,
          evaluatedUtcDate: stageADate,
          candidateCount: 1,
          officialArtifact,
          target,
        }),
        stageAContext,
      ),
    ).toThrow(/utc-rollover-not-reached/);

    // Secret material inside target is rejected.
    expect(() =>
      buildR14StageAProjection(
        {
          ...target,
          nonce: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature123456",
        },
        stageAContext,
      ),
    ).toThrow(/secret-value/);
  });
});

describe("R14 Stage B controlled helper ports", () => {
  it("restores available setup, proves expiry denial, executes 3 typed Fleet/Admin UI renewals, and verifies supersession + dispatch recovery", async () => {
    const ports = createStageBPorts();
    const result = await runR14StageBRenewalLifecycle(ports);

    expect(result.schema).toBe(R14_STAGE_B_SCHEMA);
    expect(result.driverId).toBe(driverId);
    expect(result.vehicleId).toBe(vehicleId);
    expect(result.renewedContractId).toBe(renewedContractId);
    expect(result.renewedPolicyId).toBe(renewedPolicyId);
    expect(result.preRenewalSetup.absentFromNormalDispatchCandidates).toBe(
      true,
    );
    expect(result.preRenewalSetup.driverAuthRefusal).toBe(
      "DRIVER_CERT_INVALID",
    );
    expect(result.postRenewalVerification).toEqual({
      sameCanonicalDriverId: true,
      sameCanonicalVehicleId: true,
      priorContractSupersededBy: renewedContractId,
      priorPolicySupersededBy: renewedPolicyId,
      driverReadinessState: "ready",
      vehicleReadinessState: "ready",
      driverDispatchEligible: true,
      vehicleDispatchEligible: true,
      dispatchJobStatusBeforeAssign: "reserved",
      presentInNormalDispatchCandidates: true,
      driverSessionRestored: true,
      initialHeartbeatAccepted: true,
    });
    expect(ports.actions).toEqual([
      "restore-available",
      "expired-driver-auth-refusal",
      `fleet-open-new:profile_correction:${driverId}`,
      "fleet-create:profile_correction:sub_renewal_profile_correction",
      "fleet-upload:profile_correction:professional_driver_license",
      "fleet-upload:profile_correction:taxi_driver_registration",
      "fleet-submit:sub_renewal_profile_correction",
      "admin-open:sub_renewal_profile_correction",
      "admin-start:sub_renewal_profile_correction",
      "admin-approve:sub_renewal_profile_correction",
      `fleet-open-new:contract_update:${vehicleId}`,
      "fleet-create:contract_update:sub_renewal_contract_update",
      "fleet-upload:contract_update:fleet_participation_contract",
      "fleet-upload:contract_update:vehicle_registration",
      "fleet-submit:sub_renewal_contract_update",
      "admin-open:sub_renewal_contract_update",
      "admin-start:sub_renewal_contract_update",
      "admin-approve:sub_renewal_contract_update",
      `fleet-open-new:insurance_update:${vehicleId}`,
      "fleet-create:insurance_update:sub_renewal_insurance_update",
      "fleet-upload:insurance_update:insurance_policy",
      "fleet-submit:sub_renewal_insurance_update",
      "admin-open:sub_renewal_insurance_update",
      "admin-start:sub_renewal_insurance_update",
      "admin-approve:sub_renewal_insurance_update",
      "rebind-driver",
      "initial-driver-heartbeat",
    ]);
  });

  it("checks expiry and candidate absence before auth refusal, then all canonical/readiness reads before binding", async () => {
    const ports = createStageBPorts();
    const reads = new Set<string>();
    const methods = [
      "readRegistryDriver",
      "readRegistryVehicle",
      "readRegistryContracts",
      "readRegistryPolicies",
      "readDriverReadiness",
      "readVehicleReadiness",
    ] as const;
    const trackRead =
      <T>(method: string, read: (id: string) => Promise<T>) =>
      async (id: string) => {
        reads.add(
          `${ports.state.insuranceRenewed ? "after" : "before"}:${method}`,
        );
        return read(id);
      };
    ports.readRegistryDriver = trackRead(
      "readRegistryDriver",
      ports.readRegistryDriver,
    );
    ports.readRegistryVehicle = trackRead(
      "readRegistryVehicle",
      ports.readRegistryVehicle,
    );
    ports.readRegistryContracts = trackRead(
      "readRegistryContracts",
      ports.readRegistryContracts,
    );
    ports.readRegistryPolicies = trackRead(
      "readRegistryPolicies",
      ports.readRegistryPolicies,
    );
    ports.readDriverReadiness = trackRead(
      "readDriverReadiness",
      ports.readDriverReadiness,
    );
    ports.readVehicleReadiness = trackRead(
      "readVehicleReadiness",
      ports.readVehicleReadiness,
    );
    const readPre = ports.readPreRenewalCandidates;
    ports.readPreRenewalCandidates = async () => {
      reads.add("pre-candidates");
      return readPre();
    };
    const probe = ports.probeExpiredDriverAuth;
    ports.probeExpiredDriverAuth = async (id) => {
      expect([...reads]).toEqual([
        ...methods.map((m) => `before:${m}`),
        "pre-candidates",
      ]);
      return probe(id);
    };
    const rebind = ports.rebindDriverSession;
    ports.rebindDriverSession = async (id) => {
      for (const method of methods)
        expect(reads.has(`after:${method}`)).toBe(true);
      await rebind(id);
    };
    await runR14StageBRenewalLifecycle(ports);
  });

  it.each([
    "wrong-code",
    "wrong-subject",
    "wrong-runtime",
    "suspended",
    "unrelated-hold",
    "missing-details",
    "wrong-status",
    "transport",
  ])("fails closed on %s auth refusal before any renewal", async (failure) => {
    const ports = createStageBPorts();
    const refusal = expiredAuthRefusal();
    if (failure === "wrong-code") refusal.data.error.code = "FORBIDDEN";
    if (failure === "wrong-subject")
      refusal.data.error.details.driverId = "drv_foreign";
    if (failure === "wrong-runtime")
      refusal.headers.set("x-drts-candidate-sha", "c".repeat(40));
    if (failure === "suspended")
      refusal.data.error.details.lifecycleStatus = "suspended";
    if (failure === "unrelated-hold")
      refusal.data.error.details.eligibilityBlockedReasons.push("manual_hold");
    if (failure === "missing-details")
      refusal.data.error.details = {} as typeof refusal.data.error.details;
    if (failure === "wrong-status") refusal.status = 200;
    ports.probeExpiredDriverAuth = async () => {
      if (failure === "transport")
        throw new JourneyFailure("publicApi:transport");
      return refusal;
    };
    await expect(runR14StageBRenewalLifecycle(ports)).rejects.toThrow(
      failure === "transport"
        ? /publicApi:transport/
        : /expired-driver-auth-refusal-invalid/,
    );
    expect(ports.state.submissions.size).toBe(2);
    expect(ports.state.driverBound).toBe(false);
    expect(ports.state.heartbeatSent).toBe(false);
  });

  it("rejects wrong session/realm/scope, same actor, unrelated hold, foreign target, stale revision, unknown ACK, missing approval, remaining hold, and terminal job", async () => {
    const negativeCases: Array<{
      label: string;
      mutate: (ports: ReturnType<typeof createStageBPorts>) => void;
      expected: RegExp;
    }> = [
      {
        label: "wrong Fleet realm/scope",
        mutate: (p) => {
          p.readFleetSession = async () => ({
            active: true,
            identity: {
              realm: "partner",
              authMode: "jwt_bearer",
              actorType: "partner_api_key",
              partnerId: fleetPartnerId,
              tenantId,
              actorId: fleetRole.actorId,
              scopes: ["billing:read"],
            },
          });
        },
        expected: /r14-fleet:session-realm-tenant-or-scope-invalid/,
      },
      {
        label: "reviewer same as Fleet submitter",
        mutate: (p) => {
          p.adminRole = { ...adminRole, principalId: fleetRole.actorId };
        },
        expected: /r14-admin:session-realm-or-distinct-actor-invalid/,
      },
      {
        label: "driver still offline after setup",
        mutate: (p) => {
          p.restoreDriverAvailable = async () => {};
        },
        expected: /r14-stage-b:driver-pre-renewal-registry-state-invalid/,
      },
      {
        label: "unrelated manual suspension hold on vehicle",
        mutate: (p) => {
          p.readVehicleReadiness = async (id) => ({
            subjectType: "vehicle",
            subjectId: id,
            state: "suspended",
            reasonCodes: ["INSURANCE_EXPIRED", "MANUALLY_SUSPENDED"],
          });
        },
        expected: /r14-stage-b:vehicle-pre-renewal-readiness-reasons-invalid/,
      },
      {
        label: "expired pair unexpectedly present in pre-renewal candidates",
        mutate: (p) => {
          p.readPreRenewalCandidates = async () => [{ driverId, vehicleId }];
        },
        expected: /r14-stage-b:expired-pair-present-in-pre-renewal-candidates/,
      },
      {
        label: "foreign target returned on renewal draft creation",
        mutate: (p) => {
          const orig = p.createFleetRenewalDraft;
          p.createFleetRenewalDraft = async (type, subjectId) => {
            const res = await orig(type, subjectId);
            if (type === "insurance_update") {
              (
                res.data.submission as Record<string, unknown>
              ).canonicalVehicleId = "veh_foreign_999";
            }
            return res;
          };
        },
        expected: /r14-stage-b:insurance_update:target-vehicle-mismatch/,
      },
      {
        label: "stale revision on submit",
        mutate: (p) => {
          const orig = p.submitFleetRenewal;
          p.submitFleetRenewal = async (submissionId, expectedRevisionNo) => {
            const res = await orig(submissionId, expectedRevisionNo);
            return { ...res, body: { expectedRevisionNo: 999 } };
          };
        },
        expected: /submit-expected-revision-mismatch/,
      },
      {
        label: "unknown ACK on UI POST",
        mutate: (p) => {
          p.startAdminSupplyReview = async () => {
            throw new JourneyFailure("r14-ui-post:ack-unknown");
          };
        },
        expected: /r14-ui-post:ack-unknown/,
      },
      {
        label: "approval absent on canonical readback",
        mutate: (p) => {
          const orig = p.approveAdminSupplyReview;
          p.approveAdminSupplyReview = async (id, rev) => {
            const res = await orig(id, rev);
            p.state.submissions.get(id)!.submission.status = "in_review";
            return res;
          };
        },
        expected: /canonical-approval-readback-invalid/,
      },
      {
        label: "remaining readiness hold after all three approvals",
        mutate: (p) => {
          const orig = p.readVehicleReadiness;
          p.readVehicleReadiness = async (id) =>
            p.state.insuranceRenewed
              ? {
                  subjectType: "vehicle",
                  subjectId: id,
                  state: "not_ready",
                  reasonCodes: ["INSURANCE_EXPIRED"],
                }
              : orig(id);
        },
        expected: /r14-stage-b:post-renewal-readiness-holds-remained/,
      },
      {
        label: "terminal dispatch job before post-renewal assignment",
        mutate: (p) => {
          p.state.jobStatus = "failed";
        },
        expected: /r14-stage-b:dispatch-job-or-order-terminal-before-assign/,
      },
    ];

    for (const { label, mutate, expected } of negativeCases) {
      const ports = createStageBPorts();
      mutate(ports);
      await expect(runR14StageBRenewalLifecycle(ports), label).rejects.toThrow(
        expected,
      );
      expect(ports.state.driverBound).toBe(false);
      expect(ports.state.heartbeatSent).toBe(false);
    }
  });
});

describe("R14 Playwright-shaped UI POST capture", () => {
  it("captures single Fleet or Admin same-origin POST with durable before-forward custody and rejects duplicate/wrong-runtime", async () => {
    for (const [count, responseSha, includeRequestHeaderId, shouldPass] of [
      [1, runtimeSha, false, true],
      [1, runtimeSha, true, true],
      [2, runtimeSha, true, false],
      [1, "wrong-runtime", true, false],
    ] as const) {
      const listeners: Array<
        (request: { url(): string; method(): string }) => void
      > = [];
      let deliver!: (response: unknown) => void;
      let predicate!: (response: never) => boolean;
      let routeHandler!: (route: never) => Promise<void>;
      const sequence: string[] = [];
      const page = {
        on: (
          _event: string,
          listener: (request: { url(): string; method(): string }) => void,
        ) => {
          listeners.push(listener);
        },
        off: (
          _event: string,
          listener: (request: { url(): string; method(): string }) => void,
        ) => {
          listeners.splice(listeners.indexOf(listener), 1);
        },
        waitForResponse: (matches: (response: never) => boolean) => {
          predicate = matches;
          return new Promise((resolve) => {
            deliver = resolve;
          });
        },
        route: async (_matcher: unknown, handler: typeof routeHandler) => {
          routeHandler = handler;
        },
        unroute: async () => {},
      } as unknown as Page;

      const request = {
        url: () =>
          "https://fleet.example/control-plane-proxy/fleet-partner/supply-submissions/renewals",
        method: () => "POST",
        headers: () => ({
          ...(includeRequestHeaderId ? { "x-request-id": "req-r14-001" } : {}),
          "idempotency-key": "idem-r14-001",
        }),
        postData: () =>
          JSON.stringify({
            submissionType: "insurance_update",
            subjectVehicleId: vehicleId,
          }),
        postDataJSON: () => ({
          submissionType: "insurance_update",
          subjectVehicleId: vehicleId,
        }),
      };
      const response = {
        url: request.url,
        request: () => request,
        status: () => 201,
        headers: () => ({ "x-drts-candidate-sha": responseSha }),
        json: async () => ({
          data: {
            submission: {
              submissionId: "sub_renewal_001",
              status: "draft",
            },
          },
          meta: { request_id: "req-r14-001" },
        }),
      };

      const run = captureR14UiPost(
        page,
        "https://fleet.example",
        "/fleet-partner/supply-submissions/renewals",
        runtimeSha,
        async () => {
          for (let n = 0; n < count; n++) {
            listeners.forEach((listener) => listener(request));
            await routeHandler({
              request: () => request,
              fallback: async () => {
                sequence.push("forward");
                if (predicate(response as never)) deliver(response);
              },
              abort: async () => {},
            } as never);
          }
        },
        async (_intent, forward) => {
          sequence.push("durable-intent");
          await forward();
        },
      );

      if (shouldPass) {
        await expect(run).resolves.toMatchObject({
          requestId: "req-r14-001",
          idempotencyKey: "idem-r14-001",
          status: 201,
        });
      } else {
        await expect(run).rejects.toThrow();
      }
      expect(listeners).toHaveLength(0);
      expect(sequence.slice(0, 2)).toEqual(["durable-intent", "forward"]);
    }
  });
});

function extractActualR14Caller(sourceText: string) {
  const source = ts.createSourceFile(
    "owned-business.spec.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let closure: ts.ArrowFunction | undefined;
  let insideRecoveryElse = false;
  let normalCalls = 0;
  let recoveryCalls = 0;
  let secondSupplyCalls = 0;

  function visit(node: ts.Node, normal = false) {
    if (
      ts.isIfStatement(node) &&
      node.expression.getText(source) === "RECOVERY_ONLY"
    ) {
      ts.forEachChild(node.thenStatement, (child) => visit(child, false));
      if (node.elseStatement) visit(node.elseStatement, true);
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "runExistingR14"
    ) {
      closure = node.initializer as ts.ArrowFunction;
      insideRecoveryElse = normal;
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "runExistingR14"
    ) {
      if (normal) normalCalls++;
      else recoveryCalls++;
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "provisionSupply" &&
      node.arguments[0]?.getText(source) === "extraSupply"
    ) {
      if (normal) secondSupplyCalls++;
    }
    ts.forEachChild(node, (child) => visit(child, normal));
  }
  visit(source);

  expect(closure, "actual R14 normal caller node missing").toBeDefined();
  expect(
    insideRecoveryElse,
    "R14 caller must run only in original FULL branch",
  ).toBe(true);
  expect(normalCalls).toBe(2);
  expect(recoveryCalls).toBe(0);
  expect(secondSupplyCalls).toBe(1);

  const printed = ts.transpileModule(
    `const runExistingR14 = ${closure!.getText(source)};`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    },
  ).outputText;
  return new Function(
    "bindings",
    `with (bindings) { ${printed} return runExistingR14; }`,
  ) as (bindings: Record<string, unknown>) => (
    phase: "provision" | "dispatch",
    dispatchContext?: {
      orderId: string;
      dispatchJobId: string;
      initialJobStatus: string;
      preCandidates: Array<Record<string, unknown>>;
    },
  ) => Promise<Array<Record<string, unknown>>>;
}

// Execute the shipped binding, first-heartbeat gate, dispatch continuation and
// cleanup with the caller. Only browser/network I/O is supplied by the fixture.
function extractActualDriverFlow(sourceText: string) {
  const source = ts.createSourceFile(
    "owned-business.spec.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const arrows = new Map<string, string>();
  let initialHeartbeat: ts.Statement | undefined;
  let cleanup: ts.IfStatement | undefined;
  let dispatchStatements: ts.Statement[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ["bindDriverDeviceSession", "heartbeat"].includes(
        node.name.getText(source),
      )
    ) {
      arrows.set(node.name.getText(source), node.initializer!.getText(source));
    }
    if (
      ts.isCallExpression(node) &&
      node.getText(source) === 'heartbeat(null, "available", 1)' &&
      ts.isAwaitExpression(node.parent) &&
      ts.isExpressionStatement(node.parent.parent)
    ) {
      const statement = node.parent.parent;
      initialHeartbeat = ts.isIfStatement(statement.parent)
        ? statement.parent
        : statement;
    }
    if (
      ts.isIfStatement(node) &&
      node.expression.getText(source) === "bindingId && deviceId"
    )
      cleanup = node;
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "effectiveCandidates"
    ) {
      const statement = node.parent.parent as ts.VariableStatement;
      const block = statement.parent as ts.Block;
      const start = block.statements.indexOf(statement);
      const end = block.statements.findIndex(
        (s, index) =>
          index > start && s.getText(source).startsWith("const taskList ="),
      );
      dispatchStatements = [...block.statements.slice(start, end)];
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(arrows.size).toBe(2);
  expect(initialHeartbeat).toBeDefined();
  expect(cleanup).toBeDefined();
  expect(dispatchStatements.length).toBeGreaterThan(0);
  const compiled = ts.transpileModule(
    `
    const bindDriverDeviceSession = ${arrows.get("bindDriverDeviceSession")};
    const heartbeat = ${arrows.get("heartbeat")};
    return {
      bindDriverDeviceSession, heartbeat,
      initialHeartbeat: async () => { ${initialHeartbeat!.getText(source)} },
      dispatchAndAssign: async () => { ${dispatchStatements.map((s) => s.getText(source)).join("\n")} },
      cleanup: async () => { ${cleanup!.getText(source)} },
    };`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    },
  ).outputText;
  return new Function("bindings", `with (bindings) { ${compiled} }`) as (
    bindings: Record<string, unknown>,
  ) => {
    bindDriverDeviceSession: (...args: unknown[]) => Promise<void>;
    heartbeat: (...args: unknown[]) => Promise<void>;
    initialHeartbeat: () => Promise<void>;
    dispatchAndAssign: () => Promise<void>;
    cleanup: () => Promise<void>;
  };
}

describe("actual normal caller AST wiring (old RED -> new GREEN)", () => {
  const specPath = resolve(
    "tests/e2e/owned-referral-business-journey/owned-business.spec.ts",
  );
  const currentSource = process.env.R14_TEST_CALLER_GIT_REF
    ? execFileSync(
        "git",
        [
          "show",
          `${process.env.R14_TEST_CALLER_GIT_REF}:tests/e2e/owned-referral-business-journey/owned-business.spec.ts`,
        ],
        { encoding: "utf8" },
      )
    : readFileSync(specPath, "utf8");

  it("defers the Stage B first heartbeat until the renewal helper restores Driver authority", async () => {
    const flow = extractActualDriverFlow(currentSource)({
      r14Manifest: { decision: "stageB" },
      call: async () => {
        throw new JourneyFailure("driver:request", 403, "DRIVER_CERT_INVALID");
      },
    });
    await expect(flow.initialHeartbeat()).resolves.toBeUndefined();
  });

  it("fails RED on old source without runExistingR14 and passes GREEN on new source for both Stage A and Stage B", async () => {
    const oldSourceSimulated = currentSource.replace(
      /const runExistingR14\b/g,
      "const legacyRemovedR14",
    );
    expect(() => extractActualR14Caller(oldSourceSimulated)).toThrow(
      /actual R14 normal caller node missing/,
    );

    const compileCaller = extractActualR14Caller(currentSource);

    // 1. Stage A zero-target execution: provisions fresh firstSupply with todayUtc() and keeps preCandidates.
    const stageATrace: string[] = [];
    const stageAEvidence = new Evidence();
    const firstSupplyStageA: Record<string, unknown> = {};
    const stageABindings: Record<string, unknown> = {
      todayUtc: () => stageADate,
      start: () => "2026-11-21",
      future: () => renewedUntil,
      definition: definitionSha,
      runtime: runtimeSha,
      ENTRY: entrySlug,
      SUBJECT: subject,
      FLEET: fleetPartnerId,
      TENANT: tenantId,
      nonce,
      phone: "0900000101",
      process: { env: {} },
      R14_PRIOR_TARGET_MANIFEST_PATH: "manifest.json",
      r14ExpectedContext: undefined,
      r14Manifest: undefined,
      r14StageADraft: null,
      r14StageB: undefined,
      firstSupply: firstSupplyStageA,
      parseR14PriorTargetManifest,
      buildR14StageAProjection,
      readFile: async () =>
        JSON.stringify({
          schema: R14_PRIOR_TARGET_MANIFEST_SCHEMA,
          decision: "stageA",
          repository: R14_REPOSITORY,
          definitionSha,
          runtimeSha,
          evaluatedUtcDate: stageADate,
          candidateCount: 0,
          officialArtifact: null,
          target: null,
        }),
      provisionSupply: async (
        supply: Record<string, unknown>,
        _nonce: string,
        _phone: string,
        effectiveUntilDate: string,
      ) => {
        stageATrace.push(`provision:${effectiveUntilDate}`);
        const target = makeStageATarget(effectiveUntilDate);
        Object.assign(supply, {
          driverId: target.driverId,
          vehicleId: target.vehicleId,
          plateNo: target.plateNo,
          driverSubmissionId: target.driverSubmissionId,
          vehicleSubmissionId: target.vehicleSubmissionId,
          canonicalContractId: target.canonicalContractId,
          canonicalPolicyId: target.canonicalPolicyId,
          exclusivityEffectiveEnd: target.exclusivityEffectiveEnd,
          documents: target.documents,
          driverApproval: target.approvals.driver,
          vehicleApproval: target.approvals.vehicle,
        });
      },
      adminControl: async (path: string) => {
        if (path === "/regulatory-registry/contracts") {
          return {
            items: [
              {
                contractId: priorContractId,
                vehicleId,
                sourceSubmissionId: vehicleSubmissionId,
                endAt: `${stageADate}T23:59:59.000Z`,
              },
            ],
          };
        }
        return {
          items: [
            {
              policyId: priorPolicyId,
              vehicleId,
              sourceSubmissionId: vehicleSubmissionId,
              endAt: `${stageADate}T23:59:59.000Z`,
            },
          ],
        };
      },
      requireFact: (cond: unknown, msg: string) => {
        if (!cond) throw new Error(msg);
      },
      text: (v: unknown) => {
        if (typeof v !== "string" || !v) throw new Error("missing text");
        return v;
      },
      records: (v: unknown) => (Array.isArray(v) ? v : []),
      evidence: stageAEvidence,
    };

    const stageACaller = compileCaller(stageABindings);
    await stageACaller("provision");
    const stageACandidates = await stageACaller("dispatch", {
      orderId: "order_stage_a_001",
      dispatchJobId: "job_stage_a_001",
      initialJobStatus: "reserved",
      preCandidates: [{ driverId, vehicleId }],
    });
    expect(stageATrace).toEqual([`provision:${stageADate}`]);
    expect(stageACandidates).toEqual([{ driverId, vehicleId }]);
    expect(stageAEvidence.events.map((e) => e.stage)).toContain(
      "r14-stage-a-today-expiry-supply-approved",
    );
    stageABindings.driverId = driverId;
    stageABindings.vehicleId = vehicleId;
    stageABindings.deviceId = "stage-a-device";
    stageABindings.randomUUID = () => "event_stage_a";
    stageABindings.now = () => `${stageADate}T12:00:00.000Z`;
    stageABindings.pickup = { lat: 25, lng: 121 };
    stageABindings.object = object;
    stageABindings.call = async (
      role: Role,
      path: string,
      options: CallOptions,
    ) => {
      expect(role).toBe("driver");
      expect(path).toBe("/api/driver/location-heartbeats/batch");
      expect(records(object(options.body).items)[0]).toMatchObject({
        deviceId: "stage-a-device",
        driverId,
        vehicleId,
        sequenceNo: 1,
      });
      stageATrace.push("initial-heartbeat");
      return { items: [{ accepted: true, currentLocationUpdated: true }] };
    };
    await extractActualDriverFlow(currentSource)(
      stageABindings,
    ).initialHeartbeat();
    expect(stageATrace).toEqual([
      `provision:${stageADate}`,
      "initial-heartbeat",
    ]);

    // 2. Stage B exercises the actual caller, binding, heartbeat, assignment and
    // cleanup. External auth refuses the exact expired subject until approval.
    for (const failure of [
      "none",
      "wrong-code",
      "wrong-subject",
      "wrong-runtime",
      "transport",
      "probe-revoke",
      "readiness",
      "binding",
      "heartbeat",
    ] as const) {
      const stageBTrace: string[] = [];
      const simulated = createStageBPorts();
      const readSimulatedCandidates = simulated.readPostRenewalCandidates;
      const stageBEvidence = new Evidence();
      const firstSupplyStageB: Record<string, unknown> = {};
      const fakePage = {
        url: () => "https://fleet.example/supply/submissions/sub_renewal_001",
        goto: async () => ({
          status: () => 200,
          headers: () => ({ "x-drts-candidate-sha": runtimeSha }),
        }),
        close: async () => {
          stageBTrace.push("page-close");
        },
        getByText: () => ({ count: async () => 0 }),
        getByRole: () => ({
          click: async () => {
            stageBTrace.push("button-click");
          },
        }),
        locator: () => ({
          selectOption: async (val: string) => {
            stageBTrace.push(`select:${val}`);
          },
          fill: async (val: string) => {
            stageBTrace.push(`fill:${val}`);
          },
          setInputFiles: async () => {
            stageBTrace.push("set-files");
          },
          click: async () => {
            stageBTrace.push("locator-click");
          },
          value: plateNo,
          visible: true,
        }),
      };

      const stageBBindings: Record<string, unknown> = {
        ...stageABindings,
        todayUtc: () => stageBDate,
        r14ExpectedContext: undefined,
        r14Manifest: undefined,
        r14StageADraft: null,
        r14StageB: undefined,
        firstSupply: firstSupplyStageB,
        deviceId: undefined,
        bindingId: undefined,
        invitation: undefined,
        driverId,
        vehicleId,
        orderId: "order_stage_b_001",
        dispatchJobId: "job_stage_b_001",
        dispatched: { status: "reserved" },
        candidates: { items: [] },
        object,
        records,
        text,
        requireFact,
        assertOwnPair,
        mask: () => {},
        randomUUID: () => "event_001",
        now: () => `${stageBDate}T02:15:00.000Z`,
        pickup: { lat: 25, lng: 121 },
        evidence: stageBEvidence,
        fleet: { metadata: { actorId: fleetRole.actorId } },
        identity: {
          membershipId: adminRole.membershipId,
          scopes: adminRole.scopes,
        },
        principalId: adminRole.principalId,
        adminSessionId: adminRole.sessionId,
        uiMutationAttempts: [],
        origins: {
          fleet: "https://fleet.example",
          admin: "https://admin.example",
        },
        context: { newPage: async () => fakePage },
        installR14FleetPageRoute: async () => {
          stageBTrace.push("install-fleet-route");
        },
        installVerifiedRoleRoute: async () => {
          stageBTrace.push("install-admin-route");
        },
        captureR14UiPost,
        readFile: async () =>
          JSON.stringify({
            schema: R14_PRIOR_TARGET_MANIFEST_SCHEMA,
            decision: "stageB",
            repository: R14_REPOSITORY,
            definitionSha,
            runtimeSha,
            evaluatedUtcDate: stageBDate,
            candidateCount: 1,
            officialArtifact,
            target: makeStageATarget(stageADate),
          }),
        provisionSupply: async () => {
          throw new Error("Stage B must not provision fresh firstSupply");
        },
        adminControl: async (path: string) => {
          stageBTrace.push(`adminControl:${path}`);
          return {};
        },
        finalizer: {
          checkpoint: async (phaseName: string) => {
            stageBTrace.push(`checkpoint:${phaseName}`);
          },
          guardOperation: async <T>(
            fn: (assertOpen: () => void) => Promise<T>,
          ) => fn(() => {}),
          checkpointOwned: async () => {},
        },
        runR14StageBRenewalLifecycle: async (ports: R14StageBPorts) => {
          expect(ports.target.driverId).toBe(driverId);
          expect(ports.target.vehicleId).toBe(vehicleId);
          expect(ports.orderId).toBe("order_stage_b_001");
          expect(ports.dispatchJobId).toBe("job_stage_b_001");
          stageBTrace.push("runR14StageBRenewalLifecycle");
          // UI submission/review and Registry are simulated externally. Keep
          // production lifecycle decisions and actual caller's auth/heartbeat.
          simulated.probeExpiredDriverAuth = ports.probeExpiredDriverAuth;
          simulated.rebindDriverSession = ports.rebindDriverSession;
          simulated.sendInitialDriverHeartbeat =
            ports.sendInitialDriverHeartbeat;
          simulated.readPostRenewalCandidates = ports.readPostRenewalCandidates;
          if (failure === "readiness") {
            const readReadiness = simulated.readVehicleReadiness;
            simulated.readVehicleReadiness = async (id) =>
              simulated.state.insuranceRenewed
                ? {
                    subjectId: id,
                    state: "not_ready",
                    reasonCodes: ["INSURANCE_EXPIRED"],
                  }
                : readReadiness(id);
          }
          return runR14StageBRenewalLifecycle(simulated);
        },
      };

      const fetcher: typeof fetch = async (input, init) => {
        const path = new URL(String(input)).pathname;
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        let status = 200;
        let payload: Record<string, unknown> = {};
        let responseRuntime = runtimeSha;
        if (path === "/api/auth/driver/device/invite") {
          expect(body.driverId).toBe(driverId);
          stageBTrace.push("invite");
          payload = { registrationCode: "synthetic-invitation" };
        } else if (path === "/api/auth/driver/device/invite/revoke") {
          expect(body.registrationCode).toBe("synthetic-invitation");
          stageBTrace.push("probe-invitation-revoked");
          if (failure === "probe-revoke")
            throw new Error("probe revoke transport failed");
        } else if (path === "/api/auth/driver/device/register") {
          if (!simulated.state.driverRenewed) {
            stageBTrace.push("register-expired:403");
            if (failure === "transport")
              throw new Error("registration transport failed");
            const refusal = expiredAuthRefusal();
            if (failure === "wrong-code") refusal.data.error.code = "FORBIDDEN";
            if (failure === "wrong-subject")
              refusal.data.error.details.driverId = "drv_foreign";
            if (failure === "wrong-runtime") responseRuntime = "c".repeat(40);
            return new Response(JSON.stringify(refusal.data), {
              status: 403,
              headers: { "x-drts-candidate-sha": responseRuntime },
            });
          }
          expect(simulated.state.contractRenewed).toBe(true);
          expect(simulated.state.insuranceRenewed).toBe(true);
          stageBTrace.push("register-renewed:200");
          if (failure === "binding") status = 503;
          else {
            simulated.state.driverBound = true;
            payload = {
              driverId,
              deviceId: body.deviceId,
              bindingId: "rebound-binding",
              accessToken: "synthetic-access",
              refreshToken: "synthetic-refresh",
            };
          }
        } else if (path === "/api/auth/session") {
          expect(simulated.state.driverBound).toBe(true);
          payload = {
            active: true,
            identity: { realm: "driver", actorId: driverId },
          };
          stageBTrace.push("fresh-driver-session");
        } else if (path === "/api/driver/location-heartbeats/batch") {
          expect(simulated.state.driverBound).toBe(true);
          const event = body.items[0];
          expect(event).toMatchObject({
            deviceId: `${nonce}-r14-stage-b-device`,
            driverId,
            vehicleId,
            sequenceNo: 1,
            taskId: null,
          });
          stageBTrace.push("initial-heartbeat");
          if (failure === "heartbeat") status = 503;
          else simulated.state.heartbeatSent = true;
          payload = {
            items: [{ accepted: true, currentLocationUpdated: true }],
          };
        } else if (path === "/api/auth/driver/device/revoke") {
          expect(body).toEqual({
            bindingId: "rebound-binding",
            deviceId: `${nonce}-r14-stage-b-device`,
          });
          stageBTrace.push("driver-binding-revoked");
        } else throw new Error(`unexpected actual Driver I/O: ${path}`);
        return new Response(JSON.stringify({ data: payload }), {
          status,
          headers: { "x-drts-candidate-sha": responseRuntime },
        });
      };
      const origins = {
        api: "https://api.example",
        fleet: "https://fleet.example",
        admin: "https://admin.example",
        ops: "https://ops.example",
        referral: "https://referral.example",
      };
      const tx = new NativeTransport(origins, runtimeSha, {}, fetcher);
      stageBBindings.tx = tx;
      firstSupplyStageB.transport = tx;
      stageBBindings.call = async (
        role: Role,
        path: string,
        options?: CallOptions,
      ) => object((await tx.call(role, path, options)).data);
      stageBBindings.opsControl = async (path: string) => {
        if (path.endsWith("/candidates?includeIneligible=true")) {
          stageBTrace.push("post-renewal-candidates");
          return { items: await readSimulatedCandidates() };
        }
        expect(path).toBe("/dispatch/assign");
        expect(simulated.state.heartbeatSent).toBe(true);
        stageBTrace.push("dispatch-assign");
      };
      stageBBindings.cleanup = async (
        _label: string,
        action: () => Promise<void>,
      ) => {
        try {
          await action();
        } catch {
          stageBTrace.push("cleanup-failure-retained");
        }
      };
      const flow = extractActualDriverFlow(currentSource)(stageBBindings);
      stageBBindings.bindDriverDeviceSession = flow.bindDriverDeviceSession;
      stageBBindings.heartbeat = flow.heartbeat;

      const stageBCaller = compileCaller(stageBBindings);
      stageBBindings.runExistingR14 = stageBCaller;
      await stageBCaller("provision");
      expect(firstSupplyStageB.driverId).toBe(driverId);
      expect(firstSupplyStageB.vehicleId).toBe(vehicleId);
      expect(firstSupplyStageB.plateNo).toBe(plateNo);

      expect(stageBTrace).not.toContain("invite");
      await flow.initialHeartbeat();
      expect(stageBTrace).not.toContain("initial-heartbeat");
      stageBTrace.push("main-booking");
      if (failure === "none") {
        await flow.dispatchAndAssign();
        expect(stageBBindings.deviceId).toBe(`${nonce}-r14-stage-b-device`);
        expect(stageBBindings.bindingId).toBe("rebound-binding");
        expect(stageBBindings.invitation).toBe("synthetic-invitation");
        expect(
          stageBTrace.filter(
            (s) =>
              !s.startsWith("adminControl:") &&
              !s.startsWith("checkpoint:") &&
              !s.startsWith("install-") &&
              s !== "page-close",
          ),
        ).toEqual([
          "main-booking",
          "runR14StageBRenewalLifecycle",
          "invite",
          "register-expired:403",
          "probe-invitation-revoked",
          "invite",
          "register-renewed:200",
          "fresh-driver-session",
          "initial-heartbeat",
          "post-renewal-candidates",
          "dispatch-assign",
        ]);
        expect(stageBEvidence.events.map((e) => e.stage)).toEqual([
          "r14-stage-b-retained-target-available-setup",
          "r14-stage-b-expiry-denial-and-renewal-dispatch-restored",
        ]);
      } else {
        await expect(flow.dispatchAndAssign(), failure).rejects.toThrow();
        expect(stageBTrace).not.toContain("dispatch-assign");
        expect(stageBTrace).not.toContain("post-renewal-candidates");
        if (!["binding", "heartbeat"].includes(failure))
          expect(simulated.state.driverBound).toBe(false);
      }
      expect(stageBTrace.filter((s) => s === "page-close")).toHaveLength(2);
      await flow.cleanup();
      if (failure === "none" || failure === "heartbeat")
        expect(stageBTrace).toContain("driver-binding-revoked");
      if (failure === "binding")
        expect(
          stageBTrace.filter((s) => s === "probe-invitation-revoked"),
        ).toHaveLength(2);
      if (failure === "probe-revoke")
        expect(stageBBindings.invitation).toBe("synthetic-invitation");
    }
  });
});
