import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  AddComplaintCaseNoteCommand,
  AssignComplaintCaseCommand,
  CreateComplaintCaseCommand,
  ReopenComplaintCaseCommand,
  ResolveComplaintCaseCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { ComplaintService } from "./complaint.service";

@Controller("complaints")
export class ComplaintController {
  constructor(private readonly complaintService: ComplaintService) {}

  @Post()
  createComplaintCase(
    @Body() command: CreateComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.createComplaintCase(command, requestId),
      requestId,
    );
  }

  @Get()
  listComplaintCases(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.complaintService.listComplaintCases(),
      },
      requestId,
    );
  }

  @Get(":caseNo")
  getComplaintCase(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.getComplaintCase(caseNo),
      requestId,
    );
  }

  @Get(":caseNo/timeline")
  getComplaintTimeline(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.complaintService.getComplaintTimeline(caseNo),
      },
      requestId,
    );
  }

  @Post(":caseNo/assign")
  assignComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: AssignComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.assignComplaintCase(caseNo, command, requestId),
      requestId,
    );
  }

  @Post(":caseNo/notes")
  addComplaintCaseNote(
    @Param("caseNo") caseNo: string,
    @Body() command: AddComplaintCaseNoteCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.addComplaintCaseNote(caseNo, command, requestId),
      requestId,
    );
  }

  @Get(":caseNo/export")
  getComplaintExportView(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.getComplaintExportView(caseNo),
      requestId,
    );
  }

  @Post(":caseNo/reopen")
  reopenComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: ReopenComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.reopenComplaintCase(caseNo, command, requestId),
      requestId,
    );
  }

  @Post(":caseNo/resolve")
  resolveComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: ResolveComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.resolveComplaintCase(caseNo, command, requestId),
      requestId,
    );
  }

  @Post(":caseNo/close")
  closeComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: ResolveComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.closeComplaintCase(caseNo, command, requestId),
      requestId,
    );
  }

  @Post(":caseNo/sla-breach")
  markComplaintSlaBreach(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.markComplaintSlaBreach(caseNo, requestId),
      requestId,
    );
  }
}
