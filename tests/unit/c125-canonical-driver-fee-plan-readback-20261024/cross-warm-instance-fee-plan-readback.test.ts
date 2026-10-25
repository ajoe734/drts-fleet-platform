import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";

/**
 * Two warm API instances, one canonical DB: A publishes a driver fee plan,
 * B (already warm with an empty `driverFeePlans` cache from its own
 * `onModuleInit`) must still see it. Before the C125-F1 fix, `listDriverFeePlans`
 * and `generateDriverStatements` only ever read the local array populated once
 * at boot, so a publish on A was invisible to B for the lifetime of B's
 * process. This fake models the shared canonical store (`billing.
 * phase1_driver_fee_plans` et al.) that both instances' repositories read
 * from/write to, independent of each instance's own in-memory cache.
 */
type CanonicalStore = {
  feePlans: Array<Record<string, unknown>>;
  statements: Array<Record<string, unknown>>;
  reimbursementBatches: Array<Record<string, unknown>>;
  proposals: Map<string, unknown>;
  fanoutClaims: Set<string>;
};

function createCanonicalStore(): CanonicalStore {
  return {
    feePlans: [],
    statements: [],
    reimbursementBatches: [],
    proposals: new Map(),
    fanoutClaims: new Set(),
  };
}

function createWarmInstance(
  store: CanonicalStore,
  options: { failCanonicalReadWith?: Error } = {},
) {
  const auditService = new AuditNotificationService();

  const persistChanges = async (changes: {
    driverFeePlans?: ReadonlyArray<Record<string, unknown>>;
    driverStatements?: ReadonlyArray<Record<string, unknown>>;
    reimbursementBatches?: ReadonlyArray<Record<string, unknown>>;
  }) => {
    for (const feePlan of changes.driverFeePlans ?? []) {
      const idx = store.feePlans.findIndex(
        (plan) => plan.feePlanId === feePlan.feePlanId,
      );
      if (idx >= 0) store.feePlans[idx] = { ...feePlan };
      else store.feePlans = [{ ...feePlan }, ...store.feePlans];
    }
    for (const statement of changes.driverStatements ?? []) {
      const idx = store.statements.findIndex(
        (row) => row.statementId === statement.statementId,
      );
      if (idx >= 0) store.statements[idx] = { ...statement };
      else store.statements = [...store.statements, { ...statement }];
    }
    for (const batch of changes.reimbursementBatches ?? []) {
      const idx = store.reimbursementBatches.findIndex(
        (row) => row.batchId === batch.batchId,
      );
      if (idx >= 0) store.reimbursementBatches[idx] = { ...batch };
      else
        store.reimbursementBatches = [
          ...store.reimbursementBatches,
          { ...batch },
        ];
    }
  };

  const repository = {
    isEnabled: () => true,
    loadState: async () => ({
      tenantBillingProfiles: [],
      tenantInvoices: [],
      driverFeePlans: store.feePlans.map((plan) => ({ ...plan })),
      driverStatements: store.statements.map((row) => ({ ...row })),
      reimbursementBatches: store.reimbursementBatches.map((row) => ({
        ...row,
      })),
      reconciliationIssues: [],
      fulfillmentSegments: [],
      sandboxBillingTreatments: [],
    }),
    loadDriverFeePlans: async () => {
      if (options.failCanonicalReadWith) {
        throw options.failCanonicalReadWith;
      }
      return store.feePlans.map((plan) => ({ ...plan }));
    },
    persistChanges,
    reportPersistenceFailure: vi.fn(),
    listLiveDriverTripsInPeriod: async () => [],
    listLiveDriverTripsInPeriodForDriver: async () => [],
    withDriverStatementTarget: async (
      identity: {
        periodMonth: string;
        driverId: string;
        feePlanVersion: string;
      },
      execute: (target: {
        load: () => Promise<{
          statements: Record<string, unknown>[];
          reimbursements: Record<string, unknown>[];
        }>;
        reserve: (create: () => unknown) => Promise<unknown>;
        persist: (changes: Record<string, unknown>) => Promise<void>;
        claimSuccessEffects: () => Promise<boolean>;
      }) => Promise<unknown>,
    ) => {
      const key = JSON.stringify([
        identity.periodMonth,
        identity.driverId,
        identity.feePlanVersion,
      ]);
      return execute({
        load: async () => ({
          statements: store.statements
            .filter(
              (row) =>
                row.periodMonth === identity.periodMonth &&
                row.driverId === identity.driverId &&
                row.feePlanVersion === identity.feePlanVersion,
            )
            .map((row) => ({ ...row })),
          reimbursements: store.reimbursementBatches
            .filter(
              (row) =>
                row.periodMonth === identity.periodMonth &&
                row.driverId === identity.driverId,
            )
            .map((row) => ({ ...row })),
        }),
        reserve: async (create) => {
          const prior = store.proposals.get(key);
          if (prior) return prior;
          const proposal = create();
          store.proposals.set(key, proposal);
          return proposal;
        },
        persist: (changes) => persistChanges(changes),
        claimSuccessEffects: async () => {
          if (store.fanoutClaims.has(key)) return false;
          store.fanoutClaims.add(key);
          return true;
        },
      });
    },
  } as unknown as BillingSettlementRepository;

  return {
    auditService,
    service: new BillingSettlementService(auditService, repository),
  };
}

describe("C125-F1: canonical driver fee plan readback across already-warm API instances", () => {
  it("makes a plan published on instance A visible to instance B's list/generate, not B's stale local array", async () => {
    const store = createCanonicalStore();
    const instanceA = createWarmInstance(store);
    const instanceB = createWarmInstance(store);
    await instanceA.service.onModuleInit();
    await instanceB.service.onModuleInit();

    await instanceA.service.publishDriverFeePlan(
      {
        planName: "Cross Warm Fee Plan",
        version: "cross-warm-v1",
        serviceFeeBps: 1200,
        reimbursementMode: "platform_funded",
      },
      "publish-on-a",
    );

    // B's own in-memory cache was populated once at its boot, before A's
    // publish existed; it never sees the publish on its own.
    expect(instanceB.service.listDriverFeePlans()).toEqual([]);

    // The production read path (controller GET /driver-fee-plans) always
    // refreshes from the canonical source immediately before listing.
    await instanceB.service.refreshDriverFeePlansFromCanonicalSource();
    const plansOnB = instanceB.service.listDriverFeePlans();
    expect(plansOnB).toHaveLength(1);
    expect(plansOnB[0]?.version).toBe("cross-warm-v1");
  });

  it("generateDriverStatements on an already-warm instance selects the canonically published plan without a manual refresh", async () => {
    const store = createCanonicalStore();
    const instanceA = createWarmInstance(store);
    const instanceC = createWarmInstance(store);
    // Both warm up before any fee plan exists.
    await instanceA.service.onModuleInit();
    await instanceC.service.onModuleInit();

    await instanceA.service.publishDriverFeePlan(
      {
        planName: "Cross Warm Generation Plan",
        version: "cross-warm-gen-v1",
        serviceFeeBps: 1500,
        reimbursementMode: "platform_funded",
      },
      "publish-on-a",
    );

    // instanceC never refreshed its cache manually; generateDriverStatements
    // must refresh internally before reading the active plan.
    const result = await instanceC.service.generateDriverStatements(
      { periodMonth: "2026-03" },
      "generate-on-c",
    );

    expect(result.items.length).toBeGreaterThan(0);
    for (const statement of result.items) {
      expect(statement.feePlanVersion).toBe("cross-warm-gen-v1");
    }
  });

  it("preserves the immutable-version conflict check across instances: B rejects a duplicate of A's plan it never locally cached", async () => {
    const store = createCanonicalStore();
    const instanceA = createWarmInstance(store);
    const instanceB = createWarmInstance(store);
    await instanceA.service.onModuleInit();
    await instanceB.service.onModuleInit();

    await instanceA.service.publishDriverFeePlan(
      {
        planName: "Cross Warm Immutable Plan",
        version: "cross-warm-immutable-v1",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      },
      "publish-on-a",
    );

    try {
      await instanceB.service.publishDriverFeePlan({
        planName: "Cross Warm Immutable Plan",
        version: "cross-warm-immutable-v1",
        serviceFeeBps: 9999,
        reimbursementMode: "mixed",
      });
      expect.unreachable(
        "a version already published on A must stay immutable on B",
      );
    } catch (error) {
      const response = (
        error as {
          getResponse?: () => {
            error?: {
              code?: string;
            };
          };
        }
      ).getResponse?.();

      expect(response?.error?.code).toBe("FEE_PLAN_IMMUTABLE");
    }
  });

  /**
   * C125-F2 root-cause check: `resolveOperationalEditableCase`
   * (tests/e2e/operational-document-upload.ts) tries real candidate periods
   * 2026-03/2026-06 and does not swallow a 400 as "no data yet" -- it must
   * genuinely have eligible trips in at least one of them. That eligibility
   * (`eligibleForDriverStatement`) is decided entirely in billing-settlement
   * (independent of the fleet-partner affiliation/revenue-share seed, which
   * is already unconditional in `fleet-partner.service.ts`), so this proves
   * the real precondition for both hardcoded periods holds once the F1
   * canonical fee-plan fix lets an already-warm instance see a publish it
   * never issued itself -- there was no missing trip/business data, only an
   * invisible fee plan.
   */
  it("both hardcoded editable-case setup periods (2026-03, 2026-06) have real eligible-trip statement data once the canonical fee plan is visible", async () => {
    const store = createCanonicalStore();
    const instanceA = createWarmInstance(store);
    const instanceD = createWarmInstance(store);
    await instanceA.service.onModuleInit();
    await instanceD.service.onModuleInit();

    await instanceA.service.publishDriverFeePlan(
      {
        planName: "Editable Case Setup Fee Plan",
        version: "editable-case-setup-v1",
        serviceFeeBps: 1100,
        reimbursementMode: "platform_funded",
      },
      "publish-on-a",
    );

    for (const periodMonth of ["2026-03", "2026-06"]) {
      const result = await instanceD.service.generateDriverStatements(
        { periodMonth },
        `generate-on-d-${periodMonth}`,
      );
      expect(result.items.length).toBeGreaterThan(0);
    }
  });
});

describe("C125-F1: same-instance pending-publication immutability", () => {
  it("rejects a same name/version publish that arrives while an earlier publish's persistence ACK is still pending, without a second canonical write", async () => {
    const store = createCanonicalStore();
    const publishWrites: Array<Record<string, unknown>>[] = [];
    const firstPersistStarted = (() => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    })();
    const releasePersist = (() => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    })();
    let firstWriteObserved = false;

    const auditService = new AuditNotificationService();
    const repository = {
      isEnabled: () => true,
      loadState: async () => ({
        tenantBillingProfiles: [],
        tenantInvoices: [],
        driverFeePlans: store.feePlans.map((plan) => ({ ...plan })),
        driverStatements: [],
        reimbursementBatches: [],
        reconciliationIssues: [],
        fulfillmentSegments: [],
        sandboxBillingTreatments: [],
      }),
      // While the first publish's persistence ACK is held pending, a
      // canonical read reflects what has actually committed so far: nothing.
      // This is what used to let a same-instance duplicate publish's refresh
      // overwrite `driverFeePlans` and miss the first publish's own
      // not-yet-committed in-memory entry.
      loadDriverFeePlans: async () =>
        store.feePlans.map((plan) => ({ ...plan })),
      persistChanges: async (changes: {
        driverFeePlans?: ReadonlyArray<Record<string, unknown>>;
      }) => {
        if (changes.driverFeePlans?.length) {
          publishWrites.push(
            changes.driverFeePlans.map((plan) => ({ ...plan })),
          );
          if (!firstWriteObserved) {
            firstWriteObserved = true;
            firstPersistStarted.resolve();
            await releasePersist.promise;
          }
          for (const plan of changes.driverFeePlans) {
            store.feePlans = [{ ...plan }, ...store.feePlans];
          }
        }
      },
      reportPersistenceFailure: vi.fn(),
    } as unknown as BillingSettlementRepository;

    const service = new BillingSettlementService(auditService, repository);
    await service.onModuleInit();

    const command = {
      planName: "Pending Publication Control",
      version: "pending-publication-v1",
      serviceFeeBps: 1000,
      reimbursementMode: "platform_funded" as const,
    };

    const first = service.publishDriverFeePlan(command).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
    await firstPersistStarted.promise;

    // The second publish of the exact same name/version starts here, while
    // the first is still awaiting its persistence ACK inside persistChanges.
    const second = await service
      .publishDriverFeePlan({ ...command, serviceFeeBps: 2000 })
      .then(
        (value) => ({ status: "fulfilled" as const, value }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );
    releasePersist.resolve();
    const first_ = await first;

    expect(first_.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    if (second.status === "rejected") {
      const response = (
        second.error as {
          getResponse?: () => { error?: { code?: string } };
        }
      ).getResponse?.();
      expect(response?.error?.code).toBe("FEE_PLAN_IMMUTABLE");
    }
    // Only the first publish ever reached the external persistence adapter.
    expect(publishWrites).toHaveLength(1);
    expect(store.feePlans).toHaveLength(1);
  });

  it("does not reject two distinct name/version pairs whose literal `::` join happens to coincide", async () => {
    // (planName="Night::Plan", version="v1") and (planName="Night",
    // version="Plan::v1") both join to the literal string
    // "Night::Plan::v1" under a naive `${planName}::${version}` key. They
    // are a genuinely different pair and must both be allowed to publish
    // concurrently, not have the second one rejected as a duplicate of the
    // first.
    const store = createCanonicalStore();
    const instance = createWarmInstance(store);
    await instance.service.onModuleInit();

    const [first, second] = await Promise.all([
      instance.service
        .publishDriverFeePlan({
          planName: "Night::Plan",
          version: "v1",
          serviceFeeBps: 1000,
          reimbursementMode: "platform_funded",
        })
        .then(
          (value) => ({ status: "fulfilled" as const, value }),
          (error: unknown) => ({ status: "rejected" as const, error }),
        ),
      instance.service
        .publishDriverFeePlan({
          planName: "Night",
          version: "Plan::v1",
          serviceFeeBps: 2000,
          reimbursementMode: "mixed",
        })
        .then(
          (value) => ({ status: "fulfilled" as const, value }),
          (error: unknown) => ({ status: "rejected" as const, error }),
        ),
    ]);

    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("fulfilled");
    expect(instance.service.listDriverFeePlans()).toHaveLength(2);
  });

  it("still rejects a genuine same name/version duplicate once the collision-free key is in place", async () => {
    const store = createCanonicalStore();
    const instance = createWarmInstance(store);
    await instance.service.onModuleInit();

    await instance.service.publishDriverFeePlan({
      planName: "Night::Plan",
      version: "v1",
      serviceFeeBps: 1000,
      reimbursementMode: "platform_funded",
    });

    await expect(
      instance.service.publishDriverFeePlan({
        planName: "Night::Plan",
        version: "v1",
        serviceFeeBps: 9999,
        reimbursementMode: "mixed",
      }),
    ).rejects.toMatchObject({
      getResponse: expect.any(Function),
    });
  });
});

describe("C125-F1: a failed canonical fee-plan read must not fall through to a stale financial decision", () => {
  it("refreshDriverFeePlansFromCanonicalSource propagates the read failure instead of resolving silently", async () => {
    const store = createCanonicalStore();
    const readFailure = new Error("canonical read unavailable");
    const instance = createWarmInstance(store, {
      failCanonicalReadWith: readFailure,
    });
    await instance.service.onModuleInit();

    await expect(
      instance.service.refreshDriverFeePlansFromCanonicalSource(),
    ).rejects.toMatchObject({
      code: "DRIVER_FEE_PLANS_CANONICAL_READ_UNAVAILABLE",
    });
  });

  it("publishDriverFeePlan stops before the duplicate-version check and never mutates on a failed canonical read", async () => {
    const store = createCanonicalStore();
    const readFailure = new Error("canonical read unavailable");
    const instance = createWarmInstance(store, {
      failCanonicalReadWith: readFailure,
    });
    await instance.service.onModuleInit();

    await expect(
      instance.service.publishDriverFeePlan({
        planName: "F1 Read Failure Plan",
        version: "f1-read-failure-v1",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      }),
    ).rejects.toMatchObject({
      code: "DRIVER_FEE_PLANS_CANONICAL_READ_UNAVAILABLE",
    });

    // No stale-success publish: the canonical store was never written to,
    // and the instance's own list is still empty, not a fabricated success.
    expect(store.feePlans).toHaveLength(0);
    expect(instance.service.listDriverFeePlans()).toHaveLength(0);
  });

  it("generateDriverStatements stops before selecting a stale/absent fee plan on a failed canonical read", async () => {
    const store = createCanonicalStore();
    const instanceA = createWarmInstance(store);
    await instanceA.service.onModuleInit();
    await instanceA.service.publishDriverFeePlan(
      {
        planName: "F1 Read Failure Generation Plan",
        version: "f1-read-failure-gen-v1",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      },
      "publish-on-a",
    );

    const readFailure = new Error("canonical read unavailable");
    const instanceB = createWarmInstance(store, {
      failCanonicalReadWith: readFailure,
    });
    await instanceB.service.onModuleInit();

    // Must surface the canonical-read failure, not the unrelated "no active
    // fee plan" validation error that an empty-but-successfully-read stale
    // list would have produced.
    await expect(
      instanceB.service.generateDriverStatements({ periodMonth: "2026-03" }),
    ).rejects.toMatchObject({
      code: "DRIVER_FEE_PLANS_CANONICAL_READ_UNAVAILABLE",
    });
    expect(store.statements).toHaveLength(0);
  });
});
