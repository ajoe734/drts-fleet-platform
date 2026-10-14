import { Injectable } from "@nestjs/common";
import type {
  CreatePlatformFareVersionCommand,
  MultiTaxiFareTariffParameters,
  RecordPlatformFareVersionFilingCommand,
  RetirePlatformFareVersionCommand,
  SchedulePlatformFareVersionCommand,
  UpdatePlatformFareVersionCommand,
} from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import { validateFareTariff } from "../../passenger-app/fare/fare.engine";
import { fareList, managedFare } from "./fare-version.mapping";
import { FareVersionRepository } from "./fare-version.repository";
import type {
  FareCommandContext,
  FareOperation,
  FareTransaction,
  FareVersionData,
} from "./fare-version.types";

function text(value: unknown, field: string, max = 10000): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new ApiRequestError(
      400,
      "fare_input_invalid",
      `${field} is required and must be within ${max} characters.`,
    );
  return value.trim();
}
function instant(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new ApiRequestError(
      400,
      "fare_input_invalid",
      "Effective time must be an ISO instant with a timezone.",
    );
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (
    calendar.toISOString().slice(0, 10) !== value.slice(0, 10) ||
    Number(value.slice(11, 13)) > 23
  )
    throw new ApiRequestError(
      400,
      "fare_input_invalid",
      "Effective time must name a valid calendar date and time.",
    );
  return new Date(value).toISOString();
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new ApiRequestError(
      400,
      "fare_input_invalid",
      "Expected revision must be a nonnegative integer.",
    );
  return value as number;
}
function draftInput(
  command: CreatePlatformFareVersionCommand | UpdatePlatformFareVersionCommand,
) {
  const normalized = {
    displayName: text(command.displayName, "Display name", 200),
    publicSummary: text(command.publicSummary, "Public summary"),
    sourceReference: text(command.sourceReference, "Approved source"),
    effectiveFrom: instant(command.effectiveFrom),
    tariff: structuredClone(command.tariff),
  };
  try {
    if (
      !normalized.tariff ||
      typeof normalized.tariff.additionalFees !== "object" ||
      normalized.tariff.additionalFees === null ||
      Array.isArray(normalized.tariff.additionalFees)
    )
      throw new RangeError("Additional fees must be a map.");
    // Existing authority columns use PostgreSQL integer values.
    for (const [name, value] of Object.entries(normalized.tariff))
      if (
        name !== "additionalFees" &&
        typeof value === "number" &&
        value > 2_147_483_647
      )
        throw new RangeError("Tariff value exceeds its stored integer range.");
    validateFareTariff({
      ...normalized.tariff,
      version: "validation",
      effectiveAt: normalized.effectiveFrom,
      effectiveUntil: null,
      sourceReference: normalized.sourceReference,
    });
  } catch {
    throw new ApiRequestError(
      400,
      "fare_input_invalid",
      "Fare amounts, increments, windows and approved rules must be valid.",
    );
  }
  // A clone copies tariff parameters; its new identity and effective window
  // come from the explicit draft command.
  const t = normalized.tariff;
  const tariff: MultiTaxiFareTariffParameters = {
    baseFare: t.baseFare,
    baseDistanceMeters: t.baseDistanceMeters,
    distanceRate: t.distanceRate,
    distanceIncrementMeters: t.distanceIncrementMeters,
    delayRate: t.delayRate,
    delayIncrementSeconds: t.delayIncrementSeconds,
    nightSurchargeAmount: t.nightSurchargeAmount,
    nightSurchargeWindowStart: t.nightSurchargeWindowStart,
    nightSurchargeWindowEnd: t.nightSurchargeWindowEnd,
    additionalFees: t.additionalFees,
    distanceRounding: t.distanceRounding,
    delayRounding: t.delayRounding,
    totalRounding: t.totalRounding,
    totalIncrement: t.totalIncrement,
    nightApplication: t.nightApplication,
  };
  return { ...normalized, tariff };
}
function find(tx: FareTransaction, version: string, expectedRevision: number) {
  const row = tx.records.find((item) => item.tariff.version === version);
  if (!row)
    throw new ApiRequestError(
      404,
      "fare_version_not_found",
      "Fare version was not found.",
    );
  if (row.revision !== expectedRevision)
    throw new ApiRequestError(
      409,
      "fare_revision_conflict",
      "Fare version changed. Reload the current version before saving.",
      { currentRevision: row.revision },
    );
  return row;
}
function conflict(message: string): never {
  throw new ApiRequestError(409, "fare_lifecycle_conflict", message);
}
function changed(
  row: FareVersionData,
  tx: FareTransaction,
  context: FareCommandContext,
): FareVersionData {
  return {
    ...structuredClone(row),
    revision: row.revision + 1,
    updatedAt: tx.evaluatedAt,
    updatedBy: context.actorId,
  };
}

@Injectable()
export class FareVersionService {
  constructor(private readonly repository: FareVersionRepository) {}

  async list() {
    return fareList(await this.repository.read());
  }

  async get(version: string) {
    const state = await this.repository.read();
    const row = state.records.find((item) => item.tariff.version === version);
    if (!row)
      throw new ApiRequestError(
        404,
        "fare_version_not_found",
        "Fare version was not found.",
      );
    return managedFare(row, state.evaluatedAt);
  }

  private execute(
    operation: FareOperation,
    version: string,
    payload: unknown,
    key: string | undefined,
    context: FareCommandContext,
    callback: (tx: FareTransaction) => Promise<void>,
  ) {
    const idempotencyKey = key?.trim();
    if (!idempotencyKey)
      throw new ApiRequestError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key is required for a fare command.",
      );
    if (idempotencyKey.length > 255)
      throw new ApiRequestError(
        400,
        "fare_input_invalid",
        "Operation key exceeds 255 characters.",
      );
    return this.repository.execute(
      {
        ...context,
        operation,
        version: text(version, "Fare version", 100),
        idempotencyKey,
        payload,
      },
      callback,
    );
  }

  create(
    command: CreatePlatformFareVersionCommand,
    key: string | undefined,
    context: FareCommandContext,
  ) {
    const version = text(command.fareVersionId, "Fare version", 100);
    const input = draftInput(command);
    return this.execute("create", version, input, key, context, async (tx) => {
      if (tx.records.some((row) => row.tariff.version === version))
        throw new ApiRequestError(
          409,
          "fare_version_exists",
          "This fare version already exists.",
        );
      await tx.save({
        tariff: {
          ...input.tariff,
          version,
          effectiveAt: input.effectiveFrom,
          effectiveUntil: null,
          sourceReference: input.sourceReference,
        },
        dbStatus: "draft",
        displayName: input.displayName,
        publicSummary: input.publicSummary,
        authorityFilingRef: null,
        filingEvidenceReference: null,
        filedAt: null,
        filedBy: null,
        revision: 1,
        createdAt: tx.evaluatedAt,
        createdBy: context.actorId,
        updatedAt: tx.evaluatedAt,
        updatedBy: context.actorId,
        retiredReason: null,
      });
    });
  }

  update(
    version: string,
    command: UpdatePlatformFareVersionCommand,
    key: string | undefined,
    context: FareCommandContext,
  ) {
    const input = {
      ...draftInput(command),
      expectedRevision: revision(command.expectedRevision),
    };
    return this.execute("update", version, input, key, context, async (tx) => {
      const row = find(tx, version, input.expectedRevision);
      if (row.dbStatus !== "draft" || row.filedAt !== null)
        conflict("Only an unfiled draft may be edited.");
      const next = changed(row, tx, context);
      next.tariff = {
        ...input.tariff,
        version,
        effectiveAt: input.effectiveFrom,
        effectiveUntil: null,
        sourceReference: input.sourceReference,
      };
      next.displayName = input.displayName;
      next.publicSummary = input.publicSummary;
      await tx.save(next);
    });
  }

  file(
    version: string,
    command: RecordPlatformFareVersionFilingCommand,
    key: string | undefined,
    context: FareCommandContext,
  ) {
    if (
      typeof command.authorityFilingRef !== "string" ||
      !command.authorityFilingRef.trim() ||
      typeof command.filingEvidenceReference !== "string" ||
      !command.filingEvidenceReference.trim()
    )
      throw new ApiRequestError(
        400,
        "fare_filing_metadata_required",
        "Actual filing reference and supporting evidence are required. The external filing simulation is separate.",
      );
    const input = {
      expectedRevision: revision(command.expectedRevision),
      authorityFilingRef: text(
        command.authorityFilingRef,
        "Filing reference",
        500,
      ),
      filingEvidenceReference: text(
        command.filingEvidenceReference,
        "Filing evidence",
        1000,
      ),
    };
    return this.execute("file", version, input, key, context, async (tx) => {
      const row = find(tx, version, input.expectedRevision);
      if (row.dbStatus !== "draft" || row.filedAt !== null)
        conflict(
          "Filing metadata is already final or the fare is no longer a draft.",
        );
      const next = changed(row, tx, context);
      next.authorityFilingRef = input.authorityFilingRef;
      next.filingEvidenceReference = input.filingEvidenceReference;
      next.filedAt = tx.evaluatedAt;
      next.filedBy = context.actorId;
      await tx.save(next);
    });
  }

  schedule(
    version: string,
    command: SchedulePlatformFareVersionCommand,
    key: string | undefined,
    context: FareCommandContext,
  ) {
    const input = {
      expectedRevision: revision(command.expectedRevision),
      effectiveFrom:
        command.effectiveFrom === null ? null : instant(command.effectiveFrom),
    };
    return this.execute(
      "schedule",
      version,
      input,
      key,
      context,
      async (tx) => {
        const row = find(tx, version, input.expectedRevision);
        if (row.dbStatus !== "draft" || row.filedAt === null)
          conflict("Only a filed, unpublished version can be scheduled.");
        const from = input.effectiveFrom ?? tx.evaluatedAt;
        const point = Date.parse(from);
        if (point < Date.parse(tx.evaluatedAt))
          throw new ApiRequestError(
            409,
            "fare_effective_time_conflict",
            "Publication cannot be backdated. Choose a future time or immediate activation.",
          );
        const published = tx.records
          .filter((item) => item.dbStatus === "published")
          .sort(
            (a, b) =>
              Date.parse(a.tariff.effectiveAt) -
              Date.parse(b.tariff.effectiveAt),
          );
        for (let i = 0; i < published.length; i++) {
          const current = published[i]!;
          validateFareTariff(current.tariff);
          if (Date.parse(current.tariff.effectiveAt) === point)
            throw new ApiRequestError(
              409,
              "fare_effective_time_conflict",
              "Another version already starts at this time.",
            );
          const previous = published[i - 1];
          if (
            previous &&
            (previous.tariff.effectiveUntil === null ||
              Date.parse(previous.tariff.effectiveUntil) !==
                Date.parse(current.tariff.effectiveAt))
          )
            throw new ApiRequestError(
              409,
              "fare_timeline_conflict",
              "The existing fare timeline has an overlap or gap.",
            );
        }
        const covering = published.filter(
          (item) =>
            Date.parse(item.tariff.effectiveAt) < point &&
            (item.tariff.effectiveUntil === null ||
              Date.parse(item.tariff.effectiveUntil) > point),
        );
        if (published.length && covering.length !== 1)
          throw new ApiRequestError(
            409,
            "fare_timeline_conflict",
            "No unique published interval covers the requested time.",
          );
        const next = changed(row, tx, context);
        next.dbStatus = "published";
        next.tariff.effectiveAt = from;
        next.tariff.effectiveUntil = covering[0]?.tariff.effectiveUntil ?? null;
        if (covering[0]) {
          const predecessor = changed(covering[0], tx, context);
          predecessor.tariff.effectiveUntil = from;
          await tx.save(predecessor);
        }
        await tx.save(next);
      },
    );
  }

  retire(
    version: string,
    command: RetirePlatformFareVersionCommand,
    key: string | undefined,
    context: FareCommandContext,
  ) {
    const input = {
      expectedRevision: revision(command.expectedRevision),
      reason: text(command.reason, "Retirement reason"),
    };
    return this.execute("retire", version, input, key, context, async (tx) => {
      const row = find(tx, version, input.expectedRevision);
      if (row.dbStatus === "retired" || row.retiredReason !== null)
        conflict("This fare version is already retired.");
      if (
        row.dbStatus === "published" &&
        (row.tariff.effectiveUntil === null ||
          Date.parse(row.tariff.effectiveUntil) > Date.parse(tx.evaluatedAt))
      )
        throw new ApiRequestError(
          409,
          "fare_replacement_required",
          "Schedule a filed replacement before retiring a current or future published fare.",
        );
      const next = changed(row, tx, context);
      // Historical published rows remain queryable by the original reader.
      if (row.dbStatus === "draft") next.dbStatus = "retired";
      next.retiredReason = input.reason;
      await tx.save(next);
    });
  }
}
