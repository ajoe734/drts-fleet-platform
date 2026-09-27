import { lookup } from "node:dns";
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { request, type RequestOptions } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { partnerNotificationHttpsFetch } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-https";

// Only socket and DNS boundaries are replaced. Exercise the actual transport
// under default/false environments as well as production with the harness flag.
// No HTTP, receiver, API, or database server is started by this suite.
vi.mock("node:https", () => ({ request: vi.fn() }));
vi.mock("node:dns", () => ({ lookup: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("partner transport environment isolation", () => {
  for (const [nodeEnv, flag] of [
    ["production", undefined],
    ["production", "false"],
    ["production", "true"],
    ["test", undefined],
    ["test", "false"],
  ] as const) {
    it(`${nodeEnv}/${flag ?? "unset"}: rejects loopback and mixed DNS while allowing public HTTPS`, async () => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("DRTS_ALLOW_LOCAL_WEBHOOKS", flag);
      for (const url of [
        "http://127.0.0.1/notify",
        "https://169.254.169.254/notify",
      ]) {
        await expect(partnerNotificationHttpsFetch(url)).rejects.toThrow(
          "partner_endpoint_not_public_https",
        );
      }
      expect(request).not.toHaveBeenCalled();

      let socketOptions: RequestOptions | undefined;
      const response = new EventEmitter() as IncomingMessage;
      response.statusCode = 204;
      response.destroy = vi.fn(() => response);
      const req = new EventEmitter() as ReturnType<typeof request>;
      vi.mocked(request).mockImplementation(((
        _url: URL,
        options: RequestOptions,
        callback: (incoming: IncomingMessage) => void,
      ) => {
        socketOptions = options;
        req.end = vi.fn(() => {
          callback(response);
          return req;
        }) as typeof req.end;
        return req;
      }) as typeof request);
      await expect(
        partnerNotificationHttpsFetch("https://partner.example.test/notify"),
      ).resolves.toMatchObject({ status: 204 });
      expect(request).toHaveBeenCalledOnce();
      for (const mixed of [false, true]) {
        vi.mocked(lookup).mockImplementation(((
          _host: string,
          _options: unknown,
          done: (
            error: Error | null,
            addresses: { address: string; family: number }[],
          ) => void,
        ) =>
          done(null, [
            { address: "8.8.8.8", family: 4 },
            ...(mixed ? [{ address: "169.254.169.254", family: 4 }] : []),
          ])) as typeof lookup);
        const callback = vi.fn();
        socketOptions!.lookup!("partner.example.test", { all: true }, callback);
        expect(callback).toHaveBeenCalledOnce();
        if (mixed) {
          expect(callback.mock.calls[0]![0]).toEqual(
            new Error("partner_endpoint_dns_not_public"),
          );
        } else {
          expect(callback.mock.calls[0]![0]).toBeNull();
          expect(callback.mock.calls[0]![1]).toEqual([
            { address: "8.8.8.8", family: 4 },
          ]);
        }
      }
    });
  }
});
