import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { InMemoryDocumentArtifactStore } from "../../../apps/api/src/common/document-artifacts";
import {
  databaseSocket,
  publish,
  setup,
} from "../billing-monthly-batch-resumption-20261015/fixtures";

afterEach(() => {
  vi.restoreAllMocks();
});

const period = "2026-06";
const driverId = "drv-demo-002";

function driverIdentity(id = driverId): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "driver_user",
    actorId: id,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver_user"],
    scopes: ["driver:read", "driver:write", "dispatch:read"],
    requestId: null,
  };
}

function opsIdentity(): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "ops_user",
    actorId: "ops-statement-reader",
    realm: "ops",
    tenantId: null,
    roleFamilies: ["ops"],
    roles: ["ops_user"],
    scopes: ["billing:read", "billing:write"],
    requestId: null,
  };
}

async function generatedAfterBothInstancesWarm() {
  const socket = databaseSocket();
  const store = new InMemoryDocumentArtifactStore();
  const writer = await setup(socket, store);
  const reader = await setup(socket, store);
  // Reader B completes its one startup hydration before writer A publishes.
  expect(reader.service.listDriverStatements(period, driverId)).toEqual([]);
  await publish(writer.service);
  const result = await writer.controller.generateDriverStatements(
    { periodMonth: period, driverId },
    "warm-reader-generation",
    "generation-request",
  );
  expect(result.data.items).toHaveLength(1);
  const statement = result.data.items[0]!;
  expect(statement.driverId).toBe(driverId);
  expect(statement.periodMonth).toBe(period);
  expect(
    socket.tables
      .get("billing.phase1_driver_statements")
      ?.get(statement.statementId),
  ).toMatchObject({ statementId: statement.statementId, driverId });
  // The producer executed the original target persistence and artifact path.
  // Only its database socket and artifact storage are finite test ports.
  return { socket, store, writer, reader, statement };
}

describe("ordinary statement readers after another warm instance commits", () => {
  it("returns the writer's persisted statement through the already-warm driver's ordinary list alias", async () => {
    const f = await generatedAfterBothInstancesWarm();
    const listed = await f.reader.controller.listDriverOwnStatements(
      driverIdentity(),
      undefined,
      period,
      "driver-list-request",
    );
    expect(listed.data.items).toEqual([f.statement]);
    expect(listed.data.pageInfo.totalItems).toBe(1);
    expect(listed.meta.requestId).toBe("driver-list-request");
  });

  it("returns the same complete persisted ID through the already-warm driver's ordinary detail alias", async () => {
    const f = await generatedAfterBothInstancesWarm();
    const detail = await f.reader.controller.getDriverOwnStatement(
      f.statement.statementId,
      driverIdentity(),
      "driver-detail-request",
    );
    expect(detail.data).toEqual(f.statement);
    expect(detail.meta.requestId).toBe("driver-detail-request");
  });

  it("lets the already-warm Ops caller read the selected driver's generated month through the ordinary list route", async () => {
    const f = await generatedAfterBothInstancesWarm();
    const listed = await f.reader.controller.listDriverStatements(
      opsIdentity(),
      "2026-03",
      period,
      driverId,
      "ops-list-request",
    );
    expect(listed.data.items).toEqual([f.statement]);
    expect(listed.data.pageInfo.totalItems).toBe(1);
    expect(listed.meta.requestId).toBe("ops-list-request");
  });

  it("lets the already-warm Ops caller read that exact generated ID without regenerating or reinitializing", async () => {
    const f = await generatedAfterBothInstancesWarm();
    const detail = await f.reader.controller.getDriverStatement(
      f.statement.statementId,
      opsIdentity(),
      "ops-detail-request",
    );
    expect(detail.data).toEqual(f.statement);
    expect(detail.meta.requestId).toBe("ops-detail-request");
  });

  it("surfaces a current canonical read error instead of returning the reader's older cached statement", async () => {
    const f = await generatedAfterBothInstancesWarm();
    const cachedReader = await setup(f.socket, f.store);
    expect(cachedReader.service.listDriverStatements(period, driverId)).toEqual(
      [f.statement],
    );
    f.socket.query.mockImplementationOnce(async () => {
      throw new Error("SIM canonical statement SELECT unavailable");
    });
    await expect(
      Promise.resolve().then(() =>
        cachedReader.controller.listDriverOwnStatements(
          driverIdentity(),
          undefined,
          period,
        ),
      ),
    ).rejects.toThrow("SIM canonical statement SELECT unavailable");
  });

  it("preserves the existing different-driver detail rejection after reading a current persisted ID", async () => {
    const f = await generatedAfterBothInstancesWarm();
    await expect(
      Promise.resolve().then(() =>
        f.reader.controller.getDriverOwnStatement(
          f.statement.statementId,
          driverIdentity("drv-demo-001"),
        ),
      ),
    ).rejects.toMatchObject({ code: "DRIVER_IDENTITY_MISMATCH" });
  });

  it("keeps ordinary Ops list period and driver filtering when the selected driver has no statements", async () => {
    const f = await generatedAfterBothInstancesWarm();
    const listed = await f.reader.controller.listDriverStatements(
      opsIdentity(),
      undefined,
      period,
      "drv-no-statements",
    );
    expect(listed.data.items).toEqual([]);
    expect(listed.data.pageInfo.totalItems).toBe(0);
  });

  it("keeps the original explicit in-memory mode usable without a database", async () => {
    const f = await setup();
    await publish(f.service);
    const generated = await f.controller.generateDriverStatements(
      { periodMonth: period, driverId },
      "memory-generation",
    );
    const statement = generated.data.items[0]!;
    const listed = await f.controller.listDriverOwnStatements(
      driverIdentity(),
      undefined,
      period,
    );
    const detail = await f.controller.getDriverOwnStatement(
      statement.statementId,
      driverIdentity(),
    );
    expect(listed.data.items).toEqual([statement]);
    expect(detail.data).toEqual(statement);
  });
});
