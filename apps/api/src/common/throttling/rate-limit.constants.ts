import { minutes } from "@nestjs/throttler";

export const GLOBAL_RATE_LIMIT = [
  {
    ttl: minutes(1),
    limit: 60,
    blockDuration: minutes(5),
  },
] as const;

export const RATE_LIMIT_SKIP_DEFAULT = {
  default: true,
} as const;

export const OPEN_ROUTE_RATE_LIMIT = {
  default: {
    ttl: minutes(1),
    limit: 30,
  },
} as const;

export const READ_HEAVY_RATE_LIMIT = {
  default: {
    ttl: minutes(1),
    limit: 180,
  },
} as const;
