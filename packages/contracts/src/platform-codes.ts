export const PLATFORM_CODE_UBER = "uber";
export const PLATFORM_CODE_GRAB = "grab";
export const PLATFORM_CODE_LINE_TAXI = "line-taxi";
export const PLATFORM_CODE_GRAB_TAIWAN = "grab_taiwan";
export const PLATFORM_CODE_INDRIVER = "indriver";

export const PLATFORM_CODES = [
  PLATFORM_CODE_UBER,
  PLATFORM_CODE_GRAB,
  PLATFORM_CODE_LINE_TAXI,
  PLATFORM_CODE_GRAB_TAIWAN,
  PLATFORM_CODE_INDRIVER,
] as const;
export type PlatformCode = (typeof PLATFORM_CODES)[number];

export type PlatformCatalogStatus =
  | "runtime_seeded"
  | "forwarder_stub"
  | "catalog_only";

export interface PlatformCodeRegistryEntry {
  code: PlatformCode;
  displayName: string;
  status: PlatformCatalogStatus;
  forwarderAdapterKey: PlatformCode | null;
}

export const PLATFORM_CODE_REGISTRY: Record<
  PlatformCode,
  PlatformCodeRegistryEntry
> = {
  [PLATFORM_CODE_UBER]: {
    code: PLATFORM_CODE_UBER,
    displayName: "Uber",
    status: "runtime_seeded",
    forwarderAdapterKey: null,
  },
  [PLATFORM_CODE_GRAB]: {
    code: PLATFORM_CODE_GRAB,
    displayName: "Grab",
    status: "runtime_seeded",
    forwarderAdapterKey: null,
  },
  [PLATFORM_CODE_LINE_TAXI]: {
    code: PLATFORM_CODE_LINE_TAXI,
    displayName: "LINE Taxi",
    status: "runtime_seeded",
    forwarderAdapterKey: null,
  },
  [PLATFORM_CODE_GRAB_TAIWAN]: {
    code: PLATFORM_CODE_GRAB_TAIWAN,
    displayName: "Grab Taiwan",
    status: "forwarder_stub",
    forwarderAdapterKey: PLATFORM_CODE_GRAB_TAIWAN,
  },
  [PLATFORM_CODE_INDRIVER]: {
    code: PLATFORM_CODE_INDRIVER,
    displayName: "InDriver",
    status: "catalog_only",
    forwarderAdapterKey: null,
  },
};
