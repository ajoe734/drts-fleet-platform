// main.js — entry point: orchestrates data fetching and all render calls

import {
  qs,
  statusLabel,
  agentLabel,
  actorLabel,
  normalizeReviewNotes,
  truncate,
  formatTime,
  timeAgo,
  titleCase,
  renderStackList,
  workerStatusIcon,
  activityTypeLabel,
} from "./utils.js";
import {
  DATA_FILES,
  fetchJson,
  fetchText,
  requestDashboardRefresh,
  parseJsonLines,
  parseCurrentWork,
} from "./data.js";
import {
  normalizeWorkerRecords,
  normalizeDispatchQueue,
  deriveAgentState,
  workerLifecycleBadge,
} from "./normalize.js";
import {
  renderWorkload,
  renderAgentLanes,
  renderDeliveryLayers,
  renderTaskBoard,
  renderDependencySchedule,
} from "./execution-mode.js";
import {
  fetchDiscussionState,
  renderDiscussionMode,
  applyModeVisualState,
} from "./discussion-mode.js";

// ── Progress bar ──────────────────────────────────────────────────────────────

function renderProgressBar(tasks) {
  const total = (tasks || []).length;
  const done = (tasks || []).filter((t) => t.status === "done").length;
  const approved = (tasks || []).filter(
    (t) => t.status === "review_approved",
  ).length;
  const open = (tasks || []).filter((t) =>
    ["todo", "in_progress", "review", "blocked"].includes(
      String(t.status || "").toLowerCase(),
    ),
  ).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const label = qs("#progress-label");
  const fill = qs("#progress-fill");
  if (label)
    label.textContent = `Sprint 進度：正式完成 ${done} / ${total} (${pct}%) · 待收尾 ${approved} · 其他 open ${open}`;
  if (fill) fill.style.width = `${pct}%`;
}

// ── Overview metrics ──────────────────────────────────────────────────────────

function renderOverviewMetrics(status, orchState, approvalQueue) {
  const container = qs("#overview-metrics");
  if (!container) return;

  const tasks = status.tasks || [];
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const approvedTasks = tasks.filter((t) => t.status === "review_approved");
  const backlogTasks = tasks.filter((t) =>
    ["todo", "in_progress", "review", "blocked"].includes(
      String(t.status || "").toLowerCase(),
    ),
  );
  const queueEvents = normalizeDispatchQueue(orchState, status);
  const approvalPending = (approvalQueue?.pending || []).length;
  const activeWorkerRows = normalizeWorkerRecords(orchState, status).filter(
    (w) => w.bucket === "running",
  );

  function renderTaskDetail(task) {
    return `
      <div class="metric-task-item">
        <div class="metric-task-head">
          <strong>${task.id}</strong>
          <span class="status-pill status-${task.status}">${statusLabel(task.status)}</span>
        </div>
        <div class="metric-task-meta">
          <span class="chip">Owner ${task.owner}</span>
          <span class="chip">Reviewer ${task.reviewer}</span>
        </div>
        <p class="metric-task-copy">${truncate(task.summary_zh || task.title || "", 80)}</p>
      </div>`;
  }

  function renderQueueDetail(event) {
    return `
      <div class="metric-task-item">
        <div class="metric-task-head">
          <strong>${event.task_id || event.id || "-"}</strong>
          <span class="status-pill status-${event.status || "pending"}">${statusLabel(event.status || "pending")}</span>
        </div>
        <div class="metric-task-meta">
          <span class="chip">${actorLabel(event.logical_agent_id, event.provider)}</span>
          <span class="chip">${event.reason || "-"}</span>
          <span class="chip">${timeAgo(event.last_event_at || event.last_attempt_at || event.processed_at)}</span>
        </div>
      </div>`;
  }

  function renderWorkerDetail(worker) {
    const lifecycle = workerLifecycleBadge(worker);
    return `
      <div class="metric-task-item">
        <div class="metric-task-head">
          <strong>${worker.task_id || worker.run_id || "-"}</strong>
          <span class="status-pill status-${worker.status || "running"}">${statusLabel(worker.status || "running")}</span>
          ${lifecycle ? `<span class="chip ${lifecycle.className}">${lifecycle.label}</span>` : ""}
        </div>
        <div class="metric-task-meta">
          <span class="chip">${worker.display_actor}</span>
          <span class="chip">${worker.reason || worker.mode || "-"}</span>
          <span class="chip">${timeAgo(worker.last_event_at || worker.started_at)}</span>
        </div>
      </div>`;
  }

  const items = [
    {
      label: "正式完成",
      value: `${done} / ${total}`,
      note: `待收尾 ${approvedTasks.length} · 其他 backlog ${backlogTasks.length}`,
    },
    {
      label: "已批准待收尾",
      value: approvedTasks.length,
      note: approvedTasks.length
        ? "review 通過，但仍需 owner finalize 成 done"
        : "目前沒有 review_approved 任務",
      tasks: approvedTasks,
      emptyLabel: "目前沒有待收尾任務",
    },
    {
      label: "其他 open backlog",
      value: backlogTasks.length,
      note: backlogTasks.length
        ? "待開始、審查中或阻塞中的非 finalize 任務"
        : "目前沒有其他 open backlog",
      tasks: backlogTasks,
      emptyLabel: "目前沒有其他 open backlog",
    },
    {
      label: "Dispatch Queue",
      value: queueEvents.length,
      note: queueEvents.length ? "有事件待處理" : "目前清空",
      details: queueEvents,
      emptyLabel: "目前沒有 dispatch queue 項目",
      renderItem: renderQueueDetail,
    },
    {
      label: "Approval Queue",
      value: approvalPending,
      note: approvalPending ? "有待批准項目" : "目前清空",
    },
    {
      label: "Active Workers",
      value: activeWorkerRows.length,
      note: "目前執行中的 worker 數",
      details: activeWorkerRows,
      emptyLabel: "目前沒有 active worker",
      renderItem: renderWorkerDetail,
    },
  ];

  container.innerHTML = items
    .map((item) => {
      const taskList = Array.isArray(item.tasks) ? item.tasks : [];
      const detailList = Array.isArray(item.details) ? item.details : [];
      const detailRender = item.renderItem || renderTaskDetail;
      const detailRows = item.details ? detailList : taskList;
      const detailHtml = detailRows.length
        ? `<details class="metric-details"><summary>查看 ${detailRows.length} 個項目</summary><div class="metric-task-list">${detailRows.map(detailRender).join("")}</div></details>`
        : item.tasks || item.details
          ? `<div class="metric-empty">${item.emptyLabel || "目前沒有項目"}</div>`
          : "";
      return `
      <article class="metric-card">
        <div class="metric-label">${item.label}</div>
        <div class="metric-value">${item.value}</div>
        <div class="metric-note">${item.note}</div>
        ${detailHtml}
      </article>`;
    })
    .join("");
}

// ── System status (supervisor + worker history) ───────────────────────────────

function renderSystemStatus(status, orchState, approvalQueue, agentStates) {
  const statusEl = qs("#system-status");
  const historyEl = qs("#worker-history");
  if (!statusEl || !historyEl) return;
  statusEl.innerHTML = "";
  historyEl.innerHTML = "";

  const queueEvents = normalizeDispatchQueue(orchState, status);
  const supervisor = orchState?.supervisor || {};
  const supervisorHeartbeat =
    supervisor?.last_heartbeat_at || orchState?.last_heartbeat_at || null;
  const lastScan = orchState?.last_scan_at || supervisorHeartbeat || null;
  const workers = normalizeWorkerRecords(orchState, status);
  const activeWorkerCount = workers.filter(
    (w) => w.bucket === "running",
  ).length;
  const pending = (approvalQueue?.pending || []).length;

  // Supervisor card
  const supervisorCard = document.createElement("article");
  supervisorCard.className = "sys-card";
  supervisorCard.innerHTML = `
    <div class="sys-card-head"><span class="sys-icon">🖥</span><strong>Supervisor</strong></div>
    <div class="sys-card-body">
      <span class="status-pill ${supervisorHeartbeat ? "status-working" : "status-blocked"}">${supervisorHeartbeat ? "運作中" : "無資料"}</span>
      <span class="chip">PID：${supervisor?.pid || "-"}</span>
      <span class="chip">啟動：${formatTime(supervisor?.started_at || orchState?.initialized_at || null)}</span>
      <span class="chip">Heartbeat：${timeAgo(supervisorHeartbeat)}</span>
      <span class="chip">上次掃描：${timeAgo(lastScan)}</span>
      <span class="chip">Active Workers：${activeWorkerCount}</span>
    </div>
  `;
  statusEl.appendChild(supervisorCard);

  // Dispatch queue card
  const dispatchCard = document.createElement("article");
  dispatchCard.className = "sys-card";
  dispatchCard.innerHTML = `
    <div class="sys-card-head"><span class="sys-icon">📬</span><strong>Dispatch Queue</strong></div>
    <div class="sys-card-body">
      <span class="status-pill ${queueEvents.length > 0 ? "status-review" : "status-done"}">${queueEvents.length > 0 ? `${queueEvents.length} 個待處理` : "清空"}</span>
      <span class="chip">Active workers：${activeWorkerCount}</span>
      ${queueEvents
        .map(
          (event) => `
        <div class="approval-item">
          <span class="chip">${event.task_id || "-"}</span>
          <span class="chip">${actorLabel(event.logical_agent_id, event.provider)}</span>
          <span class="chip">${event.status || "-"}</span>
          <span class="chip">${event.reason || "-"}</span>
          <span class="chip">${timeAgo(event.last_event_at || event.last_attempt_at || event.processed_at)}</span>
        </div>`,
        )
        .join("")}
    </div>
  `;
  statusEl.appendChild(dispatchCard);

  // Approval queue card
  const approvalCard = document.createElement("article");
  approvalCard.className = "sys-card";
  approvalCard.innerHTML = `
    <div class="sys-card-head"><span class="sys-icon">⏳</span><strong>待批准佇列</strong></div>
    <div class="sys-card-body">
      <span class="status-pill ${pending > 0 ? "status-review" : "status-done"}">${pending > 0 ? `${pending} 個待處理` : "清空"}</span>
      ${(approvalQueue?.pending || [])
        .map(
          (a) => `
        <div class="approval-item">
          <span class="chip">${actorLabel(a.agent_id, a.provider)}</span>
          <span class="chip">task=${a.task_id || "-"}</span>
          <span class="chip">${a.tool_name}</span>
          <span class="chip">${timeAgo(a.created_at)}</span>
        </div>`,
        )
        .join("")}
    </div>
  `;
  statusEl.appendChild(approvalCard);

  // Per-agent worker summary cards
  const logicalAgents = ["claude", "gemini", "codex", "qwen", "copilot"];
  const agentStateMap = new Map(
    (agentStates || []).map((a) => [a.name.toLowerCase(), a]),
  );
  for (const agentId of logicalAgents) {
    const pw = workers.filter((w) => w.logical_agent_id === agentId);
    const running = pw.filter((w) => w.bucket === "running").length;
    const waiting = pw.filter((w) => w.bucket === "pending").length;
    const transition = pw.filter((w) => w.bucket === "transition").length;
    const failed = pw.filter((w) => w.status === "failed").length;
    const completed = pw.filter((w) => w.bucket === "completed").length;
    const agent = agentStateMap.get(agentId);
    const runningTasks = pw
      .filter((w) => w.bucket === "running")
      .map((w) => w.task_id)
      .filter(Boolean);
    const card = document.createElement("article");
    card.className = "sys-card";
    card.innerHTML = `
      <div class="sys-card-head">
        <span class="sys-icon">${running > 0 ? "🟡" : failed > 0 ? "🔴" : "⚪"}</span>
        <strong>${agentLabel(agentId)}</strong>
      </div>
      <div class="sys-card-body">
        <span class="chip">執行中 ${running}</span>
        <span class="chip">等待 ${waiting}</span>
        ${transition ? `<span class="chip">改派 ${transition}</span>` : ""}
        <span class="chip">失敗 ${failed}</span>
        <span class="chip">完成 ${completed}</span>
        ${runningTasks.length ? `<span class="chip">任務 ${runningTasks.join(", ")}</span>` : ""}
        ${agent ? `<span class="chip">可開工 ${agent.ready_count || 0}</span><span class="chip">等前置 ${agent.waiting_count || 0}</span>` : ""}
      </div>
    `;
    statusEl.appendChild(card);
  }

  // Worker history by lane
  const workerGroups = logicalAgents.map((agentId) => {
    const groupWorkers = workers.filter((w) => w.logical_agent_id === agentId);
    return {
      agentId,
      running: groupWorkers.filter((w) => w.bucket === "running"),
      pending: groupWorkers.filter((w) => w.bucket === "pending"),
      transition: groupWorkers.filter((w) => w.bucket === "transition"),
      completed: groupWorkers.filter((w) => w.bucket === "completed"),
    };
  });

  if (
    !workerGroups.some(
      (g) =>
        g.running.length ||
        g.pending.length ||
        g.transition.length ||
        g.completed.length,
    )
  ) {
    historyEl.innerHTML = '<p class="empty">尚無 Worker 記錄。</p>';
    return;
  }

  historyEl.innerHTML = workerGroups
    .map((group) => {
      const total =
        group.running.length +
        group.pending.length +
        group.transition.length +
        group.completed.length;
      if (!total) return "";

      const renderBucket = (label, items, open = true, opts = {}) => {
        if (opts.hideWhenEmpty && !items.length) return "";
        return `
        <details class="worker-bucket" ${open ? "open" : ""}>
          <summary class="worker-bucket-head">
            <strong>${label}</strong><span class="chip">${items.length}</span>
          </summary>
          <div class="worker-bucket-body">
            ${
              items.length
                ? items
                    .map((w) => {
                      const lcBadge = workerLifecycleBadge(w);
                      return `
                <article class="queue-item worker-row worker-${w.status}">
                  <div class="queue-item-head">
                    <strong>${w.task_id || "-"}</strong>
                    <div class="chip-row">
                      ${lcBadge ? `<span class="status-pill worker-lifecycle ${lcBadge.className}">${lcBadge.label}</span>` : ""}
                      <span class="status-pill status-${w.status}">${workerStatusIcon[w.status] || "?"} ${w.status}</span>
                    </div>
                  </div>
                  <div class="lane-meta">
                    <span class="chip"><code>${w.mode || "-"}</code></span>
                    <span class="chip">${w.display_actor}</span>
                    ${w.task_status ? `<span class="chip">task=${statusLabel(w.task_status)}</span>` : ""}
                    <span class="chip">${timeAgo(w.last_event_at)}</span>
                  </div>
                  ${w.last_error ? `<p class="meta-line">${truncate(w.last_error, 120)}</p>` : ""}
                </article>`;
                    })
                    .join("")
                : '<p class="empty">目前沒有項目。</p>'
            }
          </div>
        </details>`;
      };

      return `
      <section class="worker-group">
        <div class="worker-group-head">
          <strong>${agentLabel(group.agentId)}</strong>
          <span class="chip">共 ${total} 筆</span>
        </div>
        <div class="worker-buckets">
          ${renderBucket("進行中", group.running, true)}
          ${renderBucket("等待處理", group.pending, true)}
          ${renderBucket("已改派 / 已接手", group.transition, false, { hideWhenEmpty: true })}
          ${renderBucket("已完成", group.completed, false, { hideWhenEmpty: true })}
        </div>
      </section>`;
    })
    .join("");
}

// ── Activity log ──────────────────────────────────────────────────────────────

function renderActivity(entries) {
  const container = qs("#activity-list");
  if (!container) return;
  container.innerHTML = "";

  const highSignalTypes = new Set([
    "worker_started",
    "worker_failed",
    "worker_resumed",
    "worker_recovered",
    "worker_stalled",
    "worker_superseded",
    "approval_requested",
    "approval_resolved",
    "task_reassigned",
    "handoff",
    "review_approved",
    "done",
    "blocker",
  ]);
  const recent = entries
    .filter((e) => highSignalTypes.has(e.type))
    .slice(-8)
    .reverse();

  if (!recent.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "目前還沒有活動紀錄。";
    container.appendChild(empty);
    return;
  }

  for (const entry of recent) {
    const card = document.createElement("article");
    card.className = "activity-card";
    const msg =
      (entry.message || "").slice(0, 120) +
      ((entry.message || "").length > 120 ? "…" : "");
    card.innerHTML = `
      <div class="lane-head">
        <strong>${entry.agent || entry.provider || "-"}</strong>
        <span class="activity-meta">${timeAgo(entry.ts)}</span>
      </div>
      <p class="activity-message">${msg}</p>
      <div class="lane-meta">
        <span class="chip">${activityTypeLabel[entry.type] || entry.type || "-"}</span>
        <span class="chip">${entry.task_id || "-"}</span>
      </div>
    `;
    container.appendChild(card);
  }
}

// ── Review notes ──────────────────────────────────────────────────────────────

function renderReviewNotes(status) {
  const tasksWithNotes = (status.tasks || []).filter(
    (t) => normalizeReviewNotes(t.review_notes_zh).length,
  );
  renderStackList(
    "#review-note-list",
    tasksWithNotes,
    "目前沒有 reviewer 備註。",
    (task) => `
      <div class="stack-head">
        <strong>${task.id}</strong>
        <span class="status-pill status-${task.status}">${statusLabel(task.status)}</span>
      </div>
      <p>${task.title}</p>
      <p class="task-summary">工作說明：${task.summary_zh || "尚未補上中文說明。"}</p>
      <p class="card-copy">Reviewer：${task.reviewer}</p>
      <ul class="note-list">${normalizeReviewNotes(task.review_notes_zh)
        .map((n) => `<li>${n}</li>`)
        .join("")}</ul>
      ${task.review_file ? `<p class="card-copy">詳細檔案：<code>${task.review_file}</code></p>` : ""}
    `,
  );
}

// ── Audit status ──────────────────────────────────────────────────────────────

function renderAuditStatus(status) {
  const audits = (status.tasks || []).filter(
    (t) => t.phase === "Audit" || t.id.startsWith("AUD-"),
  );
  const summaryContainer = qs("#audit-status");
  if (!summaryContainer) return;
  summaryContainer.innerHTML = "";

  const summaryItems = [
    {
      label: "總 Audit",
      value: audits.length,
      note: "目前被追蹤的對齊檢查任務數",
    },
    {
      label: "待開始",
      value: audits.filter((t) => t.status === "todo").length,
      note: "已指派但還沒開始的 audit",
    },
    {
      label: "進行中",
      value: audits.filter((t) => ["in_progress", "review"].includes(t.status))
        .length,
      note: "已開始或正在審查中的 audit",
    },
    {
      label: "已完成",
      value: audits.filter((t) => t.status === "done").length,
      note: "已產出檢查結果的 audit",
    },
  ];

  for (const item of summaryItems) {
    const card = document.createElement("article");
    card.className = "workload-card";
    card.innerHTML = `
      <div class="lane-head"><strong>${item.label}</strong><span class="status-pill">${item.value}</span></div>
      <p class="dependency-copy">${item.note}</p>
    `;
    summaryContainer.appendChild(card);
  }

  renderStackList(
    "#audit-list",
    audits,
    "目前沒有 audit 任務。",
    (task) => `
      <div class="stack-head">
        <strong>${task.id}</strong>
        <span class="status-pill status-${task.status}">${statusLabel(task.status)}</span>
      </div>
      <p>${task.title}</p>
      <p class="task-summary">工作說明：${task.summary_zh || "尚未補上中文說明。"}</p>
      <div class="lane-meta">
        <span class="chip">負責人 ${task.owner}</span>
        <span class="chip">審查者 ${task.reviewer}</span>
      </div>
      ${(task.artifacts || []).length ? `<p class="card-copy">輸出檔案：${task.artifacts.map((p) => `<code>${p}</code>`).join("、")}</p>` : ""}
      <p class="card-copy">下一步：${truncate(task.next, 120)}</p>
    `,
  );
}

// ── Sprint snapshot ───────────────────────────────────────────────────────────

function renderSnapshot(snapshot) {
  const container = qs("#snapshot");
  if (!container) return;
  container.innerHTML = "";
  const blocks = [
    snapshot.objective || "目前沒有可顯示的目標。",
    ...(snapshot.sprint || []),
  ];
  for (const block of blocks) {
    const card = document.createElement("article");
    card.className = "snapshot-card";
    card.innerHTML = `<p class="snapshot-item">${block}</p>`;
    container.appendChild(card);
  }
}

// ── Main render ───────────────────────────────────────────────────────────────

let renderInFlight = false;

async function render({ syncFirst = false } = {}) {
  if (renderInFlight) return;
  renderInFlight = true;

  const refreshButton = qs("#refresh-button");
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = syncFirst ? "同步中..." : "重新整理中...";
  }

  try {
    if (syncFirst) await requestDashboardRefresh();

    const [
      status,
      activityText,
      currentWorkText,
      orchState,
      approvalQueue,
      discussionState,
    ] = await Promise.all([
      fetchJson(DATA_FILES.status),
      fetchText(DATA_FILES.activity),
      fetchText(DATA_FILES.currentWork),
      fetchJson(DATA_FILES.orchestratorState).catch(() => ({})),
      fetchJson(DATA_FILES.approvalQueue).catch(() => null),
      fetchDiscussionState(),
    ]);

    const logs = parseJsonLines(activityText);
    const snapshot = parseCurrentWork(currentWorkText);
    const projectName = titleCase(
      status.project || snapshot.project || "project",
    );

    qs("#objective").textContent =
      status.objective || snapshot.objective || "目前沒有可顯示的目標。";
    qs("#updated-at").textContent = formatTime(status.updated_at);
    const projectBadge = qs("#project-badge");
    if (projectBadge) projectBadge.textContent = `${projectName} Runtime`;
    document.title = `${projectName} 協作看板`;

    // Apply mode-aware visual state (badge, open/closed sections)
    const currentMode = status.execution_mode || "supervisor_managed_execution";
    applyModeVisualState(currentMode);

    const agentStates = deriveAgentState(status, orchState);

    renderProgressBar(status.tasks);
    renderOverviewMetrics(status, orchState, approvalQueue);
    renderSystemStatus(status, orchState, approvalQueue, agentStates);
    renderWorkload(status);
    renderDeliveryLayers(status);
    renderAgentLanes(status, orchState);
    renderTaskBoard(status, orchState);
    renderReviewNotes(status);
    renderAuditStatus(status);
    renderDependencySchedule(status);

    // Discussion mode panel
    renderDiscussionMode(discussionState, status);

    renderStackList(
      "#handoff-list",
      (status.handoffs || []).filter((h) => h.status !== "done"),
      "目前沒有待交接項目。",
      (handoff) => `
        <div class="stack-head">
          <strong>${handoff.task_id}</strong>
          <span class="status-pill">${statusLabel(handoff.status)}</span>
        </div>
        <p>${handoff.from} -> ${handoff.to}</p>
        <p class="card-copy">${handoff.message}</p>
        <p class="card-copy">${formatTime(handoff.created_at)}</p>
      `,
    );

    renderStackList(
      "#blocker-list",
      (status.blockers || []).filter((b) => b.status === "open"),
      "目前沒有阻塞項目。",
      (blocker) => `
        <div class="stack-head">
          <strong>${blocker.task_id}</strong>
          <span class="status-pill status-blocked">${statusLabel(blocker.status)}</span>
        </div>
        <p>負責人：${blocker.owner}</p>
        <p>等待對象：${blocker.waiting_for}</p>
        <p class="card-copy">${blocker.message}</p>
      `,
    );

    renderSnapshot(snapshot);
    renderActivity(logs);
  } catch (error) {
    const objectiveEl = qs("#objective");
    if (objectiveEl)
      objectiveEl.textContent = `協作資料載入失敗：${error.message}`;
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = "重新整理";
    }
    renderInFlight = false;
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

qs("#refresh-button").addEventListener("click", () =>
  render({ syncFirst: true }),
);
render();
