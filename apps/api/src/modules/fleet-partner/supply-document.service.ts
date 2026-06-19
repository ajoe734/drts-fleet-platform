import { Injectable } from "@nestjs/common";

import type { SupplyDocumentRecord } from "@drts/contracts";

@Injectable()
export class SupplyDocumentService {
  registerDocument(_document: SupplyDocumentRecord): never {
    throw new Error("Supply document scaffolding is not implemented yet.");
  }

  listDocuments(_submissionId: string): SupplyDocumentRecord[] {
    return [];
  }
}
