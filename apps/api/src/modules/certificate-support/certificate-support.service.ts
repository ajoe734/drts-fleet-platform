import { PLATFORM_CURRENCY, normalisePlatformCurrency } from "@drts/contracts";
import { createHash } from "node:crypto";

import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import type { ActionReceipt } from "@drts/contracts";

import { toActionReceipt } from "../../common/action-receipt";
import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
  type OwnedMobilityMultiTaxiTripCompletedEvent,
} from "../owned-mobility/owned-mobility-events";
import { renderCertificateArtifact } from "./certificate-artifact.renderer";
import { CertificateSupportRepository } from "./certificate-support.repository";
import {
  CERTIFICATE_SUPPORT_STATES,
  type CertificateArtifact,
  type CertificateArtifactBlocker,
  type CertificateRegenerationResult,
  type CertificateSupportRow,
  type CertificateSupportState,
  type CertificateSupportView,
} from "./certificate-support.types";

/**
 * The currency a certificate may be priced in.
 *
 * `AUDIT-MONEY-001`: the platform writes the same currency two ways -- `NTD` in
 * most modules, `TWD` in `platform-earnings`. This constant does not resolve
 * that. It puts this module's requirement in one place so that resolving it is
 * one edit rather than a search.
 */
const CERTIFICATE_CURRENCY = PLATFORM_CURRENCY;

@Injectable()
export class CertificateSupportService {
  private readonly logger = new Logger(CertificateSupportService.name);

  constructor(
    private readonly repository: CertificateSupportRepository,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
  ) {}

  async list(input: {
    search?: string;
    state?: string;
  }): Promise<CertificateSupportView[]> {
    this.assertRepositoryAvailable();
    const search = this.normalizeSearch(input.search);
    const state = this.normalizeState(input.state);
    const rows = await this.repository.list(search);
    const items = rows.map((row) => this.toView(row));
    return state ? items.filter((item) => item.state === state) : items;
  }

  async get(certificateId: string): Promise<CertificateSupportView> {
    this.assertRepositoryAvailable();
    return this.toView(await this.requireRow(certificateId));
  }

  async getArtifact(
    certificateId: string,
    format: "html" | "pdf",
  ): Promise<CertificateArtifact> {
    this.assertRepositoryAvailable();
    const view = this.toView(await this.requireRow(certificateId));
    if (
      !["available", "superseded"].includes(view.state) ||
      (format === "html" ? !view.htmlUrl : !view.pdfUrl)
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "CERTIFICATE_ARTIFACT_NOT_AVAILABLE",
        "The certificate artifact is not available in its current state.",
        { certificateId: view.certificateId, state: view.state },
      );
    }
    return renderCertificateArtifact(view, format);
  }

  async regenerate(
    certificateId: string,
    input: {
      actorId: string;
      reason?: string;
      idempotencyKey?: string;
      requestId?: string;
    },
  ): Promise<CertificateRegenerationResult> {
    this.assertWriterAvailable();
    const normalizedCertificateId = this.requireText(
      certificateId,
      "CERTIFICATE_ID_REQUIRED",
      "certificateId is required.",
      255,
    );
    const reason = this.requireText(
      input.reason,
      "CERTIFICATE_REGENERATION_REASON_REQUIRED",
      "A non-empty regeneration reason is required.",
      500,
    );
    const idempotencyKey = this.requireText(
      input.idempotencyKey,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Idempotency-Key is required for certificate regeneration.",
      255,
    );
    const actorId = this.requireText(
      input.actorId,
      "AUTH_REQUIRED",
      "Authenticated platform identity is required.",
      255,
    );
    const sourceRow = await this.requireRow(normalizedCertificateId);

    let persisted;
    try {
      persisted = await this.repository.regenerate({
        certificateId: sourceRow.receiptId,
        actorId,
        reason,
        idempotencyKey,
        issuedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.rethrowPersistenceError(error, normalizedCertificateId);
    }
    const row = persisted!.row;
    let actionReceipt: ActionReceipt;
    if (persisted!.replayed && row.regenerationAuditId) {
      actionReceipt = {
        actionId: idempotencyKey,
        auditId: row.regenerationAuditId,
        resourceType: "multi_taxi_electronic_receipt",
        resourceId: row.receiptId,
        status: "completed",
        message: "Electronic ride certificate regenerated.",
      };
    } else {
      const auditLog = this.auditNotificationService!.recordAuditLog({
        actorId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "certificate-support",
        actionName: "regenerate_electronic_ride_certificate",
        resourceType: "multi_taxi_electronic_receipt",
        resourceId: row.receiptId,
        oldValuesSummary: {
          sourceCertificateId: row.supersedesReceiptId,
        },
        newValuesSummary: {
          certificateId: row.receiptId,
          orderId: row.orderId,
          certificateVersion: row.receiptVersion,
          reason,
          idempotencyKey,
        },
        ...(input.requestId ? { requestId: input.requestId } : {}),
      });
      actionReceipt = toActionReceipt({
        auditLog,
        actionId: idempotencyKey,
        status: "completed",
        message: "Electronic ride certificate regenerated.",
      });
      await this.repository.attachRegenerationAudit(
        row.receiptId,
        idempotencyKey,
        auditLog.auditId,
      );
    }

    return {
      certificate: this.toView({
        ...row,
        regenerationAuditId: actionReceipt.auditId,
      }),
      actionReceipt,
    };
  }

  @OnEvent(OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT, {
    async: true,
    suppressErrors: false,
  })
  async writeCompletedTrip(event: OwnedMobilityMultiTaxiTripCompletedEvent) {
    this.assertRepositoryAvailable();
    this.assertCompletionEvent(event);
    const receiptId = `receipt-${event.orderId}`;
    const date = event.completedAt.slice(0, 10).replaceAll("-", "");
    const digest = createHash("sha256")
      .update(event.orderId)
      .digest("hex")
      .slice(0, 10)
      .toUpperCase();
    const receiptNo = `MTX-${date}-${digest}`;
    const record: Record<string, unknown> = {
      tripId: event.tripId,
      plateNo: event.plateNo,
      pickupAt: event.pickupAt,
      dropoffAt: event.dropoffAt,
      travelDurationSeconds: event.travelDurationSeconds,
      routeSummary: event.routeSummary,
      distanceMeters: event.distanceMeters,
      tollMinor: event.tollMinor,
      consumerServicePhone: event.consumerServicePhone,
      authorityComplaintPhone: event.authorityComplaintPhone,
      certificateVersion: "v1",
      certificateState: "available",
      htmlUrl: this.artifactUrl(receiptId, "html"),
      pdfUrl: this.artifactUrl(receiptId, "pdf"),
      generatedFrom: "owned_mobility_completion",
      generatedAt: event.completedAt,
    };
    try {
      return await this.repository.persistInitial({
        receiptId,
        orderId: event.orderId,
        receiptNo,
        amountMinor: event.fareMinor,
        currency: event.currency,
        issuedAt: event.completedAt,
        record,
      });
    } catch (error) {
      this.logger.error(
        `Certificate writer failed for order ${event.orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  private toView(row: CertificateSupportRow): CertificateSupportView {
    const record = row.record;
    const supersededByCertificateId = this.stringValue(record, [
      "supersededByCertificateId",
      "supersededByReceiptId",
      "superseded_by_certificate_id",
      "superseded_by_receipt_id",
    ]);
    const state = this.resolveState(record, supersededByCertificateId);
    const artifactBlockers = this.resolveArtifactBlockers(row, record);
    if (!["available", "superseded"].includes(state)) {
      artifactBlockers.unshift({
        code: "state_not_issuable",
        detail: `certificate state is ${state}`,
      });
    }
    const artifactsAvailable = artifactBlockers.length === 0;
    const regenerationEnabled =
      row.isCurrent &&
      state === "available" &&
      artifactsAvailable &&
      this.isWriterAvailable();

    return {
      certificateId: row.receiptId,
      certificateNo: row.receiptNo,
      orderId: row.orderId,
      tripId: this.stringValue(record, ["tripId", "trip_id"]),
      state,
      certificateVersion:
        this.stringValue(record, [
          "certificateVersion",
          "version",
          "certificate_version",
        ]) ?? `v${row.receiptVersion}`,
      issuedAt: row.issuedAt,
      plateNo: this.stringValue(record, ["plateNo", "plate_no"]),
      pickupAt: this.stringValue(record, ["pickupAt", "pickup_at"]),
      dropoffAt: this.stringValue(record, ["dropoffAt", "dropoff_at"]),
      travelDurationSeconds: this.numberValue(record, [
        "travelDurationSeconds",
        "durationSeconds",
        "travel_duration_seconds",
      ]),
      routeSummary: this.stringValue(record, [
        "routeSummary",
        "route",
        "route_summary",
      ]),
      distanceMeters: this.numberValue(record, [
        "distanceMeters",
        "distance_meters",
      ]),
      fareMinor: row.amountMinor,
      tollMinor: this.numberValue(record, ["tollMinor", "toll_minor"]),
      currency: row.currency,
      consumerServicePhone: this.stringValue(record, [
        "consumerServicePhone",
        "servicePhone",
        "consumer_service_phone",
      ]),
      authorityComplaintPhone: this.stringValue(record, [
        "authorityComplaintPhone",
        "complaintPhone",
        "authority_complaint_phone",
      ]),
      htmlUrl: artifactsAvailable
        ? this.artifactUrl(row.receiptId, "html")
        : null,
      pdfUrl: artifactsAvailable
        ? this.artifactUrl(row.receiptId, "pdf")
        : null,
      supersededByCertificateId,
      artifactBlockers,
      regeneration: {
        enabled: regenerationEnabled,
        reasonCode: regenerationEnabled
          ? null
          : !row.isCurrent
            ? "certificate_version_superseded"
            : artifactBlockers.some(
                  (blocker) => blocker.code === "unexpected_currency",
                )
              ? "certificate_currency_unrecognised"
              : !artifactsAvailable
                ? "certificate_canonical_record_incomplete"
                : "certificate_writer_unavailable",
      },
    };
  }

  private async requireRow(certificateId: string) {
    const normalizedId = this.requireText(
      certificateId,
      "CERTIFICATE_ID_REQUIRED",
      "certificateId is required.",
      255,
    );
    const row = await this.repository.findById(normalizedId);
    if (!row) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "CERTIFICATE_NOT_FOUND",
        "The requested electronic ride certificate was not found.",
        { certificateId: normalizedId },
      );
    }
    return row;
  }

  private resolveState(
    record: Record<string, unknown>,
    supersededByCertificateId: string | null,
  ): CertificateSupportState {
    if (supersededByCertificateId) return "superseded";
    const value = this.stringValue(record, [
      "certificateState",
      "certificateStatus",
      "status",
      "certificate_state",
    ])
      ?.toLowerCase()
      .replaceAll("-", "_")
      .replaceAll(" ", "_");
    return CERTIFICATE_SUPPORT_STATES.includes(value as CertificateSupportState)
      ? (value as CertificateSupportState)
      : "available";
  }

  private normalizeSearch(value: string | undefined): string | null {
    const search = value?.trim() ?? "";
    if (search.length > 120) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CERTIFICATE_SEARCH_TOO_LONG",
        "Certificate search is limited to 120 characters.",
      );
    }
    return search || null;
  }

  private normalizeState(
    value: string | undefined,
  ): CertificateSupportState | null {
    const state = value?.trim().toLowerCase().replaceAll("-", "_");
    if (!state) return null;
    if (
      !CERTIFICATE_SUPPORT_STATES.includes(state as CertificateSupportState)
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CERTIFICATE_STATE_INVALID",
        "Unsupported certificate support state.",
        { state },
      );
    }
    return state as CertificateSupportState;
  }

  private assertCompletionEvent(
    event: OwnedMobilityMultiTaxiTripCompletedEvent,
  ) {
    const requiredText = [
      event.orderId,
      event.tripId,
      event.plateNo,
      event.pickupAt,
      event.dropoffAt,
      event.routeSummary,
      event.consumerServicePhone,
      event.authorityComplaintPhone,
    ];
    const numeric = [
      event.travelDurationSeconds,
      event.distanceMeters,
      event.fareMinor,
      event.tollMinor,
    ];
    if (
      event.runtimeProfileCode !== "multi_taxi_direct" ||
      requiredText.some((value) => !value.trim()) ||
      numeric.some((value) => !Number.isFinite(value) || value < 0) ||
      normalisePlatformCurrency(event.currency) !== PLATFORM_CURRENCY
    ) {
      throw new ApiRequestError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "CERTIFICATE_COMPLETION_EVENT_INVALID",
        "A complete canonical multi-taxi trip record is required.",
        { orderId: event.orderId || null },
      );
    }
  }

  private assertRepositoryAvailable() {
    if (
      typeof this.repository.isEnabled === "function" &&
      !this.repository.isEnabled()
    ) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "CERTIFICATE_WRITER_UNAVAILABLE",
        "The certificate database writer is unavailable.",
      );
    }
  }

  private assertWriterAvailable() {
    this.assertRepositoryAvailable();
    if (!this.auditNotificationService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "CERTIFICATE_WRITER_UNAVAILABLE",
        "The audited certificate writer is unavailable.",
      );
    }
  }

  private isWriterAvailable() {
    const repositoryAvailable =
      typeof this.repository.isEnabled !== "function" ||
      this.repository.isEnabled();
    return repositoryAvailable && Boolean(this.auditNotificationService);
  }

  private rethrowPersistenceError(
    error: unknown,
    certificateId: string,
  ): never {
    const code = error instanceof Error ? error.message : String(error);
    if (code === "CERTIFICATE_NOT_FOUND") {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        code,
        "The requested electronic ride certificate was not found.",
        { certificateId },
      );
    }
    if (code === "CERTIFICATE_NOT_CURRENT") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        code,
        "Only the current certificate version may be regenerated.",
        { certificateId },
      );
    }
    if (code === "IDEMPOTENCY_KEY_REUSED") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        code,
        "Idempotency-Key was already used for a different command.",
      );
    }
    throw error;
  }

  private requireText(
    value: string | null | undefined,
    code: string,
    message: string,
    maxLength: number,
  ) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new ApiRequestError(HttpStatus.BAD_REQUEST, code, message);
    }
    if (normalized.length > maxLength) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        `${code}_TOO_LONG`,
        `${message} Maximum length is ${maxLength}.`,
      );
    }
    return normalized;
  }

  private artifactUrl(receiptId: string, format: "html" | "pdf") {
    return `/control-plane-proxy/platform-admin/multi-taxi/certificates/${encodeURIComponent(
      receiptId,
    )}/artifacts/${format}`;
  }

  /**
   * Every reason an artifact cannot be produced, rather than a single boolean.
   *
   * The boolean it replaces collapsed nine field checks and a currency check
   * into one answer, which reached the caller as
   * `certificate_canonical_record_incomplete`. A row whose currency was not
   * `NTD` was therefore reported as an incomplete record -- the record was
   * complete, and the label was unexpected. Naming the blocker is the
   * difference between "we are missing your trip data" and "we do not
   * recognise the currency this was priced in", which are different problems
   * with different owners.
   */
  private resolveArtifactBlockers(
    row: CertificateSupportRow,
    record: Record<string, unknown>,
  ): CertificateArtifactBlocker[] {
    const blockers: CertificateArtifactBlocker[] = [];

    const textFields: Array<[string, string | null]> = [
      ["tripId", this.stringValue(record, ["tripId", "trip_id"])],
      ["plateNo", this.stringValue(record, ["plateNo", "plate_no"])],
      ["pickupAt", this.stringValue(record, ["pickupAt", "pickup_at"])],
      ["dropoffAt", this.stringValue(record, ["dropoffAt", "dropoff_at"])],
      [
        "routeSummary",
        this.stringValue(record, ["routeSummary", "route", "route_summary"]),
      ],
      [
        "consumerServicePhone",
        this.stringValue(record, [
          "consumerServicePhone",
          "servicePhone",
          "consumer_service_phone",
        ]),
      ],
      [
        "authorityComplaintPhone",
        this.stringValue(record, [
          "authorityComplaintPhone",
          "complaintPhone",
          "authority_complaint_phone",
        ]),
      ],
    ];
    for (const [field, value] of textFields) {
      if (!value) {
        blockers.push({ code: "missing_field", field });
      }
    }

    const numberFields: Array<[string, number | null]> = [
      [
        "travelDurationSeconds",
        this.numberValue(record, [
          "travelDurationSeconds",
          "durationSeconds",
          "travel_duration_seconds",
        ]),
      ],
      [
        "distanceMeters",
        this.numberValue(record, ["distanceMeters", "distance_meters"]),
      ],
      ["tollMinor", this.numberValue(record, ["tollMinor", "toll_minor"])],
      ["amountMinor", row.amountMinor],
    ];
    for (const [field, value] of numberFields) {
      if (value === null || !Number.isFinite(value) || value < 0) {
        blockers.push({ code: "missing_field", field });
      }
    }

    // The platform prices in one currency. A row labelled anything else is not
    // an incomplete record, and saying so sent whoever investigated looking for
    // a missing field that was never missing.
    // Normalised, because rows written before V0084 still say `NTD` and it is
    // the same money. Withholding a receipt over a spelling would be the exact
    // failure AUDIT-MONEY-001 predicted.
    if (normalisePlatformCurrency(row.currency) !== CERTIFICATE_CURRENCY) {
      blockers.push({
        code: "unexpected_currency",
        field: "currency",
        detail: `expected ${CERTIFICATE_CURRENCY}, found ${row.currency}`,
      });
    }

    return blockers;
  }

  private stringValue(
    record: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  }

  private numberValue(
    record: Record<string, unknown>,
    keys: string[],
  ): number | null {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return null;
  }
}
