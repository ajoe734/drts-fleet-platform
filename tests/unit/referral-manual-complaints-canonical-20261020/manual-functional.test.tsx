// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { manualWire } from "./fixture";
import { domainFixture } from "../referral-embed-verified-session-canonical-journey-20261015/domain-fixture";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  delete (globalThis as any).__cancellationPorts;
});
const cases = (f: any) => f.db.table("crm.phase1_complaint_cases");
const timelines = (f: any) => f.db.table("crm.phase1_complaint_timelines");
async function submit(f: any, command: any) {
  return (
    await f.controller.submitReferralPassengerComplaint(
      f.orderId,
      command,
      f.identity,
      "actual-controlled-submit",
    )
  ).data;
}
async function open(f: any) {
  const view = render(await f.page());
  fireEvent.click(screen.getByRole("button", { name: "行程申訴與遺失物" }));
  await screen.findByText("尚無手動申訴案件。");
  return view;
}
function form() {
  return within(screen.getByRole("form", { name: "提出行程申訴" }));
}
function fill(category = "service") {
  fireEvent.change(form().getByLabelText("申訴類別"), {
    target: { value: category },
  });
  fireEvent.change(form().getByLabelText("申訴內容"), {
    target: { value: "原同單文字申訴" },
  });
  if (category === "lost_item")
    fireEvent.change(form().getByLabelText("遺失物描述"), {
      target: { value: "黑色背包" },
    });
}
it.each([
  ["service", "driver_service"],
  ["fare", "fare_dispute"],
  ["lost_item", "lost_and_found"],
] as const)(
  "actual controller/repositories commit %s with original %s CRM mapping/contactfalse/transaction",
  async (category, crm) => {
    const f = await manualWire();
    const before = await f.stored();
    if (!before) throw new Error("Original order missing");
    const result = await submit(f, f.command(category));
    expect(result).toMatchObject({
      orderId: f.orderId,
      category,
      content: "原同單文字申訴",
      contactRequested: false,
      status: "new",
    });
    const stored = await f.stored();
    if (!stored?.referralPassengerLifecycle)
      throw new Error("Original lifecycle missing");
    expect(stored.referralPassengerLifecycle.complaints).toHaveLength(1);
    expect(stored.referralPassengerLifecycle.rating).toEqual(
      before.referralPassengerLifecycle?.rating,
    );
    expect(cases(f).get(result.caseNo)).toMatchObject({
      caseNo: result.caseNo,
      relatedOrderId: f.orderId,
      category: crm,
      status: "new",
    });
    expect(cases(f).get(result.caseNo).description).toContain(
      "同意客服聯繫：否",
    );
    expect(timelines(f).size).toBe(1);
    const writes = f.db.calls.filter(
      (c: any) =>
        c.sql.startsWith("INSERT INTO crm.phase1_complaint") ||
        c.sql.startsWith("INSERT INTO ops.phase1_owned_orders"),
    );
    const lastOrder = writes
      .filter((c: any) =>
        c.sql.startsWith("INSERT INTO ops.phase1_owned_orders"),
      )
      .at(-1);
    if (!lastOrder) throw new Error("Actual order write missing");
    expect(
      writes
        .filter((c: any) =>
          c.sql.startsWith("INSERT INTO crm.phase1_complaint"),
        )
        .every(
          (c: any) =>
            c.transaction === lastOrder.transaction && c.transaction !== null,
        ),
    ).toBe(true);
    expect(
      f.db.calls.some((c: any) =>
        /passenger\.(accounts|booking_histories|complaints)/.test(c.sql),
      ),
    ).toBe(false);
  },
);
it("same original key/body survives fresh service; changed body conflicts; distinct keys remain distinct legitimate cases", async () => {
  const f = await manualWire();
  const command = f.command();
  const a = await submit(f, command);
  const fresh = f.newService();
  expect(
    await fresh.submitReferralPassengerComplaint(
      f.orderId,
      command,
      f.identity,
    ),
  ).toEqual(a);
  expect(cases(f).size).toBe(1);
  await expect(
    fresh.submitReferralPassengerComplaint(
      f.orderId,
      { ...command, content: "changed" },
      f.identity,
    ),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_PAYLOAD_MISMATCH" });
  const b = await submit(f, {
    ...command,
    idempotencyKey: crypto.randomUUID(),
  });
  expect(b.caseNo).not.toBe(a.caseNo);
  expect(cases(f).size).toBe(2);
});
it.each([
  "INSERT INTO crm.phase1_complaint_cases",
  "INSERT INTO ops.phase1_owned_orders",
])(
  "real %s rejection rolls back case/timeline/link and no accepted receipt",
  async (sql) => {
    const f = await manualWire();
    const before = await f.stored();
    f.db.failSql = new RegExp(sql);
    await expect(submit(f, f.command())).rejects.toThrow(
      "controlled storage write failure",
    );
    f.db.failSql = null;
    expect(await f.stored()).toEqual(before);
    expect(cases(f).size).toBe(0);
    expect(timelines(f).size).toBe(0);
  },
);
it("lost COMMIT ACK is an error first; canonical readback and identical retry recover the same one case without a second insert", async () => {
  const f = await manualWire();
  const command = f.command("lost_item");
  f.db.commitAckLost = true;
  await expect(submit(f, command)).rejects.toThrow(
    "controlled lost COMMIT ACK",
  );
  expect(cases(f).size).toBe(1);
  const fresh = f.newService();
  const list = await fresh.listReferralPassengerComplaints(
    f.orderId,
    f.identity,
  );
  expect(list.items).toHaveLength(1);
  const result = await fresh.submitReferralPassengerComplaint(
    f.orderId,
    command,
    f.identity,
  );
  expect(result.caseNo).toBe(list.items[0]!.caseNo);
  expect(cases(f).size).toBe(1);
  expect(timelines(f).size).toBe(1);
});
it("read error/current CRM status use authoritative repository instead of a private accepted cache", async () => {
  const f = await manualWire();
  const result = await submit(f, f.command());
  const row = cases(f).get(result.caseNo);
  cases(f).set(result.caseNo, {
    ...row,
    status: "resolved",
    updatedAt: "2026-10-21T01:00:00Z",
  });
  expect(
    await f
      .newService()
      .getReferralPassengerComplaint(f.orderId, result.caseNo, f.identity),
  ).toMatchObject({ status: "resolved", updatedAt: "2026-10-21T01:00:00Z" });
  f.db.failSql = /FROM crm\.phase1_complaint_cases/;
  await expect(
    f.service.listReferralPassengerComplaints(f.orderId, f.identity),
  ).rejects.toThrow("controlled storage write failure");
});
it("two genuine existing Referral subjects cannot submit/read the other original order/case", async () => {
  const f = await domainFixture();
  const first = await f.identity("manual-first"),
    second = await f.identity("manual-second");
  const ack = await f.service.createReferralPassengerBooking(
    await f.command(first),
    first,
  );
  const command = {
    orderId: ack.orderId,
    category: "fare" as const,
    content: "原單車資",
    contactRequested: false,
    idempotencyKey: crypto.randomUUID(),
  };
  const result = await f.service.submitReferralPassengerComplaint(
    ack.orderId,
    command,
    first,
  );
  await expect(
    f.service.submitReferralPassengerComplaint(
      ack.orderId,
      { ...command, idempotencyKey: crypto.randomUUID() },
      second,
    ),
  ).rejects.toMatchObject({ code: "PARTNER_SCOPE_MISMATCH" });
  await expect(
    f.service.listReferralPassengerComplaints(ack.orderId, second),
  ).rejects.toMatchObject({ code: "PARTNER_SCOPE_MISMATCH" });
  await expect(
    f.service.getReferralPassengerComplaint(ack.orderId, result.caseNo, second),
  ).rejects.toMatchObject({ code: "PARTNER_SCOPE_MISMATCH" });
});
it.each([
  { category: "lost_item", lostItemDescription: undefined },
  { category: "service", lostItemDescription: "not this category" },
  { contactRequested: undefined },
  { content: "" },
])(
  "original required input rules reject %j without creating an accepted case",
  async (invalid) => {
    const f = await manualWire();
    await expect(
      submit(f, f.command("service", invalid)),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(cases(f).size).toBe(0);
  },
);
it.each(["service", "fare", "lost_item"] as const)(
  "actual mounted %s form traverses serializer/BFF/deepCamel and shows real ACK/list/detail",
  async (category) => {
    const f = await manualWire();
    await open(f);
    fill(category);
    expect(
      (form().getByLabelText("需要客服聯絡") as HTMLInputElement).checked,
    ).toBe(false);
    fireEvent.submit(screen.getByRole("form", { name: "提出行程申訴" }));
    await screen.findByText(/案件已建立：/);
    expect(cases(f).size).toBe(1);
    const caseNo = [...cases(f).keys()][0] as string;
    fireEvent.click(screen.getByRole("button", { name: `查看案件 ${caseNo}` }));
    await waitFor(() =>
      expect(
        screen.getByRole("article", { name: "申訴案件詳情" }).textContent,
      ).toContain(caseNo),
    );
    expect(
      screen.getByRole("article", { name: "申訴案件詳情" }).textContent,
    ).toContain("已記錄不需客服聯絡");
    expect(
      f.wires.some(
        (wire: any) =>
          wire.method === "POST" &&
          wire.body.data.case_no === caseNo &&
          wire.body.data.contact_requested === false,
      ),
    ).toBe(true);
    await waitFor(() =>
      expect(
        f.calls.some(
          (call: any) =>
            call.path.includes(`/complaints/${encodeURIComponent(caseNo)}`) &&
            call.method === "GET",
        ),
      ).toBe(true),
    );
    expect((await f.stored())!.status).toBe("completed");
  },
);
it("lost response/remount retains exact original fields/body/key and does not automatically create a second case", async () => {
  const f = await manualWire();
  let view = await open(f);
  fill("lost_item");
  f.loseResponse();
  fireEvent.submit(screen.getByRole("form", { name: "提出行程申訴" }));
  await screen.findByRole("alert");
  expect(cases(f).size).toBe(1);
  const first = f.calls.find(
    (call: any) =>
      call.method === "POST" &&
      call.path.startsWith("/api/referral/complaints/"),
  )!.body as Record<string, unknown>;
  expect(first).toMatchObject({
    category: "lost_item",
    content: "原同單文字申訴",
    lostItemDescription: "黑色背包",
    contactRequested: false,
  });
  view.unmount();
  view = render(await f.page());
  fireEvent.click(screen.getByRole("button", { name: "行程申訴與遺失物" }));
  await screen.findByRole("button", { name: "重送原申訴" });
  expect((form().getByLabelText("申訴內容") as HTMLTextAreaElement).value).toBe(
    first.content,
  );
  expect(
    (form().getByLabelText("遺失物描述") as HTMLTextAreaElement).value,
  ).toBe(first.lostItemDescription);
  expect(
    f.calls.filter(
      (call: any) =>
        call.method === "POST" &&
        call.path.startsWith("/api/referral/complaints/"),
    ),
  ).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "重送原申訴" }));
  await screen.findByText(/案件已建立：/);
  const posts = f.calls.filter(
    (call: any) =>
      call.method === "POST" &&
      call.path.startsWith("/api/referral/complaints/"),
  );
  expect(posts[1]!.body).toEqual(first);
  expect(cases(f).size).toBe(1);
  expect(timelines(f).size).toBe(1);
});
it("a real storage rejection retains draft/key; explicit same request retries only after storage recovers", async () => {
  const f = await manualWire();
  await open(f);
  fill("fare");
  f.db.failSql = /INSERT INTO crm\.phase1_complaint_cases/;
  fireEvent.submit(screen.getByRole("form", { name: "提出行程申訴" }));
  await screen.findByRole("alert");
  expect(cases(f).size).toBe(0);
  expect(screen.queryByText(/案件已建立：/)).toBeNull();
  const first = f.calls.find(
    (call: any) =>
      call.method === "POST" &&
      call.path.startsWith("/api/referral/complaints/"),
  )!.body as Record<string, unknown>;
  f.db.failSql = null;
  fireEvent.click(screen.getByRole("button", { name: "重送原申訴" }));
  await screen.findByText(/案件已建立：/);
  expect(
    f.calls
      .filter(
        (call: any) =>
          call.method === "POST" &&
          call.path.startsWith("/api/referral/complaints/"),
      )
      .at(-1)!.body,
  ).toEqual(first);
  expect(cases(f).size).toBe(1);
});
it("case detail and refresh show current status without another submission; real read failure is not an empty list", async () => {
  const f = await manualWire();
  const result = await submit(f, f.command("fare"));
  render(await f.page());
  fireEvent.click(screen.getByRole("button", { name: "行程申訴與遺失物" }));
  await screen.findByRole("button", { name: `查看案件 ${result.caseNo}` });
  const row = cases(f).get(result.caseNo);
  cases(f).set(result.caseNo, {
    ...row,
    status: "resolved",
    updatedAt: "2026-10-21T01:00:00Z",
  });
  fireEvent.click(
    screen.getByRole("button", { name: `查看案件 ${result.caseNo}` }),
  );
  await screen.findByText("狀態：已處理");
  const postCount = f.calls.filter(
    (call: any) => call.method === "POST",
  ).length;
  f.db.failSql = /FROM crm\.phase1_complaint_cases/;
  fireEvent.click(screen.getByRole("button", { name: "重新讀取案件" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("尚無手動申訴案件。")).toBeNull();
  expect(f.calls.filter((call: any) => call.method === "POST")).toHaveLength(
    postCount,
  );
});
it("low rating automatic case remains separate from voluntary manual cases and original rating immutable replay", async () => {
  const f = await manualWire();
  const rating = {
    orderId: f.orderId,
    score: 2 as const,
    contactRequested: false,
    idempotencyKey: crypto.randomUUID(),
  };
  const automatic = await f.service.submitReferralPassengerRating(
    f.orderId,
    rating,
    f.identity,
  );
  const manual = await submit(f, f.command("fare"));
  expect(manual.caseNo).not.toBe(automatic.complaintCaseNo);
  expect(cases(f).size).toBe(2);
  expect(
    (
      await f.service.listReferralPassengerComplaints(f.orderId, f.identity)
    ).items.map((c: any) => c.caseNo),
  ).toEqual([manual.caseNo]);
  expect(
    await f.service.submitReferralPassengerRating(
      f.orderId,
      rating,
      f.identity,
    ),
  ).toEqual(automatic);
  expect(cases(f).size).toBe(2);
});

it("same subject owning two real orders cannot join a case under the wrong order", async () => {
  const f = await domainFixture(),
    identity = await f.identity();
  const first = await f.service.createReferralPassengerBooking(
    await f.command(identity),
    identity,
  );
  const second = await f.service.createReferralPassengerBooking(
    await f.command(identity),
    identity,
  );
  const command = {
    orderId: first.orderId,
    category: "service" as const,
    content: "第一筆行程",
    contactRequested: false,
    idempotencyKey: crypto.randomUUID(),
  };
  const accepted = await f.service.submitReferralPassengerComplaint(
    first.orderId,
    command,
    identity,
  );
  expect(
    (await f.service.listReferralPassengerComplaints(second.orderId, identity))
      .items,
  ).toEqual([]);
  await expect(
    f.service.getReferralPassengerComplaint(
      second.orderId,
      accepted.caseNo,
      identity,
    ),
  ).rejects.toMatchObject({ code: "COMPLAINT_NOT_FOUND" });
  await expect(
    f.service.submitReferralPassengerComplaint(
      second.orderId,
      command,
      identity,
    ),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  expect(f.db.table("crm.phase1_complaint_cases").size).toBe(1);
});
it("DETAIL_RACE actual earlier case response cannot overwrite a newer selected case", async () => {
  const f = await manualWire();
  const first = await submit(
      f,
      f.command("service", { content: "第一件原文" }),
    ),
    second = await submit(f, f.command("fare", { content: "第二件原文" }));
  render(await f.page());
  fireEvent.click(screen.getByRole("button", { name: "行程申訴與遺失物" }));
  await screen.findByRole("button", { name: `查看案件 ${second.caseNo}` });
  const transport = f.fetch.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  let arrived!: () => void;
  const done = new Promise<void>((r) => {
    arrived = r;
  });
  f.fetch.mockImplementation(async (...args) => {
    const result = await transport(...args);
    if (String(args[0]).endsWith("/" + encodeURIComponent(first.caseNo))) {
      await held;
      arrived();
    }
    return result;
  });
  fireEvent.click(
    screen.getByRole("button", { name: `查看案件 ${first.caseNo}` }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: `查看案件 ${second.caseNo}` }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("article", { name: "申訴案件詳情" }).textContent,
    ).toContain("第二件原文"),
  );
  await act(async () => {
    release();
    await done;
  });
  expect(
    screen.getByRole("article", { name: "申訴案件詳情" }).textContent,
  ).toContain("第二件原文");
  expect(
    screen.getByRole("article", { name: "申訴案件詳情" }).textContent,
  ).not.toContain("第一件原文");
});

it("actual optional command header binds the same ordinary body key without another create identity", async () => {
  const f = await manualWire(),
    command = f.command();
  await expect(
    f.controller.submitReferralPassengerComplaint(
      f.orderId,
      command,
      f.identity,
      "unit-header",
      "different-key",
    ),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  expect(cases(f).size).toBe(0);
  const result = await f.controller.submitReferralPassengerComplaint(
    f.orderId,
    command,
    f.identity,
    "unit-header",
    command.idempotencyKey,
  );
  expect(result.data.idempotencyKey).toBe(command.idempotencyKey);
  expect(cases(f).size).toBe(1);
});
