import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";

import type { IdentityContext } from "@drts/contracts";

import { toApiListData, toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import type {
  BookmarkQuery,
  EvidenceAccessLogQuery,
  EvidenceFreezeQuery,
  SegmentIndexQuery,
} from "./vehicle-evidence.ports";
import { VehicleEvidenceService } from "./vehicle-evidence.service";

@Controller("vehicle-evidence")
export class VehicleEvidenceController {
  constructor(
    private readonly vehicleEvidenceService: VehicleEvidenceService,
  ) {}

  @Post("recorders")
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
  listRecorders(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      toApiListData(this.vehicleEvidenceService.listRecorders()),
      requestId,
    );
  }

  @Post("recorders/:recorderId/health")
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
  getNoNewDispatchSignal(
    @Param("vehicleId") vehicleId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.vehicleEvidenceService.getNoNewDispatchSignal(vehicleId),
      requestId,
    );
  }

  @Post("recorders/:recorderId/freezes")
  @RequireRealms("platform", "ops")
  async requestEvidenceFreeze(
    @Param("recorderId") recorderId: string,
    @Body() body: Parameters<VehicleEvidenceService["requestEvidenceFreeze"]>[1],
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.vehicleEvidenceService.requestEvidenceFreeze(
        recorderId,
        body,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("freezes")
  @RequireRealms("platform", "ops")
  listEvidenceFreezes(
    @Query("recorderId") recorderId: string | undefined,
    @Query("vehicleId") vehicleId: string | undefined,
    @Query("caseId") caseId: string | undefined,
    @Query("status") status: string | undefined,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const query: EvidenceFreezeQuery = {};
    if (recorderId) {
      query.recorderId = recorderId;
    }
    if (vehicleId) {
      query.vehicleId = vehicleId;
    }
    if (caseId) {
      query.caseId = caseId;
    }
    if (status) {
      query.status = status as never;
    }

    return toApiSuccessEnvelope(
      toApiListData(
        this.vehicleEvidenceService.listEvidenceFreezes(
          query,
          requestId,
          identity,
        ),
      ),
      requestId,
    );
  }

  @Get("freezes/:freezeId")
  @RequireRealms("platform", "ops")
  getEvidenceFreeze(
    @Param("freezeId") freezeId: string,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.vehicleEvidenceService.getEvidenceFreeze(freezeId, requestId, identity),
      requestId,
    );
  }

  @Post("freezes/:freezeId/verify")
  @RequireRealms("platform", "ops")
  async verifyEvidenceFreeze(
    @Param("freezeId") freezeId: string,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.vehicleEvidenceService.verifyEvidenceFreeze(
        freezeId,
        requestId,
        identity,
      ),
      requestId,
    );
  }

  @Post("freezes/:freezeId/exports")
  @RequireRealms("platform", "ops")
  issueControlledExport(
    @Param("freezeId") freezeId: string,
    @Body() body: Parameters<VehicleEvidenceService["issueControlledExport"]>[1],
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.vehicleEvidenceService.issueControlledExport(
        freezeId,
        body,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("access-logs")
  @RequireRealms("platform", "ops")
  listEvidenceAccessLogs(
    @Query("freezeId") freezeId: string | undefined,
    @Query("action") action: string | undefined,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const query: EvidenceAccessLogQuery = {};
    if (freezeId) {
      query.freezeId = freezeId;
    }
    if (action) {
      query.action = action as never;
    }

    return toApiSuccessEnvelope(
      toApiListData(
        this.vehicleEvidenceService.listEvidenceAccessLogs(
          query,
          requestId,
          identity,
        ),
      ),
      requestId,
    );
  }

  @Post("artifacts/:artifactId/purge")
  @RequireRealms("platform")
  purgeArtifact(
    @Param("artifactId") artifactId: string,
    @Body() body: Parameters<VehicleEvidenceService["purgeArtifact"]>[1],
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.vehicleEvidenceService.purgeArtifact(
        artifactId,
        body,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("segments")
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
