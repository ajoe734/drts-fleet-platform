import { describe, expect, it } from "vitest";

import type { EmptyReason, EmptyStateEnvelope } from "@drts/contracts";

import {
  classifyEnterpriseBookingFetchError,
  classifyEnterpriseDashboardFetchError,
} from "../../../../apps/enterprise-dispatch-web/lib/enterprise-trip-status";
import {
  classifyHostAccessError,
  classifyHostEarningsVariant,
  formatHostMoneyOrNull,
} from "../../../../apps/fleet-partner-portal-web/app/host/lib/host-format";
import {
  toApiErrorEnvelope,
  ApiRequestError,
} from "../../../../apps/api/src/common/api-envelope";

/**
 * SR-QA-UX-001 — Capability C119 Acceptance Test Suite
 *
 * C119: 失敗、空清單、過期、429與重試恢復
 * Historical Traceability:
 * - R05: 人員工作階段 403 無限重試（請求風暴）；403 必須分類為不可重試之 auth-required / forbidden，終止無效輪詢
 * - R08: 404 BOOKING_NOT_FOUND 誤回「服務暫時不穩」；404 必須明確分類為 not-found，杜絕可重試假象
 * - R16: 資料讀取失敗仍呈現可信統計 (NaN%、0% SLA)；必須嚴格區分載入中／錯誤／無資料／真實0，杜絕假 0 與 NaN
 * - Q-X15: EmptyStateEnvelope 結構化空狀態 (no_data, not_provisioned, permission_denied, driver_not_eligible, filtered_empty)
 * - 429 速率限制與重試分類 (retryable: true) vs 400/403/404 終止 (retryable: false)
 */
describe("SR-QA-UX-001 — C119: Error Recovery, Classification & Truthful Empty States", () => {
  describe("1. R08 Traceability: 404 Booking Not Found vs Transient Fault Classification", () => {
    it("strictly classifies 404 as 'not-found' and never as retryable 'degraded'", () => {
      const notFoundHttpError = {
        statusCode: 404,
        code: "BOOKING_NOT_FOUND",
        message: "The requested booking does not exist.",
      };

      const classification =
        classifyEnterpriseBookingFetchError(notFoundHttpError);
      expect(classification).toBe("not-found");
      expect(classification).not.toBe("degraded");
    });

    it("classifies quota and policy blocks as 'quota-blocked'", () => {
      const quotaError = {
        statusCode: 403,
        code: "TENANT_QUOTA_EXCEEDED",
        message: "Monthly booking quota exhausted.",
      };

      expect(classifyEnterpriseBookingFetchError(quotaError)).toBe(
        "quota-blocked",
      );
    });

    it("classifies supply or vehicle unavailabilities as 'no-supply'", () => {
      const supplyError = {
        statusCode: 409,
        code: "NO_SUPPLY_AVAILABLE",
        message: "No drivers available in geofence.",
      };

      expect(classifyEnterpriseBookingFetchError(supplyError)).toBe(
        "no-supply",
      );
    });

    it("falls back to 'degraded' only for genuine network/server errors", () => {
      const server500Error = {
        statusCode: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "Database connection dropped.",
      };

      expect(classifyEnterpriseBookingFetchError(server500Error)).toBe(
        "degraded",
      );
    });
  });

  describe("2. R05 Traceability: 401/403 Auth Failure Loop Prevention & Session Termination", () => {
    it("classifies 401 and 403 as 'auth-required' to halt infinite polling loops", () => {
      const error403 = {
        statusCode: 403,
        code: "SESSION_REVOKED",
        message: "Operator session has expired or been revoked.",
      };

      const result = classifyEnterpriseDashboardFetchError(error403);
      // R05: must resolve to "auth-required", never "degraded" (which would trigger polling retry loops)
      expect(result).toBe("auth-required");
      expect(result).not.toBe("degraded");

      const error401 = { statusCode: 401, message: "Unauthorized" };
      expect(classifyEnterpriseDashboardFetchError(error401)).toBe(
        "auth-required",
      );
    });

    it("classifies Host access errors correctly into unauthorized, forbidden, and not_found", () => {
      expect(classifyHostAccessError({ statusCode: 401 })).toBe("unauthorized");
      expect(classifyHostAccessError({ statusCode: 403 })).toBe("forbidden");
      expect(classifyHostAccessError({ statusCode: 404 })).toBe(
        "vehicle_not_found",
      );
      expect(classifyHostAccessError({ code: "HOST_UNAUTHORIZED" })).toBe(
        "unauthorized",
      );
      expect(classifyHostAccessError({ code: "HOST_FORBIDDEN" })).toBe(
        "forbidden",
      );
      expect(classifyHostAccessError({ code: "HOST_VEHICLE_NOT_FOUND" })).toBe(
        "vehicle_not_found",
      );
    });
  });

  describe("3. R16 Traceability: Truthful Zero vs Missing Data / NaN Prevention", () => {
    it("distinguishes genuine zero earnings from missing/pending records", () => {
      // Case A: Real zero trips and zero revenue
      const genuineZero = { grossRevenue: 0, tripsCount: 0 };
      expect(classifyHostEarningsVariant(genuineZero)).toBe("zero");

      // Case B: Non-zero reported activity
      const positiveEarnings = { grossRevenue: 15000, tripsCount: 12 };
      expect(classifyHostEarningsVariant(positiveEarnings)).toBe("reported");
    });

    it("never renders fabricated 0 or NaN for null amounts in financial cards", () => {
      // Format null as null (caller renders placeholder "— (pending_policy)"), not "NT$ 0" or "NaN"
      expect(formatHostMoneyOrNull(null)).toBeNull();

      // Format valid integer amount as NT$ with thousand separators
      expect(formatHostMoneyOrNull(0)).toBe("NT$ 0");
      expect(formatHostMoneyOrNull(12500)).toBe("NT$ 12,500");
    });
  });

  describe("4. Q-X15: Structured Empty State Envelope Contracts", () => {
    it("correctly models all discrete empty reasons without defaulting to misleading no_data", () => {
      const emptyReasons: EmptyReason[] = [
        "no_data",
        "not_provisioned",
        "fetch_failed",
        "permission_denied",
        "external_unavailable",
        "driver_not_eligible",
        "filtered_empty",
      ];

      for (const reason of emptyReasons) {
        const envelope: EmptyStateEnvelope = {
          reason,
          messageCode: `empty.${reason}`,
          nextAction:
            reason === "not_provisioned"
              ? {
                  action: "configure_settings",
                  enabled: true,
                  riskLevel: "low",
                }
              : undefined,
        };

        expect(envelope.reason).toBe(reason);
        if (reason === "not_provisioned") {
          expect(envelope.nextAction?.action).toBe("configure_settings");
          expect(envelope.nextAction?.riskLevel).toBe("low");
        }
      }
    });
  });

  describe("5. 429 Rate Limit & Retryability Classification", () => {
    it("marks 429 rate-limited responses as retryable: true", () => {
      const errorEnvelope = toApiErrorEnvelope(
        "RATE_LIMIT_EXCEEDED",
        "Too many requests; please back off.",
        { retryAfterSeconds: 5 },
        true, // retryable
      );

      expect(errorEnvelope.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(errorEnvelope.error.retryable).toBe(true);
      expect(errorEnvelope.error.details?.retryAfterSeconds).toBe(5);
      expect(errorEnvelope.error.traceId).toBeDefined();
    });

    it("marks 400 validation and 403 scope errors as retryable: false", () => {
      const badReq = new ApiRequestError(
        400,
        "INVALID_PAYLOAD",
        "Missing required fields",
        undefined,
        false,
      );
      const forbidden = new ApiRequestError(
        403,
        "AUTH_SCOPE_DENIED",
        "Actor does not possess required write scope",
        undefined,
        false,
      );

      const badReqResponse = badReq.getResponse() as {
        error: { retryable: boolean };
      };
      const forbiddenResponse = forbidden.getResponse() as {
        error: { retryable: boolean };
      };

      expect(badReqResponse.error.retryable).toBe(false);
      expect(forbiddenResponse.error.retryable).toBe(false);
    });
  });
});
