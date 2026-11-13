/**
 * PAX-PSP-SANDBOX-EVIDENCE-20261101 — masked evidence recording for the ECPay
 * Stage run on a GitHub-hosted runner.
 *
 * Rules enforced here (task spec §4):
 * - card numbers keep only the last four digits;
 * - BindCardID, MerchantMemberID, MerchantTradeNo and TradeNo keep only the
 *   first 12 hex characters of their SHA-256;
 * - HashKey, HashIV, MerchantID, the token key ring, merchant tokens and pay
 *   tokens never reach the evidence files (a final scan fails closed);
 * - GitHub log masking (`::add-mask::`) is emitted for every runtime secret.
 *
 * The recording fetch only observes the calls the merged EcpayPaymentProvider
 * makes; request construction, encryption and response handling stay in the
 * adapter. It decrypts responses with the merged ecpay-cipher helper solely to
 * record HTTP status / TransCode / RtnCode per call.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  decryptEcpayData,
  normalizeEcpayEnvelopeInput,
  verifyAndUnwrapEcpayEnvelope,
} from "../../../apps/api/src/modules/passenger-app/payment/ecpay-cipher";
import type { EcpayFetchFn } from "../../../apps/api/src/modules/passenger-app/payment/ecpay-payment-provider";

export const EVIDENCE_SCHEMA = "pax-psp-sandbox-evidence/v1";

export const EVIDENCE_DIR = path.resolve(
  process.env.PAX_PSP_SANDBOX_EVIDENCE_DIR ?? ".artifacts/pax-psp-sandbox",
);

/** ECPay's publicly documented Stage test card (developers.ecpay.com.tw/9163). */
export const STAGE_TEST_CARD = Object.freeze({
  number: "4311952222222222",
  cvv: "222",
  otp: "1234",
  last4: "2222",
  // Synthetic cardholder name for the SDK's required #CardholderName field;
  // not a real person, so it is never registered with the redactor.
  holderName: "PSPTEST",
});

export function digest12(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

/** Emits GitHub log masks; harmless (and silent) outside Actions. */
export function maskInLog(value: string | null | undefined): void {
  if (!value || process.env.GITHUB_ACTIONS !== "true") return;
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length >= 3) process.stdout.write(`::add-mask::${trimmed}\n`);
  }
}

export class Redactor {
  private readonly secrets = new Set<string>();

  constructor(values: Iterable<string | null | undefined> = []) {
    for (const value of values) this.add(value);
  }

  add(value: string | null | undefined): void {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed.length >= 4) this.secrets.add(trimmed);
    maskInLog(trimmed);
  }

  /** Every registered secret, longest first (so substrings never leak). */
  private ordered(): string[] {
    return [...this.secrets].sort((a, b) => b.length - a.length);
  }

  text(input: unknown, maxLength = 300): string {
    let out = typeof input === "string" ? input : String(input ?? "");
    for (const secret of this.ordered())
      out = out.split(secret).join("[REDACTED]");
    // Any 12+ digit run (with optional separators) is treated as a PAN.
    out = out.replace(/\d(?:[ -]?\d){11,}/g, "[DIGITS]");
    return out.length > maxLength ? `${out.slice(0, maxLength)}…` : out;
  }

  /** Returns the first leak found in a serialized artifact, if any. */
  findLeak(serialized: string): string | null {
    for (const secret of this.ordered()) {
      if (serialized.includes(secret)) return "registered_secret";
    }
    const digitsOnly = serialized.replace(/[\s-]/g, "");
    if (digitsOnly.includes(STAGE_TEST_CARD.number)) return "full_card_number";
    return null;
  }
}

type Scalar = string | number | boolean | null;

export interface EcpayCallRecord {
  step: string;
  endpoint: string;
  host: string;
  startedAt: string;
  durationMs: number;
  httpStatus: number | null;
  transCode: number | null;
  transMsg: string | null;
  rtnCode: number | null;
  rtnMsg: string | null;
  responseVerified: boolean;
  /** Masked fields only: *_sha12 digests, last4, non-identifying status. */
  fields: Record<string, Scalar>;
  error: string | null;
}

export interface StepRecord {
  name: string;
  status: "passed" | "failed" | "skipped";
  startedAt: string;
  finishedAt: string | null;
  outcome: Record<string, Scalar>;
  error: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Extracts only masked/non-sensitive response facts from a decrypted Data. */
export function maskedResponseFields(
  data: Record<string, unknown>,
): Record<string, Scalar> {
  const fields: Record<string, Scalar> = {};
  const scopes = [
    data,
    asRecord(data.OrderInfo),
    asRecord(data.CardInfo),
    asRecord(data.ConsumerInfo),
    asRecord(data.RtnValue),
  ].filter((scope): scope is Record<string, unknown> => scope !== null);
  const digestKeys: Record<string, string> = {
    BindCardID: "bindCardId_sha12",
    MerchantMemberID: "merchantMemberId_sha12",
    MerchantTradeNo: "merchantTradeNo_sha12",
    TradeNo: "tradeNo_sha12",
  };
  for (const scope of scopes) {
    for (const [key, outKey] of Object.entries(digestKeys)) {
      const value = stringField(scope[key]);
      if (value && fields[outKey] === undefined)
        fields[outKey] = digest12(value);
    }
    const card4 = stringField(scope.Card4No);
    if (card4 && /^\d{4}$/.test(card4) && fields.card_last4 === undefined)
      fields.card_last4 = card4;
    for (const key of ["TradeStatus", "Status", "CloseStatus", "TotalAmount"]) {
      const value = stringField(scope[key]);
      if (value && /^[A-Za-z0-9_一-鿿]{1,24}$/.test(value)) {
        const outKey = `${key.charAt(0).toLowerCase()}${key.slice(1)}`;
        if (fields[outKey] === undefined) fields[outKey] = value;
      }
    }
  }
  const threeD = asRecord(data.ThreeDInfo);
  const threeDUrl =
    stringField(threeD?.ThreeDURL) ?? stringField(data.ThreeDURL);
  if (threeDUrl) fields.threeDUrl_present = true;
  if (stringField(data.Token)) fields.merchantToken_present = true;
  return fields;
}

/**
 * Describes the *structure* of a raw OrderResultURL/ReturnURL callback body
 * without reading any field value: only key names, nesting kind, and
 * lengths. Used to diagnose `verifyNotification` failures against the real
 * ECPay Stage wire format (which the merged adapter has never observed
 * outside its own synthetic unit-test fixtures) without risking a PAN,
 * token, or HashKey/HashIV leak into evidence artifacts.
 */
export function describeCallbackBodyShape(raw: string): Record<string, Scalar> {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    let keys: string[] | null = null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        keys = Object.keys(parsed as Record<string, unknown>);
    } catch {
      keys = null;
    }
    return {
      callbackBodyKind: "json",
      callbackBodyLength: trimmed.length,
      callbackTopLevelKeys: keys ? keys.sort().join(",") : "unparseable",
    };
  }
  const params = new URLSearchParams(trimmed);
  const formKeys = [...params.keys()].sort();
  const resultData = params.get("ResultData");
  const rpHeaderRaw = params.get("RpHeader") ?? params.get("RqHeader");
  let resultDataKind: Scalar = null;
  if (resultData !== null) {
    const rd = resultData.trim();
    if (rd.startsWith("{")) {
      try {
        JSON.parse(rd);
        resultDataKind = "json_object";
      } catch {
        resultDataKind = "json_parse_failed";
      }
    } else {
      resultDataKind = /^[A-Za-z0-9+/]+=*$/.test(rd) ? "base64_like" : "other";
    }
  }
  return {
    callbackBodyKind: "form",
    callbackBodyLength: trimmed.length,
    callbackFormKeys: formKeys.join(","),
    callbackHasResultData: resultData !== null,
    callbackResultDataKind: resultDataKind,
    // Confirms/refutes the adapter's assumption that a flat form always
    // carries RpHeader/RqHeader as an already-structured value: a bare
    // top-level form field is always a *string*, so if ECPay sends the
    // header this way (not nested inside a ResultData JSON envelope),
    // verifyAndUnwrapEcpayEnvelope's `typeof headerRaw !== "object"` check
    // rejects it even though the envelope is genuine.
    callbackHasFlatHeaderField: rpHeaderRaw !== null,
  };
}

/**
 * Narrows exactly which stage of `verifyAndUnwrapEcpayEnvelope` rejects a
 * real ECPay callback, by calling the same exported, unmodified helpers
 * (`normalizeEcpayEnvelopeInput`, `decryptEcpayData`) step by step instead of
 * the combined function, which only ever throws one generic error. Records
 * field *names*, booleans, lengths and a clock-skew delta only — never a
 * field value — so a HashKey/HashIV/PAN/token can never leak through this
 * diagnostic even though it has them in scope to attempt the real decrypt.
 */
export function diagnoseEnvelopeVerification(params: {
  raw: string;
  merchantId: string;
  hashKey: string;
  hashIv: string;
  nowSeconds?: number;
}): Record<string, Scalar> {
  const { raw, merchantId, hashKey, hashIv } = params;
  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const out: Record<string, Scalar> = {};

  let record: Record<string, unknown>;
  try {
    record = normalizeEcpayEnvelopeInput(raw);
  } catch {
    out.diag_normalize_ok = false;
    return out;
  }
  out.diag_normalize_ok = true;
  out.diag_record_keys = Object.keys(record).sort().join(",");

  const merchantIdField = record.MerchantID;
  out.diag_merchantId_field_kind = typeof merchantIdField;
  out.diag_merchantId_matches =
    typeof merchantIdField === "string" &&
    merchantIdField.trim() === merchantId.trim();

  let headerRaw: unknown = record.RpHeader ?? record.RqHeader;
  out.diag_header_field_kind = typeof headerRaw;
  if (typeof headerRaw === "string") {
    try {
      headerRaw = JSON.parse(headerRaw.trim());
      out.diag_header_string_parsed_ok = true;
    } catch {
      out.diag_header_string_parsed_ok = false;
    }
  }
  const headerIsObject =
    !!headerRaw && typeof headerRaw === "object" && !Array.isArray(headerRaw);
  out.diag_header_is_object = headerIsObject;
  if (headerIsObject) {
    const headerRecord = headerRaw as Record<string, unknown>;
    out.diag_timestamp_present = headerRecord.Timestamp !== undefined;
    const timestamp = Number(headerRecord.Timestamp);
    out.diag_timestamp_is_safe_integer = Number.isSafeInteger(timestamp);
    if (Number.isSafeInteger(timestamp)) {
      out.diag_timestamp_skew_seconds = Math.abs(nowSeconds - timestamp);
      out.diag_timestamp_within_window =
        Math.abs(nowSeconds - timestamp) <= 600;
    }
  }

  const transCodeField = record.TransCode;
  out.diag_transCode_field_present = transCodeField !== undefined;
  if (transCodeField !== undefined) {
    out.diag_transCode_is_safe_integer = Number.isSafeInteger(
      Number(transCodeField),
    );
  }

  const cipherText = record.Data ?? record.ResultData;
  out.diag_data_field_kind =
    cipherText === undefined ? "missing" : typeof cipherText;
  if (typeof cipherText === "string") {
    const trimmedCipherText = cipherText.trim();
    out.diag_data_field_length = trimmedCipherText.length;
    out.diag_data_field_base64_like = /^[A-Za-z0-9+/]+={0,2}$/.test(
      trimmedCipherText,
    );
  }
  try {
    const decrypted = decryptEcpayData(cipherText, hashKey, hashIv);
    out.diag_decrypt_ok = true;
    out.diag_decrypted_keys = Object.keys(decrypted).sort().join(",");
  } catch {
    out.diag_decrypt_ok = false;
  }
  return out;
}

export function createRecordingFetch(params: {
  merchantId: string;
  hashKey: string;
  hashIv: string;
  redactor: Redactor;
  records: EcpayCallRecord[];
  currentStep: () => string;
}): EcpayFetchFn {
  const { merchantId, hashKey, hashIv, redactor, records, currentStep } =
    params;
  return async (url, init) => {
    const started = Date.now();
    const target = new URL(url);
    const record: EcpayCallRecord = {
      step: currentStep(),
      endpoint: target.pathname,
      host: target.host,
      startedAt: new Date(started).toISOString(),
      durationMs: 0,
      httpStatus: null,
      transCode: null,
      transMsg: null,
      rtnCode: null,
      rtnMsg: null,
      responseVerified: false,
      fields: {},
      error: null,
    };
    try {
      const response = await fetch(url, init);
      record.httpStatus = response.status;
      const text = await response.text();
      let body: unknown;
      let parsed = false;
      try {
        body = JSON.parse(text);
        parsed = true;
      } catch {
        record.error = "response_not_json";
      }
      const outer = asRecord(body);
      if (outer) {
        const transCode = Number(outer.TransCode);
        record.transCode = Number.isSafeInteger(transCode) ? transCode : null;
        record.transMsg =
          typeof outer.TransMsg === "string"
            ? redactor.text(outer.TransMsg)
            : null;
        try {
          const unwrapped = verifyAndUnwrapEcpayEnvelope({
            envelope: outer,
            merchantId,
            hashKey,
            hashIv,
          });
          record.responseVerified = true;
          const rtnCode = Number(unwrapped.data.RtnCode);
          record.rtnCode = Number.isSafeInteger(rtnCode) ? rtnCode : null;
          record.rtnMsg =
            typeof unwrapped.data.RtnMsg === "string"
              ? redactor.text(unwrapped.data.RtnMsg)
              : null;
          record.fields = maskedResponseFields(unwrapped.data);
        } catch {
          record.error = record.error ?? "response_envelope_unverifiable";
        }
      }
      record.durationMs = Date.now() - started;
      records.push(record);
      return {
        ok: response.ok,
        status: response.status,
        async json() {
          if (!parsed) throw new Error("ECPay response was not JSON.");
          return body;
        },
      };
    } catch (err) {
      record.durationMs = Date.now() - started;
      record.error = redactor.text(
        err instanceof Error ? `${err.name}: ${err.message}` : err,
      );
      records.push(record);
      throw err;
    }
  };
}

export interface SandboxEvidence {
  schema: typeof EVIDENCE_SCHEMA;
  taskId: "PAX-PSP-SANDBOX-EVIDENCE-20261101";
  acceptanceKey: "pax-psp_sandbox_bind_and_charge_evidence";
  candidateSha: string;
  runUrl: string | null;
  runId: string | null;
  runAttempt: string | null;
  startedAt: string;
  finishedAt: string | null;
  environment: Record<string, Scalar>;
  steps: StepRecord[];
  calls: EcpayCallRecord[];
  screenshots: string[];
  refund: Record<string, Scalar>;
  acceptance: Record<string, Scalar>;
}

export function writeJsonArtifact(
  redactor: Redactor,
  fileName: string,
  value: unknown,
): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  let serialized = `${JSON.stringify(value, null, 2)}\n`;
  const leak = redactor.findLeak(serialized);
  if (leak) {
    // Fail closed: never persist an artifact that would carry a secret/PAN.
    serialized = `${JSON.stringify({ error: "artifact_withheld_leak_detected", kind: leak })}\n`;
  }
  writeFileSync(path.join(EVIDENCE_DIR, fileName), serialized, "utf8");
}

function cell(value: Scalar | undefined): string {
  if (value === undefined || value === null) return "—";
  return String(value).replace(/\|/g, "\\|");
}

export function renderSummaryMarkdown(evidence: SandboxEvidence): string {
  const lines: string[] = [];
  lines.push("# PAX-PSP-SANDBOX-EVIDENCE-20261101 — ECPay Stage evidence");
  lines.push("");
  lines.push(`- candidate SHA: \`${evidence.candidateSha}\``);
  lines.push(`- run: ${evidence.runUrl ?? "(local)"}`);
  lines.push(
    `- started: ${evidence.startedAt} / finished: ${evidence.finishedAt ?? "—"}`,
  );
  lines.push(
    `- acceptance satisfied: **${cell(evidence.acceptance.satisfied)}**`,
  );
  lines.push("");
  lines.push("## Steps");
  lines.push("");
  lines.push("| step | status | finished | outcome | error |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const step of evidence.steps) {
    const outcome = Object.entries(step.outcome)
      .map(([key, value]) => `${key}=${cell(value)}`)
      .join("<br>");
    lines.push(
      `| ${step.name} | ${step.status} | ${cell(step.finishedAt)} | ${outcome || "—"} | ${cell(step.error)} |`,
    );
  }
  lines.push("");
  lines.push("## ECPay calls (via merged EcpayPaymentProvider)");
  lines.push("");
  lines.push(
    "| time | step | endpoint | HTTP | TransCode | RtnCode | RtnMsg | masked fields |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const call of evidence.calls) {
    const fields = Object.entries(call.fields)
      .map(([key, value]) => `${key}=${cell(value)}`)
      .join("<br>");
    lines.push(
      `| ${call.startedAt} | ${call.step} | \`${call.host}${call.endpoint}\` | ${cell(call.httpStatus)} | ${cell(call.transCode)} | ${cell(call.rtnCode)} | ${cell(call.rtnMsg ?? call.error)} | ${fields || "—"} |`,
    );
  }
  lines.push("");
  lines.push("## Refund (per PAX-PSP-ADAPTER-20261009 refund rule)");
  lines.push("");
  for (const [key, value] of Object.entries(evidence.refund))
    lines.push(`- ${key}: ${cell(value)}`);
  lines.push("");
  lines.push("## Acceptance");
  lines.push("");
  for (const [key, value] of Object.entries(evidence.acceptance))
    lines.push(`- ${key}: ${cell(value)}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function writeEvidence(
  redactor: Redactor,
  evidence: SandboxEvidence,
): void {
  writeJsonArtifact(redactor, "evidence.json", evidence);
  let summary = renderSummaryMarkdown(evidence);
  if (redactor.findLeak(summary)) {
    summary = "# Evidence summary withheld: leak detected by final scan.\n";
  }
  writeFileSync(path.join(EVIDENCE_DIR, "summary.md"), summary, "utf8");
}
