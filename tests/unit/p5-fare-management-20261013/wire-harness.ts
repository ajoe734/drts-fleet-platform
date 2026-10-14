import type {
  CreatePlatformFareVersionCommand,
  UpdatePlatformFareVersionCommand,
  RecordPlatformFareVersionFilingCommand,
  SchedulePlatformFareVersionCommand,
  RetirePlatformFareVersionCommand,
} from "@drts/contracts";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { SnakeCaseExceptionFilter } from "../../../apps/api/src/common/snake-case.exception-filter";
import { command, fixture, identity, seed } from "./backend-fixture";

export const opaqueFees: Record<string, number> = JSON.parse(
  '{"airportFee":35,"airport_fee":40,"Airport_Fee":45,"night-fee":20,"__proto__":4}',
);

/** The production exception filter with only its HTTP response host substituted. */
export function filteredError(error: unknown) {
  let status = 0;
  let body: unknown;
  new SnakeCaseExceptionFilter().catch(error, {
    switchToHttp: () => ({
      getResponse: () => ({
        status: (value: number) => {
          status = value;
          return {
            json: (value: unknown) => {
              body = value;
            },
          };
        },
      }),
    }),
  } as Parameters<SnakeCaseExceptionFilter["catch"]>[1]);
  return { status, body };
}

/** Actual controller, service, serializer and filter; only persistence/HTTP are substituted. */
export function wireHarness() {
  const current = seed();
  current.tariff.additionalFees = structuredClone(opaqueFees);
  const f = fixture([current]);
  const requests: {
    method: string;
    path: string;
    body: unknown;
    key: string | null;
  }[] = [];
  const responses: { status: number; body: unknown }[] = [];
  let nextFailure: unknown;
  const fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const path = url.pathname.replace(/^\/control-plane-proxy/, "/api");
    const suffix = path.replace(
      /^\/api\/platform-admin\/multi-taxi\/fare-versions\/?/,
      "",
    );
    const [encodedId, action] = suffix.split("/");
    const id = decodeURIComponent(encodedId ?? "");
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const key = headers.get("Idempotency-Key");
    const body: unknown = init?.body
      ? JSON.parse(String(init.body))
      : undefined;
    requests.push({ method, path, body, key });
    try {
      if (nextFailure !== undefined) {
        const failure = nextFailure;
        nextFailure = undefined;
        throw failure;
      }
      const output =
        method === "GET"
          ? id
            ? await f.controller.get(id)
            : await f.controller.list()
          : method === "PUT"
            ? await f.controller.update(
                id,
                body as UpdatePlatformFareVersionCommand,
                identity,
                key ?? undefined,
              )
            : !id
              ? await f.controller.create(
                  body as CreatePlatformFareVersionCommand,
                  identity,
                  key ?? undefined,
                )
              : action === "file"
                ? await f.controller.file(
                    id,
                    body as RecordPlatformFareVersionFilingCommand,
                    identity,
                    key ?? undefined,
                  )
                : action === "schedule"
                  ? await f.controller.schedule(
                      id,
                      body as SchedulePlatformFareVersionCommand,
                      identity,
                      key ?? undefined,
                    )
                  : action === "retire"
                    ? await f.controller.retire(
                        id,
                        body as RetirePlatformFareVersionCommand,
                        identity,
                        key ?? undefined,
                      )
                    : (() => {
                        throw new Error(
                          `Unexpected test route ${method} ${path}`,
                        );
                      })();
      const serialized = deepToSnakeCase(output);
      responses.push({ status: 200, body: serialized });
      return Response.json(serialized);
    } catch (error) {
      const response = filteredError(error);
      responses.push(response);
      return Response.json(response.body, { status: response.status });
    }
  };
  return {
    ...f,
    fetch,
    requests,
    responses,
    failNext: (error: unknown) => {
      nextFailure = error;
    },
  };
}

export function wireCommand(id = "fare /A") {
  const value = command(id);
  value.tariff.additionalFees = structuredClone(opaqueFees);
  return value;
}

export function unavailableError() {
  return new ApiRequestError(
    503,
    "fare_management_unavailable",
    "Fare storage unavailable; retry.",
    { retryAfterSeconds: 2 },
    true,
  );
}
