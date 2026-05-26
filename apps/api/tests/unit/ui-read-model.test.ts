import { describe, expect, it } from "vitest";

import type { EmptyReason } from "@drts/contracts";

import {
  buildEmptyStateEnvelope,
  buildUiReadModelList,
} from "../../src/common/ui-read-model";

describe("ui-read-model helpers", () => {
  it("covers the shared six dispatch empty reasons", () => {
    const reasons: EmptyReason[] = [
      "no_data",
      "not_provisioned",
      "fetch_failed",
      "permission_denied",
      "external_unavailable",
      "filtered_empty",
    ];

    expect(
      reasons.map((reason) =>
        buildEmptyStateEnvelope(reason, `dispatch.test.empty.${reason}`),
      ),
    ).toEqual([
      {
        reason: "no_data",
        messageCode: "dispatch.test.empty.no_data",
      },
      {
        reason: "not_provisioned",
        messageCode: "dispatch.test.empty.not_provisioned",
      },
      {
        reason: "fetch_failed",
        messageCode: "dispatch.test.empty.fetch_failed",
      },
      {
        reason: "permission_denied",
        messageCode: "dispatch.test.empty.permission_denied",
      },
      {
        reason: "external_unavailable",
        messageCode: "dispatch.test.empty.external_unavailable",
      },
      {
        reason: "filtered_empty",
        messageCode: "dispatch.test.empty.filtered_empty",
      },
    ]);
  });

  it("omits emptyState for non-empty read-model lists while preserving refresh metadata", () => {
    const response = buildUiReadModelList(
      [
        {
          id: "row-001",
        },
      ],
      {
        staleAfterMs: 5000,
        generatedAt: "2026-05-25T11:20:00.000Z",
        dataFreshness: "stale",
        source: "cache",
        emptyState: buildEmptyStateEnvelope(
          "filtered_empty",
          "dispatch.test.empty.filtered_empty",
        ),
      },
    );

    expect(response).toEqual({
      items: [{ id: "row-001" }],
      refresh: {
        generatedAt: "2026-05-25T11:20:00.000Z",
        staleAfterMs: 5000,
        dataFreshness: "stale",
        source: "cache",
      },
    });
  });

  it("attaches emptyState for empty read-model lists", () => {
    const response = buildUiReadModelList([], {
      staleAfterMs: 5000,
      generatedAt: "2026-05-25T11:20:00.000Z",
      emptyState: buildEmptyStateEnvelope(
        "no_data",
        "dispatch.test.empty.no_data",
        {
          action: "configure",
          enabled: true,
          riskLevel: "low",
        },
      ),
    });

    expect(response).toEqual({
      items: [],
      refresh: {
        generatedAt: "2026-05-25T11:20:00.000Z",
        staleAfterMs: 5000,
        dataFreshness: "fresh",
        source: "live",
      },
      emptyState: {
        reason: "no_data",
        messageCode: "dispatch.test.empty.no_data",
        nextAction: {
          action: "configure",
          enabled: true,
          riskLevel: "low",
        },
      },
    });
  });

  it("preserves disabled action descriptors in downstream empty-state envelopes", () => {
    const response = buildUiReadModelList([], {
      staleAfterMs: 3000,
      generatedAt: "2026-05-26T08:00:00.000Z",
      emptyState: buildEmptyStateEnvelope(
        "permission_denied",
        "dispatch.test.empty.permission_denied",
        {
          action: "retry",
          enabled: false,
          disabledReasonCode: "permissions_missing",
          riskLevel: "medium",
        },
      ),
    });

    expect(response.emptyState?.nextAction).toEqual({
      action: "retry",
      enabled: false,
      disabledReasonCode: "permissions_missing",
      riskLevel: "medium",
    });
  });
});
