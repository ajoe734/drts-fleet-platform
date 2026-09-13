import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { IdempotencyModule } from "../../common/idempotency";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ControlledDownloadModule } from "../controlled-download/controlled-download.module";
import { BillingSettlementRepository } from "./billing-settlement.repository";
import { BillingSettlementController } from "./billing-settlement.controller";
import { BillingSettlementService } from "./billing-settlement.service";
import {
  PAYMENT_RECOVERY_PORT,
  UnavailablePaymentRecoveryPort,
} from "./payment-recovery.port";
import { ReferralSettlementScaffoldService } from "./referral-settlement.scaffold.service";
import { RemittanceProofService } from "./remittance-proof.service";
import {
  REMITTANCE_PROOF_SCANNER,
  type RemittanceProofScannerPort,
} from "./remittance-proof-scanner.port";
import { UnprovisionedRemittanceProofScannerAdapter } from "./remittance-proof-scanner.adapter";
import {
  REMITTANCE_PROOF_STORAGE,
  type RemittanceProofStorageProvider,
} from "./remittance-proof-storage.port";
import { InMemoryRemittanceProofStorageAdapter } from "./remittance-proof-storage.adapter";

@Module({
  imports: [
    DatabaseModule,
    IdempotencyModule,
    AuditNotificationModule,
    // Shares the same `DOCUMENT_ARTIFACT_STORE` singleton as
    // `ControlledDownloadController` (both import this module class into the
    // same app graph): the PDF this module renders and puts must be readable
    // by the controller that answers the signed link pointing at it.
    ControlledDownloadModule,
  ],
  controllers: [BillingSettlementController],
  providers: [
    BillingSettlementService,
    BillingSettlementRepository,
    UnavailablePaymentRecoveryPort,
    {
      provide: PAYMENT_RECOVERY_PORT,
      useExisting: UnavailablePaymentRecoveryPort,
    },
    ReferralSettlementScaffoldService,
    RemittanceProofService,
    // Always available: an in-process, non-durable default -- the same
    // durability posture `DOCUMENT_ARTIFACT_STORE` uses elsewhere in this
    // module graph. See `remittance-proof-storage.adapter.ts`.
    {
      provide: REMITTANCE_PROOF_STORAGE,
      useFactory: (): RemittanceProofStorageProvider =>
        new InMemoryRemittanceProofStorageAdapter(),
    },
    // Fail-closed by default: no malware-scanning provider is configured,
    // so an uploaded proof stays `pending_scan` until a real scanner
    // integration is provisioned. See `remittance-proof-scanner.adapter.ts`.
    {
      provide: REMITTANCE_PROOF_SCANNER,
      useFactory: (): RemittanceProofScannerPort =>
        new UnprovisionedRemittanceProofScannerAdapter(),
    },
  ],
  exports: [BillingSettlementService, ReferralSettlementScaffoldService],
})
export class BillingSettlementModule {}
