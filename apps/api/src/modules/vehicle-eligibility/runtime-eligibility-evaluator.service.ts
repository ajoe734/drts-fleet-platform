import { Injectable } from "@nestjs/common";

/**
 * Evaluates runtime eligibility for a candidate against the exact service
 * product, producing eligible / conditionally_eligible / ineligible decisions
 * with hard/soft reason codes.
 *
 * Scaffold only — wired into VehicleEligibilityModule by P1D-WP0. Decision
 * logic, candidate filtering, and assignment recheck are implemented by the
 * downstream eligibility execution wave.
 *
 * Source of truth:
 *   docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md §1.3, §2.8, §5.2
 */
@Injectable()
export class RuntimeEligibilityEvaluator {}
