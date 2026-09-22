import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";

import { MultiTaxiRepository } from "./multi-taxi.repository";
import {
  MultiTaxiService,
  PassengerPushClaimConflictError,
} from "./multi-taxi.service";
import {
  InjectPassengerPushPort,
  type PassengerPushPort,
} from "./passenger-push.port";

/** The sole passenger-notification scheduler; retry timing lives in the outbox. */
@Injectable()
export class PartnerNotificationWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private static readonly POLL_INTERVAL_MS = 1_000;
  private static readonly BATCH_SIZE = 25;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;
  private stopping = false;

  constructor(
    @Inject(MultiTaxiRepository)
    private readonly repository: MultiTaxiRepository,
    @Inject(MultiTaxiService)
    private readonly service: MultiTaxiService,
    @InjectPassengerPushPort()
    private readonly port: PassengerPushPort,
  ) {}

  onApplicationBootstrap() {
    // Wait for every module's durable state to load, including tenant governance.
    // Per-route readiness is evaluated by delivery so absent configuration gets
    // a durable typed outcome instead of silently disabling the whole worker.
    if (
      this.timer ||
      this.stopping ||
      this.port.transportMode !== "partner_webhook" ||
      !this.repository.isEnabled()
    )
      return;
    this.timer = setInterval(
      () => this.poll(),
      PartnerNotificationWorker.POLL_INTERVAL_MS,
    );
    this.timer.unref?.();
    this.poll();
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.inFlight;
  }

  private poll() {
    if (this.stopping || this.inFlight) return;
    this.inFlight = this.dispatchDue()
      .catch((error: unknown) => {
        this.repository.reportPersistenceFailure(error, "partner outbox poll");
      })
      .finally(() => {
        this.inFlight = null;
      });
  }

  private async dispatchDue() {
    const rows = await this.repository.listDuePartnerNotifications(
      PartnerNotificationWorker.BATCH_SIZE,
    );
    // Bounded parallelism keeps a slow endpoint from blocking the whole batch.
    // The service reclaims/revalidates each row under its existing DB fence.
    await Promise.all(
      rows.map(async (row) => {
        if (this.stopping) return;
        try {
          await this.service.deliverPassengerNotification(row);
        } catch (error) {
          if (error instanceof PassengerPushClaimConflictError) return;
          // Persistence-unknown retains its lease. Only durable due selection
          // may recover it; there is no per-message timer or immediate resend.
          this.repository.reportPersistenceFailure(
            error,
            "partner outbox delivery",
          );
        }
      }),
    );
  }
}
