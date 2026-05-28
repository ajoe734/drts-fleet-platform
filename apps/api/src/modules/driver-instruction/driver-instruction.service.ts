import { Injectable } from "@nestjs/common";
import { DriverInstructionRepository, DriverOpsInstructionRecord } from "./driver-instruction.repository";

@Injectable()
export class DriverInstructionService {
  constructor(private readonly repository: DriverInstructionRepository) {}

  async createInstruction(driverId: string, instructionText: string, expiresAt: string): Promise<string | null> {
    return this.repository.create({ driverId, instructionText, expiresAt });
  }

  async getInstructionsForDriver(driverId: string): Promise<DriverOpsInstructionRecord[]> {
    return this.repository.getForDriver(driverId);
  }

  async acknowledgeInstruction(id: string, driverId: string): Promise<boolean> {
    return this.repository.acknowledge(id, driverId);
  }
}
