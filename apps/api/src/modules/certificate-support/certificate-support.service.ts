import { HttpStatus, Injectable } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import { CertificateSupportRepository } from "./certificate-support.repository";
import {
  CERTIFICATE_SUPPORT_STATES,
  type CertificateSupportRow,
  type CertificateSupportState,
  type CertificateSupportView,
} from "./certificate-support.types";

const REGENERATION = {
  enabled: false,
  reasonCode: "certificate_regeneration_command_pending",
} as const;

@Injectable()
export class CertificateSupportService {
  constructor(private readonly repository: CertificateSupportRepository) {}

  async list(input: {
    search?: string;
    state?: string;
  }): Promise<CertificateSupportView[]> {
    const search = this.normalizeSearch(input.search);
    const state = this.normalizeState(input.state);
    const rows = await this.repository.list(search);
    const items = rows.map((row) => this.toView(row));
    return state ? items.filter((item) => item.state === state) : items;
  }

  async get(certificateId: string): Promise<CertificateSupportView> {
    const normalizedId = certificateId.trim();
    if (!normalizedId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CERTIFICATE_ID_REQUIRED",
        "certificateId is required.",
      );
    }

    const row = await this.repository.findById(normalizedId);
    if (!row) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "CERTIFICATE_NOT_FOUND",
        "The requested electronic ride certificate was not found.",
        { certificateId: normalizedId },
      );
    }
    return this.toView(row);
  }

  private toView(row: CertificateSupportRow): CertificateSupportView {
    const record = row.record;
    const supersededByCertificateId = this.stringValue(record, [
      "supersededByCertificateId",
      "supersededByReceiptId",
      "superseded_by_certificate_id",
      "superseded_by_receipt_id",
    ]);

    return {
      certificateId: row.receiptId,
      certificateNo: row.receiptNo,
      orderId: row.orderId,
      tripId: this.stringValue(record, ["tripId", "trip_id"]),
      state: this.resolveState(record, supersededByCertificateId),
      certificateVersion: this.stringValue(record, [
        "certificateVersion",
        "version",
        "certificate_version",
      ]),
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
      htmlUrl: this.stringValue(record, ["htmlUrl", "htmlUri", "html_url"]),
      pdfUrl: this.stringValue(record, ["pdfUrl", "pdfUri", "pdf_url"]),
      supersededByCertificateId,
      regeneration: { ...REGENERATION },
    };
  }

  private resolveState(
    record: Record<string, unknown>,
    supersededByCertificateId: string | null,
  ): CertificateSupportState {
    if (supersededByCertificateId) {
      return "superseded";
    }
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
    if (!state) {
      return null;
    }
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

  private stringValue(
    record: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }

  private numberValue(
    record: Record<string, unknown>,
    keys: string[],
  ): number | null {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  }
}
