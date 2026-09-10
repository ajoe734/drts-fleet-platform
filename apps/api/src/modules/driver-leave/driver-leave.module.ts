import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../common/db/database.module";
import { DriverLeaveController } from "./driver-leave.controller";
import { DriverLeaveRepository } from "./driver-leave.repository";
import { DriverLeaveService } from "./driver-leave.service";

@Module({
  imports: [DatabaseModule],
  controllers: [DriverLeaveController],
  providers: [DriverLeaveRepository, DriverLeaveService],
  exports: [DriverLeaveService, DriverLeaveRepository],
})
export class DriverLeaveModule {}
