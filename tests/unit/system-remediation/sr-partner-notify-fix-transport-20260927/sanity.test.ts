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

  const setupMockRequest = (reqMock: any, success: boolean = true) => {
    const reqInstance = new EventEmitter() as any;
    reqInstance.end = vi.fn();
    reqMock.mockImplementation((url: URL, options: any, cb: any) => {
      // Simulate DNS lookup
      if (options.lookup) {
        options.lookup(url.hostname, { all: true, verbatim: true }, (err: any, addresses: any) => {
          if (err) {
            reqInstance.emit("error", err);
            return;
          }
          // if successful DNS, simulate request response
          if (success) {
            const resInstance = new EventEmitter() as any;
            resInstance.statusCode = 200;
            resInstance.complete = true;
            cb(resInstance);
            resInstance.emit("data", Buffer.from('{"status":"ok"}'));
            resInstance.emit("end");
          } else {
            reqInstance.emit("error", new Error("connection_failed"));
          }
        });
      }
      return reqInstance;
    });
    return reqInstance;
  };

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

  it("rejects partner.example.test resolving to unsafe IP", async () => {
    const reqInstance = new EventEmitter() as any;
    reqInstance.end = vi.fn();
    (https.request as any).mockImplementation((url: URL, options: any, cb: any) => {
      if (options.lookup) {
        options.lookup(url.hostname, { all: true, verbatim: true }, (err: any, addresses: any) => {
          if (err) reqInstance.emit("error", err);
        });
      }
      return reqInstance;
    });
    (dns.lookup as any).mockImplementation((hostname: string, options: any, cb: any) => {
      cb(null, [{ address: "8.8.8.8", family: 4 }, { address: "169.254.169.254", family: 4 }]);
    });

    await expect(partnerNotificationHttpsFetch("https://partner.example.test/notify")).rejects.toThrow("partner_endpoint_dns_not_public");
    expect(reqInstance.end).not.toHaveBeenCalled();
  });

  it("allows controlled loopback success with expected request bytes", async () => {
    const reqInstance = new EventEmitter() as any;
    reqInstance.end = vi.fn();
    let receivedCb: any;
    (http.request as any).mockImplementation((url: URL, options: any, cb: any) => {
      receivedCb = cb;
      if (options.lookup) {
        options.lookup(url.hostname, { all: true, verbatim: true }, (err: any, addresses: any) => {});
      }
      return reqInstance;
    });
    (dns.lookup as any).mockImplementation((hostname: string, options: any, cb: any) => {
      cb(null, [{ address: "127.0.0.1", family: 4 }]);
    });

    const promise = partnerNotificationHttpsFetch("http://127.0.0.1/notify", { body: "signed_bytes" });

    // Simulate valid HTTP response
    const resInstance = new EventEmitter() as any;
    resInstance.statusCode = 200;
    resInstance.complete = true;
    receivedCb(resInstance);
    resInstance.emit("data", Buffer.from('{"status":"ok"}'));
    resInstance.emit("end");

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    const text = await result.text!();
    expect(text).toBe('{"status":"ok"}');
    expect(reqInstance.end).toHaveBeenCalledWith("signed_bytes");
  });
});
