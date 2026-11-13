import {
  COMPLAINT_CATEGORY_VALID_RESOLUTIONS,
  type ComplaintCaseRecord,
  type ComplaintTimelineEntry,
  type SixMonthOperationsSummary,
} from "@drts/contracts";
import { object, requireFact, text, type ObjectData } from "./protocol";
import {
  assertVerifiedRole,
  taipeiMonth,
  type UiPost,
  type VerifiedRole,
} from "./r04-current-month-governance";

type OwnCase = Readonly<{
  caseNo: string;
  orderId: string;
  source: "lowRatingAuto" | "manual";
  category?: "driver_service" | "fare_dispute" | "lost_and_found";
}>;

export type R09Ports = {
  runtimeSha: string;
  role: VerifiedRole;
  completedOrderId: string;
  cases: readonly OwnCase[];
  browserSession(): Promise<ObjectData>;
  readCase(caseNo: string): Promise<ComplaintCaseRecord>;
  readOrder(orderId: string): Promise<ObjectData>;
  readTimeline(caseNo: string): Promise<ComplaintTimelineEntry[]>;
  readAudit(auditId: string): Promise<ObjectData[]>;
  openCase(caseNo: string): Promise<void>;
  action(
    action: "assign" | "notes" | "resolve" | "close",
    caseNo: string,
    fields: ObjectData,
  ): Promise<UiPost>;
  preview(from: string, to: string): Promise<SixMonthOperationsSummary[]>;
  openReport(from: string, to: string): Promise<void>;
  inspectDrilldown(
    caseNo: string,
    month: string,
    source: OwnCase["source"],
    dimension: Readonly<{ businessArea: string; serviceProductCode: string }>,
  ): Promise<void>;
  inspectClosure(
    caseNo: string,
    month: string,
    dimension: Readonly<{ businessArea: string; serviceProductCode: string }>,
  ): Promise<void>;
};

const actionTimeline = {
  assign: "case_assigned",
  notes: "case_note_added",
  resolve: "case_resolved",
  close: "case_closed",
} as const;
const auditAction = {
  assign: "assign_complaint_case",
  notes: "add_complaint_case_note",
  resolve: "resolve_complaint_case",
  close: "close_complaint_case",
} as const;

function monthSpan(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty! - fy!) * 12 + tm! - fm! + 1;
}

async function readOwn(p: R09Ports, own: OwnCase) {
  const record = await p.readCase(own.caseNo);
  requireFact(
    record.caseNo === own.caseNo &&
      record.relatedOrderId === own.orderId &&
      record.caseSource === "app" &&
      (own.source !== "lowRatingAuto" ||
        (record.category === "driver_service" &&
          record.description.includes("轉介乘客評價"))) &&
      (own.source !== "manual" || record.category === own.category) &&
      Number.isFinite(Date.parse(record.createdAt)) &&
      Number.isFinite(Date.parse(record.slaDueAt)),
    "R09 exact same-run case/order/category and canonical SLA",
  );
  const timeline = await p.readTimeline(own.caseNo);
  requireFact(
    timeline.some(
      (entry) => entry.caseNo === own.caseNo && entry.action === "case_created",
    ),
    "R09 same-case creation timeline",
  );
  return { record, timeline };
}

async function command(
  p: R09Ports,
  own: OwnCase,
  action: keyof typeof actionTimeline,
  fields: ObjectData,
  expectedStatus: ComplaintCaseRecord["status"],
) {
  assertVerifiedRole(await p.browserSession(), p.role, [
    "complaints:read",
    "complaints:write",
    "reports:read",
    "audit:read",
  ]);
  const before = await readOwn(p, own);
  requireFact(
    before.record.status !== "closed" &&
      (action !== "close" || before.record.status === "resolved"),
    "R09 own actionable case before UI command",
  );
  let receipt: UiPost;
  try {
    receipt = await p.action(action, own.caseNo, fields);
  } catch (error) {
    // A late or lost UI response is an unknown ACK. Read the exact case and
    // timeline once, then stop; no new command or idempotency key is issued.
    await readOwn(p, own);
    throw error;
  }
  const path = `/control-plane-proxy/complaints/${encodeURIComponent(own.caseNo)}/${action}`;
  requireFact(
    receipt.path === path &&
      receipt.runtimeSha === p.runtimeSha &&
      Object.entries(fields).every(
        ([key, value]) => receipt.body[key] === value,
      ) &&
      receipt.data.caseNo === own.caseNo &&
      receipt.data.relatedOrderId === own.orderId,
    "R09 one original UI action intent and same-case ACK",
  );
  const actionReceipt = object(receipt.meta.actionReceipt);
  const auditId = text(actionReceipt.auditId);
  const actionId = text(actionReceipt.actionId);
  requireFact(
    actionId === receipt.requestId &&
      actionReceipt.resourceType === "complaint_case" &&
      actionReceipt.resourceId === own.caseNo &&
      actionReceipt.status === "completed",
    "R09 original UI request and exact action receipt",
  );
  const after = await readOwn(p, own);
  requireFact(
    after.record.status === expectedStatus &&
      after.timeline.filter(
        (entry) =>
          entry.caseNo === own.caseNo &&
          entry.action === actionTimeline[action] &&
          !before.timeline.some((old) => old.entryId === entry.entryId),
      ).length === 1,
    "R09 fresh same-case action timeline and status",
  );
  const audit = await p.readAudit(auditId);
  const sameCaseAudit = audit.filter(
    (entry) =>
      entry.auditId === auditId &&
      entry.requestId === receipt.requestId &&
      entry.actorType === "ops_user" &&
      entry.moduleName === "complaint" &&
      entry.actionName === auditAction[action] &&
      entry.resourceId === own.caseNo,
  );
  requireFact(
    sameCaseAudit.length === 1 &&
      (sameCaseAudit[0]!.actorId === p.role.principalId ||
        ((action === "resolve" || action === "close") &&
          sameCaseAudit[0]!.actorId === null)),
    "R09 same-case canonical audit and truthful Ops actor attribution",
  );
  return {
    record: after.record,
    timeline: after.timeline,
    actionId,
    auditId,
    auditActorId: sameCaseAudit[0]!.actorId as string | null,
  };
}

/** Existing seven caseNos only. No case creation or low-rating command. */
export async function runR09OwnComplaintLifecycle(p: R09Ports) {
  assertVerifiedRole(await p.browserSession(), p.role, [
    "complaints:read",
    "complaints:write",
    "reports:read",
    "audit:read",
  ]);
  requireFact(
    p.role.realm === "ops" &&
      p.role.actorType === "ops_user" &&
      p.cases.length === 7 &&
      new Set(p.cases.map((own) => own.caseNo)).size === 7 &&
      p.cases.filter((own) => own.source === "lowRatingAuto").length === 4 &&
      p.cases.filter((own) => own.source === "manual").length === 3,
    "R09 original Ops authority and exact own seven cases",
  );
  const manual = p.cases.filter((own) => own.source === "manual");
  requireFact(
    manual.every((own) => own.orderId === p.completedOrderId) &&
      new Set(manual.map((own) => own.category)).size === 3 &&
      ["driver_service", "fare_dispute", "lost_and_found"].every((category) =>
        manual.some((own) => own.category === category),
      ),
    "R09 three exact manual category cases on own completed order",
  );
  const originals = await Promise.all(p.cases.map((own) => readOwn(p, own)));
  const orderProducts = new Map<string, string>();
  for (const orderId of new Set(p.cases.map((own) => own.orderId))) {
    const order = await p.readOrder(orderId);
    requireFact(
      order.orderId === orderId &&
        order.serviceBucket === "business_dispatch" &&
        order.businessDispatchSubtype === "enterprise_dispatch",
      "R09 original own business order and canonical product metadata",
    );
    orderProducts.set(orderId, text(order.businessDispatchSubtype));
  }
  const service = manual.find((own) => own.category === "driver_service")!;
  const original = originals[p.cases.indexOf(service)]!;
  requireFact(
    ["new", "assigned", "under_investigation", "reopened"].includes(
      original.record.status,
    ) &&
      COMPLAINT_CATEGORY_VALID_RESOLUTIONS.driver_service.includes(
        "resolved_other",
      ),
    "R09 own service case and valid canonical resolution",
  );
  await p.openCase(service.caseNo);
  const assignment = await command(
    p,
    service,
    "assign",
    {
      assigneeId: p.role.principalId,
      note: "Controlled synthetic internal assignment; no customer contact.",
    },
    "assigned",
  );
  requireFact(
    assignment.record.assigneeId === p.role.principalId,
    "R09 own Ops principal assigned",
  );
  const note = await command(
    p,
    service,
    "notes",
    {
      note: "Controlled synthetic internal review only; no external customer contact, refund or item return.",
    },
    "under_investigation",
  );
  const resolved = await command(
    p,
    service,
    "resolve",
    {
      resolutionCode: "resolved_other",
      closingNote:
        "Controlled synthetic internal resolution only; no external customer contact, refund or item return.",
    },
    "resolved",
  );
  const closed = await command(
    p,
    service,
    "close",
    {
      resolutionCode: "resolved_other",
      closingNote:
        "Controlled synthetic internal close only; no external customer contact, refund or item return.",
    },
    "closed",
  );
  requireFact(
    closed.record.resolutionCode === "resolved_other" &&
      closed.record.assigneeId === p.role.principalId,
    "R09 own service case final closed readback",
  );
  const closure = closed.timeline.filter(
    (entry) =>
      entry.action === "case_closed" && entry.caseNo === service.caseNo,
  );
  requireFact(closure.length === 1, "R09 one own service closure");
  const closureMonth = taipeiMonth(closure[0]!.createdAt);
  const creationMonths = originals.map(({ record }) =>
    taipeiMonth(record.createdAt),
  );
  const months = [...creationMonths, closureMonth].sort();
  const from = months[0]!;
  const to = months.at(-1)!;
  requireFact(
    monthSpan(from, to) >= 1 && monthSpan(from, to) <= 6,
    "R09 existing six-month preview window",
  );
  assertVerifiedRole(await p.browserSession(), p.role, ["reports:read"]);
  await p.openReport(from, to);
  const preview = await p.preview(from, to);
  requireFact(preview.length > 0, "R09 fresh canonical preview rows");
  const dimensions = new Set<string>();
  for (const row of preview) {
    requireFact(
      typeof row.businessArea === "string" &&
        row.businessArea.length > 0 &&
        typeof row.serviceProductCode === "string" &&
        row.serviceProductCode.length > 0,
      "R09 concrete canonical preview dimensions",
    );
    const key = `${row.businessArea}\u0000${row.serviceProductCode}`;
    requireFact(!dimensions.has(key), "R09 unique preview dimension card");
    dimensions.add(key);
  }
  const assignedRows = p.cases.map((own, index) => {
    const createdMonth = creationMonths[index]!;
    const containing = preview.filter((summary) =>
      (summary.drilldown?.complaintMonthlyStatistics ?? []).some((month) =>
        [month.lowRatingAuto, month.manual].some((split) =>
          [
            ...split.createdCaseNos,
            ...split.closedCaseNos,
            ...split.overdueCaseNos,
          ].includes(own.caseNo),
        ),
      ),
    );
    requireFact(
      containing.length === 1,
      "R09 exact own case confined to one canonical dimension",
    );
    const matches = containing.filter(
      (summary) =>
        summary.serviceProductCode === orderProducts.get(own.orderId) &&
        (summary.drilldown?.complaintMonthlyStatistics ?? []).some(
          (month) =>
            month.periodMonth === createdMonth &&
            month.timeZone === "Asia/Taipei" &&
            (own.source === "lowRatingAuto"
              ? month.lowRatingAuto
              : month.manual
            ).createdCaseNos.includes(own.caseNo),
        ),
    );
    requireFact(
      matches.length === 1,
      "R09 exact own case in one matching canonical product/dimension",
    );
    return matches[0]!;
  });
  for (let left = 0; left < p.cases.length; left++) {
    for (let right = left + 1; right < p.cases.length; right++) {
      if (p.cases[left]!.orderId !== p.cases[right]!.orderId) continue;
      requireFact(
        assignedRows[left] === assignedRows[right],
        "R09 same canonical order keeps one reporting dimension",
      );
    }
  }
  for (let index = 0; index < p.cases.length; index++) {
    const own = p.cases[index]!;
    const createdMonth = creationMonths[index]!;
    const summary = assignedRows[index]!;
    const monthly = summary.drilldown?.complaintMonthlyStatistics ?? [];
    const rows = monthly.filter(
      (entry) =>
        entry.periodMonth === createdMonth && entry.timeZone === "Asia/Taipei",
    );
    requireFact(
      rows.length === 1,
      "R09 canonical creation month in own dimension",
    );
    const row = rows[0]!;
    const split =
      own.source === "lowRatingAuto" ? row.lowRatingAuto : row.manual;
    requireFact(
      split.createdCaseNos.includes(own.caseNo) &&
        (own.source !== "manual" ||
          row.manualByCategory.some(
            (category) =>
              category.category === own.category &&
              category.createdCaseNos.includes(own.caseNo),
          )),
      "R09 exact own case ID in created-source/category split",
    );
    await p.inspectDrilldown(own.caseNo, createdMonth, own.source, {
      businessArea: text(summary.businessArea),
      serviceProductCode: text(summary.serviceProductCode),
    });
  }
  const serviceSummary = assignedRows[p.cases.indexOf(service)]!;
  const closeRow = (
    serviceSummary.drilldown?.complaintMonthlyStatistics ?? []
  ).find((entry) => entry.periodMonth === closureMonth);
  requireFact(
    closeRow?.manual.closedCaseNos.includes(service.caseNo) &&
      closeRow.manualByCategory.some(
        (category) =>
          category.category === "driver_service" &&
          category.closedCaseNos.includes(service.caseNo),
      ),
    "R09 exact own service case in actual closure month",
  );
  await p.inspectClosure(service.caseNo, closureMonth, {
    businessArea: text(serviceSummary.businessArea),
    serviceProductCode: text(serviceSummary.serviceProductCode),
  });
  for (let index = 0; index < p.cases.length; index++) {
    const own = p.cases[index]!;
    const summary = assignedRows[index]!;
    const monthly = summary.drilldown?.complaintMonthlyStatistics ?? [];
    const asOf = summary.complaintStatisticsAsOf;
    requireFact(
      asOf && Number.isFinite(Date.parse(asOf)),
      "R09 own dimension canonical SLA as-of",
    );
    const record =
      index === p.cases.indexOf(service)
        ? closed.record
        : originals[index]!.record;
    const dueMonth = taipeiMonth(record.slaDueAt);
    for (const row of monthly) {
      const split =
        own.source === "lowRatingAuto" ? row.lowRatingAuto : row.manual;
      const expected =
        row.periodMonth === dueMonth &&
        Date.parse(record.slaDueAt) <= Date.parse(asOf) &&
        record.status !== "closed";
      requireFact(
        split.overdueCaseNos.includes(own.caseNo) === expected,
        "R09 overdue from canonical SLA/status/as-of only",
      );
    }
  }
  return {
    caseNos: p.cases.map((own) => own.caseNo),
    serviceCaseNo: service.caseNo,
    closureMonth,
    from,
    to,
    auditId: closed.auditId,
    uiCommandSender: {
      realm: p.role.realm,
      principalId: p.role.principalId,
      verifiedSameSession: true,
    },
    serverAuditActorIds: {
      assign: assignment.auditActorId,
      notes: note.auditActorId,
      resolve: resolved.auditActorId,
      close: closed.auditActorId,
    },
    missingServerActorAttributionActions: [
      ...(resolved.auditActorId === null ? ["resolve"] : []),
      ...(closed.auditActorId === null ? ["close"] : []),
    ],
  };
}
