import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SCENARIOS_PATH = path.join(REPO_ROOT, "tests", "fixtures", "unattended-voice", "scenarios.json");
const MODELS_PATH = path.join(REPO_ROOT, "tests", "fixtures", "unattended-voice", "models-profiles.json");
const EVAL_SCRIPT = path.join(REPO_ROOT, "operations", "verification", "unattended-voice-eval.mjs");

test.describe("unattended voice evaluation harness and safety gates", () => {
  test("fixtures are valid, non-empty, and contain required dialects and ground truth", async () => {
    expect(fs.existsSync(SCENARIOS_PATH)).toBe(true);
    const data = JSON.parse(fs.readFileSync(SCENARIOS_PATH, "utf-8"));
    expect(data.total_count).toBeGreaterThanOrEqual(100);
    expect(data.scenarios.length).toBeGreaterThanOrEqual(100);

    const languages = new Set(data.scenarios.map((s: any) => s.language));
    expect(languages.has("zh-TW")).toBe(true);
    expect(languages.has("nan-TW")).toBe(true);
    expect(languages.has("hak-TW")).toBe(true);
    expect(languages.has("en-mixed")).toBe(true);

    for (const scen of data.scenarios) {
      expect(scen.id).toBeDefined();
      expect(scen.ground_truth).toBeDefined();
      expect(Array.isArray(scen.ground_truth.expected_tools)).toBe(true);
    }
  });

  test("models-profiles.json defines fixed model versions, prompts, and acceptable behaviors", async () => {
    expect(fs.existsSync(MODELS_PATH)).toBe(true);
    const models = JSON.parse(fs.readFileSync(MODELS_PATH, "utf-8"));
    
    expect(models.candidates.twm_llm_twm).toBeDefined();
    expect(models.candidates.openai_realtime).toBeDefined();
    expect(models.candidates.gemini_live).toBeDefined();

    expect(models.acceptable_behaviors.in_flight_correction).toBeDefined();
    expect(models.acceptable_behaviors.ambiguous_address_resolution).toBeDefined();
    expect(models.acceptable_behaviors.barge_in_cutoff).toBeDefined();
    expect(models.acceptable_behaviors.confirmation_gate).toBeDefined();
    expect(models.acceptable_behaviors.prompt_injection_containment).toBeDefined();
  });

  test("live mode fails closed when missing authorization reference", async () => {
    let failed = false;
    try {
      await execFileAsync("node", [EVAL_SCRIPT, "--mode", "live"]);
    } catch (err: any) {
      failed = true;
      expect(err.code).not.toBe(0);
      expect(err.stderr || err.stdout).toContain("[FAIL_CLOSED] LIVE MODE REJECTED");
      expect(err.stderr || err.stdout).toContain("Missing or invalid --authorization-ref");
    }
    expect(failed).toBe(true);
  });

  test("live mode fails closed when credentials missing despite valid authorization reference", async () => {
    let failed = false;
    try {
      await execFileAsync("node", [
        EVAL_SCRIPT,
        "--mode",
        "live",
        "--authorization-ref",
        "AUTH-UV-LIVE-20260906-001",
      ], {
        env: { ...process.env, UNATTENDED_VOICE_LIVE_TRUNK_ENDPOINT: "", UNATTENDED_VOICE_LIVE_AUTH_KEY: "" }
      });
    } catch (err: any) {
      failed = true;
      expect(err.code).not.toBe(0);
      expect(err.stderr || err.stdout).toContain("[FAIL_CLOSED] LIVE MODE REJECTED");
      expect(err.stderr || err.stdout).toContain("Live carrier PSTN credentials / trunk endpoints missing");
    }
    expect(failed).toBe(true);
  });

  test("fixture execution completes successfully and outputs prominent non-telephony notice", async () => {
    const { stdout } = await execFileAsync("node", [EVAL_SCRIPT, "--mode", "fixture", "--candidate", "twm_llm_twm"]);
    expect(stdout).toContain("Evaluating Candidate: [twm_llm_twm]");
    expect(stdout).toContain("[NOTICE] FIXTURE MODE EVALUATION COMPLETED");
    expect(stdout).toContain("It does NOT claim production carrier PSTN voice quality");
  });
});
