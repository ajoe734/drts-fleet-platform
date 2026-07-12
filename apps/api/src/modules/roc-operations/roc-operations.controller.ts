import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from "@nestjs/common";

import type {
  AssignRocAlertCommand,
  NotifyRocAlertCommand,
  OpenRocIncidentCommand,
  RocAlertActionCommand,
  RequestRocSafetyActionCommand,
  StartRocEvidenceFreezeCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import {
  buildEmptyStateEnvelope,
  buildUiReadModelList,
  buildUiReadModelResource,
} from "../../common/ui-read-model";
import { RocOperationsService } from "./roc-operations.service";

const ROC_URGENT_REFRESH_MS = 5_000;
const ROC_PROVIDER_REFRESH_MS = 15_000;

@RequireRealms("system", "ops")
@Controller("roc")
export class RocOperationsController {
  constructor(private readonly rocOperationsService: RocOperationsService) {}

  @Get("overview")
  getOverview(
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    const overview = this.rocOperationsService.getOverview(identity);
    return toApiSuccessEnvelope(
      buildUiReadModelResource(overview, {
        staleAfterMs: ROC_URGENT_REFRESH_MS,
        dataFreshness:
          overview.providerHealth.status === "healthy" ? "fresh" : "degraded",
        source: "sandbox",
        generatedAt: overview.generatedAt,
      }),
      requestId,
    );
  }

  @Get("vehicles")
  listVehicles(
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(this.rocOperationsService.listVehicles(identity), {
        staleAfterMs: ROC_URGENT_REFRESH_MS,
        source: "sandbox",
        emptyState: buildEmptyStateEnvelope("no_data", "roc.vehicles.empty"),
      }),
      requestId,
    );
  }

  @Get("trips")
  listTrips(
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(this.rocOperationsService.listTrips(identity), {
        staleAfterMs: ROC_URGENT_REFRESH_MS,
        source: "sandbox",
        emptyState: buildEmptyStateEnvelope("no_data", "roc.trips.empty"),
      }),
      requestId,
    );
  }

  @Get("takeovers")
  listTakeovers(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(this.rocOperationsService.listTakeovers(), {
        staleAfterMs: ROC_URGENT_REFRESH_MS,
        source: "sandbox",
        emptyState: buildEmptyStateEnvelope("no_data", "roc.takeovers.empty"),
      }),
      requestId,
    );
  }

  @Get("alerts")
  listAlerts(
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(this.rocOperationsService.listAlerts(identity), {
        staleAfterMs: ROC_URGENT_REFRESH_MS,
        source: "sandbox",
        emptyState: buildEmptyStateEnvelope("no_data", "roc.alerts.empty"),
      }),
      requestId,
    );
  }

  @Get("provider-health")
  getProviderHealth(@Headers("x-request-id") requestId?: string) {
    const snapshot = this.rocOperationsService.getProviderHealthSnapshot();
    return toApiSuccessEnvelope(
      buildUiReadModelResource(snapshot, {
        staleAfterMs: ROC_PROVIDER_REFRESH_MS,
        dataFreshness:
          snapshot.health.status === "healthy" ? "fresh" : "degraded",
        source: "sandbox",
        generatedAt: snapshot.health.lastCheckedAt,
      }),
      requestId,
    );
  }

  @Post("alerts/:alertId/ack")
  ackAlert(
    @Param("alertId") alertId: string,
    @Body() command: RocAlertActionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.rocOperationsService.ackAlert(alertId, command, identity),
      requestId,
    );
  }

  @Post("alerts/:alertId/assign")
  assignAlert(
    @Param("alertId") alertId: string,
    @Body() command: AssignRocAlertCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.rocOperationsService.assignAlert(alertId, command, identity),
      requestId,
    );
  }

  @Post("alerts/:alertId/stop-new-dispatch")
  stopNewDispatch(
    @Param("alertId") alertId: string,
    @Body() command: RocAlertActionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.rocOperationsService.stopNewDispatch(alertId, command, identity),
      requestId,
    );
  }

  @Post("alerts/:alertId/operational-hold")
  operationalHold(
    @Param("alertId") alertId: string,
    @Body() command: RocAlertActionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.rocOperationsService.startOperationalHold(alertId, command, identity),
      requestId,
    );
  }

  @Post("alerts/:alertId/request-safety-action")
  async requestSafetyAction(
    @Param("alertId") alertId: string,
    @Body() command: RequestRocSafetyActionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      await this.rocOperationsService.requestSafetyAction(
        alertId,
        command,
        identity,
      ),
      requestId,
    );
  }

  @Post("alerts/:alertId/open-incident")
  openIncident(
    @Param("alertId") alertId: string,
    @Body() command: OpenRocIncidentCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.rocOperationsService.openIncident(alertId, command, identity),
      requestId,
    );
  }

  @Post("alerts/:alertId/start-evidence-freeze")
  startEvidenceFreeze(
    @Param("alertId") alertId: string,
    @Body() command: StartRocEvidenceFreezeCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.rocOperationsService.startEvidenceFreeze(
        alertId,
        command,
        identity,
      ),
      requestId,
    );
  }

  @Post("alerts/:alertId/fallback-to-human")
  fallbackToHuman(
    @Param("alertId") alertId: string,
    @Body() command: RocAlertActionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.rocOperationsService.fallbackToHuman(alertId, command, identity),
      requestId,
    );
  }

  @Post("alerts/:alertId/notify")
  notify(
    @Param("alertId") alertId: string,
    @Body() command: NotifyRocAlertCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.rocOperationsService.notify(alertId, command, identity),
      requestId,
    );
  }

  @Post("alerts/:alertId/resolve")
  resolve(
    @Param("alertId") alertId: string,
    @Body() command: RocAlertActionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.rocOperationsService.resolveAlert(alertId, command, identity),
      requestId,
    );
  }
}
