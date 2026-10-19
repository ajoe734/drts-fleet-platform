import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AddComplaintCaseNoteCommand,
  AssignComplaintCaseCommand,
  AuditLogRecord,
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ComplaintCategory,
  ComplaintExportViewRecord,
  ComplaintResolutionCode,
  ComplaintTimelineEntry,
  CreateComplaintCaseCommand,
  LinkComplaintToIncidentCommand,
  ReopenComplaintCaseCommand,
  ResolveComplaintCaseCommand,
} from "@drts/contracts";

import {
  COMPLAINT_CATEGORY_VALID_RESOLUTIONS,
  COMPLAINT_RESOLUTION_CODES,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { generateDeterministicUuid } from "../../common/durable-identity";
import type { AuditedActionResult } from "../../common/action-receipt";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import type { PoolClient } from "pg";
import type {
  PassengerTripRatingRecord,
  PassengerRideAccessToken,
} from "@drts/contracts";
import type { PassengerIntakeResult } from "./complaint.repository";
import {
  ComplaintCommitOutcomeUnknownError,
  ComplaintRepository,
} from "./complaint.repository";
import {
  normalizePassengerComplaintIntake,
  type PassengerComplaintIntake,
} from "./passenger-complaint-intake";

export type ComplaintCommandIdentity = { scope: string; key: string };
type ComplaintActionOptions<Capture extends boolean> = {
  captureAudit?: Capture;
  commandIdentity?: ComplaintCommandIdentity;
  /** Original caller payload when domain preparation adds generated IDs. */
  commandPayload?: unknown;
};
type IdentifiedComplaintPayload = {
  complaintCommandIdentity: ComplaintCommandIdentity;
  payload: unknown;
  originalRequestId?: string;
};

type ComplaintActionResult<T, Capture extends boolean> = Capture extends true
  ? AuditedActionResult<T>
  : T;

// An ordinary (non-settlement) canonical write defers its audit record until
// persistence confirms (see finishOrdinaryComplaintAction), so a caller that
// wants that confirmed receipt back (captureAudit: true) must await it;
// every other caller keeps today's synchronous, optimistic return.
type OrdinaryComplaintActionResult<
  T,
  Capture extends boolean,
> = Capture extends true
  ?
      | ComplaintActionResult<T, Capture>
      | Promise<ComplaintActionResult<T, Capture>>
  : ComplaintActionResult<T, Capture>;

const COMPLAINT_CATEGORY_VALUES = [
  "late_arrival",
  "no_arrival",
  "driver_service",
  "vehicle_condition",
  "route_issue",
  "fare_dispute",
  "settlement_dispute",
  "safety_concern",
  "lost_and_found",
  "other",
] as const;

const DEFAULT_SLA_HOURS_BY_CATEGORY: Record<ComplaintCategory, number> = {
  late_arrival: 24,
  no_arrival: 24,
  driver_service: 48,
  vehicle_condition: 48,
  route_issue: 48,
  fare_dispute: 48,
  settlement_dispute: 48,
  safety_concern: 4,
  lost_and_found: 72,
  other: 48,
};

const TIMELINE_ACTIONS = {
  created: "case_created",
  assigned: "case_assigned",
  noteAdded: "case_note_added",
  reopened: "case_reopened",
  slaBreached: "sla_breached",
  slaRecalculated: "sla_recalculated",
  resolved: "case_resolved",
  closed: "case_closed",
  escalatedToIncident: "escalated_to_incident",
  incidentLinked: "incident_linked",
} as const;

/** Captured when an ordinary write's COMMIT outcome is unknown (the rollback
 * must NOT run, since the transaction may have actually landed). Lets a
 * retry of the same mutation resend the identical case/timeline snapshot
 * (same IDs) instead of either allocating a second case or being blocked by
 * the optimistic in-memory state that already looks "done". */
type PendingUncertainComplaintCommit = {
  action: string;
  complaintCase: ComplaintCaseRecord;
  complaintTimelines: ComplaintTimelineEntry[];
  rollback?: () => void;
  matchCommand?: unknown;
  /** The case row immediately before this mutation (null for a create), so
   * a durable row recovered on another replica/after a restart can rebuild
   * `rollback` via revertComplaintCaseMutation without a non-serializable
   * closure. */
  previousCaseSnapshot?: ComplaintCaseRecord | null;
  confirmed?: boolean;
};

@Injectable()
export class ComplaintService implements OnModuleInit {
  private caseSequence = 1;

  private complaintCases: ComplaintCaseRecord[] = [];

  private complaintTimelines = new Map<string, ComplaintTimelineEntry[]>();
  private readonly auditedPassengerCases = new Set<string>();

  private settlementMutationRevision = 0;

  /** Keyed by caseNo; tracks the in-flight canonical write for every
   * category, not only settlement_dispute, so awaitSettlementPersistence
   * can honestly observe an ordinary case's write failure too. */
  private settlementPersistence = new Map<string, Promise<void>>();

  private settlementRefresh: Promise<void> | undefined;

  private incidentLinkOperations = new Map<string, Promise<void>>();

  /** Keyed by caseNo; see PendingUncertainComplaintCommit. */
  private pendingUncertainCommits = new Map<
    string,
    PendingUncertainComplaintCommit
  >();

  private identifiedComplaintCommands = new Map<
    string,
    PendingUncertainComplaintCommit
  >();

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly complaintRepository?: ComplaintRepository,
  ) {}

  async onModuleInit() {
    if (!this.complaintRepository) {
      return;
    }

    try {
      const persistedState = await this.complaintRepository.loadState();
      if (
        persistedState.complaintCases.length === 0 &&
        persistedState.complaintTimelines.length === 0
      ) {
        return;
      }

      this.complaintCases = persistedState.complaintCases.map((complaintCase) =>
        this.cloneComplaintCase(complaintCase),
      );
      this.complaintTimelines = this.buildTimelineMap(
        persistedState.complaintTimelines,
      );
      this.caseSequence = this.deriveNextCaseSequence(
        persistedState.complaintCases,
      );
    } catch (error) {
      this.complaintRepository.reportPersistenceFailure(error, "module init");
    }
  }

  /** Read the committed settlement cases on every request, including cases
   * submitted through another API replica, then reconcile any ordinary case
   * whose COMMIT outcome was left unknown against the durable record. Every
   * controller endpoint already calls this first, so a caller never reads,
   * re-decides from, or retries an optimistic case/timeline that in fact
   * never committed (or treats an already-confirmed one as still pending). */
  async refreshSettlementCases(): Promise<void> {
    if (!this.complaintRepository?.isEnabled()) return;
    if (this.settlementRefresh) return this.settlementRefresh;
    const refresh = this.reloadSettlementCases().then(() =>
      this.reconcilePendingCases(),
    );
    this.settlementRefresh = refresh;
    try {
      await refresh;
    } finally {
      if (this.settlementRefresh === refresh)
        this.settlementRefresh = undefined;
    }
  }

  /** Resolves every outstanding uncertain-commit case against the durable
   * store. Safe to call repeatedly: a case with no pending entry, or with a
   * repository that cannot answer right now, is left untouched. */
  private async reconcilePendingCases(): Promise<void> {
    await this.hydratePendingCommitsFromDurableStore();
    const caseNos = [...this.pendingUncertainCommits.keys()];
    await Promise.all(
      caseNos.map((caseNo) => this.reconcilePendingCase(caseNo)),
    );
  }

  /** Load prepared and confirmed identities before actual callers decide
   * whether a command is new. Confirmed results remain available for replay;
   * configured storage failures remain failures, never an empty identity set. */
  private async hydratePendingCommitsFromDurableStore(): Promise<void> {
    if (!this.canonicalDbEnabled()) return;
    if (typeof this.complaintRepository?.loadPendingCommits !== "function")
      return;
    // A failed identity read cannot authorize a fresh allocation on another
    // replica. Surface the failure instead of pretending no prior command exists.
    const durableRows = await this.complaintRepository!.loadPendingCommits();
    this.caseSequence = Math.max(
      this.caseSequence,
      this.deriveNextCaseSequence(durableRows.map((row) => row.caseSnapshot)),
    );
    for (const row of durableRows) {
      const pending: PendingUncertainComplaintCommit = {
        action: row.action,
        complaintCase: row.caseSnapshot,
        complaintTimelines: row.timelineSnapshot,
        matchCommand: row.commandPayload,
        previousCaseSnapshot: row.previousCaseSnapshot,
        confirmed: row.status === "confirmed",
        rollback: () =>
          this.revertComplaintCaseMutation(
            row.caseNo,
            row.previousCaseSnapshot,
            row.timelineSnapshot.map((entry) => entry.entryId),
          ),
      };
      const existing = this.pendingUncertainCommits.get(row.caseNo);
      const samePending =
        existing &&
        this.computeCommandKey(
          existing.action,
          row.caseNo,
          existing.matchCommand,
        ) === row.commandKey;
      const current = samePending ? existing : pending;
      if (row.status === "confirmed") current.confirmed = true;
      if (this.identifiedPayload(row.commandPayload)) {
        this.identifiedComplaintCommands.set(row.commandKey, current);
      }
      // A confirmed result must still refresh a warm replica's canonical
      // case and full timeline before another mutation can reuse its cache.
      if (!this.pendingUncertainCommits.has(row.caseNo)) {
        this.pendingUncertainCommits.set(row.caseNo, pending);
      }
    }
  }

  /** Caller scope/key identifies a logical intent independently of its
   * allocated caseNo. Legacy non-keyed updates retain their same-case identity. */
  private computeCommandKey(
    action: string,
    caseNo: string,
    matchCommand: unknown,
  ): string {
    const identity =
      this.identifiedPayload(matchCommand)?.complaintCommandIdentity;
    return createHash("sha256")
      .update(
        identity
          ? this.stableStringify([action, identity.scope, identity.key.trim()])
          : `${action}:${caseNo}:${this.stableStringify(matchCommand)}`,
      )
      .digest("hex");
  }

  /** Durably persists the prepared caseNo/entryIds identity for this attempt
   * BEFORE its potentially ambiguous business COMMIT is even issued (see the
   * `affectedCaseNos.length && this.canonicalDbEnabled()` branch of
   * persistChanges), so a marker failure here is an honest, definite failure
   * of the whole attempt rather than a silently-swallowed gap that would
   * leave cross-replica recovery of an actually-landed COMMIT to only this
   * process's in-memory Map. A repository without recordPendingCommit (no
   * durable identity support at all) is tolerated as a no-op, same as every
   * other optional durable-recovery method on this repository. */
  private async recordDurablePendingCommit(
    caseNo: string,
    action: string,
    complaintCase: ComplaintCaseRecord,
    complaintTimelines: ComplaintTimelineEntry[],
    previousCaseSnapshot: ComplaintCaseRecord | null,
    matchCommand: unknown,
  ): Promise<void> {
    if (!this.canonicalDbEnabled()) return;
    if (typeof this.complaintRepository?.recordPendingCommit !== "function")
      return;
    const reserved = await this.complaintRepository.recordPendingCommit({
      commandKey: this.computeCommandKey(action, caseNo, matchCommand),
      caseNo,
      action,
      commandPayload: matchCommand,
      caseSnapshot: complaintCase,
      timelineSnapshot: complaintTimelines,
      previousCaseSnapshot,
      status: "pending",
    });
    if (
      reserved &&
      !this.sameComplaintCommandPayload(reserved.commandPayload, matchCommand)
    ) {
      throw new ApiRequestError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "The complaint command key was already used for a different payload.",
      );
    }
    if (
      reserved &&
      (reserved.caseNo !== caseNo ||
        this.stableStringify(reserved.timelineSnapshot) !==
          this.stableStringify(complaintTimelines))
    ) {
      // Another replica won reservation. Do not issue business writes with
      // the losing allocation. Its next retry reads and replays the winner.
      throw new ApiRequestError(
        409,
        "IDEMPOTENCY_IN_PROGRESS",
        "The original complaint command is already prepared; retry the same key.",
      );
    }
  }

  /** Best-effort durable clear once a pending commit is no longer uncertain
   * (resolved by reconcilePendingCase) or a fresh write for the same
   * caseNo+action+content has just committed on its own. Safe to call for a
   * key that was never written durably (DELETE affects 0 rows). */
  private clearDurablePendingCommit(
    action: string,
    caseNo: string,
    matchCommand: unknown,
  ): void {
    if (!this.canonicalDbEnabled()) return;
    if (typeof this.complaintRepository?.clearPendingCommit !== "function")
      return;
    void this.complaintRepository
      .clearPendingCommit(this.computeCommandKey(action, caseNo, matchCommand))
      .catch(() => {
        // Best-effort only; a stale durable row is re-reconciled later.
      });
  }

  /** Refresh canonical case and timeline before reusing any cache. Missing
   * or older observations preserve prepared identity; only confirmed outcome
   * or the original committed entry IDs allow a successful replay. */
  private async reconcilePendingCase(caseNo: string): Promise<void> {
    const pending = this.pendingUncertainCommits.get(caseNo);
    if (!pending || !this.canonicalDbEnabled()) return;
    let durableCase: ComplaintCaseRecord | null;
    let durableTimeline: ComplaintTimelineEntry[] | undefined;
    try {
      if (typeof this.complaintRepository!.loadCaseState === "function") {
        const state = await this.complaintRepository!.loadCaseState(caseNo);
        durableCase = state.complaintCases[0] ?? null;
        durableTimeline = state.complaintTimelines;
      } else {
        durableCase = await this.complaintRepository!.loadCaseByCaseNo(caseNo);
      }
    } catch {
      return;
    }
    if (this.pendingUncertainCommits.get(caseNo) !== pending) return;
    // An old/missing observation does not prove an ambiguous COMMIT rolled
    // back. Preserve the original prepared IDs for a real same-command retry.
    if (!durableCase) {
      pending.rollback?.();
      return;
    }
    const committed =
      pending.confirmed ||
      (durableTimeline
        ? pending.complaintTimelines.every((entry) =>
            durableTimeline.some((saved) => saved.entryId === entry.entryId),
          )
        : this.stableStringify(durableCase) ===
          this.stableStringify(pending.complaintCase));
    this.reconcileComplaintCaseIntoCache(durableCase);
    if (durableTimeline) this.complaintTimelines.set(caseNo, durableTimeline);
    if (!committed) return;
    if (!durableTimeline)
      this.mergeTimelineEntriesIntoCache(caseNo, pending.complaintTimelines);
    pending.confirmed = true;
    if (this.identifiedPayload(pending.matchCommand)) {
      this.identifiedComplaintCommands.set(
        this.computeCommandKey(pending.action, caseNo, pending.matchCommand),
        pending,
      );
      this.pendingUncertainCommits.delete(caseNo);
    } else if (
      !["create_complaint_case", "escalate_to_incident"].includes(
        pending.action,
      )
    ) {
      this.pendingUncertainCommits.delete(caseNo);
      this.clearDurablePendingCommit(
        pending.action,
        caseNo,
        pending.matchCommand,
      );
    }
  }

  /** Writes the canonical durable case into the live optimistic cache,
   * inserting it if this process never had it (e.g. a create confirmed by
   * reconciliation that originated on another replica). */
  private reconcileComplaintCaseIntoCache(durableCase: ComplaintCaseRecord) {
    if (
      this.complaintCases.some((item) => item.caseNo === durableCase.caseNo)
    ) {
      this.replaceComplaintCase(durableCase);
    } else {
      this.complaintCases = [durableCase, ...this.complaintCases];
    }
  }

  /** Merges known-committed timeline entries into the live cache by entryId,
   * without discarding any other entries already tracked there. */
  private mergeTimelineEntriesIntoCache(
    caseNo: string,
    entries: readonly ComplaintTimelineEntry[],
  ) {
    const existing = this.complaintTimelines.get(caseNo) ?? [];
    const byEntryId = new Map(existing.map((entry) => [entry.entryId, entry]));
    for (const entry of entries) byEntryId.set(entry.entryId, entry);
    this.complaintTimelines.set(
      caseNo,
      [...byEntryId.values()].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      ),
    );
  }

  /** Settlement endpoints must acknowledge only committed case and timeline
   * changes. Ordinary complaints retain their existing synchronous behavior. */
  async awaitSettlementPersistence(caseNo?: string): Promise<void> {
    // Capture the initiating request's writes once. A later request for the
    // same case must not turn this successful commit into its own failure.
    const pending = [...this.settlementPersistence.entries()].filter(
      ([pendingCaseNo]) => !caseNo || pendingCaseNo === caseNo,
    );
    const results = await Promise.allSettled(
      pending.map(([, persistence]) => persistence),
    );
    for (const [pendingCaseNo, persistence] of pending) {
      if (this.settlementPersistence.get(pendingCaseNo) === persistence) {
        this.settlementPersistence.delete(pendingCaseNo);
      }
    }
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }

  private async reloadSettlementCases(): Promise<void> {
    while (true) {
      do {
        await this.awaitSettlementPersistence();
      } while (this.settlementPersistence.size > 0);
      const revision = this.settlementMutationRevision;
      const state = await this.complaintRepository!.loadSettlementState();
      // A request may mutate a case while the committed snapshot is being
      // read. Wait for that write and read again before replacing memory.
      if (revision !== this.settlementMutationRevision) continue;
      const previousCaseNos = this.complaintCases
        .filter((item) => item.category === "settlement_dispute")
        .map((item) => item.caseNo);
      this.complaintCases = [
        ...this.complaintCases.filter(
          (item) => item.category !== "settlement_dispute",
        ),
        ...state.complaintCases.map((item) => this.cloneComplaintCase(item)),
      ];
      const timelines = this.buildTimelineMap(state.complaintTimelines);
      for (const caseNo of previousCaseNos)
        this.complaintTimelines.delete(caseNo);
      for (const item of state.complaintCases) {
        this.complaintTimelines.set(
          item.caseNo,
          timelines.get(item.caseNo) ?? [],
        );
      }
      return;
    }
  }

  /** Hold the source complaint before an escalation allocates an incident.
   * Link controllers acquire this queue before the shared incident queue. */
  getPreparedEscalationIncidentId(
    caseNo: string,
    options?: ComplaintActionOptions<boolean>,
  ): string | undefined {
    const pending = options?.commandIdentity
      ? this.findComplaintCommand(
          "escalate_to_incident",
          caseNo,
          options.commandPayload,
          options,
        )
      : this.pendingUncertainCommits.get(caseNo);
    return pending?.action === "escalate_to_incident"
      ? (pending.complaintCase.relatedIncidentId ?? undefined)
      : undefined;
  }

  completePreparedEscalation(caseNo: string): void {
    const pending = this.pendingUncertainCommits.get(caseNo);
    if (
      pending?.action === "escalate_to_incident" &&
      pending.confirmed &&
      !this.identifiedPayload(pending.matchCommand)
    ) {
      this.pendingUncertainCommits.delete(caseNo);
      this.clearDurablePendingCommit(
        pending.action,
        caseNo,
        pending.matchCommand,
      );
    }
  }

  async withIncidentLink<T>(
    caseNo: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.incidentLinkOperations.get(caseNo);
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.incidentLinkOperations.set(caseNo, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.incidentLinkOperations.get(caseNo) === current) {
        this.incidentLinkOperations.delete(caseNo);
      }
    }
  }

  createComplaintCase<Capture extends boolean = false>(
    command: CreateComplaintCaseCommand,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
  ): OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture> {
    this.assertValidCategory(command.category);
    this.assertNonBlank(command.description, "description");

    // A retry of an uncertain-commit create must not allocate a second
    // case; reuse the pending attempt's caseNo/entryId instead.
    const pendingRetry = this.findPendingUncertainCreate(
      "create_complaint_case",
      this.bindComplaintCommand(command, options),
    );
    if (pendingRetry) {
      return this.retryUncertainComplaintWrite(
        pendingRetry,
        {
          actorId: null,
          actorType: "system",
          tenantId: null,
          moduleName: "complaint",
          actionName: "create_complaint_case",
          resourceType: "complaint_case",
          resourceId: pendingRetry.complaintCase.caseNo,
          newValuesSummary: {
            caseSource: command.caseSource,
            category: command.category,
            severity: command.severity,
            status: pendingRetry.complaintCase.status,
            relatedOrderId: pendingRetry.complaintCase.relatedOrderId,
            relatedCallId: pendingRetry.complaintCase.relatedCallId,
          },
        },
        requestId,
        options,
      ) as OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture>;
    }

    const now = new Date();
    const createdAt = now.toISOString();
    const caseNo = this.nextCaseNo(now);
    const complaintCase: ComplaintCaseRecord = {
      caseNo,
      caseSource: command.caseSource,
      relatedOrderId: command.relatedOrderId ?? null,
      relatedCallId: command.relatedCallId ?? null,
      relatedIncidentId: null,
      category: command.category,
      severity: command.severity,
      description: command.description,
      assigneeId: null,
      status: "new",
      slaDueAt: this.calculateSlaDueAt(command.category, command.severity, now),
      slaBreach: false,
      reopenCount: 0,
      resolutionCode: null,
      closingNote: null,
      createdAt,
      updatedAt: createdAt,
    };

    const createdEntry = this.createTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.created,
      `Created ${command.category} complaint from ${command.caseSource}.`,
      createdAt,
    );

    this.complaintCases = [complaintCase, ...this.complaintCases];
    this.complaintTimelines.set(caseNo, [createdEntry]);
    const isOrdinaryDbWrite = this.isOrdinaryDbWrite(command.category);
    const persistence = this.persistChanges(
      {
        complaintCases: [complaintCase],
        complaintTimelines: [createdEntry],
      },
      "create_complaint_case",
      isOrdinaryDbWrite
        ? () =>
            this.revertComplaintCaseMutation(caseNo, null, [
              createdEntry.entryId,
            ])
        : undefined,
      this.bindComplaintCommand(command, options, requestId),
      false,
      null,
    );
    return this.finishOrdinaryComplaintAction(
      this.cloneComplaintCase(complaintCase),
      persistence,
      isOrdinaryDbWrite,
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "complaint",
        actionName: "create_complaint_case",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          caseSource: command.caseSource,
          category: command.category,
          severity: command.severity,
          status: complaintCase.status,
          relatedOrderId: complaintCase.relatedOrderId,
          relatedCallId: complaintCase.relatedCallId,
        },
      },
      requestId,
      options,
    );
  }

  async createPassengerComplaintCase(input: PassengerComplaintIntake) {
    const intake = normalizePassengerComplaintIntake(input);
    if (!this.complaintRepository?.isEnabled()) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PASSENGER_COMPLAINT_STORAGE_UNAVAILABLE",
        "Complaint storage is unavailable.",
      );
    }
    const { complaintCase, timeline } = this.preparePassengerCase(intake);
    const stored = await this.complaintRepository.persistPassengerIntake(
      intake,
      complaintCase,
      timeline,
    );
    await this.publishPassengerCase(stored, intake.passengerId);
    return { complaintId: stored.complaintCase.caseNo };
  }

  private preparePassengerCase(
    intake: Pick<PassengerComplaintIntake, "orderId" | "command">,
    sourceLabel = "乘客 App",
  ) {
    const category: ComplaintCategory = {
      service: "driver_service" as const,
      fare: "fare_dispute" as const,
      lost_item: "lost_and_found" as const,
      other: "other" as const,
    }[intake.command.category];
    const now = new Date();
    const createdAt = now.toISOString();
    const caseNo = `PAX-${randomUUID()}`;
    const description = [
      `來源：${sourceLabel}`,
      `同意客服聯繫：${intake.command.contactConsent ? "是" : "否"}`,
      intake.command.content,
      ...(intake.command.lostItemDescription
        ? [`遺失物：${intake.command.lostItemDescription}`]
        : []),
    ].join("\n");
    const complaintCase: ComplaintCaseRecord = {
      caseNo,
      caseSource: "app",
      relatedOrderId: intake.orderId,
      relatedCallId: null,
      relatedIncidentId: null,
      category,
      severity: "normal",
      description,
      assigneeId: null,
      status: "new",
      slaDueAt: this.calculateSlaDueAt(category, "normal", now),
      slaBreach: false,
      reopenCount: 0,
      resolutionCode: null,
      closingNote: null,
      createdAt,
      updatedAt: createdAt,
    };
    const timeline = this.createTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.created,
      `來源：${sourceLabel}；同意客服聯繫：${intake.command.contactConsent ? "是" : "否"}`,
      createdAt,
    );
    return { complaintCase, timeline };
  }

  private async publishPassengerCase(
    stored: PassengerIntakeResult,
    passengerId: string,
    source: "passenger_app" | "passenger_ride_token" = "passenger_app",
  ) {
    // Stable audit identity also recovers when COMMIT succeeded but its reply was lost.
    if (!this.auditedPassengerCases.has(stored.complaintCase.caseNo)) {
      await this.auditNotificationService.recordAuditLogAsync({
        actorId: source === "passenger_app" ? passengerId : null,
        actorType:
          source === "passenger_app" ? "first_party_passenger" : "system",
        tenantId: null,
        moduleName: "complaint",
        actionName: "create_passenger_complaint_case",
        resourceType: "complaint_case",
        resourceId: stored.complaintCase.caseNo,
        requestId: `passenger-complaint:${stored.complaintCase.caseNo}`,
        newValuesSummary: {
          source,
          ...(source === "passenger_app"
            ? { drtsPassengerId: passengerId }
            : { passengerSubjectRef: passengerId }),
          relatedOrderId: stored.complaintCase.relatedOrderId,
          category: stored.complaintCase.category,
        },
      });
      this.auditedPassengerCases.add(stored.complaintCase.caseNo);
    }
    // Publish to the existing Ops authority only after the durable transaction.
    if (
      !this.complaintCases.some(
        (item) => item.caseNo === stored.complaintCase.caseNo,
      )
    ) {
      this.complaintCases = [stored.complaintCase, ...this.complaintCases];
      this.complaintTimelines.set(stored.complaintCase.caseNo, [
        stored.timeline,
      ]);
    }
  }

  preparePassengerRatingHook(
    passengerId: string,
    orderId: string,
    contactRequested: boolean,
    payload: { score: number; tags: string[]; comment: string | null },
  ) {
    if (!this.complaintRepository?.isEnabled()) {
      throw new ApiRequestError(
        503,
        "PASSENGER_COMPLAINT_STORAGE_UNAVAILABLE",
        "Rating consent storage is unavailable.",
      );
    }
    const intake =
      payload.score <= 2 && contactRequested
        ? normalizePassengerComplaintIntake({
            passengerId,
            orderId,
            idempotencyKey: `rating:${orderId}`,
            origin: "low_rating",
            command: {
              rideId: orderId,
              category: "service",
              contactConsent: true,
              content: `乘客評價 ${payload.score} 星，已勾選需要客服聯繫。${payload.comment ? `\n${payload.comment}` : ""}`,
            },
          })
        : null;
    const draft = intake
      ? { input: intake, ...this.preparePassengerCase(intake) }
      : undefined;
    let stored: PassengerIntakeResult | null = null;
    return {
      execute: async (
        client: PoolClient,
        rating: PassengerTripRatingRecord,
        isNew: boolean,
      ) => {
        const requestHash = createHash("sha256")
          .update(
            JSON.stringify({
              score: rating.score,
              tags: rating.tags,
              comment: rating.comment,
              contactRequested,
            }),
          )
          .digest("hex");
        stored = await this.complaintRepository!.persistPassengerRatingConsent(
          client,
          rating,
          contactRequested,
          requestHash,
          isNew,
          draft,
        );
      },
      afterCommit: async () => {
        if (stored) await this.publishPassengerCase(stored, passengerId);
      },
    };
  }

  /** The existing transaction seam, with verified token authority instead of account intake. */
  preparePassengerRideRatingHook(
    token: PassengerRideAccessToken,
    contactRequested: boolean | undefined,
    payload: { score: number; tags: string[]; comment: string | null },
  ) {
    if (!this.complaintRepository?.isEnabled())
      throw new ApiRequestError(
        503,
        "PASSENGER_COMPLAINT_STORAGE_UNAVAILABLE",
        "Rating consent storage is unavailable.",
      );
    const choice = contactRequested ?? false;
    const draft =
      choice && payload.score <= 2
        ? this.preparePassengerCase(
            {
              orderId: token.orderId,
              command: {
                rideId: token.orderId,
                category: "service",
                contactConsent: true,
                content: `乘客評價 ${payload.score} 星，已勾選需要客服聯繫。${payload.comment ? `\n${payload.comment}` : ""}`,
              },
            },
            "乘客行程連結",
          )
        : undefined;
    let stored: PassengerIntakeResult | null = null;
    return {
      execute: async (
        client: PoolClient,
        rating: PassengerTripRatingRecord,
        isNew: boolean,
      ) => {
        const requestHash = createHash("sha256")
          .update(
            JSON.stringify({
              score: rating.score,
              tags: rating.tags,
              comment: rating.comment,
              contactRequested: choice,
            }),
          )
          .digest("hex");
        stored = await this.complaintRepository!.persistRideTokenRatingConsent(
          client,
          rating,
          token,
          choice,
          contactRequested !== undefined,
          requestHash,
          isNew,
          draft,
        );
      },
      afterCommit: async () => {
        if (stored)
          await this.publishPassengerCase(
            stored,
            token.passengerSubjectRef,
            "passenger_ride_token",
          );
      },
    };
  }

  private mergePassengerCase(record: ComplaintCaseRecord) {
    const local = this.complaintCases.find(
      (item) => item.caseNo === record.caseNo,
    );
    if (!local)
      this.complaintCases = [
        this.cloneComplaintCase(record),
        ...this.complaintCases,
      ];
    else if (Date.parse(record.updatedAt) > Date.parse(local.updatedAt))
      this.replaceComplaintCase(record);
  }

  async listComplaintCasesForOps() {
    if (this.complaintRepository?.isEnabled()) {
      let cursor = "";
      while (true) {
        const page = await this.complaintRepository.listPassengerCases(cursor);
        for (const record of page) this.mergePassengerCase(record);
        if (page.length < 500) break;
        cursor = page[page.length - 1]!.caseNo;
      }
    }
    return this.listComplaintCases();
  }

  async getComplaintCaseForOps(caseNo: string) {
    // Passenger intake owns this UUID namespace; other CRM reads keep their original behavior.
    if (!/^PAX-[0-9a-f-]{36}$/i.test(caseNo))
      return this.getComplaintCase(caseNo);
    if (this.complaintRepository?.isEnabled()) {
      const record = await this.complaintRepository.getPassengerCase(caseNo);
      if (record) this.mergePassengerCase(record);
    }
    return this.getComplaintCase(caseNo);
  }

  async getComplaintTimelineForOps(caseNo: string) {
    if (!/^PAX-[0-9a-f-]{36}$/i.test(caseNo))
      return this.getComplaintTimeline(caseNo);
    await this.getComplaintCaseForOps(caseNo);
    if (this.complaintRepository?.isEnabled()) {
      const persisted =
        await this.complaintRepository.getPassengerTimeline(caseNo);
      const entries = new Map(
        (this.complaintTimelines.get(caseNo) ?? []).map((entry) => [
          entry.entryId,
          entry,
        ]),
      );
      for (const entry of persisted)
        if (!entries.has(entry.entryId)) entries.set(entry.entryId, entry);
      this.complaintTimelines.set(
        caseNo,
        [...entries.values()].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        ),
      );
    }
    return this.getComplaintTimeline(caseNo);
  }

  listComplaintCases() {
    return this.complaintCases.map((complaintCase) =>
      this.cloneComplaintCase(complaintCase),
    );
  }

  getComplaintCase(caseNo: string) {
    return this.cloneComplaintCase(this.requireComplaintCase(caseNo));
  }

  getComplaintTimeline(caseNo: string) {
    this.requireComplaintCase(caseNo);
    return (this.complaintTimelines.get(caseNo) ?? []).map((entry) => ({
      ...entry,
    }));
  }

  assignComplaintCase<Capture extends boolean = false>(
    caseNo: string,
    command: AssignComplaintCaseCommand,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
  ): OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture> {
    this.assertNonBlank(command.assigneeId, "assigneeId");

    const replay = this.recoverPreparedCommand(
      "assign_complaint_case",
      caseNo,
      command,
      requestId,
      options,
    );
    if (replay) return replay;
    const complaintCase = this.requireComplaintCase(caseNo);
    this.assertCaseOpenForAction(complaintCase, "assign");

    const note = this.normalizeNullableText(command.note);
    const updated = {
      ...complaintCase,
      assigneeId: command.assigneeId.trim(),
      status: "assigned" as ComplaintCaseStatus,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.assigned,
      note ?? `Assigned to ${updated.assigneeId}.`,
    );
    const isOrdinaryDbWrite = this.isOrdinaryDbWrite(complaintCase.category);
    const persistence = this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "assign_complaint_case",
      isOrdinaryDbWrite
        ? () =>
            this.revertComplaintCaseMutation(caseNo, complaintCase, [
              timelineEntry.entryId,
            ])
        : undefined,
      this.bindComplaintCommand(command, options, requestId),
      false,
      complaintCase,
    );
    return this.finishOrdinaryComplaintAction(
      this.cloneComplaintCase(updated),
      persistence,
      isOrdinaryDbWrite,
      {
        actorId: updated.assigneeId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "assign_complaint_case",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          assigneeId: updated.assigneeId,
          status: updated.status,
        },
      },
      requestId,
      options,
    );
  }

  addComplaintCaseNote<Capture extends boolean = false>(
    caseNo: string,
    command: AddComplaintCaseNoteCommand,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
  ): OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture> {
    return this.addComplaintCaseNoteInternal(
      caseNo,
      command,
      requestId,
      false,
      options,
    );
  }

  /** The Fleet case contract permits replies until closed, including a
   * resolved settlement case. Such replies keep the resolution intact. */
  addFleetSettlementCaseNote(
    caseNo: string,
    command: AddComplaintCaseNoteCommand,
    requestId?: string,
  ) {
    const complaintCase = this.requireComplaintCase(caseNo);
    if (complaintCase.category !== "settlement_dispute") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "COMPLAINT_NOT_SETTLEMENT",
        "Fleet settlement notes require a settlement dispute case.",
        { caseNo },
      );
    }
    return this.addComplaintCaseNoteInternal(caseNo, command, requestId, true);
  }

  private addComplaintCaseNoteInternal<Capture extends boolean = false>(
    caseNo: string,
    command: AddComplaintCaseNoteCommand,
    requestId?: string,
    allowResolvedSettlement = false,
    options?: ComplaintActionOptions<Capture>,
  ): OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture> {
    this.assertNonBlank(command.note, "note");

    const replay = this.recoverPreparedCommand(
      "add_complaint_case_note",
      caseNo,
      command,
      requestId,
      options,
    );
    if (replay) return replay;
    const complaintCase = this.requireComplaintCase(caseNo);
    if (!(allowResolvedSettlement && complaintCase.status === "resolved")) {
      this.assertCaseOpenForAction(complaintCase, "note");
    }

    const nextStatus =
      complaintCase.status === "new" ||
      complaintCase.status === "assigned" ||
      complaintCase.status === "reopened"
        ? ("under_investigation" as ComplaintCaseStatus)
        : complaintCase.status;
    const updated = {
      ...complaintCase,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.noteAdded,
      command.note.trim(),
    );
    const isOrdinaryDbWrite = this.isOrdinaryDbWrite(complaintCase.category);
    const persistence = this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "add_complaint_case_note",
      isOrdinaryDbWrite
        ? () =>
            this.revertComplaintCaseMutation(caseNo, complaintCase, [
              timelineEntry.entryId,
            ])
        : undefined,
      this.bindComplaintCommand(command, options, requestId),
      false,
      complaintCase,
    );
    return this.finishOrdinaryComplaintAction(
      this.cloneComplaintCase(updated),
      persistence,
      isOrdinaryDbWrite,
      {
        actorId: updated.assigneeId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "add_complaint_case_note",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          status: updated.status,
          note: command.note.trim(),
        },
      },
      requestId,
      options,
    );
  }

  getComplaintExportView(caseNo: string): ComplaintExportViewRecord {
    const complaintCase = this.getComplaintCase(caseNo);
    const timeline = this.getComplaintTimeline(caseNo);
    return {
      complaintCase,
      timeline,
      exportGeneratedAt: new Date().toISOString(),
      readyForAudit:
        complaintCase.status === "closed" &&
        Boolean(complaintCase.resolutionCode && complaintCase.closingNote),
    };
  }

  resolveComplaintCase<Capture extends boolean = false>(
    caseNo: string,
    command: ResolveComplaintCaseCommand,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
  ): OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture> {
    this.assertNonBlank(command.resolutionCode, "resolutionCode");
    this.assertNonBlank(command.closingNote, "closingNote");

    const replay = this.recoverPreparedCommand(
      "resolve_complaint_case",
      caseNo,
      command,
      requestId,
      options,
    );
    if (replay) return replay;
    const complaintCase = this.requireComplaintCase(caseNo);
    if (complaintCase.status === "resolved") {
      return this.existingComplaintAction(
        this.cloneComplaintCase(complaintCase),
        "resolve_complaint_case",
        requestId,
        options,
      ) as OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture>;
    }
    if (complaintCase.status === "closed") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "COMPLAINT_ALREADY_CLOSED",
        "A closed complaint case must be reopened before it can be resolved again.",
        {
          caseNo,
          currentStatus: complaintCase.status,
        },
      );
    }

    this.assertValidResolutionCode(
      command.resolutionCode,
      complaintCase.category,
    );

    const updated = {
      ...complaintCase,
      status: "resolved" as ComplaintCaseStatus,
      resolutionCode: command.resolutionCode,
      closingNote: command.closingNote,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.resolved,
      command.closingNote,
    );
    const isOrdinaryDbWrite = this.isOrdinaryDbWrite(complaintCase.category);
    const persistence = this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "resolve_complaint_case",
      isOrdinaryDbWrite
        ? () =>
            this.revertComplaintCaseMutation(caseNo, complaintCase, [
              timelineEntry.entryId,
            ])
        : undefined,
      this.bindComplaintCommand(command, options, requestId),
      false,
      complaintCase,
    );
    return this.finishOrdinaryComplaintAction(
      this.cloneComplaintCase(updated),
      persistence,
      isOrdinaryDbWrite,
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "resolve_complaint_case",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          status: updated.status,
          resolutionCode: command.resolutionCode,
        },
      },
      requestId,
      options,
    );
  }

  closeComplaintCase<Capture extends boolean = false>(
    caseNo: string,
    command: ResolveComplaintCaseCommand,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
  ): OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture> {
    this.assertNonBlank(command.resolutionCode, "resolutionCode");
    this.assertNonBlank(command.closingNote, "closingNote");

    const replay = this.recoverPreparedCommand(
      "close_complaint_case",
      caseNo,
      command,
      requestId,
      options,
    );
    if (replay) return replay;
    const complaintCase = this.requireComplaintCase(caseNo);
    if (complaintCase.status === "closed") {
      return this.existingComplaintAction(
        this.cloneComplaintCase(complaintCase),
        "close_complaint_case",
        requestId,
        options,
      ) as OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture>;
    }

    this.assertValidResolutionCode(
      command.resolutionCode,
      complaintCase.category,
    );

    const updated = {
      ...complaintCase,
      status: "closed" as ComplaintCaseStatus,
      resolutionCode: command.resolutionCode,
      closingNote: command.closingNote,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.closed,
      command.closingNote,
    );
    const isOrdinaryDbWrite = this.isOrdinaryDbWrite(complaintCase.category);
    const persistence = this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "close_complaint_case",
      isOrdinaryDbWrite
        ? () =>
            this.revertComplaintCaseMutation(caseNo, complaintCase, [
              timelineEntry.entryId,
            ])
        : undefined,
      this.bindComplaintCommand(command, options, requestId),
      false,
      complaintCase,
    );
    return this.finishOrdinaryComplaintAction(
      this.cloneComplaintCase(updated),
      persistence,
      isOrdinaryDbWrite,
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "close_complaint_case",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          status: updated.status,
          resolutionCode: command.resolutionCode,
        },
      },
      requestId,
      options,
    );
  }

  reopenComplaintCase<Capture extends boolean = false>(
    caseNo: string,
    command: ReopenComplaintCaseCommand,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
  ): OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture> {
    this.assertNonBlank(command.reason, "reason");

    const replay = this.recoverPreparedCommand(
      "reopen_complaint_case",
      caseNo,
      command,
      requestId,
      options,
    );
    if (replay) return replay;
    const complaintCase = this.requireComplaintCase(caseNo);
    if (complaintCase.status !== "closed") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "COMPLAINT_NOT_CLOSED",
        "Only closed complaint cases can be reopened.",
        {
          caseNo,
          currentStatus: complaintCase.status,
        },
      );
    }

    const now = new Date();
    const newSlaDueAt = this.calculateSlaDueAt(
      complaintCase.category,
      complaintCase.severity,
      now,
    );

    const updated = {
      ...complaintCase,
      status: "reopened" as ComplaintCaseStatus,
      slaDueAt: newSlaDueAt,
      slaBreach: false,
      reopenCount: (complaintCase.reopenCount ?? 0) + 1,
      updatedAt: now.toISOString(),
    };
    this.replaceComplaintCase(updated);
    const reopenEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.reopened,
      command.reason,
      now.toISOString(),
    );
    const slaEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.slaRecalculated,
      `SLA recalculated on reopen. New due: ${newSlaDueAt}. Reopen #${updated.reopenCount}.`,
      now.toISOString(),
    );
    const isOrdinaryDbWrite = this.isOrdinaryDbWrite(complaintCase.category);
    const persistence = this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [reopenEntry, slaEntry],
      },
      "reopen_complaint_case",
      isOrdinaryDbWrite
        ? () =>
            this.revertComplaintCaseMutation(caseNo, complaintCase, [
              reopenEntry.entryId,
              slaEntry.entryId,
            ])
        : undefined,
      this.bindComplaintCommand(command, options, requestId),
      false,
      complaintCase,
    );
    return this.finishOrdinaryComplaintAction(
      this.cloneComplaintCase(updated),
      persistence,
      isOrdinaryDbWrite,
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "reopen_complaint_case",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          status: updated.status,
          reason: command.reason,
          reopenCount: updated.reopenCount,
          slaDueAt: newSlaDueAt,
          slaBreach: false,
        },
      },
      requestId,
      options,
    );
  }

  markComplaintSlaBreach<Capture extends boolean = false>(
    caseNo: string,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
  ): OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture> {
    const replay = this.recoverPreparedCommand(
      "mark_complaint_sla_breach",
      caseNo,
      undefined,
      requestId,
      options,
    );
    if (replay) return replay;
    const complaintCase = this.requireComplaintCase(caseNo);
    if (complaintCase.slaBreach) {
      return this.existingComplaintAction(
        this.cloneComplaintCase(complaintCase),
        "mark_complaint_sla_breach",
        requestId,
        options,
      ) as OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture>;
    }

    const updated = {
      ...complaintCase,
      slaBreach: true,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.slaBreached,
      `SLA breached while case remained ${complaintCase.status}.`,
    );
    const isOrdinaryDbWrite = this.isOrdinaryDbWrite(complaintCase.category);
    const persistence = this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "mark_complaint_sla_breach",
      isOrdinaryDbWrite
        ? () =>
            this.revertComplaintCaseMutation(caseNo, complaintCase, [
              timelineEntry.entryId,
            ])
        : undefined,
      this.bindComplaintCommand(undefined, options, requestId),
      false,
      complaintCase,
    );
    return this.finishOrdinaryComplaintAction(
      this.cloneComplaintCase(updated),
      persistence,
      isOrdinaryDbWrite,
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "complaint",
        actionName: "mark_complaint_sla_breach",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          status: updated.status,
          slaBreach: true,
          slaDueAt: complaintCase.slaDueAt,
        },
      },
      requestId,
      options,
      () =>
        this.auditNotificationService.recordNotification({
          tenantId: null,
          channel: "ops_notice",
          title: "Complaint SLA breached",
          message: `Complaint ${caseNo} exceeded SLA due at ${complaintCase.slaDueAt}.`,
          status: "unread",
        }),
    );
  }

  escalateToIncident<Capture extends boolean = false>(
    caseNo: string,
    incidentId: string,
    reason: string,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
  ): OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture> {
    this.assertNonBlank(reason, "reason");

    const replay = this.recoverPreparedCommand(
      "escalate_to_incident",
      caseNo,
      { incidentId, reason },
      requestId,
      options,
    );
    if (replay) return replay;
    const complaintCase = this.requireComplaintCase(caseNo);
    if (complaintCase.relatedIncidentId) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "COMPLAINT_ALREADY_ESCALATED",
        "This complaint case is already linked to an incident.",
        {
          caseNo,
          existingIncidentId: complaintCase.relatedIncidentId,
        },
      );
    }

    const updated = {
      ...complaintCase,
      relatedIncidentId: incidentId,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.escalatedToIncident,
      `Escalated to incident ${incidentId}: ${reason}`,
    );
    const isOrdinaryDbWrite = this.isOrdinaryDbWrite(complaintCase.category);
    const persistence = this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "escalate_to_incident",
      isOrdinaryDbWrite
        ? () =>
            this.revertComplaintCaseMutation(caseNo, complaintCase, [
              timelineEntry.entryId,
            ])
        : undefined,
      this.bindComplaintCommand({ incidentId, reason }, options, requestId),
      false,
      complaintCase,
    );
    return this.finishOrdinaryComplaintAction(
      this.cloneComplaintCase(updated),
      persistence,
      isOrdinaryDbWrite,
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "escalate_to_incident",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          relatedIncidentId: incidentId,
          reason,
        },
      },
      requestId,
      options,
    );
  }

  linkIncident<Capture extends boolean = false>(
    caseNo: string,
    command: LinkComplaintToIncidentCommand,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
  ): OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture> {
    this.assertNonBlank(command.incidentId, "incidentId");
    const incidentId = command.incidentId.trim();

    const replay = this.recoverPreparedCommand(
      "link_incident",
      caseNo,
      { incidentId },
      requestId,
      options,
    );
    if (replay) return replay;
    const complaintCase = this.requireComplaintCase(caseNo);
    if (
      complaintCase.relatedIncidentId &&
      complaintCase.relatedIncidentId !== incidentId
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "COMPLAINT_INCIDENT_LINK_CONFLICT",
        "This complaint case is already linked to a different incident.",
        {
          caseNo,
          existingIncidentId: complaintCase.relatedIncidentId,
          requestedIncidentId: incidentId,
        },
      );
    }
    if (complaintCase.relatedIncidentId === incidentId) {
      return this.existingComplaintAction(
        this.cloneComplaintCase(complaintCase),
        "link_incident",
        requestId,
        options,
      ) as OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture>;
    }

    const updated = {
      ...complaintCase,
      relatedIncidentId: incidentId,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.incidentLinked,
      `Linked to incident ${incidentId}.`,
    );
    const isOrdinaryDbWrite = this.isOrdinaryDbWrite(complaintCase.category);
    const persistence = this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "link_incident",
      isOrdinaryDbWrite
        ? () =>
            this.revertComplaintCaseMutation(caseNo, complaintCase, [
              timelineEntry.entryId,
            ])
        : undefined,
      this.bindComplaintCommand({ incidentId }, options, requestId),
      false,
      complaintCase,
    );
    return this.finishOrdinaryComplaintAction(
      this.cloneComplaintCase(updated),
      persistence,
      isOrdinaryDbWrite,
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "link_incident",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          relatedIncidentId: incidentId,
        },
      },
      requestId,
      options,
    );
  }

  evaluateAllSlaBreach(requestId?: string) {
    const now = new Date();
    const results: ComplaintCaseRecord[] = [];
    for (const complaintCase of this.complaintCases) {
      if (complaintCase.slaBreach) {
        continue;
      }
      if (
        complaintCase.status === "resolved" ||
        complaintCase.status === "closed"
      ) {
        continue;
      }
      if (new Date(complaintCase.slaDueAt) <= now) {
        results.push(
          this.markComplaintSlaBreach(complaintCase.caseNo, requestId),
        );
      }
    }
    return results;
  }

  getValidResolutionCodes(category: string) {
    this.assertValidCategory(category);
    return [...(COMPLAINT_CATEGORY_VALID_RESOLUTIONS[category] ?? [])];
  }

  private assertValidResolutionCode(
    code: string,
    category: ComplaintCategory,
  ): asserts code is ComplaintResolutionCode {
    if (!COMPLAINT_RESOLUTION_CODES.includes(code as ComplaintResolutionCode)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_RESOLUTION_CODE",
        "Invalid complaint resolution code.",
        { resolutionCode: code },
      );
    }
    const validForCategory = COMPLAINT_CATEGORY_VALID_RESOLUTIONS[category];
    if (!validForCategory?.includes(code as ComplaintResolutionCode)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "RESOLUTION_CODE_NOT_VALID_FOR_CATEGORY",
        `Resolution code "${code}" is not valid for category "${category}".`,
        { resolutionCode: code, category },
      );
    }
  }

  private calculateSlaDueAt(
    category: ComplaintCategory,
    severity: CreateComplaintCaseCommand["severity"],
    createdAt: Date,
  ) {
    const baseHours = DEFAULT_SLA_HOURS_BY_CATEGORY[category] ?? 48;
    const effectiveHours =
      severity === "high" ? Math.max(1, Math.floor(baseHours / 2)) : baseHours;
    return new Date(
      createdAt.getTime() + effectiveHours * 60 * 60 * 1000,
    ).toISOString();
  }

  private nextCaseNo(createdAt: Date) {
    const datePrefix = createdAt.toISOString().slice(0, 10).replaceAll("-", "");
    const sequence = String(this.caseSequence++).padStart(6, "0");
    return `C-${datePrefix}-${sequence}`;
  }

  private deriveNextCaseSequence(
    complaintCases: readonly ComplaintCaseRecord[],
  ) {
    const maxSequence = complaintCases.reduce((currentMax, complaintCase) => {
      if (complaintCase.caseNo.includes("-FS-")) return currentMax;
      const rawSequence = complaintCase.caseNo.split("-").at(-1) ?? "0";
      const parsedSequence = Number.parseInt(rawSequence, 10);
      if (!Number.isInteger(parsedSequence)) {
        return currentMax;
      }
      return Math.max(currentMax, parsedSequence);
    }, 0);

    return maxSequence + 1;
  }

  private buildTimelineMap(timelineEntries: readonly ComplaintTimelineEntry[]) {
    const nextMap = new Map<string, ComplaintTimelineEntry[]>();

    for (const entry of timelineEntries) {
      const existing = nextMap.get(entry.caseNo) ?? [];
      nextMap.set(entry.caseNo, [...existing, { ...entry }]);
    }

    return nextMap;
  }

  private requireComplaintCase(caseNo: string) {
    const complaintCase = this.complaintCases.find(
      (candidate) => candidate.caseNo === caseNo,
    );
    if (!complaintCase) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Complaint case not found.",
        {
          caseNo,
        },
      );
    }
    return complaintCase;
  }

  private assertCaseOpenForAction(
    complaintCase: ComplaintCaseRecord,
    action: "assign" | "note",
  ) {
    if (
      complaintCase.status === "resolved" ||
      complaintCase.status === "closed"
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "COMPLAINT_NOT_ACTIONABLE",
        `Cannot ${action} a complaint case once it is ${complaintCase.status}.`,
        {
          caseNo: complaintCase.caseNo,
          status: complaintCase.status,
        },
      );
    }
  }

  private replaceComplaintCase(updated: ComplaintCaseRecord) {
    this.complaintCases = this.complaintCases.map((complaintCase) =>
      complaintCase.caseNo === updated.caseNo ? updated : complaintCase,
    );
  }

  private appendTimelineEntry(
    caseNo: string,
    action: ComplaintTimelineEntry["action"],
    note: string,
    createdAt = new Date().toISOString(),
  ) {
    const currentTimeline = this.complaintTimelines.get(caseNo) ?? [];
    const entry = this.createTimelineEntry(caseNo, action, note, createdAt);
    this.complaintTimelines.set(caseNo, [...currentTimeline, entry]);
    return entry;
  }

  private createTimelineEntry(
    caseNo: string,
    action: ComplaintTimelineEntry["action"],
    note: string,
    createdAt = new Date().toISOString(),
  ): ComplaintTimelineEntry {
    return {
      entryId: `complaint-timeline-${randomUUID()}`,
      caseNo,
      action,
      note,
      createdAt,
    };
  }

  private cloneComplaintCase(complaintCase: ComplaintCaseRecord) {
    return {
      ...complaintCase,
    };
  }

  private persistChanges(
    changes: {
      complaintCases?: readonly ComplaintCaseRecord[];
      complaintTimelines?: readonly ComplaintTimelineEntry[];
    },
    context: string,
    // Only consulted for ordinary (non-settlement) writes: undoes the
    // optimistic in-memory mutation when the write is known NOT to have
    // committed. Never invoked for a ComplaintCommitOutcomeUnknownError,
    // since that outcome must not be assumed to be a rollback.
    rollback?: () => void,
    // Only consulted for create-type ordinary writes (no existing caseNo to
    // key a retry by): stashed on an uncertain-commit outcome so a later
    // call with an equal command can be recognized as a retry of this same
    // attempt rather than a brand-new case.
    matchCommand?: unknown,
    // True only when this call resends a previously uncertain-commit
    // snapshot (see retryUncertainComplaintWrite). A definite failure of
    // *this* attempt does not prove the original attempt rolled back, so
    // the pending marker must survive it for a later retry or reconciliation.
    isRetry = false,
    // The case row immediately before this mutation (null for a create).
    // Stashed on an uncertain-commit outcome, alongside matchCommand, so the
    // durable pending-commit row can be recovered on another replica/after a
    // restart and its rollback rebuilt without a non-serializable closure.
    previousCaseSnapshot: ComplaintCaseRecord | null = null,
  ): Promise<void> {
    if (!this.complaintRepository) {
      return Promise.resolve();
    }

    const persistPayload: {
      complaintCases?: ComplaintCaseRecord[];
      complaintTimelines?: ComplaintTimelineEntry[];
      commandKeys?: string[];
    } = {};

    if (changes.complaintCases) {
      persistPayload.complaintCases = changes.complaintCases.map(
        (complaintCase) => this.cloneComplaintCase(complaintCase),
      );
    }

    if (changes.complaintTimelines) {
      persistPayload.complaintTimelines = changes.complaintTimelines.map(
        (entry) => ({ ...entry }),
      );
    }

    // Track every affected case's write, not only settlement ones, so the
    // existing awaitSettlementPersistence(caseNo) callers every mutation
    // already invokes can honestly observe and propagate an ordinary
    // canonical write failure instead of it being silently logged while the
    // in-memory cache keeps reporting the case as saved.
    const affectedCaseNos = [
      ...new Set((changes.complaintCases ?? []).map((item) => item.caseNo)),
    ];
    if (affectedCaseNos.length && this.canonicalDbEnabled()) {
      const settlementCaseNos = (changes.complaintCases ?? [])
        .filter((item) => item.category === "settlement_dispute")
        .map((item) => item.caseNo);
      if (settlementCaseNos.length) {
        this.settlementMutationRevision += 1;
      }
      const previous = affectedCaseNos.flatMap((caseNo) => {
        const persistence = this.settlementPersistence.get(caseNo);
        return persistence ? [persistence] : [];
      });
      // Only ordinary (rollback-bearing) writes get durable cross-replica
      // identity protection; settlement-dispute writes keep their existing,
      // unaffected transaction/wait/refresh machinery (see isOrdinaryDbWrite).
      const durablePrepareTargets = rollback
        ? affectedCaseNos.flatMap((caseNo) => {
            const complaintCase = (changes.complaintCases ?? []).find(
              (item) => item.caseNo === caseNo,
            );
            if (!complaintCase) return [];
            const timelineForCase = (changes.complaintTimelines ?? []).filter(
              (entry) => entry.caseNo === caseNo,
            );
            return [{ caseNo, complaintCase, timelineForCase }];
          })
        : [];
      const persistence = Promise.all(previous)
        .then(() => {
          if (
            typeof this.complaintRepository!.recordPendingCommit !==
              "function" ||
            !durablePrepareTargets.length
          ) {
            return this.complaintRepository!.persistChanges(persistPayload);
          }
          return Promise.all(
            durablePrepareTargets.map(
              ({ caseNo, complaintCase, timelineForCase }) =>
                this.recordDurablePendingCommit(
                  caseNo,
                  context,
                  complaintCase,
                  timelineForCase,
                  previousCaseSnapshot,
                  matchCommand,
                ),
            ),
          ).then(() => {
            persistPayload.commandKeys = durablePrepareTargets.map(
              ({ caseNo }) =>
                this.computeCommandKey(context, caseNo, matchCommand),
            );
            return this.complaintRepository!.persistChanges(persistPayload);
          });
        })
        .then(() => {
          for (const caseNo of affectedCaseNos) {
            this.pendingUncertainCommits.delete(caseNo);
            const committedTarget = durablePrepareTargets.find(
              (item) => item.caseNo === caseNo,
            );
            if (committedTarget) {
              this.reconcileComplaintCaseIntoCache(
                committedTarget.complaintCase,
              );
              this.mergeTimelineEntriesIntoCache(
                caseNo,
                committedTarget.timelineForCase,
              );
            }
            if (this.identifiedPayload(matchCommand)) {
              const target = durablePrepareTargets.find(
                (item) => item.caseNo === caseNo,
              );
              if (target)
                this.identifiedComplaintCommands.set(
                  this.computeCommandKey(context, caseNo, matchCommand),
                  {
                    action: context,
                    complaintCase: target.complaintCase,
                    complaintTimelines: target.timelineForCase,
                    matchCommand,
                    previousCaseSnapshot,
                    confirmed: true,
                  },
                );
            } else
              this.clearDurablePendingCommit(context, caseNo, matchCommand);
          }
        })
        .catch((error: unknown) => {
          this.complaintRepository!.reportPersistenceFailure(error, context);
          if (error instanceof ComplaintCommitOutcomeUnknownError) {
            if (rollback) {
              for (const {
                caseNo,
                complaintCase,
                timelineForCase,
              } of durablePrepareTargets) {
                this.pendingUncertainCommits.set(caseNo, {
                  action: context,
                  complaintCase,
                  complaintTimelines: timelineForCase,
                  rollback,
                  matchCommand,
                  previousCaseSnapshot,
                });
                // Already durably registered above, before this ambiguous
                // commit was even attempted; no further durable write needed.
              }
            }
            // The outcome is now tracked as a pending uncertain commit, not a
            // live settlementPersistence failure. Leaving the rejected
            // promise mapped by caseNo would make a later, unrelated
            // refreshSettlementCases() sweep rethrow this same failure and
            // block that case's own reconciliation/retry.
            for (const caseNo of affectedCaseNos) {
              if (this.settlementPersistence.get(caseNo) === persistence) {
                this.settlementPersistence.delete(caseNo);
              }
            }
          } else if (isRetry) {
            // This retry's own attempt failed definitely, but that failure
            // belongs to the retry, not the original still-uncertain one; a
            // connect/query error here does not prove the first COMMIT never
            // landed. Preserve the existing pending marker untouched so a
            // later retry (or reconcilePendingCase's durable read) can still
            // recover the same caseNo instead of minting a duplicate.
            for (const caseNo of affectedCaseNos) {
              if (this.settlementPersistence.get(caseNo) === persistence) {
                this.settlementPersistence.delete(caseNo);
              }
            }
          } else {
            for (const caseNo of affectedCaseNos) {
              this.pendingUncertainCommits.delete(caseNo);
              // This attempt's own prepared durable marker (if any) never saw
              // a business commit at all, so it must not linger as if it
              // were still an unresolved cross-replica identity.
              if (
                !(
                  error instanceof ApiRequestError &&
                  (error.code === "IDEMPOTENCY_IN_PROGRESS" ||
                    error.code === "IDEMPOTENCY_KEY_REUSED")
                )
              ) {
                this.clearDurablePendingCommit(context, caseNo, matchCommand);
              }
              // A definite (non-uncertain) failure has already been rolled
              // back and surfaced to its own caller above; leaving this
              // rejected promise keyed by caseNo would otherwise make a
              // later, unrelated refreshSettlementCases() sweep rethrow this
              // same stale failure and block that case's own retry.
              if (this.settlementPersistence.get(caseNo) === persistence) {
                this.settlementPersistence.delete(caseNo);
              }
            }
            if (rollback) rollback();
          }
          throw error;
        });
      for (const caseNo of affectedCaseNos) {
        this.settlementPersistence.set(caseNo, persistence);
      }
      // Shared synchronous callers can start a mutation before the HTTP layer
      // awaits it. Keep its rejection observable without an unhandled promise.
      void persistence.catch(() => undefined);
      return persistence;
    }

    return this.complaintRepository
      .persistChanges(persistPayload)
      .catch((error: unknown) => {
        this.complaintRepository!.reportPersistenceFailure(error, context);
      });
  }

  /** Resends the exact case/timeline snapshot from an earlier attempt whose
   * COMMIT outcome was unknown, reusing its caseNo/entryIds so the
   * repository's ON CONFLICT DO UPDATE upserts idempotently instead of a
   * retry allocating a second case or row. Shares finishOrdinaryComplaintAction
   * with every other ordinary mutation so a captureAudit: true caller gets
   * back the same `{ data, auditLog }` shape only once this retry actually
   * commits, instead of a bare ComplaintCaseRecord the controller cannot read
   * `.data`/`.auditLog` off of. */
  private retryUncertainComplaintWrite<Capture extends boolean = false>(
    pending: PendingUncertainComplaintCommit,
    auditInput: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
    onCommitted?: () => void,
  ): OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture> {
    requestId =
      this.identifiedPayload(pending.matchCommand)?.originalRequestId ??
      requestId;
    if (pending.confirmed && !this.identifiedPayload(pending.matchCommand)) {
      this.pendingUncertainCommits.delete(pending.complaintCase.caseNo);
      this.clearDurablePendingCommit(
        pending.action,
        pending.complaintCase.caseNo,
        pending.matchCommand,
      );
    }
    const persistence = pending.confirmed
      ? Promise.resolve()
      : this.persistChanges(
          {
            complaintCases: [pending.complaintCase],
            complaintTimelines: pending.complaintTimelines,
          },
          pending.action,
          pending.rollback,
          pending.matchCommand,
          true,
          pending.previousCaseSnapshot ?? null,
        );
    return this.finishOrdinaryComplaintAction(
      this.cloneComplaintCase(pending.complaintCase),
      persistence,
      true,
      auditInput,
      requestId,
      options,
      onCommitted,
    );
  }

  /** Finds an uncertain-commit create (createComplaintCase /
   * transferCallToComplaint) whose original command matches this one, so a
   * retry reuses its already-allocated caseNo instead of minting a new one. */
  private findPendingUncertainCreate(
    action: string,
    command: unknown,
  ): PendingUncertainComplaintCommit | undefined {
    return this.findComplaintCommandPayload(action, undefined, command);
  }

  private identifiedPayload(
    value: unknown,
  ): IdentifiedComplaintPayload | undefined {
    if (
      !value ||
      typeof value !== "object" ||
      !("complaintCommandIdentity" in value)
    )
      return;
    return value as IdentifiedComplaintPayload;
  }

  private bindComplaintCommand(
    command: unknown,
    options?: ComplaintActionOptions<boolean>,
    originalRequestId?: string,
  ): unknown {
    return options?.commandIdentity
      ? {
          complaintCommandIdentity: {
            ...options.commandIdentity,
            key: options.commandIdentity.key.trim(),
          },
          payload: options.commandPayload ?? command ?? null,
          ...(originalRequestId ? { originalRequestId } : {}),
        }
      : command;
  }

  private recoverPreparedCommand<Capture extends boolean>(
    action: string,
    caseNo: string,
    command: unknown,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
  ): OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture> | undefined {
    const pending = this.findComplaintCommand(action, caseNo, command, options);
    requestId =
      this.identifiedPayload(pending?.matchCommand)?.originalRequestId ??
      requestId;
    if (pending?.confirmed)
      return this.existingComplaintAction(
        this.cloneComplaintCase(pending.complaintCase),
        action,
        requestId,
        options,
      ) as OrdinaryComplaintActionResult<ComplaintCaseRecord, Capture>;
    if (pending) {
      return this.retryUncertainComplaintWrite(
        pending,
        {
          actorId: [
            "assign_complaint_case",
            "add_complaint_case_note",
          ].includes(action)
            ? pending.complaintCase.assigneeId
            : null,
          actorType:
            action === "mark_complaint_sla_breach" ? "system" : "ops_user",
          tenantId: null,
          moduleName: "complaint",
          actionName: action,
          resourceType: "complaint_case",
          resourceId: caseNo,
          newValuesSummary: this.preparedCommandAuditSummary(pending),
        },
        requestId,
        options,
        action === "mark_complaint_sla_breach"
          ? () =>
              this.auditNotificationService.recordNotification({
                tenantId: null,
                channel: "ops_notice",
                title: "Complaint SLA breached",
                message: `Complaint ${caseNo} exceeded SLA due at ${pending.complaintCase.slaDueAt}.`,
                status: "unread",
              })
          : undefined,
      );
    }
    const unresolved = this.pendingUncertainCommits.get(caseNo);
    if (unresolved && !unresolved.confirmed && unresolved !== pending) {
      throw new ApiRequestError(
        409,
        "IDEMPOTENCY_IN_PROGRESS",
        "An earlier complaint command still needs canonical confirmation.",
        { caseNo },
        true,
      );
    }
  }

  private preparedCommandAuditSummary(
    pending: PendingUncertainComplaintCommit,
  ): Record<string, unknown> {
    const record = pending.complaintCase;
    const raw =
      this.identifiedPayload(pending.matchCommand)?.payload ??
      pending.matchCommand;
    const payload =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    switch (pending.action) {
      case "assign_complaint_case":
        return { status: record.status, assigneeId: record.assigneeId };
      case "add_complaint_case_note":
        return {
          status: record.status,
          note:
            typeof payload.note === "string" ? payload.note.trim() : undefined,
        };
      case "resolve_complaint_case":
      case "close_complaint_case":
        return { status: record.status, resolutionCode: record.resolutionCode };
      case "reopen_complaint_case":
        return {
          status: record.status,
          reason: payload.reason,
          reopenCount: record.reopenCount,
          slaDueAt: record.slaDueAt,
          slaBreach: false,
        };
      case "mark_complaint_sla_breach":
        return {
          status: record.status,
          slaBreach: true,
          slaDueAt: record.slaDueAt,
        };
      case "escalate_to_incident":
        return {
          relatedIncidentId: record.relatedIncidentId,
          reason: payload.reason,
        };
      case "link_incident":
        return { relatedIncidentId: record.relatedIncidentId };
      default:
        return { status: record.status };
    }
  }

  private findComplaintCommand(
    action: string,
    caseNo: string,
    command: unknown,
    options?: ComplaintActionOptions<boolean>,
  ) {
    return this.findComplaintCommandPayload(
      action,
      caseNo,
      this.bindComplaintCommand(command, options),
    );
  }

  private findComplaintCommandPayload(
    action: string,
    caseNo: string | undefined,
    command: unknown,
  ): PendingUncertainComplaintCommit | undefined {
    if (this.identifiedPayload(command)) {
      const identified = this.identifiedComplaintCommands.get(
        this.computeCommandKey(action, caseNo ?? "", command),
      );
      if (identified) {
        if (
          (caseNo && identified.complaintCase.caseNo !== caseNo) ||
          !this.sameComplaintCommandPayload(identified.matchCommand, command)
        ) {
          throw new ApiRequestError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "The complaint command key was already used for a different payload.",
          );
        }
        return identified;
      }
    }
    for (const pending of this.pendingUncertainCommits.values()) {
      const legacyTerminalRetry =
        !this.identifiedPayload(command) &&
        !this.identifiedPayload(pending.matchCommand) &&
        !!caseNo &&
        !["assign_complaint_case", "add_complaint_case_note"].includes(action);
      if (
        pending.action === action &&
        (!caseNo || pending.complaintCase.caseNo === caseNo) &&
        (legacyTerminalRetry ||
          this.sameComplaintCommandPayload(pending.matchCommand, command))
      )
        return pending;
    }
    return undefined;
  }

  private sameComplaintCommandPayload(left: unknown, right: unknown) {
    const normalize = (value: unknown) => {
      const identified = this.identifiedPayload(value);
      return identified
        ? {
            complaintCommandIdentity: identified.complaintCommandIdentity,
            payload: identified.payload,
          }
        : value;
    };
    return (
      this.stableStringify(normalize(left)) ===
      this.stableStringify(normalize(right))
    );
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(",")}]`;
    }
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${this.stableStringify(
            (value as Record<string, unknown>)[key],
          )}`,
      )
      .join(",")}}`;
  }

  /** Some lightweight test doubles implement only the repository methods
   * their scenario exercises; tolerate an absent isEnabled rather than
   * throwing, matching how an unconfigured repository behaves. */
  private canonicalDbEnabled() {
    return typeof this.complaintRepository?.isEnabled === "function"
      ? this.complaintRepository.isEnabled()
      : false;
  }

  /** Settlement-dispute writes keep their existing dedicated transaction and
   * wait/refresh machinery untouched; only ordinary, DB-backed writes get
   * the rollback-on-failure and commit-gated audit behavior below. */
  private isOrdinaryDbWrite(category: ComplaintCategory) {
    return category !== "settlement_dispute" && this.canonicalDbEnabled();
  }

  /** Undoes an ordinary mutation's optimistic in-memory update once its
   * canonical write is known not to have committed. `previousCase` is null
   * for a create (the phantom case is removed entirely rather than restored). */
  private revertComplaintCaseMutation(
    caseNo: string,
    previousCase: ComplaintCaseRecord | null,
    addedTimelineEntryIds: readonly string[],
  ) {
    if (previousCase) {
      this.replaceComplaintCase(previousCase);
    } else {
      this.complaintCases = this.complaintCases.filter(
        (item) => item.caseNo !== caseNo,
      );
    }
    const remaining = (this.complaintTimelines.get(caseNo) ?? []).filter(
      (entry) => !addedTimelineEntryIds.includes(entry.entryId),
    );
    if (previousCase) {
      this.complaintTimelines.set(caseNo, remaining);
    } else {
      this.complaintTimelines.delete(caseNo);
    }
  }

  /** Ordinary (non-settlement) canonical writes must not let their audit log
   * / notification side effects represent the mutation as committed before
   * it actually settles. Settlement-dispute writes and the disabled/noDB
   * path keep their existing, unaffected synchronous emission. */
  private emitAfterOrdinaryPersistence(
    persistence: Promise<void>,
    isOrdinaryDbWrite: boolean,
    emit: () => void,
  ) {
    if (!isOrdinaryDbWrite) {
      emit();
      return;
    }
    void persistence.then(emit, () => undefined);
  }

  /** Builds the audit-log record for a mutation and, for ordinary canonical
   * writes, defers it (and any caller-supplied onCommitted side effect, e.g.
   * a notification) until persistence confirms, same as
   * emitAfterOrdinaryPersistence above. A caller that asked for the receipt
   * back via captureAudit must then await it, since it does not exist until
   * the write actually commits; every other caller keeps the existing
   * synchronous, optimistic return. */
  private finishOrdinaryComplaintAction<T, Capture extends boolean = false>(
    data: T,
    persistence: Promise<void>,
    isOrdinaryDbWrite: boolean,
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
    onCommitted?: () => void,
  ): OrdinaryComplaintActionResult<T, Capture> {
    const finish = () => {
      onCommitted?.();
      return this.finishComplaintAction(data, input, requestId, options);
    };
    if (!isOrdinaryDbWrite) {
      return finish() as OrdinaryComplaintActionResult<T, Capture>;
    }
    if (!options?.captureAudit) {
      void persistence.then(finish, () => undefined);
      return data as OrdinaryComplaintActionResult<T, Capture>;
    }
    return persistence.then(finish) as OrdinaryComplaintActionResult<
      T,
      Capture
    >;
  }

  private assertValidCategory(
    category: string,
  ): asserts category is ComplaintCategory {
    if (!COMPLAINT_CATEGORY_VALUES.includes(category as ComplaintCategory)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid complaint category.",
        {
          category,
        },
      );
    }
  }

  private assertNonBlank(value: string, fieldName: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} is required.`,
        {
          field: fieldName,
        },
      );
    }
  }

  private normalizeNullableText(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private finishComplaintAction<T, Capture extends boolean = false>(
    data: T,
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
  ): ComplaintActionResult<T, Capture> {
    const identity = this.canonicalDbEnabled()
      ? options?.commandIdentity
      : undefined;
    const auditId = identity
      ? generateDeterministicUuid(
          "complaint_command_audit",
          this.stableStringify([
            input.actionName,
            identity.scope,
            identity.key.trim(),
          ]),
        )
      : undefined;
    const auditLog =
      (auditId
        ? this.auditNotificationService
            .getAuditLogsSnapshot()
            .find((entry) => entry.auditId === auditId)
        : undefined) ?? this.recordAudit(input, requestId, auditId);
    return (
      options?.captureAudit ? { data, auditLog } : data
    ) as ComplaintActionResult<T, Capture>;
  }

  private existingComplaintAction<Capture extends boolean = false>(
    data: ComplaintCaseRecord,
    actionName: string,
    requestId?: string,
    options?: ComplaintActionOptions<Capture>,
  ): ComplaintActionResult<ComplaintCaseRecord, Capture> {
    if (!options?.captureAudit) {
      return data as ComplaintActionResult<ComplaintCaseRecord, Capture>;
    }
    if (options.commandIdentity) {
      return this.finishComplaintAction(
        data,
        {
          actorId: null,
          actorType: "ops_user",
          tenantId: null,
          moduleName: "complaint",
          actionName,
          resourceType: "complaint_case",
          resourceId: data.caseNo,
          newValuesSummary: {
            outcome: "already_completed",
            status: data.status,
          },
        },
        requestId,
        options,
      );
    }
    const auditLog = this.auditNotificationService
      .getAuditLogsSnapshot()
      .find(
        (entry) =>
          entry.moduleName === "complaint" &&
          entry.resourceType === "complaint_case" &&
          entry.resourceId === data.caseNo &&
          entry.actionName === actionName,
      );
    if (auditLog) {
      return { data, auditLog } as ComplaintActionResult<
        ComplaintCaseRecord,
        Capture
      >;
    }
    // Older completed commands may predate retained audit history. Record this
    // acknowledgement without inventing a prior event or repeating the write.
    return this.finishComplaintAction(
      data,
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: `${actionName}_acknowledged`,
        resourceType: "complaint_case",
        resourceId: data.caseNo,
        newValuesSummary: { outcome: "already_completed", status: data.status },
      },
      requestId,
      options,
    );
  }

  acknowledgeExistingCaseAction(
    data: ComplaintCaseRecord,
    actionName: string,
    requestId?: string,
  ) {
    return this.existingComplaintAction(
      this.cloneComplaintCase(data),
      actionName,
      requestId,
      { captureAudit: true },
    );
  }

  getComplaintExportViewWithReceipt(caseNo: string, requestId?: string) {
    const data = this.getComplaintExportView(caseNo);
    return this.finishComplaintAction(
      data,
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "export_complaint_case_view",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          exportGeneratedAt: data.exportGeneratedAt,
          readyForAudit: data.readyForAudit,
        },
      },
      requestId,
      { captureAudit: true },
    );
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
    auditId?: string,
  ) {
    const auditLogInput: Omit<
      AuditLogRecord,
      "auditId" | "createdAt" | "requestId"
    > & {
      requestId?: string;
      auditId?: string;
    } = { ...input, ...(auditId ? { auditId } : {}) };
    if (requestId) {
      auditLogInput.requestId = requestId;
    }
    return this.auditNotificationService.recordAuditLog(auditLogInput);
  }
}
