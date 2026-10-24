import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyTwilioError,
  createSmsPortFromEnv,
  formatTaiwanOtpBody,
  isValidTwilioSender,
  maskTaiwanPhone,
  parseTwilioDeliveryReport,
  TwilioSmsAdapter,
  twilioSmsConfigFromEnv,
  UnconfiguredSmsPort,
  type TwilioHttpTransport,
} from "../../../apps/api/src/modules/passenger-app/otp/sms.port";

const root = path.resolve(__dirname, "../../..");
const deployWorkflow = readFileSync(
  path.join(root, ".github/workflows/deploy-dev.yml"),
  "utf8",
);

const VALID_ACCOUNT_SID = "AC" + "a1b2c3d4".repeat(4);
const VALID_API_KEY_SID = "SK" + "e5f60718".repeat(4);
const VALID_API_KEY_SECRET = "TwilioUnitSecretValue1234567890abcd";
const VALID_PEPPER = "p".repeat(64);
const VALID_E164_FROM = "+15551234567";
const VALID_ALPHANUMERIC_FROM = "SmartTaxi";
const TEST_RECIPIENT = "+886912345678";
const TEST_MESSAGE_SID = "SM" + "9a8b7c6d".repeat(4);
const FIXED_NOW = Date.parse("2026-10-24T14:00:00.000Z");
const FIXED_EXPIRES_AT = new Date(FIXED_NOW + 300_000).toISOString();

const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function extractWorkflowStep(source: string, stepName: string): string {
  const start = source.indexOf(`      - name: ${stepName}\n`);
  if (start < 0) throw new Error(`Missing workflow step: ${stepName}`);
  const end = source.indexOf("\n      - ", start + 1);
  const block = source.slice(start, end < 0 ? undefined : end);
  const runIdx = block.indexOf("        run: |\n");
  if (runIdx < 0) throw new Error(`Missing run block: ${stepName}`);
  return block
    .slice(runIdx + "        run: |\n".length)
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n")
    .split(/\n(?= {2}[a-z][a-z-]+:)/)[0]!;
}

function resolveDeploySmsMounts(availableSecretNames: readonly string[]) {
  const dir = mkdtempSync(path.join(tmpdir(), "pax-sms-deploy-"));
  tempDirs.push(dir);
  const logFile = path.join(dir, "gcloud.log");
  const outFile = path.join(dir, "github.out");
  writeFileSync(logFile, "");
  writeFileSync(outFile, "");
  const gcloudPath = path.join(dir, "gcloud");
  writeFileSync(
    gcloudPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$COMMAND_LOG"
[[ "$1 $2" == 'secrets describe' ]] || exit 90
[[ "$4 $5" == '--project drts-dev-devcc-20260825' ]] || exit 91
[[ ",$AVAILABLE_SECRETS," == *",$3,"* ]]
`,
  );
  chmodSync(gcloudPath, 0o755);

  const script = extractWorkflowStep(
    deployWorkflow,
    "Resolve passenger app optional secret mounts",
  );
  const res = spawnSync("bash", ["-c", script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ""}`,
      GITHUB_OUTPUT: outFile,
      SECRET_PREFIX: "drts-dev",
      PROJECT_ID: "drts-dev-devcc-20260825",
      COMMAND_LOG: logFile,
      AVAILABLE_SECRETS: availableSecretNames.join(","),
    },
  });
  const outputs = Object.fromEntries(
    readFileSync(outFile, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1)];
      }),
  );
  const commands = readFileSync(logFile, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);
  return { ...res, outputs, commands };
}

describe("Twilio SmsPort adapter and Taiwan SMS rules", () => {
  it("formats Taiwan OTP SMS with required [智行叫車] brand prefix, minute window, and no URLs", () => {
    const body = formatTaiwanOtpBody("048291", FIXED_EXPIRES_AT, FIXED_NOW);
    expect(body).toBe(
      "[智行叫車] 您的驗證碼是 048291，5 分鐘內有效。請勿提供給他人。",
    );
    expect(body).not.toMatch(/https?:\/\/|www\./i);
    expect(body).not.toContain("由智行叫車寄出");

    expect(() =>
      formatTaiwanOtpBody("12345", FIXED_EXPIRES_AT, FIXED_NOW),
    ).toThrow("invalid_otp_code_format");
    expect(() =>
      formatTaiwanOtpBody(
        "123456",
        new Date(FIXED_NOW).toISOString(),
        FIXED_NOW,
      ),
    ).toThrow("expired_or_invalid_otp_window");
  });

  it("masks Taiwan and international phone numbers without exposing middle digits", () => {
    expect(maskTaiwanPhone("+886912345678")).toBe("+886 912-***-678");
    expect(maskTaiwanPhone("+15551234567")).toBe("+155-***-567");
    expect(maskTaiwanPhone("invalid")).toBe("***");
  });

  it("accepts both E.164 phone numbers and 1-11 char alphanumeric sender IDs for From", () => {
    expect(isValidTwilioSender("+15551234567")).toBe(true);
    expect(isValidTwilioSender("+886912345678")).toBe(true);
    expect(isValidTwilioSender("SmartTaxi")).toBe(true);
    expect(isValidTwilioSender("DRTS 1")).toBe(true);
    expect(isValidTwilioSender("A")).toBe(true);
    expect(isValidTwilioSender("SmartTaxi11")).toBe(true);

    expect(isValidTwilioSender("")).toBe(false);
    expect(isValidTwilioSender("SmartTaxi123")).toBe(false);
    expect(isValidTwilioSender("12345678")).toBe(false);
    expect(isValidTwilioSender("智行叫車")).toBe(false);
  });

  it("enforces all-or-nothing Twilio configuration and ignores legacy SMS_PROVIDER_* or TWILIO_AUTH_TOKEN", () => {
    const fullEnv: NodeJS.ProcessEnv = {
      TWILIO_ACCOUNT_SID: VALID_ACCOUNT_SID,
      TWILIO_API_KEY_SID: VALID_API_KEY_SID,
      TWILIO_API_KEY_SECRET: VALID_API_KEY_SECRET,
      TWILIO_FROM_NUMBER: VALID_ALPHANUMERIC_FROM,
      PASSENGER_OTP_PEPPER: VALID_PEPPER,
    };
    const config = twilioSmsConfigFromEnv(fullEnv);
    expect(config).toEqual({
      accountSid: VALID_ACCOUNT_SID,
      apiKeySid: VALID_API_KEY_SID,
      apiKeySecret: VALID_API_KEY_SECRET,
      from: VALID_ALPHANUMERIC_FROM,
      baseUrl: "https://api.twilio.com",
      timeoutMs: 10_000,
    });

    for (const key of [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_API_KEY_SID",
      "TWILIO_API_KEY_SECRET",
      "TWILIO_FROM_NUMBER",
    ] as const) {
      const partial = { ...fullEnv, [key]: "" };
      expect(twilioSmsConfigFromEnv(partial)).toBeNull();
      const port = createSmsPortFromEnv(partial);
      expect(port.availability()).toBe("not_configured");
    }

    // Legacy SMS_PROVIDER_* and admin-only TWILIO_AUTH_TOKEN must never activate the adapter
    const legacyOrAuthTokenEnv: NodeJS.ProcessEnv = {
      SMS_PROVIDER_API_KEY: "legacy-key",
      SMS_PROVIDER_SENDER_ID: "legacy-sender",
      TWILIO_ACCOUNT_SID: VALID_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: "a".repeat(32),
      TWILIO_FROM_NUMBER: VALID_E164_FROM,
    };
    expect(twilioSmsConfigFromEnv(legacyOrAuthTokenEnv)).toBeNull();
    expect(new UnconfiguredSmsPort(legacyOrAuthTokenEnv).availability()).toBe(
      "not_configured",
    );
  });

  it("sends POST to Twilio Messages.json with Basic API Key auth and URL-encoded form parameters", async () => {
    const calls: Array<{
      url: string;
      headers: Record<string, string>;
      body: string;
    }> = [];
    const transport: TwilioHttpTransport = vi.fn(async (url, init) => {
      calls.push({ url, headers: init.headers, body: init.body });
      return {
        status: 201,
        text: async () =>
          JSON.stringify({
            sid: TEST_MESSAGE_SID,
            status: "queued",
            error_code: null,
          }),
      };
    });

    const adapter = createSmsPortFromEnv(
      {
        TWILIO_ACCOUNT_SID: VALID_ACCOUNT_SID,
        TWILIO_API_KEY_SID: VALID_API_KEY_SID,
        TWILIO_API_KEY_SECRET: VALID_API_KEY_SECRET,
        TWILIO_FROM_NUMBER: VALID_E164_FROM,
        TWILIO_STATUS_CALLBACK_URL:
          "https://ride.smarttransport.tw/api/passenger-app/webhooks/twilio-status",
      },
      transport,
      () => FIXED_NOW,
    );

    expect(adapter.availability()).toBe("available");
    const result = await adapter.sendOtp(
      TEST_RECIPIENT,
      "654321",
      FIXED_EXPIRES_AT,
    );
    expect(result).toEqual({
      status: "sent",
      provider: "twilio",
      messageSid: TEST_MESSAGE_SID,
      deliveryStatus: "queued",
      httpStatus: 201,
      maskedTarget: "+886 912-***-678",
    });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${VALID_ACCOUNT_SID}/Messages.json`,
    );
    const expectedBasic = Buffer.from(
      `${VALID_API_KEY_SID}:${VALID_API_KEY_SECRET}`,
      "utf8",
    ).toString("base64");
    expect(call!.headers.Authorization).toBe(`Basic ${expectedBasic}`);
    expect(call!.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded;charset=UTF-8",
    );

    const form = new URLSearchParams(call!.body);
    expect(form.get("To")).toBe(TEST_RECIPIENT);
    expect(form.get("From")).toBe(VALID_E164_FROM);
    expect(form.get("Body")).toBe(
      "[智行叫車] 您的驗證碼是 654321，5 分鐘內有效。請勿提供給他人。",
    );
    expect(form.get("StatusCallback")).toBe(
      "https://ride.smarttransport.tw/api/passenger-app/webhooks/twilio-status",
    );
  });

  it.each([
    {
      name: "HTTP 429 rate limit",
      httpStatus: 429,
      payload: { code: 20429, message: "Too Many Requests" },
      expectedCategory: "temporary_failure",
      expectedCode: 20429,
    },
    {
      name: "HTTP 503 service unavailable",
      httpStatus: 503,
      payload: { message: "Service Unavailable" },
      expectedCategory: "temporary_failure",
      expectedCode: undefined,
    },
    {
      name: "Twilio 21211 invalid To phone number",
      httpStatus: 400,
      payload: { code: 21211, message: "Invalid 'To' Phone Number" },
      expectedCategory: "invalid_number",
      expectedCode: 21211,
    },
    {
      name: "Twilio 21614 not a valid mobile number",
      httpStatus: 400,
      payload: { code: 21614, message: "'To' number is not a valid mobile number" },
      expectedCategory: "invalid_number",
      expectedCode: 21614,
    },
    {
      name: "Twilio 20003 authentication / KYC permission error",
      httpStatus: 401,
      payload: { code: 20003, message: "Authenticate" },
      expectedCategory: "credential_error",
      expectedCode: 20003,
    },
  ] as const)(
    "classifies $name as $expectedCategory without leaking OTP or credentials",
    async ({ httpStatus, payload, expectedCategory, expectedCode }) => {
      const adapter = createSmsPortFromEnv(
        {
          TWILIO_ACCOUNT_SID: VALID_ACCOUNT_SID,
          TWILIO_API_KEY_SID: VALID_API_KEY_SID,
          TWILIO_API_KEY_SECRET: VALID_API_KEY_SECRET,
          TWILIO_FROM_NUMBER: VALID_ALPHANUMERIC_FROM,
        },
        async () => ({
          status: httpStatus,
          text: async () => JSON.stringify(payload),
        }),
        () => FIXED_NOW,
      );

      const res = await adapter.sendOtp(
        TEST_RECIPIENT,
        "987654",
        FIXED_EXPIRES_AT,
      );
      expect(res).toEqual({
        status: "failed",
        provider: "twilio",
        failureCategory: expectedCategory,
        ...(expectedCode !== undefined
          ? { providerErrorCode: expectedCode }
          : {}),
        httpStatus,
        maskedTarget: "+886 912-***-678",
      });
      expect(JSON.stringify(res)).not.toContain("987654");
      expect(JSON.stringify(res)).not.toContain( TEST_RECIPIENT );
      expect(JSON.stringify(res)).not.toContain(VALID_API_KEY_SECRET);
    },
  );

  it("aborts timed-out requests and classifies timeout/network errors as temporary_failure", async () => {
    let observedAbort = false;
    const slowTransport: TwilioHttpTransport = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          observedAbort = true;
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });

    const config = twilioSmsConfigFromEnv({
      TWILIO_ACCOUNT_SID: VALID_ACCOUNT_SID,
      TWILIO_API_KEY_SID: VALID_API_KEY_SID,
      TWILIO_API_KEY_SECRET: VALID_API_KEY_SECRET,
      TWILIO_FROM_NUMBER: VALID_E164_FROM,
    })!;
    const adapter = new TwilioSmsAdapter(
      { ...config, timeoutMs: 25 },
      slowTransport,
      () => FIXED_NOW,
    );

    const res = await adapter.sendOtp(
      TEST_RECIPIENT,
      "112233",
      FIXED_EXPIRES_AT,
    );
    expect(observedAbort).toBe(true);
    expect(res).toEqual({
      status: "failed",
      provider: "twilio",
      failureCategory: "temporary_failure",
      maskedTarget: "+886 912-***-678",
    });
  });

  it("parses Twilio delivery status callbacks with masked phone numbers and classified error codes", () => {
    const delivered = parseTwilioDeliveryReport({
      MessageSid: TEST_MESSAGE_SID,
      MessageStatus: "delivered",
      To: TEST_RECIPIENT,
    });
    expect(delivered).toEqual({
      provider: "twilio",
      messageSid: TEST_MESSAGE_SID,
      deliveryStatus: "delivered",
      terminal: true,
      delivered: true,
      maskedTarget: "+886 912-***-678",
      providerErrorCode: null,
      failureCategory: null,
    });

    const undelivered = parseTwilioDeliveryReport({
      MessageSid: TEST_MESSAGE_SID,
      MessageStatus: "undelivered",
      To: TEST_RECIPIENT,
      ErrorCode: "21614",
    });
    expect(undelivered).toEqual({
      provider: "twilio",
      messageSid: TEST_MESSAGE_SID,
      deliveryStatus: "undelivered",
      terminal: true,
      delivered: false,
      maskedTarget: "+886 912-***-678",
      providerErrorCode: 21614,
      failureCategory: "invalid_number",
    });

    expect(classifyTwilioError(400, 21211)).toBe("invalid_number");
    expect(classifyTwilioError(400, 21614)).toBe("invalid_number");
    expect(classifyTwilioError(401, 20003)).toBe("credential_error");
    expect(classifyTwilioError(429, 20429)).toBe("temporary_failure");
    expect(classifyTwilioError(502, null)).toBe("temporary_failure");
  });
});

describe("deploy-dev.yml Twilio SMS secret group all-or-nothing contract", () => {
  const twilioSecretNames = [
    "drts-dev-twilio-account-sid",
    "drts-dev-twilio-api-key-sid",
    "drts-dev-twilio-api-key-secret",
    "drts-dev-twilio-from-number",
    "drts-dev-passenger-otp-pepper",
  ] as const;

  it("mounts all 5 Twilio SMS secrets on API when complete and deduplicates PASSENGER_OTP_PEPPER", () => {
    const res = resolveDeploySmsMounts(twilioSecretNames);
    expect(res.status, res.stderr).toBe(0);
    expect(res.outputs.sms_mounts_complete).toBe("true");
    expect(res.outputs.otp_mounts_complete).toBe("true");
    expect(res.outputs.api).toContain(
      "TWILIO_ACCOUNT_SID=drts-dev-twilio-account-sid:latest",
    );
    expect(res.outputs.api).toContain(
      "TWILIO_API_KEY_SID=drts-dev-twilio-api-key-sid:latest",
    );
    expect(res.outputs.api).toContain(
      "TWILIO_API_KEY_SECRET=drts-dev-twilio-api-key-secret:latest",
    );
    expect(res.outputs.api).toContain(
      "TWILIO_FROM_NUMBER=drts-dev-twilio-from-number:latest",
    );
    expect(res.outputs.api?.match(/PASSENGER_OTP_PEPPER=/g)).toHaveLength(1);
    expect(res.outputs.api).not.toContain("SMS_PROVIDER_");
    expect(res.outputs.api).not.toContain("TWILIO_AUTH_TOKEN");
    expect(res.commands.join("\n")).not.toContain("twilio-auth-token");
    expect(res.commands.join("\n")).not.toContain("sms-provider-");
  });

  it("leaves SMS unmounted when drts-dev-twilio-from-number is absent (pre-KYC state) while keeping email OTP pepper mounted", () => {
    const preKycSecrets = twilioSecretNames.filter(
      (name) => name !== "drts-dev-twilio-from-number",
    );
    const res = resolveDeploySmsMounts(preKycSecrets);
    expect(res.status, res.stderr).toBe(0);
    expect(res.outputs.sms_mounts_complete).toBe("false");
    expect(res.outputs.otp_mounts_complete).toBe("true");
    expect(res.outputs.api).toBe(
      "PASSENGER_OTP_PEPPER=drts-dev-passenger-otp-pepper:latest",
    );
    expect(res.outputs.api).not.toContain("TWILIO_");
  });
});
