import type { INestApplication } from "@nestjs/common";

import {
  type AuthEnvironment,
  detectAuthEnvironment,
} from "./auth-startup-config";

type EnvLike = Record<string, string | undefined>;

type HeaderBag = {
  get(name: string): string | number | string[] | null | undefined;
  set(name: string, value: string): void;
  remove?(name: string): void;
};

export interface ApiBrowserSecurityConfig {
  environment: AuthEnvironment;
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: true;
  strictTransportSecurity: string | null;
  contentSecurityPolicy: string;
  referrerPolicy: string;
  xFrameOptions: string;
  xContentTypeOptions: string;
}

const DEFAULT_LOCAL_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3002",
  "http://127.0.0.1:3002",
  "http://localhost:3003",
  "http://127.0.0.1:3003",
  "http://localhost:3004",
  "http://127.0.0.1:3004",
  "http://localhost:3005",
  "http://127.0.0.1:3005",
  "http://localhost:3007",
  "http://127.0.0.1:3007",
  "http://localhost:3009",
  "http://127.0.0.1:3009",
  "http://localhost:3010",
  "http://127.0.0.1:3010",
  "http://localhost:3102",
  "http://127.0.0.1:3102",
  "http://localhost:3103",
  "http://127.0.0.1:3103",
  "http://localhost:3104",
  "http://127.0.0.1:3104",
  "http://localhost:4300",
  "http://127.0.0.1:4300",
  "http://localhost:4301",
  "http://127.0.0.1:4301",
  "http://localhost:4302",
  "http://127.0.0.1:4302",
  "http://localhost:4303",
  "http://127.0.0.1:4303",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://localhost:3000",
  "https://127.0.0.1:3000",
  "https://localhost:3005",
  "https://127.0.0.1:3005",
  "https://localhost:5173",
  "https://127.0.0.1:5173",
];

const DEFAULT_ALLOWED_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];

const DEFAULT_ALLOWED_HEADERS = [
  "Accept",
  "Authorization",
  "Content-Type",
  "Idempotency-Key",
  "X-Actor-Id",
  "X-Actor-Type",
  "X-CSRF-Token",
  "X-Partner-Entry-Slug",
  "X-Partner-Id",
  "X-Partner-Program-Id",
  "X-Realm",
  "X-Request-Id",
  "X-Role-Families",
  "X-Scopes",
  "X-Tenant-Id",
];

const DEFAULT_EXPOSED_HEADERS = ["X-Request-Id"];

function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseCsv(value: string | undefined): string[] {
  const normalized = normalizeString(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function dedupeUppercase(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.toUpperCase())));
}

function dedupePreserveCase(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(value);
  }

  return deduped;
}

export function normalizeOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function resolveAllowedOrigins(
  env: EnvLike = process.env,
  environment = detectAuthEnvironment(env),
): string[] {
  const configuredOrigins = parseCsv(
    env.AUTH_ALLOWED_ORIGINS ?? env.CORS_ALLOWED_ORIGINS,
  )
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => origin !== null);

  if (configuredOrigins.length > 0) {
    return dedupePreserveCase(configuredOrigins);
  }

  if (environment === "local" || environment === "test") {
    return DEFAULT_LOCAL_ORIGINS;
  }

  return [];
}

export function resolveApiBrowserSecurityConfig(
  env: EnvLike = process.env,
): ApiBrowserSecurityConfig {
  const environment = detectAuthEnvironment(env);
  const isStrictEnvironment =
    environment === "production" || environment === "staging";
  const allowedMethods = dedupeUppercase(
    parseCsv(env.AUTH_ALLOWED_METHODS ?? env.CORS_ALLOWED_METHODS).length > 0
      ? parseCsv(env.AUTH_ALLOWED_METHODS ?? env.CORS_ALLOWED_METHODS)
      : DEFAULT_ALLOWED_METHODS,
  );
  const allowedHeaders = dedupePreserveCase(
    parseCsv(env.AUTH_ALLOWED_HEADERS ?? env.CORS_ALLOWED_HEADERS).length > 0
      ? parseCsv(env.AUTH_ALLOWED_HEADERS ?? env.CORS_ALLOWED_HEADERS)
      : DEFAULT_ALLOWED_HEADERS,
  );
  const exposedHeaders = dedupePreserveCase(
    parseCsv(env.AUTH_EXPOSED_HEADERS ?? env.CORS_EXPOSED_HEADERS).length > 0
      ? parseCsv(env.AUTH_EXPOSED_HEADERS ?? env.CORS_EXPOSED_HEADERS)
      : DEFAULT_EXPOSED_HEADERS,
  );

  return {
    environment,
    allowedOrigins: resolveAllowedOrigins(env, environment),
    allowedMethods,
    allowedHeaders,
    exposedHeaders,
    credentials: true,
    strictTransportSecurity: isStrictEnvironment
      ? "max-age=31536000; includeSubDomains"
      : null,
    contentSecurityPolicy:
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    referrerPolicy: "no-referrer",
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
  };
}

export function isOriginAllowed(
  origin: string | undefined,
  config: Pick<ApiBrowserSecurityConfig, "allowedOrigins">,
): boolean {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  return config.allowedOrigins.includes(normalizedOrigin);
}

export function isPreflightRequest(request: {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}): boolean {
  return (
    request.method?.toUpperCase() === "OPTIONS" &&
    Boolean(
      request.headers?.["access-control-request-method"] ??
        request.headers?.["Access-Control-Request-Method"],
    )
  );
}

export function isAuthenticationPath(path: string | undefined): boolean {
  if (!path) {
    return false;
  }

  const pathname = path.split("?")[0] ?? "";
  return pathname === "/auth" || pathname.startsWith("/auth/") ||
    pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

export function appendSecurityHeaders(
  headers: HeaderBag,
  config: ApiBrowserSecurityConfig,
  requestPath?: string,
) {
  headers.set("Content-Security-Policy", config.contentSecurityPolicy);
  headers.set("Referrer-Policy", config.referrerPolicy);
  headers.set("X-Content-Type-Options", config.xContentTypeOptions);
  headers.set("X-Frame-Options", config.xFrameOptions);

  if (config.strictTransportSecurity) {
    headers.set(
      "Strict-Transport-Security",
      config.strictTransportSecurity,
    );
  } else if (typeof headers.remove === "function") {
    headers.remove("Strict-Transport-Security");
  }

  if (isAuthenticationPath(requestPath)) {
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
  }
}

function appendVaryHeader(headers: HeaderBag, value: string) {
  const current = headers.get("Vary");
  const currentValue = Array.isArray(current)
    ? current.join(", ")
    : typeof current === "number"
      ? String(current)
      : current;

  if (!currentValue) {
    headers.set("Vary", value);
    return;
  }

  const existingValues = currentValue
    .split(",")
    .map((entry: string) => entry.trim().toLowerCase());
  if (!existingValues.includes(value.toLowerCase())) {
    headers.set("Vary", `${currentValue}, ${value}`);
  }
}

export function applyApiBrowserSecurity(
  app: INestApplication,
  env: EnvLike = process.env,
) {
  const config = resolveApiBrowserSecurityConfig(env);

  app.use((request: any, response: any, next: () => void) => {
    const requestPath =
      request.originalUrl ?? request.url ?? request.path ?? undefined;
    const originHeader = request.headers?.origin;

    appendSecurityHeaders(response, config, requestPath);

    if (originHeader) {
      appendVaryHeader(response, "Origin");
      appendVaryHeader(response, "Access-Control-Request-Method");
      appendVaryHeader(response, "Access-Control-Request-Headers");
    }

    if (typeof originHeader === "string" && !isOriginAllowed(originHeader, config)) {
      response.statusCode = 403;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store, max-age=0");
      response.end(
        JSON.stringify({
          error: {
            code: "CORS_ORIGIN_FORBIDDEN",
            message: isPreflightRequest(request)
              ? "CORS preflight origin is not allowlisted."
              : "CORS origin is not allowlisted.",
          },
        }),
      );
      return;
    }

    next();
  });

  app.enableCors({
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || isOriginAllowed(origin, config)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin is not allowlisted."));
    },
    methods: config.allowedMethods,
    allowedHeaders: config.allowedHeaders,
    exposedHeaders: config.exposedHeaders,
    credentials: config.credentials,
    optionsSuccessStatus: 204,
  });

  return config;
}
