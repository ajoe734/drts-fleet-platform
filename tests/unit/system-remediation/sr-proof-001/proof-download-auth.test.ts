import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BootstrapAuthGuard } from "../../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { validateInternalKey } from "../../../../apps/api/src/common/auth/internal-key.middleware";
import { RemittanceProofService } from "../../../../apps/api/src/modules/billing-settlement/remittance-proof.service";
import { InMemoryRemittanceProofStorageAdapter } from "../../../../apps/api/src/modules/billing-settlement/remittance-proof-storage.adapter";
import { RemittanceProofDownloadController } from "../../../../apps/api/src/modules/billing-settlement/remittance-proof-download.controller";

const apiRequire = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = apiRequire("@nestjs/core") as {
  Reflector: new () => ConstructorParameters<typeof BootstrapAuthGuard>[0];
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function fixture(clean = true) {
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("DRTS_ENV", "staging");
  vi.stubEnv(
    "CONTROLLED_DOWNLOAD_SIGNING_SECRET",
    "offline-proof-auth-signing-secret",
  );
  const storage = new InMemoryRemittanceProofStorageAdapter();
  const proofs = new RemittanceProofService(undefined, storage);
  const bytes = Buffer.from("%PDF offline authorization fixture");
  const staged = await proofs.stageContent(bytes, "application/pdf");
  const proof = await proofs.uploadProof({
    batchId: "unit-batch",
    driverId: "unit-driver",
    originalFilename: "unit.pdf",
    stagedContentRef: staged.stagedContentRef,
    uploadedByActorId: "unit-driver",
  });
  if (clean)
    await proofs.recordScanResult(proof.proofId, {
      scanState: "clean",
      rejectionReason: null,
      scanCompletedAt: new Date().toISOString(),
    });
  const grant = await proofs.requestReadback(proof.proofId);
  const controller = new RemittanceProofDownloadController(proofs);
  async function download(
    url: string,
    headers: Record<string, string> = {},
    expectedKey?: string,
  ) {
    const request = { method: "GET", url, headers };
    await validateInternalKey(request, expectedKey);
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => controller.download,
      getClass: () => RemittanceProofDownloadController,
    } as unknown as Parameters<BootstrapAuthGuard["canActivate"]>[0];
    expect(
      await new BootstrapAuthGuard(new Reflector()).canActivate(context),
    ).toBe(true);
    const parsed = new URL(url, "https://unit.invalid");
    return controller.download(
      proof.proofId,
      Object.fromEntries(parsed.searchParams),
    );
  }
  return { bytes, proof, proofs, grant, download, storage };
}

describe("signed proof through real middleware, open-route guard and byte controller", () => {
  it.each([undefined, "configured-internal-key"])(
    "serves the valid grant without an internal key header (configuration %s)",
    async (key) => {
      const f = await fixture();
      const file = await f.download(f.grant.readbackUrl, {}, key);
      const chunks: Buffer[] = [];
      for await (const chunk of file.getStream())
        chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks)).toEqual(f.bytes);
    },
  );
  it("rejects forged, missing and expired grants before storage access", async () => {
    const f = await fixture();
    const read = vi.spyOn(f.storage, "read");
    const forged = new URL(f.grant.readbackUrl, "https://unit.invalid");
    forged.searchParams.set("sig", "0".repeat(64));
    await expect(
      f.download(forged.pathname + forged.search),
    ).rejects.toMatchObject({ status: 403 });
    await expect(f.download(forged.pathname)).rejects.toMatchObject({
      status: 403,
    });
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse(f.grant.expiresAt) + 1);
    await expect(f.download(f.grant.readbackUrl)).rejects.toMatchObject({
      status: 410,
    });
    expect(read).not.toHaveBeenCalled();
  });
  it("does not let an authenticated proxy header turn an invalid grant into file access", async () => {
    const f = await fixture();
    const headers = { "x-drts-authorization": "Bearer offline-proxy-boundary" };
    const file = await f.download(f.grant.readbackUrl, headers);
    expect(file.getHeaders().length).toBe(f.bytes.length);
    await expect(
      f.download(
        f.grant.readbackUrl.replace(/sig=[^&]+/, "sig=forged"),
        headers,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("keeps pending content inaccessible even with a valid grant", async () => {
    const f = await fixture(false);
    await expect(f.download(f.grant.readbackUrl)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("does not admit other methods, artifact kinds, child paths or encoded path tricks", async () => {
    const f = await fixture();
    const path = f.grant.readbackUrl.split("?")[0]!;
    for (const [method, url] of [
      ["POST", path],
      ["HEAD", path],
      ["GET", path + "/other"],
      ["GET", path.replace("remittance-proof/", "other-kind/")],
      ["GET", path.replace("remit-proof-", "remit%2fproof-")],
      ["GET", "/api/reimbursements/proofs"],
    ] as const) {
      await expect(
        validateInternalKey({ method, url, headers: {} }, "configured-key"),
      ).rejects.toMatchObject({ code: "INTERNAL_KEY_REQUIRED" });
    }
  });
});
