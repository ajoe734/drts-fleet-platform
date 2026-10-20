import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002 R2 (F1, F4): execute the
// actual "Verify referral handoff session lifecycle" run block from
// deploy-dev.yml, substituting only the GitHub Actions `${{ ... }}`
// expressions and `curl`'s transport with deterministic fixtures shaped like
// the real API's responses (issuance is a bare `@Post` with no `@HttpCode`
// override, so NestJS returns 201, not 200). No server/network is used; the
// workflow's own branch logic, jq filters, and status assertions run
// unmodified. This is what caught F4 (the workflow expected 200 and would
// reject every real successful issuance) and locks in F1's pre/post-rollout
// branching.
const workflow = readFileSync(
  resolve(".github/workflows/deploy-dev.yml"),
  "utf8",
);
const stepStart = workflow.indexOf(
  "- name: Verify referral handoff session lifecycle",
);
const runMarker = "run: |\n";
const runStart = workflow.indexOf(runMarker, stepStart) + runMarker.length;
const stepEnd = workflow.indexOf("      - name: Print dev URLs", stepStart);
const block = workflow
  .slice(runStart, stepEnd)
  .replaceAll("${{ steps.urls.outputs.api }}", "$API_URL")
  .replaceAll("${{ steps.urls.outputs.referral_embed }}", "$REFERRAL_EMBED_URL")
  .replaceAll(
    "${{ needs.prepare.outputs.referral_embed_entry_slug }}",
    "$ENTRY_SLUG",
  );

const CURL_FIXTURE = `
curl() {
  local args=("$@")
  local n=\${#args[@]}
  local url="\${args[$((n-1))]}"
  local output_file="" dump_header_file="" has_stdin_data=""
  for ((i=0; i<n; i++)); do
    if [[ "\${args[$i]}" == "--output" ]]; then output_file="\${args[$((i+1))]}"; fi
    if [[ "\${args[$i]}" == "--dump-header" ]]; then dump_header_file="\${args[$((i+1))]}"; fi
    if [[ "\${args[$i]}" == "--data" && "\${args[$((i+1))]:-}" == "@-" ]]; then has_stdin_data="true"; fi
  done
  # The real curl reads --data @- from stdin; the production workflow pipes
  # it from a preceding \`jq -nc | curl ...\` under set -euo pipefail. If this
  # fake curl never reads stdin, it can return before jq finishes writing,
  # giving jq SIGPIPE (141) and failing the pipeline (F5).
  if [[ "$has_stdin_data" == "true" ]]; then
    cat >/dev/null
  fi
  echo "$url" >> "$CALL_LOG"
  case "$url" in
    */api/partner/entries/*)
      echo '{"data":{"entryHost":"entry.example.test"}}'
      ;;
    */api/partner/ingress/referral-embed-handoff)
      local issue_count
      issue_count=$(( $(cat "$ISSUE_COUNTER" 2>/dev/null || echo 0) + 1 ))
      echo "$issue_count" > "$ISSUE_COUNTER"
      if [[ "$FIXTURE_ROLLOUT_APPLIED" != "true" ]]; then
        printf '{"error":{"code":"%s","message":"denied"}}' "$FIXTURE_PENDING_CODE" > "$output_file"
        echo "403"
      elif [[ "$issue_count" == "1" ]]; then
        printf '{"data":{"artifact":"probe-artifact-main"}}' > "$output_file"
        echo "201"
      else
        printf '{"data":{"artifact":"probe-artifact-cross-host"}}' > "$output_file"
        echo "201"
      fi
      ;;
    */api/referral/session)
      local exch_count
      exch_count=$(( $(cat "$EXCH_COUNTER" 2>/dev/null || echo 0) + 1 ))
      echo "$exch_count" > "$EXCH_COUNTER"
      case "$exch_count" in
        1)
          printf '{"ok":%s}' "$FIXTURE_CONSUME_OK" > "$output_file"
          if [[ "$FIXTURE_SIGNED_COOKIE" == "true" ]]; then
            printf 'HTTP/1.1 200 OK\\r\\nSet-Cookie: drts_referral_embed_session=abc\\r\\n\\r\\n' > "$dump_header_file"
          else
            printf 'HTTP/1.1 200 OK\\r\\n\\r\\n' > "$dump_header_file"
          fi
          echo "200"
          ;;
        2)
          printf '{"ok":false,"code":"%s","message":"The referral handoff artifact has already been consumed."}' "$FIXTURE_REPLAY_CODE" > "$output_file"
          printf 'HTTP/1.1 409 Conflict\\r\\n\\r\\n' > "$dump_header_file"
          echo "$FIXTURE_REPLAY_STATUS"
          ;;
        *)
          printf '{"ok":false,"code":"%s","message":"The referral handoff artifact is not valid for this entry host."}' "$FIXTURE_HOST_CODE" > "$output_file"
          printf 'HTTP/1.1 403 Forbidden\\r\\n\\r\\n' > "$dump_header_file"
          echo "$FIXTURE_HOST_STATUS"
          ;;
      esac
      ;;
    *)
      echo "UNEXPECTED_CURL_URL: $url" >&2
      exit 99
      ;;
  esac
}
`;

// F5 regression: delays jq's JSON-building invocation (`jq -nc`) so that, if
// the fake curl() below it does not drain --data @- from stdin before
// returning, jq is still writing when the pipe's read end is gone and gets
// SIGPIPE (141) under set -euo pipefail. The pass-through to the real jq
// keeps the workflow's own filters (`.data.artifact`, etc.) exercised
// unmodified.
const SLOW_JQ_PRODUCER = `
jq() {
  if [[ "$1" == "-nc" ]]; then sleep 0.05; fi
  command jq "$@"
}
`;

type FixtureOptions = {
  slowJq?: boolean;
  replayStatus?: string;
  replayCode?: string;
  wrongHostStatus?: string;
  wrongHostCode?: string;
  pendingCode?: string;
  consumeOk?: boolean;
  signedCookie?: boolean;
};

function runBlock(
  rolloutApplied: "true" | "false",
  options: FixtureOptions = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "deploy-dev-referral-"));
  try {
    const result = spawnSync(
      "bash",
      [
        "-c",
        `
        set -euo pipefail
        API_URL=https://api.example.test
        REFERRAL_EMBED_URL=https://referral-embed.example.test
        ENTRY_SLUG=probe-entry
        CALL_LOG="$DIRECTORY/calls.log"
        ISSUE_COUNTER="$DIRECTORY/issue-count"
        EXCH_COUNTER="$DIRECTORY/exch-count"
        FIXTURE_ROLLOUT_APPLIED="$ROLLOUT_APPLIED"
        ${CURL_FIXTURE}
        ${options.slowJq ? SLOW_JQ_PRODUCER : ""}
        ${block}
      `,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DIRECTORY: directory,
          ROLLOUT_APPLIED: rolloutApplied,
          REFERRAL_HANDOFF_ID_TOKEN: "test-id-token",
          GITHUB_RUN_ID: "123",
          GITHUB_RUN_ATTEMPT: "1",
          FIXTURE_REPLAY_STATUS: options.replayStatus ?? "409",
          FIXTURE_REPLAY_CODE:
            options.replayCode ?? "REFERRAL_HANDOFF_REPLAYED",
          FIXTURE_HOST_STATUS: options.wrongHostStatus ?? "403",
          FIXTURE_HOST_CODE:
            options.wrongHostCode ?? "REFERRAL_HANDOFF_HOST_MISMATCH",
          FIXTURE_PENDING_CODE:
            options.pendingCode ?? "WORKLOAD_ROUTE_SCOPE_DENIED",
          FIXTURE_CONSUME_OK: String(options.consumeOk ?? true),
          FIXTURE_SIGNED_COOKIE: String(options.signedCookie ?? true),
        },
      },
    );
    const callLogPath = join(directory, "calls.log");
    let calls: string[] = [];
    try {
      calls = readFileSync(callLogPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean);
    } catch {
      calls = [];
    }
    return { result, calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("deploy-dev referral handoff session lifecycle smoke test", () => {
  it("accepts the real HTTP 201 issuance status and completes the full issue/consume/replay/cross-host lifecycle once the registry rollout has landed", () => {
    const { result, calls } = runBlock("true");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(
      calls.filter((u) =>
        u.endsWith("/api/partner/ingress/referral-embed-handoff"),
      ).length,
    ).toBe(2);
    expect(
      calls.filter((u) => u.endsWith("/api/referral/session")).length,
    ).toBe(3);
  });

  it("still makes the real issuance call and asserts the documented fail-closed 403 before the registry rollout, without touching the consume/exchange routes", () => {
    const { result, calls } = runBlock("false");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "referral embed handoff WIF registry rollout",
    );
    expect(
      calls.some((u) =>
        u.endsWith("/api/partner/ingress/referral-embed-handoff"),
      ),
    ).toBe(true);
    expect(calls.some((u) => u.endsWith("/api/referral/session"))).toBe(false);
  });

  // F5 regression (SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002 R5):
  // the real workflow pipes `jq -nc ... | curl ... --data @-` under
  // set -euo pipefail. With SLOW_JQ_PRODUCER delaying jq, these runs
  // deterministically reproduce the SIGPIPE race if curl() does not drain
  // stdin before returning; they must stay green across repeats.
  it("does not race a slow jq producer into SIGPIPE on the post-rollout lifecycle", () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { result } = runBlock("true", { slowJq: true });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    }
  });

  it("does not race a slow jq producer into SIGPIPE on the pre-rollout fail-closed check", () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { result } = runBlock("false", { slowJq: true });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    }
  });

  it("fails closed if issuance ever returns something other than the real 201 success status", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "deploy-dev-referral-regression-"),
    );
    try {
      const result = spawnSync(
        "bash",
        [
          "-c",
          `
          set -euo pipefail
          API_URL=https://api.example.test
          REFERRAL_EMBED_URL=https://referral-embed.example.test
          ENTRY_SLUG=probe-entry
          CALL_LOG="$DIRECTORY/calls.log"
          ISSUE_COUNTER="$DIRECTORY/issue-count"
          EXCH_COUNTER="$DIRECTORY/exch-count"
          curl() {
            local args=("$@")
            local n=\${#args[@]}
            local url="\${args[$((n-1))]}"
            local output_file="" has_stdin_data=""
            for ((i=0; i<n; i++)); do
              if [[ "\${args[$i]}" == "--output" ]]; then output_file="\${args[$((i+1))]}"; fi
              if [[ "\${args[$i]}" == "--data" && "\${args[$((i+1))]:-}" == "@-" ]]; then has_stdin_data="true"; fi
            done
            if [[ "$has_stdin_data" == "true" ]]; then
              cat >/dev/null
            fi
            case "$url" in
              */api/partner/entries/*) echo '{"data":{"entryHost":"entry.example.test"}}' ;;
              */api/partner/ingress/referral-embed-handoff)
                printf '{"data":{"artifact":"probe-artifact"}}' > "$output_file"
                echo "200"
                ;;
              *) echo "UNEXPECTED_CURL_URL: $url" >&2; exit 99 ;;
            esac
          }
          ROLLOUT_APPLIED=true
          ${block}
        `,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            DIRECTORY: directory,
            REFERRAL_HANDOFF_ID_TOKEN: "test-id-token",
            GITHUB_RUN_ID: "123",
            GITHUB_RUN_ATTEMPT: "1",
          },
        },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("returned HTTP 200");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["replay status", { replayStatus: "400" }, "replay", "400"],
    [
      "replay code",
      { replayCode: "REFERRAL_HANDOFF_HOST_MISMATCH" },
      "replay",
      "409",
    ],
    ["host status", { wrongHostStatus: "400" }, "wrong-host", "400"],
    [
      "host code",
      { wrongHostCode: "REFERRAL_HANDOFF_REPLAYED" },
      "wrong-host",
      "403",
    ],
  ] satisfies [string, FixtureOptions, string, string][])(
    "rejects a wrong canonical %s at the actual branch",
    (_name, options, phase, status) => {
      const { result, calls } = runBlock("true", options);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`phase=${phase}`);
      expect(result.stderr).toContain(`HTTP ${status}`);
      expect(
        calls.filter((u) => u.endsWith("/api/referral/session")),
      ).toHaveLength(phase === "replay" ? 2 : 3);
    },
  );

  it("does not print unknown response codes, artifacts, cookies or tokens in failure diagnostics", () => {
    const { result } = runBlock("true", {
      replayCode: "secret-error-code-canary",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("phase=replay");
    expect(result.stderr).toContain("code=unavailable");
    for (const secret of [
      "secret-error-code-canary",
      "probe-artifact",
      "drts_referral_embed_session=abc",
      "test-id-token",
    ])
      expect(result.stderr).not.toContain(secret);
  });

  it.each([
    [{ consumeOk: false }, "consume-payload"],
    [{ signedCookie: false }, "consume-cookie"],
  ] satisfies [FixtureOptions, string][])(
    "retains the positive %j guard with safe diagnostics",
    (options, phase) => {
      const { result, calls } = runBlock("true", options);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`phase=${phase}`);
      expect(result.stderr).toContain("HTTP 200");
      expect(
        calls.filter((u) => u.endsWith("/api/referral/session")),
      ).toHaveLength(1);
    },
  );

  it("rejects a different pending-rollout denial without printing its response code", () => {
    const { result, calls } = runBlock("false", {
      pendingCode: "secret-denial-canary",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("phase=pending-rollout");
    expect(result.stderr).not.toContain("secret-denial-canary");
    expect(calls.some((u) => u.endsWith("/api/referral/session"))).toBe(false);
  });
});
