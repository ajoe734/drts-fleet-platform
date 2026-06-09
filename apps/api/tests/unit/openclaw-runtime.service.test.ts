import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { OpenClawRuntimeService } from "../../src/common/openclaw-runtime";

describe("OpenClawRuntimeService", () => {
  it("writes a minimal runtime config and maps the shared llm key to openai auth", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "drts-openclaw-"));
    let captured:
      | {
          command: string;
          args: string[];
          env: NodeJS.ProcessEnv | undefined;
        }
      | undefined;

    const service = new OpenClawRuntimeService({
      env: {
        OPENCLAW_HOME: stateDir,
        LLM_GATEWAY_CHAT_MODEL: "openai/gpt-5.5",
        LLM_GATEWAY_API_KEY: "sk-openclaw-test",
      },
      execFileImpl: async (command, args, options) => {
        captured = {
          command,
          args,
          env: options.env,
        };
        return {
          stdout: JSON.stringify({
            payloads: [
              {
                text: '{"answer":"hello","citations":[],"suggestedPrompts":[],"actionPlan":null}',
              },
            ],
            meta: {
              transport: "embedded",
            },
          }),
          stderr: "",
        };
      },
    });

    const result = await service.runAgentTurn({
      sessionKey: "paas-session-001",
      message: "Summarize current rollout state.",
    });

    expect(captured?.command).toBe("openclaw");
    expect(captured?.args).toEqual(
      expect.arrayContaining([
        "agent",
        "--local",
        "--json",
        "--agent",
        "platform-admin",
        "--session-key",
        "paas-session-001",
        "--model",
        "openai/gpt-5.5",
      ]),
    );
    expect(captured?.env?.OPENAI_API_KEY).toBe("sk-openclaw-test");
    expect(result.text).toContain('"answer":"hello"');
    expect(result.meta).toEqual({ transport: "embedded" });

    expect(readFileSync(join(stateDir, "openclaw.json"), "utf8")).toContain(
      '"profile": "minimal"',
    );
    expect(
      readFileSync(join(stateDir, "workspace", "AGENTS.md"), "utf8"),
    ).toContain("DRTS Platform Admin Assistant");
  });

  it("accepts nested result payloads from the openclaw json envelope", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "drts-openclaw-"));
    const service = new OpenClawRuntimeService({
      env: {
        OPENCLAW_HOME: stateDir,
        OPENCLAW_AGENT_MODEL: "openrouter/auto",
        LLM_GATEWAY_API_KEY: "sk-or-test",
      },
      execFileImpl: async () => ({
        stdout: JSON.stringify({
          result: {
            payloads: [{ text: "nested reply" }],
            meta: { fallbackFrom: "gateway" },
          },
        }),
        stderr: "",
      }),
    });

    const result = await service.runAgentTurn({
      sessionKey: "paas-session-002",
      message: "Summarize current rollout state.",
    });

    expect(result.text).toBe("nested reply");
    expect(result.meta).toEqual({ fallbackFrom: "gateway" });
  });
});
