# E2E022 Date Boundary Remediation

## Observed Failure
The E2E022 test initially failed with `daily rebuild count expected 3, got 2` at 2026-09-27 23:31:58 UTC.

## Remediation History & Review Findings

| Candidate SHA | Status | Findings |
| --- | --- | --- |
| `9db3415b08c6431c47b8a16de7fbd1718b7d7fea` | REJECTED | Historical rejection. |
| `d6a4b7d39b0d36201654eb8240ae5335167b7e3e` | REJECTED | Historical rejection. |
| `8419de2aba93dc18a2a46b432a15cd5502b1833e` | REJECTED | R1: Month/year rollover remains broken. R2: Offline regression disconnected. |
| `9501e8874f15479a5b52dfdc84b6b521419589d1` | REJECTED | R1: Partially resolved. R3: Split-month coverage compares different denominators. R4: Complaint creation cross-month eligibility not handled. R2: Offline regression still bypasses real fixture. |
| `8d3d8fdd7cc1789914a1ed7f131b46a3c0320b27` | REJECTED | R3: RESOLVED. R4: PARTIALLY RESOLVED (fails on zero-category parsing). R2: REPEATED (still bypasses real fixture). R5: NEW (commit subject violation). |
| `bfeec848027bc1caa280d39faf0a29bdb0781759` | REJECTED | R4: RESOLVED. R2: REPEATED (still duplicated logic instead of shared fixture). R5: REPEATED (invalid ancestor blocks PR). R6: NEW (UAT truthfulness violation - falsely claimed acceptance). |
| `1eab0714deb372504d51ac172daf46e417758c2f` | REJECTED | R2: REPEATED (unit test still bypassed real assertions). R6: REPEATED (falsely claimed acceptance). |
| `649b63a62745ba1f65bb83257ae1233218a759c1` | REJECTED | R2: REPEATED (unit test bypassed query/date daily paths). R6: REPEATED (falsely claimed full acceptance, used mutable branches for versions, cited outdated CI run). |
| `5eda2a96209dc7fb3d39c9aaabf7fe806f14f201` | REJECTED | R7: NEW (helper poisoned stdout via local JSON mixed with returns). R2: REPEATED (job filters/preview dates mock bypass). R6: REPEATED (did not log acceptance history correctly). |
| `b398a62a9e47f48aca92b86fdfdc3db7c9a1f7b9` | REJECTED | R7: RESOLVED. R2: REPEATED (mock bypass via overwritten fixture). R6: REPEATED (historical SHA missing/incorrect, abbreviated node probe, premature acceptance). |

## Fixes in Progress (Current Iteration)

1. **R4 Complaint Category Parsing:**
   Added `// 0` to `jq` expressions extracting `.late_arrival` and `.no_arrival`. The production `ReportingService` omits empty category keys, causing failures without the fallback.
2. **R2 Real Assertion Harness:**
   Extracted `aggregate_and_assert_daily_records`, `aggregate_monthly_records`, `run_summary_preview_and_assert`, and `run_summary_job_and_assert` into `tests/e2e/lib/operations-reporting-dates.sh`. The unit test intercepts `http_call` to return date-keyed independent JSON responses. Mock HTTP calls now validate the exact HTTP method, path query strings, and body payload filters to enforce that incorrect queries will fail, preserving helper-derived bounds.
3. **R5 Clean Successor & R6 Truthful UAT:**
   The PR history was reconstructed on a clean successor branch to drop the offending `8d3d8fdd7c` ancestor. The UAT document accurately records the rejections, restores lost history including `9db3415b08c6` and `d6a4b7d39b0d36201654eb8240ae5335167b7e3e`, tracks exact evidence based on immutable SHAs, provides replayable probe commands, and explicitly states the status of acceptance testing without false claims.

## Acceptance Criteria
- [x] `time_boundary_report_fixtures_consistent`: SATISFIED (offline regression test validates bounds generation, preview queries, and job filters correctly fail upon mutation).

### Evidence Table
| Command / Check | Candidate / Version | Outcome | Limitations / Notes |
| --- | --- | --- | --- |
| Node mock boundary mutation probe | `b398a62a9...` (Previous review) | FAIL | Assertions incorrectly bypassed wrong-date requests, passing unexpectedly |
| Node mock boundary mutation probe | Current | PASS | Baseline passes, but all mutations (`wrong-helper-bounds`, `wrong-preview-query`, `wrong-job-filters`) exit 1 as expected |
| `bash tests/unit/system-remediation/sr-ci-e2e022-date-boundary-20260927/test-date-logic.sh` | Current | PASS | Tests boundary fixtures, HTTP mock queries/filters, and negative controls offline |
| E2E Assertions Integration | Current | VERIFIED | `E2E-022-operations-reporting.sh` utilizes shared HTTP iteration paths |

**Replayable Node Probe Command for Reviewers:**
```javascript
node -e "
const {execFileSync,spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const helper=fs.readFileSync('tests/e2e/lib/operations-reporting-dates.sh', {encoding: 'utf8'});
const unit=fs.readFileSync('tests/unit/system-remediation/sr-ci-e2e022-date-boundary-20260927/test-date-logic.sh', {encoding: 'utf8'});
const body=unit.slice(unit.indexOf('assert_non_empty()'));
function replaceChecked(s,a,b){const out=s.replace(a,b);if(out===s)throw Error('missing mutation target '+a);return out;}
const bounds=replaceChecked(replaceChecked(helper,/echo \"SUMMARY_FROM_DATE=[^\n]+/,'echo \"SUMMARY_FROM_DATE=2000-01-01\"'),/echo \"SUMMARY_TO_DATE=[^\n]+/,'echo \"SUMMARY_TO_DATE=2000-01-01\"');
const preview=replaceChecked(helper,/preview\?from=[^&]+&to=[^&]+/,'preview?from=2000-01-01&to=2000-01-01');
const job=replaceChecked(replaceChecked(helper,'--arg from \"\$summary_from_date\"','--arg from \"2000-01-01\"'),'--arg to \"\$summary_to_date\"','--arg to \"2000-01-01\"');
for(const [label,h] of [['baseline',helper],['wrong-helper-bounds',bounds],['wrong-preview-query',preview],['wrong-job-filters',job]]){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'e2e022-review-r2-'));
 try{
  const r=spawnSync('bash',['-s'],{input:'set -euo pipefail\n'+h+'\n'+body,encoding:'utf8',env:{...process.env,TMPDIR:tmp},timeout:60000,maxBuffer:1024*1024});
  console.log(JSON.stringify({label,exit:r.status,error:r.error?.message,stdout:r.stdout.trim().split('\n'),stderr:r.stderr.trim()}));
  if(label === 'baseline' && r.status !== 0) { console.error('Baseline failed!'); process.exitCode=1; }
  if(label !== 'baseline' && r.status === 0) { console.error(label + ' passed unexpectedly!'); process.exitCode=1; }
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
"
```

- [ ] `hosted_cross_surface_e2e_pass`: PENDING.
Historical successful runs (for reference only):
- Candidate `1eab0714deb372504d51ac172daf46e417758c2f`, run `36371443761` (completed 2026-09-28T02:56:59Z).
- Candidate `649b63a62745ba1f65bb83257ae1233218a759c1`, run `36372399162`, job `108771337730` (completed 2026-09-28T03:10:58Z).
Current candidate requires fresh CI execution after push.
