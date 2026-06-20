import { Injectable } from "@nestjs/common";

/**
 * Orchestrates platform-side review of supply submissions and, on approval,
 * the canonical provisioning hand-off into RegulatoryRegistryModule.
 *
 * Scaffold only — wired into FleetPartnerModule by P1D-WP0. Review state
 * transitions, reason codes, and the approve-submission transaction are
 * implemented by the downstream supply execution wave.
 *
 * Source of truth:
 *   docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md §1.1, §5.1
 */
@Injectable()
export class SupplyReviewService {}
