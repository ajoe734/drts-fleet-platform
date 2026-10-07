import { strict as assert } from "node:assert";
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
} from "./model";
import { fullSha, hash } from "./inventory";

export function origin(value: string): string {
  const url = new URL(value);
  assert(
    url.protocol === "https:" && url.hostname.endsWith(".run.app"),
    "only Cloud Run HTTPS origins are authorized",
  );
  assert(
    !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.port,
    "origin must be canonical",
  );
  return url.origin;
}
export function localRoute(value: string): string {
  assert(
    typeof value === "string" &&
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !/[\\\r\n#]/.test(value),
    "local route required",
  );
  assert(
    new URL(value, "https://scope.invalid").origin === "https://scope.invalid",
    "route escaped origin",
  );
  assert(!/[[\]]/.test(value), "unresolved dynamic route");
  assert(
    !/[?&](?:token|code|session|handoff|authorization)=/i.test(value),
    "secrets must use origin-bound session storage, not evidence URLs",
  );
  return value;
}
// Used for EACH browser request, including redirects. Never set global extraHTTPHeaders.
export function isolatedHeaders(
  url: string,
  target: string,
  token: string | undefined,
  headers: Record<string, string>,
): Record<string, string> {
  const result = Object.fromEntries(
    Object.entries(headers).filter(
      ([key]) =>
        !/^(authorization|proxy-authorization|x-serverless-authorization|x-goog-iap-jwt-assertion|x-drts-google-id-token|x-drts-internal-key|x-api-key|x-trusted-proxy-secret|x-internal-key|x-actor.*|x-role.*|x-scope.*)$/i.test(
          key,
        ),
    ),
  );
  if (new URL(url).origin === origin(target)) {
    assert(token && !/[\r\n]/.test(token), "missing origin invoker token");
    result["X-Serverless-Authorization"] = `Bearer ${token}`;
  } else {
    for (const key of Object.keys(result))
      if (/^(cookie$|referer$|x-)/i.test(key)) delete result[key];
  }
  return result;
}
export function validateDeployment(
  d: Deployment,
  inventory: Inventory,
  project: string,
  region: string,
) {
  assert(
    project && region && project !== "nodal-alloy-503700-s3",
    "live DEV_GCP variables required",
  );
  assert(
    d.project === project &&
      d.region === region &&
      d.runtimeSha === inventory.runtimeSha,
    "deployment target/SHA mismatch",
  );
  const expected = [
    ...inventory.surfaces.map((s) => [s.app, s.service]),
    ["api", "drts-dev-api"],
  ];
  assert.equal(
    d.services.length,
    expected.length,
    "deployment surface denominator mismatch",
  );
  assert.equal(
    new Set(d.services.map((s) => s.origin)).size,
    expected.length,
    "duplicate origins",
  );
  for (const [app, service] of expected) {
    const rows = d.services.filter(
      (s) => s.app === app && s.service === service,
    );
    assert.equal(rows.length, 1, `missing deployment surface: ${app}`);
    const row = rows[0]!;
    origin(row.origin);
    assert(row.revisions.length > 0, "no serving revision");
    assert.equal(
      row.revisions.reduce((sum, rev) => sum + rev.percent, 0),
      100,
      "traffic denominator mismatch",
    );
    for (const rev of row.revisions)
      assert(
        rev.name && rev.image && rev.percent > 0 && rev.sha === d.runtimeSha,
        "mixed/stale runtime revisions",
      );
  }
}
export function validateSessions(
  sessions: Session[],
  d: Deployment,
  inventory: Inventory,
) {
  const needed = inventory.surfaces.flatMap((s) =>
    s.roles.map((role) => `${s.app}|${role}`),
  );
  assert.equal(
    sessions.length,
    needed.length,
    "authorized role catalog incomplete",
  );
  assert.equal(
    new Set(sessions.map((s) => `${s.app}|${s.role}`)).size,
    needed.length,
    "duplicate sessions",
  );
  for (const session of sessions) {
    assert(needed.includes(`${session.app}|${session.role}`), "unknown role");
    assert(
      ["named-human", "authorized-isolation"].includes(session.kind),
      "demo is not human/IAP identity",
    );
    assert(
      session.sandboxOnly === true &&
        session.authorizationRef?.trim() &&
        session.subjectAlias?.trim(),
      "sandbox authorization missing",
    );
    const url = new URL(d.services.find((s) => s.app === session.app)!.origin);
    localRoute(session.identity.path);
    assert(
      session.identity.subjectPath &&
        session.identity.rolePath &&
        session.identity.expectedSubject,
      "server identity readback required",
    );
    assert(
      session.storageState.cookies.length > 0,
      "provisioned application session required; invoker token alone is not login",
    );
    for (const cookie of session.storageState.cookies) {
      assert(
        cookie.domain === url.hostname &&
          cookie.secure &&
          cookie.value &&
          cookie.path === "/",
        "session cookie escaped origin",
      );
      assert(
        cookie.expires === -1 || cookie.expires * 1000 > Date.now(),
        "expired baseline session",
      );
    }
    for (const item of session.storageState.origins)
      assert(item.origin === url.origin, "localStorage escaped origin");
    for (const state of Object.values(session.variants ?? {})) {
      for (const cookie of state.cookies)
        assert(
          cookie.domain === url.hostname &&
            cookie.secure &&
            cookie.path === "/",
          "variant cookie escaped origin",
        );
      for (const item of state.origins)
        assert(
          item.origin === url.origin,
          "variant localStorage escaped origin",
        );
    }
  }
}
export function validatePlan(plan: Plan, inventory: Inventory) {
  assert.equal(
    plan.runtimeSha,
    inventory.runtimeSha,
    "fixture plan runtime mismatch",
  );
  assert(
    plan.sandboxOnly === true &&
      plan.approvalRef?.trim() &&
      Date.parse(plan.expiresAt) > Date.now(),
    "reviewed sandbox plan missing/expired",
  );
  const keys = new Set(cases(inventory).map(recipeKey));
  for (const [key, recipe] of Object.entries(plan.recipes)) {
    assert(keys.has(key), `unknown recipe: ${key}`);
    localRoute(recipe.route);
    localRoute(recipe.finalPath);
    assert(
      recipe.ready && recipe.stateProof?.selector && recipe.stateProof.source,
      "state proof required",
    );
    const screen = inventory.screens.find((s) => key.startsWith(`${s.id}|`))!;
    const routePattern = screen.route
      .split("?")[0]!
      .split("/")
      .map((part) =>
        /^\[[^\]]+\]$/.test(part)
          ? "[^/]+"
          : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("/");
    assert(
      new RegExp(`^${routePattern}$`).test(
        new URL(recipe.route, "https://scope.invalid").pathname,
      ),
      "recipe navigates a different source page",
    );
    if (screen.route.includes("?screen="))
      assert.equal(
        new URL(recipe.route, "https://scope.invalid").searchParams.get(
          "screen",
        ),
        screen.route.split("?screen=")[1],
        "referral screen mismatch",
      );
    assert(
      recipe.stateProof.source === screen.source,
      "state proof must cite exact inventoried source",
    );
    assert(
      Number.isInteger(recipe.expectedStatus) &&
        [200, 400, 401, 403, 404, 422, 429, 503].includes(
          recipe.expectedStatus,
        ),
      "invalid expected document status",
    );
    for (const locale of ["zh-TW", "en-US"] as const) {
      assert(
        recipe.stateProof.text[locale]?.trim(),
        "locale-specific state text required",
      );
      assert(Array.isArray(recipe.steps[locale]), "keyboard recipe required");
      for (const step of recipe.steps[locale]) {
        assert(
          ["tab", "press", "type", "focus", "visible"].includes(step.kind),
          "unsupported step",
        );
        if (step.kind === "tab")
          assert(
            step.target && step.max >= 1 && step.max <= 200,
            "invalid tab bound",
          );
        if (step.kind === "press")
          assert(
            ["Enter", "Space", "Escape", "Tab", "Shift+Tab"].includes(step.key),
            "invalid keyboard operation",
          );
      }
      assert(Array.isArray(recipe.formats[locale]), "format evidence required");
      assert(
        recipe.formats[locale].length || recipe.noFormatsReason?.trim(),
        "money/date absence requires rationale",
      );
      for (const probe of recipe.formats[locale])
        expectedFormat(probe.kind, probe.value, locale, probe.options);
    }
    const state = key.split("|").at(-1);
    if (state === "validation")
      assert(
        recipe.steps["en-US"].some(
          (s) => s.kind === "press" && s.key === "Enter",
        ) &&
          recipe.steps["zh-TW"].some(
            (s) => s.kind === "press" && s.key === "Enter",
          ),
        "validation must operate the real form using keyboard",
      );
    if (state === "dialog")
      assert(
        recipe.dialog?.trigger &&
          recipe.dialog.selector &&
          recipe.dialog.returnTo,
        "dialog focus movement/return contract missing",
      );
    assert(
      Array.isArray(recipe.mask),
      "explicit screenshot redactions required",
    );
  }
  // Missing recipes are retained as blocked cases by the runner, never silently dropped.
}
export function expectedFormat(
  kind: string,
  value: string | number,
  locale: string,
  options: Intl.DateTimeFormatOptions | Intl.NumberFormatOptions,
): string {
  assert(["zh-TW", "en-US"].includes(locale), "unsupported locale");
  if (kind === "money") {
    assert(
      typeof value === "number" && Number.isFinite(value),
      "invalid amount",
    );
    const o = options as Intl.NumberFormatOptions;
    assert(
      o.style === "currency" && o.currency === "TWD",
      "explicit TWD required",
    );
    return new Intl.NumberFormat(locale, o).format(value);
  }
  assert(
    kind === "date" &&
      typeof value === "string" &&
      /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      !Number.isNaN(Date.parse(value)),
    "date needs explicit source timezone",
  );
  const o = options as Intl.DateTimeFormatOptions;
  assert(o.timeZone, "explicit user/tenant timezone required");
  return new Intl.DateTimeFormat(locale, o).format(new Date(value));
}
export function gate(
  inventory: Inventory,
  evidence: CaseEvidence[],
  manual: ManualEvidence[],
  binding: { harnessSha: string; runId: string; planHash: string },
  readArtifact: (file: string) => Buffer,
  applicability: Applicability[] = [],
) {
  validateApplicability(applicability, inventory);
  assert(
    fullSha(binding.harnessSha) &&
      binding.runId &&
      /^[a-f0-9]{64}$/.test(binding.planHash),
    "invalid run binding",
  );
  const expected = cases(inventory);
  assert.equal(evidence.length, expected.length, "case denominator mismatch");
  assert.equal(
    new Set(evidence.map((e) => e.id)).size,
    expected.length,
    "duplicate case evidence",
  );
  const applicable = expected.filter(
    (c) => !applicability.some((rule) => rule.key === recipeKey(c)),
  );
  assert.equal(manual.length, applicable.length, "manual coverage incomplete");
  assert.equal(
    new Set(manual.map((e) => e.id)).size,
    applicable.length,
    "duplicate manual evidence",
  );
  const rows = new Map(evidence.map((e) => [e.id, e]));
  const manuals = new Map(manual.map((e) => [e.id, e]));
  for (const c of expected) {
    const row = rows.get(c.id);
    assert(row, `missing case: ${c.id}`);
    for (const [key, value] of Object.entries(binding))
      assert.equal(row[key as keyof CaseEvidence], value, `stale ${key}`);
    assert(
      row.runtimeSha === inventory.runtimeSha &&
        row.source === c.screen.source &&
        row.sourceBlob === c.screen.sourceBlob &&
        row.role === c.role &&
        row.locale === c.locale &&
        row.width === c.width,
      "case source/role/viewport mismatch",
    );
    const decision = applicability.find((rule) => rule.key === recipeKey(c));
    if (decision) {
      assert(
        row.status === "not_applicable" &&
          row.reason === decision.decisionRef &&
          row.checks.length === 0,
        "N/A must match reviewed source decision",
      );
      continue;
    }
    assert.equal(row.status, "passed", `case not passed: ${c.id}`);
    assert(
      row.sessionKind === "named-human" ||
        row.sessionKind === "authorized-isolation",
      "missing session provenance",
    );
    assert.equal(row.consoleErrors, 0, "console errors remain");
    assert.deepEqual(
      [...row.checks].sort(),
      [...automatedChecks].sort(),
      "missing/duplicate automated measurements",
    );
    assert(
      row.screenshot &&
        row.screenshotHash &&
        hash(readArtifact(row.screenshot)) === row.screenshotHash,
      "screenshot missing/corrupt",
    );
    const m = manuals.get(c.id);
    assert(
      m &&
        m.runtimeSha === row.runtimeSha &&
        m.harnessSha === row.harnessSha &&
        /^\d+\/\d+$/.test(m.runId) &&
        m.planHash === row.planHash,
      "manual release/run/plan mismatch",
    );
    assert.deepEqual(
      m.checks.map((check) => check.check).sort(),
      [...manualChecks].sort(),
      "manual gate omitted/duplicated",
    );
    for (const check of m.checks) {
      assert(
        check.status === "passed" &&
          check.tester?.trim() &&
          check.tool?.trim() &&
          check.procedure?.trim() &&
          check.sourceRef?.includes(c.screen.source),
        "unverified manual/design evidence",
      );
      assert(
        /^[a-f0-9]{64}$/.test(check.sha256) &&
          hash(readArtifact(check.artifact)) === check.sha256,
        "manual artifact missing/corrupt",
      );
    }
  }
  return {
    status: "passed",
    cases: expected.length,
    applicableCases: applicable.length,
    notApplicable: expected.length - applicable.length,
    runtimeSha: inventory.runtimeSha,
    ...binding,
  };
}

export function validateApplicability(
  rules: Applicability[],
  inventory: Inventory,
) {
  const all = new Map(cases(inventory).map((c) => [recipeKey(c), c]));
  assert.equal(
    new Set(rules.map((rule) => rule.key)).size,
    rules.length,
    "duplicate N/A decision",
  );
  for (const rule of rules) {
    const c = all.get(rule.key);
    assert(
      c && c.state !== "default",
      "unknown N/A key or attempted page exclusion",
    );
    assert(
      rule.runtimeSha === inventory.runtimeSha &&
        rule.sourceBlob === c.screen.sourceBlob &&
        rule.reason?.trim() &&
        rule.decisionRef?.includes(c.screen.source),
      "N/A decision must cite the frozen source and rationale",
    );
  }
}
