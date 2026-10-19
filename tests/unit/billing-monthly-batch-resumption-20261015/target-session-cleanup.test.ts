import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";

// Original R1 independent support identified this with installed pg-pool.
// Keep the actual pool/repository; only its remote client socket is SIM.
const apiRequire = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const pgRequire = createRequire(apiRequire.resolve("pg/package.json"));
const identity = {
  periodMonth: "2026-06",
  driverId: "driver-session",
  feePlanVersion: "v1",
};
type PoolBoundary = {
  connect(): Promise<unknown>;
  end(): Promise<void>;
  idleCount: number;
  totalCount: number;
};

function sessionSocket(
  mode: "acquire-unknown" | "callback-reject" | "unlock-unknown",
) {
  const trace: Array<{ clientId: number; sql: string }> = [];
  const sessions: Array<{ clientId: number; held: boolean; ended: boolean }> =
    [];
  let rejectAcquisitionOnce = mode === "acquire-unknown";
  class Client extends EventEmitter {
    _queryable = true;
    _ending = false;
    readonly state = {
      clientId: sessions.length + 1,
      held: false,
      ended: false,
    };
    constructor() {
      super();
      sessions.push(this.state);
    }
    connect(callback: (error?: Error | null) => void) {
      queueMicrotask(() => callback(null));
    }
    async query(sql: string) {
      trace.push({ clientId: this.state.clientId, sql });
      if (sql.includes("pg_advisory_lock(")) {
        this.state.held = true;
        if (rejectAcquisitionOnce) {
          rejectAcquisitionOnce = false;
          throw new Error("SIM acquisition ACK lost after server lock");
        }
      }
      if (sql.includes("pg_advisory_unlock(")) {
        if (mode === "unlock-unknown")
          throw new Error("SIM unlock ACK unknown");
        this.state.held = false;
      }
      return { rows: [], rowCount: 0 };
    }
    end(callback?: () => void) {
      this._ending = true;
      this.state.ended = true;
      this.state.held = false;
      callback?.();
    }
  }
  const ActualPool = pgRequire("pg-pool") as new (options: {
    Client: typeof Client;
    max: number;
    idleTimeoutMillis: number;
  }) => PoolBoundary;
  const pool = new ActualPool({ Client, max: 1, idleTimeoutMillis: 0 });
  const repository = new BillingSettlementRepository({
    isEnabled: () => true,
    connect: () => pool.connect(),
  } as unknown as DatabaseService);
  return { repository, pool, sessions, trace };
}

describe("C089 actual installed pool and target-session cleanup (socket SIM)", () => {
  it("destroys an unconfirmed acquired session and a legitimate retry uses a fresh released session", async () => {
    const s = sessionSocket("acquire-unknown");
    try {
      const callback = vi.fn(async () => "not executed");
      await expect(
        s.repository.withDriverStatementTarget(identity, callback),
      ).rejects.toThrow("SIM acquisition ACK lost");
      expect(callback).not.toHaveBeenCalled();
      expect(s.sessions).toEqual([{ clientId: 1, held: false, ended: true }]);
      expect(s.pool.idleCount).toBe(0);
      expect(s.pool.totalCount).toBe(0);
      await expect(
        s.repository.withDriverStatementTarget(identity, async () => "resumed"),
      ).resolves.toBe("resumed");
      expect(s.sessions[1]).toEqual({ clientId: 2, held: false, ended: false });
      expect(s.pool.idleCount).toBe(1);
      expect(s.trace.map((row) => row.clientId)).toEqual([1, 2, 2]);
    } finally {
      await s.pool.end();
    }
  });

  it("unlocks the known acquired session after callback rejection before returning it to the pool", async () => {
    const s = sessionSocket("callback-reject");
    try {
      await expect(
        s.repository.withDriverStatementTarget(identity, async () => {
          throw new Error("target rejected");
        }),
      ).rejects.toThrow("target rejected");
      expect(s.sessions).toEqual([{ clientId: 1, held: false, ended: false }]);
      expect(s.pool.idleCount).toBe(1);
      expect(s.trace).toHaveLength(2);
    } finally {
      await s.pool.end();
    }
  });

  it("destroys an uncertain unlock session while preserving the acknowledged target result", async () => {
    const s = sessionSocket("unlock-unknown");
    try {
      await expect(
        s.repository.withDriverStatementTarget(
          identity,
          async () => "committed",
        ),
      ).resolves.toBe("committed");
      expect(s.sessions).toEqual([{ clientId: 1, held: false, ended: true }]);
      expect(s.pool.idleCount).toBe(0);
      expect(s.pool.totalCount).toBe(0);
    } finally {
      await s.pool.end();
    }
  });
});
