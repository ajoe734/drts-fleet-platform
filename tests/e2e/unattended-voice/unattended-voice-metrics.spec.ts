import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const RATE_CARDS_PATH = path.join(REPO_ROOT, "tests", "fixtures", "unattended-voice", "rate-cards.json");
const HOLDOUT_PATH = path.join(REPO_ROOT, "tests", "fixtures", "unattended-voice", "holdout.json");
const EVAL_SCRIPT = path.join(REPO_ROOT, "operations", "verification", "unattended-voice-eval.mjs");

test.describe("unattended voice metrics and rate card ledger verification", () => {
  test("rate card ledger adheres to SA §12.1 and SD §14.3 pricing rules", async () => {
    expect(fs.existsSync(RATE_CARDS_PATH)).toBe(true);
    const rateCards = JSON.parse(fs.readFileSync(RATE_CARDS_PATH, "utf-8"));
    
    expect(rateCards.currency).toBe("TWD");
    expect(rateCards.tax_included).toBe(true);
    expect(rateCards.rates.twm_speech.realtime_asr_per_minute).toBe(0.74);
    expect(rateCards.rates.twm_speech.offline_asr_per_minute).toBe(0.19);
    expect(rateCards.rates.twm_speech.tts_per_million_chars).toBe(625.0);
    expect(rateCards.rates.telephony.inbound_per_minute).toBe(0.45);
    expect(rateCards.rates.human_agent_amortized.labor_cost_per_minute).toBe(5.0);
  });

  test("holdout dataset contains strictly isolated validation scenarios", async () => {
    expect(fs.existsSync(HOLDOUT_PATH)).toBe(true);
    const holdout = JSON.parse(fs.readFileSync(HOLDOUT_PATH, "utf-8"));
    
    expect(holdout.dataset_type).toBe("holdout");
    expect(holdout.holdout_policy).toBe("strictly_isolated_from_prompt_tuning");
    expect(holdout.scenarios.length).toBeGreaterThanOrEqual(20);

    for (const item of holdout.scenarios) {
      expect(item.id.startsWith("UV-HOLD-")).toBe(true);
    }
  });

  test("evaluation outputs cost ledger and per-language metrics for all candidates", async () => {
    const tmpOutput = path.join(REPO_ROOT, ".artifacts", "temp-eval-report.json");
    try {
      await execFileAsync("node", [
        EVAL_SCRIPT,
        "--mode", "fixture",
        "--load-multipliers", "1,1.5",
        "--output", tmpOutput,
      ]);

      expect(fs.existsSync(tmpOutput)).toBe(true);
      const report = JSON.parse(fs.readFileSync(tmpOutput, "utf-8"));

      expect(report.mode).toBe("fixture");
      expect(report.candidates.twm_llm_twm).toBeDefined();
      expect(report.candidates.openai_realtime).toBeDefined();
      expect(report.candidates.gemini_live).toBeDefined();

      const twmLoad1 = report.candidates.twm_llm_twm.load_results["1x"];
      expect(twmLoad1).toBeDefined();
      expect(parseFloat(twmLoad1.cost_ledger_twd.total_cost_per_call)).toBeGreaterThan(0);
      expect(parseFloat(twmLoad1.cost_ledger_twd.cost_per_successful_booking)).toBeGreaterThan(0);
      expect(twmLoad1.per_language["zh-TW"]).toBeDefined();
      expect(twmLoad1.per_language["nan-TW"]).toBeDefined();
      expect(twmLoad1.per_language["hak-TW"]).toBeDefined();

      // Verify latency under 1.5x load multiplier is higher than 1x
      const twmLoad15 = report.candidates.twm_llm_twm.load_results["1.5x"];
      expect(twmLoad15.latency_p95_ms.first_audible_response).toBeGreaterThanOrEqual(
        twmLoad1.latency_p95_ms.first_audible_response
      );
    } finally {
      if (fs.existsSync(tmpOutput)) {
        fs.unlinkSync(tmpOutput);
      }
    }
  });
});
