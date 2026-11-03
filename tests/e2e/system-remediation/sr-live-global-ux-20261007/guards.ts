import { strict as assert } from "node:assert";
import {
  automatedChecks,
  cases,
  manualChecks,
  recipeKey,
  type CaseEvidence,
  type Deployment,
  type IdentityReadbackClassification,
  type IdentityReadbackResult,
  type Inventory,
  type ManualEvidence,
  type Plan,
  type Session,
  type Applicability,
} from "./model";
import { fullSha, hash } from "./inventory";

const BANK_TENANT_ROLE_TO_DISPLAY_ROLE: Record<
  string,
  "bank_program_admin" | "bank_ops_viewer" | "bank_finance"
> = {
  tenant_admin: "bank_program_admin",
  tenant_finance_admin: "bank_finance",
  tenant_ops_admin: "bank_ops_viewer",
  tenant_viewer: "bank_ops_viewer",
};

const VALID_CLASSIFICATIONS: readonly IdentityReadbackClassification[] = [
  "direct",
  "bank_ui_role",
  "referral_public_session",
  "first_party_passenger_account",
];

export function getIdentityField(value: unknown, field: string): unknown {
  assert(
    typeof field === "string" &&
      field.trim().length > 0 &&
      !field.startsWith(".") &&
      !field.endsWith(".") &&
      !field.includes(".."),
    "invalid identity field path",
  );
  return field
    .split(".")
    .reduce<unknown>(
      (v, key) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? (v as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}

function validateSessionIdentityContract(
  session: Pick<Session, "app" | "role" | "identity">,
  inventory: Inventory,
) {
  if (session.identity.classification !== undefined) {
    assert(
      VALID_CLASSIFICATIONS.includes(session.identity.classification),
      "invalid identity readback classification",
    );
  }
  if (session.app === "bank-console-web") {
    assert(
      session.identity.path === "/api/auth/session" &&
        session.identity.subjectPath === "data.identity.actor_id" &&
        [
          "data.identity.roles",
          "data.identity.display_role",
          "data.identity.display_roles",
        ].includes(session.identity.rolePath) &&
        (!session.identity.classification ||
          ["bank_ui_role", "direct"].includes(session.identity.classification)),
      "bank session identity contract mismatch",
    );
    return;
  }
  if (session.app === "referral-embed-web") {
    assert(
      session.identity.path === "/api/referral/session" &&
        [
          "data.identity.actor_id",
          "data.identity.subject_alias",
          "data.identity.recovery_scope",
          "data.session.recoveryScope",
          "session.recoveryScope",
        ].includes(session.identity.subjectPath) &&
        ["data.identity.actor_type", "data.identity.roles"].includes(
          session.identity.rolePath,
        ) &&
        /^[0-9a-f]{64}$/.test(session.identity.expectedSubject) &&
        (!session.identity.classification ||
          ["referral_public_session", "direct"].includes(
            session.identity.classification,
          )),
      "referral session identity contract mismatch",
    );
    return;
  }
  if (session.app === "passenger-app-web") {
    assert(
      session.identity.path === "/api/passenger-app/me" &&
        session.identity.subjectPath === "data.account.drts_passenger_id" &&
        ["data.account.status", "data.account"].includes(
          session.identity.rolePath,
        ) &&
        (!session.identity.classification ||
          session.identity.classification === "first_party_passenger_account"),
      "passenger session identity contract mismatch",
    );
    return;
  }
  if (session.app === "ops-console-web" && session.role === "ops_observer") {
    assert(
      session.identity.path === "/control-plane-proxy/auth/session" &&
        session.identity.subjectPath === "data.identity.actor_id" &&
        session.identity.rolePath === "data.identity.roles" &&
        (!session.identity.classification ||
          session.identity.classification === "direct"),
      "ops_observer session identity contract mismatch",
    );
    return;
  }
  const surface = inventory.surfaces.find((s) => s.app === session.app);
  if (!surface || surface.roleSource === "policy.ts") {
    return;
  }
  const directExpected: Record<
    string,
    { path: string; subjectPath: string; rolePath: string }
  > = {
    "tenant-console-web": {
      path: "/api/auth/session",
      subjectPath: "data.identity.actor_id",
      rolePath: "data.identity.roles",
    },
    "enterprise-dispatch-web": {
      path: "/api/auth/session",
      subjectPath: "data.identity.actor_id",
      rolePath: "data.identity.roles",
    },
    "agency-portal-web": {
      path: "/api/auth/session",
      subjectPath: "data.identity.actor_id",
      rolePath: "data.identity.roles",
    },
    "fleet-partner-portal-web": {
      path: "/api/auth/session",
      subjectPath: "data.identity.actor_id",
      rolePath: "data.identity.actor_type",
    },
    "platform-admin-web": {
      path: "/control-plane-proxy/auth/session",
      subjectPath: "data.identity.actor_id",
      rolePath: "data.identity.actor_type",
    },
    "ops-console-web": {
      path: "/control-plane-proxy/auth/session",
      subjectPath: "data.identity.actor_id",
      rolePath: "data.identity.actor_type",
    },
    "channel-partner-portal-web": {
      path: "/control-plane-proxy/identity/context",
      subjectPath: "data.actor_id",
      rolePath: "data.actor_type",
    },
  };
  const contract = directExpected[session.app];
  if (contract) {
    assert(
      session.identity.path === contract.path &&
        session.identity.subjectPath === contract.subjectPath &&
        session.identity.rolePath === contract.rolePath &&
        (!session.identity.classification ||
          session.identity.classification === "direct"),
      `session identity contract mismatch for ${session.app}`,
    );
  }
}

export function verifyIdentityReadback(
  session: Pick<Session, "app" | "role" | "identity">,
  body: unknown,
  options?: {
    expectedRole?: string | undefined;
    status?: number | undefined;
    candidateSha?: string | undefined;
    expectedRuntimeSha?: string | undefined;
  },
): IdentityReadbackResult {
  if (options?.status !== undefined) {
    assert.equal(options.status, 200, "identity readback HTTP 200 required");
  }
  if (options?.expectedRuntimeSha !== undefined) {
    assert.equal(
      options.candidateSha,
      options.expectedRuntimeSha,
      "identity readback runtime SHA mismatch",
    );
  }
  const expectedRole = options?.expectedRole ?? session.role;
  assert(
    typeof expectedRole === "string" &&
      expectedRole.trim().length > 0 &&
      session.role === expectedRole,
    "session role mismatch",
  );
  localRoute(session.identity.path);
  assert(
    session.identity.subjectPath?.trim() &&
      session.identity.rolePath?.trim() &&
      session.identity.expectedSubject?.trim(),
    "server identity readback required",
  );
  if (session.identity.classification !== undefined) {
    assert(
      VALID_CLASSIFICATIONS.includes(session.identity.classification),
      "invalid identity readback classification",
    );
  }
  assert(
    body && typeof body === "object" && !Array.isArray(body),
    "identity response body must be an object",
  );
  const actualSubject = getIdentityField(body, session.identity.subjectPath);
  assert(
    typeof actualSubject === "string" && actualSubject.trim().length > 0,
    "identity subject missing",
  );
  assert.equal(
    actualSubject,
    session.identity.expectedSubject,
    "identity subject mismatch",
  );

  if (session.app === "bank-console-web") {
    assert(
      !session.identity.classification ||
        ["bank_ui_role", "direct"].includes(session.identity.classification),
      "bank identity classification mismatch",
    );
    assert.equal(
      session.identity.path,
      "/api/auth/session",
      "bank identity endpoint must be /api/auth/session",
    );
    assert.equal(
      session.identity.subjectPath,
      "data.identity.actor_id",
      "bank subjectPath must be data.identity.actor_id",
    );
    assert(
      [
        "data.identity.roles",
        "data.identity.display_role",
        "data.identity.display_roles",
      ].includes(session.identity.rolePath),
      "bank rolePath must read data.identity.roles or data.identity.display_role(s)",
    );
    assert(
      ["bank_program_admin", "bank_ops_viewer", "bank_finance"].includes(
        expectedRole,
      ),
      "unknown bank role",
    );
    const root = body as Record<string, unknown>;
    const data = root.data as Record<string, unknown> | undefined;
    const identity = data?.identity as Record<string, unknown> | undefined;
    assert(
      root.active !== false &&
        data?.active !== false &&
        identity &&
        typeof identity === "object" &&
        !Array.isArray(identity),
      "bank session identity envelope missing or inactive",
    );
    if ("realm" in identity) {
      assert.equal(
        identity.realm,
        "tenant",
        "bank session realm must be tenant",
      );
    }
    if ("actor_type" in identity) {
      assert.equal(
        identity.actor_type,
        "tenant_admin",
        "bank session actor_type must be tenant_admin",
      );
    }
    assert(
      typeof identity.tenant_id === "string" &&
        identity.tenant_id.trim().length > 0,
      "bank session tenant_id required",
    );
    const rawRoles = identity.roles;
    assert(
      Array.isArray(rawRoles) &&
        rawRoles.length > 0 &&
        rawRoles.every(
          (r): r is string =>
            typeof r === "string" && r in BANK_TENANT_ROLE_TO_DISPLAY_ROLE,
        ),
      "bank session requires canonical tenant roles",
    );
    const canonicalDisplayRoles = Array.from(
      new Set(rawRoles.map((r) => BANK_TENANT_ROLE_TO_DISPLAY_ROLE[r]!)),
    );
    assert(
      canonicalDisplayRoles.includes(
        expectedRole as
          | "bank_program_admin"
          | "bank_ops_viewer"
          | "bank_finance",
      ),
      "bank canonical tenant role does not authorize requested bank UI role",
    );
    const hasSelectedRole = identity.display_role !== undefined;
    if (hasSelectedRole) {
      assert(
        typeof identity.display_role === "string" &&
          canonicalDisplayRoles.includes(
            identity.display_role as
              | "bank_program_admin"
              | "bank_ops_viewer"
              | "bank_finance",
          ),
        "bank selected display_role requires signed Bank session and canonical tenant role",
      );
    } else {
      // The normal tenant-auth self-readback has no Bank UI cookies/selection.
      // Classify only a unique role from verified canonical claims; never let
      // the fixture's requested role select among multiple possible UI roles.
      assert(
        session.identity.rolePath === "data.identity.roles" &&
          identity.display_roles === undefined &&
          canonicalDisplayRoles.length === 1,
        "bank unselected identity needs a unique canonical UI role",
      );
    }
    if (identity.display_roles !== undefined) {
      assert(
        Array.isArray(identity.display_roles) &&
          identity.display_roles.length > 0 &&
          identity.display_roles.every(
            (r) =>
              typeof r === "string" &&
              canonicalDisplayRoles.includes(
                r as "bank_program_admin" | "bank_ops_viewer" | "bank_finance",
              ),
          ),
        "bank display_roles disagrees with canonical tenant roles",
      );
    }
    if (session.identity.rolePath === "data.identity.display_role") {
      assert.equal(
        identity.display_role,
        expectedRole,
        "bank display_role mismatch",
      );
    } else if (session.identity.rolePath === "data.identity.display_roles") {
      assert(
        Array.isArray(identity.display_roles) &&
          identity.display_roles.includes(expectedRole),
        "bank display_roles mismatch",
      );
    }
    if (hasSelectedRole) {
      assert.equal(
        identity.display_role,
        expectedRole,
        "bank selected display_role mismatch",
      );
    } else {
      assert.equal(
        canonicalDisplayRoles[0],
        expectedRole,
        "bank canonical display role mismatch",
      );
    }
    return {
      subject: actualSubject,
      effectiveRoles: canonicalDisplayRoles,
      classification: "bank_ui_role",
    };
  }

  if (session.app === "referral-embed-web") {
    assert(
      !session.identity.classification ||
        ["referral_public_session", "direct"].includes(
          session.identity.classification,
        ),
      "referral identity classification mismatch",
    );
    assert.equal(
      session.identity.path,
      "/api/referral/session",
      "referral identity endpoint must be /api/referral/session",
    );
    assert(
      [
        "data.identity.actor_id",
        "data.identity.subject_alias",
        "data.identity.recovery_scope",
        "data.session.recoveryScope",
        "session.recoveryScope",
      ].includes(session.identity.subjectPath),
      "referral subjectPath must read opaque recoveryScope",
    );
    assert(
      ["data.identity.actor_type", "data.identity.roles"].includes(
        session.identity.rolePath,
      ),
      "referral rolePath must read data.identity.actor_type or data.identity.roles",
    );
    assert.equal(
      expectedRole,
      "referral_passenger",
      "unknown referral embed role",
    );
    assert(
      /^[0-9a-f]{64}$/.test(actualSubject),
      "referral subject readback must be a 64-hex opaque recoveryScope",
    );
    const serialized = JSON.stringify(body);
    assert(
      !/"(?:accessToken|access_token|drtsPassengerId|drts_passenger_id)"\s*:/.test(
        serialized,
      ),
      "referral public readback must not expose bearer or raw drtsPassengerId",
    );
    const root = body as Record<string, unknown>;
    const data = (root.data as Record<string, unknown> | undefined) ?? {};
    const pubSession = (data.session ?? root.session) as
      | Record<string, unknown>
      | undefined;
    const identity = data.identity as Record<string, unknown> | undefined;
    assert(
      root.ok !== false &&
        data.active !== false &&
        pubSession &&
        typeof pubSession === "object" &&
        !Array.isArray(pubSession),
      "referral public session missing or inactive",
    );
    assert.equal(
      pubSession.identityActive,
      true,
      "referral session identityActive must be true",
    );
    assert.equal(
      pubSession.recoveryScope,
      actualSubject,
      "referral recoveryScope mismatch",
    );
    assert(
      typeof pubSession.partnerEntrySlug === "string" &&
        pubSession.partnerEntrySlug.trim().length > 0 &&
        typeof pubSession.entryHost === "string" &&
        pubSession.entryHost.trim().length > 0 &&
        typeof pubSession.handoffId === "string" &&
        pubSession.handoffId.trim().length > 0,
      "referral public session entry metadata missing",
    );
    const consent = pubSession.consent as Record<string, unknown> | undefined;
    assert(
      consent &&
        typeof consent === "object" &&
        typeof consent.grantedAt === "string" &&
        consent.grantedAt.trim().length > 0,
      "referral session consent grantedAt required",
    );
    assert(
      identity &&
        typeof identity === "object" &&
        !Array.isArray(identity) &&
        identity.actor_id === actualSubject &&
        identity.actor_type === "referral_passenger" &&
        identity.realm === "partner" &&
        identity.identity_active === true,
      "referral identity projection missing or invalid",
    );
    const roleField = getIdentityField(body, session.identity.rolePath);
    const roleList = Array.isArray(roleField) ? roleField : [roleField];
    assert(
      roleList.includes("referral_passenger"),
      "referral role readback mismatch",
    );
    return {
      subject: actualSubject,
      effectiveRoles: ["referral_passenger"],
      classification: "referral_public_session",
    };
  }

  if (session.app === "passenger-app-web") {
    assert(
      !session.identity.classification ||
        session.identity.classification === "first_party_passenger_account",
      "passenger identity classification mismatch",
    );
    assert.equal(
      session.identity.path,
      "/api/passenger-app/me",
      "passenger identity endpoint must be /api/passenger-app/me",
    );
    assert.equal(
      session.identity.subjectPath,
      "data.account.drts_passenger_id",
      "passenger subjectPath must be data.account.drts_passenger_id",
    );
    assert(
      ["data.account.status", "data.account"].includes(
        session.identity.rolePath,
      ),
      "passenger rolePath must be data.account.status",
    );
    assert.equal(
      expectedRole,
      "first_party_passenger",
      "unknown passenger-app role",
    );
    const root = body as Record<string, unknown>;
    const data = root.data as Record<string, unknown> | undefined;
    const account = data?.account as Record<string, unknown> | undefined;
    assert(
      account && typeof account === "object" && !Array.isArray(account),
      "passenger account envelope missing",
    );
    assert.equal(
      account.drts_passenger_id,
      actualSubject,
      "passenger drts_passenger_id mismatch",
    );
    assert.equal(
      account.status,
      "active",
      "first_party_passenger requires active account status",
    );
    assert.equal(
      typeof account.contact_phone_verified,
      "boolean",
      "passenger account contact_phone_verified boolean required",
    );
    assert(
      typeof account.created_at === "string" &&
        !Number.isNaN(Date.parse(account.created_at)),
      "passenger account created_at timestamp required",
    );
    assert(
      !("tenant_id" in account) &&
        !("partner_id" in account) &&
        !("partner_entry_slug" in account) &&
        !("agency_id" in account),
      "first_party_passenger account must not carry cross-realm claims",
    );
    return {
      subject: actualSubject,
      effectiveRoles: ["first_party_passenger"],
      classification: "first_party_passenger_account",
    };
  }

  assert(
    !session.identity.classification ||
      session.identity.classification === "direct",
    "direct identity classification mismatch",
  );
  const root = body as Record<string, unknown>;
  const data = root.data as Record<string, unknown> | undefined;
  assert(
    root.active !== false && data?.active !== false,
    "identity session inactive",
  );
  const roleField = getIdentityField(body, session.identity.rolePath);
  if (session.app === "ops-console-web" && expectedRole === "ops_observer") {
    assert.equal(
      session.identity.path,
      "/control-plane-proxy/auth/session",
      "ops_observer requires /control-plane-proxy/auth/session",
    );
    assert.equal(
      session.identity.rolePath,
      "data.identity.roles",
      "ops_observer requires data.identity.roles",
    );
    const identity = data?.identity as Record<string, unknown> | undefined;
    if (identity && "realm" in identity) {
      assert.equal(identity.realm, "ops", "ops_observer realm must be ops");
    }
    assert(
      Array.isArray(roleField) &&
        (roleField.includes("ops_observer") || roleField.includes("observer")),
      "ops_observer requires observer role in data.identity.roles",
    );
    return {
      subject: actualSubject,
      effectiveRoles: ["ops_observer"],
      classification: "direct",
    };
  }
  const roleList = Array.isArray(roleField) ? roleField : [roleField];
  assert(
    roleList.includes(expectedRole),
    `identity role mismatch for ${session.app}|${expectedRole}`,
  );
  return {
    subject: actualSubject,
    effectiveRoles: roleList.filter((r): r is string => typeof r === "string"),
    classification: "direct",
  };
}

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
    validateSessionIdentityContract(session, inventory);
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

export function safeRelativePath(value: string, label = "artifact"): string {
  assert(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= 240 &&
      !value.startsWith("/") &&
      !value.startsWith("\\") &&
      !/[\\\0\r\n]/.test(value),
    `unsafe ${label} path`,
  );
  const segments = value.split("/");
  for (const seg of segments) {
    assert(
      seg.length > 0 && seg !== "." && seg !== ".." && !seg.startsWith("."),
      `unsafe ${label} path`,
    );
    assert(
      !/^(?:sessions|tokens|credentials|secrets|cookies|storage-?state)(?:\..+)?$/i.test(
        seg,
      ) &&
        !/\.(?:pem|key|p12|pfx|env)$/i.test(seg) &&
        !/^id_(?:rsa|ed25519|ecdsa)/i.test(seg),
      "private credential material rejected",
    );
  }
  return segments.join("/");
}

export function assertNonSecretBytes(bytes: Buffer, label: string) {
  const text = bytes.toString("utf8");
  assert(
    !/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(text) &&
      !/\b(?:storageState|X-Serverless-Authorization|X-Goog-Iap-Jwt-Assertion|X-Drts-Google-Id-Token|GLOBAL_UX_SESSIONS|GLOBAL_UX_TOKENS)\b/i.test(
        text,
      ) &&
      !/\bBearer\s+eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text) &&
      !/\bya29\.[A-Za-z0-9_-]+/.test(text) &&
      !/"(?:cookies|sessions|tokens|authorization|proxy-authorization)"\s*:/i.test(
        text,
      ),
    `private credential material rejected in ${label}`,
  );
}

export function validateInputManual(
  manual: ManualEvidence[],
  inventory: Inventory,
  binding: { harnessSha: string; planHash: string },
  readArtifact: (file: string) => Buffer,
  applicability: Applicability[] = [],
): Set<string> {
  validateApplicability(applicability, inventory);
  assert(
    fullSha(binding.harnessSha) && /^[a-f0-9]{64}$/.test(binding.planHash),
    "invalid input binding",
  );
  assert(Array.isArray(manual), "manual input must be an array");
  const expectedById = new Map(cases(inventory).map((c) => [c.id, c]));
  const naKeys = new Set(applicability.map((rule) => rule.key));
  assert.equal(
    new Set(manual.map((e) => e.id)).size,
    manual.length,
    "duplicate manual evidence",
  );
  const referencedArtifacts = new Set<string>();
  for (const m of manual) {
    assert(
      m &&
        typeof m === "object" &&
        !Array.isArray(m) &&
        Object.keys(m).sort().join(",") ===
          "checks,harnessSha,id,planHash,runId,runtimeSha",
      "unexpected manual evidence fields",
    );
    const c = expectedById.get(m.id);
    assert(c, `unknown manual case: ${m.id}`);
    assert(!naKeys.has(recipeKey(c)), "manual evidence provided for N/A case");
    assert(
      m.runtimeSha === inventory.runtimeSha &&
        m.harnessSha === binding.harnessSha &&
        /^\d+\/\d+$/.test(m.runId) &&
        m.planHash === binding.planHash,
      "manual release/run/plan mismatch",
    );
    assert(
      Array.isArray(m.checks) && m.checks.length > 0,
      "manual gate omitted/duplicated",
    );
    assert.equal(
      new Set(m.checks.map((check) => check.check)).size,
      m.checks.length,
      "manual gate omitted/duplicated",
    );
    for (const check of m.checks) {
      assert(
        check &&
          typeof check === "object" &&
          !Array.isArray(check) &&
          Object.keys(check).sort().join(",") ===
            "artifact,check,procedure,sha256,sourceRef,status,tester,tool",
        "unexpected manual check fields",
      );
      assert(
        (manualChecks as readonly string[]).includes(check.check),
        "manual gate omitted/duplicated",
      );
      assert(
        ["passed", "failed", "blocked", "not_applicable"].includes(
          check.status,
        ),
        "invalid manual check status",
      );
      assert(
        check.tester?.trim() &&
          check.tool?.trim() &&
          check.procedure?.trim() &&
          check.sourceRef?.includes(c.screen.source),
        "unverified manual/design evidence",
      );
      if (check.status === "passed" || check.artifact) {
        const rel = safeRelativePath(check.artifact, "manual artifact");
        const bytes = readArtifact(rel);
        assertNonSecretBytes(bytes, "artifact");
        assert(
          /^[a-f0-9]{64}$/.test(check.sha256) && hash(bytes) === check.sha256,
          "manual artifact missing/corrupt",
        );
        referencedArtifacts.add(rel);
      } else {
        assert(
          check.artifact === "" && check.sha256 === "",
          "manual artifact missing/corrupt",
        );
      }
    }
  }
  return referencedArtifacts;
}
