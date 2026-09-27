import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { partnerNotificationHttpsFetch } from "../../src/modules/tenant-partner/partner-notification-https";
import * as http from "node:http";

describe("explicit_controlled_receiver_optin_tested", () => {
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    vi.unstubAllEnvs();
    server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "success" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    server.close();
  });

  it("fails locally if test env but DRTS_ALLOW_LOCAL_WEBHOOKS is not explicitly true", async () => {
    vi.stubEnv("NODE_ENV", "test");
    // DRTS_ALLOW_LOCAL_WEBHOOKS is unset
    await expect(partnerNotificationHttpsFetch(`http://127.0.0.1:${port}/`)).rejects.toThrow("partner_endpoint_not_public_https");
  });

  it("fails locally if production even if DRTS_ALLOW_LOCAL_WEBHOOKS is explicitly true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DRTS_ALLOW_LOCAL_WEBHOOKS", "true");
    await expect(partnerNotificationHttpsFetch(`http://127.0.0.1:${port}/`)).rejects.toThrow("partner_endpoint_not_public_https");
  });

  it("succeeds locally if test env and DRTS_ALLOW_LOCAL_WEBHOOKS is explicitly true", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DRTS_ALLOW_LOCAL_WEBHOOKS", "true");
    const result = await partnerNotificationHttpsFetch(`http://127.0.0.1:${port}/`);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    const bodyText = await result.text!();
    expect(JSON.parse(bodyText).status).toBe("success");
  });
});
