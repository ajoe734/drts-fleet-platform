import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { IncidentModule } from "../incident/incident.module";
import {
  DriverSosController,
  OpsDriverSosController,
} from "./driver-sos.controller";
import {
  DRIVER_SOS_ATTACHMENT_SCANNER,
  DRIVER_SOS_ATTACHMENT_STORAGE,
} from "./driver-sos-attachment.ports";
import {
  resolveDriverSosHttpsScannerConfig,
  resolveDriverSosS3StorageConfig,
} from "./driver-sos-provider.config";
import { DriverSosRepository } from "./driver-sos.repository";
import { DriverSosService } from "./driver-sos.service";
import { DriverSosVerificationRepository } from "./driver-sos-verification.repository";
import { HttpsJsonDriverSosAttachmentScannerAdapter } from "./https-json-driver-sos-attachment-scanner.adapter";
import { S3DriverSosAttachmentStorageAdapter } from "./s3-driver-sos-attachment-storage.adapter";

export function createDriverSosAttachmentStorageProvider(
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = resolveDriverSosS3StorageConfig(env);
  return config ? new S3DriverSosAttachmentStorageAdapter(config) : undefined;
}

export function createDriverSosAttachmentScanner(
  env: NodeJS.ProcessEnv = process.env,
) {
  const storageConfig = resolveDriverSosS3StorageConfig(env);
  const scannerConfig = resolveDriverSosHttpsScannerConfig(env, storageConfig);
  return scannerConfig
    ? new HttpsJsonDriverSosAttachmentScannerAdapter(scannerConfig)
    : undefined;
}

@Module({
  imports: [DatabaseModule, AuditNotificationModule, IncidentModule],
  controllers: [DriverSosController, OpsDriverSosController],
  providers: [
    DriverSosRepository,
    DriverSosVerificationRepository,
    {
      provide: DRIVER_SOS_ATTACHMENT_STORAGE,
      useFactory: () => createDriverSosAttachmentStorageProvider(),
    },
    {
      provide: DRIVER_SOS_ATTACHMENT_SCANNER,
      useFactory: () => createDriverSosAttachmentScanner(),
    },
    DriverSosService,
  ],
  exports: [DriverSosService],
})
export class DriverSosModule {}
