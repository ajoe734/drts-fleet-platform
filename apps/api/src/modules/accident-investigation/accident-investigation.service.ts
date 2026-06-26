import { Injectable, Logger } from "@nestjs/common";

import type {
  CorrelatedTakeoverCase,
  EvidenceDiscrepancyCase,
} from "@drts/contracts";

import { RocOperationsService } from "../roc-operations/roc-operations.service";

@Injectable()
export class AccidentInvestigationService {
  private readonly logger = new Logger(AccidentInvestigationService.name);

  constructor(
    private readonly rocOperationsService: RocOperationsService,
  ) {}

  listCorrelatedTakeoverCases(): CorrelatedTakeoverCase[] {
    return this.rocOperationsService.rebuildCorrelatedTakeoverCases().cases;
  }

  listEvidenceDiscrepancyCases(): EvidenceDiscrepancyCase[] {
    return this.rocOperationsService.rebuildCorrelatedTakeoverCases().discrepancies;
  }

  rebuildTakeoverCorrelationSnapshot() {
    return this.rocOperationsService.rebuildCorrelatedTakeoverCases();
  }
}
