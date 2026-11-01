import { mkdir, mkdtemp, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cancellationResults,
  type StageResult,
} from "../../e2e/owned-referral-business-journey/four-stage-cancellations";
import {
  LOW_RATING_COMBINATIONS,
  LOW_RATING_MATRIX_SCOPE,
  lowRatingResults,
  parseLowRatingCommand,
  runLowRatingMatrix,
  type LowRatingBrowserPort,
  type MainBrowserRatingWrite,
} from "../../e2e/owned-referral-business-journey/low-rating-matrix";
import {
  Evidence,
  JourneyFailure,
  hash,
  object,
  type CallOptions,
  type CallResult,
  type ObjectData,
} from "../../e2e/owned-referral-business-journey/protocol";

type Ports = Parameters<typeof runLowRatingMatrix>[0];
type Rating = {
  orderId: string;
  score: number;
  contactRequested: boolean;
  idempotencyKey: string;
  complaintCaseNo: string | null;
  submittedAt: string;
  tags: string[];
  comment: string | null;
};
type Options = {
  mainState?: "ack_unknown" | "acknowledged";
  mainScore?: number;
  mutateStage?: (stages: StageResult[]) => void;
  orderStatus?: Record<string, string>;
  preRated?: string;
  ackStatus?: number;
  ackBytes?: string;
  ackPatch?: Partial<Rating>;
  networkLostAfterForward?: boolean;
  duplicatePost?: boolean;
  uiBody?: (body: ObjectData) => ObjectData;
  replayCaseNo?: string;
  changedAccepted?: boolean;
  crmContactInverted?: boolean;
  noCaseForContactTrue?: boolean;
  journalFails?: boolean;
};

const DEFINITION = "a".repeat(40);
const RUNTIME = "b".repeat(40);
const MAIN = "order-main";
const IDS = {
  unassigned: "order-c1",
  "assigned-not-arrived": "order-c2",
  "arrived-not-started": "order-c3",
  "on-trip": "order-c4",
} as const;

/** Stateful external ports only (browser, Referral BFF, Ops readback, clock).
 * The real matrix helper, command parser, journal persistence and assertions
 * run unchanged; no product, HTTP, PG or browser runtime is started. */
async function fixture(options: Options = {}) {
  const parent =
    process.env.LOW_RATING_UNIT_OUTPUT ??
    join(process.cwd(), ".local/low-rating-unit-output");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "matrix-"));
  const evidence = new Evidence();
  const forwarded: ObjectData[] = [];
  const journalAtForward: unknown[] = [];
  const referralCalls: Array<{ path: string; body?: unknown }> = [];
  const ratings = new Map<string, Rating>();
  const complaints = new Map<string, ObjectData>();
  let caseSeq = 0;
  let clock = Date.parse("2026-10-28T01:00:00.000Z");
  const nowIso = () => new Date((clock += 1000)).toISOString();
  const statuses: Record<string, string> = {
    [MAIN]: "completed",
    [IDS.unassigned]: "cancelled",
    [IDS["assigned-not-arrived"]]: "completed",
    [IDS["arrived-not-started"]]: "completed",
    [IDS["on-trip"]]: "completed",
    ...options.orderStatus,
  };

  const writeRating = (orderId: string, body: ObjectData) => {
    const contactRequested = body.contactRequested as boolean;
    const score = body.score as number;
    const caseNo =
      score <= 2 && !(options.noCaseForContactTrue && contactRequested)
        ? `PAX-unit-${++caseSeq}`
        : null;
    const rating: Rating = {
      orderId,
      score,
      contactRequested,
      idempotencyKey: String(body.idempotencyKey),
      complaintCaseNo: caseNo,
      submittedAt: nowIso(),
      tags: [],
      comment: null,
    };
    ratings.set(orderId, rating);
    if (caseNo) {
      const consent = `同意客服聯繫：${
        (options.crmContactInverted ? !contactRequested : contactRequested)
          ? "是"
          : "否"
      }`;
      complaints.set(caseNo, {
        caseNo,
        relatedOrderId: orderId,
        description: `來源：轉介內嵌網頁\n${consent}\n轉介乘客評價 ${score} 星；`,
        timeline: [
          {
            caseNo,
            action: "case_created",
            note: `來源：轉介內嵌網頁；${consent}`,
          },
        ],
      });
    }
    return rating;
  };
  if (options.preRated)
    writeRating(options.preRated, {
      score: 4,
      contactRequested: false,
      idempotencyKey: "pre-existing",
    });
  // Original main browserRatingWrite: acknowledged score2/contactfalse.
  const mainBody = Object.freeze({
    orderId: MAIN,
    score: options.mainScore ?? 2,
    contactRequested: false,
    idempotencyKey: "referral-rating-main",
  });
  const mainRaw = JSON.stringify(mainBody);
  const mainCase = writeRating(MAIN, mainBody).complaintCaseNo!;
  const mainRating: MainBrowserRatingWrite = Object.freeze({
    state: options.mainState ?? "acknowledged",
    orderId: MAIN,
    body: mainBody,
    bodySha256: hash(Buffer.from(mainRaw, "utf8")),
    idempotencyKey: mainBody.idempotencyKey,
    responseStatus: 200,
    caseNo: mainCase,
    recovery: "original",
  } as MainBrowserRatingWrite);
  const mainSnapshot = JSON.stringify(mainRating);

  const stages = cancellationResults();
  for (const stage of stages) {
    const id = IDS[stage.stage];
    Object.assign(stage, {
      orderId: id,
      result: "observed",
      actualHttpStatus: stage.stage === "unassigned" ? 200 : 409,
      ...(stage.stage === "unassigned"
        ? { recovery: "already-terminal" }
        : {
            actualCode: "ORDER_NOT_CANCELABLE",
            recovery: "normal-driver-completion",
          }),
      journalState: "acknowledged",
      factsFile: `${directory}/cancellations/${stage.stage}-facts.json`,
    });
  }
  options.mutateStage?.(stages);

  const ratingResult = (rating: Rating) => {
    // The BFF result omits the stored idempotency key.
    const rest: Partial<Rating> = { ...rating };
    delete rest.idempotencyKey;
    return rest;
  };
  const response = (data: unknown, status = 200): CallResult => ({
    status,
    data: structuredClone(data),
    headers: new Headers({ "x-drts-candidate-sha": RUNTIME }),
    bytes: Buffer.from(JSON.stringify(data)),
  });
  // Product BFF semantics: same key/body replays the same rating; any change 409.
  const postRating = (orderId: string, body: ObjectData) => {
    if (statuses[orderId] !== "completed")
      return {
        status: 409,
        payload: {
          ok: false,
          error: { code: "PASSENGER_RATING_TRIP_NOT_COMPLETED" },
        },
      };
    const existing = ratings.get(orderId);
    if (existing) {
      if (
        options.changedAccepted ||
        (existing.score === body.score &&
          existing.contactRequested === body.contactRequested)
      )
        return {
          status: 200,
          payload: {
            ok: true,
            data: {
              ...ratingResult(existing),
              ...(options.replayCaseNo
                ? { complaintCaseNo: options.replayCaseNo }
                : {}),
            },
          },
        };
      return {
        status: 409,
        payload: {
          ok: false,
          error: { code: "PASSENGER_RATING_ALREADY_SUBMITTED" },
        },
      };
    }
    return {
      status: 200,
      payload: { ok: true, data: ratingResult(writeRating(orderId, body)) },
    };
  };
  const referral: Ports["referral"] = async (
    path: string,
    call: CallOptions = {},
  ) => {
    referralCalls.push({
      path,
      ...(call.body ? { body: structuredClone(call.body) } : {}),
    });
    let match = /^\/api\/referral\/history\/([^/]+)$/.exec(path);
    if (match) {
      const id = decodeURIComponent(match[1]!);
      const rating = ratings.get(id);
      return response({
        orderId: id,
        status: statuses[id],
        rating: rating ? ratingResult(rating) : null,
      });
    }
    match = /^\/api\/referral\/rating\/([^/]+)$/.exec(path);
    if (match && call.method === "POST") {
      const result = postRating(
        decodeURIComponent(match[1]!),
        object(call.body),
      );
      const expected = call.expected ?? [200];
      if (!expected.includes(result.status))
        throw new JourneyFailure("unit-referral-unexpected", result.status);
      return response(
        result.status === 200 ? object(result.payload).data : result.payload,
        result.status,
      );
    }
    throw new JourneyFailure("unit-unexpected-referral-route");
  };
  const opsControl: Ports["opsControl"] = async (path) => {
    let match = /^\/orders\/([^/]+)$/.exec(path);
    if (match) {
      const id = decodeURIComponent(match[1]!);
      return { orderId: id, status: statuses[id] };
    }
    match = /^\/complaints\/([^/]+)\/timeline$/.exec(path);
    if (match) {
      const complaint = complaints.get(decodeURIComponent(match[1]!));
      if (!complaint) throw new JourneyFailure("unit-complaint-missing", 404);
      return { items: structuredClone(complaint.timeline) };
    }
    match = /^\/complaints\/([^/]+)$/.exec(path);
    if (match) {
      const complaint = complaints.get(decodeURIComponent(match[1]!));
      if (!complaint) throw new JourneyFailure("unit-complaint-missing", 404);
      const rest = structuredClone(complaint);
      delete rest.timeline;
      return rest;
    }
    throw new JourneyFailure("unit-unexpected-Ops-route");
  };

  // Browser port: mirrors OutcomeScreen state (score, default-on contact,
  // UI-generated key); sends at most what the page sends.
  const ui = {
    orderId: "",
    score: null as number | null,
    contact: true,
    receipt: null as Rating | null,
    posts: new Map<string, number>(),
    keySeq: 0,
  };
  const actions: string[] = [];
  const browser: LowRatingBrowserPort = {
    async open(orderId) {
      actions.push(`open:${orderId}`);
      Object.assign(ui, {
        orderId,
        score: null,
        contact: true,
        receipt: null,
      });
      const existing = ratings.get(orderId);
      return {
        submitLabel: existing ? "評分已送出" : "送出評分",
        submitDisabled: true,
        contactSwitchCount: existing && existing.score <= 2 ? 1 : 0,
        ratingPostCount: ui.posts.get(orderId) ?? 0,
      };
    },
    async selectScore(score) {
      actions.push(`score:${score}`);
      ui.score = score;
      return {
        selectedStars: score,
        contactChecked: ui.contact,
        submitEnabled: true,
        ratingPostCount: ui.posts.get(ui.orderId) ?? 0,
      };
    },
    async toggleContact() {
      actions.push("toggle");
      ui.contact = !ui.contact;
      return {
        contactChecked: ui.contact,
        ratingPostCount: ui.posts.get(ui.orderId) ?? 0,
      };
    },
    async submit(orderId, beforeForward) {
      actions.push(`submit:${orderId}`);
      const command: ObjectData = {
        orderId,
        score: ui.score,
        contactRequested: (ui.score ?? 5) <= 2 ? ui.contact : false,
        idempotencyKey: `referral-rating-unit-${++ui.keySeq}`,
      };
      const body = options.uiBody ? options.uiBody(command) : command;
      const raw = JSON.stringify(body);
      const sends = options.duplicatePost ? 2 : 1;
      let last: { status: number; payload: unknown } | undefined;
      for (let i = 0; i < sends; i += 1) {
        ui.posts.set(orderId, (ui.posts.get(orderId) ?? 0) + 1);
        if (i === 0) {
          if (options.journalFails)
            throw new JourneyFailure("unit-journal-write-failed");
          // Throws abort the original request before the server sees it.
          await beforeForward(raw);
          journalAtForward.push(
            JSON.parse(
              await readFile(
                `${directory}/cancellations/${ui.orderId === orderId ? stageOf(orderId) : "x"}-low-rating-facts.json`,
                "utf8",
              ),
            ),
          );
        }
        forwarded.push(structuredClone(body));
        last = postRating(orderId, body);
      }
      if (options.networkLostAfterForward)
        throw new JourneyFailure("unit-browser-network-lost");
      const status = options.ackStatus ?? last!.status;
      const payload = object(last!.payload);
      if (payload.ok && options.ackPatch)
        payload.data = { ...object(payload.data), ...options.ackPatch };
      if (payload.ok && status === 200) ui.receipt = ratings.get(orderId)!;
      return {
        status,
        runtimeSha: RUNTIME,
        bytes: Buffer.from(options.ackBytes ?? JSON.stringify(payload)),
        ratingPostCount: ui.posts.get(orderId) ?? 0,
      };
    },
    async readLocked(orderId, caseNo) {
      const receipt = ratings.get(orderId)!;
      return {
        submitLabel: "評分已送出",
        submitDisabled: true,
        selectedStars: receipt.score,
        contactChecked: receipt.contactRequested,
        contactDisabled: true,
        statusText: `客訴案件：${caseNo}；${
          receipt.contactRequested
            ? "同意客服聯絡"
            : "不需客服聯絡，僅供內部檢視"
        }`,
        ratingPostCount: ui.posts.get(orderId) ?? 0,
      };
    },
  };
  const stageOf = (orderId: string) =>
    Object.entries(IDS).find(([, id]) => id === orderId)?.[0] ?? "unknown";
  const results = lowRatingResults();
  const ports: Ports = {
    definitionSha: DEFINITION,
    runtimeSha: RUNTIME,
    directory,
    mainOrderId: MAIN,
    mainRating,
    cancellations: stages,
    evidence,
    referral,
    opsControl,
    browser,
  };
  return {
    ports,
    results,
    directory,
    evidence,
    forwarded,
    journalAtForward,
    referralCalls,
    ratings,
    complaints,
    actions,
    mainRating,
    mainSnapshot,
    mainCase,
    run: () => runLowRatingMatrix(ports, results),
    facts: async (slot: string) =>
      JSON.parse(
        await readFile(
          `${directory}/cancellations/${slot}-low-rating-facts.json`,
          "utf8",
        ),
      ) as ObjectData,
  };
}

const failureStage = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(JourneyFailure);
    return (error as JourneyFailure).stage;
  }
  throw new Error("expected JourneyFailure");
};

describe("low-rating matrix: four <=2-star contact combinations", () => {
  it("declares exactly 1/2 x contact false/true, with main kept at 2/false", () => {
    const combos = LOW_RATING_COMBINATIONS.map(
      (c) => `${c.score}/${c.contactRequested}`,
    ).sort();
    expect(combos).toEqual(["1/false", "1/true", "2/false", "2/true"]);
    expect(LOW_RATING_COMBINATIONS[0]).toEqual({
      slot: "main",
      score: 2,
      contactRequested: false,
    });
    expect(new Set(LOW_RATING_COMBINATIONS.map((c) => c.slot)).size).toBe(4);
    expect(
      LOW_RATING_COMBINATIONS.some((c) => String(c.slot) === "unassigned"),
    ).toBe(false);
    // Before: the original FULL observed only the main 2/false combination.
    const before = lowRatingResults();
    expect(before.every((r) => r.result === "unexecuted")).toBe(true);
    expect(LOW_RATING_MATRIX_SCOPE).toContain("Not R04");
  });

  it("drives real UI controls for the three remaining combinations and proves same-case readbacks", async () => {
    const f = await fixture();
    await f.run();
    expect(
      f.results.map((r) => [
        r.slot,
        r.score,
        r.contactRequested,
        r.result,
        r.state,
      ]),
    ).toEqual([
      ["main", 2, false, "observed", "acknowledged"],
      ["assigned-not-arrived", 1, false, "observed", "acknowledged"],
      ["arrived-not-started", 1, true, "observed", "acknowledged"],
      ["on-trip", 2, true, "observed", "acknowledged"],
    ]);
    // Each <=2 rating creates its own case regardless of the contact switch.
    const caseNos = f.results.map((r) => r.caseNo);
    expect(new Set(caseNos).size).toBe(4);
    expect(f.results[0]!.caseNo).toBe(f.mainCase);
    for (const result of f.results.slice(1)) {
      const rating = f.ratings.get(result.orderId!)!;
      expect(rating).toMatchObject({
        score: result.score,
        contactRequested: result.contactRequested,
        complaintCaseNo: result.caseNo,
        idempotencyKey: result.idempotencyKey,
      });
      const complaint = f.complaints.get(result.caseNo!)!;
      expect(complaint.description).toContain(
        `同意客服聯繫：${result.contactRequested ? "是" : "否"}`,
      );
    }
    // Real switch operation: off for false, off-then-on for true; no POST on C1.
    expect(f.actions).toEqual([
      "open:order-c2",
      "score:1",
      "toggle",
      "submit:order-c2",
      "open:order-c3",
      "score:1",
      "toggle",
      "toggle",
      "submit:order-c3",
      "open:order-c4",
      "score:2",
      "toggle",
      "toggle",
      "submit:order-c4",
    ]);
    // Exactly one browser POST per new order, never one for main or C1.
    expect(f.forwarded.map((b) => b.orderId)).toEqual([
      "order-c2",
      "order-c3",
      "order-c4",
    ]);
    expect(f.ratings.has("order-c1")).toBe(false);
    // Replays used the exact original per-case body; changes were 409.
    for (const result of f.results.slice(1)) {
      const posts = f.referralCalls.filter(
        (c) => c.path === `/api/referral/rating/${result.orderId}`,
      );
      const original = f.forwarded.find((b) => b.orderId === result.orderId);
      expect(posts.map((p) => p.body)).toEqual([
        original,
        { ...original, score: result.score === 1 ? 2 : 1 },
        { ...original, contactRequested: !result.contactRequested },
        original,
      ]);
      const facts = await f.facts(result.slot);
      expect(object(facts.replay).conflicts).toEqual([
        {
          changed: "score",
          status: 409,
          code: "PASSENGER_RATING_ALREADY_SUBMITTED",
        },
        {
          changed: "contact",
          status: 409,
          code: "PASSENGER_RATING_ALREADY_SUBMITTED",
        },
      ]);
    }
    expect(
      f.evidence.events
        .filter((e) => e.stage.endsWith(":acknowledged"))
        .map((e) => e.stage),
    ).toEqual([
      "low-rating:assigned-not-arrived-score1-contactfalse:acknowledged",
      "low-rating:arrived-not-started-score1-contacttrue:acknowledged",
      "low-rating:on-trip-score2-contacttrue:acknowledged",
    ]);
  });

  it("journals the exact original body/key durably before forwarding", async () => {
    const f = await fixture();
    await f.run();
    expect(f.journalAtForward).toHaveLength(3);
    for (const [index, snapshot] of f.journalAtForward.entries()) {
      const journal = object(object(snapshot).ratingWrite);
      expect(journal.state).toBe("ack_unknown");
      expect(journal.body).toEqual(f.forwarded[index]);
      expect(journal.bodySha256).toBe(
        hash(Buffer.from(JSON.stringify(f.forwarded[index]), "utf8")),
      );
    }
    const final = await f.facts("on-trip");
    expect(object(final.ratingWrite).state).toBe("acknowledged");
    expect(object(final.result).result).toBe("observed");
  });

  it("keeps the original main browserRatingWrite immutable and never resubmits it", async () => {
    const f = await fixture();
    await f.run();
    expect(JSON.stringify(f.mainRating)).toBe(f.mainSnapshot);
    expect(
      f.referralCalls.some((c) => c.path === `/api/referral/rating/${MAIN}`),
    ).toBe(false);
    expect(f.results[0]).toMatchObject({
      source: "original-main-browserRatingWrite",
      idempotencyKey: "referral-rating-main",
    });
  });

  it("refuses when the main proof is not the honest acknowledged 2/false command", async () => {
    for (const options of [
      { mainState: "ack_unknown" as const },
      { mainScore: 1 },
    ]) {
      const f = await fixture(options);
      expect(await failureStage(f.run())).toMatch(/original main/);
      expect(f.actions).toEqual([]);
    }
  });

  it.each([
    ["missing order", (s: StageResult[]) => delete s[2]!.orderId],
    ["failed stage", (s: StageResult[]) => (s[1]!.result = "failed")],
    [
      "already-terminal, not normal completion",
      (s: StageResult[]) => (s[3]!.recovery = "already-terminal"),
    ],
    [
      "booking ACK unknown",
      (s: StageResult[]) => (s[1]!.journalState = "ack_unknown"),
    ],
    [
      "foreign facts file",
      (s: StageResult[]) =>
        (s[2]!.factsFile = "/elsewhere/arrived-not-started-facts.json"),
    ],
    ["reused main order", (s: StageResult[]) => (s[3]!.orderId = MAIN)],
    [
      "duplicate stage order",
      (s: StageResult[]) => (s[3]!.orderId = IDS["arrived-not-started"]),
    ],
    [
      "C1 not cancelled",
      (s: StageResult[]) => (s[0]!.expected = "ORDER_NOT_CANCELABLE"),
    ],
  ])(
    "refuses custody before any UI submit: %s",
    async (_label, mutateStage) => {
      const f = await fixture({ mutateStage });
      await failureStage(f.run());
      expect(f.actions.filter((a) => a.startsWith("submit:"))).toEqual([]);
      expect(f.forwarded).toEqual([]);
    },
  );

  it("refuses a non-completed or already-rated canonical order before any submit", async () => {
    for (const options of [
      { orderStatus: { [IDS["on-trip"]]: "on_trip" } },
      { preRated: IDS["arrived-not-started"] },
      { preRated: IDS.unassigned },
    ]) {
      const f = await fixture(options);
      await failureStage(f.run());
      expect(f.forwarded).toEqual([]);
    }
  });

  it.each([
    ["HTTP 500", { ackStatus: 500 }],
    ["malformed bytes", { ackBytes: "{not-json" }],
    ["network lost after forward", { networkLostAfterForward: true }],
    ["wrong ACK score", { ackPatch: { score: 2 } }],
    ["wrong ACK contact", { ackPatch: { contactRequested: true } }],
    ["missing case", { ackPatch: { complaintCaseNo: null } }],
    ["duplicate POST", { duplicatePost: true }],
  ])(
    "unknown/invalid ACK retains exact custody without resubmit: %s",
    async (_label, options) => {
      const f = await fixture(options);
      await failureStage(f.run());
      const first = f.results[1]!;
      expect(first.result).toBe("failed");
      expect(first.state).toBe("ack_unknown");
      expect(f.results.slice(2).every((r) => r.result === "unexecuted")).toBe(
        true,
      );
      const facts = await f.facts("assigned-not-arrived");
      const journal = object(facts.ratingWrite);
      expect(journal.state).toBe("ack_unknown");
      expect(journal.body).toEqual(f.forwarded[0]);
      expect(journal.idempotencyKey).toBe("referral-rating-unit-1");
      // No fresh key/body and no API initial rating afterwards.
      expect(f.actions.filter((a) => a.startsWith("submit:"))).toHaveLength(1);
      expect(
        f.referralCalls.filter((c) =>
          c.path.startsWith("/api/referral/rating/"),
        ),
      ).toEqual([]);
    },
  );

  it.each([
    ["wrong UI score", (b: ObjectData) => ({ ...b, score: 2 })],
    ["wrong UI contact", (b: ObjectData) => ({ ...b, contactRequested: true })],
    ["extra field", (b: ObjectData) => ({ ...b, comment: "x" })],
    ["other order", (b: ObjectData) => ({ ...b, orderId: MAIN })],
  ])(
    "never forwards a UI body that is not the exact combination: %s",
    async (_label, uiBody) => {
      const f = await fixture({ uiBody });
      await failureStage(f.run());
      expect(f.forwarded).toEqual([]);
      expect(f.results[1]!.state).toBeUndefined();
    },
  );

  it("aborts without forwarding when the journal cannot be written first", async () => {
    const f = await fixture({ journalFails: true });
    await failureStage(f.run());
    expect(f.forwarded).toEqual([]);
  });

  it("rejects a replay that changes case, an accepted changed body, and wrong CRM contact", async () => {
    expect(
      await failureStage((await fixture({ replayCaseNo: "PAX-other" })).run()),
    ).toMatch(/same canonical case/);
    expect(
      await failureStage((await fixture({ changedAccepted: true })).run()),
    ).toMatch(/unit-referral-unexpected/);
    expect(
      await failureStage((await fixture({ crmContactInverted: true })).run()),
    ).toMatch(/canonical-CRM-score-contact/);
  });

  it("requires a case for contact=true too (case is never contact-dependent)", async () => {
    const f = await fixture({ noCaseForContactTrue: true });
    expect(await failureStage(f.run())).toMatch(/creates a canonical case/);
    expect(f.results[1]!.result).toBe("observed");
    expect(f.results[2]!.result).toBe("failed");
  });

  it("parses only the exact original four-field command", () => {
    const expected = {
      orderId: "o",
      score: 1 as const,
      contactRequested: true,
    };
    const raw = JSON.stringify({
      orderId: "o",
      score: 1,
      contactRequested: true,
      idempotencyKey: "k",
    });
    expect(parseLowRatingCommand(raw, expected).idempotencyKey).toBe("k");
    expect(() => parseLowRatingCommand(`${raw} `, expected)).toThrow(
      JourneyFailure,
    );
    expect(() =>
      parseLowRatingCommand(
        JSON.stringify({
          orderId: "o",
          score: 1,
          contactRequested: true,
          idempotencyKey: "",
        }),
        expected,
      ),
    ).toThrow(JourneyFailure);
  });

  it("persists private facts with no passenger identity fields", async () => {
    const f = await fixture();
    await f.run();
    for (const result of f.results.slice(1)) {
      const file = `${f.directory}/cancellations/${result.slot}-low-rating-facts.json`;
      expect(result.factsFile).toBe(file);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      const raw = await readFile(file, "utf8");
      expect(raw).not.toMatch(
        /passengerName|passengerPhone|phone|cookie|token/i,
      );
      expect(
        Object.keys(
          object(object(JSON.parse(raw)).ratingWrite).body as ObjectData,
        ).sort(),
      ).toEqual(["contactRequested", "idempotencyKey", "orderId", "score"]);
    }
  });
});
