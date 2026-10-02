/**
 * Worker result tool for orchestrator pi lanes.
 *
 * Codex lanes report their final outcome through `--output-schema` and
 * `--output-last-message`. pi has neither, so adapters/pi.py loads this
 * extension and sets DRTS_WORKER_RESULT_PATH. The worker ends its run by calling
 * `submit_worker_result`, which writes the payload there in the shape of
 * schemas/worker-result.schema.json. The supervisor then reads and validates it
 * exactly as it does a Codex result file (worker_lifecycle.worker_reported_outcome).
 *
 * Outside an orchestrated run the variable is unset and the extension registers
 * nothing.
 */

import { renameSync, writeFileSync } from "node:fs";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const resultPath = process.env.DRTS_WORKER_RESULT_PATH;

const submitWorkerResult = defineTool({
	name: "submit_worker_result",
	label: "Submit Worker Result",
	description:
		"Report this orchestrator run's final outcome to the supervisor. Call it exactly once, as the last action of the run, after the status-board command for this run (ai-status.sh start/progress/handoff/approve/reopen/blocker) has succeeded.",
	promptSnippet: "Report the run's final outcome to the orchestrator supervisor",
	promptGuidelines: [
		"End every run by calling submit_worker_result exactly once. Do not write another reply after it.",
		"submit_worker_result does not replace the status board: the supervisor trusts ai-status.sh first, so record handoff/approve/reopen/progress/blocker there before submitting.",
		"outcome: advanced = you handed off, approved or reopened; progress = you recorded progress but the task is not finished; blocked = you recorded a blocker you cannot clear; failed = you could not do the work and could not record it either.",
		"task_status_written is the status-board command you ran (for example `handoff`), or null if none succeeded. verification lists the checks you ran and their results.",
	],
	parameters: Type.Object(
		{
			outcome: Type.Union([
				Type.Literal("advanced"),
				Type.Literal("progress"),
				Type.Literal("blocked"),
				Type.Literal("failed"),
			]),
			summary: Type.String({ minLength: 1, maxLength: 2000 }),
			task_status_written: Type.Union([Type.String(), Type.Null()]),
			blocker: Type.Union([Type.String({ maxLength: 2000 }), Type.Null()]),
			verification: Type.Union([
				Type.Array(Type.String({ maxLength: 1000 }), { maxItems: 20 }),
				Type.Null(),
			]),
		},
		{ additionalProperties: false },
	),

	async execute(_toolCallId, params) {
		const payload = {
			outcome: params.outcome,
			summary: params.summary,
			task_status_written: params.task_status_written,
			blocker: params.blocker,
			verification: params.verification,
		};
		// Rename into place so the supervisor never reads a half-written file.
		const temporary = `${resultPath}.${process.pid}.tmp`;
		writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
		renameSync(temporary, resultPath as string);
		return {
			content: [{ type: "text", text: `Worker result recorded: ${params.outcome}.` }],
			details: payload,
			terminate: true,
		};
	},
});

export default function (pi: ExtensionAPI) {
	if (!resultPath) return;
	pi.registerTool(submitWorkerResult);
}
