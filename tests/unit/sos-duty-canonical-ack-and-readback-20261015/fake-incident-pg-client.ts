// Sequential SQL-expression model for narrow repository regression tests.
// It receives the production SQL; it does not execute PostgreSQL, model MVCC,
// row-lock waits, timestamp typing or prove concurrency. The separately hosted
// official-schema tests cover those boundaries. SQL NULL is undefined here;
// JSON null remains JavaScript null.

export type FakeRow = Record<string, unknown>;

type EvalCtx = {
  excluded?: FakeRow;
  existing: FakeRow;
  cte: Record<string, FakeRow>;
  params: unknown[];
};

class NotNullViolation extends Error {
  constructor(column: string) {
    super(
      `null value in column "${column}" of relation "phase1_incidents" violates not-null constraint`,
    );
  }
}

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

function matchBalanced(expr: string, prefixRe: RegExp): string[] | null {
  const m = expr.match(prefixRe);
  if (!m) return null;
  const open = expr.indexOf("(");
  const close = expr.lastIndexOf(")");
  if (open === -1 || close === -1 || close < open) return null;
  return splitTopLevelCommas(expr.slice(open + 1, close));
}

function evaluateExpr(expr: string, ctx: EvalCtx): unknown {
  const trimmed = expr.trim();

  const caseMatch = trimmed.match(
    /^CASE\s+WHEN\s+([\s\S]+?)\s+THEN\s+([\s\S]+?)\s+ELSE\s+([\s\S]+?)\s+END$/i,
  );
  if (caseMatch) {
    const [, cond, thenExpr, elseExpr] = caseMatch as unknown as [
      string,
      string,
      string,
      string,
    ];
    return evaluateCondition(cond, ctx)
      ? evaluateExpr(thenExpr, ctx)
      : evaluateExpr(elseExpr, ctx);
  }

  const greatestArgs = matchBalanced(trimmed, /^GREATEST\(/i);
  if (greatestArgs) {
    const [a, b] = greatestArgs;
    const va = evaluateExpr(a!, ctx) as string | undefined;
    const vb = evaluateExpr(b!, ctx) as string | undefined;
    if (va === undefined) return vb;
    if (vb === undefined) return va;
    return va >= vb ? va : vb;
  }

  const coalesceArgs = matchBalanced(trimmed, /^COALESCE\(/i);
  if (coalesceArgs) {
    const [a, b] = coalesceArgs;
    const va = evaluateExpr(a!, ctx);
    return va !== undefined ? va : evaluateExpr(b!, ctx);
  }

  const toJsonbArgs = matchBalanced(trimmed, /^to_jsonb\(/i);
  if (toJsonbArgs) {
    // Strict SQL function: SQL NULL input -> SQL NULL output.
    return evaluateExpr(toJsonbArgs[0]!, ctx);
  }

  const jsonbSetArgs = matchBalanced(trimmed, /^jsonb_set\(/i);
  if (jsonbSetArgs) {
    const [targetExpr, pathLiteral, valueExpr] = jsonbSetArgs;
    const target = evaluateExpr(targetExpr!, ctx);
    const value = evaluateExpr(valueExpr!, ctx);
    if (target === undefined || value === undefined) {
      // Strict SQL function: either NULL argument -> SQL NULL result.
      return undefined;
    }
    const keyMatch = pathLiteral!.trim().match(/^'\{(\w+)\}'$/);
    if (!keyMatch) {
      throw new Error(
        `FakeIncidentPgClient: bad jsonb_set path "${pathLiteral}"`,
      );
    }
    if (typeof target !== "object" || target === null) {
      throw new Error(
        "FakeIncidentPgClient: jsonb_set target is not an object",
      );
    }
    return { ...(target as FakeRow), [keyMatch[1]!]: value };
  }

  const scalarSubqueryMatch = trimmed.match(
    /^\(\s*SELECT\s+(\w+)\s+FROM\s+(\w+)\s*\)$/i,
  );
  if (scalarSubqueryMatch) {
    const [, col, cteName] = scalarSubqueryMatch;
    const cteRow = ctx.cte[cteName!];
    return cteRow ? cteRow[col!] : undefined;
  }

  const jsonArrowMatch = trimmed.match(/^(\w+)\s*->\s*'(\w+)'$/);
  if (jsonArrowMatch) {
    const [, col, key] = jsonArrowMatch;
    const container = ctx.existing[col!];
    if (container === undefined || container === null) return undefined;
    return (container as FakeRow)[key!];
  }

  if (/^'null'::jsonb$/i.test(trimmed)) {
    return null;
  }

  if (trimmed.startsWith("EXCLUDED.")) {
    if (!ctx.excluded) {
      throw new Error(
        "FakeIncidentPgClient: EXCLUDED referenced outside upsert",
      );
    }
    return ctx.excluded[trimmed.slice("EXCLUDED.".length)];
  }

  if (trimmed.startsWith("ops.phase1_incidents.")) {
    return ctx.existing[trimmed.slice("ops.phase1_incidents.".length)];
  }

  const paramMatch = trimmed.match(/^\$(\d+)(::\w+)?$/);
  if (paramMatch) {
    return ctx.params[Number(paramMatch[1]) - 1];
  }

  const bareColumnMatch = trimmed.match(/^(\w+)$/);
  if (bareColumnMatch) {
    return ctx.existing[bareColumnMatch[1]!];
  }

  throw new Error(`FakeIncidentPgClient: unsupported expr "${expr}"`);
}

function evaluateCondition(cond: string, ctx: EvalCtx): boolean {
  let trimmed = cond.trim();
  if (trimmed.startsWith("(") && trimmed.endsWith(")"))
    trimmed = trimmed.slice(1, -1).trim();
  for (const operator of [" OR ", " AND "]) {
    let depth = 0;
    for (let i = 0; i <= trimmed.length - operator.length; i++) {
      if (trimmed[i] === "(") depth++;
      if (trimmed[i] === ")") depth--;
      if (
        !depth &&
        trimmed.slice(i, i + operator.length).toUpperCase() === operator
      ) {
        const left = evaluateCondition(trimmed.slice(0, i), ctx);
        const right = evaluateCondition(
          trimmed.slice(i + operator.length),
          ctx,
        );
        return operator === " OR " ? left || right : left && right;
      }
    }
  }
  if (/^NOT /i.test(trimmed)) return !evaluateCondition(trimmed.slice(4), ctx);
  if (/^\$\d+::boolean$/i.test(trimmed))
    return evaluateExpr(trimmed, ctx) === true;
  const notNull = trimmed.match(/^([\s\S]+) IS NOT NULL$/i);
  if (notNull) return evaluateExpr(notNull[1]!, ctx) !== undefined;
  const distinct = trimmed.match(/^([\s\S]+) IS DISTINCT FROM ([\s\S]+)$/i);
  if (distinct)
    return evaluateExpr(distinct[1]!, ctx) !== evaluateExpr(distinct[2]!, ctx);

  const gt = splitAtTopLevelOperator(trimmed, ">");
  if (gt) {
    const left = evaluateExpr(gt[0], ctx) as string | undefined;
    const right = evaluateExpr(gt[1], ctx) as string | undefined;
    if (left === undefined || right === undefined) return false;
    return left > right;
  }

  const eq = splitAtTopLevelOperator(trimmed, "=");
  if (eq) {
    const left = evaluateExpr(eq[0], ctx);
    const right = evaluateExpr(eq[1], ctx);
    if (left === undefined || right === undefined) return false; // SQL NULL comparison -> UNKNOWN (treated as not-true)
    return left === right;
  }

  throw new Error(`FakeIncidentPgClient: unsupported condition "${cond}"`);
}

// Splits `text` on a top-level (paren-depth-0) occurrence of `op`, used only
// for the simple `<expr> <op> <expr>` conditions this repository emits.
function splitAtTopLevelOperator(
  text: string,
  op: string,
): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && ch === op) {
      return [text.slice(0, i), text.slice(i + 1)];
    }
  }
  return null;
}

export class FakeIncidentPgClient {
  private readonly rows = new Map<string, FakeRow>();

  getRow(incidentId: string): FakeRow | undefined {
    const row = this.rows.get(incidentId);
    return row ? { ...row } : undefined;
  }

  async query<T extends FakeRow = FakeRow>(
    sql: string,
    rawParams: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number }> {
    const params = rawParams.map((p) => (p === null ? undefined : p));
    const trimmedSql = sql.trim().replace(/\s+RETURNING record$/i, "");

    const upsertMatch = trimmedSql.match(
      /^INSERT INTO ops\.phase1_incidents\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)\s*ON CONFLICT \(incident_id\) DO UPDATE SET([\s\S]+)$/i,
    );
    if (upsertMatch) {
      return this.handleUpsert(upsertMatch, params) as unknown as {
        rows: T[];
        rowCount: number;
      };
    }

    const revertMatch = trimmedSql.match(
      /^WITH (\w+) AS (?:MATERIALIZED )?\(\s*SELECT ([\s\S]+?) FROM ops\.phase1_incidents\s+WHERE incident_id = \$(\d+)\s*(?:FOR UPDATE\s*)?\)\s*UPDATE ops\.phase1_incidents\s+SET([\s\S]+?)WHERE incident_id = \$(\d+)\s+RETURNING ([\s\S]+)$/i,
    );
    if (revertMatch) {
      return this.handleConditionalRevert(revertMatch, params) as unknown as {
        rows: T[];
        rowCount: number;
      };
    }

    throw new Error(`FakeIncidentPgClient: unsupported SQL: ${sql}`);
  }

  private handleUpsert(
    match: RegExpMatchArray,
    params: unknown[],
  ): { rows: FakeRow[]; rowCount: number } {
    const [, columnsRaw, valuesRaw, setClauseRaw] = match;
    const columns = columnsRaw!.split(",").map((c) => c.trim());
    const placeholders = splitTopLevelCommas(valuesRaw!);

    const excludedRow: FakeRow = {};
    placeholders.forEach((placeholder, index) => {
      const column = columns[index]!;
      const m = placeholder.match(/^\$(\d+)/);
      if (!m) {
        throw new Error(
          `FakeIncidentPgClient: bad placeholder "${placeholder}"`,
        );
      }
      const raw = params[Number(m[1]) - 1];
      excludedRow[column] =
        placeholder.includes("::jsonb") && typeof raw === "string"
          ? JSON.parse(raw)
          : raw === null
            ? undefined
            : raw;
    });

    const incidentId = excludedRow.incident_id as string;
    const existingRow = this.rows.get(incidentId);

    if (!existingRow) {
      this.rows.set(incidentId, { ...excludedRow });
      return { rows: [{ record: excludedRow.record }], rowCount: 1 };
    }

    const ctx: EvalCtx = {
      excluded: excludedRow,
      existing: existingRow,
      cte: {},
      params,
    };
    const updates: FakeRow = {};
    for (const assignment of splitTopLevelCommas(setClauseRaw!)) {
      const eqIdx = assignment.indexOf("=");
      const column = assignment.slice(0, eqIdx).trim();
      const expr = assignment.slice(eqIdx + 1).trim();
      updates[column] = evaluateExpr(expr, ctx);
    }

    if (updates.record === undefined) {
      throw new NotNullViolation("record");
    }

    Object.assign(existingRow, updates);
    return { rows: [{ record: existingRow.record }], rowCount: 1 };
  }

  private handleConditionalRevert(
    match: RegExpMatchArray,
    params: unknown[],
  ): { rows: FakeRow[]; rowCount: number } {
    const [
      ,
      cteName,
      cteCols,
      cteWhereParamIdx,
      setClauseRaw,
      updateWhereParamIdx,
      returningRaw,
    ] = match;

    const cteIncidentId = params[Number(cteWhereParamIdx) - 1] as string;
    const updateIncidentId = params[Number(updateWhereParamIdx) - 1] as string;
    const existingRow = this.rows.get(updateIncidentId);

    if (!existingRow || cteIncidentId !== updateIncidentId) {
      return { rows: [], rowCount: 0 };
    }

    const cteRow: FakeRow = {};
    for (const col of cteCols!.split(",").map((c) => c.trim())) {
      cteRow[col] = existingRow[col];
    }

    const ctx: EvalCtx = {
      existing: existingRow,
      cte: { [cteName!]: cteRow },
      params,
    };

    const updates: FakeRow = {};
    for (const assignment of splitTopLevelCommas(setClauseRaw!)) {
      const eqIdx = assignment.indexOf("=");
      const column = assignment.slice(0, eqIdx).trim();
      const expr = assignment.slice(eqIdx + 1).trim();
      updates[column] = evaluateExpr(expr, ctx);
    }

    if (updates.record === undefined) {
      throw new NotNullViolation("record");
    }

    const returningMatch = returningRaw!
      .trim()
      .match(/^\(([\s\S]+)\)\s+AS\s+(\w+)$/i);
    if (!returningMatch) {
      throw new Error(
        `FakeIncidentPgClient: unsupported RETURNING "${returningRaw}"`,
      );
    }
    const [, returningExpr, alias] = returningMatch;
    // RETURNING reads the pre-update CTE snapshot, same as the SET clause.
    const returningValue = evaluateCondition(returningExpr!, ctx);

    Object.assign(existingRow, updates);

    return { rows: [{ [alias!]: returningValue }], rowCount: 1 };
  }
}

export class FakeIncidentDatabaseService {
  readonly client = new FakeIncidentPgClient();

  isEnabled() {
    return true;
  }

  async query<T extends FakeRow = FakeRow>(
    sql: string,
    params?: readonly unknown[],
  ) {
    return this.client.query<T>(sql, params ?? []);
  }
}
