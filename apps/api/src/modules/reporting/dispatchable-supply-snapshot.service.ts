import { Injectable } from "@nestjs/common";

@Injectable()
export class DispatchableSupplySnapshotService {
  captureSnapshot(_snapshotAt: string): void {}
}
