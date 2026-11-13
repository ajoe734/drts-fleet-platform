import type { LlmGatewayService } from "../../common/llm-gateway";
import {
  ASSIST_FIELDS,
  type AssistField,
  type AssistFieldMap,
  type AssistTranscriptSegment,
  clampConfidence,
  mergeCandidates,
  statusForConfidence,
} from "./assist-fields";

/**
 * Optional LLM refinement of the rule-based draft. Disabled unless the
 * operator sets CALLCENTER_ASSIST_LLM_ENABLED=true AND the shared LLM gateway
 * points at a live provider: call transcripts contain personal data, so
 * sending them to an external model is an explicit opt-in. Any failure falls
 * back to the rule result; the LLM never blocks the agent.
 */

export const ASSIST_LLM_TIMEOUT_MS = 5_000;
const MAX_PROMPT_SEGMENTS = 60;

interface LlmField {
  value: string;
  uncertain: boolean;
  evidence: string | null;
}

/** Keep only well-formed known fields from the model's JSON. */
export function parseLlmFields(
  raw: unknown,
): Partial<Record<AssistField, LlmField>> {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("LLM response is not an object");
  }
  const fields = (raw as { fields?: unknown }).fields;
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
    throw new Error("LLM response has no fields object");
  }
  const result: Partial<Record<AssistField, LlmField>> = {};
  for (const field of ASSIST_FIELDS) {
    const entry = (fields as Record<string, unknown>)[field];
    if (typeof entry !== "object" || entry === null) continue;
    const { value, uncertain, evidence } = entry as Record<string, unknown>;
    if (typeof value !== "string" || !value.trim() || value.length > 200) {
      continue;
    }
    result[field] = {
      value: value.trim(),
      uncertain: uncertain === true,
      evidence:
        typeof evidence === "string" && evidence.trim()
          ? evidence.trim().slice(0, 300)
          : null,
    };
  }
  return result;
}

export function isAssistLlmEnabled(
  gateway:
    | Pick<LlmGatewayService, "isMockProvider" | "isOpenClawProvider">
    | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.CALLCENTER_ASSIST_LLM_ENABLED?.trim().toLowerCase() === "true" &&
    Boolean(gateway) &&
    !gateway!.isMockProvider() &&
    !gateway!.isOpenClawProvider()
  );
}

const SYSTEM_PROMPT = `你是台灣計程車叫車客服的填單助手。根據客服與乘客的通話逐字稿，擷取叫車單欄位。
只回傳 JSON，格式：{"fields":{"<欄位>":{"value":"…","uncertain":true|false,"evidence":"逐字稿原句"}}}
欄位：pickup（上車地點，完整地址或地標）、dropoff（下車地點）、passengerName（乘客稱呼，如「王先生」）、passengerPhone（只含數字）、pickupTime（「現在（即時叫車）」或具體時間）、passengerCount（數字）、luggage（如「2 件（大型）」）、requiredCapabilities（wheelchair、child_seat，以逗號分隔）、notes（其他司機需要知道的事）。
規則：以最後一次更正為準；沒提到的欄位不要輸出；聽不清楚、有歧義或只是猜測時 uncertain 設為 true；不可捏造逐字稿裡沒有的內容。`;

function renderTranscript(segments: readonly AssistTranscriptSegment[]) {
  const speakerLabel = { caller: "乘客", agent: "客服", unknown: "未知" };
  return segments
    .slice(-MAX_PROMPT_SEGMENTS)
    .map((segment) => `${speakerLabel[segment.speaker]}：${segment.text}`)
    .join("\n");
}

function parseJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("no JSON object in LLM response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Ask the LLM for fields and overlay them on the rule result. A field the LLM
 * omits keeps its rule value; a field it disagrees on keeps the rule value as
 * a candidate so the agent can see both.
 */
export async function refineAssistFieldsWithLlm(
  gateway: Pick<LlmGatewayService, "completeChat">,
  segments: readonly AssistTranscriptSegment[],
  ruleFields: AssistFieldMap,
  now: string = new Date().toISOString(),
): Promise<AssistFieldMap> {
  const response = await gateway.completeChat({
    signal: AbortSignal.timeout(ASSIST_LLM_TIMEOUT_MS),
    temperature: 0,
    maxTokens: 800,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: renderTranscript(segments) },
    ],
  });
  const parsed = parseLlmFields(parseJsonObject(response.text));
  const lastSegmentId = segments.at(-1)?.segmentId;
  const merged: AssistFieldMap = { ...ruleFields };
  for (const field of ASSIST_FIELDS) {
    const llmField = parsed[field];
    if (!llmField) {
      continue;
    }
    const value =
      field === "passengerPhone"
        ? llmField.value.replace(/\D/g, "")
        : llmField.value;
    if (!value) {
      continue;
    }
    const rule = ruleFields[field];
    const agrees = rule?.value === value;
    const confidence = clampConfidence(
      llmField.uncertain ? 0.6 : agrees ? 0.92 : 0.82,
    );
    merged[field] = {
      value,
      rawText: llmField.evidence ?? rule?.rawText ?? null,
      confidence,
      status: statusForConfidence(confidence),
      candidates: agrees
        ? (rule?.candidates ?? [])
        : mergeCandidates(rule?.candidates ?? [], rule?.value).filter(
            (candidate) => candidate !== value,
          ),
      origin: "llm",
      sourceSegmentIds:
        rule?.sourceSegmentIds ?? (lastSegmentId ? [lastSegmentId] : []),
      updatedAt: now,
    };
  }
  return merged;
}
