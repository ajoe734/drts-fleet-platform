import { Module } from "@nestjs/common";

import { DatabaseModule, DatabaseService } from "../../common/db";
import { createNotificationDeliveryServiceFromEnv } from "../notification-delivery/notification-delivery.factory";
import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";
import { TenantInvoiceMailController } from "./tenant-invoice-mail.controller";
import { TenantInvoiceMailService } from "./tenant-invoice-mail.service";
import { IdempotencyModule } from "../../common/idempotency";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ControlledDownloadModule } from "../controlled-download/controlled-download.module";
import { BillingSettlementRepository } from "./billing-settlement.repository";
import { BillingSettlementController } from "./billing-settlement.controller";
import { BillingSettlementService } from "./billing-settlement.service";
import {
  PAYMENT_RECOVERY_PORT,
  PlatformManualPaymentRecoveryPort,
} from "./payment-recovery.port";
import { ReferralSettlementScaffoldService } from "./referral-settlement.scaffold.service";
import { RemittanceProofService } from "./remittance-proof.service";
import {
  REMITTANCE_PROOF_SCANNER,
  type RemittanceProofScannerPort,
} from "./remittance-proof-scanner.port";
import {
  createRemittanceProofScanner,
  createRemittanceProofStorage,
} from "./remittance-proof-runtime.config";
import { RemittanceProofDownloadController } from "./remittance-proof-download.controller";
import {
  REMITTANCE_PROOF_STORAGE,
  type RemittanceProofStorageProvider,
} from "./remittance-proof-storage.port";

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
  controllers: [
    BillingSettlementController,
    RemittanceProofDownloadController,
    TenantInvoiceMailController,
  ],
  providers: [
    TenantInvoiceMailService,
    {
      provide: NotificationDeliveryService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        createNotificationDeliveryServiceFromEnv(process.env, database),
    },
    BillingSettlementService,
    BillingSettlementRepository,
    PlatformManualPaymentRecoveryPort,
    // retry_capture remains unavailable (no PSP/issuer is integrated); see
    // PlatformManualPaymentRecoveryPort for the exact confirmed boundary.
    {
      provide: PAYMENT_RECOVERY_PORT,
      useExisting: PlatformManualPaymentRecoveryPort,
    },
    ReferralSettlementScaffoldService,
    RemittanceProofService,
    // Explicit runtime providers; missing configuration cannot pretend durable
    // storage or a clean malware verdict. Memory storage is test-only.
    {
      provide: REMITTANCE_PROOF_STORAGE,
      useFactory: (): RemittanceProofStorageProvider =>
        createRemittanceProofStorage(),
    },
    {
      provide: REMITTANCE_PROOF_SCANNER,
      inject: [REMITTANCE_PROOF_STORAGE],
      useFactory: (
        storage: RemittanceProofStorageProvider,
      ): RemittanceProofScannerPort => createRemittanceProofScanner(storage),
    },
  ],
  exports: [BillingSettlementService, ReferralSettlementScaffoldService],
})
export class BillingSettlementModule {}
