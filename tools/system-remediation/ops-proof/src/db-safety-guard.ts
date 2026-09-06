/**
 * Database Safety Guard
 * 
 * Strict safety guardrails ensuring operations proof tools NEVER touch production databases.
 * Acceptance criteria: "同一snapshot可在隔離DB還原並校核行程/帳務/audit，工具不碰正式DB。"
 */

export class ProductionDatabaseAccessDeniedError extends Error {
  public readonly code = "PRODUCTION_DB_TOUCH_PROHIBITED";
  public readonly targetUrl?: string;
  constructor(message: string, targetUrl?: string) {
    super(`[PRODUCTION_DB_TOUCH_PROHIBITED] ${message}`);
    this.name = "ProductionDatabaseAccessDeniedError";
    this.targetUrl = targetUrl;
  }
}

export interface IsolatedDbValidation {
  isIsolated: boolean;
  dbName: string;
  host: string;
  reason?: string;
}

const PRODUCTION_MARKERS = [
  "drts-prod",
  "drts_prod",
  "production",
  "prod-db",
  "prod_db",
  "cloudsql.drts",
  "rds.amazonaws.com",
  "cloudsql",
];

const CANONICAL_PROD_DB_NAMES = [
  "drts_fleet_platform",
  "drts_production",
  "drts_prod",
  "fleet_prod",
];

const ALLOWED_ISOLATED_PATTERNS = [
  "_isolated",
  "_restore_test",
  "_ops_proof",
  "_test",
  "drts_isolated_",
  "localhost",
  "127.0.0.1",
  "sqlite",
  ":memory:",
  "in_memory",
];

/**
 * Validates whether a database connection string points to an authorized isolated test database.
 * Hard-fails if any production indicators are detected.
 */
export function assertIsolatedDatabase(connectionUrl?: string): IsolatedDbValidation {
  if (!connectionUrl || connectionUrl === "in-memory" || connectionUrl === "sqlite://:memory:") {
    return {
      isIsolated: true,
      dbName: "in-memory-isolated-store",
      host: "localhost",
    };
  }

  const normalized = connectionUrl.toLowerCase();

  // 1. Check for forbidden production keywords
  for (const marker of PRODUCTION_MARKERS) {
    if (normalized.includes(marker)) {
      throw new ProductionDatabaseAccessDeniedError(
        `Connection string contains forbidden production marker '${marker}'. Tool execution aborted to protect production data.`,
        connectionUrl.replace(/:[^@]+@/, ":***@"), // Mask credentials
      );
    }
  }

  // 2. Parse URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(connectionUrl);
  } catch {
    // If not a standard URL, check if it's a path or memory target
    if (normalized.includes("test") || normalized.includes("isolated") || normalized.includes("proof")) {
      return {
        isIsolated: true,
        dbName: "custom-isolated-target",
        host: "localhost",
      };
    }
    throw new ProductionDatabaseAccessDeniedError(
      "Invalid connection URL. Expected a valid URL pointing to an isolated database.",
      connectionUrl,
    );
  }

  const dbName = parsedUrl.pathname.replace(/^\//, "");
  const host = parsedUrl.hostname;

  // 3. Reject canonical production database names
  for (const prodName of CANONICAL_PROD_DB_NAMES) {
    if (dbName === prodName) {
      throw new ProductionDatabaseAccessDeniedError(
        `Database name '${dbName}' matches canonical primary database name. You must specify an isolated test database (e.g. drts_isolated_restore_test).`,
        connectionUrl.replace(/:[^@]+@/, ":***@"),
      );
    }
  }

  // 4. Require explicit isolated naming or localhost test instance
  const isHostLocal = host === "localhost" || host === "127.0.0.1";
  const hasIsolatedName = ALLOWED_ISOLATED_PATTERNS.some((pattern) => dbName.includes(pattern));

  if (!isHostLocal && !hasIsolatedName) {
    throw new ProductionDatabaseAccessDeniedError(
      `Database '${dbName}' on host '${host}' is neither localhost nor explicitly marked as isolated. Refusing to connect.`,
      connectionUrl.replace(/:[^@]+@/, ":***@"),
    );
  }

  return {
    isIsolated: true,
    dbName: dbName || "isolated_default",
    host,
  };
}

/**
 * Checks if target string indicates a production system.
 */
export function isProductionTarget(target: string): boolean {
  const lower = target.toLowerCase();
  return PRODUCTION_MARKERS.some((m) => lower.includes(m)) || CANONICAL_PROD_DB_NAMES.some((n) => lower.includes(n));
}
