import type {
  AuditLogRecord,
  VehiclePassengerDisclosureProfile,
  DriverPublicRegistrationCredential,
} from "@drts/contracts";
export type DisclosureSubjectType = "vehicle" | "driver";
export type DisclosureRecord =
  | VehiclePassengerDisclosureProfile
  | DriverPublicRegistrationCredential;
export interface DisclosureReviewCommand {
  expectedVersion: number;
  sourceSubmissionId: string | null;
  action: "approve" | "return";
  reason: string;
}
export interface DisclosureReviewDecision {
  decisionId: string;
  operationKey: string;
  payloadHash: string;
  actorId: string;
  actorType: AuditLogRecord["actorType"];
  subjectType: DisclosureSubjectType;
  subjectId: string;
  action: "approve" | "return";
  reason: string;
  sourceSubmissionId: string | null;
  fromVersion: number;
  toVersion: number;
  decidedAt: string;
  record: DisclosureRecord;
  previousRecord: DisclosureRecord;
}
export interface DisclosureReviewItem {
  subjectType: DisclosureSubjectType;
  subjectId: string;
  label: string;
  sourceSubmissionId: string | null;
  version: number;
  record: DisclosureRecord;
  missingFieldCodes: string[];
  history: DisclosureReviewDecision[];
}
export function publicDisclosureRecord(
  record: DisclosureRecord,
  current = false,
): DisclosureRecord {
  const copy = structuredClone(record);
  if ("driverId" in copy) {
    const raw = copy.registrationNo;
    copy.registrationNo = null;
    if (!copy.maskedDisplay.includes("*"))
      copy.maskedDisplay =
        raw && raw.length > 4 ? `${raw.slice(0, 2)}***${raw.slice(-2)}` : "***";
    if (current && copy.status === "verified_active") {
      const today = new Date().toISOString().slice(0, 10);
      if (
        !copy.effectiveUntil ||
        !Number.isFinite(Date.parse(copy.effectiveUntil)) ||
        copy.effectiveUntil < today
      )
        copy.status = "expired";
      else if (!copy.effectiveFrom || copy.effectiveFrom > today)
        copy.status = "unverified";
    }
  }
  return copy;
}
export function disclosureMissingFields(
  record: DisclosureRecord,
  now = new Date(),
): string[] {
  const missing: string[] = [];
  if (!record.sourceSubmissionId?.trim()) missing.push("sourceSubmissionId");
  if ("vehicleId" in record) {
    if (!record.make?.trim()) missing.push("make");
    if (!record.model?.trim()) missing.push("model");
    if (!Number.isInteger(record.modelYear) || record.modelYear <= 0)
      missing.push("modelYear");
    if (
      !Number.isInteger(record.doorCount) ||
      record.doorCount < 3 ||
      record.doorCount > 6
    )
      missing.push("doorCount");
    // Central minimum permits null colour. Preserve canonical profile-specific
    // requirements (including Taipei) via its existing missingFieldCodes;
    // never infer a new colour policy from a city label or fill a default.
    for (const field of record.missingFieldCodes)
      if (!missing.includes(field)) missing.push(field);
  } else {
    if (!record.registrationNo?.trim()) missing.push("registrationNo");
    if (!record.registrationArea?.trim()) missing.push("registrationArea");
    const today = now.toISOString().slice(0, 10);
    if (
      !record.effectiveFrom ||
      !Number.isFinite(Date.parse(record.effectiveFrom)) ||
      record.effectiveFrom > today
    )
      missing.push("effectiveFrom");
    if (
      !record.effectiveUntil ||
      !Number.isFinite(Date.parse(record.effectiveUntil)) ||
      record.effectiveUntil < today ||
      (record.effectiveFrom && record.effectiveUntil < record.effectiveFrom)
    )
      missing.push("effectiveUntil");
  }
  return missing;
}
