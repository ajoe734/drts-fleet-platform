// data.js — data source paths, fetch helpers, and markdown parsers

export const DATA_FILES = {
  status: "./ai-status.json",
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

export async function fetchJson(path) {
  const response = await fetch(`${path}?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`無法載入 ${path}: ${response.status}`);
  return response.json();
}

export async function fetchText(path) {
  const response = await fetch(`${path}?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`無法載入 ${path}: ${response.status}`);
  return response.text();
}

// Probe a file: returns { exists, content } without throwing on 404
export async function probeFile(path) {
  try {
    const response = await fetch(`${path}?t=${Date.now()}`, {
      cache: "no-store",
    });
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
  return {
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
