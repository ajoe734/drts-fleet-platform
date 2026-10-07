import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsumedOidcStateRepository } from "../../apps/api/src/modules/auth/consumed-oidc-state.repository";

describe("durable OIDC state consumption", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not fall back to process-local state when configured PostgreSQL fails", async () => {
    vi.stubEnv(
      "CONSUMED_OIDC_STATES_FILE",
      join(tmpdir(), `oidc-${randomUUID()}.json`),
    );
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error("Database unavailable"))
      .mockResolvedValueOnce({ rows: [{ state: "proof" }] })
      .mockResolvedValue({ rows: [] });
    const repository = new ConsumedOidcStateRepository({
      isEnabled: () => true,
      query,
    } as never);
    try {
      await expect(
        repository.consumeState("proof", Date.now() + 60000),
      ).rejects.toThrow("Database unavailable");
      expect(repository.isConsumed("proof")).toBe(false);
      await expect(
        repository.consumeState("proof", Date.now() + 60000),
      ).resolves.toBe(true);
      await expect(
        repository.consumeState("proof", Date.now() + 60000),
      ).resolves.toBe(false);
      await expect(
        repository.consumeState("other-instance-proof", Date.now() + 60000),
      ).resolves.toBe(false);
      expect(query).toHaveBeenCalledTimes(3);
    } finally {
      repository.clearMemoryCache();
    }
  });
});
