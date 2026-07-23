import { describe, expect, it, vi } from "vitest";

import { MultiTaxiRepository } from "../../src/modules/multi-taxi/multi-taxi.repository";

describe("MultiTaxiRepository passenger access tokens", () => {
  it("persists only the token digest and never the raw bearer token", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      query,
    } as never);
    const rawToken = "raw-passenger-bearer-token-must-not-be-stored";

    await repository.persistRideAccessToken(
      {
        tokenId: "token-001",
        orderId: "order-001",
        passengerSubjectRef: "passenger-001",
        scopes: ["ride:read", "ride:cancel"],
        expiresAt: "2026-08-22T00:00:00.000Z",
        revokedAt: null,
        accessToken: rawToken,
      },
      "sha256-token-digest",
    );

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("token_digest");
    expect(sql).not.toMatch(/^\s*access_token\s*,?$/m);
    expect(parameters).toContain("sha256-token-digest");
    expect(parameters).not.toContain(rawToken);
  });
});
