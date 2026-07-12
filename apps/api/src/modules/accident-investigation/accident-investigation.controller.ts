import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  AddAccidentTimelineFactCommand,
  CreateAccidentCaseCommand,
  GenerateAccidentInvestigationBundleCommand,
  ImportAccidentExternalDocumentCommand,
  TransitionAccidentCaseCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { RequireRealms, RequireScopes } from "../../common/auth";
import {
  buildEmptyStateEnvelope,
  buildUiReadModelList,
  buildUiReadModelResource,
} from "../../common/ui-read-model";
import { AccidentInvestigationService } from "./accident-investigation.service";

const ACCIDENT_REFRESH_STALE_AFTER_MS = 15_000;

@RequireRealms("platform", "ops")
@Controller("accident-cases")
export class AccidentInvestigationController {
  constructor(
    private readonly accidentInvestigationService: AccidentInvestigationService,
  ) {}

  @Get()
  @RequireScopes("sandbox.investigation.read")
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
  @RequireScopes("sandbox.investigation.manage")
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
  @RequireScopes("sandbox.compliance.read")
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
  @RequireScopes("sandbox.compliance.read")
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
  @RequireScopes("sandbox.investigation.read")
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
  @RequireScopes("sandbox.investigation.manage")
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
  @RequireScopes("sandbox.investigation.manage")
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
  @RequireScopes("sandbox.investigation.read")
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
  @RequireScopes("sandbox.investigation.manage")
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
  @RequireScopes("sandbox.investigation.read")
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
  @RequireScopes("sandbox.investigation.manage")
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
