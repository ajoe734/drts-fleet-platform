import { createHash } from "node:crypto";

import {
  object,
  records,
  requireFact,
  text,
} from "../../tests/e2e/owned-referral-business-journey/protocol";
import {
  OPS_ENV_KEY,
  SERVICES,
  type RuntimeRole,
  type RuntimeRow,
} from "./core";

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sorted(child)]),
    );
  return value;
}

/** Project only noncredential runtime facts; the original cloud JSON stays in memory. */
export function projectRuntime(role: RuntimeRole, value: unknown): RuntimeRow {
  const service = object(value);
  const status = object(service.status);
  const spec = object(service.spec);
  const template = object(spec.template);
  const templateSpec = object(template.spec);
  const containers = records(templateSpec.containers);
  requireFact(
    containers.length === 1,
    "single configured service image required",
  );
  const container = containers[0]!;
  const env = records(container.env ?? []);
  const names = env.map((row) => text(row.name));
  requireFact(
    new Set(names).size === names.length,
    "unique runtime env keys required",
  );
  const envValue = (name: string) =>
    env.find((row) => row.name === name)?.value;
  const revision = text(status.latestReadyRevisionName);
  requireFact(
    revision === status.latestCreatedRevisionName,
    "stable latest ready revision required",
  );
  const annotations = object(object(template.metadata ?? {}).annotations ?? {});
  const materialAnnotations = Object.fromEntries(
    Object.entries(annotations).filter(
      ([key]) =>
        key !== "run.googleapis.com/client-name" &&
        key !== "run.googleapis.com/client-version",
    ),
  );
  const materialEnv = env
    .filter((row) => role !== "ops" || row.name !== OPS_ENV_KEY)
    .sort((left, right) => text(left.name).localeCompare(text(right.name)));
  const material = {
    spec: {
      ...templateSpec,
      containers: [{ ...container, env: materialEnv }],
    },
    annotations: materialAnnotations,
  };
  const reference = envValue(OPS_ENV_KEY);
  requireFact(
    reference === undefined || typeof reference === "string",
    "plain private canonical reference required",
  );
  return {
    service: SERVICES[role],
    origin: text(status.url),
    revision,
    sha: text(envValue("DRTS_CANDIDATE_SHA")),
    image: text(container.image),
    configDigest: createHash("sha256")
      .update(JSON.stringify(sorted(material)))
      .digest("hex"),
    activeTraffic: records(status.traffic)
      .filter((traffic) => traffic.percent !== 0)
      .map((traffic) => ({
        revision: text(traffic.revisionName),
        percent:
          typeof traffic.percent === "number" ? traffic.percent : Number.NaN,
      }))
      .sort((left, right) => left.percent - right.percent),
    canonicalPrincipalRef: reference ?? null,
    devWaiverEnabled:
      typeof envValue("DRTS_DEV_MFA_WAIVED") === "string" &&
      (envValue("DRTS_DEV_MFA_WAIVED") as string).trim().toLowerCase() ===
        "true",
  };
}
