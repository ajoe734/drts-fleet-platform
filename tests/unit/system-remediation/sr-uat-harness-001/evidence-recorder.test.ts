import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { UatEvidenceRecorder } from "../../../e2e/system-remediation/shared/evidence-recorder";
import { BASELINE_PERSONAS } from "../../../e2e/system-remediation/shared/role-personas";

describe("SR-UAT-HARNESS-001: UatEvidenceRecorder", () => {
  const tempEvidenceDir = path.resolve(__dirname, "temp-evidence");

  beforeEach(() => {
    if (!fs.existsSync(tempEvidenceDir)) {
      fs.mkdirSync(tempEvidenceDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempEvidenceDir)) {
      fs.rmSync(tempEvidenceDir, { recursive: true, force: true });
    }
  });

  it("records base SHA, candidate SHA, roles, and tracked resource IDs", () => {
    const recorder = new UatEvidenceRecorder({
      taskId: "SR-UAT-HARNESS-001",
      shardIndex: 0,
      baseSha: "ea1b1b4f0359d5ca5ab00ad604d37281a74d70df",
      candidateSha: "candidate-sha-abc1234",
    });

    recorder.recordRole("Platform Admin", BASELINE_PERSONAS.platform_admin);
    recorder.recordResourceId(
      "tenant",
      "10000000-0000-0000-0000-000000000201",
      {
        name: "Acme",
      },
    );
    recorder.recordResourceId("driver", "10000000-0000-0000-0000-000000000381");

    const bundle = recorder.finalize("passed");

    expect(bundle.baseSha).toBe("ea1b1b4f0359d5ca5ab00ad604d37281a74d70df");
    expect(bundle.candidateSha).toBe("candidate-sha-abc1234");
    expect(bundle.headSha).toBeDefined();
    expect(bundle.roles).toContain("Platform Admin (platform_admin)");
    expect(bundle.trackedResources.length).toBe(2);
    expect(bundle.status).toBe("passed");
    expect(bundle.exitCode).toBe(0);
  });

  it("records HTTP calls and console logs with PII redaction", () => {
    const recorder = new UatEvidenceRecorder({
      taskId: "SR-UAT-HARNESS-001",
    });

    const http = recorder.recordHttpCall({
      method: "POST",
      url: "https://api.drts.internal/api/auth/login?apiKey=super-secret",
      statusCode: 200,
      durationMs: 12.5,
      requestHeaders: {
        authorization: "Bearer my-secret-jwt",
        host: "api.drts.internal",
      },
      requestBody: {
        userEmail: "ops@company.example",
        phone: "0912-345-678",
      },
      responseBody: {
        success: true,
      },
      actorRole: "platform_admin",
    });

    expect(http.url).toContain("[REDACTED]");
    expect(http.requestHeaders?.authorization).toBe("[REDACTED]");
    expect((http.requestBody as Record<string, string>).userEmail).toBe(
      "o***@company.example",
    );
    expect((http.requestBody as Record<string, string>).phone).toBe(
      "0912-***-678",
    );

    const consoleLog = recorder.recordConsole(
      "warn",
      "Account admin@partner.example secret: topsecret123",
    );
    expect(consoleLog.message).toBe(
      "Account a***@partner.example secret: [REDACTED]",
    );
  });

  it("calculates sha256 checksum and size for artifacts", () => {
    const recorder = new UatEvidenceRecorder({
      taskId: "SR-UAT-HARNESS-001",
    });

    const content = "Test artifact bytes for UAT validation";
    const artifact = recorder.recordArtifact("test.txt", content, "text/plain");

    expect(artifact.name).toBe("test.txt");
    expect(artifact.byteSize).toBe(content.length);
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.contentType).toBe("text/plain");
  });

  it("records live limitations and preserves honesty in evidence", () => {
    const recorder = new UatEvidenceRecorder({
      taskId: "SR-UAT-HARNESS-001",
    });

    recorder.recordLiveLimitation(
      "real_telecom_trunk",
      "PSTN trunk hardware call routing verified via SIP gateway simulator",
    );

    const bundle = recorder.finalize("passed");
    expect(bundle.unimplementedLiveSurfaces.length).toBe(1);
    expect(bundle.unimplementedLiveSurfaces[0]!.surface).toBe(
      "real_telecom_trunk",
    );
  });

  it("handles test failures with non-zero exit code and assertSuccess error", () => {
    const recorder = new UatEvidenceRecorder({
      taskId: "SR-UAT-HARNESS-001",
    });

    recorder.recordError(new Error("Connection reset by peer"));
    const bundle = recorder.finalize();

    expect(bundle.status).toBe("failed");
    expect(bundle.exitCode).toBe(1);
    expect(bundle.errors.length).toBe(1);

    expect(() => {
      recorder.assertSuccess();
    }).toThrow(/exit code 1/);
  });

  it("saves complete evidence bundle to disk and reads back valid JSON", () => {
    const recorder = new UatEvidenceRecorder({
      taskId: "SR-UAT-HARNESS-001",
    });

    recorder.recordRole("Ops Dispatch", BASELINE_PERSONAS.ops_dispatcher);
    const outputPath = path.join(tempEvidenceDir, "evidence-bundle.json");
    const savedPath = recorder.saveToFile(outputPath);

    expect(fs.existsSync(savedPath)).toBe(true);
    const raw = fs.readFileSync(savedPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.taskId).toBe("SR-UAT-HARNESS-001");
    expect(parsed.status).toBe("passed");
  });
});
