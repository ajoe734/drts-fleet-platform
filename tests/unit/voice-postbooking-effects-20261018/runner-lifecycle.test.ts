import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceCommandRunnerService } from "../../../apps/api/src/modules/voice-booking/voice-command-runner.service";

const require = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { NestFactory } = require("@nestjs/core") as {
  NestFactory: {
    createApplicationContext(
      module: unknown,
      options: object,
    ): Promise<{ close(): Promise<void> }>;
  };
};

afterEach(() => vi.unstubAllEnvs());

function fixture(enabled = true) {
  const query = vi.fn(
    async (sql: string): Promise<{ rows: unknown[]; rowCount: number }> => {
      if (sql.includes("to_regclass"))
        return { rows: [{ exists: false }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  );
  const runner = new VoiceCommandRunnerService(
    {
      repository: {
        isEnabled: () => enabled,
        withTransaction: async (fn: (tx: { query: typeof query }) => unknown) =>
          fn({ query }),
      },
    } as never,
    {} as never,
  );
  return { runner, query };
}

async function application(runner: VoiceCommandRunnerService) {
  // An application context has no HTTP listener or product server. Nest owns
  // the real bootstrap and destroy hooks; only the database boundary is fake.
  return NestFactory.createApplicationContext(
    {
      module: class RunnerLifecycleTestModule {},
      providers: [{ provide: VoiceCommandRunnerService, useValue: runner }],
    },
    { logger: false, abortOnError: false },
  );
}

describe("voice runner application lifecycle", () => {
  it("starts the existing loop through Nest bootstrap and stops it on application close", async () => {
    vi.stubEnv("VOICE_BACKGROUND_RUNNER_ENABLED", "true");
    const h = fixture();
    const run = vi.spyOn(h.runner, "runOnce");
    const app = await application(h.runner);
    try {
      await vi.waitFor(() => expect(run).toHaveBeenCalled());
      expect(h.runner.running).toBe(true);
      expect(run).toHaveBeenCalledWith({
        supportedTypes: [
          "execute_booking_command",
          "request_dispatch",
          "publish_booking_audit",
          "notify_booking_result",
        ],
      });
    } finally {
      await app.close();
    }
    expect(h.runner.running).toBe(false);
    expect(await h.runner.runOnce()).toBeNull();
  });

  it("does not activate the loop when this runtime has not enabled it", async () => {
    vi.stubEnv("VOICE_BACKGROUND_RUNNER_ENABLED", "false");
    const h = fixture();
    const app = await application(h.runner);
    expect(h.runner.running).toBe(false);
    expect(h.query).not.toHaveBeenCalled();
    await app.close();
  });

  it("does not start an enabled durable runner without PostgreSQL", async () => {
    vi.stubEnv("VOICE_BACKGROUND_RUNNER_ENABLED", "true");
    const h = fixture(false);
    await expect(application(h.runner)).rejects.toThrow(
      "Voice background runner requires PostgreSQL",
    );
    expect(h.runner.running).toBe(false);
    expect(h.query).not.toHaveBeenCalled();
  });

  it("drain waits for a pending database claim and prevents further claims", async () => {
    const h = fixture();
    let releaseClaim!: () => void;
    h.query.mockImplementation(async (sql) => {
      if (sql.includes("WITH candidate AS"))
        await new Promise<void>((resolve) => {
          releaseClaim = resolve;
        });
      return { rows: [], rowCount: 0 };
    });
    const execution = h.runner.runOnce();
    await vi.waitFor(() => expect(releaseClaim).toBeTypeOf("function"));
    let closed = false;
    const draining = h.runner.drain(1000).then((result) => {
      closed = true;
      return result;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    expect(await h.runner.runOnce()).toBeNull();
    releaseClaim();
    expect(await execution).toBeNull();
    expect(await draining).toEqual({ drained: true, inFlightCompleted: true });
  });

  it("drain waits after a domain effect until its queue acknowledgement completes", async () => {
    const h = fixture();
    h.query.mockImplementation(async (sql) => {
      if (sql.includes("WITH candidate AS"))
        return {
          rowCount: 1,
          rows: [
            {
              work_id: "work",
              work_type: "lifecycle-test",
              lease_epoch: 1,
              attempt: 1,
              dedupe_key: "original-key",
              command_id: null,
              voice_session_id: null,
              payload_ref: null,
            },
          ],
        };
      if (sql.includes("to_regclass"))
        return { rowCount: 1, rows: [{ exists: false }] };
      return { rows: [], rowCount: 0 };
    });
    h.runner.registerHandler("lifecycle-test", async () => ({
      effect: "complete",
    }));
    let acknowledge!: () => void;
    h.runner.completeWorkItemWithDomainState = async () =>
      new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
    const execution = h.runner.runOnce();
    await vi.waitFor(() => expect(acknowledge).toBeTypeOf("function"));
    let closed = false;
    const draining = h.runner.drain(1000).then((result) => {
      closed = true;
      return result;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    acknowledge();
    expect(await execution).toMatchObject({ success: true });
    expect(await draining).toEqual({ drained: true, inFlightCompleted: true });
  });
});
