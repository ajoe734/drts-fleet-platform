import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import type {
  DispatchCandidate,
  DispatchJobRecord,
  OwnedOrderRecord,
  VehicleContractRecord,
} from "@drts/contracts";

import {
  getCandidateLocationState,
  isFreshLocation,
} from "../../../../apps/ops-console-web/app/dispatch/location-state";
import { buildOpsMapBoardModel } from "../../../../apps/ops-console-web/app/dispatch/ops-map-board";
import {
  buildLauncherButtonStyle,
  buildPortalRootStyle,
  resolveEffectivePointerEvents,
} from "../../../../apps/ops-console-web/components/ops-assistant/assistant-layout";
import { resolveGoogleMapBaseLayerStatus } from "../../../../apps/ops-console-web/components/google-map-base-layer";
import {
  buildPlatformAdminAuditRoute,
  resolvePlatformAdminHref,
} from "../../../../apps/ops-console-web/lib/ops-cross-app-links";
import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { ContractOperationalViewService } from "../../../../apps/api/src/modules/regulatory-registry/contract-operational-view.service";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

const MOCK_TILES_ROOT = resolve(
  __dirname,
  "../../../../apps/ops-console-web/public/mock-map-tiles",
);

function countSvgFiles(dir: string): number {
  let count = 0;
  if (!existsSync(dir)) return 0;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      count += countSvgFiles(fullPath);
    } else if (entry.name.endsWith(".svg")) {
      count++;
    }
  }
  return count;
}

function createContractViewTestHarness() {
  const auditService = new AuditNotificationService();
  const opsDispatchEvents = new OpsDispatchEventsService(
    new EventEmitter() as never,
  );
  const driverProfileService = new DriverProfileService(auditService);
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEvents,
    auditService,
    driverProfileService,
  );

  const reg = regulatoryRegistryService as unknown as {
    contracts: VehicleContractRecord[];
  };
  reg.contracts = [];

  const startAt = "2026-01-01T00:00:00.000Z";
  const endAt = "2026-12-31T23:59:59.000Z";

  // Contract 1: standard taxi with fleet partner
  reg.contracts.push({
    contractId: "contract-qa-std-001",
    vehicleId: "veh-qa-001",
    partnerId: "partner-fleet-001",
    partnerType: "fleet_partner",
    contractType: "service_fleet_contract",
    operatingAreaId: "taichung-port",
    serviceScope: "standard_taxi",
    startAt,
    endAt,
    status: "active",
    lifecycleStatus: "active",
    approvedBy: "admin",
    approvedAt: startAt,
    createdAt: startAt,
    updatedAt: startAt,
  });

  // Contract 2: individual owner (authMode not_applicable)
  reg.contracts.push({
    contractId: "contract-qa-ind-002",
    vehicleId: "veh-qa-002",
    partnerId: "partner-ind-002",
    partnerType: "individual_owner",
    contractType: "driver_affiliation_agreement",
    operatingAreaId: "taichung-port",
    serviceScope: "standard_taxi",
    startAt,
    endAt,
    status: "active",
    lifecycleStatus: "active",
    approvedBy: "admin",
    approvedAt: startAt,
    createdAt: startAt,
    updatedAt: startAt,
  });

  const operationalViewService = new ContractOperationalViewService(
    regulatoryRegistryService,
  );

  return {
    operationalViewService,
    regulatoryRegistryService,
  };
}

describe("SR-QA-DISPATCH-001: C040, C048 & C134 Ops Map, Shell & Contract Operational View Verification", () => {
  describe("C040: Ops Map Tile Verification & GPS Freshness", () => {
    it("verifies 1,212 mock SVG map tiles exist without 404 and default view tiles are valid SVGs", () => {
      expect(existsSync(MOCK_TILES_ROOT)).toBe(true);
      const totalSvgCount = countSvgFiles(MOCK_TILES_ROOT);
      expect(totalSvgCount).toBe(1212);

      // Verify default 9 view tiles exist and are valid SVG XML
      for (let x = 213; x <= 215; x++) {
        for (let y = 108; y <= 110; y++) {
          const tilePath = resolve(MOCK_TILES_ROOT, `8/${x}/${y}.svg`);
          expect(existsSync(tilePath), `Tile 8/${x}/${y}.svg must exist`).toBe(
            true,
          );
          const content = readFileSync(tilePath, "utf8");
          expect(content).toContain("<svg");
          expect(content).toContain("</svg>");
        }
      }
    });

    it("resolveGoogleMapBaseLayerStatus strictly enforces mock cannot be marked production ready", () => {
      // 1. Missing or unconfigured provider -> fallback, isProductionReady: false
      const nullRes = resolveGoogleMapBaseLayerStatus(null);
      expect(nullRes.status).toBe("fallback");
      expect(nullRes.provider).toBe("fallback");
      expect(nullRes.isProductionReady).toBe(false);
      expect(nullRes.requiresMockFallback).toBe(true);

      // 2. Unconfigured / mock fallback -> isProductionReady: false
      const mockRes = resolveGoogleMapBaseLayerStatus({
        provider: "fallback",
        enabled: false,
        browserKey: null,
        mapId: null,
        reasonCode: "mode_is_mock",
      });
      expect(mockRes.status).toBe("fallback");
      expect(mockRes.isProductionReady).toBe(false);

      // 3. Google provider missing browser key -> fallback, isProductionReady: false
      const missingKeyRes = resolveGoogleMapBaseLayerStatus({
        provider: "google",
        enabled: true,
        browserKey: "",
        mapId: null,
        reasonCode: "browser_key_missing",
      });
      expect(missingKeyRes.status).toBe("fallback");
      expect(missingKeyRes.isProductionReady).toBe(false);

      // 4. Valid external Google Maps configuration -> ready, isProductionReady: true
      const readyRes = resolveGoogleMapBaseLayerStatus({
        provider: "google",
        enabled: true,
        browserKey: "AIzaSyValidProductionApiKeyForLiveMaps",
        mapId: "map-demo-id",
        reasonCode: null,
      });
      expect(readyRes.status).toBe("ready");
      expect(readyRes.provider).toBe("google");
      expect(readyRes.isProductionReady).toBe(true);
      expect(readyRes.requiresMockFallback).toBe(false);
    });

    it("evaluates GPS freshness into fresh, stale, and missing, excluding missing candidates from dispatchable map points", () => {
      const now = Date.now();
      const freshTimestamp = new Date(now - 30 * 1000).toISOString(); // 30s ago
      const staleTimestamp = new Date(now - 15 * 60 * 1000).toISOString(); // 15m ago

      // Fresh vs Stale location check
      expect(isFreshLocation(freshTimestamp, now)).toBe(true);
      expect(isFreshLocation(staleTimestamp, now)).toBe(false);
      expect(isFreshLocation(null, now)).toBe(false);

      // Candidate state classification
      const freshCandidate: DispatchCandidate = {
        driverId: "drv-001",
        vehicleId: "veh-001",
        plateNo: "ABC-0001",
        driverName: "司機",
        etaMinutes: 5,
        currentLocation: {
          driverId: "drv-001",
          lat: 25.035,
          lng: 121.565,
          accuracyM: 5,
          recordedAt: freshTimestamp,
          updatedAt: freshTimestamp,
        },
      };
      expect(getCandidateLocationState(freshCandidate, now)).toBe("fresh");

      const staleCandidate: DispatchCandidate = {
        ...freshCandidate,
        driverId: "drv-002",
        currentLocation: {
          ...freshCandidate.currentLocation!,
          recordedAt: staleTimestamp,
          updatedAt: staleTimestamp,
        },
      };
      expect(getCandidateLocationState(staleCandidate, now)).toBe("stale");

      const missingCandidate: DispatchCandidate = {
        ...freshCandidate,
        driverId: "drv-003",
        currentLocation: null,
      };
      expect(getCandidateLocationState(missingCandidate, now)).toBe("missing");

      // Board model excludes missing candidate from map points
      const testOrder: Partial<OwnedOrderRecord> = {
        orderId: "ord-map-test-01",
        status: "ready_for_dispatch",
        pickup: { address: "台中市中二路", lat: 24.25, lng: 120.52 },
      };
      const testJob: Partial<DispatchJobRecord> = {
        dispatchJobId: "job-map-test-01",
        orderId: "ord-map-test-01",
        status: "matching",
      };

      const boardModel = buildOpsMapBoardModel({
        orders: [testOrder as OwnedOrderRecord],
        orderJobMap: { [testOrder.orderId!]: testJob as DispatchJobRecord },
        candidatesByJobId: {
          [testJob.dispatchJobId!]: [missingCandidate],
        },
      });

      const mappedCandidates = boardModel.points.filter(
        (p) => p.kind === "candidate",
      );
      expect(mappedCandidates.length).toBe(0);
      expect(boardModel.noLocationCandidateCount).toBe(1);
    });
  });

  describe("C048: Ops Shell Governance & Assistant Widget Layout", () => {
    it("resolvePlatformAdminHref formats cross-app URLs and preserves query parameters", () => {
      const defaultHref = resolvePlatformAdminHref("/audit");
      expect(defaultHref).toContain("/audit");

      const auditRoute = buildPlatformAdminAuditRoute({
        resourceType: "order",
        resourceId: "ord-12345",
      });
      const resolvedAuditLink = resolvePlatformAdminHref(auditRoute);
      expect(resolvedAuditLink).toContain("resourceType=order");
      expect(resolvedAuditLink).toContain("resourceId=ord-12345");

      // External absolute URL is preserved as-is
      expect(
        resolvePlatformAdminHref("https://admin.drts.example.com/audit"),
      ).toBe("https://admin.drts.example.com/audit");
    });

    it("assistant widget layout applies non-obstructive pointerEvents to portal and auto to launcher", () => {
      const portalStyle = buildPortalRootStyle();
      expect(portalStyle.pointerEvents).toBe("none");

      const launcherStyle = buildLauncherButtonStyle();
      expect(launcherStyle.pointerEvents).toBe("auto");

      // CSS inheritance: child with no pointerEvents in a none parent resolves to none
      const parentNone = {
        style: { pointerEvents: "none" },
        parentElement: null,
      };
      const childInherit = { style: {}, parentElement: parentNone };
      expect(resolveEffectivePointerEvents(childInherit)).toBe("none");

      // Child with explicit pointerEvents: auto resolves to auto
      const childExplicitAuto = {
        style: { pointerEvents: "auto" },
        parentElement: parentNone,
      };
      expect(resolveEffectivePointerEvents(childExplicitAuto)).toBe("auto");
    });
  });

  describe("C134: Operational Terms Completeness & 3-State Model", () => {
    it("ContractOperationalViewService projects 7 operational terms with 3-state dataStatus", () => {
      const { operationalViewService } = createContractViewTestHarness();

      const view = operationalViewService.getOperationalView(
        "contract-qa-std-001",
      );
      expect(view.contractId).toBe("contract-qa-std-001");

      // 7 operational terms exist in dataStatus
      const termKeys = [
        "modifiableWindow",
        "proofRequirements",
        "waitingRule",
        "noShowRule",
        "slaProfile",
        "effectiveVersion",
        "authMode",
      ];
      for (const term of termKeys) {
        expect(
          view.dataStatus[term as keyof typeof view.dataStatus],
          `Term ${term} must be evaluated in dataStatus`,
        ).toBeDefined();
        expect(["available", "not_applicable", "missing_data"]).toContain(
          view.dataStatus[term as keyof typeof view.dataStatus],
        );
      }

      // Fleet partner contract has available authMode
      expect(view.dataStatus.authMode).toBe("available");
      expect(view.authMode?.mode).toBe("fleet_partner_portal");

      // Individual owner contract has not_applicable authMode
      const indView = operationalViewService.getOperationalView(
        "contract-qa-ind-002",
      );
      expect(indView.dataStatus.authMode).toBe("not_applicable");
      expect(indView.authMode).toBeNull();
    });

    it("validateContractScope enforces partner and service scope isolation", () => {
      const { operationalViewService } = createContractViewTestHarness();

      // Mismatched partnerId throws FORBIDDEN
      expect(() =>
        operationalViewService.validateContractScope("contract-qa-std-001", {
          partnerId: "partner-wrong-partner",
        }),
      ).toThrowError();

      // Mismatched serviceScope throws FORBIDDEN
      expect(() =>
        operationalViewService.validateContractScope("contract-qa-std-001", {
          serviceScope: "business_dispatch",
        }),
      ).toThrowError();

      // Matching scope succeeds
      const validated = operationalViewService.validateContractScope(
        "contract-qa-std-001",
        {
          partnerId: "partner-fleet-001",
          serviceScope: "standard_taxi",
        },
      );
      expect(validated.contractId).toBe("contract-qa-std-001");
    });
  });
});
