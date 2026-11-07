import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Data = Record<string, unknown>;
const data = (value: unknown) => value as Data;

// Execute the real controller, its existing own-task check, committed order
// read and canonical clone bodies. Only DB/task/compliance IO is injected;
// no HTTP server, product handler substitute, or browser is involved.
async function originalExecutables() {
  const read = async (path: string) => {
    const source = await readFile(
      new URL(`../../../${path}`, import.meta.url),
      "utf8",
    );
    return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  };
  const [controller, service, auth, envelope] = await Promise.all([
    read("apps/api/src/modules/owned-mobility/owned-mobility.controller.ts"),
    read("apps/api/src/modules/owned-mobility/owned-mobility.service.ts"),
    read("apps/api/src/common/auth/auth.extractor.ts"),
    read("apps/api/src/common/api-envelope.ts"),
  ]);
  const printer = ts.createPrinter();
  const modifiers = (items: ts.NodeArray<ts.ModifierLike> | undefined) =>
    items?.filter(
      (item) =>
        !ts.isDecorator(item) && item.kind !== ts.SyntaxKind.ExportKeyword,
    );
  const method = (tree: ts.SourceFile, name: string) => {
    let found: ts.MethodDeclaration | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isMethodDeclaration(node) && node.name.getText(tree) === name)
        found = node;
      ts.forEachChild(node, visit);
    };
    visit(tree);
    if (!found?.body) throw new Error(`Missing original method ${name}`);
    const params = found.parameters.map((p) =>
      ts.factory.updateParameterDeclaration(
        p,
        modifiers(p.modifiers),
        p.dotDotDotToken,
        p.name,
        p.questionToken,
        p.type,
        p.initializer,
      ),
    );
    return printer.printNode(
      ts.EmitHint.Unspecified,
      ts.factory.updateMethodDeclaration(
        found,
        modifiers(found.modifiers),
        found.asteriskToken,
        found.name,
        found.questionToken,
        found.typeParameters,
        params,
        found.type,
        found.body,
      ),
      tree,
    );
  };
  const fn = (tree: ts.SourceFile, name: string) => {
    let found: ts.FunctionDeclaration | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name)
        found = node;
      ts.forEachChild(node, visit);
    };
    visit(tree);
    if (!found?.body) throw new Error(`Missing original function ${name}`);
    return printer.printNode(
      ts.EmitHint.Unspecified,
      ts.factory.updateFunctionDeclaration(
        found,
        modifiers(found.modifiers),
        found.asteriskToken,
        found.name,
        found.typeParameters,
        found.parameters,
        found.type,
        found.body,
      ),
      tree,
    );
  };
  const code = [
    fn(auth, "normalizeDriverId"),
    fn(auth, "isDriverIdentityMatching"),
    fn(envelope, "toApiSuccessEnvelope"),
    `class ServiceProbe {${["getOrderForRead", "cloneOrder", "resolveDispatchQueueState", "referralRatingResult"].map((name) => method(service, name)).join("\n")}}`,
    `class ControllerProbe {${["assertDriverTaskAccess", "getDriverTaskOrder"].map((name) => method(controller, name)).join("\n")}}`,
  ].join("\n");
  class ApiRequestError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText + ";({ServiceProbe,ControllerProbe});",
    {
      randomUUID,
      structuredClone,
      Date,
      ApiRequestError,
      HttpStatus: {
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        INTERNAL_SERVER_ERROR: 500,
      },
    },
  ) as {
    ServiceProbe: new () => {
      ownedMobilityRepository: {
        isEnabled(): boolean;
        findOrderById(id: string): Promise<Data>;
      };
      listComplianceGatesForOrder(): unknown[];
      getDriverTaskForRead(id: string): Promise<Data>;
      getOrderForRead(id: string): Promise<Data>;
      referralRatingResult(order: Data): Data;
    };
    ControllerProbe: new () => {
      ownedMobilityService: unknown;
      getDriverTaskOrder(
        id: string,
        identity: Data,
        requestId: string,
      ): Promise<{ data: Data }>;
    };
  };
}

const executables = originalExecutables();
async function fixture(score = 2) {
  const { ServiceProbe, ControllerProbe } = await executables;
  const row: Data = {
    orderId: "same-owned-order",
    orderNo: "same-order-no",
    status: "completed",
    passenger: {
      passengerId: "synthetic-passenger",
      name: "Synthetic rider",
      phone: "synthetic-contact",
    },
    pickup: { address: "SIM original pickup" },
    dropoff: { address: "SIM original dropoff" },
    serviceProductCode: "standard",
    fixedPrice: true,
    quotedFare: { total: 250 },
    proofRequirements: {},
    approvalRequestIds: [],
    complianceFlags: [],
    referralPassengerLifecycle: {
      bookingIdempotencyKey: "original-booking-key",
      quote: { quoteId: "original-quote" },
      confirmedAt: "2026-10-29T00:00:00Z",
      feeConfirmation: { version: "original-fee" },
      complaints: [{ caseNo: "original-manual-case", category: "service" }],
      rating: {
        orderId: "same-owned-order",
        score,
        tags: ["駕駛親切"],
        comment: "SIM individual feedback must not identify its rider",
        contactRequested: false,
        complaintCaseNo: score <= 2 ? "original-low-rating-case" : null,
        createdTimelineId: score <= 2 ? "original-created-timeline" : null,
        submittedAt: "2026-10-29T01:00:00Z",
        policyVersion: "referral_rating_v1",
      },
    },
  };
  const service = new ServiceProbe();
  service.ownedMobilityRepository = {
    isEnabled: () => true,
    findOrderById: async () => structuredClone(row),
  };
  service.listComplianceGatesForOrder = () => [];
  service.getDriverTaskForRead = async (taskId) => ({
    taskId,
    orderId: row.orderId,
    driverId: "own-driver",
    status: "completed",
  });
  const controller = new ControllerProbe();
  controller.ownedMobilityService = service;
  const identity = {
    realm: "driver",
    actorType: "driver_user",
    actorId: "own-driver",
    scopes: ["driver:read"],
  };
  const read = (who: Data = identity) =>
    controller.getDriverTaskOrder("own-task", who, "original-request");
  return { row, service, identity, read };
}

describe("R04 normal Driver order read preserves trip functions without individual rating attribution", () => {
  it.each([1, 2, 3, 4, 5])(
    "does not expose the same rider's individual %s-star rating through the real order detail handler",
    async (score) => {
      const f = await fixture(score),
        out = (await f.read()).data;
      expect(out.orderId).toBe(f.row.orderId);
      expect(
        Object.hasOwn(data(out.referralPassengerLifecycle), "rating"),
      ).toBe(false);
      expect(JSON.stringify(out)).not.toContain("SIM individual feedback");
      for (const key of [
        "passenger",
        "pickup",
        "dropoff",
        "quotedFare",
        "serviceProductCode",
        "fixedPrice",
      ])
        expect(out[key]).toEqual(f.row[key]);
      const original = data(f.row.referralPassengerLifecycle),
        visible = data(out.referralPassengerLifecycle);
      for (const key of [
        "bookingIdempotencyKey",
        "quote",
        "confirmedAt",
        "feeConfirmation",
        "complaints",
      ])
        expect(visible[key]).toEqual(original[key]);
    },
  );
  it("uses the original driver_user actor predicate as well as the Driver realm", async () => {
    const f = await fixture();
    const out = await f.read({ ...f.identity, realm: "system" });
    expect(
      Object.hasOwn(data(out.data.referralPassengerLifecycle), "rating"),
    ).toBe(false);
  });
  it.each(["ops", "system"])(
    "preserves %s canonical order/rating readback",
    async (realm) => {
      const f = await fixture();
      const out = await f.read({
        realm,
        actorType: realm === "ops" ? "ops_user" : "system",
        actorId: "original-operator",
      });
      expect(data(out.data.referralPassengerLifecycle).rating).toEqual(
        data(f.row.referralPassengerLifecycle).rating,
      );
    },
  );
  it("keeps the original other-Driver 403", async () => {
    const f = await fixture();
    await expect(
      f.read({ ...f.identity, actorId: "other-driver" }),
    ).rejects.toMatchObject({ status: 403, code: "DRIVER_IDENTITY_MISMATCH" });
  });
  it("repeated completed-order reads do not mutate canonical or Passenger rating data", async () => {
    const f = await fixture(),
      original = JSON.stringify(f.row);
    const before = await f.service.getOrderForRead("same-owned-order");
    const passengerBefore = f.service.referralRatingResult(before);
    await f.read();
    await f.read();
    const after = await f.service.getOrderForRead("same-owned-order");
    expect(f.service.referralRatingResult(after)).toEqual(passengerBefore);
    expect(after).toEqual(before);
    expect(JSON.stringify(f.row)).toBe(original);
  });
  it.each([undefined, null, {}])(
    "preserves missing/null/unrated lifecycle without inventing feedback",
    async (lifecycle) => {
      const f = await fixture();
      if (lifecycle === undefined) delete f.row.referralPassengerLifecycle;
      else f.row.referralPassengerLifecycle = lifecycle;
      const before = await f.service.getOrderForRead("same-owned-order"),
        out = (await f.read()).data;
      expect(out.referralPassengerLifecycle).toEqual(
        before.referralPassengerLifecycle,
      );
    },
  );
});
