import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { PaymentChargeRepository } from "./payment-charge.repository";
import { PaymentChargeService } from "./payment-charge.service";

/** Hosted API worker, analogous to PartnerNotificationWorker. Poll cadence is
 * operational only; all financial eligibility/delays come from durable state
 * and the explicitly injected policy. This class is never started on the VM.
 */
@Injectable()
export class PaymentChargeWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;
  private stopping = false;
  // Scan progress only, never delivery/claim authority. Retained requests with
  // no lawful route must not monopolize every batch. Wrap after the last page
  // so earlier requests are retried when their route becomes eligible.
  private recoveryNoticeAfterOrderId: string | null = null;
  constructor(
    private readonly repository: PaymentChargeRepository,
    private readonly service: PaymentChargeService,
  ) {}

  onApplicationBootstrap(): void {
    if (
      this.timer ||
      this.stopping ||
      !this.repository.isEnabled() ||
      !(
        this.service.isCaptureConfigured() ||
        this.service.isRecoveryNoticeConfigured()
      )
    )
      return;
    this.timer = setInterval(() => this.poll(), 1_000);
    this.timer.unref?.();
    this.poll();
  }

  private poll(): void {
    if (this.stopping || this.inFlight) return;
    this.inFlight = this.drain()
      .catch(() => undefined)
      .finally(() => {
        this.inFlight = null;
      });
  }

  private async drain(): Promise<void> {
    const orders = this.service.isCaptureConfigured()
      ? await this.repository.listDueOrders(25)
      : [];
    await Promise.all(
      orders.map(async (orderId) => {
        if (this.stopping) return;
        // Another replica's order claim or a persistence-unknown operation stays
        // durable and eligible for the next poll; raw errors never enter logs.
        await this.service.processOrder(orderId).catch(() => undefined);
      }),
    );
    if (this.service.isRecoveryNoticeConfigured()) {
      const notices = await this.repository.listRecoveryNoticeOrders(
        25,
        this.recoveryNoticeAfterOrderId,
      );
      await Promise.all(
        notices.map(async (orderId) => {
          if (!this.stopping)
            await this.service
              .processRecoveryNotice(orderId)
              .catch(() => undefined);
        }),
      );
      this.recoveryNoticeAfterOrderId = notices.at(-1) ?? null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.inFlight;
  }
}
