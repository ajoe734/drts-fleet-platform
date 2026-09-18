import {
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  forwardRef,
} from "@nestjs/common";

import type {
  ContractOperationalDataStatus,
  ContractOperationalTerms,
  ContractOperationalViewRecord,
  VehicleContractRecord,
} from "@drts/contracts";
import { SYSTEM_REMEDIATION_ERROR_CODES } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { RegulatoryRegistryService } from "./regulatory-registry.service";

export interface ContractOperationalScopeContext {
  tenantId?: string | null | undefined;
  partnerId?: string | null | undefined;
  serviceScope?: string | null | undefined;
}

interface KnownScopePolicy {
  modifiableWindow: {
    leadTimeMinutes: number;
    cutoffMinutes: number;
    description: string;
  } | null;
  modifiableStatus: ContractOperationalDataStatus;
  proofRequirements: {
    requiredDocuments: string[];
    signatureRequired: boolean;
    digitalProofAllowed: boolean;
  } | null;
  proofStatus: ContractOperationalDataStatus;
  waitingRule: {
    gracePeriodMinutes: number;
    chargeableIntervalMinutes?: number;
  } | null;
  waitingStatus: ContractOperationalDataStatus;
  noShowRule: {
    thresholdMinutes: number;
    feeApplicable: boolean;
  } | null;
  noShowStatus: ContractOperationalDataStatus;
  slaTargetResponseMinutes: number | null;
  slaPickupWindowMinutes: number | null;
}

const SCOPE_POLICIES: Record<string, KnownScopePolicy> = {
  business_dispatch: {
    modifiableWindow: {
      leadTimeMinutes: 120,
      cutoffMinutes: 30,
      description: "出車前 30 分鐘截止修改 (可修改時窗 30 分鐘)",
    },
    modifiableStatus: "available",
    proofRequirements: {
      requiredDocuments: ["photo", "booking_confirmation"],
      signatureRequired: true,
      digitalProofAllowed: true,
    },
    proofStatus: "available",
    waitingRule: {
      gracePeriodMinutes: 15,
      chargeableIntervalMinutes: 5,
    },
    waitingStatus: "available",
    noShowRule: {
      thresholdMinutes: 20,
      feeApplicable: true,
    },
    noShowStatus: "available",
    slaTargetResponseMinutes: 5,
    slaPickupWindowMinutes: 15,
  },
  credit_card_airport_transfer: {
    modifiableWindow: {
      leadTimeMinutes: 180,
      cutoffMinutes: 60,
      description: "機場接送出車前 60 分鐘截止修改 (可修改時窗 60 分鐘)",
    },
    modifiableStatus: "available",
    proofRequirements: {
      requiredDocuments: ["photo", "signoff"],
      signatureRequired: true,
      digitalProofAllowed: true,
    },
    proofStatus: "available",
    waitingRule: {
      gracePeriodMinutes: 10,
      chargeableIntervalMinutes: 5,
    },
    waitingStatus: "available",
    noShowRule: {
      thresholdMinutes: 15,
      feeApplicable: true,
    },
    noShowStatus: "available",
    slaTargetResponseMinutes: 10,
    slaPickupWindowMinutes: 15,
  },
  standard_taxi: {
    modifiableWindow: null,
    modifiableStatus: "not_applicable",
    proofRequirements: null,
    proofStatus: "not_applicable",
    waitingRule: {
      gracePeriodMinutes: 5,
      chargeableIntervalMinutes: 3,
    },
    waitingStatus: "available",
    noShowRule: {
      thresholdMinutes: 10,
      feeApplicable: false,
    },
    noShowStatus: "available",
    slaTargetResponseMinutes: 10,
    slaPickupWindowMinutes: 15,
  },
};

@Injectable()
export class ContractOperationalViewService {
  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    @Optional()
    @Inject(forwardRef(() => TenantPartnerService))
    private readonly tenantPartnerService?: TenantPartnerService,
  ) {}

  /**
   * Validate scope isolation for a contract without throwing outside known errors.
   */
  validateContractScope(
    contractId: string,
    scopeContext?: ContractOperationalScopeContext,
  ): VehicleContractRecord {
    const contract = this.findContract(contractId);
    if (!contract) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        SYSTEM_REMEDIATION_ERROR_CODES.CONTRACT_OPERATIONAL_VIEW_NOT_FOUND,
        `Contract operational view for '${contractId}' not found.`,
        { contractId },
      );
    }

    if (scopeContext) {
      const { tenantId, partnerId, serviceScope } = scopeContext;

      if (partnerId && partnerId.trim() !== contract.partnerId.trim()) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          SYSTEM_REMEDIATION_ERROR_CODES.CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN,
          `Access to contract '${contractId}' is forbidden for partner '${partnerId}'.`,
          {
            contractId,
            requiredPartnerId: contract.partnerId,
            requestedPartnerId: partnerId,
          },
        );
      }

      if (
        serviceScope &&
        serviceScope.trim() !== contract.serviceScope.trim()
      ) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          SYSTEM_REMEDIATION_ERROR_CODES.CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN,
          `Access to contract '${contractId}' is forbidden for service scope '${serviceScope}'.`,
          {
            contractId,
            requiredServiceScope: contract.serviceScope,
            requestedServiceScope: serviceScope,
          },
        );
      }

      if (tenantId && tenantId.trim().length > 0) {
        const partnerEntry = this.lookupPartnerEntry(contract);
        if (
          partnerEntry &&
          partnerEntry.tenantId &&
          partnerEntry.tenantId.trim() !== tenantId.trim()
        ) {
          throw new ApiRequestError(
            HttpStatus.FORBIDDEN,
            SYSTEM_REMEDIATION_ERROR_CODES.CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN,
            `Access to contract '${contractId}' is forbidden for tenant '${tenantId}'.`,
            {
              contractId,
              contractTenantId: partnerEntry.tenantId,
              requestedTenantId: tenantId,
            },
          );
        }
      }
    }

    return contract;
  }

  /**
   * Retrieve full operational view with separate statuses for available/not_applicable/missing_data.
   */
  getOperationalView(
    contractId: string,
    scopeContext?: ContractOperationalScopeContext,
  ): ContractOperationalViewRecord {
    const contract = this.validateContractScope(contractId, scopeContext);
    return this.projectContractToOperationalView(contract);
  }

  /**
   * Retrieve flattened operational terms record.
   */
  getOperationalTerms(
    contractId: string,
    scopeContext?: ContractOperationalScopeContext,
  ): ContractOperationalTerms {
    const view = this.getOperationalView(contractId, scopeContext);
    return this.projectOperationalViewToTerms(view);
  }

  /**
   * List all operational views visible within caller scope.
   */
  listOperationalViews(
    scopeContext?: ContractOperationalScopeContext,
  ): ContractOperationalViewRecord[] {
    const allContracts = this.regulatoryRegistryService.listContracts();
    const visibleContracts = allContracts.filter((contract) => {
      try {
        this.validateContractScope(contract.contractId, scopeContext);
        return true;
      } catch {
        return false;
      }
    });

    return visibleContracts.map((contract) =>
      this.projectContractToOperationalView(contract),
    );
  }

  private findContract(contractId: string): VehicleContractRecord | null {
    const contracts = this.regulatoryRegistryService.listContracts();
    return (
      contracts.find((candidate) => candidate.contractId === contractId) ?? null
    );
  }

  private lookupPartnerEntry(contract: VehicleContractRecord) {
    if (!this.tenantPartnerService) {
      return null;
    }
    const entries = this.tenantPartnerService.listPlatformPartnerEntries();
    return (
      entries.find(
        (entry) =>
          entry.partnerId === contract.partnerId ||
          entry.entrySlug === contract.partnerId ||
          entry.partnerCode === contract.partnerId,
      ) ?? null
    );
  }

  private projectContractToOperationalView(
    contract: VehicleContractRecord,
  ): ContractOperationalViewRecord {
    const partnerEntry = this.lookupPartnerEntry(contract);
    const scopeKey =
      partnerEntry?.businessDispatchSubtype ?? contract.serviceScope;
    const policy = SCOPE_POLICIES[scopeKey] ?? null;

    // 1. Modifiable Window
    let modifiableWindow: ContractOperationalViewRecord["modifiableWindow"] =
      null;
    let modifiableStatus: ContractOperationalDataStatus = "missing_data";
    if (policy) {
      modifiableWindow = policy.modifiableWindow;
      modifiableStatus = policy.modifiableStatus;
      if (
        contract.vehicleId?.startsWith("veh-av-") &&
        modifiableWindow !== null
      ) {
        modifiableWindow = {
          ...modifiableWindow,
          description: "AV 任務出車前 30 分鐘截止修改",
        };
      }
    }

    // 2. Proof Requirements
    let proofRequirements: ContractOperationalViewRecord["proofRequirements"] =
      null;
    let proofStatus: ContractOperationalDataStatus = "missing_data";
    if (policy) {
      proofRequirements = policy.proofRequirements;
      proofStatus = policy.proofStatus;
      if (
        contract.vehicleId?.startsWith("veh-av-") &&
        proofRequirements !== null
      ) {
        proofRequirements = {
          requiredDocuments: ["telemetry_log", "camera_snapshot"],
          signatureRequired: false,
          digitalProofAllowed: true,
        };
      }
    }

    // 3. Waiting Rule
    let waitingRule: ContractOperationalViewRecord["waitingRule"] = null;
    let waitingStatus: ContractOperationalDataStatus = "missing_data";
    if (policy) {
      waitingRule = policy.waitingRule;
      waitingStatus = policy.waitingStatus;
      if (contract.vehicleId?.startsWith("veh-av-") && waitingRule !== null) {
        waitingRule = {
          gracePeriodMinutes: 10,
          chargeableIntervalMinutes: 5,
        };
      }
    }

    // 4. No Show Rule
    let noShowRule: ContractOperationalViewRecord["noShowRule"] = null;
    let noShowStatus: ContractOperationalDataStatus = "missing_data";
    if (policy) {
      noShowRule = policy.noShowRule;
      noShowStatus = policy.noShowStatus;
      if (contract.vehicleId?.startsWith("veh-av-") && noShowRule !== null) {
        noShowRule = {
          thresholdMinutes: 15,
          feeApplicable: true,
        };
      }
    }

    // 5. SLA Profile
    let slaProfile: ContractOperationalViewRecord["slaProfile"] = null;
    let slaStatus: ContractOperationalDataStatus = "missing_data";
    if (partnerEntry && this.tenantPartnerService) {
      const tenantSla = this.tenantPartnerService.getSlaProfile(
        partnerEntry.tenantId,
      );
      slaProfile = {
        profileId: `sla_${partnerEntry.programId}`,
        targetResponseMinutes: tenantSla.waitThresholdMin,
        pickupWindowMinutes: tenantSla.arrivalThresholdMin,
        businessDispatchSubtype: partnerEntry.businessDispatchSubtype,
      };
      slaStatus = "available";
    } else if (policy && policy.slaTargetResponseMinutes !== null) {
      const area = contract.operatingAreaId ?? "default";
      const subtype =
        contract.serviceScope === "standard_taxi"
          ? "standard_taxi"
          : "business_dispatch";
      const prefix =
        contract.vehicleId?.startsWith("veh-av-")
          ? "sla_av_business"
          : subtype === "standard_taxi"
            ? "sla_standard_taxi"
            : "sla_enterprise";
      slaProfile = {
        profileId: `${prefix}_${area}`,
        targetResponseMinutes: policy.slaTargetResponseMinutes,
        pickupWindowMinutes: policy.slaPickupWindowMinutes ?? 15,
        businessDispatchSubtype: subtype,
      };
      slaStatus = "available";
    }

    // 6. Effective Version (traceable from lifecycle)
    let effectiveVersion: ContractOperationalViewRecord["effectiveVersion"] =
      null;
    let versionStatus: ContractOperationalDataStatus = "missing_data";
    if (contract.startAt) {
      const hasUpdates =
        Boolean(contract.updatedAt) &&
        Boolean(contract.createdAt) &&
        contract.updatedAt !== contract.createdAt;
      const versionNumber = hasUpdates ? 2 : 1;
      effectiveVersion = {
        versionNumber,
        versionTag: `v${versionNumber}.0`,
        effectiveFrom: hasUpdates ? contract.updatedAt : contract.startAt,
        effectiveTo: contract.endAt ?? null,
      };
      versionStatus = "available";
    }

    // 7. Auth Mode
    let authMode: ContractOperationalViewRecord["authMode"] = null;
    let authStatus: ContractOperationalDataStatus = "missing_data";
    if (partnerEntry) {
      authMode = {
        mode: partnerEntry.authMode,
        eligibilityMode: partnerEntry.eligibilityMode || undefined,
      };
      authStatus = "available";
    } else if (contract.partnerType === "fleet_partner") {
      authMode = {
        mode: "fleet_partner_portal",
        eligibilityMode: "fleet_bound",
      };
      authStatus = "available";
    } else if (contract.partnerType === "individual_owner") {
      authMode = null;
      authStatus = "not_applicable";
    } else {
      // Enterprise partner without registered channel authority is a concrete model gap
      authMode = null;
      authStatus = "missing_data";
    }

    return {
      contractId: contract.contractId,
      modifiableWindow,
      proofRequirements,
      waitingRule,
      noShowRule,
      slaProfile,
      effectiveVersion,
      authMode,
      dataStatus: {
        modifiableWindow: modifiableStatus,
        proofRequirements: proofStatus,
        waitingRule: waitingStatus,
        noShowRule: noShowStatus,
        slaProfile: slaStatus,
        effectiveVersion: versionStatus,
        authMode: authStatus,
      },
    };
  }

  private projectOperationalViewToTerms(
    view: ContractOperationalViewRecord,
  ): ContractOperationalTerms {
    const statuses = Object.values(view.dataStatus);
    let overallStatus: ContractOperationalDataStatus = "available";

    if (statuses.includes("missing_data")) {
      overallStatus = "missing_data";
    } else if (statuses.every((s) => s === "not_applicable")) {
      overallStatus = "not_applicable";
    } else {
      overallStatus = "available";
    }

    return {
      contractId: view.contractId,
      modifiableWindowMinutes: view.modifiableWindow
        ? view.modifiableWindow.cutoffMinutes
        : null,
      proofRequirements: view.proofRequirements
        ? [...view.proofRequirements.requiredDocuments]
        : null,
      waitingRuleMinutes: view.waitingRule
        ? view.waitingRule.gracePeriodMinutes
        : null,
      noShowRuleMinutes: view.noShowRule
        ? view.noShowRule.thresholdMinutes
        : null,
      slaProfileCode: view.slaProfile ? view.slaProfile.profileId : null,
      effectiveVersion: view.effectiveVersion
        ? view.effectiveVersion.versionTag
        : null,
      authMode: view.authMode ? view.authMode.mode : null,
      status: overallStatus,
    };
  }
}
