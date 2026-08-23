import { Module } from "@nestjs/common";

import { ControlledDownloadController } from "./controlled-download.controller";

@Module({
  controllers: [ControlledDownloadController],
})
export class ControlledDownloadModule {}
