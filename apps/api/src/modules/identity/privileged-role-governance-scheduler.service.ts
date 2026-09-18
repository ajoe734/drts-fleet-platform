import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrivilegedRoleGovernanceService } from "./privileged-role-governance.service";

@Injectable()
export class PrivilegedRoleGovernanceSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrivilegedRoleGovernanceSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly governanceService: PrivilegedRoleGovernanceService,
  ) {}

  onModuleInit() {
    const pollIntervalMs = Number(process.env.PRIVILEGED_ROLE_EXPIRY_POLL_MS) || 10000;
    this.logger.log(
      `Starting PrivilegedRoleGovernanceSchedulerService with interval ${pollIntervalMs}ms`,
    );
    this.timer = setInterval(() => {
      void this.tick();
    }, pollIntervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }
    this.isProcessing = true;
    try {
      const processed = await this.governanceService.expireStaleGrants();
      if (processed.length > 0) {
        this.logger.log(
          `Processed ${processed.length} expired/activated privileged role grant(s).`,
        );
      }
      return processed.length;
    } catch (error) {
      this.logger.error(
        "Error during privileged role grant reconciliation tick",
        error,
      );
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }
}
