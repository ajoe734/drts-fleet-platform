import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../../packages/api-client/src/index";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { identity, NOW } from "./backend-fixture";
import {
  filteredError,
  opaqueFees,
  unavailableError,
  wireCommand,
  wireHarness,
} from "./wire-harness";

afterEach(() => vi.unstubAllGlobals());

describe("AUTO-WIRE-001 actual controller/serializer -> SDK", () => {
  for (const action of [
    "list",
    "get",
    "create",
    "update",
    "file",
    "schedule",
    "immediate",
    "retire",
  ] as const) {
    it(`${action} returns camel DTO with lossless opaque fees through the real serialized response`, async () => {
      const f = wireHarness();
      const input = wireCommand();
      if (action !== "create" && action !== "list")
        await f.controller.create(input, identity, "prepare-draft");
      if (action === "schedule" || action === "immediate")
        await f.controller.file(
          input.fareVersionId,
          {
            expectedRevision: 1,
            authorityFilingRef: "operator-reference",
            filingEvidenceReference: "operator-evidence",
          },
          identity,
          "prepare-file",
        );
      vi.stubGlobal("fetch", f.fetch);
      const client = new ApiClient({
        baseUrl: "https://unit.invalid/control-plane-proxy",
        pathTransform: (path) => path.replace(/^\/api/, ""),
      });
      const key = "same-intent-key";
      const id = input.fareVersionId;
      const { fareVersionId: _id, ...draft } = input;
      void _id;
      const update = { ...draft, expectedRevision: 1, displayName: "Updated" };
      const filing = {
        expectedRevision: 1,
        authorityFilingRef: "operator-reference",
        filingEvidenceReference: "operator-evidence",
      };
      const schedule = {
        expectedRevision: 2,
        effectiveFrom:
          action === "immediate" ? null : "2026-11-01T00:00:00.000Z",
      };
      const retirement = { expectedRevision: 1, reason: "Withdraw draft" };
      const response =
        action === "list"
          ? await client.listPlatformFareVersions()
          : action === "get"
            ? await client.getPlatformFareVersion(id)
            : action === "create"
              ? await client.createPlatformFareVersion(input, key)
              : action === "update"
                ? await client.updatePlatformFareVersion(id, update, key)
                : action === "file"
                  ? await client.recordPlatformFareVersionFiling(
                      id,
                      filing,
                      key,
                    )
                  : action === "retire"
                    ? await client.retirePlatformFareVersion(
                        id,
                        retirement,
                        key,
                      )
                    : await client.schedulePlatformFareVersion(
                        id,
                        schedule,
                        key,
                      );
      const expected =
        action === "list" ? await f.service.list() : await f.service.get(id);
      expect(response).toEqual(expected);
      const result = "items" in response ? response.items[0]! : response;
      expect(result.tariff.additionalFees).toEqual(opaqueFees);
      expect(Object.keys(result.tariff.additionalFees)).toEqual(
        Object.keys(opaqueFees),
      );
      expect(Object.hasOwn(result.tariff.additionalFees, "__proto__")).toBe(
        true,
      );
      expect(result.availableActions).toBeDefined();
      expect(result.tariff.baseFare).toBe(85);
      if ("items" in response) expect(response.evaluatedAt).toBe(NOW);
      expect(f.requests).toHaveLength(1);
      expect(f.requests[0]!.method).toBe(
        action === "list" || action === "get"
          ? "GET"
          : action === "update"
            ? "PUT"
            : "POST",
      );
      expect(f.requests[0]!.key).toBe(
        action === "list" || action === "get" ? null : key,
      );
      expect(f.requests[0]!.path).toBe(
        `/api/platform-admin/multi-taxi/fare-versions${action === "list" || action === "create" ? "" : `/fare%20%2FA${["file", "schedule", "immediate", "retire"].includes(action) ? `/${action === "immediate" ? "schedule" : action}` : ""}`}`,
      );
      if (action === "create") expect(f.requests[0]!.body).toEqual(input);
      if (action === "update") expect(f.requests[0]!.body).toEqual(update);
      if (action === "file") expect(f.requests[0]!.body).toEqual(filing);
      if (action === "schedule" || action === "immediate")
        expect(f.requests[0]!.body).toEqual(schedule);
      if (action === "retire") expect(f.requests[0]!.body).toEqual(retirement);
    });
  }
});

describe("AUTO-WIRE-002 actual exception filter -> SDK", () => {
  it.each([
    [409, "fare_revision_conflict", false],
    [503, "fare_management_unavailable", true],
  ] as const)(
    "preserves actual %s business code, trace, retryable and details",
    async (status, code, retryable) => {
      const error =
        status === 503
          ? unavailableError()
          : new ApiRequestError(
              status,
              code,
              "Draft changed.",
              { currentRevision: 9 },
              retryable,
            );
      const output = filteredError(error);
      const wire = output.body as {
        error: { trace_id: string; details: unknown; message: string };
      };
      expect(wire.error.trace_id).toEqual(expect.any(String));
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            Response.json(output.body, { status: output.status }),
          ),
      );
      await expect(
        new ApiClient({
          baseUrl: "https://unit.invalid",
        }).getPlatformFareVersion("draft"),
      ).rejects.toMatchObject({
        statusCode: status,
        code,
        retryable,
        traceId: wire.error.trace_id,
        details: wire.error.details,
        apiMessage: wire.error.message,
      });
    },
  );

  it("retains existing camelCase error-envelope compatibility", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "fare_revision_conflict",
              message: "Changed",
              retryable: false,
              traceId: "camel-trace",
              details: { currentRevision: 9 },
            },
          },
          { status: 409 },
        ),
      ),
    );
    await expect(
      new ApiClient({ baseUrl: "https://unit.invalid" }).getPlatformFareVersion(
        "draft",
      ),
    ).rejects.toMatchObject({
      code: "fare_revision_conflict",
      traceId: "camel-trace",
      details: { currentRevision: 9 },
    });
  });
});
