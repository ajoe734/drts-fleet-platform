import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  DEFAULT_CONTROLLED_DOWNLOAD_HOST,
  createControlledDownloadMetadata,
} from "../../apps/api/src/common/controlled-download";
import { ControlledDownloadController } from "../../apps/api/src/modules/controlled-download/controlled-download.controller";

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
    const metadata = createControlledDownloadMetadata({
      kind: "tenant-invoice",
      subjectId: "invoice-1",
      manifestHash: "hash-1",
    });

    // Was `https://downloads.drts.local`, which fails at DNS -- a network fault
    // to anyone reading it, rather than "this file was never produced".
    expect(DEFAULT_CONTROLLED_DOWNLOAD_HOST).toBe("/downloads");
    expect(metadata.downloadUrl.startsWith("/downloads/tenant-invoice/")).toBe(
      true,
    );
  });

  it("tells a caller the file was never produced, naming the kind", () => {
    const controller = new ControlledDownloadController();

    const code = codeOf(() =>
      controller.resolve(
        "tenant-invoice",
        "invoice-1",
        new Date(Date.now() + 60_000).toISOString(),
        "deadbeef",
      ),
    );

    expect(code).toBe("ARTIFACT_NOT_MATERIALISED");
  });

  it("points a report link at the route that does serve bytes", () => {
    const controller = new ControlledDownloadController();

    try {
      controller.resolve(
        "report",
        "JOB-1",
        new Date(Date.now() + 60_000).toISOString(),
        "deadbeef",
      );
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

  it("separates an expired link from an unproduced one", () => {
    const controller = new ControlledDownloadController();

    expect(
      codeOf(() =>
        controller.resolve(
          "report",
          "JOB-1",
          new Date(Date.now() - 60_000).toISOString(),
          "deadbeef",
        ),
      ),
    ).toBe("CONTROLLED_DOWNLOAD_EXPIRED");
  });

  it("rejects a link with no signature at all", () => {
    const controller = new ControlledDownloadController();

    expect(
      codeOf(() => controller.resolve("report", "JOB-1", undefined, "")),
    ).toBe("CONTROLLED_DOWNLOAD_SIGNATURE_MISSING");
  });
});
