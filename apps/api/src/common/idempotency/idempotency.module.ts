import { Module } from "@nestjs/common";

import { DatabaseModule } from "../db/database.module";
import { IdempotencyRepository } from "./idempotency.repository";
import { IdempotencyService } from "./idempotency.service";

@Module({
  imports: [DatabaseModule],
  providers: [IdempotencyRepository, IdempotencyService],
  exports: [IdempotencyRepository, IdempotencyService],
})
export class IdempotencyModule {}
