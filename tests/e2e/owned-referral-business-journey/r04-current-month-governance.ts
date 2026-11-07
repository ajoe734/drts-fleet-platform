import { createHash } from "node:crypto";
import type { Page, Request, Response, Route } from "@playwright/test";
import {
  REFERRAL_MONTHLY_COACHING_THRESHOLD,
  type ReferralMonthlyRatingGovernanceRecord,
  type ReferralMonthlyRatingGovernanceReport,
  type ReferralMonthlyRatingReport,
} from "@drts/contracts";
import {
  camelWire,
  object,
  records,
  requireFact,
  text,
  type ObjectData,
  type NativeTransport,
  type Role,
} from "./protocol";

export type VerifiedRole = Readonly<{
  realm: "platform" | "ops";
  actorType: "platform_admin" | "ops_user";
  principalId: string;
  membershipId: string;
  sessionId: string;
  scopes: readonly string[];
}>;

export function taipeiMonth(iso: string): string {
  requireFact(Number.isFinite(Date.parse(iso)), "R04/R09 canonical timestamp");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(iso));
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

export function assertVerifiedRole(
  session: ObjectData,
  expected: VerifiedRole,
  requiredScopes: readonly string[],
) {
  const identity = object(session.identity);
  const scopes = identity.scopes;
  requireFact(
    session.active === true &&
      identity.realm === expected.realm &&
      identity.actorType === expected.actorType &&
      identity.authMode === "jwt_bearer" &&
      identity.principalId === expected.principalId &&
      identity.membershipId === expected.membershipId &&
      identity.sessionId === expected.sessionId &&
      (expected.realm !== "ops" || identity.actorId === expected.principalId) &&
      Array.isArray(scopes) &&
      requiredScopes.every(
        (scope) => expected.scopes.includes(scope) && scopes.includes(scope),
      ),
    "R04/R09 actual browser and canonical role, session and scope",
  );
}

export type UiPost = Readonly<{
  path: string;
  status: number;
  runtimeSha: string | undefined;
  requestId: string;
  body: ObjectData;
  data: ObjectData;
  meta: ObjectData;
}>;

export type UiPostIntent = Readonly<{
  url: string;
  path: string;
  method: "POST";
  requestId: string;
  idempotencyKey: string | null;
  bodySha256: string;
  bodyBytes: number;
}>;

export async function installVerifiedRoleRoute(
  page: Page,
  origin: string,
  role: Extract<Role, "admin" | "ops">,
  tx: NativeTransport,
) {
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (new URL(url).origin !== origin) return route.continue();
    return route.continue({
      headers: { ...route.request().headers(), ...tx.headers(role, url) },
    });
  });
}

export async function readBrowserRoleSession(page: Page, runtimeSha: string) {
  const observed = await page.evaluate(async () => {
    const response = await fetch("/control-plane-proxy/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
    });
    return {
      status: response.status,
      runtimeSha: response.headers.get("x-drts-candidate-sha"),
      body: await response.json(),
    };
  });
  requireFact(
    observed.status === 200 && observed.runtimeSha === runtimeSha,
    "R04/R09 actual browser BFF session and runtime",
  );
  const payload = object(camelWire(observed.body));
  requireFact(payload.ok === true, "R04/R09 actual browser session envelope");
  return object(payload.data);
}

/** Capture the one original UI POST. A missing response leaves the ACK unknown;
 * the caller must reconcile from canonical readback, never click again. */
export async function captureUiPost(
  page: Page,
  origin: string,
  path: string,
  runtimeSha: string,
  click: () => Promise<void>,
  beforeForward: (
    intent: UiPostIntent,
    forward: () => Promise<void>,
  ) => Promise<void>,
): Promise<UiPost> {
  const url = `${origin}/control-plane-proxy${path}`;
  const target = new URL(url);
  let count = 0;
  let intercepted = 0;
  let custodied: UiPostIntent | undefined;
  let rejectRouteFailure!: (error: unknown) => void;
  const routeFailure = new Promise<never>((_resolve, reject) => {
    rejectRouteFailure = reject;
  });
  void routeFailure.catch(() => undefined);
  const exact = (request: Pick<Request, "url" | "method">) => {
    const actual = new URL(request.url());
    return (
      request.method() === "POST" &&
      actual.origin === target.origin &&
      actual.pathname === target.pathname
    );
  };
  const onRequest = (request: Request) => {
    if (exact(request)) count++;
  };
  const matcher = (candidate: URL) =>
    candidate.origin === target.origin &&
    candidate.pathname === target.pathname;
  const onRoute = async (route: Route) => {
    const request = route.request();
    if (!exact(request)) return route.fallback();
    try {
      intercepted++;
      requireFact(
        intercepted === 1,
        "R04/R09 no second original UI POST may be forwarded",
      );
      const headers = new Headers(request.headers());
      const rawBody = request.postData() ?? "";
      const intent: UiPostIntent = {
        url: request.url(),
        path: new URL(request.url()).pathname,
        method: "POST",
        requestId: text(
          headers.get("x-request-id"),
          "R04/R09 pre-forward original UI request ID",
        ),
        idempotencyKey: headers.get("idempotency-key"),
        bodySha256: createHash("sha256").update(rawBody).digest("hex"),
        bodyBytes: Buffer.byteLength(rawBody),
      };
      custodied = intent;
      // The caller durably checkpoints this exact intent, then invokes the
      // supplied forward under its original finalizer lease. Fallback reaches
      // the earlier verified-role JWT route; no raw auth header is persisted.
      await beforeForward(intent, () => route.fallback());
    } catch (error) {
      await route.abort().catch(() => undefined);
      rejectRouteFailure(error);
    }
  };
  page.on("request", onRequest);
  await page.route(matcher, onRoute);
  const waiting = page.waitForResponse(
    (response) =>
      exact(response.request()) &&
      new URL(response.url()).pathname === target.pathname,
    { timeout: 15_000 },
  );
  void waiting.catch(() => undefined);
  try {
    await click();
    const response: Response = await Promise.race([waiting, routeFailure]);
    requireFact(
      count === 1 && intercepted === 1,
      "R04/R09 exactly one original pre-forward-custodied UI POST",
    );
    requireFact(
      [200, 201].includes(response.status()) &&
        response.headers()["x-drts-candidate-sha"] === runtimeSha,
      "R04/R09 UI POST status and served runtime",
    );
    const payload = object(camelWire(await response.json()));
    requireFact(payload.ok === true, "R04/R09 UI POST success envelope");
    const requestId = text(
      new Headers(response.request().headers()).get("x-request-id"),
      "R04/R09 original UI request ID",
    );
    requireFact(
      custodied?.requestId === requestId &&
        custodied.url === response.request().url() &&
        custodied.bodySha256 ===
          createHash("sha256")
            .update(response.request().postData() ?? "")
            .digest("hex"),
      "R04/R09 response is the exact pre-forward-custodied original request",
    );
    return {
      path: new URL(response.url()).pathname,
      status: response.status(),
      runtimeSha: response.headers()["x-drts-candidate-sha"],
      requestId,
      body: object(response.request().postDataJSON()),
      data: object(payload.data),
      meta: object(payload.meta),
    };
  } finally {
    await page.unroute(matcher, onRoute);
    page.off("request", onRequest);
  }
}

function evaluateAudit(
  audits: ObjectData[],
  request: UiPost,
  month: string,
  driverId: string,
  actorId: string,
) {
  requireFact(
    audits.filter(
      (item) =>
        item.requestId === request.requestId &&
        item.actorId === actorId &&
        item.actorType === "platform_admin" &&
        item.moduleName === "reporting" &&
        item.actionName === "referral_monthly_rating_governance.evaluate" &&
        item.resourceId === month &&
        object(item.newValuesSummary).driverId === driverId,
    ).length === 1,
    "R04 original UI evaluate exact canonical audit request/actor/driver/month",
  );
}

export type R04Ports = {
  runtimeSha: string;
  role: VerifiedRole;
  orderId: string;
  driverId: string;
  caseNo: string;
  submittedAt: string;
  score: 2;
  browserSession(): Promise<ObjectData>;
  readReport(
    month: string,
    driverId: string,
  ): Promise<ReferralMonthlyRatingReport>;
  readGovernance(
    month: string,
    driverId: string,
  ): Promise<ReferralMonthlyRatingGovernanceReport>;
  readAudit(auditId: string): Promise<ObjectData[]>;
  open(month: string, driverId: string): Promise<void>;
  evaluate(): Promise<UiPost>;
  dismiss(recordId: string, reason: string): Promise<UiPost>;
};

function coaching(
  report: ReferralMonthlyRatingGovernanceReport,
  month: string,
  driverId: string,
): ReferralMonthlyRatingGovernanceRecord {
  requireFact(
    report.periodMonth === month && report.timeZone === "Asia/Taipei",
    "R04 exact Taipei governance month",
  );
  const coachingRecords = report.records.filter(
    (record) =>
      record.driverId === driverId &&
      record.periodMonth === month &&
      record.ruleType === "coaching",
  );
  requireFact(
    coachingRecords.length === 1,
    "R04 one own current-month coaching record",
  );
  const record = coachingRecords[0]!;
  requireFact(
    record.averageRating < REFERRAL_MONTHLY_COACHING_THRESHOLD &&
      record.threshold === REFERRAL_MONTHLY_COACHING_THRESHOLD &&
      record.ratingCount > 0 &&
      record.triggeredMonths.includes(month),
    "R04 canonical below-four coaching rule",
  );
  return record;
}

export async function runR04CurrentMonthGovernance(p: R04Ports) {
  assertVerifiedRole(await p.browserSession(), p.role, [
    "reports:read",
    "reports:write",
    "audit:read",
  ]);
  requireFact(
    p.role.realm === "platform" && p.role.actorType === "platform_admin",
    "R04 original Admin authority",
  );
  const month = taipeiMonth(p.submittedAt);
  const report = await p.readReport(month, p.driverId);
  requireFact(
    report.periodMonth === month && report.timeZone === "Asia/Taipei",
    "R04 actual report month",
  );
  const ownRows = report.rows.filter((row) => row.orderId === p.orderId);
  requireFact(
    ownRows.length === 1 &&
      ownRows[0]?.driverId === p.driverId &&
      ownRows[0]?.score === p.score &&
      ownRows[0]?.submittedAt === p.submittedAt &&
      ownRows[0]?.complaintCaseNo === p.caseNo &&
      report.drivers.some(
        (driver) =>
          driver.driverId === p.driverId &&
          driver.ratingCount > 0 &&
          driver.averageRating < REFERRAL_MONTHLY_COACHING_THRESHOLD,
      ),
    "R04 exact own completed order, rating and below-four driver average",
  );
  await p.open(month, p.driverId);
  assertVerifiedRole(await p.browserSession(), p.role, [
    "reports:read",
    "reports:write",
    "audit:read",
  ]);
  let first: UiPost;
  try {
    first = await p.evaluate();
  } catch (error) {
    await p.readGovernance(month, p.driverId);
    throw error;
  }
  requireFact(
    first.path ===
      "/control-plane-proxy/reports/referral-monthly-ratings/governance/evaluate" &&
      first.runtimeSha === p.runtimeSha &&
      first.body.periodMonth === month &&
      first.body.driverId === p.driverId,
    "R04 original UI evaluate intent",
  );
  const firstRecord = coaching(
    first.data as unknown as ReferralMonthlyRatingGovernanceReport,
    month,
    p.driverId,
  );
  const fresh = coaching(
    await p.readGovernance(month, p.driverId),
    month,
    p.driverId,
  );
  requireFact(
    fresh.recordId === firstRecord.recordId,
    "R04 first UI evaluate fresh coaching readback",
  );
  evaluateAudit(
    await p.readAudit(""),
    first,
    month,
    p.driverId,
    p.role.principalId,
  );
  assertVerifiedRole(await p.browserSession(), p.role, [
    "reports:read",
    "reports:write",
    "audit:read",
  ]);
  let second: UiPost;
  try {
    second = await p.evaluate();
  } catch (error) {
    await p.readGovernance(month, p.driverId);
    throw error;
  }
  const secondRecord = coaching(
    second.data as unknown as ReferralMonthlyRatingGovernanceReport,
    month,
    p.driverId,
  );
  const stable = coaching(
    await p.readGovernance(month, p.driverId),
    month,
    p.driverId,
  );
  requireFact(
    secondRecord.recordId === firstRecord.recordId &&
      stable.recordId === firstRecord.recordId,
    "R04 same driver-month UI evaluation is idempotent",
  );
  requireFact(
    second.requestId !== first.requestId,
    "R04 two distinct original UI clicks",
  );
  evaluateAudit(
    await p.readAudit(""),
    second,
    month,
    p.driverId,
    p.role.principalId,
  );
  const reason =
    "Controlled synthetic evaluation only; no real driver coaching, contact or termination occurred.";
  assertVerifiedRole(await p.browserSession(), p.role, [
    "reports:read",
    "reports:write",
    "audit:read",
  ]);
  let outcome: UiPost;
  try {
    outcome = await p.dismiss(stable.recordId, reason);
  } catch (error) {
    await p.readGovernance(month, p.driverId);
    throw error;
  }
  requireFact(
    outcome.path ===
      "/control-plane-proxy/reports/referral-monthly-ratings/governance/outcomes" &&
      outcome.runtimeSha === p.runtimeSha &&
      outcome.body.recordId === stable.recordId &&
      outcome.body.driverId === p.driverId &&
      outcome.body.periodMonth === month &&
      outcome.body.ruleType === "coaching" &&
      outcome.body.outcome === "dismissed" &&
      outcome.body.reason === reason,
    "R04 original UI truthful synthetic dismissal",
  );
  const handled = coaching(
    await p.readGovernance(month, p.driverId),
    month,
    p.driverId,
  );
  requireFact(
    handled.recordId === stable.recordId &&
      handled.outcome === "dismissed" &&
      handled.outcomeReason === reason &&
      handled.handledByActorId === p.role.principalId &&
      !!handled.auditId,
    "R04 fresh handled coaching actor and audit",
  );
  const audit = records(
    (await p.readAudit(text(handled.auditId))) as unknown,
  ).filter((item) => item.auditId === handled.auditId);
  requireFact(
    audit.length === 1 &&
      audit[0]?.requestId === outcome.requestId &&
      audit[0]?.actorId === p.role.principalId &&
      audit[0]?.actorType === "platform_admin" &&
      audit[0]?.moduleName === "reporting" &&
      audit[0]?.actionName === "referral_monthly_rating_governance.dismissed" &&
      audit[0]?.resourceId === handled.recordId,
    "R04 exact original UI outcome request/action/resource/actor audit",
  );
  return {
    month,
    orderId: p.orderId,
    driverId: p.driverId,
    recordId: handled.recordId,
    auditId: handled.auditId,
  };
}
