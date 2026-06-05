import { Module } from "@nestjs/common";

import { ServiceProductController } from "./service-product.controller";

@Module({
  controllers: [ServiceProductController],
})
export class ServiceProductModule {}
