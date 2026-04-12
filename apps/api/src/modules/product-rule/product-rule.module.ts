import { Module } from "@nestjs/common";

import { ProductRuleController } from "./product-rule.controller";

@Module({
  controllers: [ProductRuleController],
})
export class ProductRuleModule {}
