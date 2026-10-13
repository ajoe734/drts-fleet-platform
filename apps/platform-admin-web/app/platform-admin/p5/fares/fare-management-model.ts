import type {
  CreatePlatformFareVersionCommand,
  MultiTaxiFareManagementList,
  MultiTaxiFareTariffParameters,
  MultiTaxiManagedFareVersion,
} from "@drts/contracts";

export const numericFareFields = [
  "baseFare",
  "baseDistanceMeters",
  "distanceRate",
  "distanceIncrementMeters",
  "delayRate",
  "delayIncrementSeconds",
  "nightSurchargeAmount",
  "totalIncrement",
] as const;
export const fareRuleFields = {
  distanceRounding: ["ceil", "floor"],
  delayRounding: ["ceil", "floor"],
  totalRounding: ["ceil", "floor", "nearest"],
  nightApplication: ["pickup", "any_overlap"],
} as const;
type Parameter = Exclude<keyof MultiTaxiFareTariffParameters, "additionalFees">;
export interface FareEditor {
  fareVersionId: string;
  displayName: string;
  publicSummary: string;
  sourceReference: string;
  effectiveLocal: string;
  parameters: Record<Parameter, string>;
  fees: { name: string; amount: string }[];
}

export function emptyFareEditor(): FareEditor {
  const parameters = Object.fromEntries(
    Object.keys(demoTariff)
      .filter((key) => key !== "additionalFees")
      .map((key) => [key, ""]),
  ) as Record<Parameter, string>;
  return {
    fareVersionId: "",
    displayName: "",
    publicSummary: "",
    sourceReference: "",
    effectiveLocal: taiwanDateInput(
      new Date(Date.now() + 86_400_000).toISOString(),
    ),
    parameters,
    fees: [],
  };
}

export function taiwanDateInput(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 16);
}

export function taiwanDateISO(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error("fare_input_invalid");
  const date = new Date(`${local}:00+08:00`);
  if (
    !Number.isFinite(date.getTime()) ||
    taiwanDateInput(date.toISOString()) !== local
  ) {
    throw new Error("fare_input_invalid");
  }
  return date.toISOString();
}

// Used exclusively by the labeled, isolated demonstration, never live reads.
const demoTariff: MultiTaxiFareTariffParameters = {
  baseFare: 85,
  baseDistanceMeters: 1250,
  distanceRate: 5,
  distanceIncrementMeters: 200,
  delayRate: 5,
  delayIncrementSeconds: 60,
  nightSurchargeAmount: 20,
  nightSurchargeWindowStart: "23:00",
  nightSurchargeWindowEnd: "06:00",
  additionalFees: {},
  distanceRounding: "ceil",
  delayRounding: "floor",
  totalRounding: "floor",
  totalIncrement: 5,
  nightApplication: "pickup",
};

export function fareEditor(
  record: MultiTaxiManagedFareVersion,
  create: boolean,
): FareEditor {
  const { additionalFees, ...parameters } = record.tariff;
  return {
    fareVersionId: create ? "" : record.fareVersionId,
    displayName: create ? "" : record.displayName,
    publicSummary: record.publicSummary,
    sourceReference: record.sourceReference,
    effectiveLocal: taiwanDateInput(
      create
        ? new Date(Date.now() + 86_400_000).toISOString()
        : record.effectiveFrom,
    ),
    parameters: Object.fromEntries(
      Object.entries(parameters).map(([key, value]) => [key, String(value)]),
    ) as Record<Parameter, string>,
    fees: Object.entries(additionalFees).map(([name, amount]) => ({
      name,
      amount: String(amount),
    })),
  };
}

export function fareEditorCommand(
  editor: FareEditor,
): CreatePlatformFareVersionCommand {
  const numbers = Object.fromEntries(
    numericFareFields.map((key) => {
      const value = editor.parameters[key];
      const number = Number(value);
      if (
        !value.trim() ||
        !Number.isSafeInteger(number) ||
        number < 0 ||
        number > 2_147_483_647 ||
        ([
          "baseDistanceMeters",
          "distanceIncrementMeters",
          "delayIncrementSeconds",
          "totalIncrement",
        ].includes(key) &&
          number === 0)
      )
        throw new Error("fare_input_invalid");
      return [key, number];
    }),
  ) as Record<(typeof numericFareFields)[number], number>;
  for (const value of [
    editor.fareVersionId,
    editor.displayName,
    editor.publicSummary,
    editor.sourceReference,
  ]) {
    if (!value.trim()) throw new Error("fare_input_invalid");
  }
  for (const [key, options] of Object.entries(fareRuleFields)) {
    if (
      !(options as readonly string[]).includes(
        editor.parameters[key as keyof typeof fareRuleFields],
      )
    )
      throw new Error("fare_input_invalid");
  }
  for (const key of [
    "nightSurchargeWindowStart",
    "nightSurchargeWindowEnd",
  ] as const) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(editor.parameters[key]))
      throw new Error("fare_input_invalid");
  }
  const names = new Set<string>();
  const fees = Object.fromEntries(
    editor.fees.map(({ name: rawName, amount }) => {
      const name = rawName;
      const value = Number(amount);
      if (
        !name.trim() ||
        names.has(name) ||
        !amount.trim() ||
        !Number.isSafeInteger(value) ||
        value < 0
      )
        throw new Error("fare_input_invalid");
      names.add(name);
      return [name, value];
    }),
  );
  return {
    fareVersionId: editor.fareVersionId.trim(),
    displayName: editor.displayName.trim(),
    publicSummary: editor.publicSummary.trim(),
    sourceReference: editor.sourceReference.trim(),
    effectiveFrom: taiwanDateISO(editor.effectiveLocal),
    tariff: {
      ...editor.parameters,
      ...numbers,
      additionalFees: fees,
    } as MultiTaxiFareTariffParameters,
  };
}

export function demoFareList(
  at = new Date().toISOString(),
): MultiTaxiFareManagementList {
  const record: MultiTaxiManagedFareVersion = {
    fareVersionId: "demo-current",
    displayName: "demo-current",
    status: "active",
    effectiveFrom: "2023-03-31T16:00:00.000Z",
    effectiveUntil: null,
    publicSummary: "",
    sourceReference: "demo / 2026-10-10 approved rates",
    authorityFilingRef: null,
    filingEvidenceReference: null,
    filedAt: null,
    filedBy: null,
    revision: 0,
    tariff: structuredClone(demoTariff),
    currency: "TWD",
    nightSurchargeUnit: "TWD_per_trip",
    publicationScheduled: false,
    scheduledFor: null,
    createdAt: at,
    updatedAt: at,
    availableActions: {
      edit: false,
      file: false,
      schedule: false,
      retire: false,
    },
    retirementBlockedReason: "replacement_required",
  };
  return {
    items: [record],
    evaluatedAt: at,
    activeFareVersionId: record.fareVersionId,
  };
}

export function evaluateDemo(
  view: MultiTaxiFareManagementList,
  at: string,
): MultiTaxiFareManagementList {
  const items = view.items.map((record) => {
    if (
      record.status === "draft" ||
      (record.status === "filed" && !record.publicationScheduled)
    )
      return record;
    if (record.status === "retired" && !record.availableActions.retire)
      return record;
    const upcoming = record.effectiveFrom > at;
    const ended = record.effectiveUntil !== null && record.effectiveUntil <= at;
    return {
      ...record,
      status: ended
        ? ("retired" as const)
        : upcoming
          ? ("filed" as const)
          : ("active" as const),
      publicationScheduled: upcoming && !ended,
      scheduledFor: upcoming && !ended ? record.effectiveFrom : null,
      availableActions: {
        edit: false,
        file: false,
        schedule: false,
        retire: ended,
      },
      retirementBlockedReason: ended ? null : ("replacement_required" as const),
    };
  });
  return {
    items,
    evaluatedAt: at,
    activeFareVersionId:
      items.find((item) => item.status === "active")?.fareVersionId ?? null,
  };
}

export function demoCreate(
  view: MultiTaxiFareManagementList,
  command: CreatePlatformFareVersionCommand,
): MultiTaxiFareManagementList {
  if (view.items.some((item) => item.fareVersionId === command.fareVersionId))
    throw new Error("fare_version_exists");
  const record: MultiTaxiManagedFareVersion = {
    ...demoFareList(view.evaluatedAt).items[0]!,
    ...command,
    effectiveUntil: null,
    status: "draft",
    revision: 0,
    currency: "TWD",
    nightSurchargeUnit: "TWD_per_trip",
    availableActions: { edit: true, file: true, schedule: false, retire: true },
    retirementBlockedReason: null,
  };
  return { ...view, items: [record, ...view.items] };
}

export function demoChange(
  view: MultiTaxiFareManagementList,
  id: string,
  change: Partial<MultiTaxiManagedFareVersion>,
): MultiTaxiFareManagementList {
  return {
    ...view,
    items: view.items.map((item) =>
      item.fareVersionId === id
        ? {
            ...item,
            ...change,
            revision: item.revision + 1,
            updatedAt: view.evaluatedAt,
          }
        : item,
    ),
  };
}

export function demoSchedule(
  view: MultiTaxiFareManagementList,
  id: string,
  from: string | null,
): MultiTaxiFareManagementList {
  const at = from ?? view.evaluatedAt;
  if (at < view.evaluatedAt) throw new Error("fare_effective_time_conflict");
  const target = view.items.find((item) => item.fareVersionId === id);
  if (!target?.availableActions.schedule)
    throw new Error("fare_lifecycle_conflict");
  const covering = view.items.find(
    (item) =>
      item.fareVersionId !== id &&
      (item.status === "active" ||
        item.publicationScheduled ||
        (item.status === "retired" && item.effectiveUntil)) &&
      item.effectiveFrom <= at &&
      (!item.effectiveUntil || item.effectiveUntil > at),
  );
  if (!covering || covering.effectiveFrom === at)
    throw new Error("fare_effective_time_conflict");
  let next = demoChange(view, covering.fareVersionId, { effectiveUntil: at });
  next = demoChange(next, id, {
    effectiveFrom: at,
    effectiveUntil: covering.effectiveUntil,
    status: "active",
    publicationScheduled: true,
    scheduledFor: at,
  });
  return evaluateDemo(next, view.evaluatedAt);
}
