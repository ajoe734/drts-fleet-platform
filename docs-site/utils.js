// utils.js — shared constants, label maps, formatters, and generic DOM helpers

export const qs = (selector) => document.querySelector(selector);

// ── Board & status constants ──────────────────────────────────────────────────

export const boardColumns = [
  { key: "backlog", label: "待派工" },
  { key: "todo", label: "待開始" },
  { key: "in_progress", label: "進行中" },
  { key: "review", label: "待審查" },
  { key: "review_approved", label: "已批准待收尾" },
  { key: "blocked", label: "已阻塞" },
  { key: "done", label: "已完成" },
];

export const activeTaskStatuses = new Set(["in_progress", "review"]);
export const scheduleOpenTaskStatuses = new Set([
  "backlog",
  "todo",
  "in_progress",
  "review",
  "blocked",
]);
export const integrationPrefixes = new Set(["OC", "RS", "LP", "OSS", "SPIKE"]);

// ── Label maps ────────────────────────────────────────────────────────────────

export const statusLabelMap = {
  idle: "待命",
  working: "工作中",
  reviewing: "審查中",
  finalize: "待收尾",
  ready: "可開工",
  waiting: "等前置",
  paused: "暫停中",
  unassigned: "無任務",
  backlog: "待派工",
  todo: "待開始",
  in_progress: "進行中",
  review: "待審查",
  review_approved: "已批准待收尾",
  blocked: "已阻塞",
  done: "已完成",
  pending: "待處理",
  superseded: "已接手",
  reassigned: "已改派",
  open: "未解決",
  resolved: "已解決",
  accepted: "已接收",
  start: "開始",
  progress: "進度更新",
  handoff: "交接",
  blocker: "阻塞",
  assign: "指派",
};

export const laneLabelMap = {
  execution: "執行平面",
  "control-plane": "控制平面",
  "governance-review": "治理審查",
  "code-agent": "Code Agent",
  gcp: "GCP",
  "ci-cd": "CI/CD",
  "runtime-packaging": "執行環境封裝",
  "worker-ops": "Worker 維運",
  integration: "整合契約",
  "status-system": "狀態系統",
  schema: "Schema",
  acceptance: "驗收",
};

export const workerStatusIcon = {
  running: "🟡",
  completed: "🟢",
  failed: "🔴",
  manual_pending: "⚪",
  started: "🟡",
  superseded: "🔁",
  reassigned: "🔀",
};

export const activityTypeLabel = {
  worker_started: "Worker 啟動",
  worker_failed: "Worker 失敗",
  worker_completed: "Worker 完成",
  worker_resumed: "Worker 恢復",
  approval_requested: "等待批准",
  approval_resolved: "批准完成",
  permission_hook: "權限事件",
  permission_rule_remembered: "規則記憶",
  decision: "決策",
  start: "開始",
  progress: "進度更新",
  handoff: "交接",
  blocker: "阻塞",
  assign: "指派",
  reopen: "打回修改",
  review_approved: "審查通過",
  done: "完成",
};

// ── Label helpers ─────────────────────────────────────────────────────────────

export function statusLabel(value) {
  return statusLabelMap[value] || value || "-";
}

export function laneLabel(value) {
  return laneLabelMap[value] || value;
}

export function providerLabel(value) {
  if (!value) return "-";
  if (value === "copilot") return "GitHub Copilot";
  return value;
}

export function titleCase(value) {
  return String(value || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function agentLabel(value) {
  if (!value) return "-";
  const normalized = String(value).toLowerCase();
  if (normalized === "claude") return "Claude";
  if (normalized === "claude2") return "Claude2";
  if (normalized === "gemini") return "Gemini";
  if (normalized === "gemini2") return "Gemini2";
  if (normalized === "codex") return "Codex";
  if (normalized === "codex2") return "Codex2";
  if (normalized === "qwen") return "Qwen";
  if (normalized === "grok") return "Copilot";
  if (normalized === "copilot") return "Copilot";
  return value;
}

export function actorLabel(agentId, provider) {
  const agent = agentLabel(agentId);
  const host = providerLabel(provider);
  if (
    agentId &&
    provider &&
    String(agentId).toLowerCase() !== String(provider).toLowerCase()
  ) {
    return `${agent} (${host})`;
  }
  return agentId ? agent : host;
}

export function normalizeReviewNotes(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

// ── Formatters ────────────────────────────────────────────────────────────────

export function formatTime(value) {
  if (!value || value === "-") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function timeAgo(value) {
  if (!value) return "-";
  const diff = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

export function truncate(text, maxLen = 100) {
  if (!text || text.length <= maxLen) return text || "-";
  const safeText = text.replace(/"/g, "&quot;");
  return `
    <span class="truncated-wrapper">
      <span class="text-short">${text.slice(0, maxLen)}...</span>
      <span class="text-full" style="display:none">${safeText}</span>
      <button class="expand-btn" onclick="const p=this.parentElement; const s=p.querySelector('.text-short'); const f=p.querySelector('.text-full'); if(f.style.display==='none'){f.style.display='inline'; s.style.display='none'; this.textContent='收合'}else{f.style.display='none'; s.style.display='inline'; this.textContent='展開'}">展開</button>
    </span>`;
}

// ── Generic DOM helpers ───────────────────────────────────────────────────────

export function renderStackList(selector, items, emptyText, formatter) {
  const container = qs(selector);
  if (!container) return;
  container.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  for (const item of items) {
    const card = document.createElement("article");
    card.className = "stack-card";
    card.innerHTML = formatter(item);
    container.appendChild(card);
  }
}
