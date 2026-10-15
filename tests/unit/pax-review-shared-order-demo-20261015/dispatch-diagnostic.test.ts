import { expect, it, vi } from "vitest";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { dispatchResponseDiagnostic } from "../../e2e/pax-review-shared-order/dispatch-diagnostic";

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

it("projects only the fixed eligibility enums in a bounded stable order", async () => {
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
      { status: () => 409, json: async () => error.getResponse() },
      false,
    ),
  ).toBe(
    "Ops assign status=409 code=ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT reasons=SERVICE_PRODUCT_INACTIVE,DRIVER_TRAINING_INCOMPLETE",
  );
});

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
