export type CapacityFailure = { stage: string; error: unknown };
export type CapacityAttempt = <T>(
  stage: string,
  operation: () => T | Promise<T>,
) => Promise<T | null>;
export function finalizeCapacityRun<T>(options: {
  execute: () => Promise<unknown>;
  collect: (attempt: CapacityAttempt) => Promise<T>;
  cleanup: { stage: string; run: () => unknown | Promise<unknown> }[];
  validate: (payload: T | null) => unknown | Promise<unknown>;
  write: (
    payload: T | null,
    failures: CapacityFailure[],
  ) => unknown | Promise<unknown>;
}): Promise<T | null>;
export function describeCapacityFailure(error: unknown): {
  name: string;
  message: string;
  errors?: ReturnType<typeof describeCapacityFailure>[];
};
