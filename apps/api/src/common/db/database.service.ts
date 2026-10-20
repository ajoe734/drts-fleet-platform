import { AsyncLocalStorage } from "node:async_hooks";

import { Injectable, Logger, OnModuleDestroy, Optional } from "@nestjs/common";
import {
  Pool,
  type PoolClient,
  type QueryConfig,
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

type AmbientTransactionContext = {
  rawClient: PoolClient;
  client: PoolClient;
  closed: boolean;
  savepointSeq: number;
  enqueueQuery: <T extends QueryResultRow = QueryResultRow>(
    textOrConfig: string | QueryConfig,
    values?: readonly unknown[],
  ) => Promise<QueryResult<T>>;
};

function createSyntheticQueryResult<T extends QueryResultRow>(
  command: string,
): QueryResult<T> {
  return {
    command,
    rowCount: 0,
    oid: 0,
    rows: [],
    fields: [],
  };
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool | null;
  private readonly ambientTransactionStorage =
    new AsyncLocalStorage<AmbientTransactionContext>();

  constructor(@Optional() poolOverride?: Pool) {
    if (poolOverride) {
      this.pool = poolOverride;
      return;
    }

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

  private getActiveTransactionContext(): AmbientTransactionContext | undefined {
    const context = this.ambientTransactionStorage.getStore();
    if (!context || context.closed) {
      return undefined;
    }
    return context;
  }

  getActiveTransactionClient(): PoolClient | undefined {
    return this.getActiveTransactionContext()?.client;
  }

  private createNestedTransactionClient(
    context: AmbientTransactionContext,
  ): PoolClient {
    const savepointStack: string[] = [];
    const nestedClient = Object.create(context.rawClient) as PoolClient;

    nestedClient.query = (async <T extends QueryResultRow = QueryResultRow>(
      textOrConfig: string | QueryConfig,
      values?: readonly unknown[],
    ): Promise<QueryResult<T>> => {
      const sqlText =
        typeof textOrConfig === "string"
          ? textOrConfig
          : typeof textOrConfig?.text === "string"
            ? textOrConfig.text
            : "";
      const normalized = sqlText.trim();

      if (
        /^(?:BEGIN|START\s+TRANSACTION)(?:\s+TRANSACTION|\s+WORK)?\s*;?$/i.test(
          normalized,
        )
      ) {
        const savepointName = `sp_${++context.savepointSeq}`;
        savepointStack.push(savepointName);
        return context.enqueueQuery<T>(`SAVEPOINT ${savepointName}`);
      }

      if (/^COMMIT(?:\s+TRANSACTION|\s+WORK)?\s*;?$/i.test(normalized)) {
        const savepointName = savepointStack.pop();
        if (!savepointName) {
          return createSyntheticQueryResult<T>("COMMIT");
        }
        return context.enqueueQuery<T>(`RELEASE SAVEPOINT ${savepointName}`);
      }

      if (/^ROLLBACK(?:\s+TRANSACTION|\s+WORK)?\s*;?$/i.test(normalized)) {
        const savepointName = savepointStack.pop();
        if (!savepointName) {
          return createSyntheticQueryResult<T>("ROLLBACK");
        }
        await context.enqueueQuery(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        return context.enqueueQuery<T>(`RELEASE SAVEPOINT ${savepointName}`);
      }

      return context.enqueueQuery<T>(textOrConfig, values);
    }) as PoolClient["query"];

    nestedClient.release = (() => {
      // Nested checkout shares the outer ambient transaction client.
    }) as PoolClient["release"];

    return nestedClient;
  }

  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!this.pool) {
      throw new Error("DATABASE_URL is not configured");
    }

    const existingContext = this.getActiveTransactionContext();
    if (existingContext) {
      const savepointName = `sp_${++existingContext.savepointSeq}`;
      await existingContext.enqueueQuery(`SAVEPOINT ${savepointName}`);
      try {
        const result = await callback(existingContext.client);
        await existingContext.enqueueQuery(
          `RELEASE SAVEPOINT ${savepointName}`,
        );
        return result;
      } catch (error) {
        try {
          await existingContext.enqueueQuery(
            `ROLLBACK TO SAVEPOINT ${savepointName}`,
          );
          await existingContext.enqueueQuery(
            `RELEASE SAVEPOINT ${savepointName}`,
          );
        } catch {
          // Ignore savepoint rollback failure and surface original error
        }
        throw error;
      }
    }

    const rawClient = await this.pool.connect();
    let queryChain: Promise<void> = Promise.resolve();
    const enqueueRawQuery = <R extends QueryResultRow = QueryResultRow>(
      textOrConfig: string | QueryConfig,
      values?: readonly unknown[],
    ): Promise<QueryResult<R>> => {
      const run = queryChain.then(() =>
        typeof textOrConfig === "string"
          ? rawClient.query<R>(textOrConfig, values as unknown[])
          : rawClient.query<R>(textOrConfig),
      );
      queryChain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    };

    const txClient = Object.create(rawClient) as PoolClient;
    txClient.query = ((
      textOrConfig: string | QueryConfig,
      values?: readonly unknown[],
    ) => enqueueRawQuery(textOrConfig, values)) as PoolClient["query"];
    txClient.release = (() => {
      // Managed by withTransaction finally block.
    }) as PoolClient["release"];

    const context: AmbientTransactionContext = {
      rawClient,
      client: txClient,
      closed: false,
      savepointSeq: 0,
      enqueueQuery: enqueueRawQuery,
    };

    let beginSucceeded = false;
    try {
      await enqueueRawQuery("BEGIN");
      beginSucceeded = true;
      const result = await this.ambientTransactionStorage.run(context, () =>
        callback(txClient),
      );
      context.closed = true;
      await enqueueRawQuery("COMMIT");
      return result;
    } catch (error) {
      context.closed = true;
      if (beginSucceeded) {
        try {
          await enqueueRawQuery("ROLLBACK");
        } catch {
          // Ignore rollback error and surface original failure
        }
      }
      throw error;
    } finally {
      context.closed = true;
      rawClient.release();
    }
  }

  async query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>> {
    const activeContext = this.getActiveTransactionContext();
    if (activeContext) {
      return activeContext.enqueueQuery<T>(text, values);
    }

    if (!this.pool) {
      throw new Error("DATABASE_URL is not configured");
    }

    return this.pool.query<T>(text, values as unknown[]);
  }

  async connect(): Promise<PoolClient> {
    const activeContext = this.getActiveTransactionContext();
    if (activeContext) {
      return this.createNestedTransactionClient(activeContext);
    }

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
