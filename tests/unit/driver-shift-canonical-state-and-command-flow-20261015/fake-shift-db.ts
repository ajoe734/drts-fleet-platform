/**
 * Socket-free, in-memory stand-in for the two `ops.phase1_driver_shifts` /
 * `ops.phase1_driver_attendance` tables plus `reg.phase1_registry_drivers`,
 * wired behind the same `{ isEnabled, query, connect }` shape that
 * `DatabaseService` exposes. It is handed directly to a real
 * `ShiftAttendanceRepository` (not a mocked repository) so the actual SQL
 * text/params the repository issues is exercised, including unique-key
 * conflicts (pg error code 23505) and row locking order. It is not
 * PostgreSQL acceptance evidence — it is a controlled fixture for the
 * repository's transaction/retry logic.
 */

type Row = Record<string, unknown>;

export class FakeUniqueViolationError extends Error {
  code = "23505";
  constructor(constraint: string) {
    super(`duplicate key value violates unique constraint "${constraint}"`);
  }
}

/**
 * Real Postgres rejects every statement in a transaction with SQLSTATE
 * 25P02 ("current transaction is aborted, commands ignored until end of
 * transaction block") once any earlier statement in that transaction has
 * failed — until a ROLLBACK or ROLLBACK TO SAVEPOINT clears the aborted
 * state. A fixture that silently let later statements (e.g. a retry's
 * re-allocation SELECT) succeed after a failed INSERT would hide exactly
 * the bug this file exists to catch.
 */
export class FakeAbortedTransactionError extends Error {
  code = "25P02";
  constructor() {
    super(
      "current transaction is aborted, commands ignored until end of transaction block",
    );
  }
}

type QueuedFailure = {
  match: string;
  error: Error;
};

type Snapshot = {
  shifts: Map<string, Row>;
  shiftNos: Set<string>;
  attendance: Map<string, Row>;
};

export function createFakeShiftDatabase(seedDriverIds: readonly string[] = []) {
  const drivers = new Set<string>(seedDriverIds);
  const shifts = new Map<string, Row>();
  const shiftNos = new Set<string>();
  const attendance = new Map<string, Row>();
  const queuedFailures: QueuedFailure[] = [];

  // Real transactional semantics, so a mid-transaction failure followed by
  // ROLLBACK actually undoes earlier statements in the same BEGIN block —
  // matching what the repository relies on from real Postgres.
  let txSnapshot: Snapshot | null = null;
  // Mirrors Postgres's aborted-transaction state: set whenever a statement
  // fails inside an open transaction, cleared only by ROLLBACK or
  // ROLLBACK TO SAVEPOINT.
  let aborted = false;
  const savepoints = new Map<string, Snapshot>();

  function cloneSnapshot(): Snapshot {
    return {
      shifts: new Map(shifts),
      shiftNos: new Set(shiftNos),
      attendance: new Map(attendance),
    };
  }

  function restoreSnapshot(snapshot: Snapshot) {
    shifts.clear();
    for (const [k, v] of snapshot.shifts) shifts.set(k, v);
    shiftNos.clear();
    for (const v of snapshot.shiftNos) shiftNos.add(v);
    attendance.clear();
    for (const [k, v] of snapshot.attendance) attendance.set(k, v);
  }

  function normalize(sql: string) {
    return sql.replace(/\s+/g, " ").trim();
  }

  function takeQueuedFailure(text: string): Error | undefined {
    const index = queuedFailures.findIndex((f) => text.includes(f.match));
    if (index === -1) return undefined;
    return queuedFailures.splice(index, 1)[0]?.error;
  }

  function maxMatching(ids: Iterable<string>, pattern: RegExp): string | undefined {
    const sorted = [...ids].filter((id) => pattern.test(id)).sort();
    return sorted[sorted.length - 1];
  }

  function param(params: readonly unknown[], index: number): string {
    return params[index] as string;
  }

  async function query(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<{ rows: Row[] }> {
    const text = normalize(sql);

    if (text === "BEGIN") {
      txSnapshot = cloneSnapshot();
      aborted = false;
      savepoints.clear();
      return { rows: [] };
    }

    if (text === "COMMIT") {
      if (aborted) {
        // Real Postgres implicitly rolls back and errors a COMMIT issued
        // against an already-aborted transaction.
        if (txSnapshot) restoreSnapshot(txSnapshot);
        txSnapshot = null;
        aborted = false;
        savepoints.clear();
        throw new FakeAbortedTransactionError();
      }
      txSnapshot = null;
      savepoints.clear();
      return { rows: [] };
    }

    if (text === "ROLLBACK") {
      if (txSnapshot) {
        restoreSnapshot(txSnapshot);
        txSnapshot = null;
      }
      aborted = false;
      savepoints.clear();
      return { rows: [] };
    }

    if (text.startsWith("SAVEPOINT ")) {
      if (aborted) {
        throw new FakeAbortedTransactionError();
      }
      const name = text.slice("SAVEPOINT ".length).trim();
      savepoints.set(name, cloneSnapshot());
      return { rows: [] };
    }

    if (text.startsWith("ROLLBACK TO SAVEPOINT ")) {
      const name = text.slice("ROLLBACK TO SAVEPOINT ".length).trim();
      const snapshot = savepoints.get(name);
      if (snapshot) {
        restoreSnapshot(snapshot);
      }
      aborted = false;
      return { rows: [] };
    }

    if (aborted) {
      throw new FakeAbortedTransactionError();
    }

    const queuedError = takeQueuedFailure(text);
    if (queuedError) {
      if (txSnapshot) aborted = true;
      throw queuedError;
    }

    try {
      return executeStatement(text, params);
    } catch (error) {
      if (txSnapshot) {
        aborted = true;
      }
      throw error;
    }
  }

  function executeStatement(
    text: string,
    params: readonly unknown[],
  ): { rows: Row[] } {
    if (text.includes("FROM reg.phase1_registry_drivers")) {
      const driverId = param(params, 0);
      return { rows: drivers.has(driverId) ? [{ driver_id: driverId }] : [] };
    }

    if (
      text.includes("SELECT shift_id FROM ops.phase1_driver_shifts WHERE shift_id ~")
    ) {
      const last = maxMatching(shifts.keys(), /^SFT-\d{6}$/);
      return { rows: last ? [{ shift_id: last }] : [] };
    }

    if (
      text.includes(
        "SELECT attendance_id FROM ops.phase1_driver_attendance WHERE attendance_id ~",
      )
    ) {
      const last = maxMatching(attendance.keys(), /^ATT-\d{6}$/);
      return { rows: last ? [{ attendance_id: last }] : [] };
    }

    if (
      text.includes("SELECT shift_id FROM ops.phase1_driver_shifts WHERE driver_id") &&
      text.includes("status = 'active'")
    ) {
      const driverId = param(params, 0);
      const row = [...shifts.values()].find(
        (r) => r.driver_id === driverId && r.status === "active",
      );
      return { rows: row ? [{ shift_id: row.shift_id }] : [] };
    }

    if (
      text.includes("SELECT record FROM ops.phase1_driver_shifts WHERE driver_id") &&
      text.includes("status = 'active'")
    ) {
      const driverId = param(params, 0);
      const row = [...shifts.values()].find(
        (r) => r.driver_id === driverId && r.status === "active",
      );
      return { rows: row ? [{ record: row.record }] : [] };
    }

    if (text.includes("SELECT record FROM ops.phase1_driver_shifts WHERE shift_id = $1")) {
      const row = shifts.get(param(params, 0));
      return { rows: row ? [{ record: row.record }] : [] };
    }

    if (
      text.includes("SELECT record") &&
      text.includes("FROM ops.phase1_driver_shifts") &&
      text.includes("WHERE driver_id = $1") &&
      text.includes("ORDER BY clock_in_at DESC")
    ) {
      const driverId = param(params, 0);
      const rows = [...shifts.values()].filter((r) => r.driver_id === driverId);
      return { rows: rows.map((r) => ({ record: r.record })) };
    }

    if (
      text.includes("SELECT record") &&
      text.includes("FROM ops.phase1_driver_shifts") &&
      text.includes("ORDER BY clock_in_at DESC")
    ) {
      return { rows: [...shifts.values()].map((r) => ({ record: r.record })) };
    }

    if (
      text.includes("SELECT record") &&
      text.includes("FROM ops.phase1_driver_attendance") &&
      text.includes("WHERE driver_id = $1")
    ) {
      const driverId = param(params, 0);
      const rows = [...attendance.values()].filter((r) => r.driver_id === driverId);
      return { rows: rows.map((r) => ({ record: r.record })) };
    }

    if (
      text.includes("SELECT record") &&
      text.includes("FROM ops.phase1_driver_attendance")
    ) {
      return { rows: [...attendance.values()].map((r) => ({ record: r.record })) };
    }

    if (text.includes("INSERT INTO ops.phase1_driver_shifts")) {
      const shiftId = param(params, 0);
      const shiftNo = param(params, 1);
      const driverId = param(params, 2);
      const status = param(params, 4);
      const recordJson = param(params, 9);
      const isUpsert = text.includes("ON CONFLICT");
      if (!isUpsert && (shifts.has(shiftId) || shiftNos.has(shiftNo))) {
        throw new FakeUniqueViolationError("phase1_driver_shifts_pkey");
      }
      shifts.set(shiftId, {
        shift_id: shiftId,
        shift_no: shiftNo,
        driver_id: driverId,
        status,
        record: JSON.parse(recordJson),
      });
      shiftNos.add(shiftNo);
      return { rows: [] };
    }

    if (text.includes("UPDATE ops.phase1_driver_shifts")) {
      const shiftId = param(params, 0);
      const status = param(params, 1);
      const recordJson = param(params, 4);
      const existing = shifts.get(shiftId);
      if (!existing) {
        throw new Error(`fake UPDATE affected no row for shift_id=${shiftId}`);
      }
      shifts.set(shiftId, {
        ...existing,
        status,
        record: JSON.parse(recordJson),
      });
      return { rows: [] };
    }

    if (text.includes("INSERT INTO ops.phase1_driver_attendance")) {
      const attendanceId = param(params, 0);
      const driverId = param(params, 1);
      const shiftId = param(params, 2);
      const status = param(params, 4);
      const recordJson = param(params, 7);
      const isUpsert = text.includes("ON CONFLICT");
      if (!isUpsert && attendance.has(attendanceId)) {
        throw new FakeUniqueViolationError("phase1_driver_attendance_pkey");
      }
      attendance.set(attendanceId, {
        attendance_id: attendanceId,
        driver_id: driverId,
        shift_id: shiftId,
        status,
        record: JSON.parse(recordJson),
      });
      return { rows: [] };
    }

    throw new Error(`fake-shift-db: unhandled query: ${text}`);
  }

  const client = { query, release: () => {} };

  const databaseService = {
    isEnabled: () => true,
    query: (sql: string, values?: readonly unknown[]) => query(sql, values ?? []),
    connect: async () => client,
  };

  return {
    databaseService,
    addDriver(driverId: string) {
      drivers.add(driverId);
    },
    /** Seed a committed row directly, bypassing the repository (simulates a write already made by another process). */
    seedShift(row: {
      shiftId: string;
      driverId: string;
      status: string;
      record: unknown;
    }) {
      shifts.set(row.shiftId, {
        shift_id: row.shiftId,
        shift_no: row.shiftId,
        driver_id: row.driverId,
        status: row.status,
        record: row.record,
      });
      shiftNos.add(row.shiftId);
    },
    getShiftRow(shiftId: string) {
      return shifts.get(shiftId);
    },
    shiftCount() {
      return shifts.size;
    },
    attendanceCount() {
      return attendance.size;
    },
    /** Next matching query throws `error` once, then normal behaviour resumes. */
    queueFailure(match: string, error: Error) {
      queuedFailures.push({ match, error });
    },
  };
}
