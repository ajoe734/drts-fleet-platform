import { randomUUID } from "node:crypto";

import {
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleInit,
} from "@nestjs/common";

import {
  FARE_QUOTE_ANOMALIES,
  type ActionReceipt,
  type FareQuoteAnomaly,
  type FareQuoteAnomalyAdminView,
  type RecordFareQuoteAnomalyCommand,
  type ResourceActionDescriptor,
} from "@drts/contracts";

import { toActionReceipt } from "../../common/action-receipt";
import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  FareAnomalyRepository,
  type PersistedFareQuoteAnomaly,
} from "./fare-anomaly.repository";
import {
  InjectFareQuoteRecoveryPort,
  type FareQuoteRecoveryPort,
} from "./fare-quote-recovery.port";

const RETRYABLE_REASONS = new Set<FareQuoteAnomaly>([
  "quote_provider_unavailable",
  "route_unresolved",
  "calculation_mismatch",
]);

@Injectable()
export class FareAnomalyService implements OnModuleInit {
  private readonly logger = new Logger(FareAnomalyService.name);
  private initializationError: string | null = null;

  constructor(
    private readonly repository: FareAnomalyRepository,
    private readonly auditNotificationService: AuditNotificationService,
    @InjectFareQuoteRecoveryPort()
    private readonly recoveryPort: FareQuoteRecoveryPort,
  ) {}

  async onModuleInit() {
    try {
      await this.repository.loadUnresolved();
    } catch (error) {
      this.initializationError =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Fare anomaly authority failed to initialize: ${this.initializationError}`,
      );
    }
  }

  list(reason?: string): FareQuoteAnomalyAdminView[] {
    this.assertReady();
    const normalizedReason = reason ? this.requireReason(reason) : null;
    return this.repository
      .list()
      .filter(
        (record) => !normalizedReason || record.reason === normalizedReason,
      )
      .map((record) => this.toAdminView(record));
  }

  get(quoteSnapshotId: string): FareQuoteAnomalyAdminView {
    this.assertReady();
    return this.toAdminView(this.requireRecord(quoteSnapshotId));
  }

  async recordQuoteAnomaly(
    command: RecordFareQuoteAnomalyCommand,
  ): Promise<FareQuoteAnomalyAdminView> {
    this.assertReady();
    const reason = this.requireReason(command.reason);
    const snapshot = structuredClone(command.snapshot);

    if (!snapshot.quoteSnapshotId.trim() || !snapshot.orderId.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FARE_ANOMALY_SNAPSHOT_ID_REQUIRED",
        "quoteSnapshotId and orderId are required.",
      );
    }
    if (snapshot.passengerConfirmedAt) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "FARE_ANOMALY_ALREADY_CONFIRMED",
        "An anomalous fare snapshot cannot be recorded after passenger confirmation.",
        { quoteSnapshotId: snapshot.quoteSnapshotId },
      );
    }

    const saved = await this.repository.save({
      reason,
      snapshot,
      recoveryPending: false,
      lastRecoveryRequestedAt: null,
      lastRecoveryIdempotencyKey: null,
      lastRecoveryReceipt: null,
    });
    return this.toAdminView(saved);
  }

  async resolveQuoteAnomaly(quoteSnapshotId: string, resolvedAt?: string) {
    this.assertReady();
    this.requireRecord(quoteSnapshotId);
    await this.repository.resolve(
      quoteSnapshotId,
      resolvedAt ?? new Date().toISOString(),
    );
  }

  async resolveOrderAnomalies(orderId: string, resolvedAt?: string) {
    this.assertReady();
    const normalizedOrderId = orderId.trim();
    if (!normalizedOrderId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FARE_ANOMALY_ORDER_ID_REQUIRED",
        "orderId is required to resolve fare quote anomalies.",
      );
    }
    await this.repository.resolveByOrderId(
      normalizedOrderId,
      resolvedAt ?? new Date().toISOString(),
    );
  }

  async retryQuote(
    quoteSnapshotId: string,
    context: {
      actorId: string;
      idempotencyKey?: string;
      requestId?: string;
    },
  ): Promise<ActionReceipt> {
    this.assertReady();
    const idempotencyKey = context.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key is required for fare quote recovery.",
      );
    }

    const record = this.requireRecord(quoteSnapshotId);
    if (
      record.lastRecoveryIdempotencyKey === idempotencyKey &&
      record.lastRecoveryReceipt
    ) {
      return structuredClone(record.lastRecoveryReceipt);
    }

    const descriptor = this.buildRetryDescriptor(record);
    if (!descriptor || !descriptor.enabled) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        descriptor?.disabledReasonCode ?? "FARE_QUOTE_RECOVERY_NOT_AVAILABLE",
        "Fare quote recovery is not available for this anomaly.",
        {
          quoteSnapshotId,
          reason: record.reason,
        },
      );
    }

    const result = await this.recoveryPort.recover(
      "retry_quote",
      this.toAdminView(record),
      {
        actorId: context.actorId,
        idempotencyKey,
        ...(context.requestId ? { requestId: context.requestId } : {}),
      },
    );
    const requestedAt = new Date().toISOString();
    const auditLog = this.auditNotificationService.recordAuditLog({
      actorId: context.actorId,
      actorType: "platform_admin",
      tenantId: null,
      moduleName: "product-rule",
      actionName: "retry_fare_quote",
      resourceType: "fare_quote_anomaly",
      resourceId: quoteSnapshotId,
      oldValuesSummary: {
        reason: record.reason,
        recoveryPending: record.recoveryPending,
      },
      newValuesSummary: {
        recoveryPending: result.status === "accepted",
      },
      ...(context.requestId ? { requestId: context.requestId } : {}),
    });
    const receipt = toActionReceipt({
      auditLog,
      actionId: idempotencyKey,
      status: result.status,
      message: result.message,
    });

    await this.repository.save({
      ...record,
      recoveryPending: result.status === "accepted",
      lastRecoveryRequestedAt: requestedAt,
      lastRecoveryIdempotencyKey: idempotencyKey,
      lastRecoveryReceipt: receipt,
    });

    if (result.status === "completed") {
      await this.repository.resolve(quoteSnapshotId, requestedAt);
    }

    return receipt;
  }

  private toAdminView(
    record: PersistedFareQuoteAnomaly,
  ): FareQuoteAnomalyAdminView {
    const descriptor = this.buildRetryDescriptor(record);
    return {
      reason: record.reason,
      snapshot: structuredClone(record.snapshot),
      availableActions: descriptor ? [descriptor] : [],
      recoveryPending: record.recoveryPending,
      lastRecoveryRequestedAt: record.lastRecoveryRequestedAt,
    };
  }

  private buildRetryDescriptor(
    record: PersistedFareQuoteAnomaly,
  ): ResourceActionDescriptor | null {
    if (!RETRYABLE_REASONS.has(record.reason)) {
      return null;
    }
    if (record.recoveryPending) {
      return {
        action: "retry_quote",
        enabled: false,
        disabledReasonCode: "FARE_QUOTE_RECOVERY_PENDING",
        riskLevel: "medium",
      };
    }
    if (!this.recoveryPort.isAvailable("retry_quote")) {
      return {
        action: "retry_quote",
        enabled: false,
        disabledReasonCode: "FARE_QUOTE_PROVIDER_NOT_PROVISIONED",
        riskLevel: "medium",
      };
    }
    return {
      action: "retry_quote",
      enabled: true,
      riskLevel: "medium",
    };
  }

  private requireRecord(quoteSnapshotId: string) {
    const normalizedId = quoteSnapshotId.trim();
    const record = normalizedId ? this.repository.get(normalizedId) : null;
    if (!record) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "FARE_ANOMALY_NOT_FOUND",
        "Fare quote anomaly was not found.",
        { quoteSnapshotId },
      );
    }
    return record;
  }

  private requireReason(reason: string): FareQuoteAnomaly {
    if (FARE_QUOTE_ANOMALIES.includes(reason as FareQuoteAnomaly)) {
      return reason as FareQuoteAnomaly;
    }
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "FARE_ANOMALY_REASON_INVALID",
      "Fare quote anomaly reason is not canonical.",
      {
        reason,
        allowedReasons: [...FARE_QUOTE_ANOMALIES],
      },
    );
  }

  private assertReady() {
    if (!this.initializationError) {
      return;
    }
    throw new ApiRequestError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "FARE_ANOMALY_AUTHORITY_UNAVAILABLE",
      "Fare anomaly authority is unavailable.",
      { cause: this.initializationError, traceId: randomUUID() },
      true,
    );
  }
}
