import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ActionReceipt,
  AuditLogRecord,
  CreateComplaintCaseCommand,
} from "@drts/contracts";
import { IDEMPOTENCY_REPLAY_HEADER } from "@drts/contracts";
import {
  ApiClient,
  ApiClientError,
} from "../../../packages/api-client/src/index";
import {
  IdempotencyRepository,
  IdempotencyService,
} from "../../../apps/api/src/common/idempotency";
import { AuditLogRepository } from "../../../apps/api/src/modules/audit-notification/audit-log.repository";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintController } from "../../../apps/api/src/modules/complaint/complaint.controller";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";
import {
  crossAppHref,
  platformAdminAuditLink,
} from "../../../apps/ops-console-web/lib/ops-cross-app-links";

const ops = {
  actorId: "ops-receipt-test",
  actorType: "ops_user" as const,
  realm: "ops" as const,
  tenantId: null,
  scopes: ["audit:read"],
};
const command: CreateComplaintCaseCommand = {
  caseSource: "ops",
  category: "lost_and_found",
  severity: "normal",
  description: "Fictional lost-item case; no human contacted.",
};

function fixture(
  beforePersist: (record: AuditLogRecord) => Promise<void> = async () => {},
) {
  const stored = new Map<string, AuditLogRecord>();
  const repository = {
    isEnabled: () => true,
    append: vi.fn(async (record: AuditLogRecord) => {
      await beforePersist(record);
      stored.set(record.auditId, structuredClone(record));
    }),
    findById: vi.fn(async (id: string) => stored.get(id) ?? null),
    loadRecent: async () => [],
    loadEvidenceGovernanceTrail: async () => [],
  } as unknown as AuditLogRepository;
  const audit = new AuditNotificationService(repository);
  const service = new ComplaintService(audit);
  const idempotency = new IdempotencyService(new IdempotencyRepository());
  const controller = new ComplaintController(
    service,
    new IncidentService(audit),
    idempotency,
  );
  return { stored, repository, audit, service, controller, idempotency };
}

function presenter() {
  const file = new URL(
    "../../../apps/ops-console-web/app/complaints/page.tsx",
    import.meta.url,
  );
  const source = ts.createSourceFile(
    file.pathname,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let node: ts.FunctionDeclaration | undefined;
  function walk(n: ts.Node) {
    if (ts.isFunctionDeclaration(n) && n.name?.text === "buildActionReceipt")
      node = n;
    ts.forEachChild(n, walk);
  }
  walk(source);
  if (!node) throw new Error("Actual complaint receipt presenter missing");
  const js = ts.transpileModule(node.getText(source), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(
    "crossAppHref",
    "platformAdminAuditLink",
    "t",
    "actionLabel",
    "locale",
    js + ";return buildActionReceipt;",
  )(
    crossAppHref,
    platformAdminAuditLink,
    () => "Submitted",
    (action: string) => action,
    "zh",
  ) as (
    action: string,
    receipt: ActionReceipt,
  ) => ActionReceipt & { auditHref: string };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("ordinary complaint actions return their actual canonical audit receipt", () => {
  it("returns the writer's real receipt without repeating a completed action while persistence is pending", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = fixture(async (record) => {
      if (record.actionName === "add_complaint_case_note") await gate;
    });
    const original = f.service.createComplaintCase(command);
    expect(original).not.toHaveProperty("then");
    expect(original).not.toHaveProperty("actionReceipt");
    const response = await f.controller.addComplaintCaseNote(
      original.caseNo,
      { note: "Real note" },
      "req-note-1",
    );
    expect(response.data).toMatchObject({
      caseNo: original.caseNo,
      status: "under_investigation",
    });
    expect(response.data).not.toHaveProperty("auditId");
    const receipt = response.meta.actionReceipt;
    expect(receipt).toMatchObject({
      actionId: "req-note-1",
      resourceType: "complaint_case",
      resourceId: original.caseNo,
      status: "completed",
    });
    expect(receipt.auditId).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.stored.has(receipt.auditId)).toBe(false);
    expect(
      f.audit
        .getAuditLogsSnapshot()
        .find((entry) => entry.auditId === receipt.auditId),
    ).toMatchObject({ requestId: "req-note-1", resourceId: original.caseNo });
    release();
    await vi.waitFor(() => expect(f.stored.has(receipt.auditId)).toBe(true));
    expect(f.stored.get(receipt.auditId)).toMatchObject({
      requestId: "req-note-1",
      actionName: "add_complaint_case_note",
      resourceId: original.caseNo,
    });
  });

  it("replays the original create receipt and does not create another case", async () => {
    const f = fixture();
    const response = { status: vi.fn(), setHeader: vi.fn() };
    const first = await f.controller.createComplaintCase(
      command,
      response,
      "receipt-case-key",
      "first-request",
    );
    const replay = await f.controller.createComplaintCase(
      command,
      response,
      "receipt-case-key",
      "replay-request",
    );
    expect(replay.data).toEqual(first.data);
    expect(replay.meta.actionReceipt).toEqual(first.meta.actionReceipt);
    expect(replay.meta.requestId).toBe("replay-request");
    expect(replay.meta.actionReceipt.actionId).toBe("first-request");
    expect(response.setHeader).toHaveBeenCalledWith(
      IDEMPOTENCY_REPLAY_HEADER,
      "true",
    );
    expect(
      f.audit
        .getAuditLogsSnapshot()
        .filter(
          (a) =>
            a.resourceId === first.data.caseNo &&
            a.actionName === "create_complaint_case",
        ),
    ).toHaveLength(1);
  });

  it("reuses a completed close receipt without repeating its timeline event", async () => {
    const f = fixture();
    const record = f.service.createComplaintCase(command);
    const resolution = {
      resolutionCode: "resolved_other" as const,
      closingNote: "Fictional exercise only.",
    };
    await f.controller.resolveComplaintCase(
      record.caseNo,
      resolution,
      "resolve-request",
    );
    const first = await f.controller.closeComplaintCase(
      record.caseNo,
      resolution,
      "close-request",
    );
    const replay = await f.controller.closeComplaintCase(
      record.caseNo,
      resolution,
      "close-replay",
    );
    expect(replay.data).toEqual(first.data);
    expect(replay.meta.actionReceipt).toEqual(first.meta.actionReceipt);
    expect(
      f.service.getComplaintTimeline(record.caseNo).map((e) => e.action),
    ).toEqual(["case_created", "case_resolved", "case_closed"]);
  });

  it("adds the actual original receipt when replaying a legacy create response without receipt metadata", async () => {
    const f = fixture();
    const original = await f.idempotency.execute({
      scope: "crm:complaint:case_create",
      idempotencyKey: "legacy-create-key",
      payload: command,
      execute: async () => ({
        data: f.service.createComplaintCase(command, "legacy-create"),
        statusCode: 201,
      }),
    });
    const replay = await f.controller.createComplaintCase(
      command,
      { status: vi.fn(), setHeader: vi.fn() },
      "legacy-create-key",
      "new-replay",
    );
    expect(replay.data).toEqual(original.data);
    expect(replay.meta.actionReceipt.actionId).toBe("legacy-create");
    expect(
      f.audit
        .getAuditLogsSnapshot()
        .filter((row) => row.resourceId === original.data.caseNo),
    ).toHaveLength(1);
  });

  it("uses the existing tenant visibility rules for an exact-ID read", async () => {
    const f = fixture();
    const tenantId = "11111111-1111-4111-8111-111111111111";
    const log = await f.audit.recordAuditLogAsync({
      actorId: null,
      actorType: "system",
      tenantId,
      moduleName: "complaint",
      actionName: "test_stored_case",
      resourceType: "complaint_case",
      resourceId: "CASE-tenant",
    });
    const reader = new AuditNotificationService(f.repository);
    const tenant = {
      actorId: "tenant-reader",
      actorType: "tenant_admin" as const,
      realm: "tenant" as const,
      scopes: ["audit:read"],
      tenantId,
    };
    expect(await reader.readAuditLogById(log.auditId, tenant)).toHaveLength(1);
    expect(
      await reader.readAuditLogById(log.auditId, {
        ...tenant,
        tenantId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual([]);
  });

  it("reads an exact committed audit record from a fresh service and presents the owning-app link", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_PLATFORM_ADMIN_URL",
      "https://platform.example.test",
    );
    const f = fixture();
    const record = f.service.createComplaintCase(command);
    const response = await f.controller.addComplaintCaseNote(
      record.caseNo,
      { note: "Verified" },
      "exact-note",
    );
    const reader = new AuditNotificationService(f.repository);
    expect(
      reader
        .getAuditLogsSnapshot()
        .some((r) => r.auditId === response.meta.actionReceipt.auditId),
    ).toBe(false);
    const rows = await reader.readAuditLogById(
      response.meta.actionReceipt.auditId,
      ops,
      "read-exact",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      auditId: response.meta.actionReceipt.auditId,
      resourceId: record.caseNo,
      actionName: "add_complaint_case_note",
    });
    const displayed = presenter()("add_note", response.meta.actionReceipt);
    expect(displayed.auditId).toBe(rows[0]!.auditId);
    expect(displayed.actionId).toBe("exact-note");
    const target = new URL(displayed.auditHref);
    expect(target.origin).toBe("https://platform.example.test");
    expect(target.pathname).toBe("/audit");
    expect(Object.fromEntries(target.searchParams)).toEqual({
      auditId: rows[0]!.auditId,
      resourceType: "complaint_case",
      resourceId: record.caseNo,
    });
  });

  it("records explicit export preparation, while ordinary poll reads stay read-only", async () => {
    const f = fixture();
    const record = f.service.createComplaintCase(command);
    const before = f.audit.getAuditLogsSnapshot().length;
    await f.controller.getComplaintExportView(record.caseNo, "poll-1");
    await f.controller.getComplaintExportView(record.caseNo, "poll-2");
    expect(f.audit.getAuditLogsSnapshot()).toHaveLength(before);
    const exported = await f.controller.getComplaintExportView(
      record.caseNo,
      "explicit-export",
      "true",
    );
    const receipt = exported.meta.actionReceipt!;
    expect(receipt).toMatchObject({
      actionId: "explicit-export",
      resourceId: record.caseNo,
    });
    expect(f.stored.get(receipt.auditId)).toMatchObject({
      actionName: "export_complaint_case_view",
      newValuesSummary: {
        exportGeneratedAt: exported.data.exportGeneratedAt,
        readyForAudit: false,
      },
    });
    expect(f.service.getComplaintTimeline(record.caseNo)).toHaveLength(1);
  });

  it("keeps legacy SDK results and gives receipt-aware SDK calls the same response's real receipt", async () => {
    const f = fixture();
    const record = f.service.createComplaintCase(command);
    const transport = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const result = await f.controller.addComplaintCaseNote(
        record.caseNo,
        JSON.parse(String(init?.body)),
        new Headers(init?.headers).get("x-request-id") ?? undefined,
      );
      return new Response(JSON.stringify(result), { status: 200 });
    });
    vi.stubGlobal("fetch", transport);
    const client = new ApiClient({ baseUrl: "https://ops.example.test" });
    const legacy = await client.addComplaintNote(record.caseNo, {
      note: "Legacy",
    });
    expect(legacy.caseNo).toBe(record.caseNo);
    expect(legacy).not.toHaveProperty("receipt");
    const current = await client.addComplaintNoteWithReceipt(
      record.caseNo,
      { note: "Current" },
      { headers: { "x-request-id": "sdk-current" } },
    );
    expect(current.data.caseNo).toBe(record.caseNo);
    expect(current.receipt).toMatchObject({
      actionId: "sdk-current",
      resourceId: record.caseNo,
    });
    expect(f.stored.get(current.receipt.auditId)?.requestId).toBe(
      "sdk-current",
    );
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("reports missing receipt metadata as an already completed write with no retry", async () => {
    const transport = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { caseNo: "CASE-legacy" },
            meta: {
              requestId: "old-server",
              timestamp: new Date().toISOString(),
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", transport);
    const client = new ApiClient({ baseUrl: "https://ops.example.test" });
    const error = await client
      .addComplaintNoteWithReceipt("CASE-legacy", { note: "Once" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: "COMPLAINT_ACTION_COMPLETED_WITHOUT_RECEIPT",
      retryable: false,
    });
    expect((error as Error).message).toContain("action completed");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("binds concurrent responses to their own actions even when audit appends complete in reverse order", async () => {
    let release!: () => void;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = fixture(async (record) => {
      if (record.requestId === "slow-action") await slow;
    });
    const record = f.service.createComplaintCase(command);
    const first = f.controller.addComplaintCaseNote(
      record.caseNo,
      { note: "First" },
      "slow-action",
    );
    const second = await f.controller.addComplaintCaseNote(
      record.caseNo,
      { note: "Second" },
      "fast-action",
    );
    release();
    const finishedFirst = await first;
    expect(finishedFirst.meta.actionReceipt.actionId).toBe("slow-action");
    expect(second.meta.actionReceipt.actionId).toBe("fast-action");
    expect(finishedFirst.meta.actionReceipt.auditId).not.toBe(
      second.meta.actionReceipt.auditId,
    );
    await vi.waitFor(() =>
      expect(f.stored.has(finishedFirst.meta.actionReceipt.auditId)).toBe(true),
    );
    expect(
      f.stored.get(finishedFirst.meta.actionReceipt.auditId)?.requestId,
    ).toBe("slow-action");
    expect(f.stored.get(second.meta.actionReceipt.auditId)?.requestId).toBe(
      "fast-action",
    );
  });

  it("uses the deployed runtime origin rather than a stale build-time cross-app URL", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_PLATFORM_ADMIN_URL",
      "https://old-build.example.test",
    );
    vi.stubGlobal("window", {
      __DRTS_RUNTIME_CONFIG__: {
        platformAdminBaseUrl: "https://runtime.example.test/",
      },
    });
    const href = crossAppHref(
      platformAdminAuditLink({
        auditId: "canonical-id",
        resourceType: "complaint_case",
        resourceId: "CASE-runtime",
      }),
    );
    expect(new URL(href).origin).toBe("https://runtime.example.test");
  });

  it("serializes the existing deployment origin into the server runtime config", () => {
    vi.stubEnv("NEXT_PUBLIC_PLATFORM_ADMIN_URL", "");
    vi.stubEnv(
      "NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN",
      "https://deployed.example.test/",
    );
    const file = new URL(
      "../../../apps/ops-console-web/lib/runtime-config.tsx",
      import.meta.url,
    );
    const source = ts.createSourceFile(
      file.pathname,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const node = source.statements.find(
      (n): n is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(n) && n.name?.text === "RuntimeConfigScript",
    );
    if (!node) throw new Error("Actual RuntimeConfigScript missing");
    const js = ts.transpileModule(node.getText(source), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const render = new Function(
      "require",
      "exports",
      "resolveBrowserApiBaseUrl",
      "RUNTIME_CONFIG_WINDOW_KEY",
      js + ";return RuntimeConfigScript;",
    )(
      (name: string) => {
        if (name !== "react/jsx-runtime") throw new Error(name);
        return { jsx: (_tag: string, props: unknown) => props };
      },
      {},
      () => "/control-plane-proxy",
      "__DRTS_RUNTIME_CONFIG__",
    );
    expect(render().dangerouslySetInnerHTML.__html).toContain(
      '"platformAdminBaseUrl":"https://deployed.example.test"',
    );
  });
});
