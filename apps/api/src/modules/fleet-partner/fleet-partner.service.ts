import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  CreateDriverFleetAffiliationCommand,
  CreateFleetPartnerCommand,
  CreateFleetPartnerRevenueShareRuleCommand,
  DriverFleetAffiliationRecord,
  DriverRegistryRecord,
  DriverStatementRecord,
  FleetPartnerRecord,
  FleetPartnerPortalDashboardRecord,
  FleetPartnerPortalDriverRecord,
  FleetPartnerPortalQualityMetricsRecord,
  FleetPartnerPortalTripRecord,
  FleetPartnerPortalVehicleRecord,
  FleetPartnerRevenueShareRuleRecord,
  FleetPartnerStatementLineRecord,
  FleetPartnerStatementRecord,
  OwnedOrderRecord,
  VehicleRegistryRecord,
  UpdateFleetPartnerCommand,
  UpdateFleetPartnerRevenueShareRuleCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  BillingSettlementService,
  type BillingSettlementTripRecord,
} from "../billing-settlement/billing-settlement.service";
import { settlementChannelKeyForTrip } from "../billing-settlement/settlement-matrix";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import {
  FleetPartnerRepository,
  type PersistFleetPartnerChanges,
} from "./fleet-partner.repository";

const DEFAULT_CURRENCY = "NTD";

const FLEET_PARTNER_SEED: FleetPartnerRecord[] = [
  {
    fleetPartnerId: "fleet-demo-001",
    legalName: "Demo Fleet Management Co., Ltd.",
    displayName: "Demo Fleet",
    businessRegistrationNo: "24567890",
    contactName: "Fleet Ops Lead",
    contactPhone: "+886-2-5550-0001",
    active: true,
    partnershipType: "fleet_management",
  },
];

const DRIVER_FLEET_AFFILIATION_SEED: DriverFleetAffiliationRecord[] = [
  {
    affiliationId: "fleet-aff-demo-001",
    driverId: "drv-demo-001",
    fleetPartnerId: "fleet-demo-001",
    affiliationType: "managed_by",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    driverGroupId: "demo-core-drivers",
  },
  {
    affiliationId: "fleet-aff-demo-002",
    driverId: "drv-demo-002",
    fleetPartnerId: "fleet-demo-001",
    affiliationType: "managed_by",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    driverGroupId: "demo-core-drivers",
  },
];

const REVENUE_SHARE_RULE_SEED: FleetPartnerRevenueShareRuleRecord[] = [
  {
    ruleId: "fleet-rule-demo-001",
    fleetPartnerId: "fleet-demo-001",
    appliesTo: "all_trips",
    formula: "percent_of_gross",
    rateBps: 800,
    fixedAmountMinor: null,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
  },
];

type StatementRuleMatch = {
  rule: FleetPartnerRevenueShareRuleRecord;
  affinityScore: number;
};

@Injectable()
export class FleetPartnerService implements OnModuleInit {
  private fleetPartners = FLEET_PARTNER_SEED.map((partner) => ({ ...partner }));
  private driverAffiliations = DRIVER_FLEET_AFFILIATION_SEED.map(
    (affiliation) => ({ ...affiliation }),
  );
  private revenueShareRules = REVENUE_SHARE_RULE_SEED.map((rule) => ({
    ...rule,
  }));
  private statements: FleetPartnerStatementRecord[] = [];

  constructor(
    private readonly billingSettlementService: BillingSettlementService,
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    @Optional()
    private readonly fleetPartnerRepository?: FleetPartnerRepository,
  ) {}

  async onModuleInit() {
    if (!this.fleetPartnerRepository) {
      return;
    }

    try {
      const persistedState = await this.fleetPartnerRepository.loadState();
      const hasPersistedState =
        persistedState.fleetPartners.length > 0 ||
        persistedState.driverAffiliations.length > 0 ||
        persistedState.revenueShareRules.length > 0 ||
        persistedState.statements.length > 0;

      if (!hasPersistedState) {
        await this.persistChanges(
          {
            fleetPartners: this.fleetPartners.map((partner) =>
              this.cloneFleetPartner(partner),
            ),
            driverAffiliations: this.driverAffiliations.map((affiliation) =>
              this.cloneAffiliation(affiliation),
            ),
            revenueShareRules: this.revenueShareRules.map((rule) =>
              this.cloneRevenueShareRule(rule),
            ),
          },
          "module init bootstrap",
        );
        return;
      }

      this.fleetPartners =
        persistedState.fleetPartners.length > 0
          ? persistedState.fleetPartners.map((partner) =>
              this.cloneFleetPartner(partner),
            )
          : this.fleetPartners;
      this.driverAffiliations =
        persistedState.driverAffiliations.length > 0
          ? persistedState.driverAffiliations.map((affiliation) =>
              this.cloneAffiliation(affiliation),
            )
          : this.driverAffiliations;
      this.revenueShareRules =
        persistedState.revenueShareRules.length > 0
          ? persistedState.revenueShareRules.map((rule) =>
              this.cloneRevenueShareRule(rule),
            )
          : this.revenueShareRules;
      this.statements = persistedState.statements.map((statement) =>
        this.cloneStatement(statement),
      );
    } catch (error) {
      this.fleetPartnerRepository.reportPersistenceFailure(
        error,
        "module init",
      );
    }
  }

  listFleetPartners() {
    return this.fleetPartners.map((partner) => this.cloneFleetPartner(partner));
  }

  getFleetPartner(fleetPartnerId: string) {
    return this.cloneFleetPartner(this.requireFleetPartner(fleetPartnerId));
  }

  createFleetPartner(command: CreateFleetPartnerCommand) {
    this.assertNonBlank(command.legalName, "legalName");
    this.assertNonBlank(command.displayName, "displayName");
    this.assertNonBlank(
      command.businessRegistrationNo,
      "businessRegistrationNo",
    );
    this.assertNonBlank(command.contactName, "contactName");
    this.assertNonBlank(command.contactPhone, "contactPhone");

    const partner: FleetPartnerRecord = {
      fleetPartnerId: `fleet-${randomUUID()}`,
      legalName: command.legalName.trim(),
      displayName: command.displayName.trim(),
      businessRegistrationNo: command.businessRegistrationNo.trim(),
      contactName: command.contactName.trim(),
      contactPhone: command.contactPhone.trim(),
      active: command.active ?? true,
      partnershipType: command.partnershipType,
    };
    this.fleetPartners = [partner, ...this.fleetPartners];
    this.persistChanges(
      { fleetPartners: [this.cloneFleetPartner(partner)] },
      "create fleet partner",
    );
    return this.cloneFleetPartner(partner);
  }

  updateFleetPartner(
    fleetPartnerId: string,
    command: UpdateFleetPartnerCommand,
  ) {
    const partner = this.requireFleetPartner(fleetPartnerId);

    if (command.legalName !== undefined) {
      this.assertNonBlank(command.legalName, "legalName");
      partner.legalName = command.legalName.trim();
    }
    if (command.displayName !== undefined) {
      this.assertNonBlank(command.displayName, "displayName");
      partner.displayName = command.displayName.trim();
    }
    if (command.businessRegistrationNo !== undefined) {
      this.assertNonBlank(
        command.businessRegistrationNo,
        "businessRegistrationNo",
      );
      partner.businessRegistrationNo = command.businessRegistrationNo.trim();
    }
    if (command.contactName !== undefined) {
      this.assertNonBlank(command.contactName, "contactName");
      partner.contactName = command.contactName.trim();
    }
    if (command.contactPhone !== undefined) {
      this.assertNonBlank(command.contactPhone, "contactPhone");
      partner.contactPhone = command.contactPhone.trim();
    }
    if (command.active !== undefined) {
      partner.active = command.active;
    }
    if (command.partnershipType !== undefined) {
      partner.partnershipType = command.partnershipType;
    }

    this.persistChanges(
      { fleetPartners: [this.cloneFleetPartner(partner)] },
      "update fleet partner",
    );
    return this.cloneFleetPartner(partner);
  }

  listFleetPartnerDrivers(fleetPartnerId: string) {
    this.requireFleetPartner(fleetPartnerId);
    return this.driverAffiliations
      .filter((affiliation) => affiliation.fleetPartnerId === fleetPartnerId)
      .sort((left, right) =>
        right.effectiveFrom.localeCompare(left.effectiveFrom),
      )
      .map((affiliation) => this.cloneAffiliation(affiliation));
  }

  createDriverFleetAffiliation(
    driverId: string,
    command: CreateDriverFleetAffiliationCommand,
  ) {
    this.assertNonBlank(driverId, "driverId");
    this.requireFleetPartner(command.fleetPartnerId);
    this.assertIsoDate(command.effectiveFrom, "effectiveFrom");
    if (command.effectiveUntil) {
      this.assertIsoDate(command.effectiveUntil, "effectiveUntil");
    }

    const affiliation: DriverFleetAffiliationRecord = {
      affiliationId: `fleet-aff-${randomUUID()}`,
      driverId: driverId.trim(),
      fleetPartnerId: command.fleetPartnerId,
      affiliationType: command.affiliationType,
      effectiveFrom: command.effectiveFrom,
      effectiveUntil: command.effectiveUntil ?? null,
      driverGroupId: command.driverGroupId?.trim() || null,
    };
    this.driverAffiliations = [affiliation, ...this.driverAffiliations];
    this.persistChanges(
      { driverAffiliations: [this.cloneAffiliation(affiliation)] },
      "create driver fleet affiliation",
    );
    return this.cloneAffiliation(affiliation);
  }

  listRevenueShareRules(fleetPartnerId: string) {
    this.requireFleetPartner(fleetPartnerId);
    return this.revenueShareRules
      .filter((rule) => rule.fleetPartnerId === fleetPartnerId)
      .sort((left, right) =>
        right.effectiveFrom.localeCompare(left.effectiveFrom),
      )
      .map((rule) => this.cloneRevenueShareRule(rule));
  }

  getRevenueShareRule(fleetPartnerId: string, ruleId: string) {
    return this.cloneRevenueShareRule(
      this.requireRevenueShareRule(fleetPartnerId, ruleId),
    );
  }

  createRevenueShareRule(
    fleetPartnerId: string,
    command: CreateFleetPartnerRevenueShareRuleCommand,
  ) {
    this.requireFleetPartner(fleetPartnerId);
    this.validateRevenueShareRuleInput(command);

    const rule: FleetPartnerRevenueShareRuleRecord = {
      ruleId: `fleet-rule-${randomUUID()}`,
      fleetPartnerId,
      appliesTo: command.appliesTo,
      serviceProduct: command.serviceProduct?.trim() || null,
      tenantServiceProgramId: command.tenantServiceProgramId?.trim() || null,
      sourcePlatform: command.sourcePlatform?.trim() || null,
      driverGroupId: command.driverGroupId?.trim() || null,
      formula: command.formula,
      rateBps: command.rateBps ?? null,
      fixedAmountMinor: command.fixedAmountMinor ?? null,
      effectiveFrom: command.effectiveFrom,
      effectiveUntil: command.effectiveUntil ?? null,
    };
    this.revenueShareRules = [rule, ...this.revenueShareRules];
    this.persistChanges(
      { revenueShareRules: [this.cloneRevenueShareRule(rule)] },
      "create revenue share rule",
    );
    return this.cloneRevenueShareRule(rule);
  }

  updateRevenueShareRule(
    fleetPartnerId: string,
    ruleId: string,
    command: UpdateFleetPartnerRevenueShareRuleCommand,
  ) {
    const rule = this.requireRevenueShareRule(fleetPartnerId, ruleId);
    this.validateRevenueShareRuleInput({
      appliesTo: command.appliesTo ?? rule.appliesTo,
      serviceProduct: command.serviceProduct ?? rule.serviceProduct ?? null,
      tenantServiceProgramId:
        command.tenantServiceProgramId ?? rule.tenantServiceProgramId ?? null,
      sourcePlatform: command.sourcePlatform ?? rule.sourcePlatform ?? null,
      driverGroupId: command.driverGroupId ?? rule.driverGroupId ?? null,
      formula: command.formula ?? rule.formula,
      rateBps: command.rateBps ?? rule.rateBps ?? null,
      fixedAmountMinor:
        command.fixedAmountMinor ?? rule.fixedAmountMinor ?? null,
      effectiveFrom: command.effectiveFrom ?? rule.effectiveFrom,
      effectiveUntil: command.effectiveUntil ?? rule.effectiveUntil ?? null,
    });

    if (command.appliesTo !== undefined) {
      rule.appliesTo = command.appliesTo;
    }
    if (command.serviceProduct !== undefined) {
      rule.serviceProduct = command.serviceProduct?.trim() || null;
    }
    if (command.tenantServiceProgramId !== undefined) {
      rule.tenantServiceProgramId =
        command.tenantServiceProgramId?.trim() || null;
    }
    if (command.sourcePlatform !== undefined) {
      rule.sourcePlatform = command.sourcePlatform?.trim() || null;
    }
    if (command.driverGroupId !== undefined) {
      rule.driverGroupId = command.driverGroupId?.trim() || null;
    }
    if (command.formula !== undefined) {
      rule.formula = command.formula;
    }
    if (command.rateBps !== undefined) {
      rule.rateBps = command.rateBps;
    }
    if (command.fixedAmountMinor !== undefined) {
      rule.fixedAmountMinor = command.fixedAmountMinor;
    }
    if (command.effectiveFrom !== undefined) {
      rule.effectiveFrom = command.effectiveFrom;
    }
    if (command.effectiveUntil !== undefined) {
      rule.effectiveUntil = command.effectiveUntil;
    }

    this.persistChanges(
      { revenueShareRules: [this.cloneRevenueShareRule(rule)] },
      "update revenue share rule",
    );
    return this.cloneRevenueShareRule(rule);
  }

  async deleteRevenueShareRule(fleetPartnerId: string, ruleId: string) {
    this.requireRevenueShareRule(fleetPartnerId, ruleId);
    this.revenueShareRules = this.revenueShareRules.filter(
      (rule) =>
        !(rule.fleetPartnerId === fleetPartnerId && rule.ruleId === ruleId),
    );
    if (!this.fleetPartnerRepository) {
      return;
    }

    try {
      await this.fleetPartnerRepository.deleteRevenueShareRule(ruleId);
    } catch (error) {
      this.fleetPartnerRepository.reportPersistenceFailure(
        error,
        "delete revenue share rule",
      );
    }
  }

  async listFleetPartnerStatements(
    fleetPartnerId: string,
    periodMonth?: string,
  ) {
    this.requireFleetPartner(fleetPartnerId);
    if (periodMonth) {
      await this.rebuildStatementsForPeriodMonth(periodMonth, fleetPartnerId);
    }

    return this.statements
      .filter(
        (statement) =>
          statement.fleetPartnerId === fleetPartnerId &&
          (!periodMonth || statement.periodMonth === periodMonth),
      )
      .sort((left, right) => right.periodMonth.localeCompare(left.periodMonth))
      .map((statement) => this.cloneStatement(statement));
  }

  async getPortalDashboard(
    fleetPartnerId: string,
    periodMonth?: string,
  ): Promise<FleetPartnerPortalDashboardRecord> {
    const normalizedPeriodMonth = await this.resolvePeriodMonth(periodMonth);
    const [drivers, vehicles, trips, statements, orders, orderDriverMap] =
      await Promise.all([
        this.listPortalDrivers(fleetPartnerId),
        this.listPortalVehicles(fleetPartnerId),
        this.listPortalTrips(fleetPartnerId, normalizedPeriodMonth),
        this.listFleetPartnerStatements(fleetPartnerId, normalizedPeriodMonth),
        Promise.resolve(this.ownedMobilityService.listOrders()),
        this.buildOrderDriverMap(normalizedPeriodMonth),
      ]);
    const driverIds = new Set(drivers.map((driver) => driver.driverId));
    const inFlightTripCount = orders.filter((order) =>
      this.isPartnerInFlightOrder(order, driverIds, orderDriverMap),
    ).length;
    const proofPendingTripCount = orders.filter((order) =>
      this.isPartnerProofPendingOrder(order, driverIds, orderDriverMap),
    ).length;

    return {
      fleetPartnerId,
      periodMonth: normalizedPeriodMonth,
      activeDriverCount: drivers.length,
      onlineDriverCount: drivers.filter(
        (driver) => driver.workState !== "offline",
      ).length,
      dispatchEligibleDriverCount: drivers.filter(
        (driver) => driver.dispatchEligible,
      ).length,
      totalVehicleCount: vehicles.length,
      dispatchableVehicleCount: vehicles.filter(
        (vehicle) => vehicle.dispatchableFlag,
      ).length,
      completedTripCount: trips.length,
      inFlightTripCount,
      proofPendingTripCount,
      pendingStatementCount: statements.filter(
        (statement) => statement.payoutStatus === "pending",
      ).length,
      latestStatementPeriodMonth: statements[0]?.periodMonth ?? null,
      grossEarningAmount: this.sumMoney(trips.map((trip) => trip.grossEarning)),
      shareAmount: this.sumMoney(
        statements.map((statement) => statement.shareAmount),
      ),
    };
  }

  listPortalDrivers(fleetPartnerId: string): FleetPartnerPortalDriverRecord[] {
    this.requireFleetPartner(fleetPartnerId);
    const driversById = new Map(
      this.regulatoryRegistryService
        .listDrivers()
        .map((driver) => [driver.driverId, driver] as const),
    );
    const vehicleByDriverId = this.buildVehicleByDriverId();

    return this.driverAffiliations
      .filter((affiliation) => affiliation.fleetPartnerId === fleetPartnerId)
      .sort((left, right) =>
        right.effectiveFrom.localeCompare(left.effectiveFrom),
      )
      .map((affiliation) => {
        const driver = driversById.get(affiliation.driverId);
        const currentVehicle = vehicleByDriverId.get(affiliation.driverId);
        return {
          affiliationId: affiliation.affiliationId,
          driverId: affiliation.driverId,
          fleetPartnerId: affiliation.fleetPartnerId,
          driverGroupId: affiliation.driverGroupId ?? null,
          affiliationType: affiliation.affiliationType,
          effectiveFrom: affiliation.effectiveFrom,
          effectiveUntil: affiliation.effectiveUntil ?? null,
          name: driver?.name ?? affiliation.driverId,
          workState: driver?.workState ?? "offline",
          licensesValid: driver?.licensesValid ?? false,
          lifecycleStatus: driver?.lifecycleStatus ?? "draft",
          dispatchEligible: driver?.dispatchEligible ?? false,
          supportedServiceBuckets: [...(driver?.supportedServiceBuckets ?? [])],
          currentVehicleId: currentVehicle?.vehicle.vehicleId ?? null,
          currentVehiclePlateNo: currentVehicle?.vehicle.plateNo ?? null,
        };
      });
  }

  listPortalVehicles(
    fleetPartnerId: string,
  ): FleetPartnerPortalVehicleRecord[] {
    this.requireFleetPartner(fleetPartnerId);
    const activeDriverIds = new Set(
      this.driverAffiliations
        .filter((affiliation) => affiliation.fleetPartnerId === fleetPartnerId)
        .map((affiliation) => affiliation.driverId),
    );
    const driversById = new Map(
      this.regulatoryRegistryService
        .listDrivers()
        .map((driver) => [driver.driverId, driver] as const),
    );
    const vehiclesById = new Map(
      this.regulatoryRegistryService
        .listVehicles()
        .map((vehicle) => [vehicle.vehicleId, vehicle] as const),
    );

    const vehicleMap = new Map<string, FleetPartnerPortalVehicleRecord>();

    for (const pair of this.regulatoryRegistryService
      .listSupplyPairs()
      .filter((candidate) => activeDriverIds.has(candidate.driverId))) {
      const vehicle = vehiclesById.get(pair.vehicleId);
      if (!vehicle) {
        continue;
      }
      const driver = driversById.get(pair.driverId);
      const existing = vehicleMap.get(vehicle.vehicleId);
      if (existing) {
        existing.activeDriverIds.push(pair.driverId);
        existing.activeDriverNames.push(driver?.name ?? pair.driverId);
        existing.currentEtaMinutes = Math.min(
          existing.currentEtaMinutes ?? pair.etaMinutes,
          pair.etaMinutes,
        );
        continue;
      }

      vehicleMap.set(vehicle.vehicleId, {
        vehicleId: vehicle.vehicleId,
        plateNo: vehicle.plateNo,
        operatingArea: vehicle.operatingArea,
        supportedServiceBuckets: [...vehicle.supportedServiceBuckets],
        dispatchableFlag: vehicle.dispatchableFlag,
        exclusivityApproved: vehicle.exclusivityApproved,
        insuranceStatus: vehicle.insuranceStatus,
        updatedAt: vehicle.updatedAt,
        activeDriverIds: [pair.driverId],
        activeDriverNames: [driver?.name ?? pair.driverId],
        currentEtaMinutes: pair.etaMinutes,
      });
    }

    return [...vehicleMap.values()].sort((left, right) =>
      left.plateNo.localeCompare(right.plateNo),
    );
  }

  async listPortalTrips(
    fleetPartnerId: string,
    periodMonth?: string,
  ): Promise<FleetPartnerPortalTripRecord[]> {
    this.requireFleetPartner(fleetPartnerId);
    const normalizedPeriodMonth = await this.resolvePeriodMonth(periodMonth);
    const statements = await this.listFleetPartnerStatements(
      fleetPartnerId,
      normalizedPeriodMonth,
    );
    const shareAmountByOrderId = new Map<string, number>();
    for (const statement of statements) {
      for (const line of statement.lines) {
        if (!line.orderId) {
          continue;
        }
        shareAmountByOrderId.set(
          line.orderId,
          (shareAmountByOrderId.get(line.orderId) ?? 0) +
            line.shareAmount.amountMinor,
        );
      }
    }
    const trips =
      await this.billingSettlementService.listSettlementTripsForPeriodMonth(
        normalizedPeriodMonth,
      );
    const ordersById = new Map(
      this.ownedMobilityService
        .listOrders()
        .map((order) => [order.orderId, order] as const),
    );
    const driversById = new Map(
      this.regulatoryRegistryService
        .listDrivers()
        .map((driver) => [driver.driverId, driver] as const),
    );
    const vehicleByDriverId = this.buildVehicleByDriverId();

    return trips
      .filter((trip) => {
        const affiliation = this.resolveAffiliation(
          trip.driverId,
          trip.completedAt,
          fleetPartnerId,
        );
        return affiliation !== undefined;
      })
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
      .map((trip) =>
        this.toPortalTripRecord(
          fleetPartnerId,
          trip,
          ordersById.get(trip.orderId) ?? null,
          driversById.get(trip.driverId) ?? null,
          vehicleByDriverId.get(trip.driverId)?.vehicle ?? null,
          shareAmountByOrderId.get(trip.orderId) ?? null,
        ),
      );
  }

  async getPortalQualityMetrics(
    fleetPartnerId: string,
    periodMonth?: string,
  ): Promise<FleetPartnerPortalQualityMetricsRecord> {
    const normalizedPeriodMonth = await this.resolvePeriodMonth(periodMonth);
    const [drivers, vehicles, trips, statements, orders, orderDriverMap] =
      await Promise.all([
        Promise.resolve(this.listPortalDrivers(fleetPartnerId)),
        Promise.resolve(this.listPortalVehicles(fleetPartnerId)),
        this.listPortalTrips(fleetPartnerId, normalizedPeriodMonth),
        this.listFleetPartnerStatements(fleetPartnerId, normalizedPeriodMonth),
        Promise.resolve(this.ownedMobilityService.listOrders()),
        this.buildOrderDriverMap(normalizedPeriodMonth),
      ]);
    const driverIds = new Set(drivers.map((driver) => driver.driverId));

    return {
      fleetPartnerId,
      periodMonth: normalizedPeriodMonth,
      totalCompletedTrips: trips.length,
      proofPendingTripCount: orders.filter((order) =>
        this.isPartnerProofPendingOrder(order, driverIds, orderDriverMap),
      ).length,
      cancelledTripCount: orders.filter((order) =>
        this.isPartnerCancelledOrder(order, driverIds, orderDriverMap),
      ).length,
      activeDriverCount: drivers.length,
      offlineDriverCount: drivers.filter(
        (driver) => driver.workState === "offline",
      ).length,
      licenseInvalidDriverCount: drivers.filter(
        (driver) => !driver.licensesValid,
      ).length,
      nonDispatchableVehicleCount: vehicles.filter(
        (vehicle) => !vehicle.dispatchableFlag,
      ).length,
      expiredInsuranceVehicleCount: vehicles.filter(
        (vehicle) => vehicle.insuranceStatus === "expired",
      ).length,
      pendingStatementCount: statements.filter(
        (statement) => statement.payoutStatus === "pending",
      ).length,
      shareAmount: this.sumMoney(
        statements.map((statement) => statement.shareAmount),
      ),
    };
  }

  private async rebuildStatementsForPeriodMonth(
    periodMonth: string,
    fleetPartnerId?: string,
  ) {
    await this.billingSettlementService.generateDriverStatements({
      periodMonth,
    });
    const driverStatements =
      this.billingSettlementService.listDriverStatements(periodMonth);
    const trips =
      await this.billingSettlementService.listSettlementTripsForPeriodMonth(
        periodMonth,
      );
    const tripMap = new Map(trips.map((trip) => [trip.orderId, trip]));
    const nextStatements = new Map<string, FleetPartnerStatementRecord>();
    const monthlyRuleUsage = new Map<
      string,
      {
        fleetPartnerId: string;
        rule: FleetPartnerRevenueShareRuleRecord;
        sampleAffiliation: DriverFleetAffiliationRecord;
        sampleTrip: BillingSettlementTripRecord;
        tripCount: number;
      }
    >();

    for (const driverStatement of driverStatements) {
      for (const line of driverStatement.lines) {
        const trip = tripMap.get(line.orderId);
        if (!trip) {
          continue;
        }
        const affiliation = this.resolveAffiliation(
          driverStatement.driverId,
          trip.completedAt,
          fleetPartnerId,
        );
        if (!affiliation) {
          continue;
        }
        const match = this.matchRevenueShareRule(affiliation, trip);
        if (!match) {
          continue;
        }

        if (
          match.rule.formula === "monthly_fixed" ||
          match.rule.formula === "tiered_bonus"
        ) {
          const monthlyKey = `${periodMonth}:${affiliation.fleetPartnerId}:${match.rule.ruleId}`;
          const existingUsage = monthlyRuleUsage.get(monthlyKey);
          monthlyRuleUsage.set(monthlyKey, {
            fleetPartnerId: affiliation.fleetPartnerId,
            rule: match.rule,
            sampleAffiliation: affiliation,
            sampleTrip: trip,
            tripCount: (existingUsage?.tripCount ?? 0) + 1,
          });
          this.ensureStatement(
            nextStatements,
            affiliation.fleetPartnerId,
            periodMonth,
          );
          continue;
        }

        const shareAmountMinor = this.calculateLineShareAmountMinor(
          match.rule,
          line,
        );
        if (shareAmountMinor <= 0) {
          continue;
        }

        this.pushLineItem(
          nextStatements,
          affiliation,
          trip,
          driverStatement,
          match.rule,
          {
            orderId: line.orderId,
            grossEarning: { ...line.grossEarning },
            driverNetAmount: { ...line.netAmount },
            completedAt: trip.completedAt,
            shareAmountMinor,
          },
        );
      }
    }

    for (const usage of monthlyRuleUsage.values()) {
      const shareAmountMinor = this.calculateMonthlyRuleShareAmountMinor(
        usage.rule,
        usage.tripCount,
      );
      if (shareAmountMinor <= 0) {
        continue;
      }
      this.pushLineItem(
        nextStatements,
        usage.sampleAffiliation,
        usage.sampleTrip,
        null,
        usage.rule,
        {
          orderId: null,
          grossEarning: null,
          driverNetAmount: null,
          completedAt: null,
          shareAmountMinor,
        },
      );
    }

    const rebuiltStatements = [...nextStatements.values()]
      .filter((statement) => statement.lines.length > 0)
      .sort((left, right) =>
        left.fleetPartnerId.localeCompare(right.fleetPartnerId),
      );

    this.statements = [
      ...this.statements.filter(
        (statement) =>
          statement.periodMonth !== periodMonth ||
          (fleetPartnerId !== undefined &&
            statement.fleetPartnerId !== fleetPartnerId),
      ),
      ...rebuiltStatements,
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    if (!this.fleetPartnerRepository) {
      return;
    }

    try {
      await this.fleetPartnerRepository.replaceStatementsForPeriodMonth(
        periodMonth,
        rebuiltStatements.map((statement) => this.cloneStatement(statement)),
        fleetPartnerId,
      );
    } catch (error) {
      this.fleetPartnerRepository.reportPersistenceFailure(
        error,
        "rebuild fleet partner statements",
      );
    }
  }

  private ensureStatement(
    bucket: Map<string, FleetPartnerStatementRecord>,
    fleetPartnerId: string,
    periodMonth: string,
  ) {
    const key = `${fleetPartnerId}:${periodMonth}`;
    const existing = bucket.get(key);
    if (existing) {
      return existing;
    }

    const timestamp = new Date().toISOString();
    const statement: FleetPartnerStatementRecord = {
      statementId: `fleet-statement-${fleetPartnerId}-${periodMonth}`,
      fleetPartnerId,
      periodMonth,
      payoutStatus: "pending",
      grossEarningBasis: this.money(0),
      driverNetAmountBasis: this.money(0),
      shareAmount: this.money(0),
      sponsorFundedTripCount: 0,
      sponsorFundedGrossEarningBasis: this.money(0),
      sponsorFundedShareAmount: this.money(0),
      reimbursementAmount: this.money(0),
      lines: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    bucket.set(key, statement);
    return statement;
  }

  private pushLineItem(
    bucket: Map<string, FleetPartnerStatementRecord>,
    affiliation: DriverFleetAffiliationRecord,
    trip: BillingSettlementTripRecord,
    driverStatement: DriverStatementRecord | null,
    rule: FleetPartnerRevenueShareRuleRecord,
    input: {
      orderId: string | null;
      grossEarning: FleetPartnerStatementLineRecord["grossEarning"];
      driverNetAmount: FleetPartnerStatementLineRecord["driverNetAmount"];
      completedAt: string | null;
      shareAmountMinor: number;
    },
  ) {
    const settlementChannelKey = settlementChannelKeyForTrip({
      orderSource: trip.orderSource,
      businessDispatchSubtype: trip.businessDispatchSubtype,
      partnerId: trip.partnerId,
    });
    const sponsorFunded =
      input.orderId !== null && settlementChannelKey === "partner_airport";
    const statement = this.ensureStatement(
      bucket,
      affiliation.fleetPartnerId,
      this.toPeriodMonth(trip.completedAt),
    );
    const line: FleetPartnerStatementLineRecord = {
      lineId: `fleet-statement-line-${randomUUID()}`,
      ruleId: rule.ruleId,
      formula: rule.formula,
      orderId: input.orderId,
      driverId: driverStatement?.driverId ?? trip.driverId,
      affiliationId: affiliation.affiliationId,
      grossEarning: input.grossEarning ? { ...input.grossEarning } : null,
      driverNetAmount: input.driverNetAmount
        ? { ...input.driverNetAmount }
        : null,
      shareAmount: this.money(input.shareAmountMinor),
      completedAt: input.completedAt,
      metadata: {
        appliesTo: rule.appliesTo,
        serviceProduct: trip.serviceProduct ?? null,
        tenantServiceProgramId: trip.tenantServiceProgramId ?? null,
        sourcePlatform: trip.sourcePlatform ?? trip.orderSource,
        driverGroupId: affiliation.driverGroupId ?? null,
        orderSource: trip.orderSource,
        settlementChannelKey,
        sponsorFunded,
        partnerId: trip.partnerId ?? null,
        partnerProgramId: trip.partnerProgramId ?? null,
        benefitReference: sponsorFunded ? trip.benefitReference : null,
        issuerAuthorizationRef: sponsorFunded
          ? trip.issuerAuthorizationRef
          : null,
        reimbursementAmount:
          sponsorFunded && trip.platformFundedDiscount.amountMinor > 0
            ? { ...trip.platformFundedDiscount }
            : null,
      },
    };
    statement.lines.push(line);
    if (line.grossEarning) {
      statement.grossEarningBasis.amountMinor += line.grossEarning.amountMinor;
    }
    if (line.driverNetAmount) {
      statement.driverNetAmountBasis.amountMinor +=
        line.driverNetAmount.amountMinor;
    }
    statement.shareAmount.amountMinor += line.shareAmount.amountMinor;
    statement.updatedAt = new Date().toISOString();
  }

  private resolveAffiliation(
    driverId: string,
    completedAt: string,
    fleetPartnerId?: string,
  ) {
    return this.driverAffiliations
      .filter((affiliation) => {
        if (affiliation.driverId !== driverId) {
          return false;
        }
        if (
          fleetPartnerId !== undefined &&
          affiliation.fleetPartnerId !== fleetPartnerId
        ) {
          return false;
        }
        if (affiliation.effectiveFrom > completedAt) {
          return false;
        }
        if (
          affiliation.effectiveUntil &&
          affiliation.effectiveUntil < completedAt
        ) {
          return false;
        }
        return true;
      })
      .sort((left, right) =>
        right.effectiveFrom.localeCompare(left.effectiveFrom),
      )[0];
  }

  private matchRevenueShareRule(
    affiliation: DriverFleetAffiliationRecord,
    trip: BillingSettlementTripRecord,
  ): StatementRuleMatch | null {
    const candidateRules = this.revenueShareRules
      .filter((rule) => {
        if (rule.fleetPartnerId !== affiliation.fleetPartnerId) {
          return false;
        }
        if (rule.effectiveFrom > trip.completedAt) {
          return false;
        }
        if (rule.effectiveUntil && rule.effectiveUntil < trip.completedAt) {
          return false;
        }
        const affinityScore = this.getRuleAffinityScore(
          rule,
          affiliation,
          trip,
        );
        return affinityScore >= 0;
      })
      .map((rule) => ({
        rule,
        affinityScore: this.getRuleAffinityScore(rule, affiliation, trip),
      }))
      .sort((left, right) => {
        if (right.affinityScore !== left.affinityScore) {
          return right.affinityScore - left.affinityScore;
        }
        return right.rule.effectiveFrom.localeCompare(left.rule.effectiveFrom);
      });

    return candidateRules[0] ?? null;
  }

  private getRuleAffinityScore(
    rule: FleetPartnerRevenueShareRuleRecord,
    affiliation: DriverFleetAffiliationRecord,
    trip: BillingSettlementTripRecord,
  ) {
    switch (rule.appliesTo) {
      case "all_trips":
        return 0;
      case "platform_source":
        return rule.sourcePlatform &&
          rule.sourcePlatform === (trip.sourcePlatform ?? trip.orderSource)
          ? 4
          : -1;
      case "service_product":
        return rule.serviceProduct &&
          rule.serviceProduct === (trip.serviceProduct ?? null)
          ? 3
          : -1;
      case "tenant_program":
        return rule.tenantServiceProgramId &&
          rule.tenantServiceProgramId === (trip.tenantServiceProgramId ?? null)
          ? 2
          : -1;
      case "driver_group":
        return rule.driverGroupId &&
          rule.driverGroupId === (affiliation.driverGroupId ?? null)
          ? 1
          : -1;
      default:
        return -1;
    }
  }

  private calculateLineShareAmountMinor(
    rule: FleetPartnerRevenueShareRuleRecord,
    line: DriverStatementRecord["lines"][number],
  ) {
    switch (rule.formula) {
      case "percent_of_gross":
        return Math.round(
          (line.grossEarning.amountMinor * (rule.rateBps ?? 0)) / 10000,
        );
      case "fixed_per_trip":
        return rule.fixedAmountMinor ?? 0;
      case "monthly_fixed":
      case "tiered_bonus":
        return 0;
      default:
        return 0;
    }
  }

  private calculateMonthlyRuleShareAmountMinor(
    rule: FleetPartnerRevenueShareRuleRecord,
    tripCount: number,
  ) {
    switch (rule.formula) {
      case "monthly_fixed":
        return rule.fixedAmountMinor ?? 0;
      case "tiered_bonus":
        return tripCount >= (rule.rateBps ?? 1)
          ? (rule.fixedAmountMinor ?? 0)
          : 0;
      default:
        return 0;
    }
  }

  private validateRevenueShareRuleInput(
    command: Pick<
      FleetPartnerRevenueShareRuleRecord,
      | "appliesTo"
      | "formula"
      | "effectiveFrom"
      | "effectiveUntil"
      | "rateBps"
      | "fixedAmountMinor"
      | "serviceProduct"
      | "tenantServiceProgramId"
      | "sourcePlatform"
      | "driverGroupId"
    >,
  ) {
    this.assertIsoDate(command.effectiveFrom, "effectiveFrom");
    if (command.effectiveUntil) {
      this.assertIsoDate(command.effectiveUntil, "effectiveUntil");
    }
    if (
      command.formula === "percent_of_gross" &&
      (command.rateBps === null || command.rateBps === undefined)
    ) {
      throw this.badRequest(
        "RATE_BPS_REQUIRED",
        "rateBps is required for percent_of_gross rules.",
      );
    }
    if (
      (command.formula === "fixed_per_trip" ||
        command.formula === "monthly_fixed" ||
        command.formula === "tiered_bonus") &&
      (command.fixedAmountMinor === null ||
        command.fixedAmountMinor === undefined)
    ) {
      throw this.badRequest(
        "FIXED_AMOUNT_REQUIRED",
        "fixedAmountMinor is required for fixed-per-trip, monthly-fixed, and tiered-bonus rules.",
      );
    }
    if (
      command.appliesTo === "service_product" &&
      !command.serviceProduct?.trim()
    ) {
      throw this.badRequest(
        "SERVICE_PRODUCT_REQUIRED",
        "serviceProduct is required when appliesTo is service_product.",
      );
    }
    if (
      command.appliesTo === "tenant_program" &&
      !command.tenantServiceProgramId?.trim()
    ) {
      throw this.badRequest(
        "TENANT_PROGRAM_REQUIRED",
        "tenantServiceProgramId is required when appliesTo is tenant_program.",
      );
    }
    if (
      command.appliesTo === "platform_source" &&
      !command.sourcePlatform?.trim()
    ) {
      throw this.badRequest(
        "SOURCE_PLATFORM_REQUIRED",
        "sourcePlatform is required when appliesTo is platform_source.",
      );
    }
    if (
      command.appliesTo === "driver_group" &&
      !command.driverGroupId?.trim()
    ) {
      throw this.badRequest(
        "DRIVER_GROUP_REQUIRED",
        "driverGroupId is required when appliesTo is driver_group.",
      );
    }
  }

  private requireFleetPartner(fleetPartnerId: string) {
    const partner = this.fleetPartners.find(
      (candidate) => candidate.fleetPartnerId === fleetPartnerId,
    );
    if (!partner) {
      throw this.notFound("Fleet partner not found.", { fleetPartnerId });
    }
    return partner;
  }

  private requireRevenueShareRule(fleetPartnerId: string, ruleId: string) {
    this.requireFleetPartner(fleetPartnerId);
    const rule = this.revenueShareRules.find(
      (candidate) =>
        candidate.fleetPartnerId === fleetPartnerId &&
        candidate.ruleId === ruleId,
    );
    if (!rule) {
      throw this.notFound("Revenue share rule not found.", {
        fleetPartnerId,
        ruleId,
      });
    }
    return rule;
  }

  private async persistChanges(
    changes: PersistFleetPartnerChanges,
    context: string,
  ) {
    if (!this.fleetPartnerRepository) {
      return;
    }

    try {
      await this.fleetPartnerRepository.persistChanges(changes);
    } catch (error) {
      this.fleetPartnerRepository.reportPersistenceFailure(error, context);
    }
  }

  private cloneFleetPartner(partner: FleetPartnerRecord): FleetPartnerRecord {
    return { ...partner };
  }

  private cloneAffiliation(
    affiliation: DriverFleetAffiliationRecord,
  ): DriverFleetAffiliationRecord {
    return { ...affiliation };
  }

  private cloneRevenueShareRule(
    rule: FleetPartnerRevenueShareRuleRecord,
  ): FleetPartnerRevenueShareRuleRecord {
    return { ...rule };
  }

  private cloneStatement(
    statement: FleetPartnerStatementRecord,
  ): FleetPartnerStatementRecord {
    const lines = statement.lines.map((line) => ({
      ...line,
      grossEarning: line.grossEarning ? { ...line.grossEarning } : null,
      driverNetAmount: line.driverNetAmount
        ? { ...line.driverNetAmount }
        : null,
      shareAmount: { ...line.shareAmount },
      metadata: {
        ...line.metadata,
        settlementChannelKey:
          line.metadata.settlementChannelKey ??
          settlementChannelKeyForTrip({
            orderSource: line.metadata.orderSource,
            businessDispatchSubtype: line.metadata.serviceProduct,
            partnerId: line.metadata.partnerId ?? null,
          }),
        sponsorFunded: line.metadata.sponsorFunded ?? false,
        partnerId: line.metadata.partnerId ?? null,
        partnerProgramId: line.metadata.partnerProgramId ?? null,
        benefitReference: line.metadata.benefitReference ?? null,
        issuerAuthorizationRef: line.metadata.issuerAuthorizationRef ?? null,
        reimbursementAmount: line.metadata.reimbursementAmount
          ? { ...line.metadata.reimbursementAmount }
          : null,
      },
    }));
    return this.withStatementAttributionSummary({
      ...statement,
      grossEarningBasis: { ...statement.grossEarningBasis },
      driverNetAmountBasis: { ...statement.driverNetAmountBasis },
      shareAmount: { ...statement.shareAmount },
      sponsorFundedTripCount: statement.sponsorFundedTripCount ?? 0,
      sponsorFundedGrossEarningBasis: statement.sponsorFundedGrossEarningBasis
        ? { ...statement.sponsorFundedGrossEarningBasis }
        : this.money(0),
      sponsorFundedShareAmount: statement.sponsorFundedShareAmount
        ? { ...statement.sponsorFundedShareAmount }
        : this.money(0),
      reimbursementAmount: statement.reimbursementAmount
        ? { ...statement.reimbursementAmount }
        : this.money(0),
      lines,
    });
  }

  private money(amountMinor: number) {
    return {
      currency: DEFAULT_CURRENCY,
      amountMinor,
    };
  }

  private async resolvePeriodMonth(periodMonth?: string) {
    if (periodMonth?.trim()) {
      return periodMonth.trim();
    }
    const cursor = new Date();
    cursor.setUTCDate(1);
    for (let index = 0; index < 12; index += 1) {
      const candidate = cursor.toISOString().slice(0, 7);
      const trips =
        await this.billingSettlementService.listSettlementTripsForPeriodMonth(
          candidate,
        );
      if (trips.length > 0) {
        return candidate;
      }
      cursor.setUTCMonth(cursor.getUTCMonth() - 1);
    }

    return new Date().toISOString().slice(0, 7);
  }

  private buildVehicleByDriverId() {
    const vehiclesById = new Map(
      this.regulatoryRegistryService
        .listVehicles()
        .map((vehicle) => [vehicle.vehicleId, vehicle] as const),
    );
    return new Map(
      this.regulatoryRegistryService
        .listSupplyPairs()
        .map((pair) => {
          const vehicle = vehiclesById.get(pair.vehicleId);
          if (!vehicle) {
            return null;
          }
          return [
            pair.driverId,
            { vehicle, etaMinutes: pair.etaMinutes },
          ] as const;
        })
        .filter(
          (
            entry,
          ): entry is readonly [
            string,
            { vehicle: VehicleRegistryRecord; etaMinutes: number },
          ] => entry !== null,
        ),
    );
  }

  private toPortalTripRecord(
    fleetPartnerId: string,
    trip: BillingSettlementTripRecord,
    order: OwnedOrderRecord | null,
    driver: DriverRegistryRecord | null,
    vehicle: VehicleRegistryRecord | null,
    fleetShareAmountMinor: number | null,
  ): FleetPartnerPortalTripRecord {
    const settlementChannelKey = settlementChannelKeyForTrip({
      orderSource: trip.orderSource,
      businessDispatchSubtype: trip.businessDispatchSubtype,
      partnerId: trip.partnerId,
    });
    const sponsorFunded = settlementChannelKey === "partner_airport";
    return {
      orderId: trip.orderId,
      fleetPartnerId,
      driverId: trip.driverId,
      driverName: driver?.name ?? null,
      vehicleId: vehicle?.vehicleId ?? null,
      vehiclePlateNo: vehicle?.plateNo ?? null,
      status: order?.status ?? "completed",
      completedAt: trip.completedAt,
      orderSource: trip.orderSource,
      businessDispatchSubtype: trip.businessDispatchSubtype,
      grossEarning: { ...trip.grossEarning },
      subsidy: { ...trip.subsidy },
      serviceProduct: trip.serviceProduct ?? null,
      tenantServiceProgramId: trip.tenantServiceProgramId ?? null,
      sourcePlatform: trip.sourcePlatform ?? null,
      fleetShareAmount:
        fleetShareAmountMinor === null
          ? null
          : this.money(fleetShareAmountMinor),
      settlementChannelKey,
      sponsorFunded,
      partnerId: trip.partnerId ?? null,
      partnerProgramId: trip.partnerProgramId ?? null,
      benefitReference: sponsorFunded ? trip.benefitReference : null,
      issuerAuthorizationRef: sponsorFunded
        ? trip.issuerAuthorizationRef
        : null,
      reimbursementAmount:
        sponsorFunded && trip.platformFundedDiscount.amountMinor > 0
          ? { ...trip.platformFundedDiscount }
          : null,
      passengerName: order?.passenger.name ?? null,
      pickupAddress: order?.pickup.address ?? null,
      dropoffAddress: order?.dropoff.address ?? null,
      reservationWindowStart: order?.reservationWindowStart ?? null,
      reservationWindowEnd: order?.reservationWindowEnd ?? null,
    };
  }

  private isPartnerInFlightOrder(
    order: OwnedOrderRecord,
    driverIds: ReadonlySet<string>,
    orderDriverMap: ReadonlyMap<string, string>,
  ) {
    return (
      driverIds.has(orderDriverMap.get(order.orderId) ?? "") &&
      [
        "assigned",
        "driver_accepted",
        "enroute_pickup",
        "arrived_pickup",
        "on_trip",
      ].includes(order.status)
    );
  }

  private isPartnerProofPendingOrder(
    order: OwnedOrderRecord,
    driverIds: ReadonlySet<string>,
    orderDriverMap: ReadonlyMap<string, string>,
  ) {
    return (
      driverIds.has(orderDriverMap.get(order.orderId) ?? "") &&
      order.status === "proof_pending"
    );
  }

  private isPartnerCancelledOrder(
    order: OwnedOrderRecord,
    driverIds: ReadonlySet<string>,
    orderDriverMap: ReadonlyMap<string, string>,
  ) {
    return (
      driverIds.has(orderDriverMap.get(order.orderId) ?? "") &&
      order.status === "cancelled"
    );
  }

  private withStatementAttributionSummary(
    statement: FleetPartnerStatementRecord,
  ): FleetPartnerStatementRecord {
    const tripOrderIds = new Set<string>();
    let sponsorFundedTripCount = 0;
    let sponsorFundedGrossEarningMinor = 0;
    let reimbursementAmountMinor = 0;
    let sponsorFundedShareAmountMinor = 0;

    for (const line of statement.lines) {
      if (line.metadata.sponsorFunded) {
        sponsorFundedShareAmountMinor += line.shareAmount.amountMinor;
      }
      if (
        !line.orderId ||
        !line.metadata.sponsorFunded ||
        tripOrderIds.has(line.orderId)
      ) {
        continue;
      }
      tripOrderIds.add(line.orderId);
      sponsorFundedTripCount += 1;
      sponsorFundedGrossEarningMinor += line.grossEarning?.amountMinor ?? 0;
      reimbursementAmountMinor +=
        line.metadata.reimbursementAmount?.amountMinor ?? 0;
    }

    return {
      ...statement,
      sponsorFundedTripCount,
      sponsorFundedGrossEarningBasis: this.money(
        sponsorFundedGrossEarningMinor,
      ),
      sponsorFundedShareAmount: this.money(sponsorFundedShareAmountMinor),
      reimbursementAmount: this.money(reimbursementAmountMinor),
    };
  }

  private async buildOrderDriverMap(periodMonth: string) {
    const entries = new Map<string, string>();
    const tasks = this.ownedMobilityService.listDriverTasks();
    for (const task of tasks) {
      entries.set(task.orderId, task.driverId);
    }
    const trips =
      await this.billingSettlementService.listSettlementTripsForPeriodMonth(
        periodMonth,
      );
    for (const trip of trips) {
      entries.set(trip.orderId, trip.driverId);
    }
    return entries;
  }

  private sumMoney(
    amounts: ReadonlyArray<{ currency: string; amountMinor: number }>,
  ) {
    return amounts.reduce(
      (total, amount) => ({
        currency: amount.currency,
        amountMinor: total.amountMinor + amount.amountMinor,
      }),
      this.money(0),
    );
  }

  private toPeriodMonth(value: string) {
    return value.slice(0, 7);
  }

  private assertNonBlank(value: string, field: string) {
    if (!value?.trim()) {
      throw this.badRequest(
        "INVALID_ARGUMENT",
        `${field} must be a non-empty string.`,
        { field },
      );
    }
  }

  private assertIsoDate(value: string, field: string) {
    if (!value || Number.isNaN(Date.parse(value))) {
      throw this.badRequest(
        "INVALID_ARGUMENT",
        `${field} must be a valid ISO-8601 datetime string.`,
        { field },
      );
    }
  }

  private badRequest(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    return new ApiRequestError(HttpStatus.BAD_REQUEST, code, message, details);
  }

  private notFound(message: string, details?: Record<string, unknown>) {
    return new ApiRequestError(
      HttpStatus.NOT_FOUND,
      "NOT_FOUND",
      message,
      details,
    );
  }
}
