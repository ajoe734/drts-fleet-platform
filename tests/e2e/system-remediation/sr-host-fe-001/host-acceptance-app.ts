// Isolated Nest acceptance composition for SR-HOST-FE-001-ACCEPTANCE-RUNNER.
//
// The real root `apps/api/src/app.module.ts` does not register
// `HostViewModule` (confirmed by reading app.module.ts's `imports` array
// directly — no HostViewModule entry exists there). That wiring gap belongs
// to SR-WIRE-001, not this task. Per the task's integration_notes, this file
// boots the REAL, PRODUCTION `HostViewModule` (compiled from
// `apps/api/src/modules/host-view/`, unmodified) together with the REAL
// `BootstrapAuthGuard`, `SnakeCaseInterceptor`, and `SnakeCaseExceptionFilter`
// in a dedicated Nest application — the same pattern already used by
// `tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/
// appmodule-tenant-binding.test.ts` for the full AppModule, adapted here to a
// deliberately narrower composition because AppModule itself cannot serve
// `/api/host/*` on current `dev`.
//
// This is explicitly MODULE-LEVEL evidence, not full-application wiring
// evidence: no root registration, no shared portal navigation/layout (that is
// SR-WIRE-001's scope), and no throttling/feature-gate cross-cutting guards
// (identical for every module in AppModule, not host-specific, and would
// otherwise risk tripping global rate limits against the large >200-vehicle
// fixture this runner requires). See
// docs/04-uat/system-remediation-20260906/host-acceptance-runner.md §"Isolated
// composition boundary" for the full accounting of what is and is not
// exercised by this composition.
//
// All classes loaded here come from the compiled `apps/api/dist/` output
// (built by `buildHostAcceptanceCandidate` below) rather than being
// re-implemented in this file, so the guard/interceptor/filter/module
// behavior under test is the actual candidate product code, not a
// reimplementation of it.

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../../");
const API_DIR = path.resolve(REPO_ROOT, "apps/api");
const API_DIST = path.resolve(API_DIR, "dist");

/**
 * Compiles the candidate `apps/api` TypeScript source to `dist/` so this
 * harness runs against the exact same emitted JS (and decorator metadata)
 * the production server would run, never a hand-reimplemented copy of the
 * module/guard/interceptor/filter classes.
 */
export function buildHostAcceptanceCandidate(): void {
  execFileSync("pnpm", ["--filter", "@drts/api...", "build"], {
    cwd: REPO_ROOT,
    stdio: "pipe",
    timeout: 180_000,
  });
  const distAppModulePath = path.resolve(API_DIST, "app.module.js");
  if (!existsSync(distAppModulePath)) {
    throw new Error(
      `Candidate compiled build not found at ${distAppModulePath}. Run 'pnpm --filter @drts/api build' before running Host acceptance evidence.`,
    );
  }
  const hostViewModulePath = path.resolve(
    API_DIST,
    "modules/host-view/host-view.module.js",
  );
  if (!existsSync(hostViewModulePath)) {
    throw new Error(
      `Candidate compiled HostViewModule not found at ${hostViewModulePath}. ` +
        "apps/api/src/modules/host-view/ must exist and compile for this runner to test real production code.",
    );
  }
}

const apiRequire = createRequire(path.resolve(API_DIR, "package.json"));

export interface HostAcceptanceAppLike {
  listen(port: number | string, host?: string): Promise<unknown>;
  getUrl(): Promise<string>;
  close(): Promise<void>;
  get<T = unknown>(token: unknown): T;
}

/**
 * Boots the isolated Host acceptance Nest application. Requires
 * `buildHostAcceptanceCandidate()` to have already produced `apps/api/dist/`,
 * and `DATABASE_URL` to already be set in the environment (the real
 * `DatabaseService` used inside `HostViewModule` reads it directly from
 * `process.env`).
 */
export async function createHostAcceptanceApp(): Promise<HostAcceptanceAppLike> {
  apiRequire("reflect-metadata");

  const { NestFactory, APP_GUARD, APP_INTERCEPTOR, APP_FILTER } =
    apiRequire("@nestjs/core") as {
      NestFactory: {
        create(
          moduleCls: unknown,
          options?: {
            logger?: boolean | ("log" | "error" | "warn" | "debug" | "verbose")[];
            abortOnError?: boolean;
          },
        ): Promise<HostAcceptanceAppLike & { setGlobalPrefix(prefix: string): void; init(): Promise<unknown> }>;
      };
      APP_GUARD: symbol;
      APP_INTERCEPTOR: symbol;
      APP_FILTER: symbol;
    };
  const { Module, Injectable } = apiRequire("@nestjs/common") as {
    Module: (metadata: Record<string, unknown>) => ClassDecorator;
    Injectable: () => ClassDecorator;
  };
  const { catchError } = apiRequire("rxjs/operators") as {
    catchError: (
      selector: (err: unknown) => unknown,
    ) => (source: unknown) => unknown;
  };
  const { throwError } = apiRequire("rxjs") as {
    throwError: (factory: () => unknown) => unknown;
  };

  const { HostViewModule } = apiRequire(
    "./dist/modules/host-view/host-view.module.js",
  ) as { HostViewModule: unknown };
  const { BootstrapAuthGuard } = apiRequire(
    "./dist/common/auth/bootstrap-auth.guard.js",
  ) as { BootstrapAuthGuard: unknown };
  const { SnakeCaseInterceptor } = apiRequire(
    "./dist/common/snake-case.interceptor.js",
  ) as { SnakeCaseInterceptor: unknown };
  const { SnakeCaseExceptionFilter } = apiRequire(
    "./dist/common/snake-case.exception-filter.js",
  ) as { SnakeCaseExceptionFilter: unknown };

  // The real, production `SnakeCaseExceptionFilter` (`@Catch()`, applied
  // above) formats any non-`HttpException` into a generic 500 envelope
  // without ever calling Nest's `Logger` — so a genuine unhandled exception
  // in `HostViewModule` would reach the browser as an opaque `HTTP_500` with
  // zero trace in this process's stdout, even with `logger: ["error",
  // "warn"]` on `NestFactory.create` below (that only restores Nest's own
  // *handled*-lifecycle logging, which this path never goes through). This
  // interceptor instruments the handler/interceptor portion of the request
  // pipeline (post-guard) without editing the production filter itself (out
  // of write scope): it wraps the real handler, logs the real error
  // object/stack to stdout, then rethrows unchanged so
  // `SnakeCaseExceptionFilter`'s real response behavior is completely
  // unaffected.
  class DiagnosticErrorLoggingInterceptor {
    intercept(
      _context: unknown,
      next: { handle: () => { pipe: (op: unknown) => unknown } },
    ) {
      return next.handle().pipe(
        catchError((err: unknown) => {
          // eslint-disable-next-line no-console
          console.error("[host-acceptance] unhandled request error:", err);
          return throwError(() => err);
        }),
      );
    }
  }
  Injectable()(DiagnosticErrorLoggingInterceptor);

  // Guard-thrown exceptions (e.g. anything `BootstrapAuthGuard` throws) run
  // BEFORE any interceptor in Nest's request pipeline (middleware → guards →
  // interceptors → handler), so `DiagnosticErrorLoggingInterceptor` above
  // structurally cannot see them — confirmed by the first acceptance run
  // after adding it still showing zero diagnostic output for a plain
  // unauthenticated request that returned HTTP 500. `SnakeCaseExceptionFilter`
  // is the one place every exception in this composition — guard, interceptor,
  // or handler — is guaranteed to funnel through (it is the sole `@Catch()`
  // filter registered), so this non-destructively wraps its real, unmodified
  // `catch` method on the prototype: log the real exception, then delegate to
  // the original implementation unchanged. This produces the actual
  // production response byte-for-byte; only stdout gains a diagnostic line.
  const exceptionFilterProto = (
    SnakeCaseExceptionFilter as { prototype: { catch: (...args: unknown[]) => unknown } }
  ).prototype;
  const originalExceptionFilterCatch = exceptionFilterProto.catch;
  exceptionFilterProto.catch = function patchedCatch(
    this: unknown,
    exception: unknown,
    ...rest: unknown[]
  ) {
    // eslint-disable-next-line no-console
    console.error("[host-acceptance] exception reaching SnakeCaseExceptionFilter:", exception);
    return originalExceptionFilterCatch.apply(this, [exception, ...rest]);
  };

  // Applied as a plain function call (`Module(metadata)(Class)`) instead of
  // `@Module(...)` decorator syntax so this composition does not depend on
  // the test runner's TypeScript `emitDecoratorMetadata` support — this
  // class has no constructor parameters of its own to describe, and every
  // real Injectable it wires together already carries its own correct
  // decorator metadata baked in from the `apps/api` tsc build above.
  class HostAcceptanceModule {}
  Module({
    imports: [HostViewModule],
    providers: [
      { provide: APP_GUARD, useClass: BootstrapAuthGuard },
      // Order matters: providers registered first wrap outermost, so this
      // diagnostic interceptor sees errors from both the real
      // `SnakeCaseInterceptor` and the handler before the exception filter
      // formats the response.
      { provide: APP_INTERCEPTOR, useClass: DiagnosticErrorLoggingInterceptor },
      { provide: APP_INTERCEPTOR, useClass: SnakeCaseInterceptor },
      { provide: APP_FILTER, useClass: SnakeCaseExceptionFilter },
    ],
  })(HostAcceptanceModule);

  // `logger: false` previously silenced Nest's own error-level logging too,
  // so a real, unhandled 500 in the standalone `host-acceptance-server.ts`
  // process (used only by the browser-acceptance job) left zero trace in
  // its stdout log — defeating this task's "report real failures honestly"
  // mandate. `["error", "warn"]` keeps noisy startup/info banners off while
  // still printing real exceptions.
  const app = await NestFactory.create(HostAcceptanceModule, {
    logger: ["error", "warn"],
    abortOnError: false,
  });
  app.setGlobalPrefix("api");
  await app.init();
  return app;
}
