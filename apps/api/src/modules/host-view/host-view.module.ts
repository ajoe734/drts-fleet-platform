import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../common/db";
import { HostViewController } from "./host-view.controller";
import { HostViewRepository } from "./host-view.repository";
import { HostViewService } from "./host-view.service";

@Module({
  imports: [DatabaseModule],
  controllers: [HostViewController],
  providers: [HostViewRepository, HostViewService],
  exports: [HostViewRepository, HostViewService],
})
export class HostViewModule {}
