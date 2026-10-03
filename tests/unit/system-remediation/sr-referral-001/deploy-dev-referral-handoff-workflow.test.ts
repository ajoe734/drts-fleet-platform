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
const workflow = readFileSync(resolve(".github/workflows/deploy-dev.yml"), "utf8");
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
        printf '{"error":{"code":"WORKLOAD_ROUTE_SCOPE_DENIED","message":"denied"}}' > "$output_file"
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
          printf '{"ok":true}' > "$output_file"
          printf 'HTTP/1.1 200 OK\\r\\nSet-Cookie: drts_referral_embed_session=abc\\r\\n\\r\\n' > "$dump_header_file"
          echo "200"
          ;;
        2)
          printf '{"ok":false,"message":"The referral handoff artifact has already been consumed."}' > "$output_file"
          printf 'HTTP/1.1 400 Bad Request\\r\\n\\r\\n' > "$dump_header_file"
          echo "400"
          ;;
        *)
          printf '{"ok":false,"message":"The referral handoff artifact is not valid for this entry host."}' > "$output_file"
          printf 'HTTP/1.1 400 Bad Request\\r\\n\\r\\n' > "$dump_header_file"
          echo "400"
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

function runBlock(
  rolloutApplied: "true" | "false",
  options: { slowJq?: boolean } = {},
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
        },
      },
    );
    const callLogPath = join(directory, "calls.log");
    let calls: string[] = [];
    try {
      calls = readFileSync(callLogPath, "utf8").trim().split("\n").filter(Boolean);
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
    expect(calls.filter((u) => u.endsWith("/api/partner/ingress/referral-embed-handoff")).length).toBe(2);
    expect(calls.filter((u) => u.endsWith("/api/referral/session")).length).toBe(3);
  });

  it("still makes the real issuance call and asserts the documented fail-closed 403 before the registry rollout, without touching the consume/exchange routes", () => {
    const { result, calls } = runBlock("false");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "referral embed handoff WIF registry rollout",
    );
    expect(calls.some((u) => u.endsWith("/api/partner/ingress/referral-embed-handoff"))).toBe(true);
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
    const directory = mkdtempSync(join(tmpdir(), "deploy-dev-referral-regression-"));
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
});
