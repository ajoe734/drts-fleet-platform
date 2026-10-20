import { expect, it, vi } from "vitest";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { SnakeCaseExceptionFilter } from "../../../apps/api/src/common/snake-case.exception-filter";
import {
  OwnedMobilityRepository,
  type OwnedMobilityQueryExecutor,
} from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { dispatchResponseDiagnostic } from "../../e2e/pax-review-shared-order/dispatch-diagnostic";

// Only the HTTP transport is substituted; the production filter creates the
// same snake-case envelope that the real Ops BFF passes through unchanged.
function wireError(error: ApiRequestError): unknown {
  let body: unknown;
  new SnakeCaseExceptionFilter().catch(error, {
    switchToHttp: () => ({
      getResponse: () => ({
        status: (status: number) => {
          expect(status).toBe(error.getStatus());
          return {
            json: (value: unknown) => {
              body = value;
            },
          };
        },
      }),
    }),
  } as Parameters<SnakeCaseExceptionFilter["catch"]>[1]);
  return body;
}

it.each([false, true])(
  "projects a formal assignment error, reassign=%s",
  async (reassign) => {
    const error = new ApiRequestError(
      409,
      "P5_DRIVER_REGISTRATION_NOT_ACTIVE",
      "synthetic-private-message",
      {
        driverId: "synthetic-private-driver",
        token: "synthetic-private-token",
      },
    );
    expect(
      await dispatchResponseDiagnostic(
        {
          status: () => error.getStatus(),
          json: async () => error.getResponse(),
        },
        reassign,
      ),
    ).toBe(
      `Ops ${reassign ? "reassign" : "assign"} status=409 code=P5_DRIVER_REGISTRATION_NOT_ACTIVE`,
    );
  },
);

it.each([false, true])(
  "projects only the fixed eligibility enums, wire=%s",
  async (wire) => {
    const error = new ApiRequestError(
      409,
      "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
      "synthetic-private-message",
      {
        reasonCodes: [
          "synthetic-private-reason",
          "DRIVER_TRAINING_INCOMPLETE",
          "SERVICE_PRODUCT_INACTIVE",
          "DRIVER_TRAINING_INCOMPLETE",
          { token: "synthetic-private-token" },
        ],
        latestEligibility: { token: "synthetic-private-token" },
      },
    );
    expect(
      await dispatchResponseDiagnostic(
        {
          status: () => 409,
          json: async () => (wire ? wireError(error) : error.getResponse()),
        },
        false,
      ),
    ).toBe(
      "Ops assign status=409 code=ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT reasons=SERVICE_PRODUCT_INACTIVE,DRIVER_TRAINING_INCOMPLETE",
    );
  },
);

it.each([
  [false, 0],
  [false, 2],
  [true, 0],
  [true, 2],
] as const)(
  "projects the real repository reconciliation error, reassign=%s taskCount=%s",
  async (reassign, taskCount) => {
    // The query adapter supplies only external rows. The actual repository
    // enforces the task reconciliation guard and produces the public error.
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("ops.phase1_dispatch_assignments"))
        return {
          rows: [{ record: { assignmentId: "synthetic-private-assignment" } }],
        };
      if (sql.includes("ops.phase1_driver_tasks"))
        return {
          rows: Array.from({ length: taskCount }, () => ({ record: {} })),
        };
      throw new Error("Unexpected query after reconciliation rejection");
    });
    const error: unknown = await new OwnedMobilityRepository()
      .loadOrderCancellationForUpdate(
        { query } as unknown as OwnedMobilityQueryExecutor,
        "synthetic-private-order",
      )
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    const rejection = error as ApiRequestError;
    expect(rejection.getStatus()).toBe(409);
    expect(query).toHaveBeenCalledTimes(2);
    expect(
      await dispatchResponseDiagnostic(
        {
          status: () => rejection.getStatus(),
          json: async () => wireError(rejection),
        },
        reassign,
      ),
    ).toBe(
      `Ops ${reassign ? "reassign" : "assign"} status=409 code=REDISPATCH_ASSIGNMENT_ALREADY_CLOSED`,
    );
  },
);

it.each([
  null,
  { error: "synthetic-private-code" },
  {
    error: {
      code: "synthetic-private-code",
      details: { reasonCodes: ["DRIVER_ON_LEAVE"] },
    },
  },
  { error: { code: { token: "synthetic-private-token" } } },
  {
    error: {
      code: "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
      details: { reasonCodes: "DRIVER_ON_LEAVE" },
    },
  },
  {
    error: {
      code: "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
      details: { reasonCodes: ["synthetic-private-reason"] },
    },
  },
  {
    error: {
      code: "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
      details: { reason_codes: "DRIVER_ON_LEAVE" },
    },
  },
  {
    error: {
      code: "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
      details: { reason_codes: ["synthetic-private-reason"] },
    },
  },
])("never reflects unknown or malformed error fields %#", async (body) => {
  const known =
    body?.error &&
    typeof body.error === "object" &&
    body.error.code === "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT";
  expect(
    await dispatchResponseDiagnostic(
      { status: () => 409, json: async () => body },
      false,
    ),
  ).toBe(
    `Ops assign status=409 code=${known ? "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT" : "unclassified"}`,
  );
});

it("does not inspect successful responses, including malformed success bodies", async () => {
  const json = vi.fn();
  expect(
    await dispatchResponseDiagnostic({ status: () => 201, json }, false),
  ).toBe("Ops assign status=201 code=unclassified");
  expect(json).not.toHaveBeenCalled();
});

it("keeps non-JSON failures and parser exceptions out of the diagnostic", async () => {
  expect(
    await dispatchResponseDiagnostic(
      {
        status: () => 502,
        json: async () => {
          throw new Error("synthetic-private-parser-token");
        },
      },
      true,
    ),
  ).toBe("Ops reassign status=502 code=unclassified");
});
