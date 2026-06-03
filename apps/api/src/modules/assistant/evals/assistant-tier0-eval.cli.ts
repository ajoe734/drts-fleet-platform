import { ASSISTANT_TIER0_EVAL_CASES } from "./assistant-tier0-eval.cases";
import { AssistantTier0EvalRunner } from "./assistant-tier0-eval.runner";
import { KnowledgeAnswerService } from "../knowledge/knowledge-answer.service";
import { KnowledgeSearchService } from "../knowledge/knowledge-search.service";

function main() {
  const runner = new AssistantTier0EvalRunner(
    new KnowledgeAnswerService(new KnowledgeSearchService()),
  );
  const report = runner.run(ASSISTANT_TIER0_EVAL_CASES);

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main();
