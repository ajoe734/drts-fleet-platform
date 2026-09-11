import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type TestInfo,
} from "@playwright/test";
import { UatEvidenceRecorder } from "../shared/evidence-recorder";

export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`Missing required ${name}; acceptance did not run`);
  return value;
}
export type Actor = "adminA" | "adminB" | "readonlyA" | "platform";
export interface Readback {
  apiPath: string;
  actor: Actor;
  tenant?: string;
  selector?: { key: string; value: string };
  expected: Record<string, unknown>;
  sql: string;
  parameters: unknown[];
}
interface DbPool {
  query(
    sql: string,
    parameters?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}
export class TenantAcceptance {
  readonly tenantA = required("DRTS_UAT_TENANT_A");
  readonly tenantB = required("DRTS_UAT_TENANT_B");
  readonly runId = randomUUID();
  private readonly origin = new URL(required("DRTS_UAT_API_URL")).origin;
  private readonly tokens = {
    adminA: required("DRTS_UAT_TOKEN_A"),
    adminB: required("DRTS_UAT_TOKEN_B"),
    readonlyA: required("DRTS_UAT_TOKEN_READONLY_A"),
    platform: required("DRTS_UAT_TOKEN_PLATFORM"),
  };
  readonly evidence = new UatEvidenceRecorder({
    taskId: "SR-QA-TENANT-001",
    baseSha: required("BASE_SHA"),
    candidateSha: required("CANDIDATE_SHA"),
  });
  readonly db: DbPool;
  constructor(readonly client: APIRequestContext) {
    expect(required("DRTS_UAT_ENV")).toBe("sandbox");
    expect(this.tenantA).not.toBe(this.tenantB);
    const apiRequire = createRequire(path.resolve("apps/api/package.json"));
    const { Pool } = apiRequire("pg") as {
      Pool: new (options: { connectionString: string }) => DbPool;
    };
    this.db = new Pool({ connectionString: required("DATABASE_URL") });
  }
  async call(
    apiPath: string,
    actor: Actor = "adminA",
    method = "GET",
    body?: unknown,
    tenant?: string,
  ): Promise<APIResponse> {
    const selectedTenant =
      tenant ??
      (actor === "adminB"
        ? this.tenantB
        : actor === "platform"
          ? undefined
          : this.tenantA);
    const url = `${this.origin}/api/${apiPath}`;
    const started = Date.now();
    const response = await this.client.fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.tokens[actor]}`,
        "x-request-id": `tenant-qa-${randomUUID()}`,
        ...(selectedTenant ? { "x-tenant-id": selectedTenant } : {}),
        ...(method === "POST" && apiPath === "tenant/bookings"
          ? { "idempotency-key": randomUUID() }
          : {}),
      },
      ...(body === undefined ? {} : { data: body }),
      maxRedirects: 0,
    });
    expect(response.headers()["x-drts-candidate-sha"]).toBe(
      required("CANDIDATE_SHA"),
    );
    this.evidence.recordRole(actor);
    this.evidence.recordHttpCall({
      method,
      url,
      statusCode: response.status(),
      durationMs: Date.now() - started,
      actorRole: actor,
    });
    return response;
  }
  async data<T>(
    apiPath: string,
    actor: Actor = "adminA",
    method = "GET",
    body?: unknown,
    tenant?: string,
  ): Promise<T> {
    const response = await this.call(apiPath, actor, method, body, tenant);
    expect(
      response.ok(),
      `${method} ${apiPath} HTTP ${response.status()}`,
    ).toBe(true);
    return (await response.json()).data as T;
  }
  async negative(
    apiPath: string,
    actor: Actor,
    method: string,
    body: unknown,
    status: number,
    code?: string,
  ): Promise<void> {
    const response = await this.call(apiPath, actor, method, body);
    expect(response.status()).toBe(status);
    if (code) expect((await response.json()).error.code).toBe(code);
  }
  async checkpoint(readback: Readback): Promise<void> {
    if (!/^SELECT\s/i.test(readback.sql))
      throw new Error("Acceptance DB probes must be read-only SELECTs");
    const actual = await this.data<Record<string, unknown>>(
      readback.apiPath,
      readback.actor,
      "GET",
      undefined,
      readback.tenant,
    );
    const selected = readback.selector
      ? (actual.items as Record<string, unknown>[]).find(
          (row) => row[readback.selector!.key] === readback.selector!.value,
        )
      : actual;
    expect(selected).toMatchObject(readback.expected);
    await expect
      .poll(
        async () => {
          const result = await this.db.query(readback.sql, readback.parameters);
          if (result.rows.length !== 1) return null;
          return result.rows[0]!.record ?? result.rows[0];
        },
        {
          timeout: 10_000,
          message: `Durable DB readback of ${readback.apiPath}`,
        },
      )
      .toMatchObject(readback.expected);
    const directory = path.resolve(
      ".artifacts/tenant-uat-acceptance/restart-readbacks",
    );
    mkdirSync(directory, { recursive: true });
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          readback.apiPath,
          readback.actor,
          readback.tenant,
          readback.selector,
        ]),
      )
      .digest("hex");
    const target = path.join(directory, `${key}.json`);
    const previous = existsSync(target)
      ? (JSON.parse(readFileSync(target, "utf8")) as Readback)
      : undefined;
    writeFileSync(
      target,
      JSON.stringify({
        ...readback,
        expected: { ...previous?.expected, ...readback.expected },
      }),
    );
  }
}
export async function withTenantAcceptance(
  playwright: { request: { newContext(): Promise<APIRequestContext> } },
  testInfo: TestInfo,
  run: (context: TenantAcceptance) => Promise<void>,
): Promise<void> {
  testInfo.setTimeout(90_000);
  const client = await playwright.request.newContext();
  let context: TenantAcceptance | undefined;
  try {
    context = new TenantAcceptance(client);
    await run(context);
    context.evidence.finalize("passed");
  } catch (error) {
    context?.evidence.recordError(
      error instanceof Error ? error : String(error),
    );
    context?.evidence.finalize("failed");
    throw error;
  } finally {
    if (context) {
      await context.db.end();
      const output = context.evidence.saveToFile(
        testInfo.outputPath("tenant-governance-evidence.json"),
      );
      await testInfo.attach("tenant-governance-evidence", {
        path: output,
        contentType: "application/json",
      });
    }
    await client.dispose();
  }
}
