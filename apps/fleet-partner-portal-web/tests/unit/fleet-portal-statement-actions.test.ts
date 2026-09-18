import { describe, expect, it } from "vitest";
import {
  buildStatementArtifactContent,
  buildStatementDecisionRequestContent,
  buildStatementStorageKey,
  parseStatementDecisionMap,
} from "../../lib/fleet-portal-statement-actions";

const statement = {
  id: "fst_2026_08",
  period: "2026-08",
  trips: 12,
  payable: "NT$ 8,400",
  status: "pending_confirm" as const,
  issued: "2026-08-01",
};

describe("fleet portal statement actions", () => {
  it("builds a fleet-scoped storage key", () => {
    expect(buildStatementStorageKey("fleet-demo-001")).toBe(
      "drts:fleet-partner-portal:statements:fleet-demo-001",
    );
  });

  it("parses only valid persisted decisions", () => {
    expect(
      parseStatementDecisionMap(
        JSON.stringify({
          fst_2026_08: {
            decision: "confirmed",
            requestedAt: "2026-08-08T12:00:00Z",
          },
          invalid: {
            decision: "oops",
            requestedAt: 1,
          },
        }),
      ),
    ).toEqual({
      fst_2026_08: {
        decision: "confirmed",
        requestedAt: "2026-08-08T12:00:00Z",
      },
    });
  });

  it("renders statement artifact downloads with fleet scope and statement id", () => {
    expect(
      buildStatementArtifactContent({
        fleetPartnerId: "fleet-demo-001",
        statement,
        downloadedAt: "2026-08-08T12:00:00Z",
      }),
    ).toContain("fleet_partner_id=fleet-demo-001");
    expect(
      buildStatementArtifactContent({
        fleetPartnerId: "fleet-demo-001",
        statement,
        downloadedAt: "2026-08-08T12:00:00Z",
      }),
    ).toContain("statement_id=fst_2026_08");
  });

  it("renders decision requests with action and reason", () => {
    expect(
      buildStatementDecisionRequestContent({
        fleetPartnerId: "fleet-demo-001",
        statement,
        decision: {
          decision: "disputed",
          requestedAt: "2026-08-08T12:05:00Z",
          reason: "Need trip-level reconciliation",
        },
      }),
    ).toContain("action=disputed");
    expect(
      buildStatementDecisionRequestContent({
        fleetPartnerId: "fleet-demo-001",
        statement,
        decision: {
          decision: "disputed",
          requestedAt: "2026-08-08T12:05:00Z",
          reason: "Need trip-level reconciliation",
        },
      }),
    ).toContain("reason=Need trip-level reconciliation");
  });
});
