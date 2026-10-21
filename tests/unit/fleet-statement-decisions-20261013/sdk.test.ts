import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../../packages/api-client/src/index";

afterEach(() => vi.unstubAllGlobals());

describe("fleet statement decision SDK", () => {
  it.each([
    ["confirm", { note: "Reviewed" }, "confirmed"],
    ["confirm", {}, "confirmed"],
    ["dispute", { reason: "Amount differs" }, "disputed"],
  ] as const)(
    "POST %s sends the actual payload and returns the server readback",
    async (action, body, status) => {
      const record = {
        statementId: "fst /27",
        decisionStatus: status,
        confirmNote: "Reviewed",
        disputeCaseId: status === "disputed" ? "case-27" : null,
      };
      const fetch = vi.fn().mockResolvedValue(Response.json({ data: record }));
      vi.stubGlobal("fetch", fetch);
      const client = new ApiClient({
        baseUrl: "https://unit.invalid",
        defaultHeaders: { "x-fleet-partner-id": "fleet-unit" },
      });
      const response =
        action === "confirm"
          ? await client.confirmFleetPartnerStatement(record.statementId, body)
          : await client.disputeFleetPartnerStatement(record.statementId, body);
      expect(response).toEqual(record);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = fetch.mock.calls[0]!;
      expect(url).toBe(
        `https://unit.invalid/api/fleet-partner/statements/fst%20%2F27/${action}`,
      );
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual(body);
      expect(init.headers["x-fleet-partner-id"]).toBe("fleet-unit");
    },
  );

  it.each([409, 503])(
    "propagates %s failure instead of returning a synthetic saved decision",
    async (status) => {
      const fetch = vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "STATEMENT_DECISION_FAILED",
              message: "Cannot save statement",
              retryable: status === 503,
              traceId: "unit-trace",
            },
          },
          { status },
        ),
      );
      vi.stubGlobal("fetch", fetch);
      const client = new ApiClient({ baseUrl: "https://unit.invalid" });
      await expect(
        client.disputeFleetPartnerStatement("fst-27", {
          reason: "Missing trip",
        }),
      ).rejects.toMatchObject({
        statusCode: status,
        apiMessage: "Cannot save statement",
      });
    },
  );
});
