import { randomUUID } from "node:crypto";

import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from "@nestjs/common";

import type {
  BindTeslaVehicleCommand,
  CommandReceipt,
  ConfigureTeslaTelemetryCommand,
  IssueTeslaCommandCommand,
  Phase2SourceMetadata,
  TeslaBeginOAuthCommand,
  TeslaDiscoveredVehicle,
  TeslaOAuthConnectionRecord,
  TeslaPairVirtualKeyCommand,
  TeslaPublicTelemetrySample,
  TeslaRefreshOAuthCommand,
  TeslaRemoteCommandType,
  TeslaRevokeOAuthCommand,
  TeslaTelemetryStatusRecord,
  TeslaVehicleBindingRecord,
  TeslaVehicleStateSnapshot,
  TeslaVirtualKeyRecord,
} from "@drts/contracts";
import { TESLA_FLEET_REGIONS } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { TeslaIntegrationRepository } from "./tesla-integration.repository";

const ALLOWLISTED_COMMANDS = new Set<TeslaRemoteCommandType>([
  "wake_up",
  "honk_horn",
  "flash_lights",
  "door_lock",
  "door_unlock",
  "set_charge_limit",
  "charge_start",
  "charge_stop",
]);

type DiscoveredVehicleSeed = {
  businessAccountId: string;
  vehicle: TeslaDiscoveredVehicle;
};

@Injectable()
export class TeslaIntegrationService implements OnModuleInit {
  private readonly logger = new Logger(TeslaIntegrationService.name);

  private readonly oauthConnections = new Map<string, TeslaOAuthConnectionRecord>();
  private readonly discoveredVehiclesByVin = new Map<string, TeslaDiscoveredVehicle>();
  private readonly discoveredVehicleOwners = new Map<string, string>();
  private readonly bindingsByVehicleId = new Map<string, TeslaVehicleBindingRecord>();
  private readonly virtualKeysByVehicleId = new Map<string, TeslaVirtualKeyRecord>();
  private readonly telemetryByVehicleId = new Map<string, TeslaTelemetryStatusRecord>();
  private readonly publicSamplesByVehicleId = new Map<
    string,
    TeslaPublicTelemetrySample
  >();
  private readonly snapshotsByVehicleId = new Map<string, TeslaVehicleStateSnapshot>();
  private readonly receiptsByCommandId = new Map<string, CommandReceipt>();
  private readonly receiptsByIdempotencyKey = new Map<string, CommandReceipt>();

  constructor(
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
    @Optional()
    private readonly regulatoryRegistryService?: RegulatoryRegistryService,
    @Optional()
    private readonly repository?: TeslaIntegrationRepository,
  ) {
    for (const seed of this.buildDiscoveredVehicleSeeds()) {
      this.discoveredVehiclesByVin.set(seed.vehicle.vin, seed.vehicle);
      this.discoveredVehicleOwners.set(seed.vehicle.vin, seed.businessAccountId);
    }
  }

  async onModuleInit() {
    if (!this.repository) {
      return;
    }

    try {
      const receipts = await this.repository.loadCommandReceipts();
      for (const receipt of receipts) {
        this.receiptsByCommandId.set(receipt.commandId, receipt);
        this.receiptsByIdempotencyKey.set(receipt.idempotencyKey, receipt);
      }
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  listRegions() {
    return [...TESLA_FLEET_REGIONS];
  }

  beginOAuth(command: TeslaBeginOAuthCommand, requestId?: string) {
    const now = new Date().toISOString();
    const scopes = command.scopes?.length
      ? [...new Set(command.scopes.map((scope) => scope.trim()).filter(Boolean))]
      : ["vehicle_device_data", "vehicle_cmds", "offline_access"];

    if (!command.businessAccountId.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TESLA_BUSINESS_ACCOUNT_REQUIRED",
        "businessAccountId is required.",
      );
    }

    if (!command.authorizationCode.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TESLA_AUTHORIZATION_CODE_REQUIRED",
        "authorizationCode is required.",
      );
    }

    const record: TeslaOAuthConnectionRecord = {
      connectionId: `tesla-conn-${randomUUID()}`,
      businessAccountId: command.businessAccountId.trim(),
      region: command.region,
      scopes,
      status: "active",
      authorizedAt: now,
      accessTokenExpiresAt: new Date(
        Date.now() + 1000 * 60 * 60,
      ).toISOString(),
      refreshTokenExpiresAt: new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 30,
      ).toISOString(),
      lastRefreshedAt: null,
      revokedAt: null,
      source: this.buildSourceMetadata("tesla_fleet_api", command.businessAccountId),
    };

    this.oauthConnections.set(record.connectionId, record);
    this.recordAudit(
      "oauth_connected",
      "tesla_oauth_connection",
      record.connectionId,
      {
        businessAccountId: record.businessAccountId,
        region: record.region,
        scopes: record.scopes,
      },
      requestId,
    );

    return record;
  }

  refreshOAuth(command: TeslaRefreshOAuthCommand, requestId?: string) {
    const current = this.requireOAuthConnection(command.connectionId);
    if (current.status !== "active") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "TESLA_OAUTH_CONNECTION_INACTIVE",
        "Only active OAuth connections can be refreshed.",
      );
    }

    const refreshed: TeslaOAuthConnectionRecord = {
      ...current,
      accessTokenExpiresAt: new Date(
        Date.now() + 1000 * 60 * 60,
      ).toISOString(),
      refreshTokenExpiresAt: new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 30,
      ).toISOString(),
      lastRefreshedAt: new Date().toISOString(),
      source: this.buildSourceMetadata(
        "tesla_fleet_api",
        current.businessAccountId,
      ),
    };

    this.oauthConnections.set(refreshed.connectionId, refreshed);
    this.recordAudit(
      "oauth_refreshed",
      "tesla_oauth_connection",
      refreshed.connectionId,
      {
        reason: command.reason ?? null,
      },
      requestId,
    );

    return refreshed;
  }

  revokeOAuth(command: TeslaRevokeOAuthCommand, requestId?: string) {
    const current = this.requireOAuthConnection(command.connectionId);
    const revokedAt = new Date().toISOString();
    const revoked: TeslaOAuthConnectionRecord = {
      ...current,
      status: "revoked",
      revokedAt,
    };

    this.oauthConnections.set(revoked.connectionId, revoked);
    this.recordAudit(
      "oauth_revoked",
      "tesla_oauth_connection",
      revoked.connectionId,
      {
        reason: command.reason ?? null,
      },
      requestId,
    );

    return revoked;
  }

  discoverVehicles() {
    const activeAccountIds = new Set(
      [...this.oauthConnections.values()]
        .filter((connection) => connection.status === "active")
        .map((connection) => connection.businessAccountId),
    );

    return [...this.discoveredVehiclesByVin.values()]
      .filter((vehicle) =>
        activeAccountIds.has(this.discoveredVehicleOwners.get(vehicle.vin) ?? ""),
      )
      .map((vehicle) => ({ ...vehicle, source: { ...vehicle.source } }));
  }

  listBindings() {
    return [...this.bindingsByVehicleId.values()].map((binding) => ({
      ...binding,
      source: { ...binding.source },
    }));
  }

  bindVehicle(command: BindTeslaVehicleCommand, requestId?: string) {
    const vehicleId = command.vehicleId.trim();
    const vin = command.vin.trim().toUpperCase();
    this.requireKnownVehicle(vehicleId);

    const discoveredVehicle = this.discoveredVehiclesByVin.get(vin);
    if (!discoveredVehicle) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TESLA_VIN_NOT_DISCOVERED",
        `VIN '${vin}' has not been discovered from Tesla Fleet yet.`,
      );
    }

    const binding: TeslaVehicleBindingRecord = {
      bindingId: `tesla-bind-${randomUUID()}`,
      vehicleId,
      vin,
      externalVehicleRef: discoveredVehicle.externalVehicleRef,
      connectionId: discoveredVehicle.connectionId,
      region: discoveredVehicle.region,
      boundAt: new Date().toISOString(),
      lastDiscoveredAt: discoveredVehicle.lastSeenAt,
      source: this.buildSourceMetadata("tesla_fleet_api", vin),
    };

    this.bindingsByVehicleId.set(vehicleId, binding);
    this.recordAudit(
      "vehicle_bound",
      "tesla_vehicle_binding",
      binding.bindingId,
      {
        vehicleId,
        vin,
        externalVehicleRef: binding.externalVehicleRef,
      },
      requestId,
    );

    return binding;
  }

  pairVirtualKey(command: TeslaPairVirtualKeyCommand, requestId?: string) {
    const binding = this.requireBinding(command.vehicleId);
    const now = new Date().toISOString();
    const record: TeslaVirtualKeyRecord = {
      vehicleId: binding.vehicleId,
      externalVehicleRef: binding.externalVehicleRef,
      status: "paired",
      requestedAt: now,
      pairedAt: now,
      revokedAt: null,
      requestedBy: command.requestedBy.trim(),
      publicKeyHint: `vk-${binding.vehicleId.slice(-6)}`,
      source: this.buildSourceMetadata(
        "tesla_fleet_api",
        binding.externalVehicleRef,
      ),
    };

    this.virtualKeysByVehicleId.set(binding.vehicleId, record);
    this.recordAudit(
      "virtual_key_paired",
      "tesla_virtual_key",
      binding.vehicleId,
      {
        requestedBy: record.requestedBy,
        externalVehicleRef: record.externalVehicleRef,
      },
      requestId,
    );

    return record;
  }

  getVirtualKeyStatus(vehicleId: string) {
    const binding = this.requireBinding(vehicleId);
    const record = this.virtualKeysByVehicleId.get(binding.vehicleId);
    if (!record) {
      return {
        vehicleId: binding.vehicleId,
        externalVehicleRef: binding.externalVehicleRef,
        status: "unpaired" as const,
        requestedAt: null,
        pairedAt: null,
        revokedAt: null,
        requestedBy: null,
        publicKeyHint: null,
      };
    }

    return {
      ...record,
      source: { ...record.source },
    };
  }

  configureTelemetry(
    command: ConfigureTeslaTelemetryCommand,
    requestId?: string,
  ) {
    if (command.sampleIntervalSec < 5 || command.sampleIntervalSec > 300) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TESLA_TELEMETRY_INTERVAL_INVALID",
        "sampleIntervalSec must be between 5 and 300 seconds.",
      );
    }

    const binding = this.requireBinding(command.vehicleId);
    const now = new Date().toISOString();
    const sample = this.buildMockPublicSample(binding, command);
    const projection = this.projectTelemetry(binding, sample);

    const status: TeslaTelemetryStatusRecord = {
      vehicleId: binding.vehicleId,
      externalVehicleRef: binding.externalVehicleRef,
      mode: command.mode,
      sampleIntervalSec: command.sampleIntervalSec,
      enabled: true,
      configuredAt: now,
      lastSyncAt: sample.capturedAt,
      lastProjectionAt: projection.capturedAt,
      lastPublicSampleId: sample.sampleId,
      health: "ok",
      source: this.buildSourceMetadata(
        command.mode === "public_mock"
          ? "tesla_public_telemetry"
          : "tesla_fleet_api",
        binding.externalVehicleRef,
      ),
    };

    this.publicSamplesByVehicleId.set(binding.vehicleId, sample);
    this.snapshotsByVehicleId.set(binding.vehicleId, projection);
    this.telemetryByVehicleId.set(binding.vehicleId, status);

    this.recordAudit(
      "telemetry_configured",
      "tesla_telemetry_config",
      binding.vehicleId,
      {
        mode: status.mode,
        sampleIntervalSec: status.sampleIntervalSec,
        lastPublicSampleId: status.lastPublicSampleId,
      },
      requestId,
    );

    return status;
  }

  getTelemetryStatus(vehicleId: string) {
    const status = this.telemetryByVehicleId.get(vehicleId.trim());
    if (!status) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TESLA_TELEMETRY_NOT_CONFIGURED",
        `Telemetry is not configured for vehicle '${vehicleId}'.`,
      );
    }

    return {
      ...status,
      source: { ...status.source },
    };
  }

  getPublicTelemetrySample(vehicleId: string) {
    const sample = this.publicSamplesByVehicleId.get(vehicleId.trim());
    if (!sample) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TESLA_PUBLIC_SAMPLE_NOT_AVAILABLE",
        `No Tesla public telemetry sample exists for vehicle '${vehicleId}'.`,
      );
    }

    return {
      ...sample,
      source: { ...sample.source },
      location: sample.location ? { ...sample.location } : null,
    };
  }

  getTelemetryProjection(vehicleId: string) {
    const snapshot = this.snapshotsByVehicleId.get(vehicleId.trim());
    if (!snapshot) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TESLA_TELEMETRY_PROJECTION_NOT_AVAILABLE",
        `No telemetry projection exists for vehicle '${vehicleId}'.`,
      );
    }

    return {
      ...snapshot,
      source: { ...snapshot.source },
      location: snapshot.location ? { ...snapshot.location } : null,
    };
  }

  async issueCommand(
    command: IssueTeslaCommandCommand,
    requestId?: string,
  ): Promise<CommandReceipt> {
    const binding = this.requireBinding(command.vehicleId);
    const commandType = command.commandType;

    if (!ALLOWLISTED_COMMANDS.has(commandType)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TESLA_COMMAND_NOT_ALLOWLISTED",
        `Command '${commandType}' is not allowlisted for the non-driving broker.`,
        {
          allowedCommandTypes: [...ALLOWLISTED_COMMANDS],
          rejectedCommandType: commandType,
        },
      );
    }

    const idempotencyKey =
      command.idempotencyKey?.trim() || `tesla-cmd-${binding.vehicleId}-${commandType}`;
    const existing = this.receiptsByIdempotencyKey.get(idempotencyKey);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const receipt: CommandReceipt = {
      commandId: `tesla-cmd-${randomUUID()}`,
      idempotencyKey,
      vehicleId: binding.vehicleId,
      commandType,
      status: "acknowledged",
      issuedBy: command.issuedBy.trim(),
      issuedAt: now,
      acknowledgedAt: now,
      providerRef: `mock-${binding.externalVehicleRef}-${commandType}`,
      failureReasonCode: null,
      source: this.buildSourceMetadata(
        "tesla_fleet_api",
        binding.externalVehicleRef,
      ),
    };

    this.receiptsByCommandId.set(receipt.commandId, receipt);
    this.receiptsByIdempotencyKey.set(receipt.idempotencyKey, receipt);
    await this.persistReceipt(receipt);
    this.recordAudit(
      "command_issued",
      "tesla_command_receipt",
      receipt.commandId,
      {
        vehicleId: receipt.vehicleId,
        commandType: receipt.commandType,
        providerRef: receipt.providerRef,
      },
      requestId,
    );

    return receipt;
  }

  getReceipt(commandId: string) {
    const receipt = this.receiptsByCommandId.get(commandId.trim());
    if (!receipt) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TESLA_COMMAND_RECEIPT_NOT_FOUND",
        `Command receipt '${commandId}' was not found.`,
      );
    }

    return receipt;
  }

  listReceipts(vehicleId?: string) {
    return [...this.receiptsByCommandId.values()]
      .filter((receipt) => !vehicleId || receipt.vehicleId === vehicleId.trim())
      .map((receipt) => ({
        ...receipt,
        source: { ...receipt.source },
      }))
      .sort((left, right) => right.issuedAt.localeCompare(left.issuedAt));
  }

  private requireOAuthConnection(connectionId: string) {
    const record = this.oauthConnections.get(connectionId.trim());
    if (!record) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TESLA_OAUTH_CONNECTION_NOT_FOUND",
        `Tesla OAuth connection '${connectionId}' was not found.`,
      );
    }
    return record;
  }

  private requireKnownVehicle(vehicleId: string) {
    const candidate = this.regulatoryRegistryService
      ?.listVehicles()
      .find((vehicle) => vehicle.vehicleId === vehicleId);

    if (!candidate) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TESLA_PHASE1_VEHICLE_NOT_FOUND",
        `Phase 1 vehicle '${vehicleId}' was not found for Tesla binding.`,
      );
    }
  }

  private requireBinding(vehicleId: string) {
    const binding = this.bindingsByVehicleId.get(vehicleId.trim());
    if (!binding) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TESLA_VEHICLE_NOT_BOUND",
        `Vehicle '${vehicleId}' is not bound to a Tesla VIN yet.`,
      );
    }
    return binding;
  }

  private buildMockPublicSample(
    binding: TeslaVehicleBindingRecord,
    command: ConfigureTeslaTelemetryCommand,
  ): TeslaPublicTelemetrySample {
    return {
      sampleId: `tesla-public-sample-${randomUUID()}`,
      externalVehicleRef: binding.externalVehicleRef,
      capturedAt: new Date().toISOString(),
      location: command.mockLocation ?? {
        lat: 25.033964,
        lng: 121.564468,
      },
      batteryLevelPct: command.mockBatteryLevelPct ?? 78,
      online: command.mockOnline ?? true,
      source: this.buildSourceMetadata(
        command.mode === "public_mock"
          ? "tesla_public_telemetry"
          : "tesla_fleet_api",
        binding.externalVehicleRef,
      ),
    };
  }

  private projectTelemetry(
    binding: TeslaVehicleBindingRecord,
    sample: TeslaPublicTelemetrySample,
  ): TeslaVehicleStateSnapshot {
    const batteryLevelPct = sample.batteryLevelPct ?? null;

    return {
      snapshotId: `tesla-snapshot-${randomUUID()}`,
      vehicleId: binding.vehicleId,
      externalVehicleRef: binding.externalVehicleRef,
      capturedAt: sample.capturedAt,
      location: sample.location ? { ...sample.location } : null,
      speedMps: 0,
      headingDeg: null,
      shiftState: "P",
      autonomyState: "unknown",
      batteryLevelPct,
      batteryRangeKm:
        batteryLevelPct === null ? null : Number((batteryLevelPct * 4.3).toFixed(1)),
      charging: false,
      online: sample.online ?? false,
      source: this.buildSourceMetadata(
        sample.source.sourceSystem,
        sample.externalVehicleRef,
      ),
    };
  }

  private buildSourceMetadata(
    sourceSystem: Phase2SourceMetadata["sourceSystem"],
    sourceRef: string,
  ): Phase2SourceMetadata {
    const now = new Date().toISOString();
    return {
      sourceSystem,
      sourceRef,
      ingestedAt: now,
      recordedAt: now,
      signatureRef: null,
      schemaVersion: "phase2-tesla-fsd-sandbox-202606",
    };
  }

  private recordAudit(
    actionName: string,
    resourceType: string,
    resourceId: string,
    newValuesSummary: Record<string, unknown>,
    requestId?: string,
  ) {
    const auditInput = {
      actorId: null,
      actorType: "system",
      tenantId: null,
      moduleName: "tesla-integration",
      actionName,
      resourceType,
      resourceId,
      newValuesSummary,
    } as const;

    if (requestId) {
      this.auditNotificationService?.recordAuditLog({
        ...auditInput,
        requestId,
      });
      return;
    }

    this.auditNotificationService?.recordAuditLog(auditInput);
  }

  private async persistReceipt(receipt: CommandReceipt) {
    if (!this.repository) {
      return;
    }

    try {
      await this.repository.insertCommandReceipt(receipt);
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "insert command receipt");
      this.logger.warn(
        `Command receipt persisted in memory only for ${receipt.commandId}.`,
      );
    }
  }

  private buildDiscoveredVehicleSeeds(): DiscoveredVehicleSeed[] {
    const northAmericaConnectionId = "tesla-conn-seed-na-001";
    const apacConnectionId = "tesla-conn-seed-apac-001";

    return [
      {
        businessAccountId: "biz-seed-001",
        vehicle: this.buildDiscoveredVehicle({
          connectionId: northAmericaConnectionId,
          externalVehicleRef: "tesla-public-veh-demo-001",
          region: "north_america",
          vin: "5YJ3E1EA7JF000001",
        }),
      },
      {
        businessAccountId: "biz-seed-001",
        vehicle: this.buildDiscoveredVehicle({
          connectionId: northAmericaConnectionId,
          externalVehicleRef: "tesla-public-veh-demo-002",
          region: "north_america",
          vin: "5YJ3E1EA7JF000002",
          model: "Model Y",
        }),
      },
      {
        businessAccountId: "biz-seed-002",
        vehicle: this.buildDiscoveredVehicle({
          connectionId: apacConnectionId,
          externalVehicleRef: "tesla-public-veh-demo-003",
          region: "asia_pacific",
          vin: "LRW3E7EK3PC000003",
          model: "Model 3 Highland",
        }),
      },
    ];
  }

  private buildDiscoveredVehicle(
    overrides: Partial<TeslaDiscoveredVehicle> &
      Pick<TeslaDiscoveredVehicle, "connectionId" | "externalVehicleRef" | "region" | "vin">,
  ): TeslaDiscoveredVehicle {
    return {
      vin: overrides.vin,
      externalVehicleRef: overrides.externalVehicleRef,
      connectionId: overrides.connectionId,
      region: overrides.region,
      model: overrides.model ?? "Model 3",
      online: overrides.online ?? true,
      batteryLevelPct: overrides.batteryLevelPct ?? 78,
      lastSeenAt: overrides.lastSeenAt ?? "2026-06-26T00:05:00.000Z",
      source:
        overrides.source ??
        this.buildSourceMetadata("tesla_fleet_api", overrides.vin),
    };
  }
}
