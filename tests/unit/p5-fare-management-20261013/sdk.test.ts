import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../../packages/api-client/src/index";
import {
  demoFareList,
  fareEditor,
  fareEditorCommand,
} from "../../../apps/platform-admin-web/app/platform-admin/p5/fares/fare-management-model";

afterEach(() => vi.unstubAllGlobals());
const list = demoFareList("2026-10-13T00:00:00.000Z");
list.items[0]!.tariff.additionalFees = JSON.parse(
  '{"Airport_Fee":35,"night-fee":20,"__proto__":4}',
);
const record = list.items[0]!;
const editor = fareEditor(record, false);
editor.publicSummary = "Supplied proposal";
const create = fareEditorCommand(editor);
const { fareVersionId: _id, ...draft } = create;
void _id;
const update = { ...draft, expectedRevision: 7 };

describe("P5 fare SDK wire contract", () => {
  it.each(["list", "get"] as const)(
    "%s preserves server metadata and opaque fee keys through the existing proxy transform",
    async (action) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          Response.json({ data: action === "list" ? list : record }),
        );
      vi.stubGlobal("fetch", fetch);
      const client = new ApiClient({
        baseUrl: "https://unit.invalid/control-plane-proxy",
        pathTransform: (path) => path.replace(/^\/api/, ""),
      });
      const result =
        action === "list"
          ? await client.listPlatformFareVersions()
          : await client.getPlatformFareVersion("fare /A");
      expect(result).toEqual(action === "list" ? list : record);
      expect(fetch.mock.calls[0]![0]).toBe(
        "https://unit.invalid/control-plane-proxy/platform-admin/multi-taxi/fare-versions" +
          (action === "get" ? "/fare%20%2FA" : ""),
      );
      expect(fetch.mock.calls[0]![1].method).toBe("GET");
    },
  );

  const commands = [
    ["create", "POST", "", create],
    ["update", "PUT", "/fare%20%2FA", update],
    [
      "file",
      "POST",
      "/fare%20%2FA/file",
      {
        expectedRevision: 7,
        authorityFilingRef: "operator-ref",
        filingEvidenceReference: "operator-evidence",
      },
    ],
    [
      "schedule",
      "POST",
      "/fare%20%2FA/schedule",
      { expectedRevision: 7, effectiveFrom: "2026-11-01T00:00:00.000Z" },
    ],
    [
      "immediate",
      "POST",
      "/fare%20%2FA/schedule",
      { expectedRevision: 7, effectiveFrom: null },
    ],
    [
      "retire",
      "POST",
      "/fare%20%2FA/retire",
      { expectedRevision: 7, reason: "Withdraw draft" },
    ],
  ] as const;
  for (const [action, method, path, body] of commands)
    it(`${action} carries exact payload and retry key and reads the committed record`, async () => {
      const fetch = vi.fn().mockResolvedValue(Response.json({ data: record }));
      vi.stubGlobal("fetch", fetch);
      const client = new ApiClient({
        baseUrl: "https://unit.invalid",
        defaultHeaders: { "x-request-origin": "platform" },
      });
      const key = "same-intent-key";
      const result =
        action === "create"
          ? await client.createPlatformFareVersion(body, key)
          : action === "update"
            ? await client.updatePlatformFareVersion("fare /A", body, key)
            : action === "file"
              ? await client.recordPlatformFareVersionFiling(
                  "fare /A",
                  body,
                  key,
                )
              : action === "retire"
                ? await client.retirePlatformFareVersion("fare /A", body, key)
                : await client.schedulePlatformFareVersion(
                    "fare /A",
                    body,
                    key,
                  );
      expect(result).toEqual(record);
      const [url, init] = fetch.mock.calls[0]!;
      expect(url).toBe(
        `https://unit.invalid/api/platform-admin/multi-taxi/fare-versions${path}`,
      );
      expect(init.method).toBe(method);
      expect(init.headers["Idempotency-Key"]).toBe(key);
      expect(init.headers["x-request-origin"]).toBe("platform");
      expect(JSON.parse(init.body)).toEqual(body);
    });

  it.each([
    [409, "fare_revision_conflict"],
    [503, "fare_management_unavailable"],
  ] as const)(
    "propagates %s without synthetic success",
    async (status, code) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json(
            {
              error: {
                code,
                message: "Operator can retry",
                retryable: status === 503,
                traceId: "unit-trace",
              },
            },
            { status },
          ),
        ),
      );
      await expect(
        new ApiClient({
          baseUrl: "https://unit.invalid",
        }).updatePlatformFareVersion("draft", update, "intent"),
      ).rejects.toMatchObject({ statusCode: status, code });
    },
  );
});
