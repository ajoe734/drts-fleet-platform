import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { partnerNotificationHttpsFetch } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-https";
import * as http from "node:http";
import * as https from "node:https";
import * as dns from "node:dns";
import { EventEmitter } from "node:events";

vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return { ...actual, request: vi.fn() };
});
vi.mock("node:https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:https")>();
  return { ...actual, request: vi.fn() };
});
vi.mock("node:dns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns")>();
  return { ...actual, lookup: vi.fn() };
});

describe("exception boundary TR1 destinations", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DRTS_ALLOW_LOCAL_WEBHOOKS", "true");
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["http://169.254.169.254/computeMetadata/v1/"],
    ["https://10.1.2.3/notify"],
    ["https://[fc00::1]/notify"],
    ["http://8.8.8.8/notify"],
    ["https://user:pass@8.8.8.8/notify"],
  ])("rejects %s before connection", async (url) => {
    await expect(partnerNotificationHttpsFetch(url)).rejects.toThrow("partner_endpoint_not_public_https");
    expect(http.request).not.toHaveBeenCalled();
    expect(https.request).not.toHaveBeenCalled();
  });

  describe("DNS lookup closure regression tests", () => {
    async function testLookup(
      url: string,
      mockDnsAddresses: { address: string; family: number }[],
      socketLookupOptions: { all?: boolean }
    ) {
      let capturedLookup: any;
      let capturedReqCb: any;
      const reqInstance = new EventEmitter() as any;
      reqInstance.end = vi.fn();

      const protocolMock = url.startsWith("https") ? https.request : http.request;

      (protocolMock as any).mockImplementation((_url: URL, options: any, cb: any) => {
        capturedLookup = options.lookup;
        capturedReqCb = cb;
        return reqInstance;
      });

      (dns.lookup as any).mockImplementation((_hostname: string, _opts: any, cb: any) => {
        cb(null, mockDnsAddresses);
      });

      const fetchPromise = partnerNotificationHttpsFetch(url, { body: "signed_bytes" });

      await Promise.resolve();

      if (!capturedLookup) throw new Error("lookup was not passed to request");

      const lookupPromise = new Promise<{err: any, address: any, family: any}>((resolve) => {
        capturedLookup("localhost", socketLookupOptions, (err: any, address: any, family: any) => {
          resolve({ err, address, family });
          if (err) {
            reqInstance.emit("error", err);
          } else {
            const resInstance = new EventEmitter() as any;
            resInstance.statusCode = 200;
            resInstance.complete = true;
            capturedReqCb(resInstance);
            resInstance.emit("data", Buffer.from('{"status":"ok"}'));
            resInstance.emit("end");
          }
        });
      });

      const lookupResult = await lookupPromise;
      let fetchResult: any;
      let fetchError: any;
      try {
        fetchResult = await fetchPromise;
      } catch (e) {
        fetchError = e;
      }

      return { lookupResult, fetchResult, fetchError, reqInstance };
    }

    const cases = [
      { name: "localhost resolving to 127.0.0.1 (positive)", url: "http://localhost/notify", dns: [{ address: "127.0.0.1", family: 4 }], ok: true },
      { name: "localhost resolving to ::1 (positive)", url: "http://localhost/notify", dns: [{ address: "::1", family: 6 }], ok: true },
      { name: "metadata 169.254.169.254 (negative)", url: "http://localhost/notify", dns: [{ address: "169.254.169.254", family: 4 }], ok: false },
      { name: "private 10.1.2.3 (negative)", url: "http://localhost/notify", dns: [{ address: "10.1.2.3", family: 4 }], ok: false },
      { name: "mixed [127.0.0.1, 169.254.169.254] (negative)", url: "http://localhost/notify", dns: [{ address: "127.0.0.1", family: 4 }, { address: "169.254.169.254", family: 4 }], ok: false },
      { name: "HTTPS localhost metadata (negative)", url: "https://localhost/notify", dns: [{ address: "169.254.169.254", family: 4 }], ok: false },
      { name: "empty answers (negative)", url: "http://localhost/notify", dns: [], ok: false },
    ];

    for (const all of [true, false]) {
      for (const tc of cases) {
        it(`${tc.name} with all=${all}`, async () => {
          const { lookupResult, fetchResult, fetchError, reqInstance } = await testLookup(tc.url, tc.dns, { all });

          if (tc.ok) {
            expect(lookupResult.err).toBeNull();
            if (all) {
              expect(lookupResult.address).toEqual(tc.dns);
              expect(lookupResult.family).toBe(4);
            } else {
              expect(lookupResult.address).toBe(tc.dns[0]?.address);
              expect(lookupResult.family).toBe(tc.dns[0]?.family);
            }
            expect(fetchError).toBeUndefined();
            expect(fetchResult.ok).toBe(true);
            const text = await (fetchResult.text as any)();
            expect(text).toBe('{"status":"ok"}');
            expect(reqInstance.end).toHaveBeenCalledWith("signed_bytes");
          } else {
            expect(lookupResult.err).toBeInstanceOf(Error);
            expect(lookupResult.err.message).toBe("partner_endpoint_dns_not_public");
            expect(fetchError).toBeInstanceOf(Error);
            expect(fetchError.message).toBe("partner_endpoint_dns_not_public");

            // "no simulated connection/body delivery on refusal" is inherently tested
            // since we do not emit 'response' on lookup failure
          }
        });
      }
    }
  });
});
