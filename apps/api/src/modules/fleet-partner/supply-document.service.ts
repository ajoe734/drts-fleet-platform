import { Injectable } from "@nestjs/common";

/**
 * Manages supply document upload metadata, object-store keys, and per-document
 * review status for fleet-partner submissions.
 *
 * Scaffold only — wired into FleetPartnerModule by P1D-WP0. Upload handling,
 * checksum/expiry validation, and review transitions are implemented by the
 * downstream supply execution wave.
 *
 * Source of truth:
 *   docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md §1.1, §2.4
 */
@Injectable()
export class SupplyDocumentService {}
