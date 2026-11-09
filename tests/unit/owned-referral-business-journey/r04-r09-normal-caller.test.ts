import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import type { Page } from "@playwright/test";
import { describe, expect, it } from "vitest";
import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
  ReferralMonthlyRatingGovernanceReport,
  ReferralMonthlyRatingReport,
  SixMonthOperationsSummary,
} from "@drts/contracts";
import {
  captureUiPost,
  runR04CurrentMonthGovernance,
  type R04Ports,
  type UiPost,
  type VerifiedRole,
} from "../../e2e/owned-referral-business-journey/r04-current-month-governance";
import {
  runR09OwnComplaintLifecycle,
  type R09Ports,
} from "../../e2e/owned-referral-business-journey/r09-own-complaint-lifecycle";

const runtimeSha = "a".repeat(40);
const admin: VerifiedRole = {
  realm: "platform",
  actorType: "platform_admin",
  principalId: "own-admin",
  membershipId: "admin-member",
  sessionId: "admin-session",
  scopes: ["reports:read", "reports:write", "audit:read"],
};
const ops: VerifiedRole = {
  realm: "ops",
  actorType: "ops_user",
  principalId: "own-ops",
  membershipId: "ops-member",
  sessionId: "ops-session",
  scopes: ["complaints:read", "complaints:write", "reports:read", "audit:read"],
};
const session = (role: VerifiedRole) => ({
  active: true,
  identity: { ...role, actorId: role.principalId, authMode: "jwt_bearer" },
});
const complaintAudit = (auditId: string, actorId: string | null) => {
  const action = auditId.split("-")[0] as
    | "assign"
    | "notes"
    | "resolve"
    | "close";
  return {
    auditId,
    requestId: `${action}-id`,
    actorId,
    actorType: "ops_user",
    moduleName: "complaint",
    actionName: {
      assign: "assign_complaint_case",
      notes: "add_complaint_case_note",
      resolve: "resolve_complaint_case",
      close: "close_complaint_case",
    }[action],
    resourceId: "manual-service",
  };
};
const uiPost = (
  path: string,
  body: Record<string, unknown>,
  data: Record<string, unknown>,
  meta: Record<string, unknown> = {},
  requestId = "ui-action",
): UiPost => ({
  path: `/control-plane-proxy${path}`,
  status: 200,
  runtimeSha,
  requestId,
  body,
  data,
  meta,
});
const record = (recordId: string, outcome: string | null = null) => ({
  recordId,
  driverId: "own-driver",
  periodMonth: "2026-10",
  ruleType: "coaching",
  threshold: 4,
  averageRating: 2,
  ratingCount: 1,
  triggeredMonths: ["2026-10"],
  outcome,
  outcomeReason: outcome
    ? "Controlled synthetic evaluation only; no real driver coaching, contact or termination occurred."
    : null,
  handledByActorId: outcome ? admin.principalId : null,
  auditId: outcome ? "own-audit" : null,
});
const governance = (recordId: string, outcome: string | null = null) =>
  ({
    periodMonth: "2026-10",
    timeZone: "Asia/Taipei",
    records: [record(recordId, outcome)],
  }) as unknown as ReferralMonthlyRatingGovernanceReport;

function r04Ports(): R04Ports & {
  actions: string[];
  state: { recordId: string };
} {
  const actions: string[] = [];
  const state = { recordId: "own-record" };
  let dismissed = false;
  return {
    actions,
    state,
    runtimeSha,
    role: admin,
    orderId: "main-order",
    driverId: "own-driver",
    caseNo: "low-main",
    submittedAt: "2026-10-30T12:00:00Z",
    score: 2,
    browserSession: async () => session(admin),
    readReport: async () =>
      ({
        periodMonth: "2026-10",
        timeZone: "Asia/Taipei",
        rows: [
          {
            orderId: "main-order",
            driverId: "own-driver",
            score: 2,
            submittedAt: "2026-10-30T12:00:00Z",
            complaintCaseNo: "low-main",
          },
        ],
        drivers: [{ driverId: "own-driver", ratingCount: 1, averageRating: 2 }],
      }) as unknown as ReferralMonthlyRatingReport,
    readGovernance: async () =>
      governance(state.recordId, dismissed ? "dismissed" : null),
    readAudit: async (auditId) =>
      auditId === ""
        ? [1, 2].map((n) => ({
            auditId: `eval-audit-${n}`,
            requestId: `eval-request-${n}`,
            actorId: admin.principalId,
            actorType: "platform_admin",
            moduleName: "reporting",
            actionName: "referral_monthly_rating_governance.evaluate",
            resourceId: "2026-10",
            newValuesSummary: { driverId: "own-driver" },
          }))
        : [
            {
              auditId: "own-audit",
              requestId: "ui-action",
              actorId: admin.principalId,
              actorType: "platform_admin",
              moduleName: "reporting",
              actionName: "referral_monthly_rating_governance.dismissed",
              resourceId: state.recordId,
            },
          ],
    open: async () => {
      actions.push("open");
    },
    evaluate: async () => {
      actions.push("evaluate");
      return uiPost(
        "/reports/referral-monthly-ratings/governance/evaluate",
        { periodMonth: "2026-10", driverId: "own-driver" },
        governance(state.recordId) as unknown as Record<string, unknown>,
        {},
        `eval-request-${actions.filter((action) => action === "evaluate").length}`,
      );
    },
    dismiss: async (_recordId, reason) => {
      actions.push("dismiss");
      dismissed = true;
      return uiPost(
        "/reports/referral-monthly-ratings/governance/outcomes",
        {
          recordId: state.recordId,
          driverId: "own-driver",
          periodMonth: "2026-10",
          ruleType: "coaching",
          outcome: "dismissed",
          reason,
        },
        record(state.recordId, "dismissed"),
      );
    },
  };
}

function r09Ports(): R09Ports & {
  actions: string[];
  state: { caseNo: string; status: ComplaintCaseRecord["status"] };
} {
  const actions: string[] = [];
  const state = {
    caseNo: "manual-service",
    status: "new" as ComplaintCaseRecord["status"],
  };
  const cases: R09Ports["cases"] = [
    ...["low-main", "low-c2", "low-c3", "low-c4"].map((caseNo, index) => ({
      caseNo,
      orderId: index === 0 ? "main-order" : `c${index + 1}-order`,
      source: "lowRatingAuto" as const,
    })),
    {
      caseNo: "manual-service",
      orderId: "main-order",
      source: "manual",
      category: "driver_service",
    },
    {
      caseNo: "manual-fare",
      orderId: "main-order",
      source: "manual",
      category: "fare_dispute",
    },
    {
      caseNo: "manual-lost",
      orderId: "main-order",
      source: "manual",
      category: "lost_and_found",
    },
  ];
  const timeline: ComplaintTimelineEntry[] = cases.map(({ caseNo }) => ({
    entryId: `create-${caseNo}`,
    caseNo,
    action: "case_created",
    note: "created",
    createdAt: "2026-10-30T12:00:00Z",
  }));
  const makeCase = (caseNo: string): ComplaintCaseRecord =>
    ({
      caseNo,
      caseSource: "app",
      description: caseNo.startsWith("low-")
        ? "轉介乘客評價 2 星；不需客服聯繫，僅供內部檢視。"
        : "來源：轉介內嵌網頁",
      relatedOrderId: cases.find((item) => item.caseNo === caseNo)!.orderId,
      category:
        cases.find((item) => item.caseNo === caseNo)!.category ??
        "driver_service",
      status: caseNo === state.caseNo ? state.status : "new",
      assigneeId:
        caseNo === state.caseNo && state.status !== "new"
          ? ops.principalId
          : null,
      resolutionCode:
        caseNo === state.caseNo && ["resolved", "closed"].includes(state.status)
          ? "resolved_other"
          : null,
      createdAt: "2026-10-30T12:00:00Z",
      slaDueAt: "2026-11-30T12:00:00Z",
    }) as ComplaintCaseRecord;
  return {
    actions,
    state,
    runtimeSha,
    role: ops,
    completedOrderId: "main-order",
    cases,
    browserSession: async () => session(ops),
    readCase: async (caseNo) => makeCase(caseNo),
    readOrder: async (orderId) => ({
      orderId,
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: "enterprise_dispatch",
    }),
    readTimeline: async (caseNo) =>
      timeline.filter((entry) => entry.caseNo === caseNo),
    readAudit: async (auditId) => [
      complaintAudit(
        auditId,
        /^(assign|notes)-/.test(auditId) ? ops.principalId : null,
      ),
    ],
    openCase: async () => {
      actions.push("open-case");
    },
    action: async (action, caseNo, fields) => {
      actions.push(action);
      state.status = {
        assign: "assigned",
        notes: "under_investigation",
        resolve: "resolved",
        close: "closed",
      }[action] as ComplaintCaseRecord["status"];
      timeline.push({
        entryId: `${action}-${caseNo}`,
        caseNo,
        action: {
          assign: "case_assigned",
          notes: "case_note_added",
          resolve: "case_resolved",
          close: "case_closed",
        }[action] as ComplaintTimelineEntry["action"],
        note: "Controlled synthetic internal",
        createdAt: "2026-10-30T12:01:00Z",
      });
      return uiPost(
        `/complaints/${caseNo}/${action}`,
        fields,
        makeCase(caseNo) as unknown as Record<string, unknown>,
        {
          actionReceipt: {
            actionId: `${action}-id`,
            auditId: `${action}-audit`,
            resourceType: "complaint_case",
            resourceId: caseNo,
            status: "completed",
          },
        },
        `${action}-id`,
      );
    },
    openReport: async () => {
      actions.push("open-report");
    },
    preview: async () =>
      [
        {
          businessArea: "TPE",
          serviceProductCode: "enterprise_dispatch",
          complaintStatisticsAsOf: "2026-10-30T12:02:00Z",
          drilldown: {
            complaintMonthlyStatistics: [
              {
                periodMonth: "2026-10",
                timeZone: "Asia/Taipei",
                lowRatingAuto: {
                  createdCaseNos: ["low-main", "low-c2", "low-c3", "low-c4"],
                  closedCaseNos: [],
                  overdueCaseNos: [],
                },
                manual: {
                  createdCaseNos: [
                    "manual-service",
                    "manual-fare",
                    "manual-lost",
                  ],
                  closedCaseNos: ["manual-service"],
                  overdueCaseNos: [],
                },
                manualByCategory: [
                  {
                    category: "driver_service",
                    createdCaseNos: ["manual-service"],
                    closedCaseNos: ["manual-service"],
                  },
                  {
                    category: "fare_dispute",
                    createdCaseNos: ["manual-fare"],
                    closedCaseNos: [],
                  },
                  {
                    category: "lost_and_found",
                    createdCaseNos: ["manual-lost"],
                    closedCaseNos: [],
                  },
                ],
              },
            ],
          },
        },
      ] as unknown as SixMonthOperationsSummary[],
    inspectDrilldown: async (caseNo, _month, _source, dimension) => {
      actions.push(`drill-${caseNo}:${dimension.businessArea}`);
    },
    inspectClosure: async (caseNo, _month, dimension) => {
      actions.push(`closure-${caseNo}:${dimension.businessArea}`);
    },
  };
}

describe("same-run R04/R09 controlled helper ports", () => {
  it("uses one own driver-month record across two UI evaluates and truthfully dismisses", async () => {
    const ports = r04Ports();
    await expect(runR04CurrentMonthGovernance(ports)).resolves.toMatchObject({
      recordId: "own-record",
      orderId: "main-order",
    });
    expect(ports.actions).toEqual(["open", "evaluate", "evaluate", "dismiss"]);
  });
  it("rejects foreign role/scope, rating, changed record id and unknown UI ACK", async () => {
    for (const change of [
      (p: R04Ports) => {
        p.role = { ...admin, scopes: ["reports:read"] };
      },
      (p: R04Ports) => {
        p.role = { ...admin, scopes: ["reports:read", "reports:write"] };
      },
      (p: R04Ports) => {
        p.orderId = "foreign-order";
      },
      (p: R04Ports & { state: { recordId: string } }) => {
        let n = 0;
        p.readGovernance = async () =>
          governance(++n === 1 ? "own-record" : "changed-record");
      },
      (p: R04Ports) => {
        p.evaluate = async () => {
          throw new Error("ACK unknown");
        };
      },
      (p: R04Ports) => {
        const original = p.evaluate;
        p.evaluate = async () => ({
          ...(await original()),
          runtimeSha: "wrong-runtime",
        });
      },
    ]) {
      const ports = r04Ports();
      change(ports);
      await expect(runR04CurrentMonthGovernance(ports)).rejects.toThrow();
      expect(ports.actions).not.toContain("dismiss");
    }
  });
  it("rejects a same-actor outcome audit from another original request", async () => {
    const ports = r04Ports();
    const readAudit = ports.readAudit;
    ports.readAudit = async (auditId) =>
      auditId === ""
        ? readAudit(auditId)
        : [{ ...(await readAudit(auditId))[0]!, requestId: "foreign-request" }];
    await expect(runR04CurrentMonthGovernance(ports)).rejects.toThrow(
      /outcome request/,
    );
  });
  it("binds seven exact case IDs, four UI writes, fresh timeline/audit, then report drilldown", async () => {
    const ports = r09Ports();
    await expect(runR09OwnComplaintLifecycle(ports)).resolves.toMatchObject({
      serviceCaseNo: "manual-service",
      closureMonth: "2026-10",
      uiCommandSender: {
        principalId: ops.principalId,
        verifiedSameSession: true,
      },
      missingServerActorAttributionActions: ["resolve", "close"],
    });
    expect(ports.actions).toEqual([
      "open-case",
      "assign",
      "notes",
      "resolve",
      "close",
      "open-report",
      ...ports.cases.map(({ caseNo }) => `drill-${caseNo}:TPE`),
      "closure-manual-service:TPE",
    ]);
  });
  it("rejects foreign case, missing audit and unknown write ACK before next mutation", async () => {
    for (const change of [
      (p: R09Ports) => {
        p.cases = [{ ...p.cases[0]!, caseNo: "foreign" }, ...p.cases.slice(1)];
      },
      (p: R09Ports) => {
        p.role = {
          ...ops,
          scopes: ["complaints:read", "complaints:write", "reports:read"],
        };
      },
      (p: R09Ports) => {
        p.readAudit = async () => [];
      },
      (p: R09Ports) => {
        p.action = async () => {
          throw new Error("ACK unknown");
        };
      },
      (p: R09Ports) => {
        p.browserSession = async () => ({
          ...session(ops),
          identity: { ...session(ops).identity, sessionId: "foreign-session" },
        });
      },
      (p: R09Ports) => {
        p.readAudit = async (auditId) => [
          complaintAudit(auditId, "foreign-ops"),
        ];
      },
    ]) {
      const ports = r09Ports();
      change(ports);
      await expect(runR09OwnComplaintLifecycle(ports)).rejects.toThrow();
      expect(ports.actions).not.toContain("notes");
    }
  });
  it("accepts an improved server audit only when all actions name the verified Ops principal", async () => {
    const ports = r09Ports();
    ports.readAudit = async (auditId) => [
      complaintAudit(auditId, ops.principalId),
    ];
    await expect(runR09OwnComplaintLifecycle(ports)).resolves.toMatchObject({
      missingServerActorAttributionActions: [],
    });
  });
  it("rejects fabricated overdue membership against canonical SLA and as-of", async () => {
    const ports = r09Ports();
    const original = ports.preview;
    ports.preview = async (from, to) => {
      const rows = await original(from, to);
      const changed = structuredClone(rows);
      changed[0]!.drilldown!.complaintMonthlyStatistics[0]!.lowRatingAuto.overdueCaseNos.push(
        "low-main",
      );
      return changed;
    };
    await expect(runR09OwnComplaintLifecycle(ports)).rejects.toThrow(/overdue/);
  });
  it("binds each own case to its actual dimension despite an unrelated first card and split case groups", async () => {
    const ports = r09Ports();
    const original = ports.preview;
    ports.preview = async (from, to) => {
      const [own] = structuredClone(await original(from, to));
      const wrongFirst = structuredClone(own!);
      wrongFirst.businessArea = "AAA-foreign-first";
      const wrongMonth = wrongFirst.drilldown!.complaintMonthlyStatistics[0]!;
      wrongMonth.lowRatingAuto.createdCaseNos = ["foreign-low"];
      wrongMonth.manual.createdCaseNos = [];
      wrongMonth.manual.closedCaseNos = [];
      wrongMonth.manualByCategory = [];
      const otherOwn = structuredClone(own!);
      otherOwn.businessArea = "unassigned";
      const otherMonth = otherOwn.drilldown!.complaintMonthlyStatistics[0]!;
      otherMonth.lowRatingAuto.createdCaseNos = ["low-c2", "low-c3", "low-c4"];
      otherMonth.manual.createdCaseNos = [];
      otherMonth.manual.closedCaseNos = [];
      otherMonth.manualByCategory = [];
      own!.drilldown!.complaintMonthlyStatistics[0]!.lowRatingAuto.createdCaseNos =
        ["low-main"];
      return [wrongFirst, own!, otherOwn];
    };
    await expect(runR09OwnComplaintLifecycle(ports)).resolves.toMatchObject({
      caseNos: ports.cases.map(({ caseNo }) => caseNo),
    });
    expect(ports.actions).toContain("drill-low-main:TPE");
    expect(ports.actions).toContain("drill-low-c2:unassigned");
    expect(ports.actions).toContain("drill-low-c3:unassigned");
    expect(ports.actions).toContain("drill-low-c4:unassigned");
    expect(ports.actions).toContain("closure-manual-service:TPE");
    expect(ports.actions).not.toContain("drill-low-main:AAA-foreign-first");
  });
});

describe("original Playwright-shaped UI POST capture", () => {
  it("accepts one same-runtime browser POST and rejects duplicate/foreign runtime", async () => {
    for (const [count, responseSha, success] of [
      [1, runtimeSha, true],
      [2, runtimeSha, false],
      [1, "wrong-runtime", false],
    ] as const) {
      const listeners: Array<
        (request: { url(): string; method(): string }) => void
      > = [];
      let deliver!: (response: unknown) => void;
      let predicate!: (response: never) => boolean;
      let routeHandler!: (route: never) => Promise<void>;
      const intents: Array<{ requestId: string; bodySha256: string }> = [];
      const sequence: string[] = [];
      const page = {
        on: (
          _event: string,
          listener: (request: { url(): string; method(): string }) => void,
        ) => {
          listeners.push(listener);
        },
        off: (
          _event: string,
          listener: (request: { url(): string; method(): string }) => void,
        ) => {
          listeners.splice(listeners.indexOf(listener), 1);
        },
        waitForResponse: (matches: (response: never) => boolean) => {
          predicate = matches;
          return new Promise((resolve) => {
            deliver = resolve;
          });
        },
        route: async (_matcher: unknown, handler: typeof routeHandler) => {
          routeHandler = handler;
        },
        unroute: async () => {},
      } as unknown as Page;
      const request = {
        url: () =>
          "https://admin.example/control-plane-proxy/reports/referral-monthly-ratings/governance/evaluate",
        method: () => "POST",
        headers: () => ({ "x-request-id": "ui-evaluate-id" }),
        postData: () =>
          JSON.stringify({ periodMonth: "2026-10", driverId: "own-driver" }),
        postDataJSON: () => ({
          periodMonth: "2026-10",
          driverId: "own-driver",
        }),
      };
      const response = {
        url: request.url,
        request: () => request,
        status: () => 200,
        headers: () => ({ "x-drts-candidate-sha": responseSha }),
        json: async () => ({
          ok: true,
          data: { periodMonth: "2026-10" },
          meta: {},
        }),
      };
      const run = captureUiPost(
        page,
        "https://admin.example",
        "/reports/referral-monthly-ratings/governance/evaluate",
        runtimeSha,
        async () => {
          for (let n = 0; n < count; n++) {
            listeners.forEach((listener) => listener(request));
            await routeHandler({
              request: () => request,
              fallback: async () => {
                sequence.push("forward");
                if (predicate(response as never)) deliver(response);
              },
              abort: async () => {},
            } as never);
          }
        },
        async (intent, forward) => {
          sequence.push("durable-intent");
          intents.push(intent);
          await forward();
        },
      );
      if (success)
        await expect(run).resolves.toMatchObject({
          requestId: "ui-evaluate-id",
          body: { driverId: "own-driver" },
        });
      else await expect(run).rejects.toThrow();
      expect(listeners).toHaveLength(0);
      expect(intents).toHaveLength(1);
      expect(intents[0]!.requestId).toBe("ui-evaluate-id");
      expect(intents[0]!.bodySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(sequence.slice(0, 2)).toEqual(["durable-intent", "forward"]);
    }
  });
  it("aborts the exact UI route when durable before-forward custody fails", async () => {
    let routeHandler!: (route: never) => Promise<void>;
    let forwarded = false;
    let aborted = false;
    const request = {
      url: () =>
        "https://admin.example/control-plane-proxy/reports/referral-monthly-ratings/governance/evaluate",
      method: () => "POST",
      headers: () => ({ "x-request-id": "original-ui-request" }),
      postData: () => '{"periodMonth":"2026-10"}',
    };
    const page = {
      on: () => {},
      off: () => {},
      route: async (_matcher: unknown, handler: typeof routeHandler) => {
        routeHandler = handler;
      },
      unroute: async () => {},
      waitForResponse: () => new Promise(() => undefined),
    } as unknown as Page;
    await expect(
      captureUiPost(
        page,
        "https://admin.example",
        "/reports/referral-monthly-ratings/governance/evaluate",
        runtimeSha,
        () =>
          routeHandler({
            request: () => request,
            fallback: async () => {
              forwarded = true;
            },
            abort: async () => {
              aborted = true;
            },
          } as never),
        async () => {
          throw new Error("durable checkpoint failed");
        },
      ),
    ).rejects.toThrow(/durable checkpoint failed/);
    expect(aborted).toBe(true);
    expect(forwarded).toBe(false);
  });
});

// The actual caller closure is extracted from the exact E2E source, as in the
// existing booking and recovery AST harnesses. The old source has no node and
// therefore runs RED; no hosted/browser server is involved in this unit test.
function actualCallerSource() {
  const path =
    process.env.R04_R09_TEST_CALLER_SOURCE ??
    resolve("tests/e2e/owned-referral-business-journey/owned-business.spec.ts");
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let closure: ts.ArrowFunction | undefined;
  let insideRecoveryElse = false;
  let normalCalls = 0;
  let recoveryCalls = 0;
  function visit(node: ts.Node, normal = false) {
    if (
      ts.isIfStatement(node) &&
      node.expression.getText(source) === "RECOVERY_ONLY"
    ) {
      ts.forEachChild(node.thenStatement, (child) => visit(child, false));
      if (node.elseStatement) visit(node.elseStatement, true);
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "runExistingR04R09"
    ) {
      closure = node.initializer as ts.ArrowFunction;
      insideRecoveryElse = normal;
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "runExistingR04R09"
    ) {
      if (normal) normalCalls++;
      else recoveryCalls++;
    }
    ts.forEachChild(node, (child) => visit(child, normal));
  }
  visit(source);
  expect(closure, "actual normal caller node missing").toBeDefined();
  expect(
    insideRecoveryElse,
    "R04/R09 must run only in original FULL branch",
  ).toBe(true);
  expect(normalCalls).toBe(1);
  expect(recoveryCalls).toBe(0);
  const sourceText = source.getFullText();
  const callerPosition = sourceText.indexOf("await runExistingR04R09();");
  const dailyPosition = sourceText.indexOf(
    'finalizer.checkpoint("final-daily-report-readback")',
  );
  expect(callerPosition).toBeGreaterThan(0);
  expect(dailyPosition).toBeGreaterThan(callerPosition);
  const printed = ts.transpileModule(
    `const runExistingR04R09 = ${closure!.getText(source)};`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    },
  ).outputText;
  return new Function(
    "bindings",
    `with (bindings) { ${printed} return runExistingR04R09; }`,
  ) as (bindings: Record<string, unknown>) => () => Promise<void>;
}

describe("actual normal caller AST wiring", () => {
  it("passes exact pre-existing subjects to both helpers and closes pages", async () => {
    const trace: string[] = [];
    const selectedHandling: string[] = [];
    const uiRows = [
      {
        rule: "coaching",
        text: "own-driver Monthly average below 4.0 requires coaching",
      },
      {
        rule: "termination_review",
        text: "own-driver 3 consecutive months below 3.5 requires termination",
      },
    ];
    const locator = (rows: typeof uiRows) => ({
      getByRole: () => locator(rows),
      filter: ({ hasText }: { hasText: string | RegExp }) =>
        locator(
          rows.filter((row) =>
            typeof hasText === "string"
              ? row.text.includes(hasText)
              : hasText.test(row.text),
          ),
        ),
      count: async () => rows.length,
      selectOption: async () => {
        expect(rows).toHaveLength(1);
        selectedHandling.push(rows[0]!.rule);
      },
      fill: async () => {
        expect(rows).toHaveLength(1);
        selectedHandling.push(rows[0]!.rule);
      },
      click: async () => {
        if (rows.length === 1) selectedHandling.push(rows[0]!.rule);
      },
    });
    const fakePage = {
      route: async () => {},
      goto: async () => ({
        status: () => 200,
        headers: () => ({ "x-drts-candidate-sha": runtimeSha }),
      }),
      close: async () => {
        trace.push("page-close");
      },
      getByRole: () => locator(uiRows),
    };
    const caller = actualCallerSource()({
      opsControlRole: "ops",
      browserRatingState: {
        current: {
          state: "acknowledged",
          caseNo: "low-main",
          submittedAt: "2026-10-30T12:00:00Z",
        },
      },
      displayObservations: {
        manualComplaint: {
          result: "observed",
          categories: [
            {
              result: "observed",
              category: "service",
              orderId: "main-order",
              caseNo: "manual-service",
            },
            {
              result: "observed",
              category: "fare",
              orderId: "main-order",
              caseNo: "manual-fare",
            },
            {
              result: "observed",
              category: "lost_item",
              orderId: "main-order",
              caseNo: "manual-lost",
            },
          ],
        },
      },
      lowRatings: ["low-main", "low-c2", "low-c3", "low-c4"].map(
        (caseNo, index) => ({
          result: "observed",
          state: "acknowledged",
          caseNo,
          orderId: index === 0 ? "main-order" : `c${index + 1}-order`,
        }),
      ),
      completedOrderId: "main-order",
      principalId: admin.principalId,
      identity: session(admin).identity,
      adminSessionId: admin.sessionId,
      opsPrincipalId: ops.principalId,
      opsMembershipId: ops.membershipId,
      opsSessionId: ops.sessionId,
      opsScopes: ops.scopes,
      requireFact: (fact: boolean, message: string) => {
        if (!fact) throw new Error(message);
      },
      text: (value: unknown) => {
        if (!value) throw new Error("missing");
        return value;
      },
      call: async () => ({}),
      records: (value: unknown) => value,
      origins: { admin: "https://admin.example", ops: "https://ops.example" },
      context: { newPage: async () => fakePage },
      installVerifiedRoleRoute: async () => {},
      captureUiPost: async (
        _page: unknown,
        _origin: string,
        _path: string,
        _runtime: string,
        click: () => Promise<void>,
      ) => {
        await click();
        return {};
      },
      expect: (subject: { count(): Promise<number> }) => ({
        toHaveCount: async (count: number) => {
          expect(await subject.count()).toBe(count);
        },
      }),
      tx: {},
      runtimeSha: runtimeSha,
      runtime: runtimeSha,
      finalizer: {
        checkpoint: async (stage: string) => {
          trace.push(stage);
        },
      },
      driverId: "own-driver",
      evidence: {
        record: (value: { stage: string }) => {
          trace.push(value.stage);
        },
      },
      runR04CurrentMonthGovernance: async (ports: R04Ports) => {
        expect(ports.orderId).toBe("main-order");
        expect(ports.driverId).toBe("own-driver");
        expect(ports.caseNo).toBe("low-main");
        expect(ports.score).toBe(2);
        expect(ports.submittedAt).toBe("2026-10-30T12:00:00Z");
        await ports.evaluate();
        await ports.dismiss("own-record", "synthetic reason");
        expect(selectedHandling).toEqual(["coaching", "coaching", "coaching"]);
        trace.push("r04");
        return { recordId: "own-record" };
      },
      runR09OwnComplaintLifecycle: async (ports: R09Ports) => {
        expect(ports.cases.map((own) => own.caseNo)).toEqual([
          "low-main",
          "low-c2",
          "low-c3",
          "low-c4",
          "manual-service",
          "manual-fare",
          "manual-lost",
        ]);
        expect(ports.cases.map((own) => own.orderId)).toEqual([
          "main-order",
          "c2-order",
          "c3-order",
          "c4-order",
          "main-order",
          "main-order",
          "main-order",
        ]);
        expect(ports.cases.slice(4).map((own) => own.category)).toEqual([
          "driver_service",
          "fare_dispute",
          "lost_and_found",
        ]);
        trace.push("r09");
        return { serviceCaseNo: "manual-service" };
      },
    });
    await caller();
    expect(trace).toEqual([
      "r04-existing-current-month-governance",
      "r04",
      "r04-own-current-month-ui-governance",
      "page-close",
      "r09-existing-own-complaint-lifecycle",
      "r09",
      "r09-own-seven-case-ui-lifecycle-monthly-statistics",
      "page-close",
    ]);
  });
});
