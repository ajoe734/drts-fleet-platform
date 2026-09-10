/**
 * Reproduce the missing adapter routes with the actual platform-admin controller.
 * This is diagnostic evidence, not an acceptance test. It intentionally reports
 * actual HTTP responses without treating the known 404 as a passing assertion.
 *
 * Run from the repository root:
 * NODE_ENV=test pnpm --filter @drts/api exec tsx --tsconfig ../../tests/unit/system-remediation/sr-admin-adapter-001/registry-api-reproduction.tsconfig.json ../../tests/unit/system-remediation/sr-admin-adapter-001/registry-api-reproduction.ts
 *
 * The app binds an ephemeral loopback port and uses the existing service without
 * a database. No live provider, proxy, authentication guard, or deployed API is
 * exercised; no registration, configuration, or credential success is claimed.
 * The task-local tsconfig resolves contracts from this worktree's source.
 * NODE_ENV=test is required by the existing service's unrelated placard seed
 * initializer; this script neither requests nor validates those artifacts.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

async function reproduce() {
  const repositoryRoot = fileURLToPath(
    new URL("../../../../", import.meta.url),
  );
  const apiRequire = createRequire(
    resolve(repositoryRoot, "apps/api/package.json"),
  );
  apiRequire("reflect-metadata");
  const { Module } = apiRequire("@nestjs/common");
  const { NestFactory } = apiRequire("@nestjs/core");
  const { AuditNotificationService } =
    await import("../../../../apps/api/src/modules/audit-notification/audit-notification.service");
  const { PlatformAdminController } =
    await import("../../../../apps/api/src/modules/platform-admin/platform-admin.controller");
  const { PlatformAdminService } =
    await import("../../../../apps/api/src/modules/platform-admin/platform-admin.service");

  // tsx does not emit constructor design metadata; supply the actual dependency
  // token explicitly for this isolated diagnostic host.
  Reflect.defineMetadata(
    "design:paramtypes",
    [PlatformAdminService],
    PlatformAdminController,
  );
  class RegistryReproductionModule {}
  Module({
    controllers: [PlatformAdminController],
    providers: [
      {
        provide: PlatformAdminService,
        useValue: new PlatformAdminService(new AuditNotificationService()),
      },
    ],
  })(RegistryReproductionModule);

  const app = await NestFactory.create(RegistryReproductionModule, {
    logger: false,
  });
  try {
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (!address || typeof address === "string") {
      throw new Error("Expected an ephemeral loopback server address.");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    process.stdout.write(
      `${JSON.stringify({
        taskId: "SR-ADMIN-ADAPTER-001",
        sourceSha: execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: repositoryRoot,
          encoding: "utf8",
        }).trim(),
        observedAt: new Date().toISOString(),
        diagnosticOnly: true,
        deployedApi: false,
        authenticationExercised: false,
        providerExercised: false,
        resourceId: "grab_taiwan",
      })}\n`,
    );
    for (const request of [
      { method: "GET", path: "/api/platform-admin/public-info" },
      { method: "GET", path: "/api/platform-admin/adapters" },
      { method: "GET", path: "/api/platform-admin/adapters/grab_taiwan" },
      { method: "PATCH", path: "/api/platform-admin/adapters/grab_taiwan" },
    ]) {
      const url = `${baseUrl}${request.path}`;
      const response = await fetch(url, {
        method: request.method,
        headers: { "content-type": "application/json" },
        ...(request.method === "PATCH"
          ? { body: JSON.stringify({ config: { isEnabled: false } }) }
          : {}),
      });
      const body = await response.json();
      process.stdout.write(
        `${JSON.stringify({ method: request.method, url, status: response.status, body })}\n`,
      );
    }
  } finally {
    await app.close();
  }
}

void reproduce().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
