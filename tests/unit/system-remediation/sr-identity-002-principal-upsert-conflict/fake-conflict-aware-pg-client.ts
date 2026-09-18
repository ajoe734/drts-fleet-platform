// Minimal Postgres-semantics interpreter for `INSERT ... ON CONFLICT (...)
// DO UPDATE SET ... RETURNING ...` statements, scoped to the shapes used by
// IdentityRepository's source_ref-keyed upsert helpers.
//
// This is not a general SQL engine: it regex-parses the exact query text the
// repository sends (columns, VALUES placeholders, ON CONFLICT target, SET
// assignments, RETURNING list) and evaluates it against an in-memory table.
// Because it interprets the real query string rather than hard-coding the
// current fix's behavior, it fails the same way real Postgres would if the
// `record = EXCLUDED.record` regression were reintroduced: the persisted
// primary-key column would stay put (correct), but the RETURNED record's
// embedded id would drift to the newly generated draft id (the bug).

export type FakeRow = Record<string, unknown>;

function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function evaluateSetExpr(
  expr: string,
  excludedRow: FakeRow,
  existingRow: FakeRow,
): unknown {
  const trimmed = expr.trim();
  if (trimmed.startsWith("EXCLUDED.")) {
    return excludedRow[trimmed.slice("EXCLUDED.".length)];
  }

  const jsonbSet = trimmed.match(
    /^jsonb_set\(\s*EXCLUDED\.record\s*,\s*'\{(\w+)\}'\s*,\s*to_jsonb\(([\w.]+)\)\s*\)$/,
  );
  if (jsonbSet) {
    const jsonKey = jsonbSet[1];
    const columnRef = jsonbSet[2];
    if (!jsonKey || !columnRef) {
      throw new Error(
        `FakeConflictAwarePgClient: malformed jsonb_set SET expr "${expr}"`,
      );
    }
    const column = columnRef.split(".").pop()!;
    const base = excludedRow.record as Record<string, unknown>;
    return { ...base, [jsonKey]: existingRow[column] };
  }

  throw new Error(`FakeConflictAwarePgClient: unsupported SET expr "${expr}"`);
}

export class FakeConflictAwarePgClient {
  readonly tables = new Map<string, FakeRow[]>();

  async query<T extends FakeRow = FakeRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    const trimmedSql = sql.trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)\b/i.test(trimmedSql)) {
      return { rows: [] as T[] };
    }

    if (/^SELECT\b/i.test(trimmedSql)) {
      return this.querySelect<T>(trimmedSql, params);
    }

    const insertMatch = sql.match(
      /INSERT INTO\s+([\w.]+)\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/i,
    );
    if (!insertMatch) {
      throw new Error(
        `FakeConflictAwarePgClient only supports INSERT ... ON CONFLICT statements: ${sql}`,
      );
    }
    const tableRaw = insertMatch[1];
    const columnsRaw = insertMatch[2];
    const placeholdersRaw = insertMatch[3];
    if (!tableRaw || !columnsRaw || !placeholdersRaw) {
      throw new Error(
        `FakeConflictAwarePgClient: malformed INSERT statement: ${sql}`,
      );
    }
    const table = tableRaw.trim();
    const columns = columnsRaw.split(",").map((c) => c.trim());
    const placeholders = splitTopLevelCommas(placeholdersRaw);

    const excludedRow: FakeRow = {};
    placeholders.forEach((placeholder, index) => {
      const column = columns[index];
      if (!column) {
        throw new Error(
          `FakeConflictAwarePgClient: column/placeholder count mismatch for "${sql}"`,
        );
      }
      const m = placeholder.match(/^\$(\d+)/);
      if (!m || !m[1]) {
        throw new Error(
          `FakeConflictAwarePgClient: unsupported placeholder "${placeholder}"`,
        );
      }
      const raw = params[Number(m[1]) - 1];
      excludedRow[column] =
        placeholder.includes("::jsonb") && typeof raw === "string"
          ? JSON.parse(raw)
          : raw;
    });

    const rows = this.tables.get(table) ?? [];
    this.tables.set(table, rows);

    const conflictMatch = sql.match(/ON CONFLICT\s*\(([\w]+)\)/i);
    let existingRow: FakeRow | undefined;
    if (conflictMatch && conflictMatch[1]) {
      const conflictColumn = conflictMatch[1].trim();
      existingRow = rows.find(
        (row) => row[conflictColumn] === excludedRow[conflictColumn],
      );
    }

    let targetRow: FakeRow;
    if (existingRow) {
      if (/DO NOTHING/i.test(sql)) {
        return { rows: [] as T[] };
      }
      const setMatch = sql.match(/DO UPDATE SET([\s\S]*?)RETURNING/i);
      if (!setMatch || !setMatch[1]) {
        throw new Error(
          `FakeConflictAwarePgClient: missing DO UPDATE SET clause: ${sql}`,
        );
      }
      for (const assignment of splitTopLevelCommas(setMatch[1])) {
        const eqIndex = assignment.indexOf("=");
        const column = assignment.slice(0, eqIndex).trim();
        const expr = assignment.slice(eqIndex + 1).trim();
        existingRow[column] = evaluateSetExpr(expr, excludedRow, existingRow);
      }
      targetRow = existingRow;
    } else {
      targetRow = { ...excludedRow };
      rows.push(targetRow);
    }

    const returningMatch = sql.match(/RETURNING\s+([\s\S]+?)\s*$/i);
    const returning =
      returningMatch && returningMatch[1] ? returningMatch[1].trim() : "*";
    if (returning === "*") {
      return { rows: [{ ...targetRow }] as T[] };
    }
    const resultRow: FakeRow = {};
    for (const column of returning.split(",").map((c) => c.trim())) {
      resultRow[column] = targetRow[column];
    }
    return { rows: [resultRow] as T[] };
  }

  private querySelect<T extends FakeRow = FakeRow>(
    sql: string,
    params: unknown[],
  ): { rows: T[] } {
    const fromMatch = sql.match(/FROM\s+([\w.]+)/i);
    if (!fromMatch || !fromMatch[1]) {
      throw new Error(`FakeConflictAwarePgClient: unsupported SELECT: ${sql}`);
    }
    const table = fromMatch[1].trim();
    let rows = [...(this.tables.get(table) ?? [])];

    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\$(\d+)/i);
    if (whereMatch && whereMatch[1] && whereMatch[2]) {
      const column = whereMatch[1];
      const paramIndex = whereMatch[2];
      const value = params[Number(paramIndex) - 1];
      rows = rows.filter((row) => row[column] === value);
    }

    if (/ORDER BY\s+updated_at\s+DESC/i.test(sql)) {
      rows.sort((a, b) =>
        String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
      );
    }

    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      rows = rows.slice(0, Number(limitMatch[1]));
    }

    const selectListMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
    const selectList =
      selectListMatch && selectListMatch[1] ? selectListMatch[1].trim() : "*";
    if (selectList === "*") {
      return { rows: rows.map((row) => ({ ...row })) as T[] };
    }
    const columns = selectList.split(",").map((c) => c.trim());
    return {
      rows: rows.map((row) => {
        const projected: FakeRow = {};
        for (const column of columns) projected[column] = row[column];
        return projected;
      }) as T[],
    };
  }

  release() {}
}

export class FakeDatabaseServiceHandle {
  readonly client = new FakeConflictAwarePgClient();

  isEnabled() {
    return true;
  }

  async connect() {
    return this.client;
  }

  async query<T extends FakeRow = FakeRow>(sql: string, params?: readonly unknown[]) {
    return this.client.query<T>(sql, params ? [...params] : []);
  }
}
