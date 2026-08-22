import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

export function resolveDatabasePoolMax(rawValue: string | undefined) {
  if (rawValue === undefined || rawValue.trim() === "") {
    return undefined;
  }

  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("DATABASE_POOL_MAX must be a positive integer");
  }

  return parsed;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool | null;

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      this.pool = null;
      return;
    }

    this.pool = new Pool({
      connectionString,
      max: resolveDatabasePoolMax(process.env.DATABASE_POOL_MAX),
    });
  }

  isEnabled() {
    return this.pool !== null;
  }

  async query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error("DATABASE_URL is not configured");
    }

    return this.pool.query<T>(text, values as unknown[]);
  }

  async connect(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error("DATABASE_URL is not configured");
    }

    return this.pool.connect();
  }

  async onModuleDestroy() {
    if (!this.pool) {
      return;
    }

    await this.pool.end();
    this.logger.debug("Closed Postgres connection pool.");
  }
}
