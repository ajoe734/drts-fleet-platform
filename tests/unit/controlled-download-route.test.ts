import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  DEFAULT_CONTROLLED_DOWNLOAD_HOST,
  createControlledDownloadMetadata,
  verifyControlledDownloadSignature,
} from "../../apps/api/src/common/controlled-download";
import { ControlledDownloadController } from "../../apps/api/src/modules/controlled-download/controlled-download.controller";

function issue(
  kind: string,
  subjectId: string,
  overrides: { createdAt?: string; ttlMinutes?: number } = {},
) {
  return createControlledDownloadMetadata({
    kind,
    subjectId,
    manifestHash: "e3b0c44298fc1c14",
    ...overrides,
  });
}

/** Reads a link back the way the controller receives it. */
function paramsOf(downloadUrl: string) {
  const query = new URLSearchParams(downloadUrl.split("?")[1]);
  return {
    signedAt: query.get("signed_at") ?? undefined,
    expiresAt: query.get("expires_at") ?? undefined,
    keyId: query.get("key_id") ?? undefined,
    manifestHash: query.get("manifest_hash") ?? undefined,
    sig: query.get("sig") ?? undefined,
    sigV: query.get("sig_v") ?? undefined,
  };
}

function resolve(
  controller: ControlledDownloadController,
  kind: string,
  subjectId: string,
  p: ReturnType<typeof paramsOf>,
) {
  return controller.resolve(
    kind,
    subjectId,
    p.signedAt,
    p.expiresAt,
    p.keyId,
    p.manifestHash,
    p.sig,
    p.sigV,
  );
}

function codeOf(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    return (error as ApiRequestError).code;
  }
  throw new Error("expected the call to throw");
}

describe("controlled download links", () => {
  it("issues a link on the API's own origin rather than a host that does not resolve", () => {
    const metadata = issue("tenant-invoice", "invoice-1");

    // Was `https://downloads.drts.local`, which fails at DNS -- a network fault
    // to anyone reading it, rather than "this file was never produced".
    expect(DEFAULT_CONTROLLED_DOWNLOAD_HOST).toBe("/downloads");
    expect(metadata.downloadUrl.startsWith("/downloads/tenant-invoice/")).toBe(
      true,
    );
  });

  it("carries every field its own signature covers", () => {
    // The signature is over kind, subjectId, manifestHash, signedAt, expiresAt,
    // keyId and signatureVersion. manifestHash used to be absent from the link,
    // which made every controlled download the platform issued unverifiable.
    const params = paramsOf(issue("tenant-invoice", "invoice-1").downloadUrl);

    expect(params.manifestHash).toBe("e3b0c44298fc1c14");
    expect(
      verifyControlledDownloadSignature({
        kind: "tenant-invoice",
        subjectId: "invoice-1",
        manifestHash: params.manifestHash!,
        signedAt: params.signedAt!,
        expiresAt: params.expiresAt!,
        keyId: params.keyId!,
        signatureVersion: Number(params.sigV),
        signature: params.sig!,
      }),
    ).toEqual({ ok: true });
  });

  it("refuses a link whose subject was swapped after signing", () => {
    const controller = new ControlledDownloadController();
    const params = paramsOf(issue("tenant-invoice", "invoice-1").downloadUrl);

    // Same signature, different invoice: the point of signing.
    expect(
      codeOf(() => resolve(controller, "tenant-invoice", "invoice-2", params)),
    ).toBe("CONTROLLED_DOWNLOAD_SIGNATURE_INVALID");
  });

  it("refuses a link whose expiry was extended after signing", () => {
    const controller = new ControlledDownloadController();
    const params = paramsOf(issue("report", "JOB-1").downloadUrl);

    expect(
      codeOf(() =>
        resolve(controller, "report", "JOB-1", {
          ...params,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      ),
    ).toBe("CONTROLLED_DOWNLOAD_SIGNATURE_INVALID");
  });

  it("answers a forged link as unverifiable rather than as expired", () => {
    const controller = new ControlledDownloadController();
    // Forged *and* stale. Saying "expired" would confirm the window was read,
    // which a link that cannot be verified has not earned.
    const params = paramsOf(
      issue("report", "JOB-1", {
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        ttlMinutes: 1,
      }).downloadUrl,
    );

    expect(
      codeOf(() =>
        resolve(controller, "report", "JOB-1", { ...params, sig: "00ff" }),
      ),
    ).toBe("CONTROLLED_DOWNLOAD_SIGNATURE_INVALID");
  });

  it("reports a genuine link past its window as expired", () => {
    const controller = new ControlledDownloadController();
    const params = paramsOf(
      issue("report", "JOB-1", {
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        ttlMinutes: 1,
      }).downloadUrl,
    );

    expect(codeOf(() => resolve(controller, "report", "JOB-1", params))).toBe(
      "CONTROLLED_DOWNLOAD_EXPIRED",
    );
  });

  it("rejects a link signed under a key this deployment does not hold", () => {
    expect(
      verifyControlledDownloadSignature({
        kind: "report",
        subjectId: "JOB-1",
        manifestHash: "hash",
        signedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        keyId: "some-other-key",
        signatureVersion: 1,
        signature: "00ff",
      }),
    ).toEqual({ ok: false, reason: "key_unknown" });
  });

  it("tells a verified caller the file was never produced, naming the kind", () => {
    const controller = new ControlledDownloadController();
    const params = paramsOf(issue("tenant-invoice", "invoice-1").downloadUrl);

    expect(
      codeOf(() => resolve(controller, "tenant-invoice", "invoice-1", params)),
    ).toBe("ARTIFACT_NOT_MATERIALISED");
  });

  it("points a verified report link at the route that does serve bytes", () => {
    const controller = new ControlledDownloadController();
    const params = paramsOf(issue("report", "JOB-1").downloadUrl);

    try {
      resolve(controller, "report", "JOB-1", params);
      throw new Error("expected the call to throw");
    } catch (error) {
      const details = (
        (error as ApiRequestError).getResponse() as {
          error: { details: Record<string, unknown> };
        }
      ).error.details;
      expect(details.servedInstead).toBe("GET /reports/{jobId}/artifact");
    }
  });

  it("rejects a link that is missing the fields needed to check it", () => {
    const controller = new ControlledDownloadController();
    const params = paramsOf(issue("report", "JOB-1").downloadUrl);

    expect(
      codeOf(() =>
        resolve(controller, "report", "JOB-1", {
          ...params,
          manifestHash: undefined,
        }),
      ),
    ).toBe("CONTROLLED_DOWNLOAD_LINK_INCOMPLETE");
  });
});
