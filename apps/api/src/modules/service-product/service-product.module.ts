import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ServiceProductController } from "./service-product.controller";
import { ServiceProductRepository } from "./service-product.repository";
import { ServiceProductService } from "./service-product.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [ServiceProductController],
  providers: [ServiceProductRepository, ServiceProductService],
  exports: [ServiceProductService],
})
export class ServiceProductModule {}
