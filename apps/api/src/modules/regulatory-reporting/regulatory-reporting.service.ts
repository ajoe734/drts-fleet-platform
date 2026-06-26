import { Injectable, Logger } from "@nestjs/common";

import type { RegulatoryReportFiling } from "@drts/contracts";

/**
 * RegulatoryReportingService — Phase 2 scaffold.
 *
 * Scaffold-only: registers the AV regulatory reporting surface (disengagement
 * summaries, collision reports, ODD compliance, incident filings) for the
 * phase2-tesla-fsd-sandbox-202606 phase. Concrete report generation/submission
 * and persistence against av_evidence.regulatory_report_filings (V0037) land in
 * downstream waves.
 */
@Injectable()
export class RegulatoryReportingService {
  private readonly logger = new Logger(RegulatoryReportingService.name);

  private filings: RegulatoryReportFiling[] = [];
}
