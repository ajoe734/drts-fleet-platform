import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  AddAccidentTimelineFactCommand,
  CreateAccidentCaseCommand,
  GenerateAccidentInvestigationBundleCommand,
  ImportAccidentExternalDocumentCommand,
  TransitionAccidentCaseCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  buildEmptyStateEnvelope,
  buildUiReadModelList,
  buildUiReadModelResource,
} from "../../common/ui-read-model";
import { AccidentInvestigationService } from "./accident-investigation.service";

const ACCIDENT_REFRESH_STALE_AFTER_MS = 15_000;

@Controller("accident-cases")
export class AccidentInvestigationController {
  constructor(
    private readonly accidentInvestigationService: AccidentInvestigationService,
  ) {}

  @Get()
  listAccidentCases(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(
        this.accidentInvestigationService.listAccidentCases(),
        {
          staleAfterMs: ACCIDENT_REFRESH_STALE_AFTER_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "accident_cases.empty",
          ),
        },
      ),
      requestId,
    );
  }

  @Post()
  createAccidentCase(
    @Body() command: CreateAccidentCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.accidentInvestigationService.createAccidentCase(command),
      requestId,
    );
  }

  @Get("takeover-correlations")
  listCorrelatedTakeoverCases(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(
        this.accidentInvestigationService.listCorrelatedTakeoverCases(),
        {
          staleAfterMs: ACCIDENT_REFRESH_STALE_AFTER_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "accident_cases.takeover_correlations.empty",
          ),
        },
      ),
      requestId,
    );
  }

  @Get("evidence-discrepancies")
  listEvidenceDiscrepancyCases(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(
        this.accidentInvestigationService.listEvidenceDiscrepancyCases(),
        {
          staleAfterMs: ACCIDENT_REFRESH_STALE_AFTER_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "accident_cases.evidence_discrepancies.empty",
          ),
        },
      ),
      requestId,
    );
  }

  @Get(":caseId")
  getAccidentCase(
    @Param("caseId") caseId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelResource(
        this.accidentInvestigationService.getAccidentCase(caseId),
        {
          staleAfterMs: ACCIDENT_REFRESH_STALE_AFTER_MS,
        },
      ),
      requestId,
    );
  }

  @Post(":caseId/transitions")
  transitionAccidentCase(
    @Param("caseId") caseId: string,
    @Body() command: TransitionAccidentCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.accidentInvestigationService.transitionAccidentCase(caseId, command),
      requestId,
    );
  }

  @Post(":caseId/timeline-facts")
  addTimelineFact(
    @Param("caseId") caseId: string,
    @Body() command: AddAccidentTimelineFactCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.accidentInvestigationService.addTimelineFact(caseId, command),
      requestId,
    );
  }

  @Get(":caseId/timeline")
  getTimeline(
    @Param("caseId") caseId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(
        this.accidentInvestigationService.getTimeline(caseId),
        {
          staleAfterMs: ACCIDENT_REFRESH_STALE_AFTER_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "accident_cases.timeline.empty",
          ),
        },
      ),
      requestId,
    );
  }

  @Post(":caseId/external-documents")
  importExternalDocument(
    @Param("caseId") caseId: string,
    @Body() command: ImportAccidentExternalDocumentCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.accidentInvestigationService.importExternalDocument(caseId, command),
      requestId,
    );
  }

  @Get(":caseId/external-documents")
  listExternalDocuments(
    @Param("caseId") caseId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(
        this.accidentInvestigationService.listExternalDocuments(caseId),
        {
          staleAfterMs: ACCIDENT_REFRESH_STALE_AFTER_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "accident_cases.external_documents.empty",
          ),
        },
      ),
      requestId,
    );
  }

  @Post(":caseId/bundles")
  async generateInvestigationBundle(
    @Param("caseId") caseId: string,
    @Body() command: GenerateAccidentInvestigationBundleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.accidentInvestigationService.generateInvestigationBundle(
        caseId,
        command,
        requestId,
      ),
      requestId,
    );
  }
}
