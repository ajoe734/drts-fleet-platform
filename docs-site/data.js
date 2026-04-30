// data.js — data source paths, fetch helpers, and markdown parsers

export const DATA_FILES = {
  status: "./ai-status.json",
  taskArchive: "./ai-task-archive.json",
  activity: "./ai-activity-log.jsonl",
  currentWork: "./current-work.md",
  orchestratorState: "./orchestrator-state.json",
  approvalQueue: "./approval-queue.json",
};

// Consensus discussion artifacts served via /consensus/<filename>.md
export const CONSENSUS_FILES = {
  batonLog: "/consensus/baton-log.md",
  supervisorQueue: "/consensus/supervisor-queue.md",
  starterDraft: "/consensus/starter-draft.md",
  consensusPacket: "/consensus/consensus-packet.md",
  readouts: {
    Codex: "/consensus/codex-readout.md",
    Qwen: "/consensus/qwen-readout.md",
    Gemini: "/consensus/gemini-readout.md",
    Copilot: "/consensus/copilot-readout.md",
    Claude: "/consensus/claude-readout.md",
  },
  rounds: [
    "/consensus/review-round-1.md",
    "/consensus/review-round-2.md",
    "/consensus/review-round-3.md",
    "/consensus/review-round-4.md",
  ],
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchResource(path, options = {}) {
  const { timeoutMs = 0, method = "GET", headers = {} } = options;
  const controller = timeoutMs ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    return await fetch(`${path}?t=${Date.now()}`, {
      method,
      headers,
      cache: "no-store",
      signal: controller?.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`載入 ${path} 逾時`);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function fetchJson(path, options = {}) {
  const response = await fetchResource(path, options);
  if (!response.ok) throw new Error(`無法載入 ${path}: ${response.status}`);
  return response.json();
}

export async function fetchText(path, options = {}) {
  const response = await fetchResource(path, options);
  if (!response.ok) throw new Error(`無法載入 ${path}: ${response.status}`);
  return response.text();
}

// Probe a file: returns { exists, content } without throwing on 404
export async function probeFile(path, options = {}) {
  try {
    const response = await fetchResource(path, options);
    if (!response.ok) return { exists: false, content: "" };
    const content = await response.text();
    return { exists: true, content };
  } catch {
    return { exists: false, content: "" };
  }
}

export async function requestDashboardRefresh() {
  const response = await fetch(`./__refresh?t=${Date.now()}`, {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.stderr || payload?.stdout || "";
    } catch {
      detail = await response.text();
    }
    throw new Error(
      `同步失敗 (${response.status})${detail ? `: ${detail.trim()}` : ""}`,
    );
  }
  return response.json().catch(() => ({ ok: true }));
}

// ── Parsers ───────────────────────────────────────────────────────────────────

export function parseJsonLines(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line.startsWith("{"))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function parseRecentJsonLines(text, limit = 24) {
  const parsed = [];
  const lines = text.split("\n");

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line || !line.startsWith("{")) continue;
    try {
      parsed.unshift(JSON.parse(line));
      if (parsed.length >= limit) break;
    } catch {
      // Ignore malformed log lines in the preview path.
    }
  }

  return parsed;
}

export function parseCurrentWork(markdown) {
  const objectiveMatch = markdown.match(/## Objective\s+([\s\S]*?)\n## /);
  const sprintMatch = markdown.match(/## Current Sprint\s+([\s\S]*?)\n## /);
  return {
    objective: objectiveMatch ? objectiveMatch[1].trim() : "",
    sprint: sprintMatch
      ? sprintMatch[1]
          .trim()
          .split("\n")
          .filter((line) => line.startsWith("- "))
          .map((line) => line.replace(/^- /, "").trim())
      : [],
  };
}

// ── Discussion artifact parsers ───────────────────────────────────────────────

function cleanMarkdownCell(value) {
  return String(value || "")
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .trim();
}

function inferDiscussionActiveFile(action) {
  const text = String(action || "").toLowerCase();
  if (text.includes("review-round-1")) return "review-round-1.md";
  if (text.includes("review-round-2")) return "review-round-2.md";
  if (text.includes("review-round-3")) return "review-round-3.md";
  if (text.includes("review-round-4")) return "review-round-4.md";
  if (text.includes("consensus packet")) return "consensus-packet.md";
  if (text.includes("starter draft")) return "starter-draft.md";
  if (text.includes("scope matrix")) return "scope-matrix.md";
  return "-";
}

// Extract rounds from baton-log.md
// Returns array of { round, owner, status, outcome }
export function parseBatonLog(content) {
  if (!content) return [];
  const rounds = [];
  const roundBlocks = content.split(/^### Round /m).slice(1);
  for (const block of roundBlocks) {
    const numMatch = block.match(/^(\d+)/);
    const ownerMatch = block.match(/- Baton owner:\s*(.+)/);
    const statusMatch = block.match(/- Status:\s*(.+)/);
    const outcomeMatch = block.match(/- Outcome:\s*(.+)/);
    if (!numMatch) continue;
    rounds.push({
      round: parseInt(numMatch[1], 10),
      owner: ownerMatch ? ownerMatch[1].trim() : "-",
      status: statusMatch ? statusMatch[1].trim() : "-",
      outcome: outcomeMatch ? outcomeMatch[1].trim() : null,
    });
  }
  if (rounds.length) return rounds;

  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(
      /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/,
    );
    if (!match) continue;
    const [, roundCell, ownerCell, actionCell, timestampCell] = match;
    const round = cleanMarkdownCell(roundCell);
    if (!round || /^-+$/.test(round) || /^round$/i.test(round)) continue;
    const owner = cleanMarkdownCell(ownerCell);
    const outcome = cleanMarkdownCell(actionCell);
    const ts = cleanMarkdownCell(timestampCell);
    const isActive =
      outcome.includes("CURRENT OWNER") ||
      /^pending$/i.test(ts) ||
      ts === "—" ||
      ts === "-";
    rounds.push({
      round,
      owner,
      status: isActive ? "active" : "completed",
      outcome,
    });
  }
  return rounds;
}

// Extract current state from supervisor-queue.md
// Returns { currentOwner, activeFile, disposition }
export function parseSupervisorQueue(content) {
  if (!content) return { currentOwner: "-", activeFile: "-", disposition: "" };
  const ownerMatch = content.match(/- Current baton owner:\s*(.+)/);
  const fileMatch = content.match(/- Active working file:\s*`?(.+?)`?$/m);
  const dispositionMatch = content.match(
    /## Current disposition\s+([\s\S]*?)(?:\n##|$)/,
  );
  const legacyResult = {
    currentOwner: ownerMatch ? ownerMatch[1].trim() : "-",
    activeFile: fileMatch ? fileMatch[1].trim() : "-",
    disposition: dispositionMatch
      ? dispositionMatch[1]
          .trim()
          .split("\n")
          .filter((l) => l.startsWith("- "))
          .map((l) => l.replace(/^- /, "").trim())
      : [],
  };
  if (
    legacyResult.currentOwner !== "-" ||
    legacyResult.activeFile !== "-" ||
    legacyResult.disposition.length
  ) {
    return legacyResult;
  }

  const rows = content
    .split("\n")
    .map((line) =>
      line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/),
    )
    .filter(Boolean)
    .map((match) => ({
      action: cleanMarkdownCell(match[1]),
      target: cleanMarkdownCell(match[2]),
      status: cleanMarkdownCell(match[3]),
    }))
    .filter(
      (row) =>
        row.action &&
        !/^action$/i.test(row.action) &&
        !/^-+$/.test(row.action.replace(/\s+/g, "")),
    );

  const activeRow = rows.find((row) => /^active$/i.test(row.status));
  return {
    currentOwner: activeRow?.target || "-",
    activeFile: inferDiscussionActiveFile(activeRow?.action || ""),
    disposition: rows.map(
      (row) => `${row.target}: ${row.action} (${row.status})`,
    ),
  };
}

// Extract metadata from consensus-packet.md
// Returns { date, editor, basedOnRounds, sectionCount }
export function parseConsensusPacket(content) {
  if (!content) return null;
  const dateMatch = content.match(/- Date:\s*(.+)/);
  const editorMatch = content.match(/- Editor:\s*(.+)/);
  const roundsMatch = content.match(/- Based on rounds:\s*(.+)/);
  const sectionCount = (content.match(/^## \d+\./gm) || []).length;
  return {
    date: dateMatch ? dateMatch[1].trim() : "-",
    editor: editorMatch ? editorMatch[1].trim() : "-",
    basedOnRounds: roundsMatch ? roundsMatch[1].trim() : "-",
    sectionCount,
  };
}
