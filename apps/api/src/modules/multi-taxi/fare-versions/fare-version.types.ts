import type {
  AuditLogRecord,
  MultiTaxiManagedFareVersion,
} from "@drts/contracts";
import type { FareTariff } from "../../passenger-app/fare/fare.types";

export type FareOperation =
  | "create"
  | "update"
  | "file"
  | "schedule"
  | "retire";
export interface FareVersionData {
  tariff: FareTariff;
  dbStatus: "draft" | "published" | "retired";
  displayName: string;
  publicSummary: string;
  authorityFilingRef: string | null;
  filingEvidenceReference: string | null;
  filedAt: string | null;
  filedBy: string | null;
  revision: number;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string;
  retiredReason: string | null;
}
export interface FareState {
  records: FareVersionData[];
  evaluatedAt: string;
}
export interface FareTransaction extends FareState {
  save(record: FareVersionData): Promise<void>;
}
export interface FareCommandContext {
  actorId: string;
  actorType: AuditLogRecord["actorType"];
  requestId?: string;
}
export interface FareCommandInput extends FareCommandContext {
  operation: FareOperation;
  version: string;
  idempotencyKey: string;
  payload: unknown;
}
export interface FareVersionStore {
  read(): Promise<FareState>;
  execute(
    input: FareCommandInput,
    operation: (transaction: FareTransaction) => Promise<void>,
  ): Promise<MultiTaxiManagedFareVersion>;
}
