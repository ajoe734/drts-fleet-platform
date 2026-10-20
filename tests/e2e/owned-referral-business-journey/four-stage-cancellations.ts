import {
  BookingWriteJournal,
  JourneyFailure,
  assertBusinessOrderProduct,
  assertNoForeignActive,
  assertOwnPair,
  assertTask,
  hash,
  object,
  persistPrivateJson,
  records,
  requireFact,
  simulationCompletion,
  text,
  type CallOptions,
  type CallResult,
  type Evidence,
  type ObjectData,
} from "./protocol";

export type CancellationStage =
  | "unassigned"
  | "assigned-not-arrived"
  | "arrived-not-started"
  | "on-trip";
export type StageResult = {
  stage: CancellationStage;
  expected: "cancelled" | "ORDER_NOT_CANCELABLE";
  result: "unexecuted" | "observed" | "failed";
  orderId?: string;
  taskId?: string;
  assignmentId?: string;
  dispatchJobId?: string;
  actualHttpStatus?: number;
  actualCode?: string;
  recovery?:
    | "already-terminal"
    | "normal-passenger-cancel"
    | "normal-driver-completion"
    | "retained-unresolved";
  journalState?: "ack_unknown" | "acknowledged";
  factsFile?: string;
};
export function cancellationResults(): StageResult[] {
  return [
    { stage: "unassigned", expected: "cancelled", result: "unexecuted" },
    {
      stage: "assigned-not-arrived",
      expected: "ORDER_NOT_CANCELABLE",
      result: "unexecuted",
    },
    {
      stage: "arrived-not-started",
      expected: "ORDER_NOT_CANCELABLE",
      result: "unexecuted",
    },
    {
      stage: "on-trip",
      expected: "ORDER_NOT_CANCELABLE",
      result: "unexecuted",
    },
  ];
}
type Ports = {
  definitionSha: string;
  runtimeSha: string;
  directory: string;
  nonce: string;
  entrySlug: string;
  partnerUserRef: string;
  passengerId: string;
  completedMainOrderId: string;
  driverId: string;
  vehicleId: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickup: ObjectData;
  passengerName: string;
  passengerPhone: string;
  photoDataUrl: string;
  evidence: Evidence;
  referral: (path: string, options?: CallOptions) => Promise<CallResult>;
  adminControl: (path: string, options?: CallOptions) => Promise<ObjectData>;
  opsControl: (path: string, options?: CallOptions) => Promise<ObjectData>;
  driver: (path: string, options?: CallOptions) => Promise<ObjectData>;
  heartbeat: (taskId: string | null, workState: string) => Promise<void>;
  cancelFromActualUI: (
    orderId: string,
    expectedRefusal: boolean,
  ) => Promise<
    CallResult & {
      command: ObjectData;
      requestSource: "actual-ui" | "passenger-api-policy-probe";
      uiDisabled: boolean;
    }
  >;
  capture: (
    name: string,
    orderId: string,
    screen: "trip" | "cancelled" | "completed",
  ) => Promise<{ file: string; bytes: number; sha256: string }>;
};

// The quote timing is immediate, but the real producer creates reservation
// enterprise orders. Only the original fresh-created exception bypasses the
// already-past reservation cutoff. These are observations, not new rules/fees.
export async function runFourStageOwnedCancellations(
  p: Ports,
  results: StageResult[],
) {
  requireFact(results.length === 4, "four cancellation observations required");
  for (const result of results) {
    const file = `${p.directory}/cancellations/${result.stage}`;
    const caseNonce = `${p.nonce}-${result.stage}`;
    let journal: BookingWriteJournal | undefined;
    let ownedId: string | undefined;
    let frozenQuoteId: string | undefined;
    let taskId: string | undefined;
    let assignmentId: string | undefined;
    let jobId: string | undefined;
    let failure: unknown;
    const facts: ObjectData = {
      definitionSha: p.definitionSha,
      runtimeSha: p.runtimeSha,
      stage: result.stage,
      expected: result.expected,
      simulation:
        "Owned synthetic supply, Driver-declared GPS/photo/fare. No physical trip, provider GNSS, cancellation fee, refund or PSP claim.",
      assignmentStatusLimit:
        "The assign ACK exposes assigned status. Later task assignmentId is bound, but no private assignment SQL/status is invented as a public readback.",
    };
    const getOrder = async () => {
      requireFact(ownedId, "actual acknowledged case order required");
      const order = await p.opsControl(
        `/orders/${encodeURIComponent(ownedId)}`,
      );
      requireFact(
        order.orderId === ownedId &&
          order.partnerEntrySlug === p.entrySlug &&
          object(order.passenger).passengerId === p.passengerId,
        "cancellation exact owned subject and order",
      );
      requireFact(
        order.dispatchSemantics === "reservation",
        "current reservation producer contract required",
      );
      requireFact(frozenQuoteId, "original cancellation case quote required");
      assertBusinessOrderProduct(order, frozenQuoteId);
      return order;
    };
    const getTask = async () => {
      requireFact(
        ownedId && taskId && assignmentId && jobId,
        "own assigned task required",
      );
      const task = await p.driver(
        `/api/driver/tasks/${encodeURIComponent(taskId)}`,
      );
      assertTask(task, {
        orderId: ownedId,
        taskId,
        driverId: p.driverId,
        vehicleId: p.vehicleId,
      });
      requireFact(
        task.assignmentId === assignmentId && task.dispatchJobId === jobId,
        "stable case task assignment and dispatch binding",
      );
      return task;
    };
    const orderFacts = (order: ObjectData) => ({
      orderId: order.orderId,
      status: order.status,
      updatedAt: order.updatedAt,
      createdAt: order.createdAt,
      cancelableUntil: order.cancelableUntil,
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason,
      dispatchSemantics: order.dispatchSemantics,
      partnerEntrySlug: order.partnerEntrySlug,
    });
    const taskFacts = (task: ObjectData) => ({
      orderId: task.orderId,
      taskId: task.taskId,
      assignmentId: task.assignmentId,
      dispatchJobId: task.dispatchJobId,
      driverId: task.driverId,
      vehicleId: task.vehicleId,
      status: task.status,
      acceptedAt: task.acceptedAt,
      departedAt: task.departedAt,
      arrivedPickupAt: task.arrivedPickupAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    });
    const advance = async (
      action: "accept" | "depart" | "arrived_pickup" | "start",
    ) => {
      requireFact(taskId, "normal bound Driver task required");
      const timeKey = {
        accept: "acceptedAt",
        depart: "departedAt",
        arrived_pickup: "arrivedAt",
        start: "startedAt",
      }[action];
      await p.driver(
        `/api/driver/tasks/${encodeURIComponent(taskId)}/${action}`,
        {
          method: "POST",
          body: {
            [timeKey]: new Date().toISOString(),
            ...(action === "depart" ? { currentLocation: p.pickup } : {}),
          },
        },
      );
      await getTask();
      await p.heartbeat(
        taskId,
        {
          accept: "assigned",
          depart: "enroute",
          arrived_pickup: "arrived",
          start: "on_trip",
        }[action],
      );
    };
    const completeNormally = async () => {
      requireFact(taskId, "own task required for normal completion recovery");
      let task = await getTask();
      // Progress only the already-bound owned task through its existing API.
      // Never mutate state, cancel with a system bypass, or create another order.
      if (task.status === "pending_acceptance") {
        await advance("accept");
        task = await getTask();
      }
      if (task.status === "accepted") {
        await advance("depart");
        task = await getTask();
      }
      if (task.status === "enroute_pickup") {
        await advance("arrived_pickup");
        task = await getTask();
      }
      if (task.status === "arrived_pickup") {
        await advance("start");
        task = await getTask();
      }
      requireFact(
        task.status === "on_trip",
        "normal recovery supports actual started own task only",
      );
      const command = simulationCompletion(await getOrder(), p.photoDataUrl);
      await p.driver(
        `/api/driver/tasks/${encodeURIComponent(taskId)}/complete`,
        { method: "POST", body: command },
      );
      requireFact(
        (await getTask()).status === "completed" &&
          (await getOrder()).status === "completed",
        "normal own completion terminal readback",
      );
      result.recovery = "normal-driver-completion";
    };
    try {
      assertNoForeignActive((await p.referral("/api/referral/active")).data);
      await p.adminControl(
        `/regulatory-registry/drivers/${encodeURIComponent(p.driverId)}/work-state`,
        { method: "POST", body: { workState: "available" } },
      );
      await p.heartbeat(null, "available");
      const quote = object(
        (
          await p.referral("/api/referral/quote", {
            method: "POST",
            body: {
              entrySlug: p.entrySlug,
              pickupAddress: p.pickupAddress,
              dropoffAddress: p.dropoffAddress,
              vehicleType: "standard",
            },
          })
        ).data,
      );
      requireFact(
        quote.fixedPrice === false &&
          quote.isGuaranteed === false &&
          quote.timingMode === "immediate" &&
          quote.requestedScheduledAt === null &&
          quote.pickupAddress === p.pickupAddress &&
          quote.dropoffAddress === p.dropoffAddress,
        "fresh original nonfixed immediate quote required",
      );
      frozenQuoteId = text(quote.quoteId);
      const key = `${caseNonce}-booking`;
      const command = {
        entrySlug: p.entrySlug,
        quoteId: frozenQuoteId,
        pickupAddress: p.pickupAddress,
        dropoffAddress: p.dropoffAddress,
        vehicleType: "standard",
        passengerName: p.passengerName,
        passengerPhone: p.passengerPhone,
        idempotencyKey: key,
      };
      journal = new BookingWriteJournal(
        {
          definitionSha: p.definitionSha,
          runtimeSha: p.runtimeSha,
          nonce: caseNonce,
          entrySlug: p.entrySlug,
          partnerUserRef: p.partnerUserRef,
          quoteId: frozenQuoteId,
          pickupAddress: p.pickupAddress,
          dropoffAddress: p.dropoffAddress,
          passengerName: p.passengerName,
          passengerPhone: p.passengerPhone,
          vehicleType: "standard",
        },
        (snapshot) =>
          persistPrivateJson(`${file}-booking-write-journal.json`, snapshot),
      );
      let acknowledgement: ObjectData | undefined;
      await journal.beforeSend(JSON.stringify(command), key, async () => {
        acknowledgement = object(
          (
            await p.referral("/api/referral/booking", {
              method: "POST",
              body: command,
              headers: { "Idempotency-Key": key },
            })
          ).data,
        );
      });
      requireFact(acknowledgement, "actual case booking ACK required");
      const ack = acknowledgement as ObjectData;
      requireFact(
        object(ack.quote).quoteId === quote.quoteId,
        "case consumes its own current quote",
      );
      // An actually received ACK identifies the owned order even if the local
      // durable acknowledgement write then fails. Preserve that failure/journal.
      ownedId = text(ack.orderId);
      result.orderId = ownedId;
      requireFact(
        ownedId !== p.completedMainOrderId &&
          results.every(
            (other) => other === result || other.orderId !== ownedId,
          ),
        "four cancellation UUIDs must differ from each other and the completed main order",
      );
      await journal.acknowledge(ownedId, text(quote.quoteId));
      const created = await getOrder();
      requireFact(
        created.status === "created",
        "unassigned created stage required",
      );
      const ownedTasks = records(
        (await p.driver("/api/driver/tasks")).items,
      ).filter((task) => task.orderId === ownedId);
      requireFact(
        ownedTasks.length === 0,
        "unassigned has no owned Driver task",
      );
      if (result.stage !== "unassigned") {
        const dispatch = await p.opsControl(
          `/orders/${encodeURIComponent(ownedId)}/dispatch`,
          {
            method: "POST",
            body: { mode: "auto" },
            headers: { "Idempotency-Key": `${caseNonce}-dispatch` },
          },
        );
        jobId = text(dispatch.dispatchJobId);
        result.dispatchJobId = jobId;
        const candidates = records(
          (
            await p.opsControl(
              `/dispatch/tasks/${encodeURIComponent(jobId)}/candidates?includeIneligible=true`,
            )
          ).items,
        );
        const own = candidates.find(
          (candidate) =>
            candidate.driverId === p.driverId &&
            candidate.vehicleId === p.vehicleId,
        );
        requireFact(own, "normal own pair candidate required");
        assertOwnPair(own, p);
        const assignment = await p.opsControl("/dispatch/assign", {
          method: "POST",
          body: {
            dispatchJobId: jobId,
            driverId: p.driverId,
            vehicleId: p.vehicleId,
          },
          headers: { "Idempotency-Key": `${caseNonce}-assign` },
        });
        taskId = text(assignment.taskId);
        assignmentId = text(assignment.assignmentId);
        result.taskId = taskId;
        result.assignmentId = assignmentId;
        requireFact(
          assignment.status === "assigned",
          "normal assigned ACK status",
        );
        facts.assignmentACK = {
          assignmentId,
          taskId,
          status: assignment.status,
        };
        const list = records(
          (await p.driver("/api/driver/tasks")).items,
        ).filter((task) => task.orderId === ownedId);
        requireFact(
          list.length === 1 && list[0]?.taskId === taskId,
          "exactly one bound own task",
        );
        await advance("accept");
        if (result.stage !== "assigned-not-arrived") {
          await advance("depart");
          await advance("arrived_pickup");
          if (result.stage === "on-trip") await advance("start");
        }
      }
      const before = await getOrder();
      // Record the genuine clock; never move it or stretch the two-minute exception.
      facts.observedBeforeCancelAt = new Date().toISOString();
      requireFact(
        Number.isFinite(Date.parse(String(before.createdAt))) &&
          Number.isFinite(Date.parse(String(before.cancelableUntil))) &&
          Date.parse(String(before.cancelableUntil)) < Date.now(),
        "real producer reservation cutoff already elapsed",
      );
      const taskBefore = taskId ? await getTask() : null;
      const expectedState = {
        unassigned: ["created", null],
        "assigned-not-arrived": ["driver_accepted", "accepted"],
        "arrived-not-started": ["arrived_pickup", "arrived_pickup"],
        "on-trip": ["on_trip", "on_trip"],
      }[result.stage];
      requireFact(
        before.status === expectedState[0] &&
          (taskBefore?.status ?? null) === expectedState[1],
        "exact cancellation phase readback",
      );
      assertNoForeignActive(
        (await p.referral("/api/referral/active")).data,
        ownedId,
      );
      facts.before = {
        order: orderFacts(before),
        task: taskBefore ? taskFacts(taskBefore) : null,
      };
      facts.referralProjection = object(
        (await p.referral("/api/referral/active")).data,
      );
      facts.beforePNG = await p.capture(
        `${result.stage}-before`,
        ownedId,
        "trip",
      );
      const response = await p.cancelFromActualUI(
        ownedId,
        result.expected === "ORDER_NOT_CANCELABLE",
      );
      result.actualHttpStatus = response.status;
      facts.cancelResponse = {
        status: response.status,
        body: response.data,
        requestSource: response.requestSource,
        uiDisabled: response.uiDisabled,
      };
      facts.observedAfterCancelAt = new Date().toISOString();
      const expectedSuccess = result.expected === "cancelled";
      requireFact(
        response.status === (expectedSuccess ? 200 : 409),
        "exact original cancellation HTTP policy",
      );
      const after = await getOrder();
      const taskAfter = taskId ? await getTask() : null;
      facts.after = {
        order: orderFacts(after),
        task: taskAfter ? taskFacts(taskAfter) : null,
      };
      facts.actualCancelCommandSHA256 = hash(
        Buffer.from(JSON.stringify(response.command)),
      );
      if (expectedSuccess) {
        const ack = object(response.data);
        requireFact(
          ack.orderId === ownedId &&
            ack.status === "cancelled" &&
            typeof ack.cancelledAt === "string" &&
            after.status === "cancelled" &&
            after.cancelledAt === ack.cancelledAt &&
            (!taskAfter || taskAfter.status === "cancelled"),
          "same-order cancellation ACK and canonical task readback",
        );
        const replay = object(
          (
            await p.referral(
              `/api/referral/cancel/${encodeURIComponent(ownedId)}`,
              { method: "POST", body: response.command, expected: [200] },
            )
          ).data,
        );
        requireFact(
          replay.orderId === ownedId &&
            replay.cancelledAt === ack.cancelledAt &&
            replay.status === "cancelled",
          "same actual UI command retains original cancellation",
        );
        facts.replay = replay;
        assertNoForeignActive((await p.referral("/api/referral/active")).data);
        facts.afterPNG = await p.capture(
          `${result.stage}-after`,
          ownedId,
          "cancelled",
        );
      } else {
        const error = object(object(response.data).error);
        requireFact(
          error.code === "ORDER_NOT_CANCELABLE",
          "exact original cancellation denial code",
        );
        result.actualCode = "ORDER_NOT_CANCELABLE";
        requireFact(
          JSON.stringify(facts.before) === JSON.stringify(facts.after),
          "denied cancellation preserves same order/task/assignment binding and lifecycle facts",
        );
        assertNoForeignActive(
          (await p.referral("/api/referral/active")).data,
          ownedId,
        );
        facts.denialPNG = await p.capture(
          `${result.stage}-denied`,
          ownedId,
          "trip",
        );
        await completeNormally();
        facts.recoveryPNG = await p.capture(
          `${result.stage}-normal-completion`,
          ownedId,
          "completed",
        );
      }
      const history = object(
        (
          await p.referral(
            `/api/referral/history/${encodeURIComponent(ownedId)}`,
          )
        ).data,
      );
      requireFact(
        history.orderId === ownedId &&
          history.status === (expectedSuccess ? "cancelled" : "completed"),
        "same-subject same-order final history",
      );
      facts.finalHistory = {
        orderId: history.orderId,
        status: history.status,
        cancelledAt: history.cancelledAt ?? null,
        completedAt: history.completedAt ?? null,
      };
      const historyList = records(
        object((await p.referral("/api/referral/history")).data).items,
      );
      requireFact(
        historyList.filter((row) => row.orderId === ownedId).length === 1,
        "one original history order after cancellation/replay/recovery",
      );
      result.result = "observed";
      p.evidence.record({
        stage: `cancellation:${result.stage}`,
        orderId: ownedId,
        ...(taskId ? { taskId } : {}),
        status: response.status,
        ...(result.actualCode ? { code: result.actualCode } : {}),
        result: "observed",
      });
    } catch (error) {
      result.result = "failed";
      failure = error;
      p.evidence.failure(error);
    } finally {
      if (journal?.current) result.journalState = journal.current.state;
      try {
        if (ownedId) {
          const order = await getOrder();
          // A lost assignment response must not invent IDs. For this already
          // acknowledged owned UUID only, a real bound Driver list can recover
          // its exact task/assignment/job before normal task progression.
          if (
            !taskId &&
            jobId &&
            !["cancelled", "completed", "created"].includes(
              String(order.status),
            )
          ) {
            const candidates = records(
              (await p.driver("/api/driver/tasks")).items,
            ).filter((task) => task.orderId === ownedId);
            requireFact(
              candidates.length === 1,
              "one actual own task required for uncertain assignment recovery",
            );
            const recovered = object(candidates[0]);
            requireFact(
              recovered.driverId === p.driverId &&
                recovered.vehicleId === p.vehicleId &&
                recovered.dispatchJobId === jobId,
              "recovered own assignment scope",
            );
            taskId = text(recovered.taskId);
            assignmentId = text(recovered.assignmentId);
            result.taskId = taskId;
            result.assignmentId = assignmentId;
            facts.cleanupRecoveredTaskFromBoundDriverList = true;
          }
          const terminal = ["cancelled", "completed"].includes(
            String(order.status),
          );
          const created = order.status === "created";
          const canComplete =
            Boolean(taskId) &&
            [
              "assigned",
              "driver_accepted",
              "enroute_pickup",
              "arrived_pickup",
              "on_trip",
            ].includes(String(order.status));
          requireFact(
            terminal || created || canComplete,
            "case-cleanup-retained-unsupported-current-state",
          );
          if (terminal) result.recovery ??= "already-terminal";
          else if (created) {
            await p.referral(
              `/api/referral/cancel/${encodeURIComponent(ownedId)}`,
              {
                method: "POST",
                body: {
                  reason: "Own synthetic cancellation case normal cleanup",
                },
                expected: [200],
              },
            );
            requireFact(
              (await getOrder()).status === "cancelled",
              "own fresh-created cleanup ACK readback; a real expired window must fail",
            );
            result.recovery = "normal-passenger-cancel";
          } else {
            await completeNormally();
          }
          assertNoForeignActive(
            (await p.referral("/api/referral/active")).data,
          );
        } else if (journal?.current?.state === "ack_unknown") {
          // No guessed order lookup, new quote/key, blind resend or cleanup.
          result.recovery = "retained-unresolved";
          result.result = "failed";
          failure ??= new JourneyFailure(
            "case-booking-ACK-unknown-preserve-original-journal",
          );
        }
      } catch (error) {
        result.recovery = "retained-unresolved";
        result.result = "failed";
        p.evidence.failure(error);
        failure ??= error;
      }
      result.factsFile = `${file}-facts.json`;
      await persistPrivateJson(result.factsFile, {
        ...facts,
        result,
        ...(journal?.current
          ? {
              bookingJournal: {
                state: journal.current.state,
                bodySha256: journal.current.bodySha256,
                recovery: journal.current.recovery,
                path: `${file}-booking-write-journal.json`,
              },
            }
          : {}),
      });
      await persistPrivateJson(
        `${p.directory}/cancellations/results.json`,
        results,
      );
    }
    if (failure) throw failure;
  }
}
