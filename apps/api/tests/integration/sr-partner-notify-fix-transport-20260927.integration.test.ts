import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { partnerNotificationHttpsFetch } from "../../src/modules/tenant-partner/partner-notification-https";
import { EventEmitter } from "node:events";

let capturedRequestUrl: string | undefined;
let capturedRequestBody: any;

vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return {
    ...actual,
    request: vi.fn((url, options, onResponse) => {
      capturedRequestUrl = url.toString();
      const req = new EventEmitter() as any;
      req.end = (body: any) => {
        capturedRequestBody = body;
        queueMicrotask(() => {
          const res = new EventEmitter() as any;
          res.statusCode = 200;
          res.complete = true;
          onResponse(res);
          res.emit("data", Buffer.from('{"status":"success"}'));
          res.emit("end");
        });
        return req;
      };
      return req;
    })
  };
});

describe("explicit_controlled_receiver_optin_tested", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails locally if test env but DRTS_ALLOW_LOCAL_WEBHOOKS is not explicitly true", async () => {
    vi.stubEnv("NODE_ENV", "test");
    // DRTS_ALLOW_LOCAL_WEBHOOKS is unset
    await expect(partnerNotificationHttpsFetch(`http://127.0.0.1:80/`)).rejects.toThrow("partner_endpoint_not_public_https");
  });

  it("fails locally if production even if DRTS_ALLOW_LOCAL_WEBHOOKS is explicitly true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DRTS_ALLOW_LOCAL_WEBHOOKS", "true");
    await expect(partnerNotificationHttpsFetch(`http://127.0.0.1:80/`)).rejects.toThrow("partner_endpoint_not_public_https");
  });

  it("succeeds locally if test env and DRTS_ALLOW_LOCAL_WEBHOOKS is explicitly true (mock external)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DRTS_ALLOW_LOCAL_WEBHOOKS", "true");
    const result = await partnerNotificationHttpsFetch("http://127.0.0.1:80/", { body: "test_body_int" });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(await result.text?.()).toBe('{"status":"success"}');
    expect(capturedRequestUrl).toBe("http://127.0.0.1/");
    expect(capturedRequestBody).toBe("test_body_int");
  });
});
