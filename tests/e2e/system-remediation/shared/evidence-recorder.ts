import { createHash, randomUUID } from "crypto";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { redactObject, redactPii } from "./pii-redactor";
import type { RolePersona } from "./role-personas";

export interface HttpEvidence {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
  actorRole?: string;
}

export interface ConsoleEvidence {
  timestamp: string;
  level: "log" | "info" | "warn" | "error";
  message: string;
  location?: string;
}

export interface ArtifactEvidence {
  name: string;
  path: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  recordedAt: string;
}

export interface TrackedEntityId {
  type: string;
  id: string;
  metadata?: Record<string, unknown>;
}

export interface UatEvidenceBundle {
  taskId: string;
  runId: string;
  shardIndex: number;
  baseSha: string;
  candidateSha?: string;
  headSha: string;
  startTime: string;
  endTime?: string;
  status: "passed" | "failed" | "in_progress";
  exitCode: number;
  roles: string[];
  trackedResources: TrackedEntityId[];
  httpCalls: HttpEvidence[];
  consoleLogs: ConsoleEvidence[];
  artifacts: ArtifactEvidence[];
  errors: Array<{ message: string; stack?: string; timestamp: string }>;
  unimplementedLiveSurfaces: Array<{ surface: string; reason: string }>;
}

export interface RecordHttpOptions {
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
  actorRole?: string;
}

export class UatEvidenceRecorder {
  private readonly taskId: string;
  private readonly runId: string;
  private readonly shardIndex: number;
  private baseSha: string;
  private candidateSha?: string;
  private headSha: string;
  private readonly startTime: string;
  private endTime?: string;
  private status: "passed" | "failed" | "in_progress" = "in_progress";
  private exitCode = 0;

  private readonly roles: Set<string> = new Set();
  private readonly trackedResources: Map<string, TrackedEntityId> = new Map();
  private readonly httpCalls: HttpEvidence[] = [];
  private readonly consoleLogs: ConsoleEvidence[] = [];
  private readonly artifacts: ArtifactEvidence[] = [];
  private readonly errors: Array<{
    message: string;
    stack?: string;
    timestamp: string;
  }> = [];
  private readonly unimplementedLiveSurfaces: Array<{
    surface: string;
    reason: string;
  }> = [];

  constructor(options: {
    taskId: string;
    shardIndex?: number;
    baseSha?: string;
    candidateSha?: string;
  }) {
    this.taskId = options.taskId;
    this.shardIndex = options.shardIndex ?? 0;
    this.runId = `uat-${options.taskId}-${randomUUID().slice(0, 8)}`;
    this.startTime = new Date().toISOString();

    this.headSha = this.resolveGitHead();
    this.baseSha =
      options.baseSha ||
      process.env.BASE_SHA ||
      "ea1b1b4f0359d5ca5ab00ad604d37281a74d70df";
    this.candidateSha =
      options.candidateSha ||
      process.env.CANDIDATE_SHA ||
      this.headSha;
  }

  private resolveGitHead(): string {
    if (process.env.CANDIDATE_SHA) {
      return process.env.CANDIDATE_SHA;
    }
    try {
      return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    } catch {
      return "0000000000000000000000000000000000000000";
    }
  }

  public setBaseSha(sha: string): void {
    this.baseSha = sha;
  }

  public setCandidateSha(sha: string): void {
    this.candidateSha = sha;
  }

  /**
   * Records a role persona involved in the test.
   */
  public recordRole(roleName: string, persona?: RolePersona): void {
    const roleKey = persona ? `${roleName} (${persona.actorType})` : roleName;
    this.roles.add(roleKey);
  }

  /**
   * Records a business entity / resource ID created or verified during the test.
   */
  public recordResourceId(
    type: string,
    id: string,
    metadata?: Record<string, unknown>,
  ): void {
    const key = `${type}:${id}`;
    if (!this.trackedResources.has(key)) {
      this.trackedResources.set(key, {
        type,
        id,
        metadata: metadata ? (redactObject(metadata) as Record<string, unknown>) : undefined,
      });
    }
  }

  /**
   * Records an HTTP interaction with automatic PII redaction.
   */
  public recordHttpCall(options: RecordHttpOptions): HttpEvidence {
    const callEvidence: HttpEvidence = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      method: options.method.toUpperCase(),
      url: redactPii(options.url),
      statusCode: options.statusCode,
      durationMs: Math.round(options.durationMs),
      requestHeaders: options.requestHeaders
        ? (redactObject(options.requestHeaders) as Record<string, string>)
        : undefined,
      responseHeaders: options.responseHeaders
        ? (redactObject(options.responseHeaders) as Record<string, string>)
        : undefined,
      requestBody: options.requestBody
        ? redactObject(options.requestBody)
        : undefined,
      responseBody: options.responseBody
        ? redactObject(options.responseBody)
        : undefined,
      actorRole: options.actorRole,
    };

    this.httpCalls.push(callEvidence);

    // If HTTP call indicates server error (5xx), log as warning or error
    if (options.statusCode >= 500) {
      this.recordConsole(
        "error",
        `HTTP 5xx Server Error: ${callEvidence.method} ${callEvidence.url} -> ${options.statusCode}`,
      );
    }

    return callEvidence;
  }

  /**
   * Records a console log message with automatic PII redaction.
   */
  public recordConsole(
    level: "log" | "info" | "warn" | "error",
    message: string,
    location?: string,
  ): ConsoleEvidence {
    const entry: ConsoleEvidence = {
      timestamp: new Date().toISOString(),
      level,
      message: redactPii(message),
      location,
    };

    this.consoleLogs.push(entry);

    if (level === "error") {
      // Record in errors
      this.errors.push({
        message: entry.message,
        stack: location,
        timestamp: entry.timestamp,
      });
    }

    return entry;
  }

  /**
   * Records an artifact (file or buffer) and calculates its SHA-256 hash.
   */
  public recordArtifact(
    name: string,
    source: string | Buffer,
    contentType = "application/octet-stream",
  ): ArtifactEvidence {
    let buffer: Buffer;
    let filePath = "";

    if (typeof source === "string") {
      if (fs.existsSync(source)) {
        filePath = path.resolve(source);
        buffer = fs.readFileSync(filePath);
      } else {
        buffer = Buffer.from(source, "utf-8");
        filePath = `memory://${name}`;
      }
    } else {
      buffer = source;
      filePath = `memory://${name}`;
    }

    const sha256 = createHash("sha256").update(buffer).digest("hex");

    const artifact: ArtifactEvidence = {
      name,
      path: filePath,
      contentType,
      byteSize: buffer.length,
      sha256,
      recordedAt: new Date().toISOString(),
    };

    this.artifacts.push(artifact);
    return artifact;
  }

  /**
   * Explicitly documents unexecuted live / real-hardware items so they are not misrepresented as passed.
   */
  public recordLiveLimitation(surface: string, reason: string): void {
    this.unimplementedLiveSurfaces.push({ surface, reason });
  }

  /**
   * Records a test failure / error.
   */
  public recordError(error: Error | string): void {
    const message = typeof error === "string" ? error : error.message;
    const stack = typeof error === "string" ? undefined : error.stack;
    const timestamp = new Date().toISOString();

    this.errors.push({
      message: redactPii(message),
      stack: stack ? redactPii(stack) : undefined,
      timestamp,
    });

    this.status = "failed";
    this.exitCode = 1;
  }

  /**
   * Finalizes the evidence collection.
   */
  public finalize(status?: "passed" | "failed"): UatEvidenceBundle {
    this.endTime = new Date().toISOString();

    if (status) {
      this.status = status;
      this.exitCode = status === "passed" ? 0 : 1;
    } else if (this.status === "in_progress") {
      if (this.errors.length > 0) {
        this.status = "failed";
        this.exitCode = 1;
      } else {
        this.status = "passed";
        this.exitCode = 0;
      }
    }

    return this.getBundle();
  }

  /**
   * Returns current evidence bundle snapshot.
   */
  public getBundle(): UatEvidenceBundle {
    return {
      taskId: this.taskId,
      runId: this.runId,
      shardIndex: this.shardIndex,
      baseSha: this.baseSha,
      candidateSha: this.candidateSha,
      headSha: this.headSha,
      startTime: this.startTime,
      endTime: this.endTime,
      status: this.status,
      exitCode: this.exitCode,
      roles: Array.from(this.roles),
      trackedResources: Array.from(this.trackedResources.values()),
      httpCalls: this.httpCalls,
      consoleLogs: this.consoleLogs,
      artifacts: this.artifacts,
      errors: this.errors,
      unimplementedLiveSurfaces: this.unimplementedLiveSurfaces,
    };
  }

  /**
   * Returns the exit code (0 for pass, 1 for failure).
   */
  public getExitCode(): number {
    return this.exitCode;
  }

  /**
   * Asserts that the test execution succeeded.
   * If failed, throws an error with a non-zero exit code property.
   */
  public assertSuccess(): void {
    if (this.status !== "passed" || this.exitCode !== 0) {
      const errorMsg = `UAT test failed for task ${this.taskId} with exit code ${this.exitCode}. Errors: ${JSON.stringify(this.errors)}`;
      const err = new Error(errorMsg);
      (err as unknown as { exitCode: number }).exitCode = this.exitCode || 1;
      throw err;
    }
  }

  /**
   * Serializes the evidence bundle to a JSON file.
   */
  public saveToFile(outputPath: string): string {
    const fullPath = path.resolve(outputPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const bundle = this.finalize();
    fs.writeFileSync(fullPath, JSON.stringify(bundle, null, 2), "utf-8");
    return fullPath;
  }
}
