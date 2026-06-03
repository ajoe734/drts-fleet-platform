import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { randomUUID } from "node:crypto";
import { HttpStatus } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import type {
  PlatformAdminAssistantCitation,
  PlatformAdminAssistantDevelopmentArtifactCommand,
  PlatformAdminAssistantDevelopmentArtifactFile,
  PlatformAdminAssistantDevelopmentArtifactRecord,
  PlatformAdminAssistantDevelopmentTaskCommand,
} from "./platform-admin-assistant.types";

const DEFAULT_PLANNING_REF =
  "docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md";
const TASK_BRIEF_DIRECTORY = ".orchestrator/task-briefs";
const TASK_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export async function createPlatformAdminAssistantDevelopmentArtifacts(input: {
  actorId: string;
  sessionId: string;
  command: PlatformAdminAssistantDevelopmentArtifactCommand;
}): Promise<PlatformAdminAssistantDevelopmentArtifactRecord> {
  const createdAt = new Date().toISOString();
  const repositoryRoot = resolveRepositoryRoot();
  const command = normalizeCommand(input.command);
  const slug = normalizeSlug(
    command.artifactSlug || command.requestTitle || input.sessionId,
  );
  const stamp = createdAt.slice(0, 10).replace(/-/g, "");
  const citations =
    command.citations.length > 0 ? command.citations : defaultCitations();

  const saPath = `docs/02-architecture/platform-admin-assistant-system-analysis-${stamp}-${slug}.md`;
  const sdPath = `docs/05-ui/platform-admin-assistant-system-design-${stamp}-${slug}.md`;

  const files: PlatformAdminAssistantDevelopmentArtifactFile[] = [
    {
      kind: "system_analysis",
      title: `${command.requestTitle} system analysis`,
      path: saPath,
    },
    {
      kind: "system_design",
      title: `${command.requestTitle} system design`,
      path: sdPath,
    },
    ...command.tasks.map((task) =>
      buildTaskBriefArtifactFile(task.taskId, task.title),
    ),
  ];

  await writeArtifact(
    repositoryRoot,
    saPath,
    buildSystemAnalysisMarkdown(command, createdAt, citations),
  );
  await writeArtifact(
    repositoryRoot,
    sdPath,
    buildSystemDesignMarkdown(command, createdAt, citations),
  );

  for (const task of command.tasks) {
    const taskBriefPath = buildTaskBriefRelativePath(task.taskId);
    await writeArtifact(
      repositoryRoot,
      taskBriefPath,
      buildTaskBriefMarkdown(task, command, createdAt),
      TASK_BRIEF_DIRECTORY,
    );
  }

  return {
    artifactBundleId: `paas_dev_${randomUUID()}`,
    sessionId: input.sessionId,
    requestTitle: command.requestTitle,
    summary: command.summary,
    createdAt,
    actorId: input.actorId,
    planningRef: command.planningRef,
    files,
    citations,
    tasks: command.tasks,
  };
}

function resolveRepositoryRoot() {
  return path.resolve(
    process.env.PLATFORM_ADMIN_ASSISTANT_REPO_ROOT || process.cwd(),
  );
}

async function writeArtifact(
  repositoryRoot: string,
  relativePath: string,
  content: string,
  approvedDirectory?: string,
) {
  const targetPath = resolveArtifactTarget(
    repositoryRoot,
    relativePath,
    approvedDirectory,
  );
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, "utf8");
}

function normalizeCommand(
  command: PlatformAdminAssistantDevelopmentArtifactCommand,
): Required<
  Omit<PlatformAdminAssistantDevelopmentArtifactCommand, "citations" | "tasks">
> & {
  citations: PlatformAdminAssistantCitation[];
  tasks: PlatformAdminAssistantDevelopmentTaskCommand[];
} {
  return {
    requestTitle: command.requestTitle.trim(),
    requestedChange: command.requestedChange.trim(),
    summary:
      command.summary?.trim() ||
      `Platform Admin assistant request: ${command.requestTitle.trim()}`,
    problemStatement:
      command.problemStatement?.trim() ||
      "The current Platform Admin assistant flow does not yet archive structured SA/SD/task-brief artifacts for change requests.",
    currentContext: normalizeList(command.currentContext),
    affectedArtifacts: normalizeList(command.affectedArtifacts),
    dependencies: normalizeList(command.dependencies),
    acceptance: normalizeList(command.acceptance),
    guardrails: normalizeList(command.guardrails),
    planningRef: command.planningRef?.trim() || DEFAULT_PLANNING_REF,
    artifactSlug: normalizeSlug(command.artifactSlug || ""),
    citations: (command.citations ?? []).map((citation) => ({
      title: citation.title.trim(),
      ...(citation.section?.trim() ? { section: citation.section.trim() } : {}),
      ...(citation.href?.trim() ? { href: citation.href.trim() } : {}),
    })),
    tasks: command.tasks.map((task) => normalizeTask(task)),
  };
}

function normalizeTask(
  task: PlatformAdminAssistantDevelopmentTaskCommand,
): PlatformAdminAssistantDevelopmentTaskCommand {
  const taskId = requireTaskField(task?.taskId, "taskId");
  validateTaskId(taskId);

  return {
    taskId,
    title: requireTaskField(task?.title, "title"),
    summary: requireTaskField(task?.summary, "summary"),
    ...(task.summaryZh?.trim() ? { summaryZh: task.summaryZh.trim() } : {}),
    owner: requireTaskField(task?.owner, "owner"),
    reviewer: requireTaskField(task?.reviewer, "reviewer"),
    dependsOn: normalizeList(task.dependsOn),
    artifacts: normalizeList(task.artifacts),
    acceptance: normalizeList(task.acceptance),
    guardrails: normalizeList(task.guardrails),
    verification: normalizeList(task.verification),
    status: task.status || "backlog",
  };
}

function normalizeList(values?: string[]) {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function normalizeSlug(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "platform-admin-assistant";
}

function requireTaskField(value: string | undefined, field: string) {
  if (!value?.trim()) {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "ASSISTANT_DEV_TASK_FIELD_REQUIRED",
      `Development artifact task requires a non-empty ${field}.`,
      { field },
    );
  }

  return value.trim();
}

function validateTaskId(taskId: string) {
  if (
    !TASK_ID_PATTERN.test(taskId) ||
    taskId.includes("..") ||
    taskId.includes("/") ||
    taskId.includes("\\")
  ) {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "ASSISTANT_DEV_TASK_ID_INVALID",
      "Development artifact taskId must use only letters, numbers, dot, underscore, or hyphen and must not contain path traversal segments.",
      { taskId },
    );
  }
}

function buildTaskBriefArtifactFile(
  taskId: string,
  title: string,
): PlatformAdminAssistantDevelopmentArtifactFile {
  return {
    kind: "task_brief",
    title,
    path: buildTaskBriefRelativePath(taskId),
    taskId,
  };
}

function buildTaskBriefRelativePath(taskId: string) {
  return `${TASK_BRIEF_DIRECTORY}/${taskId}.md`;
}

function resolveArtifactTarget(
  repositoryRoot: string,
  relativePath: string,
  approvedDirectory?: string,
) {
  const targetPath = path.resolve(repositoryRoot, relativePath);

  if (!approvedDirectory) {
    return targetPath;
  }

  const approvedRoot = path.resolve(repositoryRoot, approvedDirectory);
  const relativeToApprovedRoot = path.relative(approvedRoot, targetPath);

  if (
    relativeToApprovedRoot.startsWith("..") ||
    path.isAbsolute(relativeToApprovedRoot)
  ) {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "ASSISTANT_DEV_TASK_ID_INVALID",
      "Development artifact taskId resolved outside the approved task brief directory.",
      { relativePath, approvedDirectory },
    );
  }

  return targetPath;
}

function buildSystemAnalysisMarkdown(
  command: ReturnType<typeof normalizeCommand>,
  createdAt: string,
  citations: PlatformAdminAssistantCitation[],
) {
  return `# ${command.requestTitle} System Analysis

Status: draft generated by Platform Admin assistant
Date: ${createdAt.slice(0, 10)}
Planning Ref: ${command.planningRef}

## Summary

${command.summary}

## Problem Statement

${command.problemStatement}

## Requested Change

${command.requestedChange}

## Current System Context

${renderBulletList(
  command.currentContext,
  "No additional runtime context was supplied with this request.",
)}

## Affected Artifacts

${renderBulletList(
  command.affectedArtifacts,
  "Artifact scope still needs confirmation from the requesting operator.",
)}

## Dependencies

${renderBulletList(
  command.dependencies,
  "No upstream dependencies were declared in the request bundle.",
)}

## Acceptance

${renderBulletList(
  command.acceptance,
  "Archive SA, SD, and task briefs under controlled repository paths.",
)}

## Guardrails

${renderBulletList(
  command.guardrails,
  "Use approved scripts for status/progress changes and keep orchestrator writes behind the control plane.",
)}

## Proposed Task Slicing

${command.tasks
  .map(
    (task) =>
      `### ${task.taskId} · ${task.title}

- Owner: ${task.owner}
- Reviewer: ${task.reviewer}
- Summary: ${task.summary}
- Dependencies: ${task.dependsOn && task.dependsOn.length > 0 ? task.dependsOn.join(", ") : "none"}
`,
  )
  .join("\n")}

## Sources

${renderCitations(citations)}
`;
}

function buildSystemDesignMarkdown(
  command: ReturnType<typeof normalizeCommand>,
  createdAt: string,
  citations: PlatformAdminAssistantCitation[],
) {
  return `# ${command.requestTitle} System Design

Status: draft generated by Platform Admin assistant
Date: ${createdAt.slice(0, 10)}
Planning Ref: ${command.planningRef}

## Design Objective

Convert the request into repository-archived SA/SD/task brief artifacts without bypassing the existing Platform Admin policy and orchestrator guardrails.

## Proposed Architecture

- Collect the request and scoped context from the current Platform Admin assistant session.
- Render deterministic markdown artifacts for SA, SD, and task briefs.
- Write artifacts only to approved repository targets under \`docs/\` and \`.orchestrator/task-briefs/\`.
- Return the archived file references to the caller so the assistant UI can link and summarize them.

## API Surface

- Session-scoped development artifact generation endpoint on the Platform Admin assistant controller.
- Session-scoped artifact listing endpoint so the UI can show archived outputs per assistant conversation.
- Actor-bound service checks identical to the existing assistant session ownership model.

## Artifact Archive Targets

${renderBulletList(
  [
    "docs/02-architecture/ for generated system analysis",
    "docs/05-ui/ for generated system design",
    ".orchestrator/task-briefs/ for supervisor-ready task briefs",
  ],
  "",
)}

## Validation Rules

- Request title and requested change are required.
- At least one task brief definition is required.
- Every task brief must include task id, title, owner, reviewer, and summary.
- Generated writes remain repo-local and do not shell out from the API process.

## Testing Strategy

${renderBulletList(
  [
    "Unit-test service generation and session ownership behavior.",
    "Unit-test controller envelope shape for the new development endpoints.",
    "Unit-test artifact writer output paths and task brief markdown content.",
  ],
  "",
)}

## Rollout Notes

${renderBulletList(
  command.guardrails,
  "Keep this path behind the existing Platform Admin assistant feature flag until the UI integrates it.",
)}

## Sources

${renderCitations(citations)}
`;
}

function buildTaskBriefMarkdown(
  task: PlatformAdminAssistantDevelopmentTaskCommand,
  command: ReturnType<typeof normalizeCommand>,
  createdAt: string,
) {
  return `# Task Brief: ${task.taskId}

${task.title}

- Status: \`${task.status ?? "backlog"}\`
- Owner: \`${task.owner}\`
- Reviewer: \`${task.reviewer}\`
- Planning Ref: \`${command.planningRef}\`
- Last Update: \`${createdAt}\`

## 中文說明

${task.summaryZh || task.summary}

## Short Summary

${task.summary}

## Dependencies

${renderBulletList(task.dependsOn ?? [], "- none")}

## Acceptance

${renderBulletList(
  task.acceptance && task.acceptance.length > 0
    ? task.acceptance
    : command.acceptance,
  "See task brief acceptance checklist",
)}

## Artifacts

${renderBulletList(
  task.artifacts && task.artifacts.length > 0
    ? task.artifacts
    : command.affectedArtifacts,
  "Artifact scope pending clarification",
)}

## Guardrails

${renderBulletList(
  task.guardrails && task.guardrails.length > 0
    ? task.guardrails
    : command.guardrails,
  "Use approved status scripts and preserve orchestrator machine truth.",
)}

## Verification

${renderBulletList(
  task.verification ?? [],
  "Verification commands still need to be supplied by the implementing owner.",
)}
`;
}

function renderBulletList(items: string[], fallback: string) {
  if (items.length === 0) {
    return fallback;
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function renderCitations(citations: PlatformAdminAssistantCitation[]) {
  return citations
    .map((citation) => {
      const parts = [citation.title];
      if (citation.section) {
        parts.push(citation.section);
      }
      if (citation.href) {
        parts.push(citation.href);
      }
      return `- ${parts.join(" · ")}`;
    })
    .join("\n");
}

function defaultCitations(): PlatformAdminAssistantCitation[] {
  return [
    {
      title: "Platform Admin agentic assistant architecture plan",
      section: "§6.6 Development Collaboration Tool Bus",
      href: DEFAULT_PLANNING_REF,
    },
    {
      title: "Platform Admin design handoff packet",
      section: "§7 Shell and assistant expectations",
      href: "docs/05-ui/platform-admin-design-handoff-packet-20260525.md",
    },
  ];
}
