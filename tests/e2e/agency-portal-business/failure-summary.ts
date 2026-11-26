// Prints why the four-portal password journey failed, without the
// credentials its raw log holds. The CI step keeps the raw Playwright log in
// $RUNNER_TEMP because it contains disposable passwords, invitation and
// reset links; this reads that log and the JSON report and prints only
// redacted error headlines and web-server/browser crash lines.
//
// Run through failure-summary-cli.ts. Self-contained on purpose: it must not
// pull in the journey's TOTP/auth dependencies just to print an error.
import { readFileSync } from "node:fs";

// Terminal colour codes (ESC [ … m) in the Playwright list reporter output.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
// Same shapes as redactStringSecrets in totp-authenticator-fixture.ts.
const TOKEN_QUERY = /([?&]token=)[^&\s"']+/gi;
const OTPAUTH_URI = /otpauth:\/\/totp\/[^\s"']+/gi;
const PREFIXED_TOKEN = /\b(?:ai|ti|fi|prt|pwr|inv)_[A-Za-z0-9_-]{12,}\b/g;
const JWT =
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const RECOVERY_CODE = /\b[A-Z2-9]{4}-[A-Z2-9]{4}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// The journey's disposable passwords, e.g. AgencyInit!1a2b3c4d#2026Valid.
const JOURNEY_PASSWORD = /\b[A-Za-z]+(?:Init|Reset)![^\s"'`#]*#2026[A-Za-z]*/g;
const URL_QUERY = /(https?:\/\/[^\s"'`?#]+)[?#][^\s"'`]*/g;
// Long opaque values (tokens, ids) mix letters and digits; plain hyphenated
// words such as spec file names do not.
const OPAQUE =
  /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g;
const MAX_LINE = 220;
const MAX_LOG_LINES = 20;

// Lines in the raw log that say a server or the browser went away.
const CRASH_LINE =
  /heap limit|out of memory|allocation failed|\bKilled\b|SIGKILL|SIGTERM|exited with code|EADDRINUSE|ECONNREFUSED|ECONNRESET|net::ERR_[A-Z_]+|Test timeout of \d+ms exceeded|has been closed|Timed out waiting/i;

export function sanitizeLine(input: string): string {
  const line = input
    .replace(ANSI, "")
    .replace(TOKEN_QUERY, "$1[REDACTED_TOKEN]")
    .replace(OTPAUTH_URI, "otpauth://totp/[REDACTED]")
    .replace(PREFIXED_TOKEN, "[REDACTED_TOKEN]")
    .replace(JWT, "[REDACTED_JWT]")
    .replace(RECOVERY_CODE, "[REDACTED_CODE]")
    .replace(JOURNEY_PASSWORD, "[REDACTED_PASSWORD]")
    .replace(EMAIL, "[REDACTED_EMAIL]")
    .replace(URL_QUERY, "$1?[REDACTED]")
    .replace(OPAQUE, "[REDACTED]")
    .trim();
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line;
}

interface ReportError {
  message?: string;
  location?: { file?: string; line?: number; column?: number };
}
interface ReportResult {
  status?: string;
  duration?: number;
  errors?: ReportError[];
  error?: ReportError;
}
interface ReportSuite {
  title?: string;
  specs?: { title?: string; tests?: { results?: ReportResult[] }[] }[];
  suites?: ReportSuite[];
}

export function summarizeReport(report: {
  suites?: ReportSuite[];
  errors?: ReportError[];
}): string[] {
  const out: string[] = [];
  const describe = (error: ReportError) => {
    const headline = (error.message ?? "").replace(ANSI, "").split("\n")[0];
    const where = error.location
      ? ` @ ${String(error.location.file ?? "")
          .split("/")
          .pop()}:${error.location.line}`
      : "";
    return sanitizeLine(`${headline}${where}`);
  };
  const walk = (suites: ReportSuite[] = []) => {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          for (const result of test.results ?? []) {
            if (result.status === "passed" || result.status === "skipped") {
              continue;
            }
            out.push(
              `result: ${result.status} after ${Math.round((result.duration ?? 0) / 1000)}s`,
            );
            const errors = result.errors?.length
              ? result.errors
              : result.error
                ? [result.error]
                : [];
            for (const error of errors) out.push(`error: ${describe(error)}`);
          }
        }
      }
      walk(suite.suites);
    }
  };
  walk(report.suites);
  for (const error of report.errors ?? []) {
    out.push(`run error: ${describe(error)}`);
  }
  return out;
}

export function summarizeLog(log: string): string[] {
  const seen = new Set<string>();
  for (const raw of log.split("\n")) {
    if (!CRASH_LINE.test(raw)) continue;
    seen.add(sanitizeLine(raw));
    if (seen.size >= MAX_LOG_LINES) break;
  }
  return [...seen].map((line) => `log: ${line}`);
}

function readOrNull(path: string | undefined): string | null {
  if (!path) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export function main(argv: string[]): string {
  const [reportPath, logPath] = argv;
  const report = readOrNull(reportPath);
  const log = readOrNull(logPath);
  const lines: string[] = [];
  if (report) {
    try {
      lines.push(...summarizeReport(JSON.parse(report)));
    } catch {
      lines.push("report: not valid JSON");
    }
  } else {
    lines.push("report: missing");
  }
  lines.push(...(log ? summarizeLog(log) : ["log: missing"]));
  return `${lines.join("\n")}\n`;
}
