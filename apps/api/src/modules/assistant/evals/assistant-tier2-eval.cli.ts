import { ASSISTANT_TIER2_EVAL_CASES } from "./assistant-tier2-eval.cases";
import { AssistantService } from "../assistant.service";
import { AssistantTier2EvalRunner } from "./assistant-tier2-eval.runner";

function main() {
  const runner = new AssistantTier2EvalRunner(new AssistantService());
  const report = runner.run(ASSISTANT_TIER2_EVAL_CASES);

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main();
