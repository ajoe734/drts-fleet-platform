import { Injectable, Logger, Optional } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import { DatabaseService } from "../../common/db";

const DEFAULT_FILE_STORAGE = path.join(
  process.cwd(),
  ".runtime-consumed-oidc-states.json",
);

@Injectable()
export class ConsumedOidcStateRepository {
  private readonly logger = new Logger(ConsumedOidcStateRepository.name);
  private readonly memoryCache = new Map<string, number>();
  private readonly storageFilePath: string;

  constructor(
    @Optional() private readonly databaseService?: DatabaseService,
  ) {
    this.storageFilePath =
      process.env.CONSUMED_OIDC_STATES_FILE || DEFAULT_FILE_STORAGE;
    this.loadFromFile();
  }

  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, "utf8");
        const parsed = JSON.parse(raw) as Record<string, number>;
        const now = Date.now();
        for (const [state, expiresAt] of Object.entries(parsed)) {
          if (expiresAt > now) {
            this.memoryCache.set(state, expiresAt);
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  private saveToFile(): void {
    try {
      const obj: Record<string, number> = {};
      for (const [state, expiresAt] of this.memoryCache.entries()) {
        obj[state] = expiresAt;
      }
      fs.writeFileSync(this.storageFilePath, JSON.stringify(obj), "utf8");
    } catch {
      // Ignore write errors
    }
  }

  /**
   * Attempts to consume an OIDC state token parameter globally.
   * Returns true if successfully consumed (fresh state).
   * Returns false if state was already consumed (replay attempt).
   */
  async consumeState(state: string, expiresAtMs: number): Promise<boolean> {
    const cleanState = state.trim();
    if (!cleanState) return false;

    const now = Date.now();

    // Check memory cache first
    if (this.memoryCache.has(cleanState)) {
      const exp = this.memoryCache.get(cleanState);
      if (exp && exp > now) {
        return false; // Replay attempt
      }
    }

    // Purge expired items
    for (const [s, exp] of this.memoryCache.entries()) {
      if (exp <= now) {
        this.memoryCache.delete(s);
      }
    }

    // Attempt PostgreSQL DB insertion if available
    if (this.databaseService && this.databaseService.isEnabled()) {
      try {
        const expiresAtDate = new Date(expiresAtMs);
        const result = await this.databaseService.query(
          `INSERT INTO admin.consumed_oidc_states (state, expires_at)
           VALUES ($1, $2)
           ON CONFLICT (state) DO NOTHING
           RETURNING state;`,
          [cleanState, expiresAtDate.toISOString()],
        );

        if (result.rows.length === 0) {
          // Conflict: state already consumed in database
          this.memoryCache.set(cleanState, expiresAtMs);
          this.saveToFile();
          return false;
        }

        this.memoryCache.set(cleanState, expiresAtMs);
        this.saveToFile();
        return true;
      } catch (error) {
        this.logger.warn(`Failed DB check for consumed OIDC state: ${error}`);
      }
    }

    // In-memory + File backing fallback
    this.memoryCache.set(cleanState, expiresAtMs);
    this.saveToFile();
    return true;
  }

  isConsumed(state: string): boolean {
    const cleanState = state.trim();
    const exp = this.memoryCache.get(cleanState);
    if (exp && exp > Date.now()) {
      return true;
    }
    return false;
  }

  clearMemoryCache(): void {
    this.memoryCache.clear();
    try {
      if (fs.existsSync(this.storageFilePath)) {
        fs.unlinkSync(this.storageFilePath);
      }
    } catch {
      // Ignore
    }
  }
}
