// execution-mode.js — rendering functions for supervisor_managed_execution mode

import {
  qs,
  statusLabel,
  laneLabel,
  agentLabel,
  normalizeReviewNotes,
  truncate,
  formatTime,
  timeAgo,
  boardColumns,
  activeTaskStatuses,
} from "./utils.js";
import {
  normalizeWorkerRecords,
  normalizeDispatchQueue,
  deriveAgentState,
  buildDependencySchedule,
  dependencyBatchState,
  taskDeliveryLayer,
  taskBadgeRow,
  workerLifecycleBadge,
  terminalTaskStatus,
} from "./normalize.js";

// ── Workload ──────────────────────────────────────────────────────────────────

export function renderWorkload(status) {
  const container = qs("#workload-grid");
  if (!container) return;
  container.innerHTML = "";

  for (const [name, summary] of Object.entries(status.workload_summary || {})) {
    const target = status.workload?.[name] ?? 0;
    const fill = Math.min(summary.total * 15, 100);
    const card = document.createElement("article");
    card.className = "workload-card";
    card.innerHTML = `
      <div class="lane-head">
        <strong>${name}</strong>
        <span class="status-pill">目標 ${target}%</span>
      </div>
      <div class="workload-bar"><div class="workload-fill" style="width:${fill}%"></div></div>
      <div class="lane-meta">
        <span class="chip">總數 ${summary.total}</span>
        <span class="chip">活躍 ${summary.active}</span>
        <span class="chip">阻塞 ${summary.blocked}</span>
        <span class="chip">完成 ${summary.done}</span>
      </div>
    `;
    container.appendChild(card);
  }
}

// ── Agent lanes ───────────────────────────────────────────────────────────────

export function renderAgentLanes(status, orchState) {
  const container = qs("#agent-lanes");
  if (!container) return;
  container.innerHTML = "";
  const taskMap = new Map((status.tasks || []).map((task) => [task.id, task]));

  for (const agent of deriveAgentState(status, orchState)) {
    const focusTasks = (agent.current_task_ids || [])
      .map((taskId) => taskMap.get(taskId))
      .filter(Boolean)
      .map(
        (task) =>
          `<li><strong>${task.id}</strong>：${task.summary_zh || task.title}</li>`,
      )
      .join("");
    const card = document.createElement("article");
    card.className = "lane";
    const activeTasks = (agent.current_task_ids || []).length
      ? agent.current_task_ids.join(", ")
      : "目前沒有焦點任務";
    card.innerHTML = `
      <div class="lane-head">
        <strong>${agent.name}</strong>
        <span class="status-pill status-${agent.status}">${statusLabel(agent.status)}</span>
      </div>
      <p class="lane-copy">${(agent.capability_lane || []).map(laneLabel).join(" · ")}</p>
      <div class="lane-meta">
        <span class="chip">${agent.branch || "未指定分支"}</span>
        <span class="chip">${activeTasks}</span>
        <span class="chip">可開工 ${agent.ready_count || 0}</span>
        <span class="chip">等前置 ${agent.waiting_count || 0}</span>
        <span class="chip">已批准 ${agent.approved_count || 0}</span>
      </div>
      ${focusTasks ? `<ul class="note-list compact">${focusTasks}</ul>` : ""}
      <p class="lane-copy">下一步：${truncate(agent.next, 120)}</p>
      <p class="lane-copy">最後更新：${formatTime(agent.last_update)}</p>
    `;
    container.appendChild(card);
  }
}

// ── Delivery layers ───────────────────────────────────────────────────────────

export function renderDeliveryLayers(status) {
  const container = qs("#delivery-layers");
  if (!container) return;
  container.innerHTML = "";

  const tasks = (status.tasks || []).filter((t) => t.status !== "done");
  const layers = [
    {
      key: "product",
      title: "產品本體工作",
      copy: "產品本體、執行邊界、registry、feedback、repo 邊界與 audit 等工作。",
      tasks: tasks.filter((t) => taskDeliveryLayer(t) === "product"),
    },
    {
      key: "upstream",
      title: "外部 / 上游整合工作",
      copy: "針對外部框架、adapter、整合點與 smoke test 的工作。",
      tasks: tasks.filter((t) => taskDeliveryLayer(t) === "upstream"),
    },
  ];

  for (const layer of layers) {
    const section = document.createElement("section");
    section.className = "delivery-layer";
    section.innerHTML = `
      <div class="delivery-layer-head">
        <div>
          <h3>${layer.title}</h3>
          <p class="section-copy">${layer.copy}</p>
        </div>
        <span class="status-pill">${layer.tasks.length} 個未完成任務</span>
      </div>
      <div class="delivery-layer-grid"></div>
    `;
    const grid = section.querySelector(".delivery-layer-grid");

    if (!layer.tasks.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "目前這一層沒有未完成任務。";
      grid.appendChild(empty);
    }

    for (const task of layer.tasks) {
      const card = document.createElement("article");
      card.className = "delivery-card";
      const depends = (task.depends_on || []).length
        ? task.depends_on.join(", ")
        : "無";
      card.innerHTML = `
        <div class="task-head">
          <strong>${task.id}</strong>
          <span class="status-pill status-${task.status}">${statusLabel(task.status)}</span>
        </div>
        <p>${task.title}</p>
        <p class="task-summary">工作說明：${task.summary_zh || "尚未補上中文說明。"}</p>
        <div class="lane-meta">
          <span class="chip">${task.phase}</span>
          <span class="chip">負責人 ${task.owner}</span>
          <span class="chip">審查者 ${task.reviewer}</span>
        </div>
        ${taskBadgeRow(task, "lane-meta")}
        <div class="lane-meta">
          <span class="chip">依賴 ${depends}</span>
        </div>
        <p class="card-copy">下一步：${truncate(task.next, 120)}</p>
      `;
      grid.appendChild(card);
    }

    container.appendChild(section);
  }
}

// ── Task board ────────────────────────────────────────────────────────────────

export function renderTaskBoard(status, orchState) {
  const board = qs("#task-board");
  if (!board) return;
  board.innerHTML = "";

  const workers = normalizeWorkerRecords(orchState, status);
  const liveWorkersByTask = new Map();
  for (const worker of workers) {
    if (!worker.task_id) continue;
    if (!["running", "pending"].includes(worker.bucket)) continue;
    if (!liveWorkersByTask.has(worker.task_id))
      liveWorkersByTask.set(worker.task_id, []);
    liveWorkersByTask.get(worker.task_id).push(worker);
  }

  const displayTasks = (status.tasks || []).map((task) => {
    const liveWorkers = liveWorkersByTask.get(task.id) || [];
    const hasRunning = liveWorkers.some((w) => w.bucket === "running");
    const hasPending = liveWorkers.some((w) => w.bucket === "pending");
    let displayStatus = task.status;
    if (!terminalTaskStatus(task.status) && hasRunning)
      displayStatus = "in_progress";
    else if (task.status === "todo" && hasPending)
      displayStatus = "in_progress";
    return {
      ...task,
      display_status: displayStatus,
      live_workers: liveWorkers,
    };
  });

  for (const column of boardColumns) {
    const wrapper = document.createElement("section");
    wrapper.className = "board-column";
    const tasks = displayTasks.filter((t) => t.display_status === column.key);
    wrapper.innerHTML = `<h3>${column.label}</h3><div class="column-stack"></div>`;
    const stack = wrapper.querySelector(".column-stack");

    if (!tasks.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "目前沒有任務";
      stack.appendChild(empty);
    }

    for (const task of tasks) {
      const card = document.createElement("article");
      card.className = "task-card";
      const depends = (task.depends_on || []).length
        ? task.depends_on.join(", ")
        : "無";
      const runtimeBadge = task.live_workers.length
        ? `<span class="chip">live worker ${task.live_workers.map((w) => `${agentLabel(w.logical_agent_id)}:${w.status}`).join(" / ")}</span>`
        : "";
      const canonicalBadge =
        task.display_status !== task.status
          ? `<span class="chip">canonical ${statusLabel(task.status)}</span>`
          : "";
      const approvedFollowupBadge =
        task.status === "review_approved"
          ? `<span class="chip">待收尾回到 ${task.owner}</span>`
          : "";
      card.innerHTML = `
        <div class="task-head">
          <strong>${task.id}</strong>
          <span class="status-pill status-${task.display_status}">${statusLabel(task.display_status)}</span>
        </div>
        <p>${task.title}</p>
        <p class="task-summary">工作說明：${task.summary_zh || "尚未補上中文說明。"}</p>
        <div class="task-meta">
          <span class="chip">${task.phase}</span>
          <span class="chip">負責人 ${task.owner}</span>
          <span class="chip">審查者 ${task.reviewer}</span>
        </div>
        ${taskBadgeRow(task)}
        <div class="task-foot">
          <span class="chip">依賴 ${depends}</span>
          <span class="chip">${formatTime(task.last_update)}</span>
        </div>
        <div class="task-meta">
          ${runtimeBadge}
          ${canonicalBadge}
          ${approvedFollowupBadge}
        </div>
        ${
          normalizeReviewNotes(task.review_notes_zh).length
            ? `<div class="review-block">
                <p class="review-title">審查重點</p>
                <ul class="note-list">${normalizeReviewNotes(
                  task.review_notes_zh,
                )
                  .map((n) => `<li>${n}</li>`)
                  .join("")}</ul>
                ${task.review_file ? `<p class="card-copy">參考檔案：<code>${task.review_file}</code></p>` : ""}
              </div>`
            : ""
        }
        <p class="card-copy">下一步：${truncate(task.next, 120)}</p>
      `;
      stack.appendChild(card);
    }
    board.appendChild(wrapper);
  }
}

// ── Dependency schedule ───────────────────────────────────────────────────────

export function renderDependencySchedule(status) {
  const summary = qs("#dependency-summary");
  const container = qs("#dependency-schedule");
  if (summary) summary.innerHTML = "";
  if (container) container.innerHTML = "";
  if (!summary || !container) return;

  const schedule = buildDependencySchedule(status.tasks || []);
  const summaryItems = [
    {
      label: "現在可開工",
      value: schedule.readyNow,
      note: "所有前置都已完成，且尚未開始",
    },
    {
      label: "目前進行中",
      value: schedule.activeNow,
      note: "包含進行中與待審查",
    },
    {
      label: "等待前置",
      value: schedule.waitingNow,
      note: "依賴尚未完成，不能安全開工",
    },
    {
      label: "明確阻塞",
      value: schedule.explicitBlocked,
      note: "已有 blocker 狀態記錄",
    },
    {
      label: "已批准待收尾",
      value: schedule.approvedNow,
      note: "review_approved 尚未正式完成，需由 owner 收尾成 done",
    },
  ];

  for (const item of summaryItems) {
    const card = document.createElement("article");
    card.className = "workload-card";
    card.innerHTML = `
      <div class="lane-head"><strong>${item.label}</strong><span class="status-pill">${item.value}</span></div>
      <p class="dependency-copy">${item.note}</p>
    `;
    summary.appendChild(card);
  }

  if (schedule.approved.length) {
    const approvedSection = document.createElement("section");
    approvedSection.className = "dependency-wave dependency-approved";
    approvedSection.innerHTML = `
      <div class="dependency-wave-head">
        <div>
          <h3>已批准待收尾</h3>
          <p class="section-copy">${schedule.approved.length} 個任務</p>
        </div>
        <div class="chip-row">
          <span class="status-pill batch-pill batch-approved">review_approved ${schedule.approved.length}</span>
        </div>
      </div>
      <div class="dependency-grid"></div>
    `;
    const approvedGrid = approvedSection.querySelector(".dependency-grid");
    for (const task of schedule.approved) {
      const depends = (task.depends_on || []).length
        ? task.depends_on.join(", ")
        : "無";
      const card = document.createElement("article");
      card.className = "dependency-card batch-approved";
      card.innerHTML = `
        <div class="task-head">
          <strong>${task.id}</strong>
          <div class="chip-row">
            <span class="status-pill batch-pill batch-approved">待收尾</span>
            <span class="status-pill status-${task.status}">${statusLabel(task.status)}</span>
          </div>
        </div>
        <p>${task.title}</p>
        <p class="task-summary">工作說明：${task.summary_zh || "尚未補上中文說明。"}</p>
        <div class="dependency-meta">
          <span class="chip">負責人 ${task.owner}</span>
          <span class="chip">審查者 ${task.reviewer}</span>
          <span class="chip">前置 ${depends}</span>
        </div>
        ${taskBadgeRow(task, "dependency-meta")}
        <p class="dependency-copy">這些任務已通過 review gate，但尚未正式完成；owner 收尾成 done 後，才會解除下游依賴。</p>
      `;
      approvedGrid.appendChild(card);
    }
    container.appendChild(approvedSection);
  }

  if (!schedule.waves.length && !schedule.cyclic.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = schedule.approved.length
      ? "目前沒有新的開發 / 審查波次；上方仍有已批准待 owner 收尾的任務。"
      : "目前沒有可排程的未完成任務。";
    container.appendChild(empty);
    return;
  }

  schedule.waves.forEach((wave, index) => {
    const section = document.createElement("section");
    section.className = "dependency-wave";
    const title =
      index === 0
        ? "現在這一波"
        : index === 1
          ? "下一波"
          : `第 ${index + 1} 波`;
    const counts = wave.reduce(
      (acc, task) => {
        const unresolved = (task.depends_on || []).filter(
          (depId) =>
            String(
              schedule.taskMap.get(depId)?.status || "done",
            ).toLowerCase() !== "done",
        );
        const batch = dependencyBatchState(task, index, unresolved).key;
        acc[batch] = (acc[batch] || 0) + 1;
        return acc;
      },
      { completed: 0, active: 0, ready: 0, waiting: 0, blocked: 0 },
    );
    section.innerHTML = `
      <div class="dependency-wave-head">
        <div><h3>${title}</h3><p class="section-copy">${wave.length} 個任務</p></div>
        <div class="chip-row">
          ${counts.active ? `<span class="status-pill status-running">進行中 ${counts.active}</span>` : ""}
          ${counts.ready ? `<span class="status-pill status-ready">可開工 ${counts.ready}</span>` : ""}
          ${counts.waiting ? `<span class="status-pill status-pending">等待前置 ${counts.waiting}</span>` : ""}
          ${counts.blocked ? `<span class="status-pill status-blocked">阻塞 ${counts.blocked}</span>` : ""}
        </div>
      </div>
      <div class="dependency-grid"></div>
    `;
    const grid = section.querySelector(".dependency-grid");

    for (const task of wave) {
      const unresolved = (task.depends_on || []).filter(
        (depId) =>
          String(
            schedule.taskMap.get(depId)?.status || "done",
          ).toLowerCase() !== "done",
      );
      const depends = (task.depends_on || []).length
        ? task.depends_on.join(", ")
        : "無";
      const unresolvedStr = unresolved.length ? unresolved.join(", ") : "無";
      const batchState = dependencyBatchState(task, index, unresolved);
      const card = document.createElement("article");
      card.className = `dependency-card batch-${batchState.key}`;
      card.innerHTML = `
        <div class="task-head">
          <strong>${task.id}</strong>
          <div class="chip-row">
            <span class="status-pill batch-pill batch-${batchState.key}">${batchState.label}</span>
            <span class="status-pill status-${task.status}">${statusLabel(task.status)}</span>
          </div>
        </div>
        <p>${task.title}</p>
        <p class="task-summary">工作說明：${task.summary_zh || "尚未補上中文說明。"}</p>
        <div class="dependency-meta">
          <span class="chip">${task.phase}</span>
          <span class="chip">負責人 ${task.owner}</span>
          <span class="chip">審查者 ${task.reviewer}</span>
        </div>
        ${taskBadgeRow(task, "dependency-meta")}
        <div class="dependency-meta">
          <span class="chip">全部前置 ${depends}</span>
          <span class="chip">未完成前置 ${unresolvedStr}</span>
        </div>
        <p class="dependency-copy">排程判斷：${
          batchState.key === "completed"
            ? "這一波中的工作已完成，後續可以往下一波推進。"
            : batchState.key === "active"
              ? "這一波正在被執行或審查，完成後會推動下一波。"
              : batchState.key === "ready"
                ? "這一波可直接開工。"
                : batchState.key === "blocked"
                  ? "這一波存在明確阻塞，需先解除阻塞。"
                  : "仍有未完成前置；待前置正式 done 後才適合開始。"
        }</p>
        <p class="card-copy">下一步：${truncate(task.next, 120)}</p>
      `;
      grid.appendChild(card);
    }
    container.appendChild(section);
  });

  if (schedule.cyclic.length) {
    const section = document.createElement("section");
    section.className = "dependency-wave";
    section.innerHTML = `
      <div class="dependency-wave-head">
        <h3>循環或異常依賴</h3>
        <span class="section-copy">${schedule.cyclic.length} 個任務</span>
      </div>
      <div class="dependency-grid"></div>
    `;
    const grid = section.querySelector(".dependency-grid");
    for (const task of schedule.cyclic) {
      const card = document.createElement("article");
      card.className = "dependency-card blocked-now";
      card.innerHTML = `
        <div class="task-head">
          <strong>${task.id}</strong>
          <span class="status-pill status-blocked">需檢查</span>
        </div>
        <p>${task.title}</p>
        <div class="dependency-meta">
          <span class="chip">前置 ${(task.depends_on || []).join(", ") || "無"}</span>
        </div>
        <p class="dependency-copy">這些任務沒有被正常排進波次，通常代表依賴循環或缺少狀態收斂。</p>
      `;
      grid.appendChild(card);
    }
    container.appendChild(section);
  }
}
