import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import type { Page } from "@playwright/test";
import {
  MANUAL_COMPLAINT_CATEGORIES,
  observeManualComplaintCategories,
  observeManualComplaintCategoriesForPrimaryCase,
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
  readonly viewed: string[] = [];
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
    // Like ReferralComplaintPanel.showCase, the detail article shows the
    // most recently opened case.
    this.viewed.push(caseNo);
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

describe("observeManualComplaintCategoriesForPrimaryCase (parent UI03/UI04 evidence after the category pass)", () => {
  it("leaves the detail panel on the primary case, not the last category case it opened", async () => {
    await withDirectory("p5p7-primary-", async (directory) => {
      const panel = new FakePanel();
      const primary = seedExistingServiceCase(panel);
      panel.detail = primary;
      const categories = await observeManualComplaintCategoriesForPrimaryCase(
        makeParams(panel, directory),
        ORDER_ID,
        primary.caseNo,
      );

      expect(categories.map((c) => c.category)).toEqual([
        "service",
        "fare",
        "lost_item",
      ]);
      // The article the mobile screenshot captures shows the primary case the
      // parent records and returns, not the last category case opened...
      const lostCaseNo = categories[2]!.caseNo;
      expect(panel.detail?.caseNo).not.toBe(lostCaseNo);
      expect(panel.detail?.caseNo).toBe(primary.caseNo);
      // ...while each category was still read back on its own new case.
      expect(panel.viewed).toEqual([
        ...categories.map((c) => c.caseNo),
        primary.caseNo,
      ]);
    });
  });

  it("rejects a restored detail read bound to another case", async () => {
    await withDirectory("p5p7-primary-bad-", async (directory) => {
      let primaryCaseNo = "";
      const panel = new FakePanel({
        detailOverride: (record) =>
          record.caseNo === primaryCaseNo
            ? { ...record, caseNo: "CASE-OTHER" }
            : record,
      });
      primaryCaseNo = seedExistingServiceCase(panel).caseNo;
      await expect(
        observeManualComplaintCategoriesForPrimaryCase(
          makeParams(panel, directory),
          ORDER_ID,
          primaryCaseNo,
        ),
      ).rejects.toThrow("restored primary manual case detail binding");
    });
  });
});

// Q2: executes the immutable original source, not a description of it. The
// original display-observations.ts and the two modules it imports, all at
// ORIGINAL_SOURCE_SHA, are embedded below (gzip + base64; regenerate with
// `git show <sha>:<path> | gzip -9n | base64`), so the probe does not depend
// on the checkout's history depth (CI checks out with depth 1). Each decoded
// source must match its recorded sha256; the helper's is the task spec's
// source_sha256. When the original commit is in the local object store, git
// history is an extra cross-check, never the source. The decoded files are
// written to a temp tree with the same relative layout and imported; the
// only rewrite is the bare "@playwright/test" specifier, pointed at this
// repo's installed package.
const ORIGINAL_SOURCE_SHA = "40bdf7d15da3d1e81ba9aa2bac22f8cc96a12073";
const ORIGINAL_SOURCE_SHA256 =
  "a60e212e1f878712529eb8a65800329251a91c6873ddb2e4c0e7519093a7ab72";
const ORIGINAL_HELPER_PATH =
  "tests/e2e/owned-referral-business-journey/display-observations.ts";
const ORIGINAL_SOURCES: ReadonlyArray<{
  path: string;
  sha256: string;
  gzipBase64: readonly string[];
}> = [
  {
    path: ORIGINAL_HELPER_PATH,
    sha256: "a60e212e1f878712529eb8a65800329251a91c6873ddb2e4c0e7519093a7ab72",
    gzipBase64: [
      "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",
      "0e+k7jBnAAA=",
    ],
  },
  {
    path: "tests/e2e/owned-referral-business-journey/protocol.ts",
    sha256: "9e8b3bfd90095acfd6577d13a0d260c90282d27b1463f1b0279585ffd6c8aacf",
    gzipBase64: [
      "H4sIAAAAAAAC/8V9XXMcSXLYO39Fc2Klm9mbGWD3djfWgwURQwA84pYEKAC8lcTlgY2ZBtDH",
      "me5Rdw9JHDgRfnFYtuzQPVmOsCL8bIetJ/vJEfo1ujv7Xzi/qiqru3oGe3cKKU5LTHV9ZmVl",
      "ZWblRzpf5EUV3UWTIomr5Glc3vSjIs6m+fzly6ODaBVdFfk86mT5NBlNittFlXd2HqSm1fzt",
      "NC36Ub5IMmiWZPE88ZtclVsL+JWWSanbQatm3UVc3UClB8kHqlXdLpLo5PKXyaQ6iKs42o1O",
      "k0leTL8pqyLNrvvRMnub5e+zRztei9N8lkS7D6LoY9SJF2mH/1osL2fpZGx/F8lVUhTxzJXk",
      "i9L9iKfzNHMf5K+rWZJUtQ7k57RI3yVFx5/KSZFep1npZg51aU5uCDOA697rvA8teLkPYJmT",
      "PCurKKdeeZlRt4B/R7ToXrT7CKoX9GF3184p+vjRK3agqH/RQKl/c+CJoj0L2SgaUR23a5NZ",
      "XJbRz/JlkSW3T+J0tiySKPlQJdm0jA6LIi+iO2hISymWkyovutQPzwpwKJ7m2ewWVh1fw8Jk",
      "r9uqVMtybxRly/llUoQrTQCz9tb3UwG+lzj5J/Gkwv6O4wogd+6KaRX0FXvo0QpgY5aLRGYf",
      "RW8+uaMpr+hfmBdA6c0oenp+/iIyRas3AK5OB6rgrLBCxH+aD294gr0d+Gf1YPXgAaHRmukA",
      "BuBcMqohH/ZxB8yKd+zX/XhZJvt4ztSnIvmrZVJW40voN5mOosscNjPO1KeDZQHN8+x5aeCs",
      "Pj5Pqpt8GujwNF9WMFBni9D55Pzp4SmcjRWgydUym2B/MqvgqhCmCaLKyJxxOgfpdRbPRhFN",
      "9ox+8PGIce7jSuPB3JsYliBxcb97azeZYDpLqgBcAeCdl8ffHp98d9zZ8WpZ+NarbG1FT5Jq",
      "csNLKqNJnAGYqjjNkOhOk6xK41kZwc/qJkkLmHtZAiL1o5enz/q4vMlbOPPQDPofcn+ngLqR",
      "OQPZNC6mEZLTcguRqdyJkndJFsEw8WQCnUHj6qbI38PKo7SMfrkEIiJwxf6q4lYQmukLEWag",
      "LDTdKAZoUNGe3Qyg2h8B1rNZb2+IX3aocXoVmbOAWJtfSUdIPBjsnehP/1RqvJJ/gR4STej0",
      "XcE5tG4UnsbZdbP07Dar4g+NYsKQZr/pPAG0bNa+vi6Sa7j8/C+vh2k2mS0Bnl1cSI9PpnwM",
      "IoaBxQr2Cvebgbr1qYUbtxIS+ekWHfIm/CeMQxr+tPewAXeGnLmdUHvBtYZYpW1LuO+NW7J/",
      "cnx8enh2eK7hJKVPXp4dHnjl50fPDw9OXvqVj0/On5y8PPZrjo8uxj8dHx3rQqhzcXh6eoG9",
      "H+6fX2Bvtc5MlaeH44PD07N1VR6fHPzFuu9nJ/vf+svaPzw9v3g6Prs4/PMXR6e1pUGL82dn",
      "F1Rn/Oz8ePz88OLo+OfjZ0cHfu/jx88OL85PLn5+eHr05C8unh2On1ycHf30eHz+8vQwhFO4",
      "EyGc0mTE7ORGhMI2DqEYjZJZvCiTKXQDt9RVXszjbJIMoVm3Fw0c1WSiXcF1Ld03Ubv/IDA9",
      "LqzfH0yjhzH/9uqoi0QWfEzkepiWT9IsrZKuzLgHOGln/2g32rZw3oueAxUfAt/UpT+uZjmw",
      "D6ZZP/r6q4svtrcvtre3e7bNKNr2pmGuLIPunZ8qdOi8ODnTv17qH+Pz/afu58Hhs8Nzt7Md",
      "xE336+TF+dHJ8ZkUqG3ni8lMb08uqgdmrnJVejOWuxQvMD66cKnu0X+9+nC5rgwTZi9Z7CLl",
      "W637Lp4tE3ej+hwWXIiw00kBlx/VI2RA+vGQfvb4Bomy5H2Nt+tSNz01OHPhySRJF9WL6dWL",
      "uIB+kaBd3lYJcBGPl1fAZiK3Gr1g0eCbu6gCFtHMJVoBr/tg69NPo5/Hs3QKlDlKYkB/WMQy",
      "nkVXKfCkaTZNQOjA23N2uxO9OHjCEgwuGmAaT1FimMe3IGngaEM8HTK/uLzNJg5E72SMMfXu",
      "5v0YZ4vk05s2Qhr6AZkkmZ7TnBU7ipN/9Zq5DVj0qAEFYjzMot/l6fQRwVnvEu08DTmcJdk1",
      "7PmjaBtPBJeVy8sYWPTb7nY/+rI3rPIzGrXbictJmnZ6jCF/AvAYCBZ1BGxZnhEVmBGwqDeq",
      "QcwmkwyaNVKM+H2cyk/eNVVpks8X0CVuqGCUYBBuKJUMi2QxiydJd+v78sdbIKh1OnqQ6RUC",
      "jsgb9dTlYYeIAlQPphl1hYgJqCO4uzTYe/aAeHCLTO+azvIgpnWv5040Ik2eISdWIu8Vlciw",
      "YAPg6nDMYgqIC/yVwbyCpDj4chUXScfy6j6f7vb8AI7ZLI+nwqQvi1m3p3nlcnl9Dec7mT4B",
      "jEbmwf98JQdMoYycD77xH+0IW7uuxkpOEs8tiitgJ2/mcGqiqcyOGdLL2wUyJS9m8e17kC9v",
      "qh+V0RLPbQHUB3tENrVIZrdrThJu2XKetIEBtwibwVnimwaR7Ele2O9qGW19PGLGZgLy29tu",
      "/SztCFLEBNCu5vhVVT7HVHmlTzNyV7BFdgeIzuCuOLKE1Q25eMxUYQ1Rozl5J16GpuUDFz+m",
      "zSDMKxJUcyAQbwDfZgD3ywSOQUIfY/qyE8WEEoB+tHzctiyvQAKJ3yXcIezjMuMOpgRd6Of9",
      "DZJL7Cbj0w+QTKaDIimBjE+QGQV5b7mIimVWDt0hBdKKS97lHRs2tgrBhws0NYfEoXS7BIEl",
      "0OWrFIahakJMqB/ZOEcNpu6MSD3ubydEFk3lIR0lInVm97DI8bK2YuCI+c3MJru2XZ6H7cIe",
      "Q26J58onrJdwMeJJQeoxYJqBlMV00CSyeI/Thcerqo3HJ1qGMH3rDvkCFOA0uid8dNAkqHtH",
      "Qu2Jh8uK0As/SAWOvLE2K569TPeRlZzN6LY9TUB8zsqklciR5gPLnPbgBuaTFFRYU+nxv3Q4",
      "L/PpbTd0bg1JIyEYETvPElGKwW68PIqQiTPnB0hWEpck+QJrk8Xv0mua9gB5Ziwe73+7jqTF",
      "CwBFEl46qvPs8o2Kaz2U+g8edUmtRizdnWbzcK13goPMFfqAxP9rQJeuvLwkBenPzk6O8asw",
      "ePx5xf9coQKimy9wLqUaJ/5wmkwBjSZIlbd3dDGMkejCisXnUfTZl8BgS+9qf8wShQxfLWeA",
      "pzM1JiyUa4ws1HZolw319LqzFH09kabzduRUUEjHcKaaaKte9+MZsHjlclZFf0rS9BzEImjt",
      "1Mw7cEBv8ZjpQuBIndbSbBhgPO3j0G5gkGjJ16HZU+bQSNBAts58DpM0n9IAbk8UUkFNZMQs",
      "6lvhxefWcIUw15xW0zXj+VgTnrpVGlAfw3SazBc5oPnk9tvk1lMjrJ+nmcTb5NbND+6rww8L",
      "uA9S4ODhcrJgLRj1UOcljCTxK5d4XhPgUcx01H5YEsR0jbeFcZ5RvYbo/QcNNOciH8lJrGql",
      "rWbYIVMqV03IG+KHqWIpnqslWmJVyZDKFjSSWpvuPhnqVefDYArEHwgdXKhI5QflTdx57beU",
      "07J++yx8pXZ0mdId7fZyvQDzzW702fbnX0Sf0j/mZsuRS7CsdduYzdvzVtgFwWfE36GSVJRI",
      "tKyuvu70GLdRlDUQBwB8vr3dU+TXzF16H+ZvqVZVLJN+K1jKJWlXgTN+l8zyRcJCTlAqkbma",
      "7lE47Q2FdPkbIoVWRmkbG1kW4uSYAnb0w0GUzMpk3bquYqjgLQzk6BT+8pciFISvQCPFmBud",
      "B8SVjAwqP9qNvtjejvbsJo0ivWJuIeg5IlXCUzkWUihcD+1jXzSidNbl3YY7E2UHs9BXyONW",
      "N2kpNz2zuosiny6BNKICQLRfeCHNBov4OlFcwDA6Tt6hkAPjCwttMW/L0CMm3FF8DXLiDmvd",
      "cQwLl9Pxc5Z7yygmjgOZp4Tok0eO5EJ092Bfbj8mKyvNepnOifuqK3UEm3x9Ts+7r4JaBVbs",
      "wJ0jdJ1/8+seNaUL6eEY9QvDtKR/eRTDjnI1RRAaTKjMn7uOS32xBtRThgmuqaaYbbyml5QM",
      "uLv5orqNUnopuUppu+ywlhtqLLm5SKfyFj0F/J4Dqx0ZFZY//dCE06xKrpMirEvD6UoFN0XL",
      "+N5jglyRJmh1o2fxVXKkR/1B82WNRbkOV169bswsiAFALvBnYPMbMxnO40WXcYXUI3Cujkn4",
      "TH+VRO+hDR5QOJewq/RsBYdqkgyjk0UMJ07OUj86OihJ+VLlb5OMzxYs6wYfguBw1Vc6gY5m",
      "30HfzbUabblRaYaW12suwPZoLxDWhUYfP/on6KE6Qb3alljAMMCHaO5wmBHTwYdSyhMp49nQ",
      "+N1XwC/1QW5J5q9JrDYqayh2KraL7qt48KvXPdSzdS/60cTTx03gOny5AFDvA2nsOt2XgxZ2",
      "L8Wve3KMm3jEPGZN4ecdPb4skBPZJdL+8vSZLCbIIEDFISBBlU/yGSP/TVUtypF6kHqIdVAH",
      "5cvnVIzKqveA2bXiMomLyU2t8CYuVRG3rm7c4+SW4V7da+zgqkgSers/k6W3kzrskOuEADeP",
      "y7d1PanBQ1g/MhCw9++GPz06f/ry8cV4n94NeGLIfnRY02mqltUULpPh+wLfS4zlwWgUT6cD",
      "HGk0+uSupoL9E1LA/snnX3Z6Si9bcOn2gVeaSem401t9n71RCs76shCmRvX1Emje13SW6sSY",
      "rzJrWNTtAAf6+ZdfwZjLBXKkonIYTlNU0nQ7N8mHDutTgWKgxhy7ItUVIBRqauG6+FGJfE8E",
      "aAEX9yAtyyUqxPL8LYoM0xz+g0qx6yIGkSFews0NoLodYofndGnPULkGTfEmYa3vdZItQbKI",
      "LgF5RN8rDC49eiyvb6KteJFuYW9bJewCMg4BShtPT5AhOxUjmn2eU5fOBv2p3grMU9s88aV5",
      "D1O4CM/FCbTxjDPggkwmwCB4hSt+e0BScns2W14rcwd1RO3ryK6Z1/AKlsvY1OUiph3059Ad",
      "FBQnLoyN0EUCF9T0QuDR0EIxLP8oQ3Bfa4QNs6K9oYEV3qCmdMiQoicU6smvxmVSyclBqCxH",
      "PDO7GT01bXjOwIymRYAo0Hm3QzsCSOUylitlYL1CNrDPb6fI9fVRmVTEIKpFfk/DEuRlOCfD",
      "TovUBf3gmmxP9JKKfRF0rVpWlonVkH81S7SYAcd0EWLu0NjFv113PPsFYWUiJZOxZoeuvS4v",
      "s3MJV9FXXwDZ7PSawlrzubv14bHTnDgOXONL3IO4oKoTHddcT+aYM9NZ3Y4ZI4xQ6K4TUxFW",
      "W2VJcWjOHkt19lejPjE1aOnCeP+YcdzVEwbDVAdqA/Mrx1WL8QYwcolAvNGkFz3i7/T276M4",
      "6axpmgE0aFMxs1XROa7AKLIbmN0KUa55QBSfFkNXiUYT1T1gi+CFEUD0kZSTKLSmoZTwdh3l",
      "bJ6qmYj94M6nX2SsIiJvQrZOP0ImJAFulPSPXt9Ixl64rz1+nOdLCERVUuDbl0crUZI6rx/B",
      "FZW/n6X4ahGVtxl8qdJJQP0Fve0r+zG8t4zIajRQyDNPk1kKogQgAKnZePsW2PnlLUvO4xdH",
      "wxb9N3COJczkRZG+gw5+VuaZ96zWr5EDfc+wti0HzNo15r719weyHu7ain3SEQMdLgE1R3zQ",
      "tPqtQvVjEVOPbz65w85Ww0/unLVyt7caVvPFG9eEIG0Udmil3LWdAG69/9DpR9v5V9vbPZ+Q",
      "cX1szKwWPZ7AkETYeOnplYgOfX4Sij5nnslg7E69IwRsV+jbFeprZ4HRJrMc+XRDuIyikYCn",
      "Zm7haN/tUUPqrVNBtVN0guvjZhsnJtW8qa18K+3HeBKzayLQyPkQpyYKI7pzUsSms5vYMxVl",
      "bWKtNENZUBc02Bl+9iZy+xLYQCAH+stfLfMqOfJsUhfp5O1yMZ5OgRx6hrFTkELzq6vAF3u0",
      "j2ssmv3w4ibPvC/vkpt0MkuQpls2mJ/h6TE/SQ7SEmEIV9fP8VTl2Z5uDqeZ2Au86GA2wN6K",
      "7pw41hLoTkWntc8W8/IuLOo7WjQpJ2CjuLOncGyB94XmUTqfJ9MUzWh+yRskcjVZm6KGANjh",
      "W7b2wN9ztExVkrZ7fTmb3CTT5QzNxtTcVztrcOEsixflTV6RDTwzv9/cEbQIBKPoM/NIiObC",
      "8eTthZAStpGf4N8wIEyEbGn/5ZGJVXb+7zMSa3Sp/1Siv4iC19t7S+UPSJ2KhI8vIN4aBWrr",
      "BHDJUH4st8KTNJlNSxG9z5Kqi7qCjl0tXYodWQ3/8A4FF/nHgcsUVks7fTJqRXQmTJmGKZf5",
      "QOGy0qEUF4QOiv0ClOUqLebEkrzu7fg+B4J43yHBFuwjArTgywttX1CTSJps0oDvqI+l4Omo",
      "DX8/OvZ5J+i/IB1ZEc89WQapYz/cSi7ckTXc3TQxEdIDhifOUSHwIrH1i1fx4Gp78K9e332x",
      "vfpka1ihBG6fIbxz1nN85saG7hw6OyvBVUN9kB4tq/gSbma2QSl9TtP6P0QgmsPmLgu8f/Bl",
      "e/PW2AUT64b0cmgAaO9U4nDYPOAsMVJpEb9/rE62fqtQB7gvrCw+GXd/MMwf0nwsGlr4oP0C",
      "EPVfATttQIVDEGO4Y6hA9D6t2FbIvve+TW6hIpw04u007KLIHyratUQlODNhv1Ed84ze7LoC",
      "D8vO0CPeV94TnnrEqzOnwQ1tkx81YxKUIWUu0okvHa6TDw0wSSyeL0ktQf0a7mylrO6pUkA0",
      "DMJLlLawASVJtb0hPiPddrtQQmgRJM+oiaQa7UcDkPIyRZM8y9jjM7hRYF9RNz5M22dnVMre",
      "BGs6ZXus35oHfY/K2s9oqiwiKbblqqJ60rVGzVrq1QUL1aPw59tffG0g0QSJxSletd1Ag3Pc",
      "bw0aPuNjT4rle+Cw4lbD+NzrDiAOHq7l4rqAsy48EUJsC7Xsps9D4pBIC8kKxHK5WMxQgRhn",
      "zkZVeBpm0NDcSBg0uneHbbtFJ9XZowWuP195o6zhcZ73aKHJt1ETDfU+twww2jDAPWZ+r5Hp",
      "mb2+/WzbkoiFCPLPeFCxFfHF/rYri2FEZMA/a97v80BUpPkgKmjyQlQc4Ie4eoMF8osdGxRF",
      "r/ERlGbWsxQrgAQMGjycr5ugpWLnbfJGQDT65A4+rEZyQQ6Y/X9jT5SmcYEhaS8Ue0fjdv09",
      "1Z/39pRdZ327Rlr68Se0kVzRRHx+sYa/5Iq6vrI/b79CA7eu0g/Q60Eyz+Eg85O21h7ZyeIj",
      "jd9xQBLy53qPXR6WbY2VR5GZqpPdGJr1m9XtM1t9mNFF+WVGiuoQCixkZ93Et37x/fTui9UA",
      "/vu5/Pec/jtS//1+CP/8ZPWXhiu0w/d8QlB3/NHaS9uk1gaJL9ZTNYZVfnR2IgpkNolyC/Ya",
      "B8HeUvcx32q1jReaISYDvfs0CYr8poPAVjPFo4GmanKy78hV1YlgOzIoxoZudtHSIhh8Kayv",
      "UM19oEa+Hr1divjVePCXIA9cDF7ffdb//MsvrVBAzBBc+4a3sOx0867HC5c/++xt8Fh6Juqj",
      "doWDfXJPkl8lXctgWs2DmUZI+2C+1RQO/g57H00LrYnwq7svpq7oJ/xqVGhqKIVF7QCbD6Zm",
      "XYtxH4po9RtBZO8rAj0yEpIuNHqPhgq/Lj1YdK/rRd46ZAgoQSxIjSLEHZoXeVmmKEIiX0w6",
      "2iHIYqQ3S1irzcfJsHI7UUymYuIEQe8ehvbjwy4y2xM6VH1Sv4n4xV2RbFDl/AxsXie3DPJa",
      "wYyM8o7cCgdoJVvlVoJDltBiN9mdH+SkkecncrI9c/auxKijd0bBnfNk++QKPovTufXcMA5L",
      "Q0HaleOF0efycmbvDmKhkw8pMdJkHh9nyNZW7/PiLT1IpNlSDOPGxtmEgGs6ZG45zd7lb5OS",
      "pNQ+O0hFQOY8wzDnVWWXLMKh46xZv0y4J3qPrpxqLcWW7kQr5xDTGuegFOYk3Cu1YbdmIN6v",
      "6/R6nu+183tp6A7C7mZSH6iccYQhasKiT4igdGqSfu1aNxsD6LGRcZKV0Fhm9NrRtRQW+jP+",
      "WVOjbKC6IdKq1a4/mL4Oh0OZTIC+Om2u+Wj3h24o+dXzMTmAJ7qvFmTRVfyAGrKik0urZn9x",
      "g6ajEjVGYDZYpgPyV+r4xQbJBzirtm/yEtf2+ZdlnrV9Q2rT3i0ZudY+mxM2IEvT2kcAw0Cg",
      "1tHxNy4bQDCKE1SLIjxGbYDqB+Jz9Eb1oC/GzInjGAA1qNCCGWQzv561mKN67lFLwlA0WnMM",
      "mT3+wKYjGDtFvfjGVzYkA4uBodAPgdgRjcgTKjZFMBrEHk1SwuB0XjIouI086YjbpYT0KLco",
      "mgd7XMr7LxrKlX37cgubL74PynjJKjQDWi58CMU9WYE4aFe+etMLWw4Losi+kme56cjf0PB2",
      "GsewVtRpQ8k+b5c3K30Ux5O3/2yOZHjWtCOZCxsV8L0KeFiFnbHuNbRzznLN1aPgyjmziS+o",
      "UH8iO+TOJDSb6DfbiTuHzpdH4hpK+FRW6WyG3Ocad7acdsy6szngk1OabIDASXneNfaINN18",
      "ixhFuAWfD6bwu1xkNHKj4KtN7a1FbjrPwL1WhZzEiC2C+dSufHZMz1O6FJN3aNKDTPeh/OX5",
      "h901Hcpq/IJxBUNd9noqGe223Rk7gagvTScmfzv0/bzedcgtcsjm3907E+uhOR/BCLiPTa/m",
      "0l20rsHcbXpKovPBpzVCi67HUBj19q6pN5QSXYkfsV0V+t3K/JgugfOiinX+ykzIMEBocZ6X",
      "5MS/gdOqc4Iy0lB63MQL7m3kAC1DbMaovwKEX08azodm8z3/w+DUAs5jBsqe71gUcEfcUDHg",
      "1hhkPmu+irDyRZ7eQzvYdKFb69lmZtuUtQOzYdQ3NGrjVJp9e6z3hiHrjxFBb7r6ZsfvPVdx",
      "B3Z3r6wfTPEVty14FQI6jquWJoaldvNDAr8T9htNWU8Qwh61qUo1MEBH0ddeNzWtVfueGvGK",
      "7koUTUWtZHxPaxBu+Mf67469NdggdnhaCuOXHlOi1huqXBPZQtUDHrcbAIJvyTW7oC2t2Asi",
      "WzupJznFI4t1/8uaLywzW0p/LrfKN+hyiZ4zzlfwJ1ygfBMfymNQr6bGZhlg11a1kkI9aJoF",
      "ILdwrm7SQ83VrYOtOhh5j757r50sXmAF73mzxpiseX5uKHgdVNH+XIUP0w6VG2K1ocZV1K2o",
      "bf1s25lguIBiZgntk1+jLmZdlNpgz2lVo4L1X2UCJQ2NB2uvcbW7qtKzaUFfe+YcBE7cOkUH",
      "ue3gfWu1G0qP3lGIaM5U8PmxjnGelt2CwkzYdUEVemtfTnRXns+v+dt7SvBqN0jL2trT4COt",
      "WvaG51mvM/K2ySp021GUjRduP3jNLdaqXjSsW23XN7wIrenQe0YRqseOQWhHJbFYWl6Oa8hP",
      "QTUn+TWr86OrHI2wS7TFJjfrorxJF4Z4lkM0CMiiOAKQv6W7R4LEcDCe0vRIymM23cD/PzqI",
      "4ndQkVSyVa6D8nj6aBuSB26uS+AghxLzCKSbrn+6GoTbV/Y43ZnhYQOaUasRbRMenBbPEyFw",
      "qCnrlzta0+coWc2XvaaaLCgMxwgJshFBPKWfNb+vz5Odv40ZEOstfC2u2Y3dNZoKAp1TS3gr",
      "NyF/5F+rX0RKL2VWoYjC+7dJspAwTg4DES3cdiOvN4sEXvQiYFBtAT+SKTArcF9rz/RWIb5M",
      "qmqWkO5m2pTkvzl/pIX5NXqNkELl3nqN1ug8IosLg4ed4DaiZi2gR3jVMbLka1IpCCqQDM8L",
      "GwU0RJ7h3fkjHo70oj8wHte5E+W9Zr58vjHqh0/414W+UBZzinGtOSwFEZuR7x6KN1+NrBF8",
      "xSrJc8JTUTagMwqbk2MEBUQp9K/MBJPNyxBFUhliy4KaZDl3pZ+rZCP7KrqBM2LrW76RdLn4",
      "gGbj6x0deJFcMDSPdWRgdOgq3RIrm3x5tq/QuVHDYHkt+kStlsV6roZc7EjOHdfcHGbEi9np",
      "BmCoUCCZIT4zihOkRNWEKl2gcG/F28XYColfDbThXuvKWdWOLJlVQ+Z0Vz3PaU+Ox6HXi4/l",
      "+FqYzDBgPCBDXiZaRC7kDFBYaeCl6FXvUj5x6LqE/Anm1mJuDOVXy5J2OYIbDkNwwA9Ed3qF",
      "xGfPS6Av84TC2l2iwR75JJlgahxcRb8TyiJUnLLwUdGLNQ8IBv/Ji5+xDAQOE9VUCmxNrKV7",
      "6f2eR9C81vS9OWnnMhnZxm9gXbAf5w8w+LaUoh2h/vyWnKltEG0Wx4QRDmJdYDPsepxNz6i7",
      "1muEqrXaOucOCCOPIDdp7KZwh9bOaXbbN2vBXSdzrbzw9d3i4mKvXXPfwykgx0W+bImmcaAc",
      "N08kX4ROpAAEHm+oPAURFCz52Pr/cmeWQC+41XiMqam/655dKsxiC5+kOl/LJjUfQ+tXSpBy",
      "CyzNYdLDmUOny3bufTTbzo1+U8KQKcigGw80L9Cxe0ra04yPlyaizU+nisu3tSLOsVErFGPI",
      "upfP8hJOBDuP+n3kkyXeobViFjq/TW79XkiX5hURQfRXA7TmOPcqLeCPSbqIZ7VR5uhkT+JN",
      "7QNyAHOvJEZvF+Tk9gI+Ul4ZXHnpHOn58zSD/+WFNzv3Nf7Q/NqMP763JpnFXns2i7316Sz2",
      "WvNZ7LUltNhrZLQwYsyelmM4gws+7sqPZZZ8SCbIr3OeFyLl9CcRavJtWxnPLrxkq7A/FyGy",
      "+E0RCvPfpMWivwRp+Qdjq3HtYjT1nLrMT42YUt1ipPRrUFEacBgP+tsFku4w1on/l0M3LtB4",
      "xiWEYPynxayAo1oDl+rFgkRc3MQeXW7RxsxA44tX5vDEK2YE8YpO+YGbSxAXQr5p5rFRXtGN",
      "ixhuNTCjlmC9wpgPr14b5z+QvqmKqrHGvUg7pVCzhleKQq2AL4oRf9k1gl3FnSv6xjcDtgVF",
      "zeRwNHDKyVQcxN6RqzEFrrIjor2Clbolhlb4jYLtEwlcw8WyvIGLdDjkAlEYrFTE7PrNe+f6",
      "ELA+0GriVtMU5Wpx5/kxyI3COmL64aLovPqFAsPWdQpC36DTG5Zw3SUYtR3AotRWYjHVtV2Z",
      "CIXO+h0GX0UY+NRIOF7dVWtnVn8c6GpCeYBUvUA3/NVPjuRXsiocoWj660q5kbj3Z6SEbGQ6",
      "EH1tMZBdIy7Z749VCSofkr7lVShXe80TeBxV5+iEStyx4p8EHtxx4f1dFKOGRzOOdMJhbGWo",
      "efOeQHF7LzTY3jpFioGGvYzk8Mfv9e1l74aDwyfjl8/OL04Pz16cHJ8dXjz+i/PDi2dHz4/O",
      "I0/TsEOxJg6Ptz8nasOKTFQFp5WNbF/2I7ZpQh77xnpNbaFdLRahJIZVMMAhRZv4OnqePo6u",
      "gY6WzFxfS1IhCSVudBu48CLP5zvR5AbgYb3NkVVEKS9Dso0dXnLYX0ruIBmR4iqaoyUpj0Wv",
      "ceSZDsNsQXPjYgUMdI7x6UvkX/LitkcT5GCOuHXIXouv1qAE2YsE1FmK3l85ulICxUEggMwD",
      "nDMOsnXJf9uo+EMB+f74+OT4aH/87OLklJLPhGH/NQB+ze7UroNa7inPTdnlk+BgIoYLeB4v",
      "vsE0bxZ/VDBZ7Yhs27MKDVBb0tD1/c8G9U79gMktfslo8jsxkl5coFLnG0Frb1KPWtqTCikp",
      "rH8g/UZrEfy3rQ3mw3tqT1FXGRfRdRY+Vn+Q47MAw11RzlfZPNefPR23XFJyAXP8QtFglr0h",
      "iK+HMUbfpgJ7WYGIdMY7rHL49TnaYd04OfREj5n5Hvr5/JwrGme4Sz5wEAencpnEBSA5ZgZD",
      "/8WJBJNVMbzsYiggDk3GM68VnIQ/Kpq2TNiuyijS9JL0vrURQ09/X8UFen67QIIYCZsnIFB9",
      "5ZIg0lC91957o9lOxnxjzd3atpWn4YlIQy9Qr/SsHrEeSuVmxEL3rRm20H1Dmwq7gbS7Mmxa",
      "5rOAzyMpqWx6Rs4dGfY+o8Xrw9THsKr07vQES2HTZgsvZql70HR+9LqDrszZKkF7gZfkygSI",
      "8hDnWhDHt8KY5Uvro+ZITdtOeWG2WzEKruqVev7FIXouOvafD85IcTaDiQ3GbGv7KwYzMuFv",
      "OCIX5mfEhqs3yiOQEL4WbdtZttgtMQk+P/pZNH2namPLFHsz8F7tO+PQN3+SNCczSdm1G8fj",
      "ONcIvBPlnnAnVKIr6wSJ9H5nQvfXGCDiyoJB9f1jfMmPk/c5e6HooTihPnWi4sT5aKPCX8k4",
      "mv4Q5anRBYqFZ1ZmaqNvq8GVUNwGT7LCLoCdz+eJFayUl2TX28iPHwalw7L6p+bGQyGJwoN0",
      "Cn/iGkrsYpIv6A+SmOFfOooDcemCuj0rZinEUa5Vyr3e3WziyS5ZZER8cVbnBn02yn0boUPx",
      "aqv8Wf7ehKHls8Dh24BmKffeZi5ad6lJuDdWh+cqDhzj1O8/UTv6phnLll3n+fUsAbgP6Ng5",
      "gwL/rAfuZdR251dXkmqN7l6zGrmyxy+O7LX9zwd6gdgmZDCPMSEAe9aonI0VDpbKzTqUXArd",
      "z76kjHyhZiYJYShJoQsZEsgb0ggb0jCf5juLuU7mH5wIb7LDGjIgEd6BCnjZALFXDqMGRBhm",
      "tlTY6NLReiBwn+3tpDUHHbGeGZCuC12iHBu2RbZ2WoQGGVxRuNqXbuCooHwv3P6IqS9J+75s",
      "j5I9ooorW7k/sWMDFY6IEowMQRqRlXdL3YmbaC1Enu6sp7QMq1o0F/954j5mdW8+uUMQrEZW",
      "Q/HGrSPgUh8o2pCC2DMm1CBs2fKogdf620Zk4ys4RLMDVnpxlmcorZ+QJE+pkIz1Y7fr8xvk",
      "nOiSR6JlF1QYwBHPksGiyD/cbrE+wCfF3Ubu71pH6AxrGiqH+G7LQoX04J+ucjuuqSDephJa",
      "JdvS2gO/yerhKmz9Qh2u7+l0dfdG35ef7nz8pNe4L+uWAMSndsQKboBCKywAl1I3H9vaciYz",
      "aBcdxTMUYEG+xnSLE34Xp1vhR8YnmazRrpdsAkEsPj94mv6cuQWqMSQJHLntorLlZFFGj588",
      "IaUKm41JXFsmVXSDMDm3E5xhJjj0N4DNw0mQI1vk9DxLzLcRAeoWqRhNA/81yEzI/imsKQVq",
      "Iq/xvr8K5g57RoqV3RBW2kSn99Gj2DSoazUpeg5k2r3rG+Xs4d6d0qcau0jaKK3qU/p2vmrE",
      "bGfXpL3SVwxbBWC3zsyWAs/s7PQ8Km+DclbKagjbUSK2rpWuTKdYczjNs6QHN24Sv9XfZUI/",
      "3qX+JAw0F+7UCI9hDpzpUWOPlAFS4RKXTRK4ZJTUR2sgWLGu3Y2sqqyEfPsRQz0oKaB4UOBM",
      "Nt3empyBZlUCNTKeeJabN201vhY3xE5L/BJY2djlhShuwqb3MlG1dq0/njxCK3qjLiSFCZEy",
      "g3eZFO6ZiSgUw4ySOpvEjZe3Ng9PdL3E3O6U2bm+aJqqJbY2CBXQqFdAB/tADD973XNeqzV6",
      "2WtaPHsG9GaBzoTeLlkZ0XsMgbEU99O+9IZ12/qRgrcZXaK+KaPpqc5U40zhgwPT59qomy33",
      "TcRViRYhgaa0YkyyIqF3pRHTErFf4dddNjF2/ZlAFUDqM4yAK1qWaVouaL/FfCUaZxGa4G7N",
      "MRDRwCi1zRa5/lhvl7B9D4UKKBYF5aaNUQUfe9P9UenniJomk7QUaxmDMCrZDJHhi+OT8wsg",
      "zfuHzzCDeaf3IERRPEITuieDDlm9ZmCmU51urMbGaf3qPC3nCDDF0fV2fjhnKOzYm37zmm/x",
      "uQhmC1KzfeW9f3XO9k9eHMIt9Wcva5nj6et3J6ffPjsZH1ycnryE64srHxweHzWrjl+eP23t",
      "5+zw7Ozo5Bi+//zk2/bPzfz1LHKcHD95drR/Xi/HnX9y8vK40eDJyenjowOYZ/0Dpb0fn9NY",
      "p6cnp/XvQYwKL3T87Pk6SKwD1cHhzy8QsjDNfQCqXfz+0/HxT4ONlO8+32Ie9aCiH+Amcw8f",
      "xT/oUNznQHhsjSTzULeWZbqQ0Fqmqs4xc7o29cYt9Fs93PouQD3yAQpflJzK0h/gG+y/t843",
      "hqb+sC3WW9QYX3zEWmprwadN+dqrhyRUTwy9emKgkKhEWWBY71Pvyhd89vzUS37aT6+d0J76",
      "YkV/3kqLXNyxYMvePYdRCRJ+j6FcygSlZFAE2DCZwtDUoxMaJw/Pf2TURqb5PZ/xvWbX4FIO",
      "ulSDSglTP6E2ipVLNbiqGRlYU1lW1plQriTavOD8gl1jJ6hDE+h0tX/mxw4wiXiQ80A7XeqL",
      "Xy9Q/zWnmKEw4GUJQucWHl7yDknLhDigYXRUlVYQ5H4ovX2VXqYz1NkSwqKICf3KM30srJ2N",
      "Gn+5nLxNqq1yeUnGDfjSKva048yxQdzTNOUMDtQDMSMcZQLtM7T1ABq03kritmEo+wdBaYi6",
      "8HSSPKYZSAxZAeuF4ZG0coAamRoHUuFMJk7NE2aJAEKhDrresLJp+8xLEm3U9GNN3ZaBerU8",
      "4CZgLfs1/BWUpVfCm9WzkphYB3KczD8FizuszrMJRJ6lV8nkdjIzPpJrk/XWUK/lUNdqSVRC",
      "47XyKFJ6FN+nWb+B/lndJZGr/gEbxh38kD24z2aDSLQWlYg2Wzxom4NJmoTXg7OksZvOOxrc",
      "9EAgHqYpQARexCnZbVguoU5KQEJF5aox4HRxSawRp5fqOpz50/Y+NP2wB+r7zBVYQLrKdghb",
      "25YINCSqw/vMtaLMWGuydfnZF91gHnEoe6H5+FUcVxegIjphkN0jJn3BVH6tAEtm6bWQ1wMR",
      "qNqi025u1OEP1mOy40OOKCzaCBjBUfWzZrIP20B6ExfT0yQu8wwRuOyFplqrY0gAznY7OEnU",
      "cWIjPbnocpZP3pZr5mgEeQeiKn6eZktS2fi5Tx+EXYJDTYNYonp+5BZBDm2H5+PG7rdd+Mf5",
      "k7xI0uuMc381Ur7Cf05qPgIutaOTI/GaMSHOdAotzifWjDePrfnrMHZJx9hjBHhs+QTDLYLd",
      "NwDf7MtPYOaWocoktIMby89W7doIcAMBlUkVnlklm0mph812kKvhSJ1p1diGmqNShXxRRnro",
      "Exm2+yCqh2nqi1n1yfus7q3kyCmZhkl/SGi7rI4ZkeF2PnuXDFAXSkz84CafiYU+qVQ6Xpcm",
      "gpifWFG8lrTKF6bTTOfO9UKhAPriELBcRJawWj9JE7nDYon0o94/ZLLsXPAxClWQWKHTjkYa",
      "eTE1kJFkgs3WFjwXDJ69dsiNLOTqyeMoDOtGIDHuYt31MRO6XKcdCIHvDgaKwDGQDfgN1lkf",
      "/E3U4hzN5cRFqOUKZ38Md4E3Io39oDs+EPLeenwoRxDt+qEdP1Rc+oZWA7txoehh9hyAPnpD",
      "i5Oo84KOb9bA5DRGOeUUjQluETZXaYGesT5wUE/aAFj9cLewNdRhC35Qx8FDJvcBTa52tjbe",
      "XzwiYVCcZtU+eby08NjBusJpb6jFpB0XUPvgT555UfPoRl5fa5ZgRsoqKDpl1aiEQLHXi4zZ",
      "VsUfXupxY+vw1HpQynS+ZNX0Pp9ANH1tis/R4iavcv9KbZEn6dp5UQBL2Jhihm+seCmxcDa4",
      "wndUKx63ZbZcFDlsshPLaBQqPOUW6BRVqgZAJF7gdPfzJbkbmvzw1GbofW3JXet1gPyKQw3/",
      "G4YScN94ALRBya/M5KY2gFK9HkpsHEowb1YWiC0zTGpCnlAmgtTE7pNAplBQWINptINIc4uq",
      "/C6tbrod0tyk8/g62VoAYeMUsP26BD2LLxN8AXtx/FN5zWtuFGZjMUoKJm2DaTKZxbgih2Go",
      "nJgmGCsIPYRQLBZ3MXrdXsS3c8mUZ9kxGP8JdPIYH2Cn/Cx4Z+IKFBV5mI2ir7/cFn4SBA3y",
      "GZIPP9m2HxKgdlJqa2fp9Y3pg4pWOsGo6HLlVhoDObTJDmo5DvqGpYPZHsgMvp2Pos+HX3if",
      "xHntLJnA1L6SSeARIN8fCmM3uYUr+vy7A7gW4jkimEzvs89hKcYkKAAXY6sP6ICd0VaXo+gV",
      "/fGaG67WyLz7Zp3YKyfHpgBFXqQQk/02QDGYiQvcsuzBclsvxugq6aJqKT6n2yeUJts+qLoQ",
      "SgFoqEyjcaH4eZzgEIt0TmyFWrpaoNsWAg5Vhmb3/OBO3hd3t2Cx2t1mG/3RNqvljzKQMO6E",
      "zkKIk0lxH68575VZgeMf+LOzkawPI+4SbhQ4yctJ0u2Wy7npnPqG39GPTXfRtq+1aVuVEBh3",
      "SR4QzTAUjnaNMr7bzalzfM6cveIIpm3w20LXvvrGCVZS7XPuAcku/gX8mHz1ZmPHV2Mjccgz",
      "pLqWLGHdxxTyxqZtcJSK5+KOvaEVqrJHwOr1z8khSOW5MDStXvEYCZuq6Qidq7kKIrMcwCGB",
      "4gkdHgMYbeTFlcgyFPVtDoRvjs8/IcN3KFi9aUVeB7n7oK+Mdw/kNTOTq2T/Js6yhGfW+af/",
      "859/+z/+8Td/++9/979//bt/+Lvf/c2//u2/+Zvf/v1//+3f/vqf/vG/dKxCgnrw9h5TSeTL",
      "ylxQzk64jowzVGgp93BFziRJ/Nb3xd732VZvOI8X3S7WpxXiHyYHDfWn5Aj85nJnvUHsip7Q",
      "pcGwdrAcGuxbyYPOG4Nh6xqYOrYRotm6BvjdViZUW1ebKri+T87Hz6In49NDU11QhaK5N4Ue",
      "gih5RROsUHASV0C4A87//Lz1jJqkAsYcfZ/M1P0cyJTGgz+UXetWcUfh45X8l2PqXSfqKRcL",
      "CrlCovp0avoRtoF+ODPjrJaw2OZUrBc2QnXDFVpVCzSJ8QIncMbLCUUhqRfDWGcp5XZ4Fn/o",
      "7LjHBcw8v+cHFlu9el3zG5FFOW/bmuonngKoDFiNrxwfgYru7SDI+wE/X+YZ0GUpfNnzHRSZ",
      "FEX0gA/HivttUU7Iaxfb27vQMGyh5/G+8NeFedS5wDAI0wt5Nt11me3rWe3TslzSgfIihFky",
      "oI6tNDDWK6Wx7KIn+q1fhIY3ieo/XpIDUW/XxhDFrno9kwsm8UO/FnT/cCUhM52djpCYOgiE",
      "yOgeSAI1QUCpu1fbr/vNtQP53WINajM8muXP8KkFHUhJqkVu/8PJVbezG8pWxXUfAevdHAvu",
      "NrSMDLi/eWkoeBjrxE89evVM3lJdkcf9cfSZV3MefxhfJxSGIWKzTqBfsIAugYQguPULqDQA",
      "aWnXGCrTp0A30IPub0/U5l1VaHYKQPPqM7jnGqZwhCiyfbXAu3ySN8xVagXnWuuJXD10r8r8",
      "RMX81DUMLHWR3m6Cb08ZrRzHx2sDsjoDj9DR4BNRs3/oGmDjq4hvdOJ/bM252XzPsBDpNes6",
      "aIHUT3Ahlxgv3qlx4mZRWMLiDnj6iNUst1MEj2aCOBsoimnm0Lug+F7q2/vImMgwBe0Nb/Ky",
      "IiCu9CYrerFyHsQbEukyRjENVRiFFxGu7xMfpTSgWlryTVVrZ92c5A63NOCpXHjAQ2EzQxPu",
      "HSf9YcssGHK7LbOokyB69isSbBIhbCNy+Ns8ehsIYGtKwLDdWfzhvoA4k5v8B0MgiPsfP0Zd",
      "i+4YuuZI1GJcm5ICSkMgym5WGH4wqkNnll4lZAcXnpOPx4o9Mqaad97BdweIMFO5ByE7xBiu",
      "nLgsQ6TT0Tl+qFbqs0O+V1UIUOv9qYQIjBQBYKFqG0iedKccqiTfbM+LTHuKr55XywqRm8Pc",
      "VDbnsdKPZcbVb6tYghxTRLMcZWUEu44haDkz7vE8ThdJeprYoHFH5C1DnClM9zkyC27uFBXQ",
      "BbcgLuzV64Z6t04mqSNkxws3DkcnneCbc+3WNhaRtyIbkRKN5/Lj6PPo0+jrry6+2N6+YCBi",
      "0I6ffMU/+Qbx1W1cpCL3qDEy5u7tIOr2evPJHcxgdb69PaL//eUbvKTcyPcfSjSEfqK1V6b/",
      "z38y+vJL6P/H21/Df9/00e4Op8Ujqy+vPSOUGpcNqJBe3ZI9mtrKfWVJ3l2weEGp6kAcOsoW",
      "y0rLDuuS+dgQcVoDt9N85NkxL7j8IND6hmvqfQc8QP5+Q0V+CtxQSeJlQ60r9PzT82yGvQRA",
      "asFBJ9i1qLAYepCq6XDDGnO/yRD+FOmBt9Bqyu2Fz4cPuP6rMqlga6BV67OGzqA4DKSzaUzH",
      "NKjnsnHp+5CEm1reK9ti6L+zOQjZnCRaNa87Dee/8dVgrck67GTI01SrXf1n+cXQYlnLXhgF",
      "3z3yBQfTegxbsoCYD4V5VzvbPIBpA5QYkOe5ywhhqipGNWBXYDejUUtRUz5J5LPaNg3fTNF2",
      "sclOUcPFMW4+fBpowpYPJnmJet7UF0DjwZb3+j0tpbbXvD4VLSlqnHOrVbVEqYbGNdJXO64S",
      "gNpt58j96D/wEu0GVy94/1il1PXQmQv7yixj1DCZ9sw1VIz9wC6P1iNB31lUAfHE2EcvMZ6u",
      "bVUrF+tp/oc3QMKHSDzMzQ9axtpi5J5wV/LW94KJsznFixyo3+1A0w+TrhZTW2C6WkYBk4B2",
      "Arw1QFB6y/II5JzZrXrZ7MOYbxNhJvLCi2nOxgFpKcbZqOC21jILm4qUsClMSngyCDG+TwP2",
      "V/LU5Wpq2LZYFqypHN4j11SxKeFeesCSa6atdjo9DzOBNUN+x4RwW2ZiFDQ10G/YAAGo3Rk1",
      "7qBtNkKbKTbmyNhA9rBKi5GQq9MwNwp1tM7eqL6rOKr93JoAhbus16u1bewE+X6L1ZLeFMr0",
      "q4hm/TWrjr5MSEBEuXIBHrlD6GmE06gfUif10Mx1aEoNnX6kpj8KrJLfijWjS3VcHHQWUjEI",
      "h/hPmqxxOxwzUN7yiKvFYN7ZdYl5VTAvC7oAC33IizVx0EHeEdbXDHKenyWAhlPD9Qb4VEnb",
      "7grEsumeZtoUxpnG+EFN8gXmLfDCNBmXoz0vRtM6ZpdmynD7wzvjRfyxejMWEGcCmm79lf+P",
      "z8QH+HDW31qr+IdEBXihAVt5U99ZynsN6ubyCpVlaEDY9zlZk6SZNfiMF4siR/qJpvRlnXrS",
      "iD/LLxWBBNTg+b+RiBxbn9wlGXrtvDw92jfPZF1LznqrLTMReS8z7IQJjeNncuTQLnfRnMLG",
      "duJllXdc2BgX6ibqHKksfhgveoRC6WJIJ2Y1sIOaxquWtblcYaZkaNrSVy0UGMNvToiKzlQC",
      "jK6n6lRQYkiZDrcQz1og5uYDIHMj7YnrwVFmDPp3kSg67zbWUA1BDJ6X2nTpBe5r9Pjk/KnK",
      "DaRWIGyOw5MdoGbMCFPeFZDllosFMDBs1+U/BCG20PutYGXfIuJrPz+SM+bfVYOzYt/Y1U7o",
      "2Ex8hxEcQZ8C+O77iFCFGtavSaFoxlb5HKsbh/4ORJLWwgGqnsXVQaymHvQcbdyANNN7zOze",
      "rhxaNhftam3SnsNESJm58o/B2OOSEHk7DmdhXel11jFRrULH1hxa7+CM1BHr460vuGIO5P3P",
      "Ms9gQK3f6LtcLQGtotUa1OVjyBUGEWKEWncMHSUAoAzZzLnX47f8NcauOPwmfs5V9DG9fhEE",
      "GtRQv3EVBJrw1Nla1V9OcEZ651wj/hmoz1vCgfv9MbwvgZaan5WnpIt4gib9yK91mteXVeYw",
      "9rj+aRub8rkknjJ+TdaTj0z5nGEux25GSqe6lGyFGBEJiGBaPpDkeklUujCp0KtrgVGrKayH",
      "SNbILqPWBdayIzFV4muUD2Hm2a3Ihsl7tAtzfaAxTmRic3zWF615PqfgciY0C4WPpzD0sZev",
      "Tx6FTSLG6LOQFssE9zXeV3B+gTuFzqt0ckHU44Lp9wVT/U5fNTgmnWrnN7/+69/+9a9/8+v/",
      "8Jv/9A+/+/v/+v/+7X/87f/6x//33/7u//7PfyfVjXHWuA7QkZmf6Di8jLL+YXc7/8ZK52FB",
      "QnKid5guDxp0uU3DYlC17x9fUa0QFJCEj+yd1tfKOhFRAIeSsYlgCZMwkf0H9J4x4FjhA3yA",
      "kNk0kIwu6Ixs5QxZtyggW+4SprWiH0hOO4zZGI0LXaFCCM2JFjp1yulARmrlP4DHq+3a/bg8",
      "D6KbLoSWRMUt3B0+TnjMnV5qgMFrUHXXwUOPGDbpk+WoUfNkS38JXHObchn73leM0R+blbRz",
      "/wM5ScWmMZNmWJb6BdYUWprsWlBQaYf9vs+wdbi1YnEsW8YqnLguwSs1hMeY+Z3beek3DCr4",
      "Z+KJ7N4ISyTr+n15Im4eYIr4Q40r0lL078EWWcCE+CLJ1Dyb/vE5McXPrGfFZPRNjJipFmZi",
      "mp8aDeu8lS5sVL4ns2eq35vVs/3fi3UztTepEx3ebIKiqrmRHDSbbKIOwUaNDXMYGd4w1Vbt",
      "WR2Pg/U38KlhODS2wl0ja+b0cC0eta3/YSvCBnjo2XQLryelySWeQTESbc4I1luodq59HVrX",
      "zVI7MiCX9MdRHg2orzq54TxN6gqlWnyF4fU1g6uh22Vb0Zb3yt5mBtO58a5nLD1+xucy5fhp",
      "HtN+8yCs2MuRLO8Hc5w7Nvuz6ZpiUggWd7QuvPkg7abS4srsvUmr2hvIhV+5cRqDqO+3aTn9",
      "a+i13/5ep7PW5J6EzW91H87HP5/CBXDHRnRVPpHNwwli5HPMpJddUwJ6gwzmRKDrwDSNr7Mc",
      "mNOJkSjZtRL+dz3LL1GOwPBPcF5aPQRrGHki76zuCYMcRg2imgNnFHvm3NHXcxuYx7QdOgBc",
      "1JVUEhzEuvj9f9owZ0g92AAA",
    ],
  },
  {
    path: "apps/referral-embed-web/lib/embed-fixtures.ts",
    sha256: "f523792124f02b953ac02f54388527c3734961cfcfcb4a3050ddadeac8c221d0",
    gzipBase64: [
      "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",
      "Rryp89LpGZrk7nMtTTZ819nwD7rYK+WiEQAA",
    ],
  },
];

type SubmitHelper = (
  p: DisplayObservationsParams,
  orderId: string,
  options?: SyntheticComplaintOptions,
) => Promise<{ caseNo: string }>;

// Reads a file at ORIGINAL_SOURCE_SHA from local git history, or returns
// undefined when that commit is not in the object store (shallow checkout).
type OriginalHistoryReader = (path: string) => string | undefined;

const readOriginalFromHistory: OriginalHistoryReader = (path) => {
  try {
    execFileSync("git", ["cat-file", "-e", `${ORIGINAL_SOURCE_SHA}^{commit}`], {
      stdio: "ignore",
    });
  } catch {
    return undefined;
  }
  return execFileSync("git", ["show", `${ORIGINAL_SOURCE_SHA}:${path}`], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
};

async function importOriginalHelper(
  root: string,
  readHistory: OriginalHistoryReader,
): Promise<{ module: Record<string, unknown>; crossChecked: string[] }> {
  const playwrightEntry = createRequire(import.meta.url).resolve(
    "@playwright/test",
  );
  const crossChecked: string[] = [];
  for (const { path, sha256, gzipBase64 } of ORIGINAL_SOURCES) {
    let source = gunzipSync(
      Buffer.from(gzipBase64.join(""), "base64"),
    ).toString("utf8");
    expect(createHash("sha256").update(source).digest("hex")).toBe(sha256);
    const fromHistory = readHistory(path);
    if (fromHistory !== undefined) {
      if (fromHistory !== source)
        throw new Error(
          `embedded original ${path} differs from git history at ${ORIGINAL_SOURCE_SHA}`,
        );
      crossChecked.push(path);
    }
    if (path === ORIGINAL_HELPER_PATH) {
      expect(sha256).toBe(ORIGINAL_SOURCE_SHA256);
      const specifier = '} from "@playwright/test";';
      expect(source.split(specifier)).toHaveLength(2);
      source = source.replace(
        specifier,
        `} from ${JSON.stringify(playwrightEntry)};`,
      );
    }
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), source, "utf8");
  }
  const module = (await import(
    /* @vite-ignore */ pathToFileURL(join(root, ORIGINAL_HELPER_PATH)).href
  )) as Record<string, unknown>;
  return { module, crossChecked };
}

// The task's expectation, applied identically to either helper version:
// one UI submission per category, each with its own case and journal.
async function submitThreeCategoryIntents(
  submit: SubmitHelper,
  directory: string,
): Promise<FakePanel> {
  const panel = new FakePanel();
  const params = makeParams(panel, directory);
  const caseNos: string[] = [];
  for (const category of MANUAL_COMPLAINT_CATEGORIES)
    caseNos.push((await submit(params, ORDER_ID, optionsFor(category))).caseNo);
  const submitted = panel.posts.map((post) => post.body.category);
  if (JSON.stringify(submitted) !== JSON.stringify(MANUAL_COMPLAINT_CATEGORIES))
    throw new Error(
      `three-category expectation failed: submitted categories ${JSON.stringify(submitted)}`,
    );
  if (new Set(caseNos).size !== MANUAL_COMPLAINT_CATEGORIES.length)
    throw new Error("three-category expectation failed: cases not distinct");
  for (const category of MANUAL_COMPLAINT_CATEGORIES)
    if (!(await exists(journalPath(directory, category))))
      throw new Error(
        `three-category expectation failed: no ${category} journal`,
      );
  return panel;
}

// Runs the original and the candidate helper against the same three-category
// expectation; returns the paths cross-checked against git history.
async function runOriginalVsCandidateProbe(
  readHistory: OriginalHistoryReader,
): Promise<string[]> {
  let crossChecked: string[] = [];
  await withDirectory("p5p7-original-", async (root) => {
    const imported = await importOriginalHelper(
      join(root, "source"),
      readHistory,
    );
    crossChecked = imported.crossChecked;
    const original = imported.module;
    expect(typeof original.submitSyntheticComplaint).toBe("function");
    expect(original.observeManualComplaintCategories).toBeUndefined();

    const originalJournals = join(root, "original-run");
    await expect(
      submitThreeCategoryIntents(
        original.submitSyntheticComplaint as SubmitHelper,
        originalJournals,
      ),
    ).rejects.toThrow(
      'three-category expectation failed: submitted categories ["service","service","service"]',
    );
    // The original only ever wrote its single service-default journal.
    expect(await exists(journalPath(originalJournals))).toBe(true);
    for (const category of MANUAL_COMPLAINT_CATEGORIES)
      expect(await exists(journalPath(originalJournals, category))).toBe(false);

    const candidatePanel = await submitThreeCategoryIntents(
      submitSyntheticComplaint,
      join(root, "candidate-run"),
    );
    expect(candidatePanel.posts.map((post) => post.body.category)).toEqual([
      "service",
      "fare",
      "lost_item",
    ]);
    expect(candidatePanel.selectedLabels).toEqual([
      "服務申訴",
      "車資申訴",
      "遺失物",
    ]);
  });
  return crossChecked;
}

describe(`original helper ${ORIGINAL_SOURCE_SHA} vs candidate (three-category coverage)`, () => {
  it("the original helper fails the three-category expectation; the candidate passes it", async () => {
    const historyAvailable =
      readOriginalFromHistory(ORIGINAL_HELPER_PATH) !== undefined;
    const crossChecked = await runOriginalVsCandidateProbe(
      readOriginalFromHistory,
    );
    // Full history: every embedded file is also verified against git.
    // Shallow checkout: the embedded, sha256-verified sources stand alone.
    expect(crossChecked).toEqual(
      historyAvailable ? ORIGINAL_SOURCES.map((source) => source.path) : [],
    );
  });

  it("runs the same probe when the original commit is absent (depth-1 checkout)", async () => {
    expect(await runOriginalVsCandidateProbe(() => undefined)).toEqual([]);
  });

  it("rejects embedded original source that differs from git history", async () => {
    await expect(
      runOriginalVsCandidateProbe(() => "// different original source\n"),
    ).rejects.toThrow(
      `embedded original ${ORIGINAL_HELPER_PATH} differs from git history at ${ORIGINAL_SOURCE_SHA}`,
    );
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
