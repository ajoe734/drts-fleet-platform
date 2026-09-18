#!/usr/bin/env node

/**
 * Unattended Voice Booking - Pilot Acceptance Gate (UV-EXEC-029-PILOT-RUNNER).
 *
 * Aggregates and validates an already-submitted pilot evidence bundle against
 * the existing 32-FR/48-AC manifest (UV-EXEC-025) and the SHAs recorded for
 * this candidate. This gate is read-only: it never enables pilot traffic,
 * never contacts telephony providers, never flips rollout flags and never
 * fabricates approvals. A nonempty authorization string is not, by itself,
 * verified approval - every approval/drill field must carry a structured
 * record (who, when, outcome, artifact reference).
 *
 * The evidence bundle itself is an external operations artifact (see
 * docs/04-uat/unattended-voice-pilot-acceptance.md for its schema and
 * docs/03-runbooks/unattended-voice-operations.md for the submission runbook).
 * This script only validates/aggregates what has already been submitted; the
 * parent task's real PSTN pilot, operations authorization and all other
 * required acceptance fields remain pending until operations actually
 * performs and records them.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

export const DEFAULT_MANIFEST_PATH = path.join(
  REPO_ROOT,
  'docs',
  '04-uat',
  'unattended-voice-acceptance-manifest.json',
);
export const DEFAULT_EVIDENCE_PATH = path.join(
  REPO_ROOT,
  'docs',
  '04-uat',
  'unattended-voice-pilot-evidence.json',
);

export const SHA_PATTERN = /^[0-9a-f]{40}$/i;
export const AUTH_REF_PATTERN = /^AUTH-UV-PILOT-[A-Z0-9_-]+$/;
export const KNOWN_LANGUAGES = new Set(['zh-TW', 'nan-TW', 'hak-TW', 'en-mixed']);
export const RATE_EPSILON = 0.005;
export const DEFAULT_MAX_AGE_HOURS = 168;
export const DEFAULT_MAX_DRILL_AGE_HOURS = 720;

export function loadJson(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { value: null, error: `${label}_NOT_FOUND:${filePath}` };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return { value: JSON.parse(raw), error: null };
  } catch (err) {
    return { value: null, error: `${label}_INVALID_JSON:${err.message}` };
  }
}

export function resolveExpectedSha(explicitSha) {
  if (explicitSha) return explicitSha;
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

export function getApplicableAcs(manifest) {
  const acs = (manifest && Array.isArray(manifest.acceptance_criteria)) ? manifest.acceptance_criteria : [];
  return acs.filter((ac) => ac && ac.status_category !== 'pending');
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isParsableDate(value) {
  if (!isNonEmptyString(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function hoursSince(isoString, now) {
  const parsed = Date.parse(isoString);
  if (!Number.isFinite(parsed)) return Infinity;
  return (now.getTime() - parsed) / (1000 * 60 * 60);
}

export function validateShaConsistency(evidence, expectedSha) {
  const failures = [];
  if (!expectedSha || !SHA_PATTERN.test(expectedSha)) {
    failures.push(
      'SHA_UNRESOLVED: no valid expected candidate SHA available; pass --expected-sha or run inside a git checkout',
    );
    return failures;
  }

  const shaFields = {
    candidate_sha: evidence?.candidate_sha,
    dev_deploy_sha: evidence?.dev_deploy?.sha,
    operational_acceptance_sha: evidence?.operational_acceptance?.sha,
  };

  for (const [field, value] of Object.entries(shaFields)) {
    if (!isNonEmptyString(value) || !SHA_PATTERN.test(value)) {
      failures.push(`SHA_MISSING:${field}`);
      continue;
    }
    if (value.toLowerCase() !== expectedSha.toLowerCase()) {
      failures.push(`SHA_MISMATCH:${field}:expected=${expectedSha}:actual=${value}`);
    }
  }

  return failures;
}

export function validateDeployUrls(evidence) {
  const failures = [];
  const devUrl = evidence?.dev_deploy?.run_url;
  const opsUrl = evidence?.operational_acceptance?.run_url;
  if (!isNonEmptyString(devUrl) || !/^https?:\/\//.test(devUrl)) {
    failures.push('DEV_DEPLOY_RUN_URL_MISSING');
  }
  if (!isNonEmptyString(opsUrl) || !/^https?:\/\//.test(opsUrl)) {
    failures.push('OPERATIONAL_ACCEPTANCE_RUN_URL_MISSING');
  }
  return failures;
}

export function validateFreshness(evidence, maxAgeHours, now) {
  const failures = [];
  const submittedAt = evidence?.submitted_at;
  if (!isParsableDate(submittedAt)) {
    failures.push('EVIDENCE_SUBMITTED_AT_MISSING_OR_INVALID');
    return failures;
  }
  const age = hoursSince(submittedAt, now);
  if (age < 0) {
    failures.push('EVIDENCE_SUBMITTED_AT_IN_FUTURE');
  } else if (age > maxAgeHours) {
    failures.push(`EVIDENCE_STALE:age_hours=${age.toFixed(1)}:max_age_hours=${maxAgeHours}`);
  }
  return failures;
}

export function validateAcEvidence(evidence, applicableAcs, expectedSha) {
  const failures = [];
  const entries = Array.isArray(evidence?.ac_evidence) ? evidence.ac_evidence : [];
  const byAcId = new Map();
  for (const entry of entries) {
    if (entry && isNonEmptyString(entry.ac_id)) {
      byAcId.set(entry.ac_id, entry);
    }
  }

  for (const ac of applicableAcs) {
    const entry = byAcId.get(ac.ac_id);
    if (!entry) {
      failures.push(`AC_MISSING:${ac.ac_id}`);
      continue;
    }
    if (entry.result !== 'pass') {
      failures.push(`AC_NOT_PASS:${ac.ac_id}:result=${entry.result ?? '(none)'}`);
    }
    if (!isNonEmptyString(entry.run_sha) || !SHA_PATTERN.test(entry.run_sha)) {
      failures.push(`AC_RUN_SHA_MISSING:${ac.ac_id}`);
    } else if (expectedSha && entry.run_sha.toLowerCase() !== expectedSha.toLowerCase()) {
      failures.push(`AC_WRONG_SHA:${ac.ac_id}:expected=${expectedSha}:actual=${entry.run_sha}`);
    }
    if (entry.mode !== 'fixture' && entry.mode !== 'live') {
      failures.push(`AC_MODE_INVALID:${ac.ac_id}:mode=${entry.mode ?? '(none)'}`);
    } else if (ac.status_category === 'live' && entry.mode !== 'live') {
      failures.push(`AC_FIXTURE_ONLY_FOR_LIVE_CATEGORY:${ac.ac_id}`);
    }
    if (!isNonEmptyString(entry.evidence_ref)) {
      failures.push(`AC_EVIDENCE_REF_MISSING:${ac.ac_id}`);
    }
  }

  return failures;
}

export function validateCohort(evidence, enabledLanguages) {
  const failures = [];
  const cohort = evidence?.cohort;
  if (!cohort || typeof cohort !== 'object') {
    failures.push('COHORT_MISSING');
    return failures;
  }

  const total = cohort.total_incoming_calls;
  if (!Number.isFinite(total) || total <= 0) {
    failures.push('COHORT_TOTAL_INVALID');
    return failures;
  }

  const perLanguage = cohort.per_language && typeof cohort.per_language === 'object' ? cohort.per_language : {};
  const perLanguageKeys = Object.keys(perLanguage);
  if (perLanguageKeys.length === 0) {
    failures.push('COHORT_PER_LANGUAGE_MISSING');
    return failures;
  }

  for (const lang of perLanguageKeys) {
    if (!KNOWN_LANGUAGES.has(lang)) {
      failures.push(`COHORT_UNKNOWN_LANGUAGE:${lang}`);
    } else if (enabledLanguages && !enabledLanguages.has(lang) && (perLanguage[lang]?.total ?? 0) > 0) {
      failures.push(`COHORT_LANGUAGE_NOT_IN_SCOPE:${lang}`);
    }
  }

  let languageTotalSum = 0;
  let languageExceptionSum = 0;
  for (const stats of Object.values(perLanguage)) {
    languageTotalSum += Number(stats?.total) || 0;
    languageExceptionSum += Number(stats?.human_exceptions) || 0;
  }

  if (languageTotalSum !== total) {
    failures.push(
      `COHORT_DENOMINATOR_MISMATCH:per_language_sum=${languageTotalSum}:total_incoming_calls=${total}`,
    );
  }

  const humanExceptionCount = cohort.human_exception_count;
  if (!Number.isFinite(humanExceptionCount) || humanExceptionCount < 0) {
    failures.push('COHORT_HUMAN_EXCEPTION_COUNT_INVALID');
  } else if (humanExceptionCount !== languageExceptionSum) {
    failures.push(
      `COHORT_HUMAN_EXCEPTION_COUNT_MISMATCH:per_language_sum=${languageExceptionSum}:reported=${humanExceptionCount}`,
    );
  }

  const reportedRate = cohort.human_exception_rate;
  if (!Number.isFinite(reportedRate)) {
    failures.push('COHORT_HUMAN_EXCEPTION_RATE_MISSING');
  } else if (Number.isFinite(humanExceptionCount) && total > 0) {
    const expectedRate = humanExceptionCount / total;
    if (Math.abs(expectedRate - reportedRate) > RATE_EPSILON) {
      failures.push(
        `COHORT_HUMAN_EXCEPTION_RATE_NOT_FULL_COHORT:expected=${expectedRate.toFixed(4)}:reported=${reportedRate}`,
      );
    }
  }

  return failures;
}

export function validateEnabledScope(evidence) {
  const failures = [];
  const scope = evidence?.enabled_scope;
  if (!scope || typeof scope !== 'object') {
    failures.push('ENABLED_SCOPE_MISSING');
    return { failures, languages: new Set(), modelProfiles: new Set() };
  }

  const languages = Array.isArray(scope.languages) ? scope.languages : [];
  const routes = Array.isArray(scope.routes) ? scope.routes : [];
  const modelProfiles = Array.isArray(scope.model_profiles) ? scope.model_profiles : [];

  if (languages.length === 0) failures.push('ENABLED_SCOPE_LANGUAGES_EMPTY');
  if (routes.length === 0) failures.push('ENABLED_SCOPE_ROUTES_EMPTY');
  if (modelProfiles.length === 0) failures.push('ENABLED_SCOPE_MODEL_PROFILES_EMPTY');

  for (const lang of languages) {
    if (!KNOWN_LANGUAGES.has(lang)) {
      failures.push(`ENABLED_SCOPE_UNKNOWN_LANGUAGE:${lang}`);
    }
  }

  return { failures, languages: new Set(languages), modelProfiles: new Set(modelProfiles) };
}

export function validateLanguageRouteModelProfileSignoff(evidence, enabledLanguages, enabledModelProfiles) {
  const failures = [];
  const signoffs = Array.isArray(evidence?.language_route_model_profile_signoff)
    ? evidence.language_route_model_profile_signoff
    : [];

  if (signoffs.length === 0) {
    failures.push('SIGNOFF_LIST_EMPTY');
  }

  const validSignoffs = signoffs.filter(
    (s) =>
      s &&
      isNonEmptyString(s.language) &&
      isNonEmptyString(s.route) &&
      isNonEmptyString(s.model_profile) &&
      isNonEmptyString(s.approver) &&
      isParsableDate(s.approved_at),
  );

  for (const s of signoffs) {
    if (!validSignoffs.includes(s)) {
      failures.push(`SIGNOFF_ENTRY_INCOMPLETE:${JSON.stringify(s)}`);
    }
  }

  const signedOffLanguages = new Set(validSignoffs.map((s) => s.language));
  const signedOffProfiles = new Set(validSignoffs.map((s) => s.model_profile));

  for (const lang of enabledLanguages) {
    if (!signedOffLanguages.has(lang)) {
      failures.push(`SIGNOFF_MISSING_FOR_LANGUAGE:${lang}`);
    }
  }
  for (const profile of enabledModelProfiles) {
    if (!signedOffProfiles.has(profile)) {
      failures.push(`SIGNOFF_MISSING_FOR_MODEL_PROFILE:${profile}`);
    }
  }

  return failures;
}

export function validateAuthorization(evidence) {
  const failures = [];
  const auth = evidence?.pilot_operational_authorization;
  if (isNonEmptyString(auth)) {
    failures.push('AUTHORIZATION_IS_BARE_STRING_NOT_STRUCTURED_APPROVAL');
    return failures;
  }
  if (!auth || typeof auth !== 'object') {
    failures.push('AUTHORIZATION_MISSING');
    return failures;
  }
  if (auth.authorized !== true) {
    failures.push('AUTHORIZATION_NOT_GRANTED');
  }
  if (!isNonEmptyString(auth.approver)) {
    failures.push('AUTHORIZATION_APPROVER_MISSING');
  }
  if (!isParsableDate(auth.approved_at)) {
    failures.push('AUTHORIZATION_APPROVED_AT_MISSING_OR_INVALID');
  }
  if (!isNonEmptyString(auth.reference) || !AUTH_REF_PATTERN.test(auth.reference)) {
    failures.push('AUTHORIZATION_REFERENCE_INVALID');
  }
  return failures;
}

function validateDrill(drill, fieldLabel, maxDrillAgeHours, now) {
  const failures = [];
  if (!drill || typeof drill !== 'object') {
    failures.push(`${fieldLabel}_MISSING`);
    return failures;
  }
  if (!isParsableDate(drill.drill_date)) {
    failures.push(`${fieldLabel}_DATE_MISSING_OR_INVALID`);
  } else {
    const age = hoursSince(drill.drill_date, now);
    if (age < 0) {
      failures.push(`${fieldLabel}_DATE_IN_FUTURE`);
    } else if (age > maxDrillAgeHours) {
      failures.push(`${fieldLabel}_STALE:age_hours=${age.toFixed(1)}:max_age_hours=${maxDrillAgeHours}`);
    }
  }
  if (!isNonEmptyString(drill.executor)) {
    failures.push(`${fieldLabel}_EXECUTOR_MISSING`);
  }
  if (!isNonEmptyString(drill.scenario)) {
    failures.push(`${fieldLabel}_SCENARIO_MISSING`);
  }
  if (drill.outcome !== 'pass') {
    failures.push(`${fieldLabel}_OUTCOME_NOT_PASS:outcome=${drill.outcome ?? '(none)'}`);
  }
  if (!isNonEmptyString(drill.artifact_ref)) {
    failures.push(`${fieldLabel}_ARTIFACT_REF_MISSING`);
  }
  return failures;
}

export function validateDrills(evidence, maxDrillAgeHours, now) {
  return [
    ...validateDrill(evidence?.staffing_callback_drill_evidence, 'STAFFING_CALLBACK_DRILL', maxDrillAgeHours, now),
    ...validateDrill(evidence?.kill_switch_rollback_drill_evidence, 'KILL_SWITCH_ROLLBACK_DRILL', maxDrillAgeHours, now),
  ];
}

/**
 * Runs the full pilot acceptance gate and returns an aggregate report whose
 * boolean keys mirror UV-EXEC-029's `required_acceptance` list, plus the full
 * set of failure codes that justify each `false`.
 */
export function runPilotAcceptanceGate(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const maxAgeHours = options.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
  const maxDrillAgeHours = options.maxDrillAgeHours ?? DEFAULT_MAX_DRILL_AGE_HOURS;
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH;
  const evidencePath = options.evidencePath ?? DEFAULT_EVIDENCE_PATH;

  const manifestLoad = loadJson(manifestPath, 'MANIFEST');
  const evidenceLoad = loadJson(evidencePath, 'EVIDENCE');

  const globalFailures = [];
  if (manifestLoad.error) globalFailures.push(manifestLoad.error);
  if (evidenceLoad.error) globalFailures.push(evidenceLoad.error);

  if (globalFailures.length > 0) {
    return {
      ok: false,
      failures: globalFailures,
      report: null,
    };
  }

  const manifest = manifestLoad.value;
  const evidence = evidenceLoad.value;
  const expectedSha = resolveExpectedSha(options.expectedSha);
  const applicableAcs = getApplicableAcs(manifest);

  const shaFailures = validateShaConsistency(evidence, expectedSha);
  const urlFailures = validateDeployUrls(evidence);
  const freshnessFailures = validateFreshness(evidence, maxAgeHours, now);
  const acFailures = validateAcEvidence(evidence, applicableAcs, expectedSha);
  const scope = validateEnabledScope(evidence);
  const cohortFailures = validateCohort(evidence, scope.languages);
  const signoffFailures = validateLanguageRouteModelProfileSignoff(evidence, scope.languages, scope.modelProfiles);
  const authorizationFailures = validateAuthorization(evidence);
  const drillFailures = validateDrills(evidence, maxDrillAgeHours, now);

  const allFailures = [
    ...shaFailures,
    ...urlFailures,
    ...freshnessFailures,
    ...acFailures,
    ...scope.failures,
    ...cohortFailures,
    ...signoffFailures,
    ...authorizationFailures,
    ...drillFailures,
  ];

  const requiredAcceptance = {
    pilot_operational_authorization: authorizationFailures.length === 0,
    dev_deploy_run_url: !urlFailures.includes('DEV_DEPLOY_RUN_URL_MISSING'),
    dev_deploy_sha: !shaFailures.some((f) => f.includes('dev_deploy_sha')),
    operational_acceptance_run_url: !urlFailures.includes('OPERATIONAL_ACCEPTANCE_RUN_URL_MISSING'),
    operational_acceptance_sha: !shaFailures.some((f) => f.includes('operational_acceptance_sha')),
    all_applicable_ac_evidence: acFailures.length === 0,
    human_exception_rate_full_cohort: cohortFailures.length === 0,
    language_route_model_profile_signoff: signoffFailures.length === 0 && scope.failures.length === 0,
    staffing_callback_drill_evidence: !drillFailures.some((f) => f.startsWith('STAFFING_CALLBACK_DRILL')),
    kill_switch_rollback_drill_evidence: !drillFailures.some((f) => f.startsWith('KILL_SWITCH_ROLLBACK_DRILL')),
  };

  const ok = allFailures.length === 0 && Object.values(requiredAcceptance).every(Boolean);

  return {
    ok,
    failures: allFailures,
    report: {
      evaluated_at: now.toISOString(),
      expected_sha: expectedSha,
      applicable_ac_ids: applicableAcs.map((ac) => ac.ac_id),
      required_acceptance: requiredAcceptance,
    },
  };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--evidence' && i + 1 < argv.length) {
      options.evidencePath = path.resolve(argv[++i]);
    } else if (arg === '--manifest' && i + 1 < argv.length) {
      options.manifestPath = path.resolve(argv[++i]);
    } else if (arg === '--expected-sha' && i + 1 < argv.length) {
      options.expectedSha = argv[++i];
    } else if (arg === '--max-age-hours' && i + 1 < argv.length) {
      options.maxAgeHours = Number(argv[++i]);
    } else if (arg === '--max-drill-age-hours' && i + 1 < argv.length) {
      options.maxDrillAgeHours = Number(argv[++i]);
    } else if (arg === '--output' && i + 1 < argv.length) {
      options.output = path.resolve(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  return options;
}

function printHelp() {
  console.log(`
Usage: node check-unattended-voice-pilot.mjs --evidence <path> [options]

Read-only pilot acceptance gate for UV-EXEC-029. Validates a submitted pilot
evidence bundle against the existing acceptance manifest and candidate SHA.
Never enables pilot traffic, contacts telephony providers, or mutates flags.

Options:
  --evidence <path>          Path to the pilot evidence JSON bundle (required)
  --manifest <path>          Path to the acceptance manifest (default: docs/04-uat/unattended-voice-acceptance-manifest.json)
  --expected-sha <sha>       Candidate SHA to validate against (default: git rev-parse HEAD)
  --max-age-hours <n>        Max evidence submission age in hours (default: ${DEFAULT_MAX_AGE_HOURS})
  --max-drill-age-hours <n>  Max drill evidence age in hours (default: ${DEFAULT_MAX_DRILL_AGE_HOURS})
  --output <path>            Optional path to write the JSON aggregate report
  --help, -h                 Show this help message
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  if (!options.evidencePath) {
    console.error('[FAIL] --evidence <path> is required.');
    printHelp();
    process.exit(1);
  }

  console.log('======================================================================');
  console.log('  Unattended Voice Booking - Pilot Acceptance Gate (UV-EXEC-029)      ');
  console.log('======================================================================');
  console.log(`Evidence:  ${options.evidencePath}`);
  console.log(`Manifest:  ${options.manifestPath ?? DEFAULT_MANIFEST_PATH}`);
  console.log('----------------------------------------------------------------------');

  const { ok, failures, report } = runPilotAcceptanceGate(options);

  if (report) {
    console.log(`Expected SHA: ${report.expected_sha ?? '(unresolved)'}`);
    console.log(`Applicable ACs (non-pending): ${report.applicable_ac_ids.length}`);
    console.log('Required acceptance fields:');
    for (const [key, value] of Object.entries(report.required_acceptance)) {
      console.log(`  ${value ? '[PASS]' : '[FAIL]'} ${key}`);
    }
  }

  if (failures.length > 0) {
    console.error('\nFailures:');
    for (const failure of failures) {
      console.error(`  [FAIL] ${failure}`);
    }
  }

  if (options.output && report) {
    fs.writeFileSync(options.output, JSON.stringify({ ok, failures, report }, null, 2), 'utf-8');
    console.log(`\nSaved aggregate report to ${options.output}`);
  }

  console.log('----------------------------------------------------------------------');
  console.log(ok ? '[PASS] Pilot acceptance gate passed.' : '[FAIL] Pilot acceptance gate rejected this evidence bundle.');
  console.log('This gate only validates/aggregates submitted evidence. It does not');
  console.log('enable pilot traffic, alter rollout flags, or contact telephone providers.');

  process.exit(ok ? 0 : 1);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
  main().catch((err) => {
    console.error('[ERROR] Pilot acceptance gate crashed:', err);
    process.exit(1);
  });
}
