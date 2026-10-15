import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock server-only for Node/Vitest execution
vi.mock("server-only", () => ({}));

const mockRequestHeaders = vi.hoisted(() => {
  const ref = {
    current: new Headers(),
    cookies: new Map<string, string>(),
    factory: () => ({
      headers: vi.fn(async () => ref.current),
      cookies: vi.fn(async () => ({
        get: vi.fn((name: string) => {
          const value = ref.cookies.get(name);
          return value !== undefined ? { name, value } : undefined;
        }),
      })),
    }),
  };
  return ref;
});

vi.mock("next/headers", () => mockRequestHeaders.factory());
vi.mock(
  "../../../apps/fleet-partner-portal-web/node_modules/next/headers",
  () => mockRequestHeaders.factory(),
);
vi.mock(
  "../../../apps/fleet-partner-portal-web/node_modules/next/headers.js",
  () => mockRequestHeaders.factory(),
);

import type { DriverQuizAttemptDetail } from "@drts/contracts";
import {
  CONTROL_PLANE_IAP_EMAIL_HEADER,
  CONTROL_PLANE_REQUEST_AUTH_HEADER,
  issueControlPlaneRequestAuth,
} from "@drts/control-plane-auth";
import * as jwt from "jsonwebtoken";

import { toApiErrorEnvelope } from "../../../apps/api/src/common/api-envelope";
import type {
  AuthActorType,
  AuthenticatedRequestLike,
  AuthRealm,
  AuthRoleFamily,
  BootstrapRequestIdentity,
} from "../../../apps/api/src/common/auth/auth.types";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import type { AcademyCourseVersion } from "../../../apps/api/src/modules/driver-academy/academy-domain";
import { FleetPartnerTrainingController } from "../../../apps/api/src/modules/driver-academy/academy.controller";
import { AcademyService } from "../../../apps/api/src/modules/driver-academy/academy.service";
import FleetTrainingPage from "../../../apps/fleet-partner-portal-web/app/training/page";
import {
  appendFleetPartnerQuery,
  getServerFleetTrainingClient,
} from "../../../apps/fleet-partner-portal-web/lib/academy-api.server";
import {
  loadFleetDriverQuizAttempt,
  loadFleetTraining,
} from "../../../apps/fleet-partner-portal-web/lib/academy-data.server";
import { getServerFleetPartnerClient } from "../../../apps/fleet-partner-portal-web/lib/api-client.server";

const apiRequire = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const portalRequire = createRequire(
  new URL(
    "../../../apps/fleet-partner-portal-web/package.json",
    import.meta.url,
  ),
);
const { renderToStaticMarkup } = portalRequire("react-dom/server") as {
  renderToStaticMarkup: (element: unknown) => string;
};
const { Reflector } = apiRequire("@nestjs/core") as {
  Reflector: new () => ConstructorParameters<typeof BootstrapAuthGuard>[0];
};
const { HttpException } = apiRequire("@nestjs/common") as {
  HttpException: new (
    response: string | Record<string, unknown>,
    status: number,
  ) => {
    getStatus(): number;
    getResponse(): string | object;
  };
};

interface MintTokenOptions {
  actorType: AuthActorType;
  actorId: string;
  realm: AuthRealm;
  tenantId?: string | null;
  roleFamilies: AuthRoleFamily[];
  roles: string[];
  scopes: string[];
}

function tenantFleetAdminIdentity(
  tenantId: string,
  actorId = "user_fleet_admin",
): MintTokenOptions {
  return {
    actorType: "tenant_admin",
    actorId,
    realm: "tenant",
    tenantId,
    roleFamilies: ["tenant"],
    roles: ["tenant_ops_admin"],
    scopes: ["reports:read", "billing:read"],
  };
}

function opsAdminIdentity(actorId = "user_ops_admin"): MintTokenOptions {
  return {
    actorType: "ops_user",
    actorId,
    realm: "ops",
    tenantId: null,
    roleFamilies: ["ops"],
    roles: ["ops_manager"],
    scopes: ["reports:read", "billing:read"],
  };
}

async function mintAccessToken(
  jwtAuthService: JwtAuthService,
  options: MintTokenOptions,
): Promise<string> {
  const issued = await jwtAuthService.issueSessionToken({
    authMode: "jwt_bearer",
    actorType: options.actorType,
    actorId: options.actorId,
    realm: options.realm,
    tenantId: options.tenantId ?? null,
    roleFamilies: options.roleFamilies,
    roles: options.roles,
    scopes: options.scopes,
    requestId: null,
  });
  return issued.token;
}

class SocketFreeAcademyRepository {
  courses: AcademyCourseVersion[] = [];
  attempts: DriverQuizAttemptDetail[] = [];
  existingDriverIds = new Set<string>();
  profileStatuses = new Map<string, string>();
  cohorts = new Map<string, Array<{ driverId: string; fullName: string }>>();

  isEnabled() {
    return false;
  }

  async executeSerializableTransaction<T>(
    operation: (client: unknown) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }

  async getDriverTrainingProfileStatus(
    driverId: string,
  ): Promise<string | null> {
    return this.profileStatuses.get(driverId) ?? null;
  }

  async getCurrentCourse(courseId: string) {
    return this.courses.find((c) => c.courseId === courseId) ?? null;
  }

  async listCurrentCourses() {
    return this.courses;
  }

  async driverExists(driverId: string) {
    return this.existingDriverIds.has(driverId);
  }

  async insertAttempt(attempt: DriverQuizAttemptDetail) {
    this.attempts.push(attempt);
  }

  async listAttempts(filter: { driverId?: string; courseId?: string } = {}) {
    return this.attempts.filter(
      (a) =>
        (!filter.driverId || a.driverId === filter.driverId) &&
        (!filter.courseId || a.courseId === filter.courseId),
    );
  }

  async getAttempt(attemptId: string) {
    return this.attempts.find((a) => a.attemptId === attemptId) ?? null;
  }

  async insertTrainingRecordEvidence() {}

  async upsertTrainingStatus() {}

  async listActiveFleetCohort(fleetPartnerId: string) {
    return this.cohorts.get(fleetPartnerId) ?? [];
  }
}

interface RecordedBoundaryCall {
  method: string;
  url: string;
  pathname: string;
  search: string;
  headers: Record<string, string>;
  status: number;
  errorCode: string | null;
}

describe("FLEET-TRAINING-AUTHORIZED-CALLER-20261015: C071 Authorized Training Caller & Canonical Fleet Selector", () => {
  const TEST_JWT_SECRET =
    "test-fleet-training-authorized-caller-jwt-secret-20261015";
  const FLEET_ALPHA = "fleet_alpha_001";
  const FLEET_BETA = "fleet_beta_002";
  const FLEET_EMPTY = "fleet_empty_003";

  const DRIVER_A1 = "drv_alpha_001";
  const DRIVER_A2 = "drv_alpha_002";
  const DRIVER_B1 = "drv_beta_001";

  const COURSE_REQUIRED: AcademyCourseVersion = {
    courseId: "crs_fleet_compliance_001",
    courseCode: "COMP-101",
    title: "車行合規與乘客服務規範",
    category: "compliance",
    isRequired: true,
    validityDays: 30,
    passingScore: 80,
    version: 1,
    modulesCount: 1,
    description: "車行合規必修培訓",
    modules: [
      {
        moduleId: "mod_1",
        title: "合規手冊",
        type: "sop",
        contentUrl: "https://docs.drts.example/compliance.pdf",
        durationMinutes: 20,
      },
    ],
    questions: [
      {
        questionId: "q1",
        prompt: "駕駛營運期間是否得拒載合格之導盲犬？",
        options: [
          { optionId: "opt_yes", text: "可以" },
          { optionId: "opt_no", text: "不得拒載" },
        ],
      },
    ],
    answerKey: { q1: "opt_no" },
  };

  let repository: SocketFreeAcademyRepository;
  let academyService: AcademyService;
  let fleetController: FleetPartnerTrainingController;
  let jwtAuthService: JwtAuthService;
  let bootstrapAuthGuard: BootstrapAuthGuard;
  let recordedCalls: RecordedBoundaryCall[];

  const originalFetch = globalThis.fetch;
  const savedEnv: Record<string, string | undefined> = {};

  function setRequestContext(
    headersInit?: Record<string, string>,
    cookiesInit?: Record<string, string>,
  ) {
    mockRequestHeaders.current = new Headers(headersInit ?? {});
    mockRequestHeaders.cookies = new Map(Object.entries(cookiesInit ?? {}));
  }

  beforeEach(() => {
    for (const key of [
      "DRTS_API_URL",
      "DRTS_FLEET_PARTNER_ID",
      "DRTS_API_AUTH_AUDIENCE",
      "DRTS_ENV",
      "JWT_SECRET",
      "JWT_ISSUER",
      "JWT_AUDIENCE",
    ]) {
      savedEnv[key] = process.env[key];
    }

    process.env.DRTS_API_URL = "http://localhost:3001";
    process.env.DRTS_ENV = "test";
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    delete process.env.DRTS_FLEET_PARTNER_ID;
    delete process.env.DRTS_API_AUTH_AUDIENCE;

    setRequestContext();
    recordedCalls = [];

    repository = new SocketFreeAcademyRepository();
    repository.courses = [COURSE_REQUIRED];
    repository.existingDriverIds.add(DRIVER_A1);
    repository.existingDriverIds.add(DRIVER_A2);
    repository.existingDriverIds.add(DRIVER_B1);

    repository.cohorts.set(FLEET_ALPHA, [
      { driverId: DRIVER_A1, fullName: "王大明" },
      { driverId: DRIVER_A2, fullName: "李小華" },
    ]);
    repository.cohorts.set(FLEET_BETA, [
      { driverId: DRIVER_B1, fullName: "張志偉" },
    ]);
    repository.cohorts.set(FLEET_EMPTY, []);

    const now = new Date();
    const expiredIso = new Date(now.getTime() - 40 * 86_400_000).toISOString();

    // Driver A1: active pass
    repository.attempts.push({
      attemptId: "att_a1_pass",
      driverId: DRIVER_A1,
      courseId: COURSE_REQUIRED.courseId,
      courseVersion: 1,
      score: 100,
      passed: true,
      attemptedAt: now.toISOString(),
      feedback: "優異完成法規測驗",
      answersSummary: [
        { questionId: "q1", selectedOptionId: "opt_no", isCorrect: true },
      ],
    });

    // Driver A2: expired pass (>30 days ago -> overdue)
    repository.attempts.push({
      attemptId: "att_a2_expired",
      driverId: DRIVER_A2,
      courseId: COURSE_REQUIRED.courseId,
      courseVersion: 1,
      score: 90,
      passed: true,
      attemptedAt: expiredIso,
      feedback: "歷史通過但已逾期",
      answersSummary: [
        { questionId: "q1", selectedOptionId: "opt_no", isCorrect: true },
      ],
    });

    // Driver B1 (Fleet Beta): active pass
    repository.attempts.push({
      attemptId: "att_b1_pass",
      driverId: DRIVER_B1,
      courseId: COURSE_REQUIRED.courseId,
      courseVersion: 1,
      score: 100,
      passed: true,
      attemptedAt: now.toISOString(),
      answersSummary: [
        { questionId: "q1", selectedOptionId: "opt_no", isCorrect: true },
      ],
    });

    academyService = new AcademyService(repository as never);
    fleetController = new FleetPartnerTrainingController(academyService);
    jwtAuthService = new JwtAuthService();
    bootstrapAuthGuard = new BootstrapAuthGuard(
      new Reflector(),
      jwtAuthService,
    );

    // Socket-free HTTP boundary routing ApiClient requests through the real
    // BootstrapAuthGuard + FleetPartnerTrainingController + AcademyService +
    // SnakeCaseInterceptor wire format.
    globalThis.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const rawUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const parsedUrl = new URL(rawUrl);

        if (parsedUrl.hostname === "metadata.google.internal") {
          return new Response("mock-cloud-run-metadata-oidc-token", {
            status: 200,
          });
        }

        const method = (init?.method ?? "GET").toUpperCase();
        const headerRecord: Record<string, string> = {};
        if (init?.headers) {
          const normalized = new Headers(init.headers as HeadersInit);
          normalized.forEach((value, key) => {
            headerRecord[key.toLowerCase()] = value;
          });
        }

        const queryRecord: Record<string, string> = {};
        parsedUrl.searchParams.forEach((value, key) => {
          queryRecord[key] = value;
        });

        const pathname = parsedUrl.pathname;
        let handlerName: "summary" | "roster" | "driverAttempt" | null = null;
        let driverIdParam = "";
        let attemptIdParam = "";

        if (pathname === "/api/fleet-partner/training/summary") {
          handlerName = "summary";
        } else if (pathname === "/api/fleet-partner/training/roster") {
          handlerName = "roster";
        } else {
          const match = pathname.match(
            /^\/api\/fleet-partner\/training\/drivers\/([^/]+)\/attempts\/([^/]+)$/,
          );
          if (match) {
            handlerName = "driverAttempt";
            driverIdParam = decodeURIComponent(match[1]!);
            attemptIdParam = decodeURIComponent(match[2]!);
          }
        }

        if (!handlerName) {
          return new Response(
            JSON.stringify(
              deepToSnakeCase(
                toApiErrorEnvelope("NOT_FOUND", `Route not found: ${pathname}`),
              ),
            ),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        }

        const requestLike: AuthenticatedRequestLike = {
          method,
          url: `${parsedUrl.pathname}${parsedUrl.search}`,
          originalUrl: `${parsedUrl.pathname}${parsedUrl.search}`,
          headers: headerRecord,
        };

        const handlerFn = FleetPartnerTrainingController.prototype[handlerName];
        const executionContext = {
          switchToHttp: () => ({
            getRequest: () => requestLike,
            getResponse: () => ({}),
            getNext: () => undefined,
          }),
          getHandler: () => handlerFn,
          getClass: () => FleetPartnerTrainingController,
        } as unknown as Parameters<BootstrapAuthGuard["canActivate"]>[0];

        try {
          await bootstrapAuthGuard.canActivate(executionContext);

          const fleetPartnerIdQuery = queryRecord.fleetPartnerId;
          const requestId = headerRecord["x-request-id"];
          const identity =
            (requestLike.identity as BootstrapRequestIdentity | undefined) ??
            null;

          let controllerResult: unknown;
          if (handlerName === "summary") {
            controllerResult = await fleetController.summary(
              fleetPartnerIdQuery,
              identity,
              requestId,
            );
          } else if (handlerName === "roster") {
            controllerResult = await fleetController.roster(
              fleetPartnerIdQuery,
              identity,
              requestId,
            );
          } else {
            controllerResult = await fleetController.driverAttempt(
              driverIdParam,
              attemptIdParam,
              fleetPartnerIdQuery,
              identity,
              requestId,
            );
          }

          recordedCalls.push({
            method,
            url: `${parsedUrl.pathname}${parsedUrl.search}`,
            pathname: parsedUrl.pathname,
            search: parsedUrl.search,
            headers: headerRecord,
            status: 200,
            errorCode: null,
          });

          return new Response(
            JSON.stringify(deepToSnakeCase(controllerResult)),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        } catch (err) {
          const status = err instanceof HttpException ? err.getStatus() : 500;
          const payload =
            err instanceof HttpException
              ? err.getResponse()
              : toApiErrorEnvelope(
                  "INTERNAL_SERVER_ERROR",
                  err instanceof Error ? err.message : "Unexpected error",
                );
          const errorCode =
            (payload as { error?: { code?: string } })?.error?.code ?? null;

          recordedCalls.push({
            method,
            url: `${parsedUrl.pathname}${parsedUrl.search}`,
            pathname: parsedUrl.pathname,
            search: parsedUrl.search,
            headers: headerRecord,
            status,
            errorCode,
          });

          return new Response(JSON.stringify(deepToSnakeCase(payload)), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    ) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe("1. Original F1 Mismatch Reproduction (Billing-Only Client & Missing Non-Tenant Selector)", () => {
    it("1.1 reproduces F1 part 1: billing-only getServerFleetPartnerClient is rejected with 403 AUTH_SCOPE_DENIED on training routes", async () => {
      process.env.DRTS_FLEET_PARTNER_ID = FLEET_ALPHA;
      setRequestContext();

      const { client } = await getServerFleetPartnerClient();

      await expect(client.getFleetTrainingSummary()).rejects.toMatchObject({
        statusCode: 403,
        code: "AUTH_SCOPE_DENIED",
      });
      expect(recordedCalls[0]?.status).toBe(403);
      expect(recordedCalls[0]?.errorCode).toBe("AUTH_SCOPE_DENIED");
    });

    it("1.2 reproduces F1 part 2: non-tenant caller invoking unparameterized SDK training methods without ?fleetPartnerId is rejected with 400 FLEET_PARTNER_ID_REQUIRED", async () => {
      const opsToken = await mintAccessToken(jwtAuthService, opsAdminIdentity());
      setRequestContext({
        authorization: `Bearer ${opsToken}`,
      });

      // Calling the raw SDK method without a canonical fleet selector
      const trainingClient = await getServerFleetTrainingClient();
      await expect(
        trainingClient.client.getFleetTrainingSummary(),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "FLEET_PARTNER_ID_REQUIRED",
      });
      expect(recordedCalls[0]?.url).toBe("/api/fleet-partner/training/summary");
      expect(recordedCalls[0]?.status).toBe(400);
      expect(recordedCalls[0]?.errorCode).toBe("FLEET_PARTNER_ID_REQUIRED");
    });
  });

  describe("2. Authorized Principal & Canonical Fleet Binding (Tenant-Derived & Non-Tenant Explicit Query)", () => {
    it("2.1 verified tenant Bearer token derives canonical fleet from tenantId and loads summary, overdue roster, and attempt drilldown without query override", async () => {
      const tenantToken = await mintAccessToken(
        jwtAuthService,
        tenantFleetAdminIdentity(FLEET_ALPHA),
      );
      setRequestContext({
        authorization: `Bearer ${tenantToken}`,
      });

      const resolved = await getServerFleetTrainingClient();
      expect(resolved.principalSource).toBe("tenant_bearer_session");
      expect(resolved.principalRealm).toBe("tenant");
      expect(resolved.fleetPartnerId).toBe(FLEET_ALPHA);
      expect(resolved.queryFleetPartnerId).toBeNull();

      const trainingData = await loadFleetTraining();
      expect(trainingData.source).toBe("live");
      expect(trainingData.error).toBeNull();
      expect(trainingData.summary).toEqual({
        completionPct: "50%",
        pendingHeadcount: "1",
        overdueIncomplete: 1,
      });
      expect(trainingData.rows).toEqual([
        {
          course: "車行合規與乘客服務規範",
          en: "COMP-101",
          completed: 1,
          total: 2,
          pct: 50,
        },
      ]);
      expect(trainingData.roster).toHaveLength(2);

      const overdueDriver = trainingData.roster.find(
        (item) => item.driverId === DRIVER_A2,
      );
      expect(overdueDriver).toMatchObject({
        driverId: DRIVER_A2,
        driverName: "李小華",
        courseCode: "COMP-101",
        status: "expired",
        score: 90,
        isOverdue: true,
        latestAttemptId: "att_a2_expired",
      });

      const drilldown = await loadFleetDriverQuizAttempt(
        DRIVER_A1,
        "att_a1_pass",
      );
      expect(drilldown).toMatchObject({
        attemptId: "att_a1_pass",
        driverId: DRIVER_A1,
        courseId: COURSE_REQUIRED.courseId,
        courseVersion: 1,
        score: 100,
        passed: true,
        answersSummary: [
          { questionId: "q1", selectedOptionId: "opt_no", isCorrect: true },
        ],
      });

      // Verify URLs did NOT need ?fleetPartnerId because tenant realm derives from identity.tenantId
      expect(recordedCalls.map((c) => c.url)).toEqual([
        "/api/fleet-partner/training/summary",
        "/api/fleet-partner/training/roster",
        `/api/fleet-partner/training/drivers/${DRIVER_A1}/attempts/att_a1_pass`,
      ]);
      expect(recordedCalls.every((c) => c.status === 200)).toBe(true);
    });

    it("2.2 verified tenant session cookie (drts_tenant_session) derives canonical fleet from tenantId", async () => {
      const tenantToken = await mintAccessToken(
        jwtAuthService,
        tenantFleetAdminIdentity(FLEET_ALPHA, "tenant_cookie_admin"),
      );
      setRequestContext(
        {},
        {
          drts_tenant_session: tenantToken,
        },
      );

      const trainingData = await loadFleetTraining();
      expect(trainingData.source).toBe("live");
      expect(trainingData.summary.completionPct).toBe("50%");
      expect(trainingData.roster).toHaveLength(2);
    });

    it("2.3 legitimately authorized ops principal (signed session JWT or control-plane proxy token) passes explicit canonical ?fleetPartnerId query", async () => {
      const controlPlaneAuth = await issueControlPlaneRequestAuth({
        actorType: "ops_user",
        jwtSecret: TEST_JWT_SECRET,
        defaultEmail: "ops@platform.drts",
      });
      setRequestContext({
        ...controlPlaneAuth.headers,
        "x-fleet-partner-id": FLEET_ALPHA,
      });

      const resolved = await getServerFleetTrainingClient();
      expect(resolved.principalSource).toBe("non_tenant_bearer_session");
      expect(resolved.principalRealm).toBe("ops");
      expect(resolved.fleetPartnerId).toBe(FLEET_ALPHA);
      expect(resolved.queryFleetPartnerId).toBe(FLEET_ALPHA);

      const trainingData = await loadFleetTraining();
      expect(trainingData.source).toBe("live");
      expect(trainingData.error).toBeNull();
      expect(trainingData.summary.completionPct).toBe("50%");
      expect(trainingData.summary.overdueIncomplete).toBe(1);

      const drilldown = await loadFleetDriverQuizAttempt(
        DRIVER_A2,
        "att_a2_expired",
      );
      expect(drilldown).toMatchObject({
        attemptId: "att_a2_expired",
        driverId: DRIVER_A2,
        score: 90,
        passed: true,
      });

      expect(recordedCalls.map((c) => c.url)).toEqual([
        `/api/fleet-partner/training/summary?fleetPartnerId=${FLEET_ALPHA}`,
        `/api/fleet-partner/training/roster?fleetPartnerId=${FLEET_ALPHA}`,
        `/api/fleet-partner/training/drivers/${DRIVER_A2}/attempts/att_a2_expired?fleetPartnerId=${FLEET_ALPHA}`,
      ]);
      expect(
        recordedCalls.every(
          (c) =>
            c.status === 200 &&
            Boolean(c.headers[CONTROL_PLANE_REQUEST_AUTH_HEADER]),
        ),
      ).toBe(true);
    });

    it("2.4 FleetTrainingPage server component renders live KPIs, course progress, overdue roster tab, and learner attempt drilldown", async () => {
      const tenantToken = await mintAccessToken(
        jwtAuthService,
        tenantFleetAdminIdentity(FLEET_ALPHA),
      );
      setRequestContext({
        authorization: `Bearer ${tenantToken}`,
      });

      const pageElement = await FleetTrainingPage({
        searchParams: Promise.resolve({
          tab: "overdue",
          driverId: DRIVER_A1,
          attemptId: "att_a1_pass",
        }),
      });
      const html = renderToStaticMarkup(pageElement);

      expect(html).toContain("50%");
      expect(html).toContain("車行合規與乘客服務規範");
      expect(html).toContain("李小華");
      expect(html).toContain(DRIVER_A2);
      expect(html).toContain("att_a1_pass");
      expect(html).toContain("q1");
      expect(html).toContain("opt_no");
    });
  });

  describe("3. Original Scope Denials, Fleet Isolation & Empty/Error Discipline", () => {
    it("3.1 does NOT manufacture authority from display email or Cloud Run metadata token when no verified principal is present (401 AUTH_REQUIRED)", async () => {
      process.env.DRTS_FLEET_PARTNER_ID = FLEET_ALPHA;
      process.env.DRTS_API_AUTH_AUDIENCE = "https://api.drts.internal";
      setRequestContext({
        [CONTROL_PLANE_IAP_EMAIL_HEADER]: "ops@platform.drts",
      });

      const resolved = await getServerFleetTrainingClient();
      expect(resolved.principalSource).toBe("unauthenticated");
      expect(resolved.client.defaultHeaders.authorization).toBeUndefined();
      expect(
        resolved.client.defaultHeaders["x-serverless-authorization"],
      ).toBe("Bearer mock-cloud-run-metadata-oidc-token");

      const result = await loadFleetTraining();
      expect(result.source).toBe("fallback");
      expect(result.summary.completionPct).toBe("—");
      expect(result.error).toContain("AUTH_REQUIRED");

      const drilldown = await loadFleetDriverQuizAttempt(
        DRIVER_A1,
        "att_a1_pass",
      );
      expect(drilldown).toBeNull();
      expect(recordedCalls.every((c) => c.status === 401)).toBe(true);
    });

    it("3.2 rejects forged / wrong-secret JWT bearer token with 401 JWT_INVALID", async () => {
      const forgedToken = jwt.sign(
        {
          sub: "forged_admin",
          actorType: "tenant_admin",
          realm: "tenant",
          tenantId: FLEET_ALPHA,
          roleFamilies: ["tenant"],
          roles: ["tenant_ops_admin"],
          scopes: ["billing:read", "reports:read"],
        },
        "wrong-signing-secret",
        { algorithm: "HS256" },
      );

      setRequestContext({
        authorization: `Bearer ${forgedToken}`,
      });

      const result = await loadFleetTraining();
      expect(result.source).toBe("fallback");
      expect(result.error).toContain("JWT_INVALID");
      expect(recordedCalls[0]?.status).toBe(401);
      expect(recordedCalls[0]?.errorCode).toBe("JWT_INVALID");
    });

    it("3.3 rejects insufficient scope (billing:read without reports:read) with 403 AUTH_SCOPE_DENIED", async () => {
      const billingOnlyToken = await mintAccessToken(jwtAuthService, {
        actorType: "tenant_admin",
        actorId: "usr_billing_only",
        realm: "tenant",
        tenantId: FLEET_ALPHA,
        roleFamilies: ["tenant"],
        roles: ["tenant_billing_viewer"],
        scopes: ["billing:read"],
      });

      setRequestContext({
        authorization: `Bearer ${billingOnlyToken}`,
      });

      const result = await loadFleetTraining();
      expect(result.source).toBe("fallback");
      expect(result.error).toContain("AUTH_SCOPE_DENIED");
      expect(recordedCalls[0]?.status).toBe(403);
      expect(recordedCalls[0]?.errorCode).toBe("AUTH_SCOPE_DENIED");
    });

    it("3.4 rejects disallowed realm (driver realm) with 403 AUTH_REALM_DENIED", async () => {
      const driverToken = await mintAccessToken(jwtAuthService, {
        actorType: "driver_user",
        actorId: DRIVER_A1,
        realm: "driver",
        tenantId: null,
        roleFamilies: ["driver"],
        roles: ["driver"],
        scopes: ["driver:read", "billing:read", "reports:read"],
      });

      setRequestContext({
        authorization: `Bearer ${driverToken}`,
        "x-fleet-partner-id": FLEET_ALPHA,
      });

      const result = await loadFleetTraining();
      expect(result.source).toBe("fallback");
      expect(result.error).toContain("AUTH_REALM_DENIED");
      expect(recordedCalls[0]?.status).toBe(403);
      expect(recordedCalls[0]?.errorCode).toBe("AUTH_REALM_DENIED");
    });

    it("3.5 enforces cross-fleet isolation: Tenant Alpha requesting Fleet Beta selector or Fleet Beta driver drilldown is denied with 403 ACADEMY_FORBIDDEN_FLEET_ACCESS", async () => {
      const tenantAlphaToken = await mintAccessToken(
        jwtAuthService,
        tenantFleetAdminIdentity(FLEET_ALPHA),
      );

      // Cross-fleet header selector against Tenant Alpha identity
      setRequestContext({
        authorization: `Bearer ${tenantAlphaToken}`,
        "x-fleet-partner-id": FLEET_BETA,
      });

      const crossFleetSummary = await loadFleetTraining();
      expect(crossFleetSummary.source).toBe("fallback");
      expect(crossFleetSummary.error).toContain(
        "ACADEMY_FORBIDDEN_FLEET_ACCESS",
      );
      expect(recordedCalls[0]?.url).toBe(
        `/api/fleet-partner/training/summary?fleetPartnerId=${FLEET_BETA}`,
      );
      expect(recordedCalls[0]?.status).toBe(403);
      expect(recordedCalls[0]?.errorCode).toBe(
        "ACADEMY_FORBIDDEN_FLEET_ACCESS",
      );

      // Cross-fleet driver attempt drilldown under own fleet selector
      recordedCalls = [];
      setRequestContext({
        authorization: `Bearer ${tenantAlphaToken}`,
      });

      const crossFleetDrilldown = await loadFleetDriverQuizAttempt(
        DRIVER_B1,
        "att_b1_pass",
      );
      expect(crossFleetDrilldown).toBeNull();
      expect(recordedCalls[0]?.status).toBe(403);
      expect(recordedCalls[0]?.errorCode).toBe(
        "ACADEMY_FORBIDDEN_FLEET_ACCESS",
      );
    });

    it("3.6 returns null when drilling down a driver attempt belonging to a different driver in the same fleet (404 ATTEMPT_NOT_FOUND)", async () => {
      const tenantAlphaToken = await mintAccessToken(
        jwtAuthService,
        tenantFleetAdminIdentity(FLEET_ALPHA),
      );
      setRequestContext({
        authorization: `Bearer ${tenantAlphaToken}`,
      });

      const mismatchedAttempt = await loadFleetDriverQuizAttempt(
        DRIVER_A2,
        "att_a1_pass",
      );
      expect(mismatchedAttempt).toBeNull();
      expect(recordedCalls[0]?.status).toBe(404);
      expect(recordedCalls[0]?.errorCode).toBe("ATTEMPT_NOT_FOUND");
    });

    it("3.7 rethrows configuration error when no principal and no fleet scope configuration is present", async () => {
      setRequestContext();

      await expect(loadFleetTraining()).rejects.toThrow(
        "Missing fleet scope configuration",
      );
      await expect(
        loadFleetDriverQuizAttempt(DRIVER_A1, "att_a1_pass"),
      ).rejects.toThrow("Missing fleet scope configuration");
    });

    it("3.8 distinguishes legitimate zero cohort data (source: live, 0%) from unavailable error fallback (source: fallback, —)", async () => {
      const emptyFleetTenantToken = await mintAccessToken(
        jwtAuthService,
        tenantFleetAdminIdentity(FLEET_EMPTY),
      );
      setRequestContext({
        authorization: `Bearer ${emptyFleetTenantToken}`,
      });

      const zeroData = await loadFleetTraining();
      expect(zeroData.source).toBe("live");
      expect(zeroData.error).toBeNull();
      expect(zeroData.summary).toEqual({
        completionPct: "0%",
        pendingHeadcount: "0",
        overdueIncomplete: 0,
      });
      expect(zeroData.rows).toHaveLength(1);
      expect(zeroData.rows[0]?.completed).toBe(0);
      expect(zeroData.rows[0]?.total).toBe(0);
      expect(zeroData.roster).toEqual([]);
    });

    it("3.9 appendFleetPartnerQuery preserves existing query params and avoids duplicate fleetPartnerId", () => {
      expect(
        appendFleetPartnerQuery(
          "/api/fleet-partner/training/roster?page=2&pageSize=10",
          FLEET_ALPHA,
        ),
      ).toBe(
        `/api/fleet-partner/training/roster?page=2&pageSize=10&fleetPartnerId=${FLEET_ALPHA}`,
      );
      expect(
        appendFleetPartnerQuery(
          `/api/fleet-partner/training/summary?fleetPartnerId=${FLEET_BETA}`,
          FLEET_ALPHA,
        ),
      ).toBe(
        `/api/fleet-partner/training/summary?fleetPartnerId=${FLEET_BETA}`,
      );
      expect(
        appendFleetPartnerQuery("/api/fleet-partner/statements", FLEET_ALPHA),
      ).toBe("/api/fleet-partner/statements");
    });
  });
});
