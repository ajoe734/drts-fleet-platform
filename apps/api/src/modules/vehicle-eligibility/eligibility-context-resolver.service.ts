import { Injectable } from "@nestjs/common";

/**
 * Resolves the exact service product context, policy version, and driver /
 * vehicle facts a runtime eligibility evaluation needs.
 *
 * Scaffold only — wired into VehicleEligibilityModule by P1D-WP0. Context
 * assembly from registry, readiness, and location state is implemented by the
 * downstream eligibility execution wave.
 *
 * Source of truth:
 *   docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md §1.3, §5.2
 */
@Injectable()
export class EligibilityContextResolver {}
