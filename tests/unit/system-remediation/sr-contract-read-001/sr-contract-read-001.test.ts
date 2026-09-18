import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { SYSTEM_REMEDIATION_ERROR_CODES } from "@drts/contracts";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { ContractOperationalViewService } from "../../../../apps/api/src/modules/regulatory-registry/contract-operational-view.service";
import { RegulatoryRegistryController } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const requireMod = createRequire(path.resolve(process.cwd(), "package.json"));

function resolvePnpmModule(name: string): any {
  try {
    return requireMod(name);
  } catch {
    // fallback to searching node_modules/.pnpm
  }
  const candidates = [
    path.resolve(process.cwd(), "node_modules/.pnpm"),
    path.resolve(process.cwd(), "../../node_modules/.pnpm"),
    "/home/lupin/workspace/drts-fleet-platform/node_modules/.pnpm",
  ];
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue;
    const entries = fs.readdirSync(base);
    const matches = entries
      .filter((e) => e.startsWith(`${name}@`))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const match of matches) {
      const modPath = path.join(base, match, "node_modules", name);
      if (fs.existsSync(modPath)) {
        return requireMod(modPath);
      }
    }
  }
  throw new Error(`Cannot find module '${name}'`);
}

describe("SR-CONTRACT-READ-001: Ops 合約 read model 補真營運條款", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const openapiPath = path.join(repoRoot, "docs/04-api/openapi-spec.yaml");

  // Helper factory for testing services
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
    const controller = new RegulatoryRegistryController(
      regService,
      opViewService,
    );
    return { regService, tenantPartnerService, opViewService, controller };
  }

  // ==========================================================================
  // 1. Initial Seed Contracts Mapping from Authoritative Sources (N14 / C134)
  // ==========================================================================
  describe("1. Initial Seed Contracts Mapping", () => {
    it("maps contract-demo-001 (standard_taxi) with distinct not_applicable and missing_data statuses", () => {
      const { opViewService } = setupServices();
      const view = opViewService.getOperationalView("contract-demo-001");

      expect(view.contractId).toBe("contract-demo-001");

      // Modifiable window is not applicable to realtime standard_taxi
      expect(view.modifiableWindow).toBeNull();
      expect(view.dataStatus.modifiableWindow).toBe("not_applicable");

      // Proof requirements are not applicable to standard_taxi
      expect(view.proofRequirements).toBeNull();
      expect(view.dataStatus.proofRequirements).toBe("not_applicable");

      // Waiting rule is available
      expect(view.waitingRule).toEqual({
        gracePeriodMinutes: 5,
        chargeableIntervalMinutes: 3,
      });
      expect(view.dataStatus.waitingRule).toBe("available");

      // No-show rule is available
      expect(view.noShowRule).toEqual({
        thresholdMinutes: 10,
        feeApplicable: false,
      });
      expect(view.dataStatus.noShowRule).toBe("available");

      // SLA Profile is available with taichung-port area
      expect(view.slaProfile).toEqual({
        profileId: "sla_standard_taxi_taichung-port",
        targetResponseMinutes: 10,
        pickupWindowMinutes: 15,
        businessDispatchSubtype: "standard_taxi",
      });
      expect(view.dataStatus.slaProfile).toBe("available");

      // Effective version is traceable from startAt
      expect(view.effectiveVersion).toEqual({
        versionNumber: 1,
        versionTag: "v1.0",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: "2026-12-31T23:59:59.000Z",
      });
      expect(view.dataStatus.effectiveVersion).toBe("available");

      // Auth mode: partner-demo-001 is missing registered partner channel authority
      expect(view.authMode).toBeNull();
      expect(view.dataStatus.authMode).toBe("missing_data");
    });

    it("projects contract-demo-001 into flattened ContractOperationalTerms", () => {
      const { opViewService } = setupServices();
      const terms = opViewService.getOperationalTerms("contract-demo-001");

      expect(terms).toEqual({
        contractId: "contract-demo-001",
        modifiableWindowMinutes: null,
        proofRequirements: null,
        waitingRuleMinutes: 5,
        noShowRuleMinutes: 10,
        slaProfileCode: "sla_standard_taxi_taichung-port",
        effectiveVersion: "v1.0",
        authMode: null,
        status: "missing_data",
      });
    });

    it("maps contract-demo-004 (business_dispatch) with full available operational rules", () => {
      const { opViewService } = setupServices();
      const view = opViewService.getOperationalView("contract-demo-004");

      expect(view.contractId).toBe("contract-demo-004");

      // Modifiable window: 30 minutes before dispatch
      expect(view.modifiableWindow).toEqual({
        leadTimeMinutes: 120,
        cutoffMinutes: 30,
        description: "出車前 30 分鐘截止修改 (可修改時窗 30 分鐘)",
      });
      expect(view.dataStatus.modifiableWindow).toBe("available");

      // Proof requirements for enterprise dispatch
      expect(view.proofRequirements).toEqual({
        requiredDocuments: ["photo", "booking_confirmation"],
        signatureRequired: true,
        digitalProofAllowed: true,
      });
      expect(view.dataStatus.proofRequirements).toBe("available");

      // Waiting rule
      expect(view.waitingRule).toEqual({
        gracePeriodMinutes: 15,
        chargeableIntervalMinutes: 5,
      });
      expect(view.dataStatus.waitingRule).toBe("available");

      // No-show rule
      expect(view.noShowRule).toEqual({
        thresholdMinutes: 20,
        feeApplicable: true,
      });
      expect(view.dataStatus.noShowRule).toBe("available");

      // SLA Profile
      expect(view.slaProfile).toEqual({
        profileId: "sla_enterprise_taichung-port",
        targetResponseMinutes: 5,
        pickupWindowMinutes: 15,
        businessDispatchSubtype: "business_dispatch",
      });
      expect(view.dataStatus.slaProfile).toBe("available");

      // Effective version
      expect(view.effectiveVersion).toEqual({
        versionNumber: 1,
        versionTag: "v1.0",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: "2026-12-31T23:59:59.000Z",
      });
      expect(view.dataStatus.effectiveVersion).toBe("available");
    });

    it("maps contract-av-demo-001 (AV business dispatch) with specialized AV proof and window", () => {
      const { opViewService } = setupServices();
      const view = opViewService.getOperationalView("contract-av-demo-001");

      expect(view.contractId).toBe("contract-av-demo-001");
      expect(view.modifiableWindow?.description).toBe(
        "AV 任務出車前 30 分鐘截止修改",
      );
      expect(view.proofRequirements).toEqual({
        requiredDocuments: ["telemetry_log", "camera_snapshot"],
        signatureRequired: false,
        digitalProofAllowed: true,
      });
      expect(view.slaProfile?.profileId).toBe("sla_av_business_taichung-port");
      expect(view.waitingRule?.gracePeriodMinutes).toBe(10);
      expect(view.noShowRule?.thresholdMinutes).toBe(15);
    });
  });

  // ==========================================================================
  // 2. Integration with TenantPartner Authority
  // ==========================================================================
  describe("2. Integration with TenantPartner Authority", () => {
    it("maps authMode and tenant SLA when contract is linked to registered partner channel entry", () => {
      const { regService, opViewService } = setupServices();

      // Create a contract linked to partner-bank-demo-001
      const createdContract = regService.createContract({
        vehicleId: "veh-demo-001",
        partnerId: "partner-bank-demo-001",
        partnerType: "bank_partner",
        contractType: "airport_transfer_agreement",
        serviceScope: "credit_card_airport_transfer",
        startAt: "2026-04-01T00:00:00.000Z",
        endAt: "2026-12-31T23:59:59.000Z",
      });

      const view = opViewService.getOperationalView(createdContract.contractId);

      // Auth mode resolved from partner entry
      expect(view.authMode).toEqual({
        mode: "partner_api_key",
        eligibilityMode: "bank_card_inline",
      });
      expect(view.dataStatus.authMode).toBe("available");

      // SLA Profile resolved from tenant partner SLA profile
      expect(view.slaProfile).toEqual({
        profileId: "sla_program-airport-alpha",
        targetResponseMinutes: 10,
        pickupWindowMinutes: 15,
        businessDispatchSubtype: "credit_card_airport_transfer",
      });
      expect(view.dataStatus.slaProfile).toBe("available");

      // Modifiable window for airport transfer
      expect(view.modifiableWindow).toEqual({
        leadTimeMinutes: 180,
        cutoffMinutes: 60,
        description: "機場接送出車前 60 分鐘截止修改 (可修改時窗 60 分鐘)",
      });
      expect(view.dataStatus.modifiableWindow).toBe("available");

      // Proof requirements for airport transfer
      expect(view.proofRequirements).toEqual({
        requiredDocuments: ["photo", "signoff"],
        signatureRequired: true,
        digitalProofAllowed: true,
      });
      expect(view.dataStatus.proofRequirements).toBe("available");

      // Flattened terms are fully available
      const terms = opViewService.getOperationalTerms(
        createdContract.contractId,
      );
      expect(terms.status).toBe("available");
      expect(terms.authMode).toBe("partner_api_key");
      expect(terms.modifiableWindowMinutes).toBe(60);
      expect(terms.proofRequirements).toEqual(["photo", "signoff"]);
    });
  });

  // ==========================================================================
  // 3. Status Distinction & No Fake Defaults (Acceptance: 未提供/不適用/未知分開)
  // ==========================================================================
  describe("3. Status Distinction & No Fake Defaults", () => {
    it("strictly separates available, not_applicable, and missing_data without fake default numbers", () => {
      const { regService, opViewService } = setupServices();

      // Contract with unknown/unconfigured service scope
      const customContract = regService.createContract({
        vehicleId: "veh-demo-001",
        partnerId: "partner-unconfigured-corp",
        partnerType: "enterprise_partner",
        contractType: "custom_experimental",
        serviceScope: "unconfigured_custom_scope",
        startAt: "2026-05-01T00:00:00.000Z",
        endAt: "2026-10-01T23:59:59.000Z",
      });

      const view = opViewService.getOperationalView(customContract.contractId);

      // Must be missing_data and null, NEVER fabricated numbers
      expect(view.modifiableWindow).toBeNull();
      expect(view.dataStatus.modifiableWindow).toBe("missing_data");

      expect(view.proofRequirements).toBeNull();
      expect(view.dataStatus.proofRequirements).toBe("missing_data");

      expect(view.waitingRule).toBeNull();
      expect(view.dataStatus.waitingRule).toBe("missing_data");

      expect(view.noShowRule).toBeNull();
      expect(view.dataStatus.noShowRule).toBe("missing_data");

      expect(view.slaProfile).toBeNull();
      expect(view.dataStatus.slaProfile).toBe("missing_data");

      expect(view.authMode).toBeNull();
      expect(view.dataStatus.authMode).toBe("missing_data");

      // Effective version is still available from valid start/end
      expect(view.effectiveVersion).not.toBeNull();
      expect(view.dataStatus.effectiveVersion).toBe("available");

      const terms = opViewService.getOperationalTerms(
        customContract.contractId,
      );
      expect(terms.status).toBe("missing_data");
      expect(terms.modifiableWindowMinutes).toBeNull();
      expect(terms.waitingRuleMinutes).toBeNull();
      expect(terms.noShowRuleMinutes).toBeNull();
      expect(terms.slaProfileCode).toBeNull();
    });

    it("distinguishes not_applicable for individual_owner / fleet_partner contracts", () => {
      const { regService, opViewService } = setupServices();

      const fleetContract = regService.createContract({
        vehicleId: "veh-demo-001",
        partnerId: "fleet-demo-001",
        partnerType: "fleet_partner",
        contractType: "fleet_lease_contract",
        serviceScope: "standard_taxi",
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-12-31T23:59:59.000Z",
      });

      const view = opViewService.getOperationalView(fleetContract.contractId);
      expect(view.authMode).toEqual({
        mode: "fleet_partner_portal",
        eligibilityMode: "fleet_bound",
      });
      expect(view.dataStatus.authMode).toBe("available");
      expect(view.dataStatus.modifiableWindow).toBe("not_applicable");
      expect(view.dataStatus.proofRequirements).toBe("not_applicable");
    });
  });

  // ==========================================================================
  // 4. Traceable Lifecycle & Version Tracking (Acceptance: 可追溯版本)
  // ==========================================================================
  describe("4. Traceable Lifecycle & Version Tracking", () => {
    it("advances versionTag and effectiveFrom upon contract activation / update", () => {
      const { regService, opViewService } = setupServices();

      const newContract = regService.createContract({
        vehicleId: "veh-demo-001",
        partnerId: "partner-demo-004",
        partnerType: "enterprise_partner",
        contractType: "service_fleet_contract",
        serviceScope: "business_dispatch",
        startAt: "2026-02-01T00:00:00.000Z",
        endAt: "2026-11-30T23:59:59.000Z",
      });

      const initialView = opViewService.getOperationalView(
        newContract.contractId,
      );
      expect(initialView.effectiveVersion).toEqual({
        versionNumber: 1,
        versionTag: "v1.0",
        effectiveFrom: "2026-02-01T00:00:00.000Z",
        effectiveTo: "2026-11-30T23:59:59.000Z",
      });

      // Activate contract with a newer timestamp
      const activatedAt = "2026-02-15T10:00:00.000Z";
      regService.activateContract(newContract.contractId, {
        approvedAt: activatedAt,
        approvedBy: "ops-lead-001",
      });

      const updatedView = opViewService.getOperationalView(
        newContract.contractId,
      );
      expect(updatedView.effectiveVersion).toEqual({
        versionNumber: 2,
        versionTag: "v2.0",
        effectiveFrom: activatedAt,
        effectiveTo: "2026-11-30T23:59:59.000Z",
      });
    });
  });

  // ==========================================================================
  // 5. Cross-Scope Isolation & Protection (Acceptance: 跨scope不得洩漏合約)
  // ==========================================================================
  describe("5. Cross-Scope Isolation & Protection", () => {
    it("forbids contract access across different partner scopes", () => {
      const { opViewService } = setupServices();

      expect(() =>
        opViewService.getOperationalView("contract-demo-001", {
          partnerId: "partner-foreign-009",
        }),
      ).toThrow(ApiRequestError);

      try {
        opViewService.getOperationalView("contract-demo-001", {
          partnerId: "partner-foreign-009",
        });
      } catch (err: any) {
        expect(err.code).toBe(
          SYSTEM_REMEDIATION_ERROR_CODES.CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN,
        );
        expect(err.getStatus()).toBe(403);
      }
    });

    it("forbids contract access across different serviceScope boundaries", () => {
      const { opViewService } = setupServices();

      expect(() =>
        opViewService.getOperationalView("contract-demo-001", {
          serviceScope: "business_dispatch",
        }),
      ).toThrow(ApiRequestError);

      try {
        opViewService.getOperationalView("contract-demo-001", {
          serviceScope: "business_dispatch",
        });
      } catch (err: any) {
        expect(err.code).toBe(
          SYSTEM_REMEDIATION_ERROR_CODES.CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN,
        );
        expect(err.getStatus()).toBe(403);
      }
    });

    it("forbids contract access across mismatched tenant scopes", () => {
      const { regService, opViewService } = setupServices();

      // Create a contract with partner-bank-demo-001 (which belongs to DEMO_TENANT_ID)
      const contract = regService.createContract({
        vehicleId: "veh-demo-001",
        partnerId: "partner-bank-demo-001",
        partnerType: "bank_partner",
        contractType: "airport_transfer_agreement",
        serviceScope: "credit_card_airport_transfer",
        startAt: "2026-04-01T00:00:00.000Z",
        endAt: "2026-12-31T23:59:59.000Z",
      });

      // Query with a different tenantId
      expect(() =>
        opViewService.getOperationalView(contract.contractId, {
          tenantId: "tenant-other-unauthorized",
        }),
      ).toThrow(ApiRequestError);

      try {
        opViewService.getOperationalView(contract.contractId, {
          tenantId: "tenant-other-unauthorized",
        });
      } catch (err: any) {
        expect(err.code).toBe(
          SYSTEM_REMEDIATION_ERROR_CODES.CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN,
        );
        expect(err.getStatus()).toBe(403);
      }
    });

    it("throws 404 CONTRACT_OPERATIONAL_VIEW_NOT_FOUND when contract does not exist", () => {
      const { opViewService } = setupServices();

      expect(() =>
        opViewService.getOperationalView("contract-nonexistent-999"),
      ).toThrow(ApiRequestError);

      try {
        opViewService.getOperationalView("contract-nonexistent-999");
      } catch (err: any) {
        expect(err.code).toBe(
          SYSTEM_REMEDIATION_ERROR_CODES.CONTRACT_OPERATIONAL_VIEW_NOT_FOUND,
        );
        expect(err.getStatus()).toBe(404);
      }
    });

    it("filters out cross-scope contracts when calling listOperationalViews", () => {
      const { opViewService } = setupServices();

      const allViews = opViewService.listOperationalViews();
      expect(allViews.length).toBeGreaterThanOrEqual(3);

      const standardTaxiOnly = opViewService.listOperationalViews({
        serviceScope: "standard_taxi",
      });
      expect(standardTaxiOnly.length).toBe(1);
      expect(standardTaxiOnly[0].contractId).toBe("contract-demo-001");
    });
  });

  // ==========================================================================
  // 6. Controller Endpoints & API Envelopes
  // ==========================================================================
  describe("6. Controller Endpoints & API Envelopes", () => {
    it("serves operational-view via controller with valid envelope and meta", () => {
      const { controller } = setupServices();

      const response = controller.getContractOperationalView(
        "contract-demo-004",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "req-ops-test-001",
      );

      expect(response.data.contractId).toBe("contract-demo-004");
      expect(response.data.modifiableWindow?.cutoffMinutes).toBe(30);
      expect(response.data.proofRequirements?.signatureRequired).toBe(true);
      expect(response.meta.requestId).toBe("req-ops-test-001");
      expect(response.meta.timestamp).toBeDefined();
    });

    it("serves operational-terms via controller with valid envelope", () => {
      const { controller } = setupServices();

      const response = controller.getContractOperationalTerms(
        "contract-demo-004",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "req-ops-test-002",
      );

      expect(response.data.contractId).toBe("contract-demo-004");
      expect(response.data.modifiableWindowMinutes).toBe(30);
      expect(response.data.waitingRuleMinutes).toBe(15);
      expect(response.data.noShowRuleMinutes).toBe(20);
      expect(response.meta.requestId).toBe("req-ops-test-002");
    });

    it("serves single contract via GET contracts/:contractId with scope enforcement", () => {
      const { controller } = setupServices();

      const response = controller.getContract(
        "contract-demo-001",
        undefined,
        "partner-demo-001",
        "standard_taxi",
        undefined,
        undefined,
        undefined,
        "req-ops-test-003",
      );

      expect(response.data.contractId).toBe("contract-demo-001");
      expect(response.data.partnerId).toBe("partner-demo-001");
      expect(response.meta.requestId).toBe("req-ops-test-003");

      // Mismatched scope in controller must throw 403
      expect(() =>
        controller.getContract(
          "contract-demo-001",
          undefined,
          "partner-wrong",
        ),
      ).toThrow(ApiRequestError);
    });
  });

  // ==========================================================================
  // 7. Ajv Schema Validation against openapi-spec.yaml
  // ==========================================================================
  describe("7. Ajv Schema Validation against openapi-spec.yaml", () => {
    const YAML = resolvePnpmModule("yaml");
    const Ajv = resolvePnpmModule("ajv");
    const AjvClass = Ajv.default || Ajv;
    const ajv = new AjvClass({ strict: false, allErrors: true });

    function transformOpenApiToAjv(schema: any): any {
      if (!schema || typeof schema !== "object") return schema;
      if (Array.isArray(schema)) return schema.map(transformOpenApiToAjv);

      if (schema.$ref) {
        return { $ref: schema.$ref };
      }

      const copy: any = { ...schema };
      if (copy.nullable) {
        delete copy.nullable;
        if (copy.type && typeof copy.type === "string") {
          copy.type = [copy.type, "null"];
        }
      }
      for (const [k, v] of Object.entries(copy)) {
        copy[k] = transformOpenApiToAjv(v);
      }
      return copy;
    }

    const openapiDoc = YAML.parse(fs.readFileSync(openapiPath, "utf8"));
    for (const [name, s] of Object.entries(openapiDoc.components.schemas)) {
      ajv.addSchema(
        transformOpenApiToAjv(s),
        `#/components/schemas/${name}`,
      );
    }

    const validateView = ajv.getSchema(
      "#/components/schemas/ContractOperationalViewRecord",
    )!;
    const validateTerms = ajv.getSchema(
      "#/components/schemas/ContractOperationalTerms",
    )!;
    const validateViewEnvelope = ajv.getSchema(
      "#/components/schemas/ContractOperationalViewEnvelope",
    )!;
    const validateTermsEnvelope = ajv.getSchema(
      "#/components/schemas/ContractOperationalTermsEnvelope",
    )!;

    it("compiles operational view and terms validators", () => {
      expect(validateView).toBeDefined();
      expect(validateTerms).toBeDefined();
      expect(validateViewEnvelope).toBeDefined();
      expect(validateTermsEnvelope).toBeDefined();
    });

    it("validates all service-generated ContractOperationalViewRecords against OpenAPI schema", () => {
      const { opViewService, controller } = setupServices();
      const contracts = ["contract-demo-001", "contract-demo-004", "contract-av-demo-001"];

      for (const cid of contracts) {
        const view = opViewService.getOperationalView(cid);
        const valid = validateView(view);
        if (!valid) {
          console.error("View validation errors:", validateView.errors);
        }
        expect(valid).toBe(true);

        // Envelope validation
        const viewEnv = controller.getContractOperationalView(cid);
        const validEnv = validateViewEnvelope(viewEnv);
        if (!validEnv) {
          console.error("ViewEnvelope validation errors:", validateViewEnvelope.errors);
        }
        expect(validEnv).toBe(true);
      }
    });

    it("validates all service-generated ContractOperationalTerms against OpenAPI schema", () => {
      const { opViewService, controller } = setupServices();
      const contracts = ["contract-demo-001", "contract-demo-004", "contract-av-demo-001"];

      for (const cid of contracts) {
        const terms = opViewService.getOperationalTerms(cid);
        const valid = validateTerms(terms);
        if (!valid) {
          console.error("Terms validation errors:", validateTerms.errors);
        }
        expect(valid).toBe(true);

        // Envelope validation
        const termsEnv = controller.getContractOperationalTerms(cid);
        const validEnv = validateTermsEnvelope(termsEnv);
        if (!validEnv) {
          console.error("TermsEnvelope validation errors:", validateTermsEnvelope.errors);
        }
        expect(validEnv).toBe(true);
      }
    });
  });
});
