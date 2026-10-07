import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";

import { buildArtifactText } from "../../../../apps/bank-console-web/app/artifacts/artifact-crypto";
import {
  downloadArtifact,
  liveSigningGatePassed,
  resolveRuntimeShaBinding,
  runIndependentBankVerifier,
  sha256Hex,
  type FetchLike,
} from "../../../e2e/system-remediation/sr-live-doc-001/live-document-runner";

const VERIFIER_SCRIPT_PATH = join(
  __dirname,
  "../sr-bank-003/verify_artifact.py",
);

function fakeFetch(response: Response): FetchLike {
  return (async () => response) as unknown as FetchLike;
}

describe("SR-LIVE-DOC-RUNNER-001: live-document-runner adapters (test doubles only)", () => {
  describe("sha256Hex", () => {
    it("computes the real SHA-256 digest of the given bytes", () => {
      const digest = sha256Hex(Buffer.from("hello world"));
      expect(digest).toBe(
        "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      );
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("downloadArtifact", () => {
    it("returns bytes and no error code for a 2xx response", async () => {
      const body = Buffer.from("ARTIFACT BYTES");
      const response = new Response(body, {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
      const outcome = await downloadArtifact(
        "http://example.invalid/artifact",
        {},
        fakeFetch(response),
      );
      expect(outcome.status).toBe(200);
      expect(outcome.errorCode).toBeNull();
      expect(outcome.bytes?.toString("utf-8")).toBe("ARTIFACT BYTES");
      expect(outcome.contentType).toContain("text/plain");
    });

    it("never returns bytes for a non-2xx response and extracts the platform error code", async () => {
      const response = new Response(
        JSON.stringify({
          ok: false,
          error: { code: "FORBIDDEN", message: "nope" },
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
      const outcome = await downloadArtifact(
        "http://example.invalid/artifact",
        {},
        fakeFetch(response),
      );
      expect(outcome.status).toBe(403);
      expect(outcome.bytes).toBeNull();
      expect(outcome.errorCode).toBe("FORBIDDEN");
    });

    it("tolerates a non-JSON error body without throwing", async () => {
      const response = new Response("plain text failure", { status: 500 });
      const outcome = await downloadArtifact(
        "http://example.invalid/artifact",
        {},
        fakeFetch(response),
      );
      expect(outcome.status).toBe(500);
      expect(outcome.bytes).toBeNull();
      expect(outcome.errorCode).toBeNull();
    });
  });

  describe("runIndependentBankVerifier + liveSigningGatePassed", () => {
    it("clears the live signing gate for a genuinely SIGNED, untampered artifact with the correct public key", () => {
      const keyPair = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      const artifactText = buildArtifactText("STATEMENT PAYLOAD: TWD 1,200", {
        signingConfig: {
          privateKeyPem: keyPair.privateKey,
          keyId: "test-key-1",
        },
      });

      const outcome = runIndependentBankVerifier({
        verifierScriptPath: VERIFIER_SCRIPT_PATH,
        artifactBytes: Buffer.from(artifactText, "utf-8"),
        publicKeyPem: keyPair.publicKey,
      });

      expect(outcome.ok).toBe(true);
      expect(outcome.hashMatch).toBe(true);
      expect(outcome.signatureVerified).toBe(true);
      expect(outcome.signatureStatus).toBe("SIGNED");
      expect(liveSigningGatePassed(outcome)).toBe(true);
    });

    it("does not clear the live signing gate for an explicitly UNSIGNED artifact, even though the artifact is itself valid", () => {
      const artifactText = buildArtifactText("STATEMENT PAYLOAD: TWD 1,200");

      const outcome = runIndependentBankVerifier({
        verifierScriptPath: VERIFIER_SCRIPT_PATH,
        artifactBytes: Buffer.from(artifactText, "utf-8"),
      });

      expect(outcome.ok).toBe(true);
      expect(outcome.hashMatch).toBe(true);
      expect(outcome.signatureVerified).toBeNull();
      expect(outcome.signatureStatus).toBe("UNSIGNED");
      expect(liveSigningGatePassed(outcome)).toBe(false);
    });

    it("rejects a SIGNED artifact verified against the wrong public key", () => {
      const keyPair = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      const otherKeyPair = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      const artifactText = buildArtifactText("STATEMENT PAYLOAD: TWD 1,200", {
        signingConfig: {
          privateKeyPem: keyPair.privateKey,
          keyId: "test-key-1",
        },
      });

      const outcome = runIndependentBankVerifier({
        verifierScriptPath: VERIFIER_SCRIPT_PATH,
        artifactBytes: Buffer.from(artifactText, "utf-8"),
        publicKeyPem: otherKeyPair.publicKey,
      });

      expect(outcome.ok).toBe(false);
      expect(outcome.hashMatch).toBe(true);
      expect(outcome.signatureVerified).toBe(false);
      expect(outcome.signatureStatus).toBe("TAMPERED");
      expect(liveSigningGatePassed(outcome)).toBe(false);
    });

    it("rejects a byte-tampered artifact (hash mismatch) even with the correct public key", () => {
      const keyPair = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      const artifactText = buildArtifactText("STATEMENT PAYLOAD: TWD 1,200", {
        signingConfig: {
          privateKeyPem: keyPair.privateKey,
          keyId: "test-key-1",
        },
      });
      const tamperedText = artifactText.replace("1,200", "9,999");

      const outcome = runIndependentBankVerifier({
        verifierScriptPath: VERIFIER_SCRIPT_PATH,
        artifactBytes: Buffer.from(tamperedText, "utf-8"),
        publicKeyPem: keyPair.publicKey,
      });

      expect(outcome.ok).toBe(false);
      expect(outcome.hashMatch).toBe(false);
      expect(outcome.signatureStatus).toBe("TAMPERED");
      expect(liveSigningGatePassed(outcome)).toBe(false);
    });
  });

  describe("resolveRuntimeShaBinding", () => {
    it("binds runtimeSha to CANDIDATE_SHA and workflowSha to WORKFLOW_SHA when both are set", () => {
      const binding = resolveRuntimeShaBinding({
        CANDIDATE_SHA: "candidate-sha-value",
        WORKFLOW_SHA: "workflow-sha-value",
        GITHUB_SHA: "github-sha-value",
      } as NodeJS.ProcessEnv);
      expect(binding.runtimeSha).toBe("candidate-sha-value");
      expect(binding.workflowSha).toBe("workflow-sha-value");
    });

    it("falls back to GITHUB_SHA for both fields when CANDIDATE_SHA/WORKFLOW_SHA are absent", () => {
      const binding = resolveRuntimeShaBinding({
        GITHUB_SHA: "github-sha-value",
      } as NodeJS.ProcessEnv);
      expect(binding.runtimeSha).toBe("github-sha-value");
      expect(binding.workflowSha).toBe("github-sha-value");
    });

    it("falls back to 'unknown' when no SHA is available in the environment", () => {
      const binding = resolveRuntimeShaBinding({} as NodeJS.ProcessEnv);
      expect(binding.runtimeSha).toBe("unknown");
      expect(binding.workflowSha).toBe("unknown");
    });
  });

  describe("getGoogleIdToken", () => {
    it("returns injected ID token from environment when matching audience", async () => {
      const { getGoogleIdToken } =
        await import("../../../e2e/system-remediation/sr-live-doc-001/live-document-runner");
      process.env.SR_LIVE_DOC_LIVE_TARGET_ORIGIN = "https://target.local";
      process.env.SR_LIVE_DOC_ID_TOKEN_TARGET = "token123";

      const token = await getGoogleIdToken("https://target.local");
      expect(token).toBe("token123");

      delete process.env.SR_LIVE_DOC_LIVE_TARGET_ORIGIN;
      delete process.env.SR_LIVE_DOC_ID_TOKEN_TARGET;
    });

    it("throws when missing WIF credentials instead of returning null", async () => {
      const { getGoogleIdToken } =
        await import("../../../e2e/system-remediation/sr-live-doc-001/live-document-runner");
      process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/fake.json";

      await expect(getGoogleIdToken("https://missing.local")).rejects.toThrow(
        "Missing injected WIF ID token for audience",
      );

      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    });
  });
});

import { validateReportArtifact, fetchAndValidateReport } from "../../../e2e/system-remediation/sr-live-doc-001/report-validator";
import { recordsToCsv } from "../../../../apps/api/src/common/csv";
import { recordsToXlsx, recordsToPdf } from "../../../../apps/api/src/modules/reporting-filing/report-renderers";

describe("fetchAndValidateReport (R5-A regressions)", () => {
  const jobId = "job-1";
  const validJobDetail = { jobId, status: "completed", format: "csv", jobType: "trip_report", rows: [{ orderId: "1", amountMinor: 100 }] };
  const validCsvBytes = Buffer.from(recordsToCsv(validJobDetail.rows));

  const mockFetch = (metadataOverride: any, artifactOverride: { status?: number, bytes?: Buffer, headers?: Record<string, string> } = {}) => {
    return async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("/artifact")) {
        return {
          status: artifactOverride.status ?? 200,
          headers: { get: (k: string) => (artifactOverride.headers || { "content-type": "text/csv", "x-drts-candidate-sha": "sha123" })[k] },
          arrayBuffer: async () => artifactOverride.bytes ?? validCsvBytes
        } as any;
      }
      return {
        status: metadataOverride === "404" ? 404 : 200,
        headers: { get: () => "sha123" },
        json: async () => metadataOverride
      } as any;
    };
  };

  it("accepts an enveloped production completed job", async () => {
    const fetchFn = mockFetch({ data: validJobDetail });
    await expect(fetchAndValidateReport(`/control-plane-proxy/reports/${jobId}/artifact`, "http://origin", {}, "sha123", fetchFn)).resolves.toBeUndefined();
  });

  it("accepts empty and nonempty valid reports", async () => {
    const emptyJob = { ...validJobDetail, rows: [] };
    const emptyCsv = Buffer.from(recordsToCsv([]));
    await expect(fetchAndValidateReport(`/control-plane-proxy/reports/${jobId}/artifact`, "http://origin", {}, "sha123", mockFetch({ data: emptyJob }, { bytes: emptyCsv }))).resolves.toBeUndefined();
  });

  it("rejects missing data (missing envelope)", async () => {
    await expect(fetchAndValidateReport(`/control-plane-proxy/reports/${jobId}/artifact`, "http://origin", {}, "sha123", mockFetch(validJobDetail))).rejects.toThrow("Missing data in job response envelope");
  });

  it("rejects missing jobId", async () => {
    await expect(fetchAndValidateReport(`/control-plane-proxy/reports/${jobId}/artifact`, "http://origin", {}, "sha123", mockFetch({ data: { ...validJobDetail, jobId: undefined } }))).rejects.toThrow("Missing jobId in job detail");
  });

  it("rejects mismatched jobId", async () => {
    await expect(fetchAndValidateReport(`/control-plane-proxy/reports/${jobId}/artifact`, "http://origin", {}, "sha123", mockFetch({ data: { ...validJobDetail, jobId: "wrong" } }))).rejects.toThrow("Mismatch jobId");
  });

  it("rejects missing status", async () => {
    await expect(fetchAndValidateReport(`/control-plane-proxy/reports/${jobId}/artifact`, "http://origin", {}, "sha123", mockFetch({ data: { ...validJobDetail, status: undefined } }))).rejects.toThrow("Job not completed");
  });

  it("rejects missing rows", async () => {
    await expect(fetchAndValidateReport(`/control-plane-proxy/reports/${jobId}/artifact`, "http://origin", {}, "sha123", mockFetch({ data: { ...validJobDetail, rows: undefined } }))).rejects.toThrow("Missing rows in job detail");
  });

  it("rejects wrong SHA", async () => {
    const fetchFn = mockFetch({ data: validJobDetail }, { headers: { "content-type": "text/csv", "x-drts-candidate-sha": "wrong-sha" } });
    await expect(fetchAndValidateReport(`/control-plane-proxy/reports/${jobId}/artifact`, "http://origin", {}, "sha123", fetchFn)).rejects.toThrow("Mismatch x-drts-candidate-sha in artifact response");
  });

  it("rejects wrong MIME mismatch", async () => {
    const fetchFn = mockFetch({ data: validJobDetail }, { headers: { "content-type": "application/pdf", "x-drts-candidate-sha": "sha123" } });
    await expect(fetchAndValidateReport(`/control-plane-proxy/reports/${jobId}/artifact`, "http://origin", {}, "sha123", fetchFn)).rejects.toThrow();
  });

  it("rejects missing MIME", async () => {
    const fetchFn = mockFetch({ data: validJobDetail }, { headers: { "x-drts-candidate-sha": "sha123" } });
    await expect(fetchAndValidateReport(`/control-plane-proxy/reports/${jobId}/artifact`, "http://origin", {}, "sha123", fetchFn)).rejects.toThrow("Missing content-type in artifact response");
  });

  it("rejects empty MIME", async () => {
    const fetchFn = mockFetch({ data: validJobDetail }, { headers: { "content-type": "   ", "x-drts-candidate-sha": "sha123" } });
    await expect(fetchAndValidateReport(`/control-plane-proxy/reports/${jobId}/artifact`, "http://origin", {}, "sha123", fetchFn)).rejects.toThrow("Missing content-type in artifact response");
  });
});

describe("validateReportArtifact (R5-B adversarial regressions)", () => {
  const jobId = "job-1";
  const jobType = "trip_report";
  const jobDetail = {
    jobId,
    jobType,
    format: "csv",
    rows: [
      { orderId: "order-1", amountMinor: 120000, note: null }
    ]
  };

  describe("PDF validation", () => {
    const pdfJob = { ...jobDetail, format: "pdf" };

    it("accepts real renderer positive", async () => {
      const pdfBuffer = await recordsToPdf(pdfJob.rows, `${jobType} — ${jobId}`);
      await expect(validateReportArtifact(pdfJob, jobId, "application/pdf", pdfBuffer)).resolves.toBeUndefined();
    });

    it("accepts empty-report state", async () => {
      const emptyJob = { ...pdfJob, rows: [] };
      const pdfBuffer = await recordsToPdf([], `${jobType} — ${jobId}`);
      await expect(validateReportArtifact(emptyJob, jobId, "application/pdf", pdfBuffer)).resolves.toBeUndefined();
    });

    it("rejects note changes to UNEXPECTED", async () => {
      const wrongRows = [{ orderId: "order-1", amountMinor: 120000, note: "UNEXPECTED" }];
      const pdfBuffer = await recordsToPdf(wrongRows, `${jobType} — ${jobId}`);
      await expect(validateReportArtifact(pdfJob, jobId, "application/pdf", pdfBuffer)).rejects.toThrow();
    });

    it("rejects appended extra rows", async () => {
      const wrongRows = [...pdfJob.rows, { orderId: "extra-order", amountMinor: 999, note: "EXTRA" }];
      const pdfBuffer = await recordsToPdf(wrongRows, `${jobType} — ${jobId}`);
      await expect(validateReportArtifact(pdfJob, jobId, "application/pdf", pdfBuffer)).rejects.toThrow();
    });

    it("rejects wrong authoritative title", async () => {
      const pdfBuffer = await recordsToPdf(pdfJob.rows, `wrong_report — ${jobId}`);
      await expect(validateReportArtifact(pdfJob, jobId, "application/pdf", pdfBuffer)).rejects.toThrow();
    });

    it("rejects nonempty PDF validated against empty metadata", async () => {
      const emptyJob = { ...pdfJob, rows: [] };
      const pdfBuffer = await recordsToPdf(pdfJob.rows, `${jobType} — ${jobId}`);
      await expect(validateReportArtifact(emptyJob, jobId, "application/pdf", pdfBuffer)).rejects.toThrow();
    });
  });

  describe("XLSX validation", () => {
    const xlsxJob = { ...jobDetail, format: "xlsx" };

    it("accepts real renderer positive", async () => {
      const xlsxBuffer = await recordsToXlsx(xlsxJob.rows);
      await expect(validateReportArtifact(xlsxJob, jobId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsxBuffer)).resolves.toBeUndefined();
    });

    it("accepts authentic empty XLSX", async () => {
      const emptyJob = { ...xlsxJob, rows: [] };
      const xlsxBuffer = await recordsToXlsx([]);
      await expect(validateReportArtifact(emptyJob, jobId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsxBuffer)).resolves.toBeUndefined();
    });

    it("rejects unexpected additional column content", async () => {
      const xlsxBuffer = await recordsToXlsx(xlsxJob.rows);
      const ExcelJS = (await import("exceljs")).default || await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(xlsxBuffer as any);
      workbook.worksheets[0]!.getRow(2).getCell(4).value = "UNEXPECTED";
      const badBuffer = await workbook.xlsx.writeBuffer();
      await expect(validateReportArtifact(xlsxJob, jobId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from(badBuffer))).rejects.toThrow();
    });

    it("rejects shifted or wrong headers", async () => {
      const xlsxBuffer = await recordsToXlsx(xlsxJob.rows);
      const ExcelJS = (await import("exceljs")).default || await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(xlsxBuffer as any);
      const ws = workbook.worksheets[0]!;
      ws.getRow(1).getCell(1).value = "";
      ws.getRow(1).getCell(2).value = "orderId";
      ws.getRow(1).getCell(3).value = "amountMinor";
      ws.getRow(2).getCell(1).value = "";
      ws.getRow(2).getCell(2).value = "order-1";
      ws.getRow(2).getCell(3).value = "WRONG AMOUNT";
      const badBuffer = await workbook.xlsx.writeBuffer();
      await expect(validateReportArtifact(xlsxJob, jobId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from(badBuffer))).rejects.toThrow();
    });

    it("rejects metadata rows=[] but one worksheet with ERROR", async () => {
      const emptyJob = { ...xlsxJob, rows: [] };
      const ExcelJS = (await import("exceljs")).default || await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Report");
      ws.getCell("A1").value = "ERROR: export unavailable";
      const badBuffer = await workbook.xlsx.writeBuffer();
      await expect(validateReportArtifact(emptyJob, jobId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from(badBuffer))).rejects.toThrow();
    });
  });

  describe("CSV validation", () => {
    const csvJob = { ...jobDetail, format: "csv" };

    it("accepts real renderer positive", async () => {
      const csvBuffer = Buffer.from(recordsToCsv(csvJob.rows));
      await expect(validateReportArtifact(csvJob, jobId, "text/csv", csvBuffer)).resolves.toBeUndefined();
    });

    it("rejects wrong CSV bytes", async () => {
      const badCsv = "orderId,amountMinor,note\norder-10,91200009,line1";
      await expect(validateReportArtifact(csvJob, jobId, "text/csv", Buffer.from(badCsv))).rejects.toThrow();
    });
  });
});
