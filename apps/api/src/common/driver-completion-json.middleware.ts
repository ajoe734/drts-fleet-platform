import type { INestApplication } from "@nestjs/common";
import { json, type NextFunction, type Request, type Response } from "express";

// Transport space for the existing five photos of at most 600KiB decoded each,
// plus the original 100KiB JSON allowance. Round up to whole MiB for data-URI
// prefixes and JSON framing. Domain proof validation is unchanged.
export const DRIVER_COMPLETION_JSON_BODY_LIMIT =
  Math.ceil((5 * 4 * Math.ceil((600 * 1024) / 3) + 100 * 1024) / 1024 ** 2) *
  1024 ** 2;

const completionPath = /^\/api\/driver\/tasks\/[^/]+\/complete\/?$/i;

export function registerDriverCompletionJsonMiddleware(
  app: Pick<INestApplication, "use">,
) {
  const completionJSON = json({ limit: DRIVER_COMPLETION_JSON_BODY_LIMIT });

  // Keep the normal Nest JSON parser registered for every other route. Its
  // adapter detects existing middleware by name, so this must not be jsonParser.
  app.use(function driverCompletionJsonBody(
    request: Request,
    response: Response,
    next: NextFunction,
  ) {
    if (request.method === "POST" && completionPath.test(request.path)) {
      completionJSON(request, response, next);
      return;
    }
    next();
  });
}
