import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../packages/api-client/src/index";

const grant = {
  proofId: "proof-unit",
  readbackUrl:
    "/api/reimbursements/proof-downloads/remittance-proof/proof-unit?sig=unit-signature&sig_v=1",
  issuedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2026-01-01T00:15:00Z",
};
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proof client uses the actual API/BFF path for binary content", () => {
  it.each(["https://api.example.test", "/control-plane-proxy"])(
    "downloads through %s with unchanged signed query and real bytes",
    async (baseUrl) => {
      const bytes = "%PDF proof unit bytes";
      const fetcher = vi.fn(
        async () =>
          new Response(bytes, {
            headers: { "Content-Type": "application/pdf" },
          }),
      );
      vi.stubGlobal("fetch", fetcher);
      const client = new ApiClient({
        baseUrl,
        pathTransform: baseUrl.startsWith("/")
          ? (path) => path.replace(/^\/api/, "")
          : undefined,
      });
      const content = await client.downloadRemittanceProof(grant);
      expect(await content.text()).toBe(bytes);
      expect(content.type).toBe("application/pdf");
      const suffix = baseUrl.startsWith("/")
        ? grant.readbackUrl.replace(/^\/api/, "")
        : grant.readbackUrl;
      expect(fetcher).toHaveBeenCalledWith(
        `${baseUrl}${suffix}`,
        expect.objectContaining({
          method: "GET",
          cache: "no-store",
          redirect: "error",
        }),
      );
    },
  );
  it.each([
    "https://attacker.example.test/proof",
    "//attacker.example.test/proof",
    "/api/reimbursements/proof-downloads/remittance-proof/other?sig=x",
    "/api/users?sig=x",
  ])(
    "rejects unsafe/wrong grant target %s before network access",
    async (readbackUrl) => {
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      const client = new ApiClient({ baseUrl: "/control-plane-proxy" });
      await expect(
        client.downloadRemittanceProof({ ...grant, readbackUrl }),
      ).rejects.toThrow(/Invalid proof/);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("surfaces expired grants instead of treating an error envelope as file bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "REMITTANCE_PROOF_GRANT_INVALID",
                message: "expired",
                retryable: false,
                traceId: "unit",
              },
            }),
            { status: 410 },
          ),
      ),
    );
    await expect(
      new ApiClient({
        baseUrl: "/control-plane-proxy",
      }).downloadRemittanceProof(grant),
    ).rejects.toMatchObject({
      statusCode: 410,
      code: "REMITTANCE_PROOF_GRANT_INVALID",
    });
  });
  it("rejects HTML/empty successful responses", async () => {
    const client = new ApiClient({ baseUrl: "/control-plane-proxy" });
    for (const [body, type] of [
      ["<html>login</html>", "text/html"],
      ["", "application/pdf"],
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () => new Response(body, { headers: { "Content-Type": type } }),
        ),
      );
      await expect(client.downloadRemittanceProof(grant)).rejects.toThrow(
        /Invalid proof download content/,
      );
    }
  });
  it("looks up a pre-payment proof by batch and requests a scan without a caller verdict", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            data: { proofId: "proof-unit", scanState: "clean" },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const client = new ApiClient({
      baseUrl: "/control-plane-proxy",
      pathTransform: (path) => path.replace(/^\/api/, ""),
    });
    await client.getReimbursementProof("batch/encoded");
    expect(fetcher).toHaveBeenLastCalledWith(
      "/control-plane-proxy/reimbursements/batch%2Fencoded/proof",
      expect.objectContaining({ method: "GET" }),
    );
    await client.scanRemittanceProof("proof-unit");
    expect(fetcher).toHaveBeenLastCalledWith(
      "/control-plane-proxy/reimbursements/proofs/proof-unit/scan",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetcher.mock.calls[1]![1]).not.toHaveProperty("body");
  });
});
