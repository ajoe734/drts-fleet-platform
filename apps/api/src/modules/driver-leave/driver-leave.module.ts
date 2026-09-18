import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../common/db/database.module";
import { IdempotencyModule } from "../../common/idempotency";
import { DriverLeaveController } from "./driver-leave.controller";
import { DriverLeaveRepository } from "./driver-leave.repository";
import { DriverLeaveService } from "./driver-leave.service";

@Module({
  imports: [DatabaseModule, IdempotencyModule],
  controllers: [DriverLeaveController],
  providers: [DriverLeaveRepository, DriverLeaveService],
  exports: [DriverLeaveService, DriverLeaveRepository],
})
export class DriverLeaveModule {}
