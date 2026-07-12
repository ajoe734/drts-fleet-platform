declare module "expo-sqlite" {
  export type SQLiteBindValue = string | number | null | boolean;

  export interface SQLiteDatabase {
    closeAsync(): Promise<void>;
    execAsync(source: string): Promise<void>;
    getAllAsync<T>(
      source: string,
      params?: SQLiteBindValue[] | SQLiteBindValue,
    ): Promise<T[]>;
    getFirstAsync<T>(
      source: string,
      params?: SQLiteBindValue[] | SQLiteBindValue,
    ): Promise<T | null>;
    runAsync(
      source: string,
      params?: SQLiteBindValue[] | SQLiteBindValue,
    ): Promise<{ changes: number; lastInsertRowId: number }>;
  }

  export function openDatabaseAsync(name: string): Promise<SQLiteDatabase>;
}
