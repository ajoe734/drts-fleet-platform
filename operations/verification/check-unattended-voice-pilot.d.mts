// Hand-written declaration for the plain-JS gate script so `tests/unit/unattended-voice-pilot/`
// can import it under `allowJs: false`. Keep this in sync with the exports in
// check-unattended-voice-pilot.mjs.

export interface AcceptanceCriterion {
  ac_id: string;
  status_category: string;
  [key: string]: unknown;
}

export interface AcceptanceManifest {
  acceptance_criteria?: AcceptanceCriterion[];
  [key: string]: unknown;
}

export interface RequiredAcceptance {
  pilot_operational_authorization: boolean;
  dev_deploy_run_url: boolean;
  dev_deploy_sha: boolean;
  operational_acceptance_run_url: boolean;
  operational_acceptance_sha: boolean;
  all_applicable_ac_evidence: boolean;
  human_exception_rate_full_cohort: boolean;
  language_route_model_profile_signoff: boolean;
  staffing_callback_drill_evidence: boolean;
  kill_switch_rollback_drill_evidence: boolean;
}

export interface PilotAcceptanceReport {
  evaluated_at: string;
  expected_sha: string | null;
  applicable_ac_ids: string[];
  required_acceptance: RequiredAcceptance;
}

export interface PilotAcceptanceGateOptions {
  manifestPath?: string;
  evidencePath?: string;
  expectedSha?: string | null;
  maxAgeHours?: number;
  maxDrillAgeHours?: number;
  now?: Date;
  output?: string;
}

export interface PilotAcceptanceGateResult {
  ok: boolean;
  failures: string[];
  report: PilotAcceptanceReport | null;
}

export const DEFAULT_MANIFEST_PATH: string;
export const DEFAULT_EVIDENCE_PATH: string;
export const SHA_PATTERN: RegExp;
export const AUTH_REF_PATTERN: RegExp;
export const KNOWN_LANGUAGES: Set<string>;
export const RATE_EPSILON: number;
export const DEFAULT_MAX_AGE_HOURS: number;
export const DEFAULT_MAX_DRILL_AGE_HOURS: number;

export function loadJson(filePath: string | undefined, label: string): { value: unknown; error: string | null };
export function resolveExpectedSha(explicitSha?: string | null): string | null;
export function getApplicableAcs(manifest: AcceptanceManifest | null | undefined): AcceptanceCriterion[];
export function validateShaConsistency(evidence: unknown, expectedSha: string | null): string[];
export function validateDeployUrls(evidence: unknown): string[];
export function validateFreshness(evidence: unknown, maxAgeHours: number, now: Date): string[];
export function validateAcEvidence(
  evidence: unknown,
  applicableAcs: AcceptanceCriterion[],
  expectedSha: string | null,
): string[];
export function validateCohort(evidence: unknown, enabledLanguages: Set<string>): string[];
export function validateEnabledScope(evidence: unknown): {
  failures: string[];
  languages: Set<string>;
  modelProfiles: Set<string>;
};
export function validateLanguageRouteModelProfileSignoff(
  evidence: unknown,
  enabledLanguages: Set<string>,
  enabledModelProfiles: Set<string>,
): string[];
export function validateAuthorization(evidence: unknown): string[];
export function validateDrills(evidence: unknown, maxDrillAgeHours: number, now: Date): string[];
export function runPilotAcceptanceGate(options?: PilotAcceptanceGateOptions): PilotAcceptanceGateResult;
