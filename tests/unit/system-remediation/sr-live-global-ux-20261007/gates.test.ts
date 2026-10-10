import {
  execFileSync,
  type ExecFileSyncOptionsWithStringEncoding,
} from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  automatedChecks,
  cases,
  manualChecks,
  recipeKey,
  type CaseEvidence,
  type Deployment,
  type Inventory,
  type ManualEvidence,
  type Plan,
  type Session,
  type Applicability,
} from "../../../e2e/system-remediation/sr-live-global-ux-20261007/model";
import {
  expectedFormat,
  gate,
  isolatedHeaders,
  localRoute,
  origin,
  validateDeployment,
  validatePlan,
  validateSessions,
} from "../../../e2e/system-remediation/sr-live-global-ux-20261007/guards";
import {
  hash,
  inventoryAt,
} from "../../../e2e/system-remediation/sr-live-global-ux-20261007/inventory";
import { scaffoldPlan } from "../../../e2e/system-remediation/sr-live-global-ux-20261007/runner";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});
const { execFileSync: realExecFileSync } =
  await vi.importActual<typeof import("node:child_process")>(
    "node:child_process",
  );
afterEach(() => vi.mocked(execFileSync).mockImplementation(realExecFileSync));

// Only alter the external git source response; inventoryAt, page discovery,
// source/blob binding, and exact service comparison execute unchanged.
function alterSource(head: string, path: string, alter: (s: string) => string) {
  vi.mocked(execFileSync).mockImplementation(((
    command: string,
    args: string[],
    options: ExecFileSyncOptionsWithStringEncoding,
  ) => {
    const result = realExecFileSync(command, args, options);
    return command === "git" &&
      args[0] === "show" &&
      args[1] === `${head}:${path}`
      ? alter(result)
      : result;
  }) as typeof execFileSync);
}

const sha = "a".repeat(40);
const inventory: Inventory = {
  runtimeSha: sha,
  surfaces: [
    {
      app: "tenant-console-web",
      service: "drts-dev-tenant-console-web",
      roles: ["tenant_admin"],
      roleSource: "policy.ts",
    },
  ],
  screens: [
    {
      id: "tenant-console-web:/users",
      app: "tenant-console-web",
      route: "/users",
      source: "apps/tenant-console-web/app/users/page.tsx",
      sourceBlob: "b".repeat(40),
      sourceCommit: sha,
      roles: ["tenant_admin"],
      design: "unverified",
    },
  ],
  excluded: {},
};
const binding = {
  harnessSha: "c".repeat(40),
  runId: "123/1",
  planHash: "d".repeat(64),
};
const artifact = Buffer.from("sandbox artifact");
function evidence() {
  const rows: CaseEvidence[] = cases(inventory).map((c) => ({
    id: c.id,
    ...binding,
    runtimeSha: sha,
    source: c.screen.source,
    sourceBlob: c.screen.sourceBlob,
    route: c.screen.route,
    role: c.role,
    locale: c.locale,
    width: c.width,
    status: "passed",
    checks: [...automatedChecks],
    screenshot: "screenshots/test.png",
    screenshotHash: hash(artifact),
    consoleErrors: 0,
    sessionKind: "authorized-isolation",
  }));
  const manual: ManualEvidence[] = rows.map((row) => ({
    id: row.id,
    runtimeSha: sha,
    ...binding,
    checks: manualChecks.map((check) => ({
      check,
      status: "passed",
      tester: "authorized-tester",
      tool: "NVDA/Firefox or contrast analyser, version recorded in artifact",
      procedure: "case steps and observations",
      artifact: "manual/report.txt",
      sha256: hash(artifact),
      sourceRef: row.source,
    })),
  }));
  return { rows, manual };
}
const runGate = (e: ReturnType<typeof evidence>) =>
  gate(inventory, e.rows, e.manual, binding, () => artifact);

describe("strict evidence parser and fixed denominator", () => {
  it("retains reviewed N/A cases in the denominator and rejects unreviewed page exclusions", () => {
    const e = evidence();
    const rule: Applicability = {
      key: `${inventory.screens[0]!.id}|tenant_admin|dialog`,
      runtimeSha: sha,
      sourceBlob: inventory.screens[0]!.sourceBlob,
      decisionRef: `${inventory.screens[0]!.source}: reviewed absence of dialogs`,
      reason: "Source has no dialog interactions",
    };
    const ids = new Set(
      cases(inventory)
        .filter((c) => recipeKey(c) === rule.key)
        .map((c) => c.id),
    );
    for (const row of e.rows)
      if (ids.has(row.id)) {
        row.status = "not_applicable";
        row.reason = rule.decisionRef;
        row.checks = [];
      }
    e.manual = e.manual.filter((row) => !ids.has(row.id));
    expect(
      gate(inventory, e.rows, e.manual, binding, () => artifact, [rule]),
    ).toMatchObject({ cases: 48, applicableCases: 42, notApplicable: 6 });
    expect(() =>
      gate(inventory, e.rows, e.manual, binding, () => artifact),
    ).toThrow();
    expect(() =>
      gate(inventory, e.rows, e.manual, binding, () => artifact, [
        { ...rule, key: rule.key.replace("dialog", "default") },
      ]),
    ).toThrow("page exclusion");
  });
  it("accepts complete, bound evidence; unit fixture is not live acceptance", () =>
    expect(runGate(evidence()).cases).toBe(48));
  it.each(["failed", "blocked", "skipped", "not_applicable"] as const)(
    "rejects %s instead of shrinking denominator",
    (status) => {
      const e = evidence();
      e.rows[0]!.status = status;
      expect(() => runGate(e)).toThrow();
    },
  );
  it.each(["missing", "duplicate", "extra"])("rejects %s rows", (change) => {
    const e = evidence();
    if (change === "missing") e.rows.pop();
    else if (change === "duplicate") e.rows[1] = { ...e.rows[0]! };
    else e.rows.push({ ...e.rows[0]!, id: "unrequested" });
    expect(() => runGate(e)).toThrow();
  });
  it.each([
    "runtimeSha",
    "harnessSha",
    "planHash",
    "runId",
    "sourceBlob",
    "source",
    "role",
    "locale",
    "width",
  ])("rejects mismatched %s", (field) => {
    const e = evidence();
    (e.rows[0] as unknown as Record<string, unknown>)[field] = "wrong";
    expect(() => runGate(e)).toThrow();
  });
  it("rejects missing/duplicated measurements and console errors", () => {
    for (const mutation of [
      (r: CaseEvidence) => r.checks.pop(),
      (r: CaseEvidence) => r.checks.push("locale"),
      (r: CaseEvidence) => r.consoleErrors++,
    ]) {
      const e = evidence();
      mutation(e.rows[0]!);
      expect(() => runGate(e)).toThrow();
    }
  });
  it("requires actual screenshot bytes", () => {
    const e = evidence();
    e.rows[0]!.screenshotHash = "f".repeat(64);
    expect(() => runGate(e)).toThrow("screenshot");
  });
  it("requires every manual check with matching release, source and artifact digest", () => {
    for (const mutate of [
      (e: ReturnType<typeof evidence>) => e.manual.pop(),
      (e: ReturnType<typeof evidence>) => e.manual[0]!.checks.pop(),
      (e: ReturnType<typeof evidence>) =>
        (e.manual[0]!.runtimeSha = "f".repeat(40)),
      (e: ReturnType<typeof evidence>) =>
        (e.manual[0]!.checks[0]!.status = "blocked"),
      (e: ReturnType<typeof evidence>) =>
        (e.manual[0]!.checks[0]!.sha256 = "f".repeat(64)),
      (e: ReturnType<typeof evidence>) =>
        (e.manual[0]!.checks[0]!.sourceRef = "raw design ZIP"),
    ]) {
      const e = evidence();
      mutate(e);
      expect(() => runGate(e)).toThrow();
    }
  });
  it("preserves all locales, widths, states and roles independently of supplied recipes", () => {
    expect(new Set(cases(inventory).map((c) => c.id)).size).toBe(48);
    expect(new Set(cases(inventory).map(recipeKey)).size).toBe(8);
  });
});

describe("origin token and role boundaries", () => {
  const target = "https://tenant-project.us-central1.run.app";
  it("injects invoker token only for exact origin and strips inherited credentials on redirects", () => {
    const headers = {
      Authorization: "Bearer app-secret",
      cookie: "app-session=secret",
      "X-Goog-Iap-Jwt-Assertion": "iap-secret",
      "X-Serverless-Authorization": "stale",
      "X-Drts-Google-Id-Token": "internal-token",
    };
    expect(
      isolatedHeaders(`${target}/users`, target, "invoker", headers),
    ).toEqual({
      cookie: "app-session=secret",
      "X-Serverless-Authorization": "Bearer invoker",
    });
    for (const url of [
      "https://third-party.example/image",
      `${target}.evil.example/`,
      "https://another-project.run.app/",
    ])
      expect(isolatedHeaders(url, target, "invoker", headers)).toEqual({});
  });
  it.each([
    "http://localhost:3000",
    "https://127.0.0.1",
    "https://example.com",
    "https://host.run.app/path",
    "https://user:pass@host.run.app",
  ])("rejects origin %s", (value) => expect(() => origin(value)).toThrow());
  it.each([
    "//evil.example",
    "/\\evil.example",
    "/users/[id]",
    "/x?token=secret",
    "/x\n",
  ])("rejects unsafe route %s", (value) =>
    expect(() => localRoute(value)).toThrow(),
  );
  const deployment: Deployment = {
    project: "current-project",
    region: "us-central1",
    runtimeSha: sha,
    observedAt: new Date().toISOString(),
    services: [
      {
        app: "tenant-console-web",
        service: "drts-dev-tenant-console-web",
        origin: target,
        revisions: [
          { name: "rev-1", percent: 100, sha, image: "image@sha256:abc" },
        ],
      },
      {
        app: "api",
        service: "drts-dev-api",
        origin: "https://api-project.run.app",
        revisions: [
          { name: "api-1", percent: 100, sha, image: "api@sha256:abc" },
        ],
      },
    ],
  };
  const session: Session = {
    app: "tenant-console-web",
    role: "tenant_admin",
    kind: "authorized-isolation",
    authorizationRef: "reviewed-isolated-fixture",
    subjectAlias: "sandbox-admin",
    sandboxOnly: true,
    identity: {
      path: "/api/session",
      subjectPath: "subject",
      rolePath: "roles",
      expectedSubject: "fixture-subject",
    },
    storageState: {
      cookies: [
        {
          name: "session",
          value: "not-real",
          domain: new URL(target).hostname,
          path: "/",
          expires: -1,
          secure: true,
          httpOnly: true,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  };
  it("requires one current target and all live revisions with the same SHA", () => {
    validateDeployment(deployment, inventory, "current-project", "us-central1");
    const copy = structuredClone(deployment);
    copy.services[0]!.revisions.push({
      name: "old",
      percent: 1,
      sha: "e".repeat(40),
      image: "old",
    });
    expect(() =>
      validateDeployment(copy, inventory, "current-project", "us-central1"),
    ).toThrow();
    expect(() =>
      validateDeployment(
        deployment,
        inventory,
        "nodal-alloy-503700-s3",
        "us-central1",
      ),
    ).toThrow();
  });
  it("requires real authorized role catalog with origin-scoped cookies", () => {
    validateSessions([session], deployment, inventory);
    expect(() => validateSessions([], deployment, inventory)).toThrow();
    const copy = structuredClone(session);
    copy.storageState.cookies[0]!.domain = ".run.app";
    expect(() => validateSessions([copy], deployment, inventory)).toThrow();
    (copy as unknown as Record<string, unknown>).kind = "demo";
    expect(() => validateSessions([copy], deployment, inventory)).toThrow();
  });
});

describe("locale intent and source mapping", () => {
  it("uses explicit timezone across UTC midnight and preserves currency/branding Latin text", () => {
    expect(
      expectedFormat("date", "2026-10-06T18:00:00Z", "en-US", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    ).toBe("10/07/2026");
    expect(
      expectedFormat("money", 1234, "zh-TW", {
        style: "currency",
        currency: "TWD",
        maximumFractionDigits: 0,
      }),
    ).toContain("1,234");
    expect(() =>
      expectedFormat("date", "2026-10-07T00:00:00", "en-US", {
        timeZone: "Asia/Taipei",
      }),
    ).toThrow();
    expect(() =>
      expectedFormat("date", "2026-10-07T00:00:00Z", "en-US", {}),
    ).toThrow();
    expect(() =>
      expectedFormat("money", Number.NaN, "en-US", {
        style: "currency",
        currency: "TWD",
      }),
    ).toThrow();
  });
  it("missing recipes remain blocked, and recipes cannot substitute an unrelated page", () => {
    const plan: Plan = {
      runtimeSha: sha,
      sandboxOnly: true,
      approvalRef: "operator-reviewed",
      expiresAt: "2099-01-01T00:00:00Z",
      recipes: {},
    };
    validatePlan(plan, inventory);
    plan.recipes[recipeKey(cases(inventory)[0]!)] = {
      route: "/login",
      finalPath: "/login",
      ready: "h1",
      expectedStatus: 200,
      stateProof: {
        selector: "h1",
        source: inventory.screens[0]!.source,
        text: { "zh-TW": "登入", "en-US": "Login" },
      },
      steps: { "zh-TW": [], "en-US": [] },
      formats: { "zh-TW": [], "en-US": [] },
      noFormatsReason: "No dates or money on login",
      mask: [],
    };
    expect(() => validatePlan(plan, inventory)).toThrow("different source");
  });
  it("discovers every active page from the real commit, including client referral screens", () => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const manifest = inventoryAt(head);
    expect(manifest.surfaces).toContainEqual({
      app: "passenger-app-web",
      service: "drts-dev-passenger-app-web",
      roles: ["first_party_passenger"],
      roleSource: "packages/contracts/src/passenger-app.ts",
    });
    expect(manifest.excluded).not.toHaveProperty("passenger-app-web");
    for (const app of ["passenger-web", "partner-booking-web"])
      expect(manifest.excluded).toHaveProperty(app);
    const plan = scaffoldPlan(manifest);
    expect(Object.keys(plan.recipes)).toHaveLength(4);
    expect(() => validatePlan(plan, manifest)).toThrow("missing/expired");
    validatePlan(
      {
        ...plan,
        approvalRef: "test-only-authorization",
        expiresAt: "2099-01-01T00:00:00Z",
      },
      manifest,
    );
    const files = execFileSync(
      "git",
      ["ls-tree", "-r", "--name-only", head, "apps"],
      { encoding: "utf8" },
    ).split("\n");
    const pages = files.filter(
      (file) =>
        manifest.surfaces.some((s) => file.startsWith(`apps/${s.app}/app/`)) &&
        file.endsWith("/page.tsx"),
    );
    expect(
      [
        ...new Set(
          manifest.screens
            .filter((s) => s.source.endsWith("/page.tsx"))
            .map((s) => s.source),
        ),
      ].sort(),
    ).toEqual(pages.sort());
    expect(
      manifest.screens.filter((s) => s.id.includes("?screen=")).length,
    ).toBe(14);
    const passengerPages = pages.filter((file) =>
      file.startsWith("apps/passenger-app-web/app/"),
    );
    const passengerScreens = manifest.screens.filter(
      (screen) => screen.app === "passenger-app-web",
    );
    expect(passengerPages.length).toBeGreaterThan(0);
    expect(passengerScreens.map((s) => s.source).sort()).toEqual(
      passengerPages.sort(),
    );
    expect(
      passengerScreens.every((s) => s.roles.join() === "first_party_passenger"),
    ).toBe(true);
    expect(
      cases(manifest).filter((c) => c.screen.app === "passenger-app-web"),
    ).toHaveLength(passengerPages.length * 8 * 2 * 3);
    expect(
      manifest.screens.every(
        (s) =>
          s.sourceCommit === head &&
          /^[a-f0-9]{40}$/.test(s.sourceBlob) &&
          s.design === "unverified",
      ),
    ).toBe(true);
  });
  it.each(["passenger-app-web", "tenant-console-web"])(
    "rejects missing active surface %s without shrinking the page denominator",
    (app) => {
      const head = realExecFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      alterSource(head, ".github/workflows/deploy-dev.yml", (source) =>
        source.replace(
          new RegExp(`^.*assert_exact_active_service ${app} .*$`, "m"),
          "",
        ),
      );
      expect(() => inventoryAt(head)).toThrow(
        "deployment active surface inventory changed",
      );
    },
  );
  it.each([
    "rogue-web",
    "passenger-web",
    "partner-booking-web",
    "passenger-app-web",
  ])("rejects extra or duplicated active surface %s", (app) => {
    const head = realExecFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    alterSource(
      head,
      ".github/workflows/deploy-dev.yml",
      (source) =>
        `${source}\nassert_exact_active_service ${app} "$target" "drts-dev-${app}"\n`,
    );
    expect(() => inventoryAt(head)).toThrow(
      "deployment active surface inventory changed",
    );
  });
  it.each(["PASSENGER_REALM", "FIRST_PARTY_PASSENGER_ACTOR_TYPE"])(
    "rejects drift in formal passenger identity %s",
    (symbol) => {
      const head = realExecFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      alterSource(head, "packages/contracts/src/passenger-app.ts", (source) =>
        source.replace(
          new RegExp(`export const ${symbol} = "[^"]+";`),
          `export const ${symbol} = "legacy_passenger_role";`,
        ),
      );
      expect(() => inventoryAt(head)).toThrow(
        "passenger identity source changed",
      );
    },
  );
  it("workflow never starts a local product server and keeps browser/manual gates distinct", () => {
    const workflow = readFileSync(
      ".github/workflows/live-global-ux-acceptance.yml",
      "utf8",
    );
    expect(workflow).not.toMatch(
      /pnpm dev|docker compose|next start|playwright.*--ui/,
    );
    expect(workflow).toContain("runner.ts gate");
    expect(workflow).toContain("pull_request:");
    expect(
      readFileSync("playwright.live-global-ux.config.ts", "utf8"),
    ).not.toMatch(/webServer\s*:/);
  });
});
