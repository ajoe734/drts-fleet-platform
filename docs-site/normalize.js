// normalize.js — data transformation: worker records, agent state, dependency scheduling

import {
  activeTaskStatuses,
  scheduleOpenTaskStatuses,
  integrationPrefixes,
  workerStatusIcon,
  agentLabel,
  actorLabel,
} from "./utils.js";

const queuedTaskStatuses = new Set(["todo", "backlog"]);

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
      } else if (["running", "started"].includes(worker?.status)) {
        bucket = "running";
      } else if (
        [
          "waiting_approval",
          "suspended_approval",
          "manual_pending",
          "retry_backoff",
          "stalled",
          "fallback",
        ].includes(worker?.status)
      ) {
        bucket = "pending";
      }

      return {
        ...worker,
        run_id: runId,
        logical_agent_id: logicalAgentId,
        task_status: taskStatus,
        bucket,
        display_actor: actorLabel(logicalAgentId, worker?.provider),
      };
    },
  );

  return workers.sort((a, b) =>
    (b.last_event_at || "").localeCompare(a.last_event_at || ""),
  );
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
    const active = owned.filter((task) =>
      ["in_progress", "review", "blocked"].includes(task.status),
    );
    const ownedReview = active.filter((task) => task.status === "review");
    const incomingReview = allTasks.filter(
      (task) => task.reviewer === agent.name && task.status === "review",
    );
    const reviewTasks = [
      ...new Map(
        [...ownedReview, ...incomingReview].map((task) => [task.id, task]),
      ).values(),
    ];
    const approved = owned.filter((t) => t.status === "review_approved");
    const queued = owned.filter((task) => queuedTaskStatuses.has(task.status));
    const ready = queued.filter((task) =>
      (task.depends_on || []).every(
        (depId) => (taskMap.get(depId)?.status || "done") === "done",
      ),
    );
    const waiting = queued.filter((task) => !ready.includes(task));

    const liveRunningWorkers = workers.filter(
      (w) => w.logical_agent_id === agentId && w.bucket === "running",
    );
    const livePendingWorkers = workers.filter(
      (w) => w.logical_agent_id === agentId && w.bucket === "pending",
    );
    const liveTransitionWorkers = workers.filter(
      (w) => w.logical_agent_id === agentId && w.bucket === "transition",
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

    if (liveRunningWorkers.length) {
      derivedStatus = "working";
      derivedTaskIds = liveRunningWorkers.map((w) => w.task_id).filter(Boolean);
      const latest = [...liveRunningWorkers].sort((a, b) =>
        (b.last_event_at || "").localeCompare(a.last_event_at || ""),
      )[0];
      derivedNext =
        latest?.last_error || taskMap.get(latest?.task_id)?.next || derivedNext;
      derivedLastUpdate = latest?.last_event_at || derivedLastUpdate;
    } else if (active.some((t) => t.status === "blocked")) {
      derivedStatus = "blocked";
      derivedTaskIds = active.map((t) => t.id);
    } else if (active.some((t) => t.status === "in_progress")) {
      derivedStatus = "working";
      derivedTaskIds = active.map((t) => t.id);
    } else if (reviewTasks.length) {
      derivedStatus = "reviewing";
      derivedTaskIds = reviewTasks.map((t) => t.id);
    } else if (approved.length) {
      derivedStatus = "finalize";
      derivedTaskIds = approved.map((t) => t.id);
      derivedNext = approved[0].next || derivedNext;
      derivedLastUpdate = approved[0].last_update || derivedLastUpdate;
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
            ...ready.map((t) => t.id),
            ...waiting.map((t) => t.id),
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
      derivedStatus = "pending";
      derivedTaskIds = [...livePendingWorkers, ...liveTransitionWorkers]
        .map((w) => w.task_id)
        .filter(Boolean);
      const latest = [...livePendingWorkers, ...liveTransitionWorkers].sort(
        (a, b) => (b.last_event_at || "").localeCompare(a.last_event_at || ""),
      )[0];
      derivedNext =
        latest?.last_error || taskMap.get(latest?.task_id)?.next || derivedNext;
      derivedLastUpdate = latest?.last_event_at || derivedLastUpdate;
    } else if (ready.length) {
      derivedStatus = "ready";
      derivedTaskIds = ready.map((t) => t.id);
      derivedNext = ready[0].next || derivedNext;
      derivedLastUpdate = ready[0].last_update || derivedLastUpdate;
    } else if (waiting.length) {
      derivedStatus = "waiting";
      derivedTaskIds = waiting.slice(0, 3).map((t) => t.id);
      derivedNext = waiting[0].next || derivedNext;
      derivedLastUpdate = waiting[0].last_update || derivedLastUpdate;
    } else if (!owned.length && !reviewTasks.length) {
      derivedStatus = "unassigned";
      derivedTaskIds = [];
      derivedNext = "目前沒有分配給這個 lane 的 open task。";
    }

    if (!liveRunningWorkers.length && active.length) {
      const latest = [...active].sort((a, b) =>
        (b.last_update || "").localeCompare(a.last_update || ""),
      )[0];
      derivedNext = latest?.next || derivedNext;
      derivedLastUpdate = latest?.last_update || derivedLastUpdate;
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
