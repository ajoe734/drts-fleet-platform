import { Injectable } from "@nestjs/common";

/**
 * Computes supply readiness state (ready / not_ready / suspended) and reason
 * codes for drivers, vehicles, and driver-vehicle pairs.
 *
 * Scaffold only — wired into FleetPartnerModule by P1D-WP0. Readiness
 * recomputation against documents, contracts, and affiliations is implemented
 * by the downstream supply execution wave.
 *
 * Source of truth:
 *   docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md §1.1, §2.6
 */
@Injectable()
export class SupplyReadinessService {}
