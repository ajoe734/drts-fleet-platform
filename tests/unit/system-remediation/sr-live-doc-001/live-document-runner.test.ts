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

import { validateReportArtifact } from "../../../e2e/system-remediation/sr-live-doc-001/report-validator";
import { recordsToCsv } from "../../../../apps/api/src/common/csv";
import { recordsToXlsx, recordsToPdf } from "../../../../apps/api/src/modules/reporting-filing/report-renderers";

describe("validateReportArtifact", () => {
  const jobDetail = {
    format: "csv",
    rows: [
      { orderId: "order-1", amountMinor: 120000, note: "line1\nline2" },
      { orderId: "order-2", amountMinor: 4500, note: "'=1+1" }
    ]
  };

  describe("CSV validation", () => {
    it("accepts valid production CSV", async () => {
      const csvString = recordsToCsv(jobDetail.rows);
      await expect(
        validateReportArtifact(jobDetail, "job-1", "text/csv", Buffer.from(csvString))
      ).resolves.toBeUndefined();
    });

    it("rejects duplicate headers", async () => {
      const badCsv = "orderId,amountMinor,amountMinor\norder-1,120000,120000\norder-2,4500,4500";
      await expect(
        validateReportArtifact(jobDetail, "job-1", "text/csv", Buffer.from(badCsv))
      ).rejects.toThrow();
    });

    it("rejects wrong PDF values in CSV test?", async () => {
      const badCsv = "orderId,amountMinor,note\norder-10,91200009,line1\norder-2,4500,note";
      await expect(
        validateReportArtifact(jobDetail, "job-1", "text/csv", Buffer.from(badCsv))
      ).rejects.toThrow();
    });

    it("rejects missing rows evidence", async () => {
      const missingRowsJob = { format: "csv", jobId: "job-1" };
      await expect(
        validateReportArtifact(missingRowsJob, "job-1", "text/csv", Buffer.from("job-1"))
      ).rejects.toThrow("Missing rows evidence in metadata");
    });
    
    it("accepts valid production CSV with charset", async () => {
      const csvString = recordsToCsv(jobDetail.rows);
      await expect(
        validateReportArtifact(jobDetail, "job-1", "text/csv; charset=utf-8", Buffer.from(csvString))
      ).resolves.toBeUndefined();
    });

    it("rejects wrong bytes with valid CSV charset", async () => {
      await expect(
        validateReportArtifact(jobDetail, "job-1", "text/csv; charset=utf-8", Buffer.from("BAD REPORT"))
      ).rejects.toThrow();
    });

    it("rejects unknown or missing MIME type", async () => {
      const csvString = recordsToCsv(jobDetail.rows);
      await expect(
        validateReportArtifact(jobDetail, "job-1", "application/json", Buffer.from(csvString))
      ).rejects.toThrow("Unsupported MIME type: application/json");
      
      await expect(
        validateReportArtifact(jobDetail, "job-1", "", Buffer.from(csvString))
      ).rejects.toThrow("Unsupported MIME type");
    });
  });

  describe("XLSX validation", () => {
    const xlsxJob = { ...jobDetail, format: "xlsx" };

    it("accepts valid production XLSX", async () => {
      const xlsxBuffer = await recordsToXlsx(xlsxJob.rows);
      await expect(
        validateReportArtifact(xlsxJob, "job-1", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsxBuffer)
      ).resolves.toBeUndefined();
    });

    it("rejects missing rows evidence", async () => {
      const missingRowsJob = { format: "xlsx", jobId: "job-1" };
      const xlsxBuffer = await recordsToXlsx([]);
      await expect(
        validateReportArtifact(missingRowsJob, "job-1", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsxBuffer)
      ).rejects.toThrow("Missing rows evidence in metadata");
    });
    
    it("accepts authentic empty XLSX from production renderer", async () => {
      const emptyJob = { format: "xlsx", jobId: "job-1", rows: [] };
      const emptyBuffer = await recordsToXlsx([]);
      await expect(
        validateReportArtifact(emptyJob, "job-1", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", emptyBuffer)
      ).resolves.toBeUndefined();
    });

    it("rejects sparse-null + extra-cell false positive", async () => {
      const sparseJob = { format: "xlsx", jobId: "job-1", rows: [{ orderId: "order-1", amountMinor: 120000, note: null }] };
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Sheet1");
      worksheet.addRow(["orderId", "amountMinor", "note"]);
      worksheet.addRow(["order-1", 120000, null, "UNEXPECTED"]);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      await expect(
        validateReportArtifact(sparseJob, "job-1", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer)
      ).rejects.toThrow();
    });
  });

  describe("PDF validation", () => {
    const pdfJob = { ...jobDetail, format: "pdf" };

    it("accepts valid production PDF", async () => {
      const pdfBuffer = await recordsToPdf(pdfJob.rows, "job-1");
      await expect(
        validateReportArtifact(pdfJob, "job-1", "application/pdf", pdfBuffer)
      ).resolves.toBeUndefined();
    });

    it("rejects missing rows evidence", async () => {
      const missingRowsJob = { format: "pdf", jobId: "job-1" };
      const pdfBuffer = await recordsToPdf([], "job-1");
      await expect(
        validateReportArtifact(missingRowsJob, "job-1", "application/pdf", pdfBuffer)
      ).rejects.toThrow("Missing rows evidence in metadata");
    });
    
    it("rejects order-10 satisfying order-1", async () => {
      const wrongRows = [
        { orderId: "order-10", amountMinor: 91200009, note: "line1\nline2" },
        { orderId: "order-2", amountMinor: 4500, note: "'=1+1" }
      ];
      const pdfBuffer = await recordsToPdf(wrongRows, "job-1");
      await expect(
        validateReportArtifact(pdfJob, "job-1", "application/pdf", pdfBuffer)
      ).rejects.toThrow();
    });
  });
});
