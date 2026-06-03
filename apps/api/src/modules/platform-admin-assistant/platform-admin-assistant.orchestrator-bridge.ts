import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { HttpStatus } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import type {
  PlatformAdminAssistantControlPlaneIdentity,
  PlatformAdminAssistantDispatchPacketPayload,
  PlatformAdminAssistantDispatchTaskStatus,
  PlatformAdminAssistantSignedDispatchPacket,
  PlatformAdminAssistantSubmitDispatchPacketCommand,
  PlatformAdminAssistantSubmitDispatchPacketResult,
  PlatformAdminAssistantTaskRuntimeStatus,
} from "./platform-admin-assistant.types";

interface BridgeOptions {
  dispatchKeyId?: string;
  dispatchSecret?: string;
  statusRoot?: string;
}

interface OrchestratorConfig {
  paths?: Record<string, string>;
  branch_strategy?: {
    tracks?: Record<string, string>;
    publish_branches?: Record<string, string>;
    track_rules?: Array<{
      track?: string;
      prefixes?: string[];
      regex?: string;
    }>;
    default_track?: string;
    worker_tree_guard?: {
      enabled?: boolean;
      blocking_globs?: string[];
    };
  };
  supervisor?: {
    ready_dispatch?: {
      review_statuses?: string[];
      finalize_statuses?: string[];
      dependency_done_statuses?: string[];
    };
  };
}

type JsonRecord = Record<string, unknown>;

const DEFAULT_BRANCH_STRATEGY = {
  tracks: {
    backend: "dev",
    frontend: "dev",
  },
  publishBranches: {
    backend: "main",
    frontend: "main",
  },
  trackRules: [
    {
      track: "frontend",
      prefixes: [
        "UI-",
        "DS-",
        "DRV-",
        "PA-",
        "PB-",
        "SBK-",
        "SYS-",
        "XS-",
        "ADM-UI-",
        "OPS-UI-",
        "TEN-UI-",
        "TN-",
      ],
      regex: ".*-UI-.*",
    },
    {
      track: "backend",
      prefixes: [
        "BE-",
        "API-",
        "SC-",
        "OBS-",
        "EVD-",
        "FWD-",
        "TCH-",
        "PRT-",
        "INFRA-",
        "BE-INTEG-",
        "BE-APR-",
        "BE-CC-",
        "BE-APR-NOTIFY-",
      ],
    },
    {
      track: "backend",
      prefixes: ["DOC-", "DOCS-", "POST-"],
    },
  ],
  defaultTrack: "backend",
};

const DEFAULT_TREE_GUARD_GLOBS = [
  ".orchestrator/supervisor.py",
  ".orchestrator/skills/**",
  ".orchestrator/templates/*",
  ".orchestrator/config*.json",
  ".orchestrator/branch_routing.py",
  "docs/ops/branch-strategy.md",
  "docs/**",
  ".github/workflows/**",
  ".husky/**",
];

const KNOWN_AGENTS = new Set([
  "Claude",
  "Claude2",
  "Gemini",
  "Gemini2",
  "Codex",
  "Codex2",
  "Copilot",
]);

export class PlatformAdminAssistantOrchestratorBridgeService {
  private readonly statusRoot: string;

  private readonly dispatchSecret: string;

  private readonly dispatchKeyId: string;

  constructor(options: BridgeOptions = {}) {
    this.statusRoot = resolve(
      options.statusRoot ??
        process.env.AI_STATUS_ROOT ??
        process.env.ORCH_STATUS_ROOT ??
        process.cwd(),
    );
    this.dispatchSecret =
      options.dispatchSecret ??
      process.env.PLATFORM_ADMIN_ASSISTANT_DISPATCH_SIGNING_SECRET ??
      "";
    this.dispatchKeyId =
      options.dispatchKeyId ??
      process.env.PLATFORM_ADMIN_ASSISTANT_DISPATCH_SIGNING_KEY_ID ??
      "platform-admin-assistant-dev";
  }

  submitDispatchPacket(
    actor: PlatformAdminAssistantControlPlaneIdentity,
    command: PlatformAdminAssistantSubmitDispatchPacketCommand,
  ): PlatformAdminAssistantSubmitDispatchPacketResult {
    if (!this.dispatchSecret) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "ASSISTANT_DISPATCH_SIGNING_UNAVAILABLE",
        "Platform Admin assistant dispatch signing is not configured.",
      );
    }

    const packet = command.packet;
    this.verifySignature(packet);
    const payload = this.validatePayload(actor, packet.payload);
    const config = this.loadConfig();
    const aiStatus = this.loadJson(
      this.resolveConfigPath(config, "status_file", "ai-status.json"),
      { tasks: [] },
    );
    const taskMap = new Map<string, Record<string, unknown>>();
    for (const task of Array.isArray(aiStatus.tasks) ? aiStatus.tasks : []) {
      if (task && typeof task === "object" && typeof task.id === "string") {
        taskMap.set(task.id, task as Record<string, unknown>);
      }
    }
    this.validateDependencies(payload.dependencies, taskMap);

    const route = this.routeTask(payload.taskId, config);
    if (payload.baseBranch && payload.baseBranch !== route.baseBranch) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_DISPATCH_BASE_BRANCH_MISMATCH",
        "Dispatch packet base branch does not match orchestrator branch routing.",
        {
          expectedBaseBranch: route.baseBranch,
          providedBaseBranch: payload.baseBranch,
          taskId: payload.taskId,
        },
      );
    }

    const treeGuard = this.checkWorkerTreeGuard(config);
    if (treeGuard.blocked) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ASSISTANT_DISPATCH_TREE_GUARD_BLOCKED",
        "Worker tree guard blocked dispatch because fragile-surface files are already dirty.",
        { ...treeGuard },
      );
    }

    const taskBriefPath = this.resolveTaskBriefPath(payload.taskId);
    const existingTask = taskMap.get(payload.taskId);
    const dispatchPreview = existingTask
      ? this.buildDispatchPreview(existingTask, taskMap)
      : null;

    if (command.dryRun === false) {
      this.writeTaskBrief(taskBriefPath, payload, route.baseBranch);
      if (dispatchPreview) {
        this.appendJsonl(
          this.resolveConfigPath(
            config,
            "event_queue",
            ".orchestrator/event-queue.jsonl",
          ),
          dispatchPreview.queueEvent,
        );
      }
    }

    return {
      accepted: true,
      dryRun: command.dryRun !== false,
      taskId: payload.taskId,
      taskBriefPath:
        relative(this.statusRoot, taskBriefPath) ||
        `.orchestrator/task-briefs/${payload.taskId}.md`,
      baseBranch: route.baseBranch,
      track: route.track,
      treeGuard,
      queued: command.dryRun ? false : dispatchPreview !== null,
      queueEvent: dispatchPreview?.queueEvent ?? null,
      warnings: dispatchPreview
        ? []
        : [
            "Task is not present in ai-status.json yet; dispatch preview is task-brief-only.",
          ],
    };
  }

  getTaskStatus(taskId: string): PlatformAdminAssistantTaskRuntimeStatus {
    const config = this.loadConfig();
    const status = this.loadJson(
      this.resolveConfigPath(config, "status_file", "ai-status.json"),
      { tasks: [] },
    );
    const tasks = Array.isArray(status.tasks) ? status.tasks : [];
    const task = tasks.find(
      (entry) => entry && typeof entry === "object" && entry.id === taskId,
    ) as Record<string, unknown> | undefined;

    if (!task) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ASSISTANT_DISPATCH_TASK_NOT_FOUND",
        "Requested task was not found in orchestrator machine truth.",
        { taskId },
      );
    }

    const runtimeState = this.loadJson(
      this.resolveConfigPath(config, "state_file", ".orchestrator/state.json"),
      {},
    );
    const queuedEvents = this.loadJsonl(
      this.resolveConfigPath(
        config,
        "event_queue",
        ".orchestrator/event-queue.jsonl",
      ),
    );
    const queueState = this.asRecord(runtimeState.queue);
    const queueRecords = this.asRecord(queueState.events);
    const workers = this.asRecord(runtimeState?.workers);
    const supervisorState = this.asRecord(runtimeState.supervisor);

    const relevantEvents = queuedEvents
      .filter((event) => this.optionalString(event.task_id) === taskId)
      .map((event) => {
        const eventId =
          this.optionalString(event.event_id) ??
          this.optionalString(event.key) ??
          "";
        const queueRecord = this.asRecord(queueRecords[eventId]);
        return {
          eventId,
          reason: String(event.reason ?? ""),
          targetAgent: String(event.target_agent ?? ""),
          status: String(queueRecord.status ?? "queued"),
        };
      });

    const relevantWorkers = Object.entries(workers)
      .filter(
        ([, worker]) =>
          this.optionalString(this.asRecord(worker).task_id) === taskId,
      )
      .map(([runId, worker]) => {
        const workerRecord = this.asRecord(worker);
        return {
          runId,
          agentId: String(workerRecord.agent_id ?? ""),
          status: String(workerRecord.status ?? ""),
          queueEventId: String(workerRecord.queue_event_id ?? ""),
          lastEventAt: workerRecord.last_event_at
            ? String(workerRecord.last_event_at)
            : null,
          lastErrorSummary: workerRecord.last_error_summary
            ? String(workerRecord.last_error_summary)
            : null,
        };
      });

    return {
      task: {
        id: String(task.id),
        status: String(task.status ?? ""),
        owner: String(task.owner ?? ""),
        reviewer: String(task.reviewer ?? ""),
        title: String(task.title ?? task.summary_zh ?? task.next ?? task.id),
        next: task.next ? String(task.next) : null,
        artifacts: Array.isArray(task.artifacts)
          ? task.artifacts.map(String)
          : [],
        dependsOn: Array.isArray(task.depends_on)
          ? task.depends_on.map(String)
          : [],
        lastUpdate: task.last_update ? String(task.last_update) : null,
      },
      supervisor: {
        lifecycle: String(supervisorState.lifecycle ?? "unknown"),
        startedAt: supervisorState.started_at
          ? String(supervisorState.started_at)
          : null,
        lastHeartbeatAt: supervisorState.last_heartbeat_at
          ? String(supervisorState.last_heartbeat_at)
          : null,
      },
      queue: {
        events: relevantEvents,
        workers: relevantWorkers,
      },
      integration:
        task.completion_metadata && typeof task.completion_metadata === "object"
          ? {
              integrationStatus: String(
                (task.completion_metadata as Record<string, unknown>)
                  .integration_status ?? "not_applicable",
              ),
              prUrl: this.optionalString(
                (task.completion_metadata as Record<string, unknown>).pr_url,
              ),
              ciStatus: this.optionalString(
                (task.completion_metadata as Record<string, unknown>).ci_status,
              ),
              ciRunUrl: this.optionalString(
                (task.completion_metadata as Record<string, unknown>)
                  .ci_run_url,
              ),
              devDeployRunUrl: this.optionalString(
                (task.completion_metadata as Record<string, unknown>)
                  .dev_deploy_run_url,
              ),
              devDeploySha: this.optionalString(
                (task.completion_metadata as Record<string, unknown>)
                  .dev_deploy_sha,
              ),
              mergedRef: this.optionalString(
                (task.completion_metadata as Record<string, unknown>)
                  .merged_ref,
              ),
            }
          : null,
    };
  }

  private verifySignature(
    packet: PlatformAdminAssistantSignedDispatchPacket,
  ): void {
    const actual = createHmac("sha256", this.dispatchSecret)
      .update(this.stableJson(packet.payload))
      .digest("hex");

    if (
      packet.signature.algorithm !== "hmac-sha256" ||
      packet.signature.keyId !== this.dispatchKeyId ||
      packet.signature.value !== actual
    ) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "ASSISTANT_DISPATCH_SIGNATURE_INVALID",
        "Dispatch packet signature verification failed.",
      );
    }
  }

  private validatePayload(
    actor: PlatformAdminAssistantControlPlaneIdentity,
    payload: PlatformAdminAssistantDispatchPacketPayload,
  ): PlatformAdminAssistantDispatchPacketPayload {
    if (payload.schema !== "assistant_dispatch_packet.v1") {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_DISPATCH_SCHEMA_INVALID",
        "Unsupported dispatch packet schema.",
      );
    }
    if (payload.source !== "platform-admin-assistant") {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_DISPATCH_SOURCE_INVALID",
        "Dispatch packet source must be platform-admin-assistant.",
      );
    }
    if (!payload.humanConfirmedAt) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_DISPATCH_CONFIRMATION_REQUIRED",
        "Human confirmation is required before dispatch can be queued.",
      );
    }
    if (payload.actorId !== actor.actorId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "ASSISTANT_DISPATCH_ACTOR_MISMATCH",
        "Dispatch packet actor does not match the authenticated Platform Admin actor.",
      );
    }
    if (!/^[A-Z0-9][A-Z0-9-]*$/.test(payload.taskId)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_DISPATCH_TASK_ID_INVALID",
        "Dispatch packet task id must use the canonical TASK-ID format.",
      );
    }
    if (
      !KNOWN_AGENTS.has(payload.owner) ||
      !KNOWN_AGENTS.has(payload.reviewer)
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_DISPATCH_AGENT_INVALID",
        "Dispatch packet owner/reviewer must be known orchestrator agents.",
      );
    }
    if (payload.owner === payload.reviewer) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_DISPATCH_REVIEWER_REQUIRED",
        "Dispatch packet owner and reviewer must be different agents.",
      );
    }
    if (!payload.title.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_DISPATCH_TITLE_REQUIRED",
        "Dispatch packet title is required.",
      );
    }
    for (const artifact of payload.artifacts) {
      this.validateRepoPath(artifact);
    }
    return payload;
  }

  private validateDependencies(
    dependencies: string[],
    taskMap: Map<string, Record<string, unknown>>,
  ): void {
    for (const dependencyId of dependencies) {
      if (!/^[A-Z0-9][A-Z0-9-]*$/.test(dependencyId)) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "ASSISTANT_DISPATCH_DEPENDENCY_INVALID",
          "Dispatch packet dependency ids must use the canonical TASK-ID format.",
          {
            dependencyId,
          },
        );
      }
      if (!taskMap.has(dependencyId)) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "ASSISTANT_DISPATCH_DEPENDENCY_UNKNOWN",
          "Dispatch packet dependency does not exist in ai-status.json.",
          {
            dependencyId,
          },
        );
      }
    }
  }

  private validateRepoPath(inputPath: string): void {
    const resolved = resolve(this.statusRoot, inputPath);
    const rel = relative(this.statusRoot, resolved);
    if (rel.startsWith("..")) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_DISPATCH_PATH_UNSAFE",
        "Dispatch packet artifacts must stay inside the repository root.",
        {
          path: inputPath,
        },
      );
    }
  }

  private buildDispatchPreview(
    task: Record<string, unknown>,
    taskMap: Map<string, Record<string, unknown>>,
  ): { queueEvent: Record<string, unknown> } | null {
    const dispatch = this.resolveDispatchTarget(task, taskMap);
    if (!dispatch) {
      return null;
    }
    const eventKeyPayload = {
      dependency_signature: this.dependencySignature(task, taskMap),
      depends_on: Array.isArray(task.depends_on) ? task.depends_on : [],
      last_update: task.last_update ?? null,
      owner: task.owner ?? null,
      reason: dispatch.reason,
      reviewer: task.reviewer ?? null,
      status: task.status ?? null,
      task_id: task.id ?? null,
    };
    const signature = JSON.stringify(eventKeyPayload);
    return {
      queueEvent: {
        event_id: `evt-${String(task.id).toLowerCase()}-${dispatch.reason}`,
        key: `dispatcher:${dispatch.targetAgent}:${task.id}:${dispatch.reason}:${signature}`,
        task_id: task.id,
        target_agent: dispatch.targetAgent,
        reason: dispatch.reason,
        task: {
          id: task.id,
          artifacts: Array.isArray(task.artifacts) ? task.artifacts : [],
          next: task.next ?? null,
        },
        metadata: {
          source: "platform-admin-assistant",
          mode: "execution",
        },
      },
    };
  }

  private resolveDispatchTarget(
    task: Record<string, unknown>,
    taskMap: Map<string, Record<string, unknown>>,
  ): { targetAgent: string; reason: string } | null {
    const status = String(task.status ?? "").toLowerCase();
    const owner = String(task.owner ?? "").trim();
    const reviewer = String(task.reviewer ?? "").trim();
    const doneStatuses = new Set(
      (
        (this.loadConfig().supervisor?.ready_dispatch
          ?.dependency_done_statuses as string[] | undefined) ?? ["done"]
      ).map((value) => value.toLowerCase()),
    );

    if (status === "review" && reviewer) {
      return { targetAgent: reviewer, reason: "review_ready_dispatch" };
    }
    if (status === "review_approved" && owner) {
      return { targetAgent: owner, reason: "owned_finalize_dispatch" };
    }
    if (
      status === "in_progress" &&
      owner &&
      this.dependenciesSatisfied(task, taskMap, doneStatuses)
    ) {
      return { targetAgent: owner, reason: "owned_in_progress_dispatch" };
    }
    if (
      (status === "todo" || status === "backlog") &&
      owner &&
      this.dependenciesSatisfied(task, taskMap, doneStatuses)
    ) {
      return { targetAgent: owner, reason: "owned_ready_dispatch" };
    }
    return null;
  }

  private dependenciesSatisfied(
    task: Record<string, unknown>,
    taskMap: Map<string, Record<string, unknown>>,
    doneStatuses: Set<string>,
  ): boolean {
    const dependencies = Array.isArray(task.depends_on) ? task.depends_on : [];
    for (const dependencyId of dependencies) {
      const dependency = taskMap.get(String(dependencyId));
      if (!dependency) {
        continue;
      }
      if (!doneStatuses.has(String(dependency.status ?? "").toLowerCase())) {
        return false;
      }
    }
    return true;
  }

  private dependencySignature(
    task: Record<string, unknown>,
    taskMap: Map<string, Record<string, unknown>>,
  ): string {
    const dependencies = Array.isArray(task.depends_on) ? task.depends_on : [];
    return dependencies
      .map((dependencyId) => {
        const dependency = taskMap.get(String(dependencyId));
        return `${dependencyId}:${dependency ? String(dependency.status ?? "missing") : "archived"}`;
      })
      .join("|");
  }

  private routeTask(taskId: string, config: OrchestratorConfig) {
    const strategy = config.branch_strategy ?? {};
    const tracks: Record<string, string> = {
      ...DEFAULT_BRANCH_STRATEGY.tracks,
      ...(strategy.tracks ?? {}),
    };
    const publishBranches: Record<string, string> = {
      ...DEFAULT_BRANCH_STRATEGY.publishBranches,
      ...(strategy.publish_branches ?? {}),
    };
    const trackRules =
      strategy.track_rules ?? DEFAULT_BRANCH_STRATEGY.trackRules;
    const normalized = taskId.trim().toUpperCase();
    for (const rule of trackRules) {
      for (const prefix of rule.prefixes ?? []) {
        if (normalized.startsWith(prefix.toUpperCase())) {
          return {
            track: String(rule.track ?? DEFAULT_BRANCH_STRATEGY.defaultTrack),
            baseBranch:
              tracks[
                String(rule.track ?? DEFAULT_BRANCH_STRATEGY.defaultTrack)
              ] ?? "dev",
            publishBranch:
              publishBranches[
                String(rule.track ?? DEFAULT_BRANCH_STRATEGY.defaultTrack)
              ] ?? "main",
          };
        }
      }
      if (rule.regex && new RegExp(rule.regex.toUpperCase()).test(normalized)) {
        return {
          track: String(rule.track ?? DEFAULT_BRANCH_STRATEGY.defaultTrack),
          baseBranch:
            tracks[
              String(rule.track ?? DEFAULT_BRANCH_STRATEGY.defaultTrack)
            ] ?? "dev",
          publishBranch:
            publishBranches[
              String(rule.track ?? DEFAULT_BRANCH_STRATEGY.defaultTrack)
            ] ?? "main",
        };
      }
    }
    const fallback =
      strategy.default_track ?? DEFAULT_BRANCH_STRATEGY.defaultTrack;
    return {
      track: fallback,
      baseBranch: tracks[fallback] ?? "dev",
      publishBranch: publishBranches[fallback] ?? "main",
    };
  }

  private checkWorkerTreeGuard(
    config: OrchestratorConfig,
  ): PlatformAdminAssistantDispatchTaskStatus {
    const enabled = Boolean(config.branch_strategy?.worker_tree_guard?.enabled);
    if (!enabled) {
      return { blocked: false, dirtyPaths: [], matchedGlobs: [] };
    }

    const status = spawnSync("git", ["status", "--porcelain"], {
      cwd: this.statusRoot,
      encoding: "utf-8",
      timeout: 10_000,
    });
    if (status.status !== 0) {
      return { blocked: false, dirtyPaths: [], matchedGlobs: [] };
    }

    const dirtyPaths = status.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const payload = line.slice(3);
        return payload.includes(" -> ") ? payload.split(" -> ")[1] : payload;
      })
      .filter(
        (path): path is string => typeof path === "string" && path.length > 0,
      );
    const globs: string[] =
      config.branch_strategy?.worker_tree_guard?.blocking_globs ??
      DEFAULT_TREE_GUARD_GLOBS;
    const offenders = dirtyPaths.filter((path) =>
      globs.some((glob) => this.matchesGlob(path, glob)),
    );
    return {
      blocked: offenders.length > 0,
      dirtyPaths: offenders,
      matchedGlobs: globs.filter((glob) =>
        offenders.some((path) => this.matchesGlob(path, glob)),
      ),
    };
  }

  private matchesGlob(path: string, glob: string): boolean {
    if (glob.includes("**")) {
      const prefix = (glob.split("**")[0] ?? "").replace(/\/$/, "");
      return prefix === "" || path === prefix || path.startsWith(`${prefix}/`);
    }
    const pattern = glob
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^/]*");
    return new RegExp(`^${pattern}$`).test(path);
  }

  private writeTaskBrief(
    path: string,
    payload: PlatformAdminAssistantDispatchPacketPayload,
    baseBranch: string,
  ): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      [
        `# Task Brief: ${payload.taskId}`,
        "",
        payload.title,
        "",
        "- Status: `backlog`",
        `- Owner: \`${payload.owner}\``,
        `- Reviewer: \`${payload.reviewer}\``,
        payload.planningRef
          ? `- Planning Ref: \`${payload.planningRef}\``
          : null,
        `- Last Update: \`${payload.createdAt}\``,
        "",
        "## Short Summary",
        "",
        payload.summary || payload.title,
        "",
        "## Dependencies",
        "",
        ...(payload.dependencies.length > 0
          ? payload.dependencies.map((dependency) => `- \`${dependency}\``)
          : ["- none"]),
        "",
        "## Acceptance",
        "",
        ...(payload.acceptance.length > 0
          ? payload.acceptance.map((item) => `- ${item}`)
          : ["- see dispatch packet"]),
        "",
        "## Artifacts",
        "",
        ...(payload.artifacts.length > 0
          ? payload.artifacts.map((artifact) => `- \`${artifact}\``)
          : ["- none"]),
        "",
        "## Guardrails",
        "",
        "- Do not execute shell from the Platform Admin web process.",
        "- Do not dispatch work that has not been confirmed by a human actor.",
        `- Use branch base \`${baseBranch}\` resolved from orchestrator branch routing.`,
        "",
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      "utf-8",
    );
  }

  private resolveTaskBriefPath(taskId: string): string {
    return resolve(
      this.statusRoot,
      ".orchestrator",
      "task-briefs",
      `${taskId}.md`,
    );
  }

  private stableJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJson(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>).sort(
        ([left], [right]) => left.localeCompare(right),
      );
      return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${this.stableJson(entryValue)}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  private loadConfig(): OrchestratorConfig {
    return this.loadJson(
      resolve(this.statusRoot, ".orchestrator", "config.json"),
      {},
    );
  }

  private resolveConfigPath(
    config: OrchestratorConfig,
    key: string,
    fallback: string,
  ): string {
    return resolve(this.statusRoot, config.paths?.[key] ?? fallback);
  }

  private loadJson(path: string, fallback: JsonRecord): JsonRecord {
    if (!existsSync(path)) {
      return { ...fallback };
    }
    return this.asRecord(JSON.parse(readFileSync(path, "utf-8")));
  }

  private loadJsonl(path: string): JsonRecord[] {
    if (!existsSync(path)) {
      return [];
    }
    return readFileSync(path, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => this.asRecord(JSON.parse(line)));
  }

  private appendJsonl(path: string, payload: Record<string, unknown>): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${existsSync(path) ? readFileSync(path, "utf-8") : ""}${JSON.stringify(payload)}\n`,
      "utf-8",
    );
  }

  private optionalString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
  }

  private asRecord(value: unknown): JsonRecord {
    return value && typeof value === "object" ? (value as JsonRecord) : {};
  }
}
