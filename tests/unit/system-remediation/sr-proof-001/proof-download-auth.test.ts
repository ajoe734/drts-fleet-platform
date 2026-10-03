import { createRequire } from "node:module";
import { Server as NetServer } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingSettlementRepository } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
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
beforeEach(() => {
  vi.spyOn(NetServer.prototype, "listen").mockImplementation(() => {
    throw new Error(
      "VM restriction: proof authorization tests must not listen",
    );
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const DURABLE_PROOF_ID = "12345678-1234-4123-8123-123456789abc";

/** Only DB I/O is doubled. SQL construction and row-to-domain mapping are
 * the actual repository implementation, including the V0098 raw UUID. */
function repositoryBoundary() {
  let row: Record<string, unknown> | undefined;
  const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
    expect(sql).toContain("billing.phase1_remittance_proofs");
    if (/^\s*INSERT/.test(sql)) {
      expect(sql.split("VALUES")[0]).not.toContain("proof_id");
      row = {
        proof_id: DURABLE_PROOF_ID,
        batch_id: values[0],
        driver_id: values[1],
        uploaded_by_actor_id: values[2],
        original_filename: values[3],
        content_hash: values[4],
        content_type: values[5],
        size_bytes: String(values[6]),
        created_at: values[7],
        scan_state: "pending_scan",
        scan_completed_at: null,
        rejection_reason: null,
      };
    } else {
      expect(values[0]).toBe(DURABLE_PROOF_ID);
      if (/^\s*UPDATE/.test(sql)) {
        expect(sql).toContain("scan_state = 'pending_scan'");
        if (!row || row.scan_state !== "pending_scan") return { rows: [] };
        row = {
          ...row,
          scan_state: values[1],
          scan_completed_at: values[2],
          rejection_reason: values[3],
        };
      } else expect(sql).toMatch(/^\s*SELECT/);
    }
    return { rows: row ? [{ ...row }] : [] };
  });
  return new BillingSettlementRepository({
    isEnabled: () => true,
    query,
  } as unknown as ConstructorParameters<typeof BillingSettlementRepository>[0]);
}

async function createFixture(clean: boolean, durable: boolean) {
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("DRTS_ENV", "staging");
  vi.stubEnv(
    "CONTROLLED_DOWNLOAD_SIGNING_SECRET",
    "offline-proof-auth-signing-secret",
  );
  const storage = new InMemoryRemittanceProofStorageAdapter();
  const proofs = new RemittanceProofService(
    durable ? repositoryBoundary() : undefined,
    storage,
  );
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
  if (durable) expect(proof.proofId).toBe(DURABLE_PROOF_ID);
  else expect(proof.proofId).toMatch(/^remit-proof-/);
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
      parsed.pathname.split("/").at(-1)!,
      Object.fromEntries(parsed.searchParams),
    );
  }
  return { bytes, proof, proofs, grant, download, storage };
}

describe.each(["durable-repository", "test-memory"])(
  "%s signed proof through real middleware, open-route guard and byte controller",
  (kind) => {
    const fixture = (clean = true) =>
      createFixture(clean, kind === "durable-repository");
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
      const headers = {
        "x-drts-authorization": "Bearer offline-proxy-boundary",
      };
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
      const read = vi.spyOn(f.storage, "read");
      await expect(f.download(f.grant.readbackUrl)).rejects.toMatchObject({
        status: 409,
      });
      expect(read).not.toHaveBeenCalled();
    });
    it("binds the signature to the ID extracted from the actual URL", async () => {
      const f = await fixture();
      const read = vi.spyOn(f.storage, "read");
      const differentId = f.proof.proofId.replace(
        /.$/,
        f.proof.proofId.endsWith("0") ? "1" : "0",
      );
      await expect(
        f.download(f.grant.readbackUrl.replace(f.proof.proofId, differentId)),
      ).rejects.toMatchObject({ status: 403 });
      expect(read).not.toHaveBeenCalled();
    });
    it.each(["hash", "length", "mime"])(
      "rejects %s-mismatched stored bytes after valid authorization",
      async (mismatch) => {
        const f = await fixture();
        const bytes = Buffer.from(f.bytes);
        bytes[0] = bytes[0]! ^ 1;
        vi.spyOn(f.storage, "read").mockResolvedValue({
          bytes:
            mismatch === "hash"
              ? bytes
              : mismatch === "length"
                ? f.bytes.subarray(1)
                : f.bytes,
          contentType: mismatch === "mime" ? "text/plain" : "application/pdf",
        });
        await expect(f.download(f.grant.readbackUrl)).rejects.toMatchObject({
          status: 409,
          code: "REMITTANCE_PROOF_CONTENT_MISMATCH",
        });
      },
    );
    it("fails closed when a valid clean grant's object is missing", async () => {
      const f = await fixture();
      vi.spyOn(f.storage, "read").mockResolvedValue(null);
      await expect(f.download(f.grant.readbackUrl)).rejects.toMatchObject({
        status: 503,
        code: "REMITTANCE_PROOF_CONTENT_UNAVAILABLE",
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
        ["GET", path.replace(/.$/, "%2f")],
        ["GET", path + "/"],
        ["GET", path.replace("remittance-proof/", "remittance-proof/%2e%2e/")],
        ["GET", "/api/reimbursements/proofs"],
      ] as const) {
        await expect(
          validateInternalKey({ method, url, headers: {} }, "configured-key"),
        ).rejects.toMatchObject({ code: "INTERNAL_KEY_REQUIRED" });
      }
    });
  },
);
