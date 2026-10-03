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

// A bare `col`, `EXCLUDED.col`, or `schema.table.col` reference. Table-
// qualified references inside a `DO UPDATE` always mean the pre-update
// (conflicting) row in real Postgres, which is this fake's `existingRow`.
function resolveColumnRef(
  ref: string,
  excludedRow: FakeRow,
  existingRow: FakeRow,
): unknown {
  const trimmed = ref.trim();
  if (trimmed.startsWith("EXCLUDED.")) {
    return excludedRow[trimmed.slice("EXCLUDED.".length)];
  }
  const column = trimmed.split(".").pop()!;
  return existingRow[column];
}

function splitFunctionArgs(expr: string): string[] {
  const openIdx = expr.indexOf("(");
  const closeIdx = expr.lastIndexOf(")");
  if (openIdx === -1 || closeIdx === -1 || closeIdx < openIdx) {
    throw new Error(`FakeConflictAwarePgClient: not a function call "${expr}"`);
  }
  return splitTopLevelCommas(expr.slice(openIdx + 1, closeIdx));
}

// `jsonb_set(<record-expr>, '{key}', to_jsonb(<colref>))`, where
// `<record-expr>` is either `EXCLUDED.record` or another `jsonb_set(...)`
// call -- IdentityRepository nests these to patch multiple JSON keys (e.g.
// the primary-key column and the immutable `created_at`) in one expression.
function evaluateJsonbSetExpr(
  expr: string,
  excludedRow: FakeRow,
  existingRow: FakeRow,
): Record<string, unknown> {
  const trimmed = expr.trim();
  if (trimmed === "EXCLUDED.record") {
    return { ...(excludedRow.record as Record<string, unknown>) };
  }
  if (!trimmed.startsWith("jsonb_set(")) {
    throw new Error(
      `FakeConflictAwarePgClient: unsupported jsonb_set expr "${expr}"`,
    );
  }
  const [innerExpr, keyLiteral, toJsonbExpr] = splitFunctionArgs(trimmed);
  const keyMatch = keyLiteral?.trim().match(/^'\{(\w+)\}'$/);
  const colMatch = toJsonbExpr?.trim().match(/^to_jsonb\(([\w.]+)\)$/);
  if (!innerExpr || !keyMatch?.[1] || !colMatch?.[1]) {
    throw new Error(
      `FakeConflictAwarePgClient: malformed jsonb_set expr "${expr}"`,
    );
  }
  const base = evaluateJsonbSetExpr(innerExpr, excludedRow, existingRow);
  const value = resolveColumnRef(colMatch[1], excludedRow, existingRow);
  return { ...base, [keyMatch[1]]: value };
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

  if (trimmed.startsWith("jsonb_set(")) {
    return evaluateJsonbSetExpr(trimmed, excludedRow, existingRow);
  }

  throw new Error(`FakeConflictAwarePgClient: unsupported SET expr "${expr}"`);
}

// A single `<colref> IS DISTINCT FROM <colref>` or `<colref> >= <colref>`
// clause, as used in IdentityRepository's `ON CONFLICT ... DO UPDATE ...
// WHERE` guard that decides -- atomically, against the conflicting row --
// whether any tracked field actually changed, and (SR-AUTH-SESSION-
// SUPERSEDE-20261003 R2/R6) whether the incoming write is at least as new
// as what is already persisted.
function evaluateComparisonClause(
  clause: string,
  excludedRow: FakeRow,
  existingRow: FakeRow,
): boolean {
  const trimmed = clause.trim();
  const distinctMatch = trimmed.match(
    /^([\w.]+)\s+IS\s+DISTINCT\s+FROM\s+([\w.]+)$/i,
  );
  if (distinctMatch && distinctMatch[1] && distinctMatch[2]) {
    const left = resolveColumnRef(distinctMatch[1], excludedRow, existingRow);
    const right = resolveColumnRef(
      distinctMatch[2],
      excludedRow,
      existingRow,
    );
    return left !== right;
  }
  const geMatch = trimmed.match(/^([\w.]+)\s*>=\s*([\w.]+)$/);
  if (geMatch && geMatch[1] && geMatch[2]) {
    const left = resolveColumnRef(geMatch[1], excludedRow, existingRow) as
      | string
      | number;
    const right = resolveColumnRef(geMatch[2], excludedRow, existingRow) as
      | string
      | number;
    return left >= right;
  }
  throw new Error(
    `FakeConflictAwarePgClient: unsupported WHERE clause "${clause}"`,
  );
}

// Splits `text` on a top-level (paren-depth-0) occurrence of `keyword`.
function splitTopLevelByKeyword(text: string, keyword: string): string[] {
  let depth = 0;
  const parts: string[] = [];
  let current = "";
  const tokens = text.split(new RegExp(`(\\(|\\)|\\b${keyword}\\b)`, "i"));
  for (const token of tokens) {
    if (token === "(") {
      depth++;
      current += token;
    } else if (token === ")") {
      depth--;
      current += token;
    } else if (depth === 0 && new RegExp(`^${keyword}$`, "i").test(token.trim())) {
      parts.push(current);
      current = "";
    } else {
      current += token;
    }
  }
  if (current.trim().length > 0) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function stripFullyEnclosingParens(expr: string): string {
  let trimmed = expr.trim();
  while (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    let depth = 0;
    let fullyWrapped = true;
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === "(") depth++;
      if (trimmed[i] === ")") {
        depth--;
        if (depth === 0 && i !== trimmed.length - 1) {
          fullyWrapped = false;
          break;
        }
      }
    }
    if (!fullyWrapped) break;
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

// A top-level `OR`-joined group of comparison clauses (optionally wrapped in
// one layer of parens).
function evaluateOrGroup(
  expr: string,
  excludedRow: FakeRow,
  existingRow: FakeRow,
): boolean {
  const unwrapped = stripFullyEnclosingParens(expr);
  return splitTopLevelByKeyword(unwrapped, "OR").some((clause) =>
    evaluateComparisonClause(clause, excludedRow, existingRow),
  );
}

// Top-level `AND`-joined groups, each either a parenthesized `OR`-chain of
// `IS DISTINCT FROM` clauses (did anything tracked change?) or a bare
// comparison clause (e.g. the R2/R6 monotonic `updated_at` guard).
function stripLineComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

function evaluateWhereClause(
  where: string,
  excludedRow: FakeRow,
  existingRow: FakeRow,
): boolean {
  return splitTopLevelByKeyword(stripLineComments(where), "AND").every(
    (part) => evaluateOrGroup(part, excludedRow, existingRow),
  );
}

// Splits the text between `DO UPDATE SET` and `RETURNING` into the SET
// assignment list and an optional top-level `WHERE` guard clause.
function splitSetListAndWhere(text: string): {
  setList: string;
  where: string | null;
} {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && /^WHERE\b/i.test(text.slice(i))) {
      return { setList: text.slice(0, i), where: text.slice(i + 5) };
    }
  }
  return { setList: text, where: null };
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
      const { setList, where } = splitSetListAndWhere(setMatch[1]);
      if (
        where &&
        !evaluateWhereClause(where, excludedRow, existingRow)
      ) {
        // Real Postgres: the conflicting row had nothing tracked change, so
        // the DO UPDATE is skipped entirely (row untouched) and no row is
        // returned for it -- the caller must fall back to a plain SELECT.
        return { rows: [] as T[] };
      }
      for (const assignment of splitTopLevelCommas(setList)) {
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
