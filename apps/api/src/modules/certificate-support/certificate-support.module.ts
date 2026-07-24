import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { CertificateSupportController } from "./certificate-support.controller";
import { CertificateSupportRepository } from "./certificate-support.repository";
import { CertificateSupportService } from "./certificate-support.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CertificateSupportController],
  providers: [CertificateSupportRepository, CertificateSupportService],
})
export class CertificateSupportModule {}
