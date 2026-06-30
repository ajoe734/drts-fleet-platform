import { describe, expect, it } from "vitest";

import { SandboxGovernanceController } from "../../src/modules/sandbox-governance/sandbox-governance.controller";
import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";

const PROGRAM_ID = "phase2-tesla-fsd-sandbox-202606";
const BASE_TIMESTAMP = "2026-06-26T00:00:00.000Z";

function createController() {
  return new SandboxGovernanceController(new SandboxGovernanceService());
}

describe("sandbox-governance controller routes", () => {
  it("serves CRUD, publish, suspend/resume, rollback, and snapshot flows", () => {
    const controller = createController();

    const jurisdiction = controller.createJurisdiction(
      {
        jurisdictionCode: "us-az-dot",
        name: "Arizona DOT Sandbox",
        regulatorName: "Arizona Department of Transportation",
        actorId: "reg-user-1",
      },
      "req-jur-create",
    ).data;

    controller.publishJurisdictionVersion(
      jurisdiction.jurisdictionId,
      jurisdiction.currentVersionId as string,
      { actorId: "reg-user-1" },
      "req-jur-publish",
    );

    const experiment = controller.createExperiment(
      {
        programCode: "phoenix-fsd",
        name: "Phoenix FSD Pilot",
        jurisdictionIds: [jurisdiction.jurisdictionId],
        notificationMatrix: [
          {
            trigger: "experiment_published",
            recipients: [
              {
                recipientId: "roc-oncall",
                kind: "distribution_list",
                target: "roc-oncall@example.com",
                channels: ["email", "slack"],
              },
            ],
            escalationWithinMinutes: 15,
            retentionDays: 365,
          },
        ],
        policyVersions: {
          routePolicyVersion: "route-2026-06",
        },
        actorId: "reg-user-1",
      },
      "req-exp-create",
    ).data;

    const publishedExperiment = controller.publishExperimentVersion(
      experiment.experimentId,
      experiment.currentVersionId as string,
      { actorId: "reg-user-1" },
      "req-exp-publish",
    ).data;
    expect(publishedExperiment.effectiveVersion?.authorizationStatus).toBe(
      "active",
    );

    const document = controller.createApprovalDocument(
      {
        experimentId: experiment.experimentId,
        jurisdictionId: jurisdiction.jurisdictionId,
        documentType: "safety_case",
        title: "Safety Case",
        artifactFileName: "safety-case-v1.pdf",
        artifactContentType: "application/pdf",
        artifactContentBase64: Buffer.from("safety-case-v1").toString("base64"),
        actorId: "reg-user-1",
      },
      "req-doc-create",
    ).data;

    const publishedDocument = controller.publishApprovalDocumentVersion(
      document.documentId,
      document.currentVersionId as string,
      { actorId: "reg-user-1" },
      "req-doc-publish",
    ).data;

    const superseded = controller.uploadApprovalDocumentVersion(
      document.documentId,
      {
        artifactFileName: "safety-case-v2.pdf",
        artifactContentType: "application/pdf",
        artifactContentBase64: Buffer.from("safety-case-v2").toString("base64"),
        summary: "Added remote-ops appendix",
        actorId: "reg-user-2",
      },
      "req-doc-v2",
    ).data;
    expect(superseded.versions.at(-1)?.supersedesVersionId).toBe(
      document.currentVersionId,
    );

    const suspended = controller.suspendExperimentAuthorizations(
      experiment.experimentId,
      { actorId: "ops-user-2" },
      "req-exp-suspend",
    ).data;
    expect(suspended.effectiveVersion?.authorizationStatus).toBe("suspended");

    const resumed = controller.resumeExperimentAuthorizations(
      experiment.experimentId,
      { actorId: "ops-user-3" },
      "req-exp-resume",
    ).data;
    expect(resumed.effectiveVersion?.authorizationStatus).toBe("active");

    const rolledBack = controller.rollbackApprovalDocumentVersion(
      document.documentId,
      document.currentVersionId as string,
      { actorId: "auditor-1", publish: true },
      "req-doc-rollback",
    ).data;
    expect(rolledBack.effectiveVersion?.rollbackFromVersionId).toBe(
      document.currentVersionId,
    );

    const snapshot = controller.generateComplianceSnapshot(
      experiment.experimentId,
      publishedDocument.effectiveVersion?.effectiveFrom as string,
      "auditor-1",
      "req-snapshot",
    ).data;

    expect(snapshot.snapshotHashSha256).toHaveLength(64);
    expect(snapshot.approvalDocuments).toHaveLength(1);
    expect(snapshot.jurisdictions).toHaveLength(1);
    expect(
      controller.listExperiments("2026-06-26T01:00:00.000Z", "req-list").data
        .items,
    ).toHaveLength(1);
  });

  it("serves geometry draft lifecycle and GeoJSON exports for map clients", async () => {
    const controller = createController();
    const areaDraft = (
      await controller.createOperatingAreaDraft(
        {
          actorId: "map-editor",
          item: {
            areaId: "odd-riverside-draft",
            sandboxProgramId: PROGRAM_ID,
            name: "Riverside ODD",
            areaKind: "operating_area",
            version: 1,
            active: true,
            geometry: {
              type: "MultiPolygon",
              coordinates: [
                [
                  [
                    [121.6, 25.1],
                    [121.61, 25.1],
                    [121.61, 25.11],
                    [121.6, 25.11],
                    [121.6, 25.1],
                  ],
                ],
              ],
            },
            schedules: [],
            effectiveFrom: BASE_TIMESTAMP,
            effectiveUntil: "2026-07-10T00:00:00.000Z",
            createdAt: BASE_TIMESTAMP,
            updatedAt: BASE_TIMESTAMP,
          },
        },
        null,
        "req-area-draft",
      )
    ).data;

    expect(areaDraft).toMatchObject({
      areaId: "odd-riverside-draft",
      active: false,
      lifecycleStatus: "draft",
    });
    expect(
      (
        await controller.validatePoint(
          {
            sandboxProgramId: PROGRAM_ID,
            point: { lat: 25.105, lng: 121.605 },
            asOf: "2026-07-02T00:00:00.000Z",
          },
          "req-validate-before-publish",
        )
      ).data.inApprovedArea,
    ).toBe(false);

    await controller.submitOperatingAreaForReview(
      areaDraft.areaId,
      String(areaDraft.version),
      { actorId: "reviewer" },
      null,
      "req-area-review",
    );
    const publishedArea = (
      await controller.publishOperatingArea(
        areaDraft.areaId,
        String(areaDraft.version),
        { actorId: "approver" },
        null,
        "req-area-publish",
      )
    ).data;

    expect(publishedArea.lifecycleStatus).toBe("active");
    expect(
      (
        await controller.validatePoint(
          {
            sandboxProgramId: PROGRAM_ID,
            point: { lat: 25.105, lng: 121.605 },
            asOf: "2026-07-02T00:00:00.000Z",
          },
          "req-validate-after-publish",
        )
      ).data.matches,
    ).toEqual([
      {
        areaId: "odd-riverside-draft",
        areaKind: "operating_area",
        name: "Riverside ODD",
      },
    ]);

    const routeDraft = (
      await controller.createRouteDraft(
        {
          actorId: "map-editor",
          item: {
            routeId: "route-riverside-draft",
            sandboxProgramId: PROGRAM_ID,
            name: "Riverside ODD route",
            areaId: null,
            version: 1,
            active: true,
            geometry: {
              type: "MultiLineString",
              coordinates: [
                [
                  [121.6, 25.1],
                  [121.605, 25.105],
                  [121.61, 25.11],
                ],
              ],
            },
            schedules: [],
            effectiveFrom: BASE_TIMESTAMP,
            effectiveUntil: "2026-07-10T00:00:00.000Z",
            createdAt: BASE_TIMESTAMP,
            updatedAt: BASE_TIMESTAMP,
          },
        },
        null,
        "req-route-draft",
      )
    ).data;
    await controller.submitRouteForReview(
      routeDraft.routeId,
      String(routeDraft.version),
      { actorId: "reviewer" },
      null,
      "req-route-review",
    );
    await controller.publishRoute(
      routeDraft.routeId,
      String(routeDraft.version),
      { actorId: "approver" },
      null,
      "req-route-publish",
    );

    expect(
      controller.exportOperatingAreasGeoJson("req-area-geojson").data,
    ).toEqual(
      expect.objectContaining({
        type: "FeatureCollection",
        features: expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({
              areaId: "odd-riverside-draft",
              lifecycleStatus: "active",
            }),
          }),
        ]),
      }),
    );
    expect(controller.exportRoutesGeoJson("req-route-geojson").data).toEqual(
      expect.objectContaining({
        type: "FeatureCollection",
        features: expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({
              routeId: "route-riverside-draft",
              lifecycleStatus: "active",
            }),
          }),
        ]),
      }),
    );

    const zoneDraft = (
      await controller.createPickupDropoffZoneDraft(
        {
          actorId: "map-editor",
          item: {
            areaId: "pickup-riverside-curb",
            sandboxProgramId: PROGRAM_ID,
            name: "Riverside curb pickup",
            areaKind: "operating_area",
            version: 1,
            active: true,
            geometry: {
              type: "MultiPolygon",
              coordinates: [
                [
                  [
                    [121.602, 25.102],
                    [121.604, 25.102],
                    [121.604, 25.104],
                    [121.602, 25.104],
                    [121.602, 25.102],
                  ],
                ],
              ],
            },
            schedules: [],
            effectiveFrom: BASE_TIMESTAMP,
            effectiveUntil: "2026-07-10T00:00:00.000Z",
            createdAt: BASE_TIMESTAMP,
            updatedAt: BASE_TIMESTAMP,
          },
        },
        null,
        "req-zone-draft",
      )
    ).data;
    expect(zoneDraft).toMatchObject({
      areaId: "pickup-riverside-curb",
      areaKind: "pickup_dropoff_zone",
      lifecycleStatus: "draft",
    });
    await controller.submitPickupDropoffZoneForReview(
      zoneDraft.areaId,
      String(zoneDraft.version),
      { actorId: "reviewer" },
      null,
      "req-zone-review",
    );
    await controller.publishPickupDropoffZone(
      zoneDraft.areaId,
      String(zoneDraft.version),
      { actorId: "approver" },
      null,
      "req-zone-publish",
    );
    expect(
      controller.exportPickupDropoffZonesGeoJson("req-zone-geojson").data,
    ).toEqual(
      expect.objectContaining({
        type: "FeatureCollection",
        features: expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({
              areaId: "pickup-riverside-curb",
              areaKind: "pickup_dropoff_zone",
              lifecycleStatus: "active",
            }),
          }),
        ]),
      }),
    );
  });
});
