import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

/**
 * Convert a single camelCase key to snake_case.
 *
 * Examples:
 *   requestId    → request_id
 *   traceId      → trace_id
 *   httpStatus   → http_status
 *   artifactZipUrl → artifact_zip_url
 *   etaMinutes   → eta_minutes
 */
export function camelToSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Recursively convert all object keys from camelCase to snake_case.
 *
 * - Arrays: each element is converted.
 * - Primitive values (strings, numbers, booleans, null, undefined): returned as-is.
 * - Objects: keys are converted; values are recursed.
 */
export function deepToSnakeCase(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepToSnakeCase);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        camelToSnakeCase(k),
        deepToSnakeCase(v),
      ]),
    );
  }
  return value;
}

/**
 * Global NestJS interceptor that serializes all HTTP responses with
 * snake_case JSON keys, conforming to the canonical Phase 1 wire contract.
 *
 * Convention (per 05_engineering_conventions section 5.4.2):
 *   - TypeScript object keys: camelCase  (internal)
 *   - JSON over wire:         snake_case (external)
 *
 * This interceptor bridges the two layers so that service/domain code
 * stays idiomatic TypeScript while every HTTP response is canonical.
 */
@Injectable()
export class SnakeCaseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map(deepToSnakeCase));
  }
}
