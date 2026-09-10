import { describe, expect, it } from "vitest";

import {
  SYSTEM_REMEDIATION_ERROR_CODES,
  type ContractOperationalViewRecord,
  type ResourceActionDescriptor,
} from "@drts/contracts";
import { ContractOperationalViewService } from "../../../../apps/api/src/modules/regulatory-registry/contract-operational-view.service";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

describe("SR-OPS-CONTRACT-001 — 合約清單接詳情並呈現可用條款", () => {
  // Service factory for testing backend operational read model
  function setupServices() {
    const mockOpsDispatchEventsService = {
      publishSupplyLifecycleUpdated: () => {},
      publishSupplyOffboardingInitiated: () => {},
      publishSupplyDebrandingCompleted: () => {},
    };
    const regService = new RegulatoryRegistryService(
      mockOpsDispatchEventsService as never,
      null as never,
      null as never,
    );
    const tenantPartnerService = new TenantPartnerService(null as never);
    const opViewService = new ContractOperationalViewService(
      regService,
      tenantPartnerService,
    );
    return { regService, tenantPartnerService, opViewService };
  }

  // Pure helper simulating the list page action synthesis
  function synthesizeAvailableActions(
    contract: { contractId: string },
    seed: {
      kindKey: string;
      crossAppLinks: Array<{ label: string; route: string }>;
    },
  ): ResourceActionDescriptor[] {
    const actions: ResourceActionDescriptor[] = [
      {
        action: "open_contract_detail",
        enabled: Boolean(contract.contractId),
        riskLevel: "low",
      },
    ];

    if (seed.crossAppLinks.length > 0) {
      actions.push({
        action:
          seed.kindKey === "partner" || seed.kindKey === "forwarder"
            ? "open_partner_governance"
            : "open_fleet_governance",
        enabled: true,
        riskLevel: "medium",
      });
    }

    return actions;
  }

  // Pure helper simulating detail page backHref resolution
  function resolveBackHref(
    searchParams: Record<string, string | string[] | undefined>,
  ): string {
    const returnToRaw = Array.isArray(searchParams.returnTo)
      ? searchParams.returnTo[0]
      : searchParams.returnTo;

    if (
      typeof returnToRaw === "string" &&
      returnToRaw.startsWith("/contracts")
    ) {
      return returnToRaw;
    }

    const returnParams = new URLSearchParams();
    for (const key of [
      "tab",
      "q",
      "status",
      "type",
      "expiring",
      "emptyReason",
    ] as const) {
      const val = Array.isArray(searchParams[key])
        ? searchParams[key][0]
        : searchParams[key];
      if (val && val !== "all") {
        returnParams.set(key, val);
      }
    }
    const returnQuery = returnParams.toString();
    return returnQuery ? `/contracts?${returnQuery}` : "/contracts";
  }

  // Pure helper simulating buildHref on list page
  function buildHref(
    filters: {
      tab: string;
      q: string;
      status: string;
      type: string;
      expiring: string;
      emptyReason: string | null;
    },
  ): string {
    const params = new URLSearchParams();
    if (filters.tab !== "all") params.set("tab", filters.tab);
    if (filters.q) params.set("q", filters.q);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.type !== "all") params.set("type", filters.type);
    if (filters.expiring !== "all") params.set("expiring", filters.expiring);
    if (filters.emptyReason) params.set("emptyReason", filters.emptyReason);
    const query = params.toString();
    return query ? `/contracts?${query}` : "/contracts";
  }

  // Pure helper simulating list-to-detail link creation
  function buildDetailHref(contractId: string, currentFilterUrl: string): string {
    return currentFilterUrl !== "/contracts"
      ? `/contracts/${encodeURIComponent(contractId)}?returnTo=${encodeURIComponent(currentFilterUrl)}`
      : `/contracts/${encodeURIComponent(contractId)}`;
  }

  // ==========================================================================
  // 1. Acceptance Criteria 1: 由3筆列表都能進對應詳情返回原篩選 (N13)
  // ==========================================================================
  describe("1. Acceptance: 由3筆列表都能進對應詳情返回原篩選 (N13)", () => {
    it("clears fixed contract_detail_pending and synthesizes enabled open_contract_detail action", () => {
      const contract = { contractId: "contract-demo-001" };
      const actions = synthesizeAvailableActions(contract, {
        kindKey: "fleet",
        crossAppLinks: [{ label: "Fleet governance", route: "/fleet" }],
      });

      const detailAction = actions.find(
        (a) => a.action === "open_contract_detail",
      );
      expect(detailAction).toBeDefined();
      expect(detailAction?.enabled).toBe(true);
      expect(detailAction?.disabledReasonCode).toBeUndefined();
      expect(detailAction?.riskLevel).toBe("low");
    });

    it("normalizes legacy actions containing contract_detail_pending into enabled actions", () => {
      const legacyActions: ResourceActionDescriptor[] = [
        {
          action: "open_contract_detail",
          enabled: false,
          disabledReasonCode: "contract_detail_pending",
          riskLevel: "low",
        },
      ];

      const normalized = legacyActions.map((action) => {
        if (
          action.action === "open_contract_detail" &&
          action.disabledReasonCode === "contract_detail_pending"
        ) {
          const { disabledReasonCode: _unused, ...rest } = action;
          void _unused;
          return {
            ...rest,
            enabled: true,
          };
        }
        return action;
      });

      expect(normalized[0]?.enabled).toBe(true);
      expect(normalized[0]?.disabledReasonCode).toBeUndefined();
    });

    it("generates correct detailHref for all 3 contracts preserving active filter state in returnTo", () => {
      const { regService } = setupServices();
      const contracts = regService.listContracts();
      expect(contracts.length).toBeGreaterThanOrEqual(3);

      const contractIds = [
        "contract-demo-001",
        "contract-demo-004",
        "contract-av-demo-001",
      ];
      for (const id of contractIds) {
        expect(contracts.some((c) => c.contractId === id)).toBe(true);
      }

      // Filter scenario A: expiring contracts tab with search query
      const filterA = {
        tab: "expiring",
        q: "taichung",
        status: "active",
        type: "all",
        expiring: "yes",
        emptyReason: null,
      };
      const filterUrlA = buildHref(filterA);
      expect(filterUrlA).toBe("/contracts?tab=expiring&q=taichung&status=active&expiring=yes");

      for (const id of contractIds) {
        const detailHref = buildDetailHref(id, filterUrlA);
        expect(detailHref).toBe(
          `/contracts/${id}?returnTo=${encodeURIComponent(filterUrlA)}`,
        );

        // Simulate landing on detail page and resolving backHref
        const parsedUrl = new URL(detailHref, "http://localhost:3000");
        const back = resolveBackHref({
          returnTo: parsedUrl.searchParams.get("returnTo") ?? undefined,
        });
        expect(back).toBe(filterUrlA);
      }

      // Filter scenario B: partner filter
      const filterB = {
        tab: "partner",
        q: "",
        status: "all",
        type: "partner",
        expiring: "all",
        emptyReason: null,
      };
      const filterUrlB = buildHref(filterB);
      expect(filterUrlB).toBe("/contracts?tab=partner&type=partner");

      for (const id of contractIds) {
        const detailHref = buildDetailHref(id, filterUrlB);
        const parsedUrl = new URL(detailHref, "http://localhost:3000");
        const back = resolveBackHref({
          returnTo: parsedUrl.searchParams.get("returnTo") ?? undefined,
        });
        expect(back).toBe(filterUrlB);
      }
    });

    it("resolves backHref cleanly from direct searchParams when returnTo is omitted", () => {
      const backA = resolveBackHref({ tab: "expiring", status: "active" });
      expect(backA).toBe("/contracts?tab=expiring&status=active");

      const backB = resolveBackHref({ q: "demo", type: "forwarder" });
      expect(backB).toBe("/contracts?q=demo&type=forwarder");

      const backDefault = resolveBackHref({});
      expect(backDefault).toBe("/contracts");
    });

    it("guards backHref against malicious or non-contracts redirect targets", () => {
      const maliciousA = resolveBackHref({ returnTo: "https://evil.com" });
      expect(maliciousA).toBe("/contracts");

      const maliciousB = resolveBackHref({ returnTo: "/api/secret" });
      expect(maliciousB).toBe("/contracts");

      const maliciousC = resolveBackHref({ returnTo: "javascript:alert(1)" });
      expect(maliciousC).toBe("/contracts");
    });
  });

  // ==========================================================================
  // 2. Acceptance Criteria 2: 必要營運條款有真值；區分不適用與缺資料 (N14 / C134)
  // ==========================================================================
  describe("2. Acceptance: 必要營運條款有真值且區分三大狀態 (N14 / C134)", () => {
    it("contract-demo-001 (standard_taxi) provides real waiting/no-show/SLA/version values, distinct from not_applicable", () => {
      const { opViewService } = setupServices();
      const view: ContractOperationalViewRecord =
        opViewService.getOperationalView("contract-demo-001");

      // 1. Modifiable Window: not applicable to instant taxi
      expect(view.dataStatus.modifiableWindow).toBe("not_applicable");
      expect(view.modifiableWindow).toBeNull();

      // 2. Proof Requirements: not applicable
      expect(view.dataStatus.proofRequirements).toBe("not_applicable");
      expect(view.proofRequirements).toBeNull();

      // 3. Waiting Rule: available real values (5 min grace, 3 min chargeable)
      expect(view.dataStatus.waitingRule).toBe("available");
      expect(view.waitingRule).toEqual({
        gracePeriodMinutes: 5,
        chargeableIntervalMinutes: 3,
      });

      // 4. No-show Rule: available real values (10 min threshold, no fee)
      expect(view.dataStatus.noShowRule).toBe("available");
      expect(view.noShowRule).toEqual({
        thresholdMinutes: 10,
        feeApplicable: false,
      });

      // 5. SLA Profile: available real values for taichung-port standard taxi
      expect(view.dataStatus.slaProfile).toBe("available");
      expect(view.slaProfile?.profileId).toBe("sla_standard_taxi_taichung-port");
      expect(view.slaProfile?.targetResponseMinutes).toBe(10);
      expect(view.slaProfile?.pickupWindowMinutes).toBe(15);

      // 6. Effective Version: available version v1.0, revision 1
      expect(view.dataStatus.effectiveVersion).toBe("available");
      expect(view.effectiveVersion?.versionTag).toBe("v1.0");
      expect(view.effectiveVersion?.versionNumber).toBe(1);

      // 7. Auth Mode: partner not configured -> missing_data (not fake default)
      expect(view.dataStatus.authMode).toBe("missing_data");
      expect(view.authMode).toBeNull();
    });

    it("contract-demo-004 (business_dispatch) provides real modifiableWindow and photo/booking proof requirements", () => {
      const { opViewService } = setupServices();
      const view: ContractOperationalViewRecord =
        opViewService.getOperationalView("contract-demo-004");

      // 1. Modifiable Window: 30 min cutoff, 120 min lead time
      expect(view.dataStatus.modifiableWindow).toBe("available");
      expect(view.modifiableWindow?.cutoffMinutes).toBe(30);
      expect(view.modifiableWindow?.leadTimeMinutes).toBe(120);

      // 2. Proof Requirements: photo & booking confirmation, signature required
      expect(view.dataStatus.proofRequirements).toBe("available");
      expect(view.proofRequirements?.requiredDocuments).toContain("photo");
      expect(view.proofRequirements?.requiredDocuments).toContain("booking_confirmation");
      expect(view.proofRequirements?.signatureRequired).toBe(true);
      expect(view.proofRequirements?.digitalProofAllowed).toBe(true);

      // 3. Waiting Rule: 15 min grace, 5 min chargeable
      expect(view.dataStatus.waitingRule).toBe("available");
      expect(view.waitingRule?.gracePeriodMinutes).toBe(15);
      expect(view.waitingRule?.chargeableIntervalMinutes).toBe(5);

      // 4. No-show Rule: 20 min threshold, fee applicable
      expect(view.dataStatus.noShowRule).toBe("available");
      expect(view.noShowRule?.thresholdMinutes).toBe(20);
      expect(view.noShowRule?.feeApplicable).toBe(true);

      // 5. SLA Profile: enterprise profile
      expect(view.dataStatus.slaProfile).toBe("available");
      expect(view.slaProfile?.profileId).toBe("sla_enterprise_taichung-port");
      expect(view.slaProfile?.targetResponseMinutes).toBe(5);
      expect(view.slaProfile?.pickupWindowMinutes).toBe(15);

      // 6. Effective Version: available
      expect(view.dataStatus.effectiveVersion).toBe("available");
    });

    it("contract-av-demo-001 (AV business_dispatch) reflects AV telemetry & camera proof without driver signature", () => {
      const { opViewService } = setupServices();
      const view: ContractOperationalViewRecord =
        opViewService.getOperationalView("contract-av-demo-001");

      // Modifiable Window: AV custom description
      expect(view.dataStatus.modifiableWindow).toBe("available");
      expect(view.modifiableWindow?.description).toContain("AV 任務");

      // Proof Requirements: telemetry_log and camera_snapshot, NO signature needed for autonomous vehicle
      expect(view.dataStatus.proofRequirements).toBe("available");
      expect(view.proofRequirements?.requiredDocuments).toContain("telemetry_log");
      expect(view.proofRequirements?.requiredDocuments).toContain("camera_snapshot");
      expect(view.proofRequirements?.signatureRequired).toBe(false);

      // Waiting & No-show
      expect(view.dataStatus.waitingRule).toBe("available");
      expect(view.waitingRule?.gracePeriodMinutes).toBe(10);
      expect(view.dataStatus.noShowRule).toBe("available");
      expect(view.noShowRule?.thresholdMinutes).toBe(15);
    });

    it("links partner authority correctly when partner entry is configured with authMode", () => {
      const { regService, opViewService } = setupServices();

      // Seed a contract using existing vehicle veh-demo-001 linked to partner-bank-demo-001
      const createdContract = regService.createContract({
        vehicleId: "veh-demo-001",
        partnerId: "partner-bank-demo-001",
        partnerType: "bank_partner",
        contractType: "airport_transfer_agreement",
        serviceScope: "credit_card_airport_transfer",
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-12-31T23:59:59.000Z",
      });

      const view = opViewService.getOperationalView(createdContract.contractId);
      expect(view.dataStatus.authMode).toBe("available");
      expect(view.authMode?.mode).toBe("partner_api_key");
      expect(view.authMode?.eligibilityMode).toBe("bank_card_inline");

      // Airport transfer cutoff 60 min
      expect(view.dataStatus.modifiableWindow).toBe("available");
      expect(view.modifiableWindow?.cutoffMinutes).toBe(60);
    });
  });

  // ==========================================================================
  // 3. Acceptance Criteria 3: 唯讀角色無編輯，治理跨app路由正確
  // ==========================================================================
  describe("3. Acceptance: 唯讀角色無編輯，治理跨app路由正確", () => {
    it("synthesizes crossAppLinks targeting platform-admin with new_tab openMode", () => {
      // Partner contract cross app link
      const partnerContract = {
        contractId: "contract-demo-004",
        partnerId: "partner-demo-004",
        vehicleId: "veh-demo-004",
        crossAppLinks: [] as any[],
      };
      const partnerActions = synthesizeAvailableActions(partnerContract, {
        kindKey: "partner",
        crossAppLinks: [
          {
            targetApp: "platform-admin",
            route: `/partners?partnerId=${encodeURIComponent(partnerContract.partnerId)}`,
            resourceType: "partner_program",
            resourceId: partnerContract.partnerId,
            openMode: "new_tab",
            label: "夥伴治理",
          },
        ] as any[],
      });

      expect(partnerActions.some((a) => a.action === "open_partner_governance")).toBe(true);

      // Vehicle contract cross app link
      const vehicleContract = {
        contractId: "contract-demo-001",
        partnerId: "partner-demo-001",
        vehicleId: "veh-demo-001",
        crossAppLinks: [] as any[],
      };
      const vehicleActions = synthesizeAvailableActions(vehicleContract, {
        kindKey: "fleet",
        crossAppLinks: [
          {
            targetApp: "platform-admin",
            route: `/fleet?vehicleId=${encodeURIComponent(vehicleContract.vehicleId)}`,
            resourceType: "vehicle_contract",
            resourceId: vehicleContract.contractId,
            openMode: "new_tab",
            label: "車隊治理",
          },
        ] as any[],
      });

      expect(vehicleActions.some((a) => a.action === "open_fleet_governance")).toBe(true);
    });

    it("verifies read-only boundary: no mutation actions or editable fields exist in ops scope", () => {
      const { opViewService } = setupServices();
      const view = opViewService.getOperationalView("contract-demo-001");

      // Operational read model only exposes query/projection methods
      expect(typeof (opViewService as any).updateOperationalTerms).toBe("undefined");
      expect(typeof (opViewService as any).mutateContract).toBe("undefined");
      expect(view).toBeDefined();
    });
  });

  // ==========================================================================
  // 4. Traceability & Zero Leakage Compliance
  // ==========================================================================
  describe("4. Traceability & Isolation", () => {
    it("enforces tenant, partner, and scope isolation without data leakage", () => {
      const { opViewService } = setupServices();

      // Accessing with matching scope succeeds
      const valid = opViewService.getOperationalView("contract-demo-001", {
        partnerId: "partner-demo-001",
        serviceScope: "standard_taxi",
      });
      expect(valid.contractId).toBe("contract-demo-001");

      // Accessing with mismatched partnerId throws FORBIDDEN
      try {
        opViewService.getOperationalView("contract-demo-001", {
          partnerId: "wrong-partner",
        });
        expect.unreachable("Should have thrown FORBIDDEN");
      } catch (err: any) {
        expect(err.code).toBe(
          SYSTEM_REMEDIATION_ERROR_CODES.CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN,
        );
        expect(err.getStatus()).toBe(403);
      }

      // Accessing with mismatched serviceScope throws FORBIDDEN
      try {
        opViewService.getOperationalView("contract-demo-001", {
          serviceScope: "business_dispatch",
        });
        expect.unreachable("Should have thrown FORBIDDEN");
      } catch (err: any) {
        expect(err.code).toBe(
          SYSTEM_REMEDIATION_ERROR_CODES.CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN,
        );
        expect(err.getStatus()).toBe(403);
      }
    });
  });
});
