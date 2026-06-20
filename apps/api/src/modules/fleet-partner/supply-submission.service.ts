import { Injectable } from "@nestjs/common";

/**
 * Owns fleet-partner supply submission lifecycle (draft → submitted → review →
 * approved/rejected) and the driver/vehicle draft payloads.
 *
 * Scaffold only — wired into FleetPartnerModule by P1D-WP0. Submission write
 * flow, revision handling, and registry hand-off are implemented by the
 * downstream supply execution wave.
 *
 * Source of truth:
 *   docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md §1.1
 */
@Injectable()
export class SupplySubmissionService {}
