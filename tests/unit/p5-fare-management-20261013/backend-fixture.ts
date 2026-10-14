import { randomUUID } from "node:crypto";
import type { CreatePlatformFareVersionCommand } from "@drts/contracts";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { computePayloadHash } from "../../../apps/api/src/common/idempotency/canonical-json";
import { FareVersionController } from "../../../apps/api/src/modules/multi-taxi/fare-versions/fare-version.controller";
import { managedFare } from "../../../apps/api/src/modules/multi-taxi/fare-versions/fare-version.mapping";
import type { FareVersionRepository } from "../../../apps/api/src/modules/multi-taxi/fare-versions/fare-version.repository";
import { FareVersionService } from "../../../apps/api/src/modules/multi-taxi/fare-versions/fare-version.service";
import type {
  FareCommandInput,
  FareState,
  FareVersionData,
  FareVersionStore,
} from "../../../apps/api/src/modules/multi-taxi/fare-versions/fare-version.types";

export const NOW = "2026-10-13T12:00:00.000Z";
export const identity: BootstrapRequestIdentity = {
  authMode: "bootstrap_headers",
  actorId: randomUUID(),
  actorType: "platform_admin",
  realm: "platform",
  tenantId: null,
  roleFamilies: ["platform"],
  roles: ["platform_admin"],
  scopes: ["foundation:read", "foundation:write"],
  requestId: null,
};
export function seed(): FareVersionData {
  return {
    tariff: {
      version: "taipei-20230401",
      effectiveAt: "2023-03-31T16:00:00.000Z",
      effectiveUntil: null,
      baseFare: 85,
      baseDistanceMeters: 1250,
      distanceRate: 5,
      distanceIncrementMeters: 200,
      delayRate: 5,
      delayIncrementSeconds: 60,
      nightSurchargeAmount: 20,
      nightSurchargeWindowStart: "23:00",
      nightSurchargeWindowEnd: "06:00",
      additionalFees: {},
      distanceRounding: "ceil",
      delayRounding: "floor",
      totalRounding: "floor",
      totalIncrement: 5,
      nightApplication: "pickup",
      sourceReference: "2026-10-10 approved Taipei tariff",
    },
    dbStatus: "published",
    displayName: "taipei-20230401",
    publicSummary: "2026-10-10 approved Taipei tariff",
    authorityFilingRef: null,
    filingEvidenceReference: null,
    filedAt: null,
    filedBy: null,
    revision: 0,
    createdAt: "2023-03-31T16:00:00.000Z",
    createdBy: null,
    updatedAt: "2023-03-31T16:00:00.000Z",
    updatedBy: "",
    retiredReason: null,
  };
}
export function command(id = "test-draft"): CreatePlatformFareVersionCommand {
  const tariff = managedFare(seed(), NOW).tariff;
  const sourceReference = seed().tariff.sourceReference;
  return {
    fareVersionId: id,
    displayName: "Proposed tariff",
    publicSummary: "Explicit proposed values",
    sourceReference,
    effectiveFrom: "2026-10-20T00:00:00.000Z",
    tariff,
  };
}
export function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
export function fixture(initial = [seed()]) {
  let state: FareState = {
    records: structuredClone(initial),
    evaluatedAt: NOW,
  };
  let tail = Promise.resolve();
  const receipts = new Map<string, { hash: string; version: string }>();
  const gates: ReturnType<typeof deferred>[] = [];
  const writes: FareCommandInput[] = [];
  const store: FareVersionStore = {
    read: async () => structuredClone(state),
    execute: async (input, operation) => {
      const prior = tail;
      let release!: () => void;
      tail = new Promise<void>((r) => {
        release = r;
      });
      await prior;
      try {
        const key = `${input.actorId}:${input.operation}:${input.idempotencyKey}`;
        const hash = computePayloadHash({
          version: input.version,
          payload: input.payload,
        });
        const receipt = receipts.get(key);
        if (receipt && receipt.hash !== hash)
          throw new ApiRequestError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "Changed payload",
          );
        const staged = structuredClone(state);
        if (!receipt) {
          await operation({
            ...staged,
            save: async (row) => {
              const i = staged.records.findIndex(
                (x) => x.tariff.version === row.tariff.version,
              );
              if (i < 0) staged.records.push(structuredClone(row));
              else staged.records[i] = structuredClone(row);
            },
          });
          const gate = gates.shift();
          if (gate) await gate.promise;
          state = staged;
          receipts.set(key, { hash, version: input.version });
          writes.push(input);
        }
        return managedFare(
          state.records.find((x) => x.tariff.version === input.version)!,
          state.evaluatedAt,
        );
      } finally {
        release();
      }
    },
  };
  const service = new FareVersionService(store as FareVersionRepository);
  const controller = new FareVersionController(service);
  return {
    service,
    controller,
    store,
    gates,
    receipts,
    writes,
    state: () => structuredClone(state),
    clock: (at: string) => {
      state.evaluatedAt = at;
    },
  };
}
export async function filed(f: ReturnType<typeof fixture>, id: string) {
  const created = (
    await f.controller.create(command(id), identity, `create-${id}`)
  ).data;
  return (
    await f.controller.file(
      id,
      {
        expectedRevision: created.revision,
        authorityFilingRef: `TEST-EVIDENCE-${id}`,
        filingEvidenceReference: `test-evidence://${id}`,
      },
      identity,
      `file-${id}`,
    )
  ).data;
}
