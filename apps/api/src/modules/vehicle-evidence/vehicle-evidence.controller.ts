import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";

import { toApiListData, toApiSuccessEnvelope } from "../../common/api-envelope";
import { RequireRealms, RequireScopes } from "../../common/auth";
import type {
  BookmarkQuery,
  SegmentIndexQuery,
} from "./vehicle-evidence.ports";
import { VehicleEvidenceService } from "./vehicle-evidence.service";

@RequireRealms("platform", "ops")
@Controller("vehicle-evidence")
export class VehicleEvidenceController {
  constructor(
    private readonly vehicleEvidenceService: VehicleEvidenceService,
  ) {}

  @Post("recorders")
  @RequireScopes("sandbox.compliance.manage")
  registerRecorder(
    @Body() body: Parameters<VehicleEvidenceService["registerRecorder"]>[0],
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.vehicleEvidenceService.registerRecorder(body),
      requestId,
    );
  }

  @Get("recorders")
  @RequireScopes("sandbox.compliance.read")
  listRecorders(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      toApiListData(this.vehicleEvidenceService.listRecorders()),
      requestId,
    );
  }

  @Post("recorders/:recorderId/health")
  @RequireScopes("sandbox.compliance.manage")
  updateRecorderHealth(
    @Param("recorderId") recorderId: string,
    @Body() body: Parameters<VehicleEvidenceService["updateRecorderHealth"]>[1],
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.vehicleEvidenceService.updateRecorderHealth(recorderId, body),
      requestId,
    );
  }

  @Get("recorders/:recorderId/health")
  @RequireScopes("sandbox.compliance.read")
  getRecorderHealth(
    @Param("recorderId") recorderId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.vehicleEvidenceService.getRecorderHealth(recorderId),
      requestId,
    );
  }

  @Get("signals/no-new-dispatch/:vehicleId")
  @RequireScopes("sandbox.compliance.read")
  getNoNewDispatchSignal(
    @Param("vehicleId") vehicleId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.vehicleEvidenceService.getNoNewDispatchSignal(vehicleId),
      requestId,
    );
  }

  @Get("segments")
  @RequireScopes("sandbox.evidence.preview")
  listSegmentIndex(
    @Query("recorderId") recorderId: string | undefined,
    @Query("vehicleId") vehicleId: string | undefined,
    @Query("caseId") caseId: string | undefined,
    @Query("eventType") eventType: string | undefined,
    @Query("uploadStatus") uploadStatus: string | undefined,
    @Query("bookmarkedOnly") bookmarkedOnly: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    const query: SegmentIndexQuery = {};
    if (recorderId) {
      query.recorderId = recorderId;
    }
    if (vehicleId) {
      query.vehicleId = vehicleId;
    }
    if (caseId) {
      query.caseId = caseId;
    }
    if (eventType) {
      query.eventType = eventType;
    }
    if (uploadStatus) {
      query.uploadStatus = uploadStatus as never;
    }
    if (bookmarkedOnly === "true") {
      query.bookmarkedOnly = true;
    }

    return toApiSuccessEnvelope(
      toApiListData(this.vehicleEvidenceService.listSegmentIndex(query)),
      requestId,
    );
  }

  @Post("bookmarks")
  @RequireScopes("sandbox.investigation.manage")
  bookmarkEvent(
    @Body() body: Parameters<VehicleEvidenceService["bookmarkEvent"]>[0],
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.vehicleEvidenceService.bookmarkEvent(body),
      requestId,
    );
  }

  @Get("bookmarks")
  @RequireScopes("sandbox.evidence.preview")
  listBookmarks(
    @Query("recorderId") recorderId: string | undefined,
    @Query("vehicleId") vehicleId: string | undefined,
    @Query("eventType") eventType: string | undefined,
    @Query("eventId") eventId: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    const query: BookmarkQuery = {};
    if (recorderId) {
      query.recorderId = recorderId;
    }
    if (vehicleId) {
      query.vehicleId = vehicleId;
    }
    if (eventType) {
      query.eventType = eventType;
    }
    if (eventId) {
      query.eventId = eventId;
    }

    return toApiSuccessEnvelope(
      toApiListData(this.vehicleEvidenceService.listBookmarks(query)),
      requestId,
    );
  }

  @Post("uploads/:artifactId/retry")
  @RequireScopes("sandbox.investigation.manage")
  retryUpload(
    @Param("artifactId") artifactId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.vehicleEvidenceService.retryUpload(artifactId),
      requestId,
    );
  }
}
