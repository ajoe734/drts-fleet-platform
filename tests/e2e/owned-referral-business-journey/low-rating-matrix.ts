import {
  JourneyFailure,
  hash,
  object,
  persistPrivateJson,
  records,
  requireFact,
  text,
  type CallOptions,
  type CallResult,
  type Evidence,
  type ObjectData,
} from "./protocol";
import type {
  CancellationStage,
  StageResult,
} from "./four-stage-cancellations";

// Original R04 confirmation: every score <=2 creates a case; the contact switch
// only decides whether that case asks for contact. The original FULL actually
// exercised only main score2/contactfalse. This leaf adds the remaining three
// combinations on same-run C2/C3/C4 orders that already finished their normal
// Driver completion. It is NOT R04/all 1–5 stars/monthly statistics completion.
export const LOW_RATING_MATRIX_SCOPE =
  "Four <=2-star contact combinations only: main 2/false (original browserRatingWrite) plus same-run C2/C3/C4 normal-completion owned orders. Not R04, all 1–5 star or monthly statistics completion.";

export type LowRatingScore = 1 | 2;
export type LowRatingSlot = "main" | Exclude<CancellationStage, "unassigned">;
export type LowRatingCombination = Readonly<{
  slot: LowRatingSlot;
  score: LowRatingScore;
  contactRequested: boolean;
}>;
export const LOW_RATING_COMBINATIONS: readonly LowRatingCombination[] =
  Object.freeze([
    Object.freeze({ slot: "main", score: 2, contactRequested: false }),
    Object.freeze({
      slot: "assigned-not-arrived",
      score: 1,
      contactRequested: false,
    }),
    Object.freeze({
      slot: "arrived-not-started",
      score: 1,
      contactRequested: true,
    }),
    Object.freeze({ slot: "on-trip", score: 2, contactRequested: true }),
  ] as const);

export type LowRatingCaseResult = {
  slot: LowRatingSlot;
  score: LowRatingScore;
  contactRequested: boolean;
  source:
    | "original-main-browserRatingWrite"
    | "same-run-cancellation-normal-driver-completion";
  result: "unexecuted" | "observed" | "failed";
  orderId?: string;
  state?: "ack_unknown" | "acknowledged";
  bodySha256?: string;
  idempotencyKey?: string;
  responseStatus?: number;
  caseNo?: string;
  factsFile?: string;
};
export function lowRatingResults(): LowRatingCaseResult[] {
  return LOW_RATING_COMBINATIONS.map((combination) => ({
    ...combination,
    source:
      combination.slot === "main"
        ? "original-main-browserRatingWrite"
        : "same-run-cancellation-normal-driver-completion",
    result: "unexecuted",
  }));
}

/** The original main browserRatingWrite, read only; never resubmitted here. */
export type MainBrowserRatingWrite = Readonly<{
  state: "ack_unknown" | "acknowledged";
  orderId: string;
  body: Readonly<ObjectData>;
  bodySha256: string;
  idempotencyKey: string;
  responseStatus?: number;
  caseNo?: string;
}>;

/** Real OutcomeScreen controls. Every observation reports the number of rating
 * POSTs the browser has actually sent for the selected order so far. */
export type LowRatingBrowserPort = {
  open(orderId: string): Promise<{
    submitLabel: string;
    submitDisabled: boolean;
    contactSwitchCount: number;
    ratingPostCount: number;
  }>;
  selectScore(score: LowRatingScore): Promise<{
    selectedStars: number;
    contactChecked: boolean;
    submitEnabled: boolean;
    ratingPostCount: number;
  }>;
  toggleContact(): Promise<{
    contactChecked: boolean;
    ratingPostCount: number;
  }>;
  /** Click the real submit button. `beforeForward` runs on the intercepted
   * original request before it reaches the server; if it throws, the request
   * must be aborted, never forwarded or replaced. */
  submit(
    orderId: string,
    beforeForward: (rawBody: string) => Promise<void>,
  ): Promise<{
    status: number;
    runtimeSha: string | undefined;
    bytes: Uint8Array;
    ratingPostCount: number;
  }>;
  readLocked(
    orderId: string,
    caseNo: string,
  ): Promise<{
    submitLabel: string;
    submitDisabled: boolean;
    selectedStars: number;
    contactChecked: boolean;
    contactDisabled: boolean;
    statusText: string;
    ratingPostCount: number;
  }>;
};

type Ports = {
  definitionSha: string;
  runtimeSha: string;
  directory: string;
  mainOrderId: string;
  mainRating: MainBrowserRatingWrite | undefined;
  cancellations: readonly StageResult[];
  evidence: Evidence;
  referral: (path: string, options?: CallOptions) => Promise<CallResult>;
  opsControl: (path: string, options?: CallOptions) => Promise<ObjectData>;
  browser: LowRatingBrowserPort;
};

const RATING_COMMAND_KEYS = "contactRequested,idempotencyKey,orderId,score";
const contactLabel = (contactRequested: boolean) =>
  `同意客服聯繫：${contactRequested ? "是" : "否"}`;
const uiContactText = (contactRequested: boolean) =>
  contactRequested ? "同意客服聯絡" : "不需客服聯絡，僅供內部檢視";

/** Exact original UI command for one combination; rejects anything else. */
export function parseLowRatingCommand(
  rawBody: string,
  expected: {
    orderId: string;
    score: LowRatingScore;
    contactRequested: boolean;
  },
): Readonly<ObjectData> & { idempotencyKey: string } {
  requireFact(
    Buffer.byteLength(rawBody, "utf8") <= 2048,
    "bounded low-rating command",
  );
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new JourneyFailure("low-rating command must be JSON");
  }
  const body = object(value);
  requireFact(
    Object.keys(body).sort().join(",") === RATING_COMMAND_KEYS,
    "low-rating command carries only the original four business fields",
  );
  requireFact(
    body.orderId === expected.orderId &&
      body.score === expected.score &&
      body.contactRequested === expected.contactRequested,
    "actual UI same-order score/contact command",
  );
  const key = text(body.idempotencyKey, "original browser rating key required");
  requireFact(key.length <= 255, "bounded original browser rating key");
  requireFact(
    JSON.stringify(body) === rawBody,
    "exact browser rating JSON retained for API replay",
  );
  return Object.freeze(body) as Readonly<ObjectData> & {
    idempotencyKey: string;
  };
}

/** Same-case ACK/replay facts for one combination (not the main-only helper). */
export function assertLowRatingAck(
  ack: ObjectData,
  expected: {
    orderId: string;
    score: LowRatingScore;
    contactRequested: boolean;
    caseNo?: string;
    submittedAt?: string;
  },
) {
  requireFact(ack.orderId === expected.orderId, "low-rating order binding");
  requireFact(ack.score === expected.score, "low-rating exact score");
  requireFact(
    ack.contactRequested === expected.contactRequested,
    "low-rating exact contact preference",
  );
  const caseNo = text(
    ack.complaintCaseNo,
    "every <=2-star rating creates a canonical case",
  );
  requireFact(
    expected.caseNo === undefined || caseNo === expected.caseNo,
    "low-rating same canonical case",
  );
  const submittedAt = text(ack.submittedAt, "low-rating submittedAt");
  requireFact(
    Number.isFinite(Date.parse(submittedAt)) &&
      (expected.submittedAt === undefined ||
        submittedAt === expected.submittedAt),
    "low-rating original submission time retained",
  );
  requireFact(
    Array.isArray(ack.tags) &&
      ack.tags.length === 0 &&
      (ack.comment === null || ack.comment === undefined),
    "UI sent no tags/comment; none manufactured",
  );
  return { caseNo, submittedAt };
}

function assertSameRunCompletedCustody(
  stage: StageResult,
  directory: string,
): string {
  requireFact(
    stage.result === "observed" &&
      stage.expected === "ORDER_NOT_CANCELABLE" &&
      stage.actualCode === "ORDER_NOT_CANCELABLE" &&
      stage.actualHttpStatus === 409 &&
      stage.recovery === "normal-driver-completion" &&
      stage.journalState === "acknowledged" &&
      stage.factsFile ===
        `${directory}/cancellations/${stage.stage}-facts.json`,
    `low-rating:${stage.stage}:same-run-acknowledged-normal-completion-custody`,
  );
  return text(
    stage.orderId,
    `low-rating:${stage.stage}:same-run-acknowledged-order-required`,
  );
}

/**
 * Adds the three remaining real UI low-rating combinations. All custody is
 * proven before the first new submission; one original POST per order, with its
 * exact body/key journaled before it is forwarded. Unknown ACK retains that
 * journal and never resubmits a fresh key/body.
 */
export async function runLowRatingMatrix(
  p: Ports,
  results: LowRatingCaseResult[],
) {
  requireFact(
    results.length === LOW_RATING_COMBINATIONS.length &&
      results.every(
        (result, index) =>
          result.slot === LOW_RATING_COMBINATIONS[index]!.slot &&
          result.score === LOW_RATING_COMBINATIONS[index]!.score &&
          result.contactRequested ===
            LOW_RATING_COMBINATIONS[index]!.contactRequested &&
          result.result === "unexecuted",
      ),
    "four fresh low-rating combinations required",
  );
  requireFact(
    /^[a-f0-9]{40}$/.test(p.definitionSha) &&
      /^[a-f0-9]{40}$/.test(p.runtimeSha),
    "low-rating immutable sources required",
  );

  // Main compatibility: original browserRatingWrite stays the 2/false proof.
  const main = results[0]!;
  const mainRating = p.mainRating;
  requireFact(
    mainRating &&
      mainRating.state === "acknowledged" &&
      mainRating.orderId === p.mainOrderId,
    "original main browserRatingWrite acknowledged",
  );
  const mainBody = mainRating.body;
  requireFact(
    Object.keys(mainBody).sort().join(",") === RATING_COMMAND_KEYS &&
      mainBody.orderId === p.mainOrderId &&
      mainBody.score === 2 &&
      mainBody.contactRequested === false &&
      mainBody.idempotencyKey === mainRating.idempotencyKey &&
      hash(Buffer.from(JSON.stringify(mainBody), "utf8")) ===
        mainRating.bodySha256,
    "original main score2 contactfalse command",
  );
  const mainCaseNo = text(mainRating.caseNo, "original main case required");
  Object.assign(main, {
    result: "observed",
    orderId: p.mainOrderId,
    state: "acknowledged",
    bodySha256: mainRating.bodySha256,
    idempotencyKey: mainRating.idempotencyKey,
    ...(mainRating.responseStatus !== undefined
      ? { responseStatus: mainRating.responseStatus }
      : {}),
    caseNo: mainCaseNo,
  });

  // Preflight every custody before any new UI submit.
  const byStage = (stage: CancellationStage) => {
    const matches = p.cancellations.filter((c) => c.stage === stage);
    requireFact(matches.length === 1, `low-rating:${stage}:one-stage-result`);
    return matches[0]!;
  };
  const history = async (orderId: string) =>
    object(
      (await p.referral(`/api/referral/history/${encodeURIComponent(orderId)}`))
        .data,
    );
  const c1 = byStage("unassigned");
  const c1OrderId = text(c1.orderId, "low-rating:unassigned:order-required");
  requireFact(
    c1.result === "observed" && c1.expected === "cancelled",
    "low-rating:unassigned:same-run-cancelled",
  );
  const c1History = await history(c1OrderId);
  requireFact(
    c1History.orderId === c1OrderId &&
      c1History.status === "cancelled" &&
      (c1History.rating === null || c1History.rating === undefined),
    "low-rating:unassigned:cancelled-stays-unrated",
  );
  const custody = new Map<
    LowRatingSlot,
    { orderId: string; stage: StageResult }
  >();
  const seen = new Set([p.mainOrderId, c1OrderId]);
  for (const result of results.slice(1)) {
    const stage = byStage(result.slot as Exclude<LowRatingSlot, "main">);
    const orderId = assertSameRunCompletedCustody(stage, p.directory);
    requireFact(
      !seen.has(orderId),
      `low-rating:${result.slot}:distinct-owned-order`,
    );
    seen.add(orderId);
    const order = await p.opsControl(`/orders/${encodeURIComponent(orderId)}`);
    requireFact(
      order.orderId === orderId && order.status === "completed",
      `low-rating:${result.slot}:canonical-completed`,
    );
    const before = await history(orderId);
    requireFact(
      before.orderId === orderId &&
        before.status === "completed" &&
        (before.rating === null || before.rating === undefined),
      `low-rating:${result.slot}:canonical-previously-unrated`,
    );
    custody.set(result.slot, { orderId, stage });
  }
  p.evidence.record({
    stage: "low-rating-matrix:main-two-contactfalse-original-retained",
    orderId: p.mainOrderId,
    caseNo: mainCaseNo,
    sha256: mainRating.bodySha256,
    result: "retained",
  });

  const caseNos = new Set([mainCaseNo]);
  for (const result of results.slice(1)) {
    const { orderId, stage } = custody.get(result.slot)!;
    const { score, contactRequested } = result;
    const name = `${result.slot}-score${score}-contact${contactRequested}`;
    const file = `${p.directory}/cancellations/${result.slot}-low-rating-facts.json`;
    result.orderId = orderId;
    result.factsFile = file;
    let body: (Readonly<ObjectData> & { idempotencyKey: string }) | undefined;
    const facts: ObjectData = {
      definitionSha: p.definitionSha,
      runtimeSha: p.runtimeSha,
      scope: LOW_RATING_MATRIX_SCOPE,
      custody: {
        stage: stage.stage,
        orderId,
        recovery: stage.recovery,
        bookingJournalState: stage.journalState,
        cancellationFacts: stage.factsFile,
      },
    };
    const persist = () =>
      persistPrivateJson(file, {
        ...facts,
        result: { ...result },
        ...(body
          ? {
              ratingWrite: {
                state: result.state,
                body,
                bodySha256: result.bodySha256,
                idempotencyKey: body.idempotencyKey,
                recovery:
                  "Preserve this original UI body/key. Read the same order and replay only this command after normal same-subject authentication; do not create another rating key or order.",
              },
            }
          : {}),
      });
    try {
      const opened = await p.browser.open(orderId);
      requireFact(
        opened.submitLabel === "送出評分" &&
          opened.submitDisabled &&
          opened.contactSwitchCount === 0 &&
          opened.ratingPostCount === 0,
        `low-rating:${result.slot}:fresh-unrated-UI-without-retained-command`,
      );
      const selected = await p.browser.selectScore(score);
      requireFact(
        selected.selectedStars === score &&
          selected.contactChecked === true &&
          selected.submitEnabled &&
          selected.ratingPostCount === 0,
        `low-rating:${result.slot}:stars-select-without-submission`,
      );
      // Operate the real switch: off for false; off then back on for true.
      const off = await p.browser.toggleContact();
      requireFact(
        off.contactChecked === false && off.ratingPostCount === 0,
        `low-rating:${result.slot}:contact-switch-off-without-submission`,
      );
      if (contactRequested) {
        const on = await p.browser.toggleContact();
        requireFact(
          on.contactChecked === true && on.ratingPostCount === 0,
          `low-rating:${result.slot}:contact-switch-on-without-submission`,
        );
      }
      facts.uiBeforeSubmit = { selectedStars: score, contactRequested };
      await persist();

      const submitted = await p.browser.submit(orderId, async (rawBody) => {
        requireFact(!body, `low-rating:${result.slot}:one-original-POST-only`);
        const parsed = parseLowRatingCommand(rawBody, {
          orderId,
          score,
          contactRequested,
        });
        body = parsed;
        result.state = "ack_unknown";
        result.bodySha256 = hash(Buffer.from(rawBody, "utf8"));
        result.idempotencyKey = parsed.idempotencyKey;
        // Durable before the original request is forwarded to the server.
        await persist();
      });
      requireFact(body, `low-rating:${result.slot}:original-command-captured`);
      result.responseStatus = submitted.status;
      await persist();
      requireFact(
        submitted.ratingPostCount === 1,
        `low-rating:${result.slot}:exactly-one-browser-POST`,
      );
      if (submitted.status !== 200)
        throw new JourneyFailure(
          `low-rating:${result.slot}:request`,
          submitted.status,
        );
      requireFact(
        submitted.runtimeSha === p.runtimeSha,
        `low-rating:${result.slot}:runtime-SHA`,
      );
      let payload: ObjectData;
      try {
        payload = object(
          JSON.parse(Buffer.from(submitted.bytes).toString("utf8")),
        );
      } catch {
        throw new JourneyFailure(`low-rating:${result.slot}:malformed-ACK`);
      }
      requireFact(
        payload.ok === true,
        `low-rating:${result.slot}:ACK-envelope`,
      );
      const first = object(payload.data);
      const { caseNo, submittedAt } = assertLowRatingAck(first, {
        orderId,
        score,
        contactRequested,
      });
      requireFact(
        !caseNos.has(caseNo),
        `low-rating:${result.slot}:own-distinct-case`,
      );
      caseNos.add(caseNo);
      result.state = "acknowledged";
      result.caseNo = caseNo;
      facts.ack = { caseNo, submittedAt, score, contactRequested };
      await persist();
      p.evidence.record({
        stage: `low-rating:${name}:acknowledged`,
        orderId,
        caseNo,
        status: submitted.status,
        sha256: text(result.bodySha256, "low-rating journaled body hash"),
        result: "observed",
      });

      const locked = await p.browser.readLocked(orderId, caseNo);
      requireFact(
        locked.submitLabel === "評分已送出" &&
          locked.submitDisabled &&
          locked.selectedStars === score &&
          locked.contactChecked === contactRequested &&
          locked.contactDisabled &&
          locked.statusText.includes(caseNo) &&
          locked.statusText.includes(uiContactText(contactRequested)) &&
          locked.ratingPostCount === 1,
        `low-rating:${result.slot}:UI-locked-same-case`,
      );

      // Replay only the captured original body/key; changes must conflict.
      const ratingPath = `/api/referral/rating/${encodeURIComponent(orderId)}`;
      const expectedAck = {
        orderId,
        score,
        contactRequested,
        caseNo,
        submittedAt,
      };
      assertLowRatingAck(
        object((await p.referral(ratingPath, { method: "POST", body })).data),
        expectedAck,
      );
      const conflicts: ObjectData[] = [];
      for (const [label, changed] of [
        ["score", { ...body, score: score === 1 ? 2 : 1 }],
        ["contact", { ...body, contactRequested: !contactRequested }],
      ] as const) {
        const response = await p.referral(ratingPath, {
          method: "POST",
          body: changed,
          expected: [409],
        });
        requireFact(
          response.status === 409,
          `low-rating:${result.slot}:changed-${label}-conflict409`,
        );
        const error = object(object(response.data).error);
        conflicts.push({
          changed: label,
          status: 409,
          code: error.code ?? null,
        });
      }
      assertLowRatingAck(
        object((await p.referral(ratingPath, { method: "POST", body })).data),
        expectedAck,
      );
      facts.replay = { sameKeyBody: "same-case", conflicts };

      const persisted = await history(orderId);
      requireFact(
        persisted.orderId === orderId && persisted.status === "completed",
        `low-rating:${result.slot}:history-order`,
      );
      assertLowRatingAck(
        { ...object(persisted.rating), orderId: persisted.orderId },
        expectedAck,
      );
      const complaint = await p.opsControl(
        `/complaints/${encodeURIComponent(caseNo)}`,
      );
      requireFact(
        complaint.caseNo === caseNo &&
          complaint.relatedOrderId === orderId &&
          typeof complaint.description === "string" &&
          complaint.description.includes(contactLabel(contactRequested)) &&
          complaint.description.includes(`轉介乘客評價 ${score} 星`),
        `low-rating:${result.slot}:canonical-CRM-score-contact`,
      );
      const timeline = await p.opsControl(
        `/complaints/${encodeURIComponent(caseNo)}/timeline`,
      );
      requireFact(
        records(timeline.items).some(
          (item) =>
            item.caseNo === caseNo &&
            item.action === "case_created" &&
            typeof item.note === "string" &&
            item.note.includes(contactLabel(contactRequested)),
        ),
        `low-rating:${result.slot}:canonical-CRM-creation-timeline`,
      );
      const later = await history(orderId);
      assertLowRatingAck(
        { ...object(later.rating), orderId: later.orderId },
        expectedAck,
      );
      facts.readbacks = {
        history: "same score/contact/case/submittedAt",
        crm: "same order case with exact score/contact",
        timeline: "case_created with exact contact",
        afterReplay: "unchanged",
      };
      result.result = "observed";
      await persist();
      p.evidence.record({
        stage: `low-rating:${name}:same-case-replay-conflict409-readbacks`,
        orderId,
        caseNo,
        result: "retained",
      });
    } catch (error) {
      result.result = "failed";
      p.evidence.failure(error);
      try {
        await persist();
      } catch {
        // Keep the original failure; the earlier durable journal remains.
      }
      throw error;
    }
  }
  return results;
}
