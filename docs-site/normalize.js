// normalize.js — data transformation: worker records, agent state, dependency scheduling

import {
  activeTaskStatuses,
  scheduleOpenTaskStatuses,
  integrationPrefixes,
  agentLabel,
  actorLabel,
} from "./utils.js";

const queuedTaskStatuses = new Set(["todo", "backlog"]);
const ownedExecutionTaskStatuses = new Set(["backlog", "todo", "in_progress"]);
const liveWorkerStatuses = new Set(["running", "started"]);
const pendingWorkerStatuses = new Set([
  "waiting_approval",
  "suspended_approval",
  "manual_pending",
  "retry_backoff",
  "stalled",
  "fallback",
]);

// ── Task helpers ──────────────────────────────────────────────────────────────

export function terminalTaskStatus(value) {
  return String(value || "").toLowerCase() === "done";
}

export function taskDeliveryLayer(task) {
  const prefix = (task.id || "").split("-", 1)[0];
  return integrationPrefixes.has(prefix) ? "upstream" : "product";
}

export function taskBadgeChips(task) {
  const chips = [];
  if (String(task?.task_class || "").toLowerCase() === "sidecar") {
    chips.push('<span class="chip">sidecar</span>');
  }
  if (task?.auto_generated) {
    chips.push('<span class="chip">auto-generated</span>');
  }
  if (task?.helper_parent) {
    chips.push(`<span class="chip">parent ${task.helper_parent}</span>`);
  }
  return chips.join("");
}

export function taskBadgeRow(task, className = "task-meta") {
  const chips = taskBadgeChips(task);
  return chips ? `<div class="${className}">${chips}</div>` : "";
}

function normalizedWorkerMode(worker) {
  return String(
    worker?.request_snapshot?.metadata?.mode ||
      worker?.mode_bucket ||
      worker?.request_snapshot?.mode ||
      "",
  )
    .trim()
    .toLowerCase();
}

export function workerAssignmentPhase(worker, task) {
  if (!task) return null;
  const agentName = agentLabel(logicalWorkerAgentId(worker));
  const taskStatus = String(task?.status || "").toLowerCase();
  if (taskStatus === "review" && task?.reviewer === agentName) return "review";
  if (taskStatus === "review_approved" && task?.owner === agentName)
    return "finalize";
  if (ownedExecutionTaskStatuses.has(taskStatus) && task?.owner === agentName)
    return "owned";
  return null;
}

export function taskDisplayStatus(task, liveWorkers = []) {
  const taskStatus = String(task?.status || "").toLowerCase();
  const hasRunning = liveWorkers.some((worker) => worker.bucket === "running");
  const hasPending = liveWorkers.some((worker) => worker.bucket === "pending");
  if (
    ownedExecutionTaskStatuses.has(taskStatus) &&
    (hasRunning || hasPending)
  ) {
    return "in_progress";
  }
  return task?.status;
}

// ── Worker normalization ──────────────────────────────────────────────────────

export function logicalWorkerAgentId(worker) {
  const candidates = [worker?.agent_id, worker?.target_agent, worker?.provider];
  for (const candidate of candidates) {
    const normalized = String(candidate || "")
      .trim()
      .toLowerCase();
    if (!normalized) continue;
    if (["claude", "gemini", "codex", "codex2", "qwen"].includes(normalized))
      return normalized;
    if (["grok", "copilot"].includes(normalized)) return "copilot";
  }
  if (String(worker?.provider || "").toLowerCase() === "copilot")
    return "copilot";
  return (
    String(worker?.agent_id || worker?.provider || "")
      .trim()
      .toLowerCase() || "unknown"
  );
}

export function workerLifecycleBadge(worker) {
  const status = String(worker?.status || "").toLowerCase();
  if (["running", "started"].includes(status))
    return { label: "active", className: "lifecycle-active" };
  if (status === "retried")
    return { label: "retried", className: "lifecycle-superseded" };
  if (status === "superseded")
    return { label: "superseded", className: "lifecycle-superseded" };
  if (status === "reassigned")
    return { label: "reassigned", className: "lifecycle-reassigned" };
  return null;
}

export function normalizeWorkerRecords(orchState, status) {
  const taskMap = new Map((status?.tasks || []).map((task) => [task.id, task]));
  const workers = Object.entries(orchState?.workers || {}).map(
    ([runId, worker]) => {
      const task = taskMap.get(worker?.task_id) || null;
      const taskStatus = task?.status || null;
      const logicalAgentId = logicalWorkerAgentId(worker);
      const assignmentPhase = workerAssignmentPhase(worker, task);
      const modeBucket = normalizedWorkerMode(worker);
      const coordinationOnly = !task && modeBucket === "coordination";
      const laneRelevant = Boolean(assignmentPhase);
      let bucket = "pending";

      if (worker?.status === "retried") {
        bucket = "history";
      } else if (["superseded", "reassigned"].includes(worker?.status)) {
        bucket = "transition";
      } else if (
        terminalTaskStatus(taskStatus) ||
        ["completed", "failed"].includes(worker?.status)
      ) {
        bucket = "completed";
      } else if (liveWorkerStatuses.has(worker?.status)) {
        bucket = assignmentPhase || coordinationOnly ? "running" : "completed";
      } else if (pendingWorkerStatuses.has(worker?.status)) {
        bucket = assignmentPhase || coordinationOnly ? "pending" : "completed";
      }

      return {
        ...worker,
        run_id: runId,
        logical_agent_id: logicalAgentId,
        task_status: taskStatus,
        assignment_phase: assignmentPhase,
        mode_bucket: modeBucket || null,
        lane_relevant: laneRelevant,
        coordination_only: coordinationOnly,
        bucket,
        display_actor: actorLabel(logicalAgentId, worker?.provider),
      };
    },
  );

  return workers.sort((a, b) =>
    (b.last_event_at || "").localeCompare(a.last_event_at || ""),
  );
}

function openTaskPriority(task) {
  const status = String(task?.status || "").toLowerCase();
  if (status === "review") return 0;
  if (status === "review_approved") return 1;
  if (status === "in_progress") return 2;
  if (status === "blocked") return 3;
  if (queuedTaskStatuses.has(status)) return 4;
  return 9;
}

function sortOpenTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const priority = openTaskPriority(a) - openTaskPriority(b);
    if (priority !== 0) return priority;
    return String(b?.last_update || "").localeCompare(
      String(a?.last_update || ""),
    );
  });
}

function latestWorkerByTimestamp(workers) {
  return [...workers].sort((a, b) =>
    String(b?.last_event_at || "").localeCompare(
      String(a?.last_event_at || ""),
    ),
  )[0];
}

function setDerivedFromWorkers(state, workers, nextFallback) {
  const latest = latestWorkerByTimestamp(workers);
  return {
    status: state.status,
    taskIds: [
      ...new Set(workers.map((worker) => worker.task_id).filter(Boolean)),
    ],
    next:
      latest?.last_error ||
      nextFallback(latest?.task_id) ||
      state.next ||
      "尚未指定",
    lastUpdate: latest?.last_event_at || state.lastUpdate,
  };
}

function setDerivedFromTasks(state, tasks) {
  const latestTask = sortOpenTasks(tasks)[0];
  return {
    status: state.status,
    taskIds: tasks.map((task) => task.id),
    next: latestTask?.next || state.next,
    lastUpdate: latestTask?.last_update || state.lastUpdate,
  };
}

// ── Queue normalization ───────────────────────────────────────────────────────

export function normalizeQueueEvents(orchState) {
  const byLegacyKey = orchState?.queue_events;
  if (
    byLegacyKey &&
    typeof byLegacyKey === "object" &&
    !Array.isArray(byLegacyKey)
  ) {
    return Object.entries(byLegacyKey).map(([id, event]) => ({
      id,
      ...(event || {}),
    }));
  }

  const queueEvents = orchState?.queue?.events;
  if (
    queueEvents &&
    typeof queueEvents === "object" &&
    !Array.isArray(queueEvents)
  ) {
    const workersByEvent = new Map(
      Object.values(orchState?.workers || {})
        .filter((worker) => worker?.queue_event_id)
        .map((worker) => [worker.queue_event_id, worker]),
    );
    return Object.entries(queueEvents).map(([id, event]) => {
      const worker = workersByEvent.get(id) || {};
      return {
        id,
        ...(event || {}),
        task_id: event?.task_id || worker.task_id || null,
        agent_id: event?.agent_id || worker.agent_id || null,
        provider: event?.provider || worker.provider || worker.agent_id || null,
        reason: event?.reason || worker.reason || worker.status || null,
        last_event_at:
          event?.last_event_at ||
          event?.processed_at ||
          worker.last_event_at ||
          event?.last_attempt_at ||
          null,
      };
    });
  }

  return [];
}

export function normalizeDispatchQueue(orchState, status) {
  const taskMap = new Map((status?.tasks || []).map((task) => [task.id, task]));
  return normalizeQueueEvents(orchState)
    .map((event) => {
      const taskStatus = taskMap.get(event.task_id)?.status || null;
      return {
        ...event,
        logical_agent_id: logicalWorkerAgentId(event),
        task_status: taskStatus,
        stale: terminalTaskStatus(taskStatus),
      };
    })
    .filter(
      (event) =>
        !["completed", "failed"].includes(event.status) && !event.stale,
    );
}

// ── Agent state derivation ────────────────────────────────────────────────────

function normalizeProviderPauses(orchState) {
  const raw = orchState?.provider_pauses;
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return Object.entries(raw).map(([provider, pause]) => ({
    provider,
    ...(pause || {}),
  }));
}

function normalizeFailureStreaks(orchState) {
  const raw = orchState?.failure_streaks;
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return Object.entries(raw).map(([key, value]) => ({
    key,
    ...(value || {}),
  }));
}

function latestByTimestamp(entries, fieldNames) {
  return [...entries].sort((a, b) => {
    const aValue =
      fieldNames.map((field) => a?.[field] || "").find(Boolean) || "";
    const bValue =
      fieldNames.map((field) => b?.[field] || "").find(Boolean) || "";
    return bValue.localeCompare(aValue);
  })[0];
}

export function deriveAgentState(status, orchState) {
  const taskMap = new Map((status.tasks || []).map((task) => [task.id, task]));
  const workers = normalizeWorkerRecords(orchState, status);
  const dispatchPauses = Array.isArray(orchState?.dispatch_pauses)
    ? orchState.dispatch_pauses
    : [];
  const providerPauses = normalizeProviderPauses(orchState);
  const failureStreaks = normalizeFailureStreaks(orchState);
  const allTasks = status.tasks || [];

  return (status.agents || []).map((agent) => {
    const agentId = String(agent.name || "").toLowerCase();
    const owned = allTasks.filter((task) => task.owner === agent.name);
    const incomingReview = allTasks.filter(
      (task) => task.reviewer === agent.name && task.status === "review",
    );
    const reviewTasks = sortOpenTasks([
      ...new Map(
        [...owned.filter((task) => task.status === "review"), ...incomingReview]
          .map((task) => [task.id, task]),
      ).values(),
    ]);
    const approved = sortOpenTasks(
      owned.filter((task) => task.status === "review_approved"),
    );
    const activeOwned = sortOpenTasks(
      owned.filter((task) => ["in_progress", "blocked"].includes(task.status)),
    );
    const queued = sortOpenTasks(
      owned.filter((task) => queuedTaskStatuses.has(task.status)),
    );
    const ready = queued.filter((task) =>
      (task.depends_on || []).every(
        (depId) => (taskMap.get(depId)?.status || "done") === "done",
      ),
    );
    const waiting = queued.filter((task) => !ready.includes(task));

    const agentWorkers = workers.filter(
      (worker) => worker.logical_agent_id === agentId,
    );
    const liveRunningWorkers = agentWorkers.filter(
      (worker) => worker.bucket === "running" && worker.lane_relevant,
    );
    const livePendingWorkers = agentWorkers.filter(
      (worker) => worker.bucket === "pending" && worker.lane_relevant,
    );
    const liveTransitionWorkers = agentWorkers.filter(
      (worker) => worker.bucket === "transition",
    );
    const liveReviewWorkers = liveRunningWorkers.filter(
      (worker) => worker.assignment_phase === "review",
    );
    const liveFinalizeWorkers = liveRunningWorkers.filter(
      (worker) => worker.assignment_phase === "finalize",
    );
    const liveOwnedWorkers = liveRunningWorkers.filter(
      (worker) => worker.assignment_phase === "owned",
    );
    const agentDispatchPauses = dispatchPauses.filter((pause) => {
      const logicalId = logicalWorkerAgentId(pause);
      return (
        logicalId === agentId ||
        String(pause?.provider || "").toLowerCase() === agentId
      );
    });
    const agentProviderPauses = providerPauses.filter((pause) => {
      const logicalId = logicalWorkerAgentId(pause);
      return (
        logicalId === agentId ||
        String(pause?.provider || "").toLowerCase() === agentId
      );
    });
    const agentFailureStreaks = failureStreaks.filter((entry) => {
      const logicalId = logicalWorkerAgentId(entry);
      return (
        logicalId === agentId ||
        String(entry?.provider || "").toLowerCase() === agentId ||
        String(entry?.agent || "").toLowerCase() === agentId
      );
    });
    const latestDispatchPause = latestByTimestamp(agentDispatchPauses, [
      "paused_at",
      "last_failure_at",
      "updated_at",
    ]);
    const latestProviderPause = latestByTimestamp(agentProviderPauses, [
      "paused_at",
      "until",
      "updated_at",
    ]);
    const latestFailureStreak = latestByTimestamp(agentFailureStreaks, [
      "last_failure_at",
      "updated_at",
    ]);

    let derivedStatus = agent.status || "idle";
    let derivedTaskIds = Array.isArray(agent.current_task_ids)
      ? [...agent.current_task_ids]
      : [];
    let derivedNext = agent.next || "尚未指定";
    let derivedLastUpdate = agent.last_update || null;

    if (liveReviewWorkers.length) {
      const nextState = setDerivedFromWorkers(
        {
          status: "reviewing",
          next: derivedNext,
          lastUpdate: derivedLastUpdate,
        },
        liveReviewWorkers,
        (taskId) => taskMap.get(taskId)?.next,
      );
      derivedStatus = nextState.status;
      derivedTaskIds = nextState.taskIds;
      derivedNext = nextState.next;
      derivedLastUpdate = nextState.lastUpdate;
    } else if (reviewTasks.length) {
      const nextState = setDerivedFromTasks(
        {
          status: "reviewing",
          next: derivedNext,
          lastUpdate: derivedLastUpdate,
        },
        reviewTasks,
      );
      derivedStatus = nextState.status;
      derivedTaskIds = nextState.taskIds;
      derivedNext = nextState.next;
      derivedLastUpdate = nextState.lastUpdate;
    } else if (liveFinalizeWorkers.length) {
      const nextState = setDerivedFromWorkers(
        {
          status: "finalize",
          next: derivedNext,
          lastUpdate: derivedLastUpdate,
        },
        liveFinalizeWorkers,
        (taskId) => taskMap.get(taskId)?.next,
      );
      derivedStatus = nextState.status;
      derivedTaskIds = nextState.taskIds;
      derivedNext = nextState.next;
      derivedLastUpdate = nextState.lastUpdate;
    } else if (approved.length) {
      const nextState = setDerivedFromTasks(
        {
          status: "finalize",
          next: derivedNext,
          lastUpdate: derivedLastUpdate,
        },
        approved,
      );
      derivedStatus = nextState.status;
      derivedTaskIds = nextState.taskIds;
      derivedNext = nextState.next;
      derivedLastUpdate = nextState.lastUpdate;
    } else if (liveOwnedWorkers.length) {
      const nextState = setDerivedFromWorkers(
        {
          status: "working",
          next: derivedNext,
          lastUpdate: derivedLastUpdate,
        },
        liveOwnedWorkers,
        (taskId) => taskMap.get(taskId)?.next,
      );
      derivedStatus = nextState.status;
      derivedTaskIds = nextState.taskIds;
      derivedNext = nextState.next;
      derivedLastUpdate = nextState.lastUpdate;
    } else if (activeOwned.some((task) => task.status === "in_progress")) {
      const nextState = setDerivedFromTasks(
        {
          status: "working",
          next: derivedNext,
          lastUpdate: derivedLastUpdate,
        },
        activeOwned.filter((task) => task.status === "in_progress"),
      );
      derivedStatus = nextState.status;
      derivedTaskIds = nextState.taskIds;
      derivedNext = nextState.next;
      derivedLastUpdate = nextState.lastUpdate;
    } else if (activeOwned.some((task) => task.status === "blocked")) {
      const nextState = setDerivedFromTasks(
        {
          status: "blocked",
          next: derivedNext,
          lastUpdate: derivedLastUpdate,
        },
        activeOwned.filter((task) => task.status === "blocked"),
      );
      derivedStatus = nextState.status;
      derivedTaskIds = nextState.taskIds;
      derivedNext = nextState.next;
      derivedLastUpdate = nextState.lastUpdate;
    } else if (
      agentDispatchPauses.length ||
      agentProviderPauses.length ||
      agentFailureStreaks.length
    ) {
      derivedStatus = "paused";
      derivedTaskIds = derivedTaskIds.length
        ? derivedTaskIds
        : [
            latestDispatchPause?.task_id,
            latestProviderPause?.task_id,
            latestFailureStreak?.task_id,
            ...ready.map((task) => task.id),
            ...waiting.map((task) => task.id),
          ].filter(Boolean);
      derivedNext =
        latestDispatchPause?.summary ||
        latestProviderPause?.reason ||
        latestProviderPause?.kind ||
        (agentFailureStreaks.length
          ? `failure streak ${latestFailureStreak?.count || agentFailureStreaks.length}`
          : "") ||
        derivedNext;
      derivedLastUpdate =
        latestDispatchPause?.paused_at ||
        latestProviderPause?.paused_at ||
        latestProviderPause?.updated_at ||
        latestFailureStreak?.last_failure_at ||
        derivedLastUpdate;
    } else if (livePendingWorkers.length || liveTransitionWorkers.length) {
      const pendingWorkers = [...livePendingWorkers, ...liveTransitionWorkers];
      const nextState = setDerivedFromWorkers(
        {
          status: "pending",
          next: derivedNext,
          lastUpdate: derivedLastUpdate,
        },
        pendingWorkers,
        (taskId) => taskMap.get(taskId)?.next,
      );
      derivedStatus = nextState.status;
      derivedTaskIds = nextState.taskIds;
      derivedNext = nextState.next;
      derivedLastUpdate = nextState.lastUpdate;
    } else if (ready.length) {
      const nextState = setDerivedFromTasks(
        {
          status: "ready",
          next: derivedNext,
          lastUpdate: derivedLastUpdate,
        },
        ready,
      );
      derivedStatus = nextState.status;
      derivedTaskIds = nextState.taskIds;
      derivedNext = nextState.next;
      derivedLastUpdate = nextState.lastUpdate;
    } else if (waiting.length) {
      const nextState = setDerivedFromTasks(
        {
          status: "waiting",
          next: derivedNext,
          lastUpdate: derivedLastUpdate,
        },
        waiting,
      );
      derivedStatus = nextState.status;
      derivedTaskIds = nextState.taskIds.slice(0, 3);
      derivedNext = nextState.next;
      derivedLastUpdate = nextState.lastUpdate;
    } else if (!owned.length && !reviewTasks.length) {
      derivedStatus = "unassigned";
      derivedTaskIds = [];
      derivedNext = "目前沒有分配給這個 lane 的 open task。";
    }

    const queueBlocked =
      derivedStatus === "paused" || agentFailureStreaks.length > 0;
    const unavailabilityReason =
      latestDispatchPause?.summary ||
      latestProviderPause?.reason ||
      latestProviderPause?.kind ||
      (agentFailureStreaks.length
        ? `failure streak ${latestFailureStreak?.count || agentFailureStreaks.length}`
        : derivedStatus === "unassigned"
          ? "目前沒有分配到 open task"
          : "");

    return {
      ...agent,
      status: derivedStatus,
      current_task_ids: derivedTaskIds,
      next: derivedNext,
      last_update: derivedLastUpdate,
      queued_count: queued.length,
      ready_count: ready.length,
      waiting_count: waiting.length,
      approved_count: approved.length,
      review_count: reviewTasks.length,
      live_running_count: liveRunningWorkers.length,
      live_pending_count: livePendingWorkers.length,
      dispatch_pause_count: agentDispatchPauses.length,
      provider_pause_count: agentProviderPauses.length,
      provider_pause_kind: latestProviderPause?.kind || null,
      failure_streak_count:
        latestFailureStreak?.count || agentFailureStreaks.length,
      queue_blocked: queueBlocked,
      unavailability_reason: unavailabilityReason,
    };
  });
}

// ── Dependency scheduling ─────────────────────────────────────────────────────

export function dependencyBatchState(task, index, unresolvedDeps = []) {
  const status = String(task?.status || "").toLowerCase();
  if (status === "done") return { key: "completed", label: "已完成" };
  if (status === "review_approved") return { key: "approved", label: "待收尾" };
  if (status === "blocked") return { key: "blocked", label: "已阻塞" };
  if (activeTaskStatuses.has(status)) {
    return unresolvedDeps.length > 0
      ? { key: "waiting", label: "等待前置" }
      : { key: "active", label: "進行中" };
  }
  if (
    ["todo", "backlog"].includes(status) &&
    unresolvedDeps.length === 0 &&
    index === 0
  )
    return { key: "ready", label: "可開工" };
  return { key: "waiting", label: "等待前置" };
}

export function buildDependencySchedule(tasks) {
  const allTasks = tasks || [];
  const remaining = allTasks.filter((t) =>
    scheduleOpenTaskStatuses.has(String(t.status || "").toLowerCase()),
  );
  const approved = allTasks.filter(
    (t) => String(t.status || "").toLowerCase() === "review_approved",
  );
  const taskMap = new Map(allTasks.map((t) => [t.id, t]));
  const remainingIds = new Set(remaining.map((t) => t.id));
  const dependents = new Map();
  const indegree = new Map();

  for (const task of remaining) {
    const unresolvedDeps = (task.depends_on || []).filter((depId) =>
      remainingIds.has(depId),
    );
    indegree.set(task.id, unresolvedDeps.length);
    for (const depId of unresolvedDeps) {
      if (!dependents.has(depId)) dependents.set(depId, []);
      dependents.get(depId).push(task.id);
    }
  }

  const sortTasks = (list) =>
    [...list].sort((a, b) => {
      const aActive = activeTaskStatuses.has(a.status) ? 0 : 1;
      const bActive = activeTaskStatuses.has(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.id.localeCompare(b.id);
    });

  let frontier = sortTasks(
    remaining.filter((t) => (indegree.get(t.id) || 0) === 0),
  );
  const scheduled = new Set();
  const waves = [];

  while (frontier.length) {
    waves.push(frontier);
    const nextIds = new Set();
    for (const task of frontier) {
      scheduled.add(task.id);
      for (const dependentId of dependents.get(task.id) || []) {
        indegree.set(dependentId, (indegree.get(dependentId) || 0) - 1);
        if (
          (indegree.get(dependentId) || 0) === 0 &&
          !scheduled.has(dependentId)
        ) {
          nextIds.add(dependentId);
        }
      }
    }
    frontier = sortTasks(
      [...nextIds].map((id) => taskMap.get(id)).filter(Boolean),
    );
  }

  const cyclic = sortTasks(remaining.filter((t) => !scheduled.has(t.id)));

  const depDone = (depId) =>
    String(taskMap.get(depId)?.status || "done").toLowerCase() === "done";
  const readyNow = remaining.filter(
    (t) =>
      (t.depends_on || []).filter((d) => !depDone(d)).length === 0 &&
      t.status === "todo",
  ).length;
  const activeNow = remaining.filter((t) =>
    activeTaskStatuses.has(t.status),
  ).length;
  const waitingNow = remaining.filter(
    (t) => (t.depends_on || []).filter((d) => !depDone(d)).length > 0,
  ).length;
  const explicitBlocked = remaining.filter(
    (t) => t.status === "blocked",
  ).length;
  const approvedNow = approved.length;

  return {
    waves,
    cyclic,
    taskMap,
    readyNow,
    activeNow,
    waitingNow,
    explicitBlocked,
    approvedNow,
    approved,
  };
}
