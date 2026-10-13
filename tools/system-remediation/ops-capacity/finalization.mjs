// Join the workload before reading its evidence. Every independent diagnostic
// and cleanup boundary is attempted, and every original rejection is retained.
export async function finalizeCapacityRun({
  execute,
  collect,
  cleanup,
  validate,
  write,
}) {
  const failures = [];
  const attempt = async (stage, operation) => {
    try {
      return await operation();
    } catch (error) {
      failures.push({ stage, error });
      return null;
    }
  };
  await attempt("workload", execute);
  const payload = await attempt("diagnostics", () => collect(attempt));
  for (const { stage, run } of cleanup) await attempt(stage, run);
  await attempt("acceptance", () => validate(payload));
  await attempt("diagnostic-write", () => write(payload, failures));
  if (failures.length === 1) throw failures[0].error;
  if (failures.length)
    throw new AggregateError(
      failures.map(({ error }) => error),
      `Capacity run failed: ${failures.map(({ stage }) => stage).join(", ")}`,
    );
  return payload;
}

export function describeCapacityFailure(error) {
  return {
    name: error?.name ?? "ThrownValue",
    message: error?.message ?? String(error),
    ...(error instanceof AggregateError
      ? { errors: Array.from(error.errors, describeCapacityFailure) }
      : {}),
  };
}
