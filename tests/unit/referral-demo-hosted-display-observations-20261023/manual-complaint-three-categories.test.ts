import { describe, expect, it } from "vitest";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import {
  MANUAL_COMPLAINT_CATEGORIES,
  observeManualComplaintCategories,
  submitSyntheticComplaint,
  type DisplayObservationsParams,
  type ManualComplaintCategory,
  type SyntheticComplaintOptions,
} from "../../e2e/owned-referral-business-journey/display-observations";
import { Evidence } from "../../e2e/owned-referral-business-journey/protocol";

// P5 fare / P6 service / P7 lost_item: these fakes model only the external
// UI/Request/Response ports the helpers call, following the panel in
// apps/referral-embed-web/components/referral-complaint-panel.tsx (category
// <select>, content/lost-item <textarea>s, submit/reload/view-case buttons,
// detail <article>). They do not prove hosted DOM, network or PG behavior.

const ORIGIN = "https://referral.example.test";
const ORDER_ID = "order-completed";
const COMPLAINTS_URL = `${ORIGIN}/api/referral/complaints/${ORDER_ID}`;
const LOST_ITEM =
  "display-observations synthetic test item; not a real lost item";

const OPTION_VALUES: Record<string, ManualComplaintCategory> = {
  服務申訴: "service",
  車資申訴: "fare",
  遺失物: "lost_item",
};
const ZH_LABELS: Record<ManualComplaintCategory, string> = {
  service: "服務申訴",
  fare: "車資申訴",
  lost_item: "遺失物",
};
// The <label> wrapping the <select> also contains the option texts.
const CATEGORY_LABEL_TEXT = "申訴類別服務申訴車資申訴遺失物";

type Body = Record<string, unknown>;
type CaseRecord = {
  orderId: string;
  caseNo: string;
  category: ManualComplaintCategory;
  content: string;
  lostItemDescription: string | null;
  contactRequested: boolean;
  idempotencyKey: string;
  submittedAt: string;
  status: string;
  updatedAt: string;
};
type RequestListener = (request: FakeRequest) => void;
type ResponseListener = (response: FakeResponse) => void;

class FakeResponse {
  constructor(
    private readonly urlValue: string,
    private readonly methodValue: string,
    private readonly payload: unknown,
    private readonly okValue = true,
    private readonly duringJson?: () => void,
  ) {}
  url(): string {
    return this.urlValue;
  }
  request() {
    return { method: () => this.methodValue };
  }
  ok(): boolean {
    return this.okValue;
  }
  async json(): Promise<unknown> {
    this.duringJson?.();
    await Promise.resolve();
    return this.payload;
  }
}

class FakeRequest {
  private settled = false;
  private settledResponse: FakeResponse | null = null;
  private waiters: Array<(value: FakeResponse | null) => void> = [];
  constructor(
    private readonly urlValue: string,
    readonly body: Body,
  ) {}
  url(): string {
    return this.urlValue;
  }
  method(): string {
    return "POST";
  }
  postDataJSON(): unknown {
    return this.body;
  }
  response(): Promise<FakeResponse | null> {
    if (this.settled) return Promise.resolve(this.settledResponse);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  resolveResponse(response: FakeResponse | null): void {
    this.settled = true;
    this.settledResponse = response;
    for (const waiter of this.waiters) waiter(response);
    this.waiters = [];
  }
}

function taipeiStamp(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}（臺北時間）`;
}

type PanelOptions = {
  // UI ignores the selection (stale control) while reporting the requested value.
  selectorNoop?: boolean;
  // Extra fields the (buggy) UI would add to every command body.
  extraBody?: Body;
  // Server-side handling of each POST; defaults to a matching ACK.
  onPost?: (panel: FakePanel, request: FakeRequest) => void;
  // Rewrites the detail read for a case.
  detailOverride?: (record: CaseRecord) => CaseRecord;
};

class FakePanel {
  category: ManualComplaintCategory = "service";
  content = "";
  lost = "";
  readonly cases: CaseRecord[] = [];
  readonly posts: FakeRequest[] = [];
  readonly selectedLabels: string[] = [];
  detail: CaseRecord | null = null;
  private sequence = 0;
  private requestListeners: RequestListener[] = [];
  private responseListeners: ResponseListener[] = [];

  constructor(private readonly options: PanelOptions = {}) {}

  // --- Page port ---
  getByLabel(label: string | RegExp, opts?: { exact?: boolean }) {
    if (label instanceof RegExp && label.test(CATEGORY_LABEL_TEXT)) {
      return {
        selectOption: async ({ label: option }: { label: string }) => {
          const value = OPTION_VALUES[option];
          if (value === undefined) throw new Error(`no option ${option}`);
          this.selectedLabels.push(option);
          if (!this.options.selectorNoop) this.category = value;
          return [value];
        },
        inputValue: async () => this.category,
      };
    }
    if (label === "申訴內容" && opts?.exact) {
      return {
        fill: async (value: string) => {
          this.content = value;
        },
      };
    }
    if (label === "遺失物描述" && opts?.exact) {
      return {
        count: async () => (this.category === "lost_item" ? 1 : 0),
        fill: async (value: string) => {
          if (this.category !== "lost_item")
            throw new Error("lost item field not rendered");
          this.lost = value;
        },
      };
    }
    throw new Error(`unrecognized label ${String(label)}`);
  }

  getByRole(role: string, { name }: { name: string; exact?: boolean }) {
    if (role === "button" && name === "送出申訴")
      return { click: async () => this.submit() };
    if (role === "button" && name === "重新讀取案件")
      return { click: async () => this.emitList() };
    if (role === "button" && name.startsWith("查看案件 "))
      return { click: async () => this.view(name.slice("查看案件 ".length)) };
    if (role === "article" && name === "申訴案件詳情") return this.article();
    throw new Error(`unrecognized role ${role} ${name}`);
  }

  on(event: string, listener: RequestListener): void {
    if (event === "request") this.requestListeners.push(listener);
  }
  off(event: string, listener: RequestListener): void {
    if (event === "request")
      this.requestListeners = this.requestListeners.filter(
        (l) => l !== listener,
      );
  }
  waitForRequest(
    predicate: (request: FakeRequest) => boolean,
  ): Promise<FakeRequest> {
    return new Promise((resolve) => {
      const listener: RequestListener = (request) => {
        if (predicate(request)) {
          this.off("request", listener);
          resolve(request);
        }
      };
      this.on("request", listener);
    });
  }
  waitForResponse(
    predicate: (response: FakeResponse) => boolean,
  ): Promise<FakeResponse> {
    return new Promise((resolve) => {
      const listener: ResponseListener = (response) => {
        if (predicate(response)) {
          this.responseListeners = this.responseListeners.filter(
            (l) => l !== listener,
          );
          resolve(response);
        }
      };
      this.responseListeners.push(listener);
    });
  }

  // --- Scenario helpers ---
  emitRequest(request: FakeRequest): void {
    for (const listener of [...this.requestListeners]) listener(request);
  }
  record(body: Body, overrides: Partial<CaseRecord> = {}): CaseRecord {
    this.sequence += 1;
    const minute = String(this.sequence).padStart(2, "0");
    return {
      orderId: String(body.orderId),
      caseNo: `CASE-${String(body.category)}-${this.sequence}`,
      category: body.category as ManualComplaintCategory,
      content: String(body.content),
      lostItemDescription:
        typeof body.lostItemDescription === "string"
          ? body.lostItemDescription
          : null,
      contactRequested: body.contactRequested as boolean,
      idempotencyKey: String(body.idempotencyKey),
      submittedAt: `2026-10-28T01:${minute}:00.000Z`,
      status: "new",
      updatedAt: `2026-10-28T02:${minute}:00.000Z`,
      ...overrides,
    };
  }
  ack(request: FakeRequest, record: CaseRecord, duringJson?: () => void) {
    if (!this.cases.some((item) => item.caseNo === record.caseNo))
      this.cases.push(record);
    queueMicrotask(() => {
      this.detail = record;
      this.content = "";
      this.lost = "";
      request.resolveResponse(
        new FakeResponse(
          request.url(),
          "POST",
          { ok: true, data: record },
          true,
          duringJson,
        ),
      );
    });
  }

  private emitResponse(response: FakeResponse): void {
    for (const listener of [...this.responseListeners]) listener(response);
  }
  private submit(): void {
    const body: Body = {
      orderId: ORDER_ID,
      category: this.category,
      content: this.content.trim(),
      contactRequested: false,
      ...(this.category === "lost_item"
        ? { lostItemDescription: this.lost.trim() }
        : {}),
      idempotencyKey: `key-${this.posts.length + 1}-${this.category}`,
      ...this.options.extraBody,
    };
    const request = new FakeRequest(COMPLAINTS_URL, body);
    this.posts.push(request);
    this.emitRequest(request);
    if (this.options.onPost) this.options.onPost(this, request);
    else this.ack(request, this.record(body));
  }
  private emitList(): void {
    const snapshot = this.cases.map((item) => ({ ...item }));
    queueMicrotask(() =>
      this.emitResponse(
        new FakeResponse(COMPLAINTS_URL, "GET", {
          ok: true,
          data: { orderId: ORDER_ID, items: snapshot },
        }),
      ),
    );
  }
  private view(caseNo: string): void {
    const found = this.cases.find((item) => item.caseNo === caseNo);
    if (!found) throw new Error(`no listed case ${caseNo}`);
    const record = this.options.detailOverride?.(found) ?? found;
    this.detail = record;
    queueMicrotask(() =>
      this.emitResponse(
        new FakeResponse(`${COMPLAINTS_URL}/${caseNo}`, "GET", {
          ok: true,
          data: record,
        }),
      ),
    );
  }
  private detailLines(): string[] {
    const detail = this.detail;
    if (!detail) return [];
    return [
      detail.caseNo,
      `行程：${detail.orderId}`,
      `類別：${ZH_LABELS[detail.category]}`,
      `狀態：已建立`,
      detail.content,
      ...(detail.lostItemDescription
        ? [`遺失物：${detail.lostItemDescription}`]
        : []),
      detail.contactRequested ? "已記錄需要客服聯絡" : "已記錄不需客服聯絡",
      `送出時間：${taipeiStamp(detail.submittedAt)}`,
      `案件更新：${taipeiStamp(detail.updatedAt)}`,
    ];
  }
  private article() {
    return {
      waitFor: async () => {
        if (!this.detail) throw new Error("detail article not rendered");
      },
      getByText: (matcher: string | RegExp, opts?: { exact?: boolean }) => {
        const find = () =>
          this.detailLines().find((line) =>
            matcher instanceof RegExp
              ? matcher.test(line)
              : opts?.exact
                ? line === matcher
                : line.includes(matcher),
          );
        return {
          waitFor: async () => {
            if (find() === undefined)
              throw new Error(`detail line ${String(matcher)} not visible`);
          },
          innerText: async () => {
            const line = find();
            if (line === undefined) throw new Error("detail line missing");
            return line;
          },
        };
      },
    };
  }
}

function makeParams(
  page: FakePanel,
  directory: string,
): DisplayObservationsParams {
  return {
    page: page as unknown as Page,
    referral: async () => {
      throw new Error("direct API use is not allowed in these tests");
    },
    evidence: new Evidence(),
    referralOrigin: ORIGIN,
    entrySlug: "demo-entry",
    entryHost: "demo.example.test",
    completedOrderId: ORDER_ID,
    unassignedCancelledOrderId: undefined,
    nonce: "nonce-p5p7",
    directory,
    definitionSha: "a".repeat(40),
    runtimeSha: "b".repeat(40),
  };
}

function optionsFor(
  category: ManualComplaintCategory,
): SyntheticComplaintOptions {
  return category === "lost_item"
    ? { category, lostItemDescription: LOST_ITEM }
    : { category };
}

function journalPath(directory: string, category?: ManualComplaintCategory) {
  return join(
    directory,
    "cancellations",
    category
      ? `manual-complaint-command-${category}-facts.json`
      : "manual-complaint-command-facts.json",
  );
}

async function readJournal(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function withDirectory(
  prefix: string,
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function seedExistingServiceCase(panel: FakePanel): CaseRecord {
  const existing = panel.record({
    orderId: ORDER_ID,
    category: "service",
    content: "earlier case",
    contactRequested: false,
    idempotencyKey: "key-earlier",
  });
  panel.cases.push(existing);
  return existing;
}

describe("observeManualComplaintCategories (P5/P6/P7 explicit UI submissions)", () => {
  it("submits service, fare and lost_item once each through the selected UI control, with separate journals and same-order readbacks", async () => {
    await withDirectory("p5p7-good-", async (directory) => {
      const panel = new FakePanel();
      const existing = seedExistingServiceCase(panel);
      const observations = await observeManualComplaintCategories(
        makeParams(panel, directory),
        ORDER_ID,
      );

      expect(observations.map((o) => o.category)).toEqual([
        "service",
        "fare",
        "lost_item",
      ]);
      expect(panel.selectedLabels).toEqual(["服務申訴", "車資申訴", "遺失物"]);
      expect(panel.posts).toHaveLength(3);
      const caseNos = observations.map((o) => o.caseNo);
      expect(new Set(caseNos).size).toBe(3);
      expect(caseNos).not.toContain(existing.caseNo);
      expect(new Set(observations.map((o) => o.idempotencyKey)).size).toBe(3);

      for (const [index, category] of MANUAL_COMPLAINT_CATEGORIES.entries()) {
        const body = panel.posts[index]!.body;
        const observed = observations[index]!;
        expect(body.category).toBe(category);
        expect(body.orderId).toBe(ORDER_ID);
        expect(body.contactRequested).toBe(false);
        expect(body.content).toBe(
          `display-observations nonce-p5p7 ${category} synthetic test complaint; no contact requested`,
        );
        if (category === "lost_item")
          expect(body.lostItemDescription).toBe(LOST_ITEM);
        else expect(Object.hasOwn(body, "lostItemDescription")).toBe(false);

        expect(observed.journalPath).toBe(journalPath(directory, category));
        const journal = await readJournal(observed.journalPath);
        expect(journal).toMatchObject({
          state: "acknowledged",
          orderId: ORDER_ID,
          category,
          idempotencyKey: body.idempotencyKey,
          caseNo: observed.caseNo,
          bodySha256: observed.bodySha256,
          definitionSha: "a".repeat(40),
          runtimeSha: "b".repeat(40),
        });
        expect(journal.requestBody).toEqual(body);
      }
      // The original service-default journal is a separate path, untouched.
      expect(await exists(journalPath(directory))).toBe(false);
    });
  });

  it("documents the gap: the original two-argument helper never selects a category and only yields one service command", async () => {
    await withDirectory("p5p7-legacy-", async (directory) => {
      const panel = new FakePanel();
      const result = await submitSyntheticComplaint(
        makeParams(panel, directory),
        ORDER_ID,
      );
      expect(panel.selectedLabels).toEqual([]);
      expect(panel.posts).toHaveLength(1);
      expect(panel.posts[0]!.body.category).toBe("service");
      expect(result.journalPath).toBe(journalPath(directory));
      for (const category of MANUAL_COMPLAINT_CATEGORIES)
        expect(await exists(journalPath(directory, category))).toBe(false);
    });
  });

  it("keeps earlier category journals when a later category's ACK is unknown", async () => {
    await withDirectory("p5p7-partial-", async (directory) => {
      const panel = new FakePanel({
        onPost: (fake, request) => {
          if (request.body.category === "lost_item")
            queueMicrotask(() => request.resolveResponse(null));
          else fake.ack(request, fake.record(request.body));
        },
      });
      await expect(
        observeManualComplaintCategories(
          makeParams(panel, directory),
          ORDER_ID,
        ),
      ).rejects.toThrow("no response");
      expect(panel.posts).toHaveLength(3);
      for (const category of ["service", "fare"] as const)
        expect(
          await readJournal(journalPath(directory, category)),
        ).toMatchObject({ state: "acknowledged", category });
      const lost = await readJournal(journalPath(directory, "lost_item"));
      expect(lost).toMatchObject({
        state: "ack_unknown",
        category: "lost_item",
      });
      expect(lost.requestBody).toEqual(panel.posts[2]!.body);
    });
  });

  it("rejects an ACK that reuses an already-listed case number", async () => {
    await withDirectory("p5p7-reuse-", async (directory) => {
      let reusedCaseNo = "";
      const panel = new FakePanel({
        onPost: (fake, request) =>
          fake.ack(
            request,
            fake.record(request.body, { caseNo: reusedCaseNo }),
          ),
      });
      reusedCaseNo = seedExistingServiceCase(panel).caseNo;
      await expect(
        observeManualComplaintCategories(
          makeParams(panel, directory),
          ORDER_ID,
        ),
      ).rejects.toThrow("not an already-listed one");
    });
  });

  it("rejects a detail readback whose category does not match the submitted category", async () => {
    await withDirectory("p5p7-detail-", async (directory) => {
      const panel = new FakePanel({
        detailOverride: (record) =>
          record.category === "fare"
            ? { ...record, category: "service" }
            : record,
      });
      await expect(
        observeManualComplaintCategories(
          makeParams(panel, directory),
          ORDER_ID,
        ),
      ).rejects.toThrow("fare manual case detail");
    });
  });

  it("rejects a detail readback bound to a different case number", async () => {
    await withDirectory("p5p7-detail-case-", async (directory) => {
      const panel = new FakePanel({
        detailOverride: (record) => ({ ...record, caseNo: "CASE-OTHER" }),
      });
      await expect(
        observeManualComplaintCategories(
          makeParams(panel, directory),
          ORDER_ID,
        ),
      ).rejects.toThrow("service manual case detail");
    });
  });
});

describe("submitSyntheticComplaint with an explicit category", () => {
  for (const category of MANUAL_COMPLAINT_CATEGORIES) {
    describe(category, () => {
      it("rejects a second same-URL POST echoing the same order/key (wrong-request)", async () => {
        await withDirectory(`p5p7-wrong-${category}-`, async (directory) => {
          const panel = new FakePanel({
            onPost: (fake, original) => {
              const duplicate = new FakeRequest(COMPLAINTS_URL, {
                ...original.body,
              });
              fake.emitRequest(duplicate);
              const record = fake.record(original.body);
              duplicate.resolveResponse(
                new FakeResponse(COMPLAINTS_URL, "POST", {
                  ok: true,
                  data: { ...record, caseNo: "CASE-WRONG" },
                }),
              );
              fake.ack(original, record);
            },
          });
          await expect(
            submitSyntheticComplaint(
              makeParams(panel, directory),
              ORDER_ID,
              optionsFor(category),
            ),
          ).rejects.toThrow("exactly one same-order manual complaint POST");
          expect(
            await readJournal(journalPath(directory, category)),
          ).toMatchObject({ state: "ack_unknown", category });
        });
      });

      it("rejects a duplicate POST that arrives while awaiting the JSON body (late-duplicate)", async () => {
        await withDirectory(`p5p7-late-${category}-`, async (directory) => {
          const panel = new FakePanel({
            onPost: (fake, original) =>
              fake.ack(original, fake.record(original.body), () =>
                fake.emitRequest(
                  new FakeRequest(COMPLAINTS_URL, { ...original.body }),
                ),
              ),
          });
          await expect(
            submitSyntheticComplaint(
              makeParams(panel, directory),
              ORDER_ID,
              optionsFor(category),
            ),
          ).rejects.toThrow("exactly one same-order manual complaint POST");
          expect(
            await readJournal(journalPath(directory, category)),
          ).toMatchObject({ state: "ack_unknown", category });
        });
      });

      it("retains a recoverable unknown-ACK journal when the POST has no response", async () => {
        await withDirectory(`p5p7-unknown-${category}-`, async (directory) => {
          const panel = new FakePanel({
            onPost: (_fake, request) =>
              queueMicrotask(() => request.resolveResponse(null)),
          });
          const params = makeParams(panel, directory);
          await expect(
            submitSyntheticComplaint(params, ORDER_ID, optionsFor(category)),
          ).rejects.toThrow("no response");
          const journal = await readJournal(journalPath(directory, category));
          expect(journal).toMatchObject({
            state: "ack_unknown",
            category,
            idempotencyKey: panel.posts[0]!.body.idempotencyKey,
          });
          expect(journal.requestBody).toEqual(panel.posts[0]!.body);
          expect(journal).not.toHaveProperty("caseNo");

          // The retained command is never replaced by a new one.
          await expect(
            submitSyntheticComplaint(params, ORDER_ID, optionsFor(category)),
          ).rejects.toThrow("do not resend");
          expect(panel.posts).toHaveLength(1);
        });
      });

      it("rejects an ACK whose category differs from the selected category", async () => {
        await withDirectory(`p5p7-ackcat-${category}-`, async (directory) => {
          const wrong = category === "fare" ? "service" : "fare";
          const panel = new FakePanel({
            onPost: (fake, request) =>
              fake.ack(request, fake.record(request.body, { category: wrong })),
          });
          await expect(
            submitSyntheticComplaint(
              makeParams(panel, directory),
              ORDER_ID,
              optionsFor(category),
            ),
          ).rejects.toThrow("ACK matches the selected category command");
        });
      });

      it("rejects an ACK bound to another order or idempotency key", async () => {
        for (const overrides of [
          { orderId: "order-other" },
          { idempotencyKey: "key-other" },
        ]) {
          await withDirectory(
            `p5p7-ackbind-${category}-`,
            async (directory) => {
              const panel = new FakePanel({
                onPost: (fake, request) =>
                  fake.ack(request, fake.record(request.body, overrides)),
              });
              await expect(
                submitSyntheticComplaint(
                  makeParams(panel, directory),
                  ORDER_ID,
                  optionsFor(category),
                ),
              ).rejects.toThrow("ACK matches the same request");
            },
          );
        }
      });
    });
  }

  it("refuses lost_item without a non-blank lost item description, before any POST", async () => {
    for (const lostItemDescription of [undefined, "", "   "]) {
      await withDirectory("p5p7-lost-missing-", async (directory) => {
        const panel = new FakePanel();
        await expect(
          submitSyntheticComplaint(makeParams(panel, directory), ORDER_ID, {
            category: "lost_item",
            ...(lostItemDescription === undefined
              ? {}
              : { lostItemDescription }),
          }),
        ).rejects.toThrow("lost item description");
        expect(panel.posts).toHaveLength(0);
        expect(await exists(journalPath(directory, "lost_item"))).toBe(false);
      });
    }
  });

  it("refuses a lost item description on service/fare", async () => {
    for (const category of ["service", "fare"] as const) {
      await withDirectory("p5p7-lost-extra-", async (directory) => {
        const panel = new FakePanel();
        await expect(
          submitSyntheticComplaint(makeParams(panel, directory), ORDER_ID, {
            category,
            lostItemDescription: LOST_ITEM,
          }),
        ).rejects.toThrow("only lost_item");
        expect(panel.posts).toHaveLength(0);
      });
    }
  });

  it("rejects a service/fare command body that carries a lostItemDescription field", async () => {
    for (const category of ["service", "fare"] as const) {
      await withDirectory("p5p7-lost-body-", async (directory) => {
        const panel = new FakePanel({
          extraBody: { lostItemDescription: "" },
        });
        await expect(
          submitSyntheticComplaint(
            makeParams(panel, directory),
            ORDER_ID,
            optionsFor(category),
          ),
        ).rejects.toThrow("carries the selected category");
      });
    }
  });

  it("rejects an unknown category instead of falling back to a real one", async () => {
    await withDirectory("p5p7-unknown-cat-", async (directory) => {
      const panel = new FakePanel();
      for (const options of [
        { category: "fares" as unknown as ManualComplaintCategory },
        { lostItemDescription: LOST_ITEM },
      ]) {
        await expect(
          submitSyntheticComplaint(
            makeParams(panel, directory),
            ORDER_ID,
            options,
          ),
        ).rejects.toThrow("known product category");
      }
      expect(panel.selectedLabels).toEqual([]);
      expect(panel.posts).toHaveLength(0);
    });
  });

  it("rejects when the category control does not actually change (selector no-op)", async () => {
    await withDirectory("p5p7-noop-", async (directory) => {
      const panel = new FakePanel({ selectorNoop: true });
      await expect(
        submitSyntheticComplaint(
          makeParams(panel, directory),
          ORDER_ID,
          optionsFor("fare"),
        ),
      ).rejects.toThrow("explicitly selected");
      expect(panel.posts).toHaveLength(0);
      expect(await exists(journalPath(directory, "fare"))).toBe(false);
    });
  });

  it("rejects a command body whose category differs from the selected one", async () => {
    await withDirectory("p5p7-bodycat-", async (directory) => {
      const panel = new FakePanel({ extraBody: { category: "service" } });
      await expect(
        submitSyntheticComplaint(
          makeParams(panel, directory),
          ORDER_ID,
          optionsFor("fare"),
        ),
      ).rejects.toThrow("carries the selected category");
    });
  });

  it("rejects a command body that requests contact", async () => {
    await withDirectory("p5p7-contact-", async (directory) => {
      const panel = new FakePanel({ extraBody: { contactRequested: true } });
      await expect(
        submitSyntheticComplaint(
          makeParams(panel, directory),
          ORDER_ID,
          optionsFor("fare"),
        ),
      ).rejects.toThrow("contactfalse");
    });
  });
});
