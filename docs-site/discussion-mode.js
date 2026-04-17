// discussion-mode.js — fetch and render discussion_planning mode artifacts

import { qs, agentLabel, formatTime } from "./utils.js";
import {
  CONSENSUS_FILES,
  probeFile,
  parseBatonLog,
  parseSupervisorQueue,
  parseConsensusPacket,
} from "./data.js";

// ── Discussion state fetcher ──────────────────────────────────────────────────

export async function fetchDiscussionState() {
  const lanes = ["Codex", "Qwen", "Gemini", "Copilot", "Claude"];
  const roundPaths = CONSENSUS_FILES.rounds;

  const [batonResult, queueResult, packetResult, ...rest] = await Promise.all([
    probeFile(CONSENSUS_FILES.batonLog),
    probeFile(CONSENSUS_FILES.supervisorQueue),
    probeFile(CONSENSUS_FILES.consensusPacket),
    ...lanes.map((lane) => probeFile(CONSENSUS_FILES.readouts[lane])),
    ...roundPaths.map((path) => probeFile(path)),
  ]);

  const readouts = Object.fromEntries(lanes.map((lane, i) => [lane, rest[i]]));
  const rounds = roundPaths
    .map((_, i) => ({ round: i + 1, ...rest[lanes.length + i] }))
    .filter((r) => r.exists);

  return {
    batonLog: batonResult,
    supervisorQueue: queueResult,
    consensusPacket: packetResult,
    readouts,
    rounds,
  };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const LANE_ROLES = {
  Codex: "合約 · Schema · 狀態機 · 驗收基線",
  Qwen: "API 接縫 · 流程可行性 · adapter 邊界",
  Gemini: "部署包裝 · CI/CD · infra · migration 風險",
  Copilot: "矛盾掃描 · 外部批判 · 二次審查",
  Claude: "治理審查 · 架構仲裁 · 共識合成（Supervisor）",
};

export function renderDiscussionMode(discussionState, statusData) {
  renderBatonStatus(discussionState, statusData);
  renderReadoutProgress(discussionState.readouts, statusData);
  renderReviewRounds(discussionState.rounds);
  renderConsensusPacketStatus(discussionState.consensusPacket, statusData);
}

// Baton Loop Status card
function renderBatonStatus(discussionState, statusData) {
  const container = qs("#baton-status");
  if (!container) return;

  const queueParsed = parseSupervisorQueue(
    discussionState.supervisorQueue.content,
  );
  const batonRounds = parseBatonLog(discussionState.batonLog.content);
  const lastRound = batonRounds[batonRounds.length - 1] || null;

  // Pull review order from ai-status.json
  const reviewOrder = statusData?.discussion_supervisor_config?.review_order ||
    statusData?.discussion_loop?.review_order ||
    statusData?.review_order || ["Qwen", "Gemini", "Copilot", "Claude"];

  const currentOwner =
    queueParsed.currentOwner !== "-"
      ? queueParsed.currentOwner
      : statusData?.discussion_loop?.current_owner ||
        statusData?.current_baton_owner ||
        "-";

  const activeFile = queueParsed.activeFile;

  const roundRows = batonRounds
    .map(
      (r) => `
      <div class="baton-round-row">
        <span class="chip">Round ${r.round}</span>
        <span class="chip baton-owner-chip">${r.owner}</span>
        <span class="chip ${r.status === "completed" || r.status === "converged" ? "status-chip-done" : "status-chip-active"}">${r.status}</span>
        ${r.outcome ? `<span class="baton-outcome">${r.outcome}</span>` : ""}
      </div>
    `,
    )
    .join("");

  const dispositionRows = queueParsed.disposition.length
    ? queueParsed.disposition.map((d) => `<li>${d}</li>`).join("")
    : "";

  container.innerHTML = `
    <div class="discussion-card baton-card">
      <div class="discussion-card-head">
        <div>
          <p class="discussion-kicker">Baton Loop</p>
          <h3>目前接力棒狀態</h3>
        </div>
        <span class="baton-owner-badge">${currentOwner}</span>
      </div>
      <div class="baton-meta">
        <span class="chip">Supervisor：Claude</span>
        <span class="chip">共 ${batonRounds.length} 輪</span>
        ${activeFile !== "-" ? `<span class="chip">作業檔案：<code>${activeFile}</code></span>` : ""}
      </div>
      <div class="baton-review-order">
        <p class="discussion-label">預設 Review 順序</p>
        <div class="lane-meta">
          ${reviewOrder.map((lane, i) => `<span class="chip">${i + 1}. ${lane}</span>`).join("")}
        </div>
      </div>
      ${roundRows ? `<div class="baton-rounds"><p class="discussion-label">Baton 歷史</p>${roundRows}</div>` : ""}
      ${dispositionRows ? `<div class="baton-disposition"><p class="discussion-label">目前處置</p><ul class="note-list">${dispositionRows}</ul></div>` : ""}
    </div>
  `;
}

// Readout progress grid
function renderReadoutProgress(readouts, statusData) {
  const container = qs("#readout-progress");
  if (!container) return;

  const lanes = ["Codex", "Qwen", "Gemini", "Copilot", "Claude"];
  const submittedCount = lanes.filter((l) => readouts[l]?.exists).length;

  const cards = lanes
    .map((lane) => {
      const submitted = readouts[lane]?.exists;
      return `
      <article class="readout-lane-card ${submitted ? "readout-submitted" : "readout-pending"}">
        <div class="readout-lane-head">
          <strong>${lane}</strong>
          <span class="readout-status-badge ${submitted ? "badge-submitted" : "badge-missing"}">
            ${submitted ? "已提交" : "未提交"}
          </span>
        </div>
        <p class="readout-role">${LANE_ROLES[lane] || ""}</p>
      </article>
    `;
    })
    .join("");

  container.innerHTML = `
    <div class="discussion-card">
      <div class="discussion-card-head">
        <div>
          <p class="discussion-kicker">Phase B</p>
          <h3>Lane Readout 進度</h3>
        </div>
        <span class="readout-tally">${submittedCount} / ${lanes.length} 已提交</span>
      </div>
      <div class="readout-grid">${cards}</div>
    </div>
  `;
}

// Review rounds list
function renderReviewRounds(rounds) {
  const container = qs("#review-rounds");
  if (!container) return;

  if (!rounds.length) {
    container.innerHTML = `
      <div class="discussion-card">
        <div class="discussion-card-head">
          <div>
            <p class="discussion-kicker">Phase C / D</p>
            <h3>Cross-Review 輪次</h3>
          </div>
        </div>
        <p class="empty">尚無 review round 文件。</p>
      </div>
    `;
    return;
  }

  const roundCards = rounds
    .map((r) => {
      // Try to count how many entries exist in the round file
      const entryCount = (r.content.match(/^### Entry/gm) || []).length;
      const normalizedEntryCount =
        entryCount || (r.content.match(/^(##|###) Entry\b/gm) || []).length;
      const hasConclusion = /converged|accepted|resolved|human_required/i.test(
        r.content,
      );
      return `
      <article class="round-card ${hasConclusion ? "round-converged" : "round-open"}">
        <div class="round-card-head">
          <strong>Review Round ${r.round}</strong>
          <span class="chip ${hasConclusion ? "status-chip-done" : "status-chip-active"}">
            ${hasConclusion ? "已收斂" : "進行中"}
          </span>
        </div>
        <div class="lane-meta">
          ${normalizedEntryCount ? `<span class="chip">${normalizedEntryCount} 個 entry</span>` : ""}
        </div>
      </article>
    `;
    })
    .join("");

  container.innerHTML = `
    <div class="discussion-card">
      <div class="discussion-card-head">
        <div>
          <p class="discussion-kicker">Phase C / D</p>
          <h3>Cross-Review 輪次</h3>
        </div>
        <span class="chip">${rounds.length} 輪已完成</span>
      </div>
      <div class="round-grid">${roundCards}</div>
    </div>
  `;
}

// Consensus packet status
function renderConsensusPacketStatus(packetResult, statusData) {
  const container = qs("#consensus-status-panel");
  if (!container) return;

  const consensusStatus = statusData?.consensus_status || "unknown";
  const isAccepted = consensusStatus === "accepted";
  const packetExists = packetResult?.exists;
  const packetMeta = packetExists
    ? parseConsensusPacket(packetResult.content)
    : null;

  let statusBadgeClass = "badge-missing";
  let statusText = "尚未建立";
  if (packetExists && isAccepted) {
    statusBadgeClass = "badge-accepted";
    statusText = "已接受 — 可進入執行模式";
  } else if (packetExists) {
    statusBadgeClass = "badge-submitted";
    statusText = "草擬完成 — 等待 human 批准";
  }

  const switchGateItems = [
    { label: "所有 lane 已提交 readout", done: false }, // will be set by caller if needed
    { label: "至少一輪 cited cross-review 存在", done: false },
    { label: "consensus packet 已草擬", done: packetExists },
    { label: "human 已批准 consensus packet", done: isAccepted },
  ];

  const gateRows = switchGateItems
    .map(
      (item) => `
    <div class="gate-row">
      <span class="gate-icon">${item.done ? "✓" : "○"}</span>
      <span class="${item.done ? "gate-done" : "gate-pending"}">${item.label}</span>
    </div>
  `,
    )
    .join("");

  container.innerHTML = `
    <div class="discussion-card consensus-card ${isAccepted ? "consensus-accepted" : ""}">
      <div class="discussion-card-head">
        <div>
          <p class="discussion-kicker">Phase E</p>
          <h3>Consensus Packet</h3>
        </div>
        <span class="readout-status-badge ${statusBadgeClass}">${statusText}</span>
      </div>
      ${
        packetMeta
          ? `
        <div class="consensus-meta lane-meta">
          <span class="chip">日期：${packetMeta.date}</span>
          <span class="chip">基於：${packetMeta.basedOnRounds}</span>
          <span class="chip">${packetMeta.sectionCount} 個已完成章節</span>
        </div>
        <p class="discussion-label">${packetMeta.editor}</p>
      `
          : ""
      }
      <div class="switch-gate">
        <p class="discussion-label">切換到執行模式的條件</p>
        ${gateRows}
      </div>
    </div>
  `;
}

// Apply active/inactive visual state to mode sections based on current mode
export function applyModeVisualState(mode) {
  const discussionSection = qs("#discussion-section");
  const executionSection = qs("#execution-section");
  const modeEl = qs("#mode-badge");

  if (!discussionSection || !executionSection) return;

  const isDiscussion = mode === "discussion_planning";

  // Mode badge
  if (modeEl) {
    modeEl.textContent = isDiscussion
      ? "discussion_planning"
      : "supervisor_managed_execution";
    modeEl.className = `mode-badge ${isDiscussion ? "mode-discussion" : "mode-execution"}`;
  }

  // Discussion section: open when active
  const discussionDetails = qs("#discussion-details");
  if (discussionDetails) {
    discussionDetails.open = isDiscussion;
  }
  discussionSection.classList.toggle("mode-section-active", isDiscussion);
  discussionSection.classList.toggle("mode-section-inactive", !isDiscussion);

  // Execution section: open when active
  const executionDetails = qs("#execution-details");
  if (executionDetails) {
    executionDetails.open = !isDiscussion;
  }
  executionSection.classList.toggle("mode-section-active", !isDiscussion);
  executionSection.classList.toggle("mode-section-inactive", isDiscussion);
}
