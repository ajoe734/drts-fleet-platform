import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { Inject, Injectable, Optional } from "@nestjs/common";

const execFileAsync = promisify(execFile);

const DEFAULT_OPENCLAW_HOME = "/tmp/platform-admin-assistant-openclaw";
const DEFAULT_OPENCLAW_AGENT_ID = "platform-admin";
const DEFAULT_OPENCLAW_MODEL = "openai/gpt-5.5";
const DEFAULT_TIMEOUT_SECONDS = 120;
const MAX_OUTPUT_BUFFER_BYTES = 1024 * 1024 * 4;

const WORKSPACE_AGENTS_MD = [
  "# DRTS Platform Admin Assistant",
  "",
  "- You are the DRTS Platform Admin assistant runtime.",
  "- Treat every message payload as the only trusted operator request context.",
  "- Use only the approved-source retrieval context that arrives inside the latest message payload.",
  '- Always return strict JSON with keys: "answer", "citations", "suggestedPrompts", "actionPlan".',
  "- Never claim you executed a platform action, ran a tool, or inspected host state unless that fact is explicitly present in the message payload.",
  "- Keep citations aligned to the provided approved-source hints.",
].join("\n");

type SupportedOpenClawAuthProvider =
  | "openai"
  | "openrouter"
  | "anthropic"
  | "ollama";

type OpenClawExecFileOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
  timeout?: number;
};

type OpenClawExecFileResult = {
  stdout: string;
  stderr: string;
};

export type OpenClawExecFile = (
  command: string,
  args: string[],
  options: OpenClawExecFileOptions,
) => Promise<OpenClawExecFileResult>;

export interface OpenClawRuntimeServiceOptions {
  env?: NodeJS.ProcessEnv;
  execFileImpl?: OpenClawExecFile;
}

export const OPENCLAW_RUNTIME_SERVICE_OPTIONS =
  "OPENCLAW_RUNTIME_SERVICE_OPTIONS";

export interface OpenClawAgentRunRequest {
  sessionKey: string;
  message: string;
  model?: string;
}

export interface OpenClawAgentRunResult {
  text: string;
  raw: Record<string, unknown>;
  meta: Record<string, unknown> | null;
}

export interface OpenClawRuntimeConfig {
  command: string;
  homeDir: string;
  stateDir: string;
  configPath: string;
  workspaceDir: string;
  agentId: string;
  model: string;
  timeoutSeconds: number;
  authProvider: SupportedOpenClawAuthProvider | null;
}

export class OpenClawRuntimeError extends Error {
  constructor(
    readonly code:
      | "binary_missing"
      | "auth_missing"
      | "rate_limited"
      | "runtime_unavailable"
      | "invalid_response",
    message: string,
  ) {
    super(message);
    this.name = "OpenClawRuntimeError";
  }
}

function defaultExecFile(
  command: string,
  args: string[],
  options: OpenClawExecFileOptions,
): Promise<OpenClawExecFileResult> {
  return execFileAsync(command, args, {
    ...options,
    encoding: "utf8",
  }).then(({ stdout, stderr }) => ({
    stdout: String(stdout),
    stderr: String(stderr),
  }));
}

function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function deriveAuthProvider(
  env: NodeJS.ProcessEnv,
  model: string,
): SupportedOpenClawAuthProvider | null {
  const explicit = normalizeString(env.OPENCLAW_AUTH_PROVIDER)?.toLowerCase();
  if (
    explicit === "openai" ||
    explicit === "openrouter" ||
    explicit === "anthropic" ||
    explicit === "ollama"
  ) {
    return explicit;
  }

  const modelProvider = model.split("/", 1)[0]?.toLowerCase();
  if (
    modelProvider === "openai" ||
    modelProvider === "openrouter" ||
    modelProvider === "anthropic" ||
    modelProvider === "ollama"
  ) {
    return modelProvider;
  }

  return null;
}

function buildOpenClawConfig(config: OpenClawRuntimeConfig) {
  return {
    agents: {
      list: [
        {
          id: config.agentId,
          default: true,
          name: "DRTS Platform Admin Assistant",
          workspace: config.workspaceDir,
          model: {
            primary: config.model,
            fallbacks: [],
          },
          sandbox: {
            mode: "off",
          },
          tools: {
            profile: "minimal",
            deny: [
              "exec",
              "process",
              "read",
              "write",
              "edit",
              "apply_patch",
              "browser",
              "message",
              "sessions_send",
              "sessions_history",
              "sessions_list",
              "cron",
            ],
          },
        },
      ],
    },
    tools: {
      profile: "minimal",
    },
  };
}

function detectRuntimeFailure(stderr: string) {
  const normalized = stderr.toLowerCase();

  if (
    normalized.includes("api key") ||
    normalized.includes("credential") ||
    normalized.includes("auth") ||
    normalized.includes("login")
  ) {
    return new OpenClawRuntimeError(
      "auth_missing",
      `OpenClaw runtime is missing provider authentication: ${stderr.trim()}`,
    );
  }

  if (
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("quota")
  ) {
    return new OpenClawRuntimeError(
      "rate_limited",
      `OpenClaw runtime provider quota is exhausted: ${stderr.trim()}`,
    );
  }

  return new OpenClawRuntimeError(
    "runtime_unavailable",
    stderr.trim() || "OpenClaw runtime did not complete successfully.",
  );
}

@Injectable()
export class OpenClawRuntimeService {
  private readonly env: NodeJS.ProcessEnv;
  private readonly execFileImpl: OpenClawExecFile;

  constructor(
    @Optional()
    @Inject(OPENCLAW_RUNTIME_SERVICE_OPTIONS)
    options?: OpenClawRuntimeServiceOptions,
  ) {
    this.env = options?.env ?? process.env;
    this.execFileImpl = options?.execFileImpl ?? defaultExecFile;
  }

  getConfig(): OpenClawRuntimeConfig {
    const homeDir = resolve(
      normalizeString(this.env.OPENCLAW_HOME) ?? DEFAULT_OPENCLAW_HOME,
    );
    const stateDir = resolve(
      normalizeString(this.env.OPENCLAW_STATE_DIR) ?? homeDir,
    );
    const workspaceDir = resolve(
      normalizeString(this.env.OPENCLAW_WORKSPACE_DIR) ??
        join(stateDir, "workspace"),
    );
    const configPath = resolve(
      normalizeString(this.env.OPENCLAW_CONFIG_PATH) ??
        join(stateDir, "openclaw.json"),
    );
    const model =
      normalizeString(this.env.OPENCLAW_AGENT_MODEL) ??
      normalizeString(this.env.LLM_GATEWAY_CHAT_MODEL) ??
      DEFAULT_OPENCLAW_MODEL;

    return {
      command: normalizeString(this.env.OPENCLAW_BIN) ?? "openclaw",
      homeDir,
      stateDir,
      configPath,
      workspaceDir,
      agentId:
        normalizeString(this.env.OPENCLAW_AGENT_ID) ??
        DEFAULT_OPENCLAW_AGENT_ID,
      model,
      timeoutSeconds:
        Number.parseInt(
          normalizeString(this.env.OPENCLAW_AGENT_TIMEOUT_SECONDS) ??
            String(DEFAULT_TIMEOUT_SECONDS),
          10,
        ) || DEFAULT_TIMEOUT_SECONDS,
      authProvider: deriveAuthProvider(this.env, model),
    };
  }

  async runAgentTurn(
    input: OpenClawAgentRunRequest,
  ): Promise<OpenClawAgentRunResult> {
    const config = this.getConfig();
    const model = input.model?.trim() || config.model;
    this.ensureRuntimeFiles({ ...config, model });

    try {
      const { stdout } = await this.execFileImpl(
        config.command,
        [
          "agent",
          "--local",
          "--json",
          "--agent",
          config.agentId,
          "--session-key",
          input.sessionKey,
          "--model",
          model,
          "--timeout",
          String(config.timeoutSeconds),
          "--message",
          input.message,
        ],
        {
          cwd: config.workspaceDir,
          env: this.buildChildEnv({ ...config, model }),
          timeout: config.timeoutSeconds * 1000,
          maxBuffer: MAX_OUTPUT_BUFFER_BYTES,
        },
      );

      const parsed = this.parseJson(stdout);
      const nestedResult = this.readRecord(parsed.result);
      return {
        text: this.extractReplyText(parsed),
        raw: parsed,
        meta:
          this.readRecord(parsed.meta) ??
          this.readRecord(nestedResult?.meta) ??
          null,
      };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "ENOENT"
      ) {
        throw new OpenClawRuntimeError(
          "binary_missing",
          `OpenClaw CLI was not found at "${config.command}".`,
        );
      }

      if (error instanceof OpenClawRuntimeError) {
        throw error;
      }

      const stderr =
        error &&
        typeof error === "object" &&
        "stderr" in error &&
        typeof (error as { stderr?: unknown }).stderr === "string"
          ? (error as { stderr: string }).stderr
          : "";
      throw detectRuntimeFailure(stderr);
    }
  }

  private ensureRuntimeFiles(config: OpenClawRuntimeConfig) {
    mkdirSync(config.stateDir, { recursive: true });
    mkdirSync(config.workspaceDir, { recursive: true });
    this.writeIfChanged(
      resolve(config.workspaceDir, "AGENTS.md"),
      WORKSPACE_AGENTS_MD,
    );
    this.writeIfChanged(
      config.configPath,
      `${JSON.stringify(buildOpenClawConfig(config), null, 2)}\n`,
    );
  }

  private buildChildEnv(config: OpenClawRuntimeConfig): NodeJS.ProcessEnv {
    const childEnv: NodeJS.ProcessEnv = {
      ...this.env,
      OPENCLAW_HOME: config.homeDir,
      OPENCLAW_STATE_DIR: config.stateDir,
      OPENCLAW_CONFIG_PATH: config.configPath,
      OPENCLAW_WORKSPACE_DIR: config.workspaceDir,
      OPENCLAW_AGENT_MODEL: config.model,
      PATH: [resolve(process.cwd(), "node_modules/.bin"), this.env.PATH ?? ""]
        .filter(Boolean)
        .join(":"),
    };

    const llmGatewayApiKey = normalizeString(childEnv.LLM_GATEWAY_API_KEY);
    if (!llmGatewayApiKey || config.authProvider === null) {
      return childEnv;
    }

    if (
      config.authProvider === "openai" &&
      !normalizeString(childEnv.OPENAI_API_KEY)
    ) {
      childEnv.OPENAI_API_KEY = llmGatewayApiKey;
    }
    if (
      config.authProvider === "openrouter" &&
      !normalizeString(childEnv.OPENROUTER_API_KEY)
    ) {
      childEnv.OPENROUTER_API_KEY = llmGatewayApiKey;
    }
    if (
      config.authProvider === "anthropic" &&
      !normalizeString(childEnv.ANTHROPIC_API_KEY)
    ) {
      childEnv.ANTHROPIC_API_KEY = llmGatewayApiKey;
    }
    if (
      config.authProvider === "ollama" &&
      !normalizeString(childEnv.OLLAMA_API_KEY)
    ) {
      childEnv.OLLAMA_API_KEY = llmGatewayApiKey;
    }

    return childEnv;
  }

  private parseJson(text: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("not_an_object");
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new OpenClawRuntimeError(
        "invalid_response",
        "OpenClaw runtime returned a non-JSON response.",
      );
    }
  }

  private extractReplyText(payload: Record<string, unknown>): string {
    const directPayloadText = this.extractPayloadArrayText(payload.payloads);
    if (directPayloadText) {
      return directPayloadText;
    }

    const nestedResult = this.readRecord(payload.result);
    const nestedPayloadText = this.extractPayloadArrayText(
      nestedResult?.payloads,
    );
    if (nestedPayloadText) {
      return nestedPayloadText;
    }

    const directText =
      (typeof payload.text === "string" && payload.text.trim()) ||
      (typeof payload.message === "string" && payload.message.trim());
    if (directText) {
      return directText;
    }

    throw new OpenClawRuntimeError(
      "invalid_response",
      "OpenClaw runtime JSON did not include a text payload.",
    );
  }

  private extractPayloadArrayText(payloads: unknown): string | null {
    if (!Array.isArray(payloads)) {
      return null;
    }

    const texts = payloads
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const text =
          (entry as { text?: unknown }).text ??
          (entry as { content?: unknown }).content ??
          (entry as { message?: unknown }).message;
        return typeof text === "string" ? text.trim() : null;
      })
      .filter((value): value is string => Boolean(value));

    return texts.length > 0 ? texts.join("\n\n") : null;
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  }

  private writeIfChanged(path: string, content: string) {
    mkdirSync(dirname(path), { recursive: true });
    const current = this.readFile(path);
    if (current === content) {
      return;
    }
    writeFileSync(path, content, "utf8");
  }

  private readFile(path: string) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  }
}
