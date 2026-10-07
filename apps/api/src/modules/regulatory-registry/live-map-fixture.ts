import { Logger } from "@nestjs/common";
import type { DriverRegistryRecord } from "@drts/contracts";
import type { PoolClient } from "pg";

import type { DatabaseService } from "../../common/db";
import { detectAuthEnvironment } from "../../config/auth-startup-config";

export const LIVE_MAP_FIXTURE_DRIVER_ID = "drv-demo-002";
const logger = new Logger("LiveMapFixture");

type Refusal =
  | "LIVE_MAP_FIXTURE_ENVIRONMENT_FORBIDDEN"
  | "LIVE_MAP_FIXTURE_DATABASE_REQUIRED"
  | "LIVE_MAP_FIXTURE_DRIVER_UNSAFE"
  | "LIVE_MAP_FIXTURE_ASSIGNED"
  | "LIVE_MAP_FIXTURE_BOUND"
  | "LIVE_MAP_FIXTURE_INVITATION_PENDING"
  | "LIVE_MAP_FIXTURE_READBACK_UNSAFE"
  | "LIVE_MAP_FIXTURE_CONTEXT_UNAVAILABLE"
  | "LIVE_MAP_FIXTURE_PERSISTENCE_FAILED";

export type LiveMapFixtureResult =
  | { status: "disabled" }
  | { status: "refused"; reason: Refusal }
  | { status: "created" | "unchanged" };

type StoredDriver = { record: DriverRegistryRecord; work_state: string };
type IsolationContext = {
  has_supply_pair: boolean;
  has_task: boolean;
  has_binding: boolean;
  has_profile_binding: boolean;
  has_pending_invitation: boolean;
  has_tracking_context: boolean;
};

function refuse(reason: Refusal): LiveMapFixtureResult {
  // Never log rows, names, tokens, connection errors or arbitrary server values.
  logger.warn(reason);
  return { status: "refused", reason };
}

export function isIsolatedLiveMapFixture(
  record: DriverRegistryRecord | undefined,
) {
  return (
    record?.driverId === LIVE_MAP_FIXTURE_DRIVER_ID &&
    record.workState === "offline" &&
    record.dispatchEligible === false &&
    Array.isArray(record.deviceBindings) &&
    record.deviceBindings.every((binding) => binding?.status === "revoked")
  );
}

function unsafeDriver(driver: StoredDriver) {
  return (
    driver.work_state !== "offline" || !isIsolatedLiveMapFixture(driver.record)
  );
}

async function readDriver(client: PoolClient) {
  const result = await client.query<StoredDriver>(
    `SELECT record, work_state FROM reg.phase1_registry_drivers
     WHERE driver_id = $1 FOR UPDATE`,
    [LIVE_MAP_FIXTURE_DRIVER_ID],
  );
  return result.rows[0];
}

async function readIsolationContext(client: PoolClient) {
  // Official V0011/V0012/V0018A/V0034/V0078 schemas. Registry/profile
  // snapshots alone are not authority for an active device session or task.
  // Conservatively refuse prior task/assignment/on-duty telemetry too: this
  // hook never repurposes an identity previously used for operational work.
  const result = await client.query<IsolationContext>(
    `SELECT
       EXISTS (SELECT 1 FROM reg.phase1_registry_supply_pairs WHERE driver_id = $1) AS has_supply_pair,
       EXISTS (
         SELECT 1 FROM ops.phase1_driver_tasks WHERE record->>'driverId' = $1
         UNION ALL
         SELECT 1 FROM ops.phase1_dispatch_assignments WHERE record->>'driverId' = $1
       ) AS has_task,
       EXISTS (SELECT 1 FROM iam.driver_device_bindings WHERE driver_id = $1 AND status = 'active') AS has_binding,
       EXISTS (
         SELECT 1 FROM ops.phase1_driver_profiles p,
           jsonb_array_elements(COALESCE(p.record->'deviceBindings', '[]'::jsonb)) b
         WHERE p.driver_id = $1 AND b->>'status' IS DISTINCT FROM 'revoked'
       ) AS has_profile_binding,
       EXISTS (
         SELECT 1 FROM iam.driver_device_invitations
         WHERE driver_id = $1 AND status = 'pending' AND expires_at > now()
       ) AS has_pending_invitation,
       EXISTS (
         SELECT 1 FROM telemetry.driver_location_events
         WHERE driver_id = $1
           AND (vehicle_id IS NOT NULL OR task_id IS NOT NULL OR work_state <> 'offline')
       ) AS has_tracking_context`,
    [LIVE_MAP_FIXTURE_DRIVER_ID],
  );
  return result.rows[0];
}

function contextRefusal(context: IsolationContext | undefined): Refusal | null {
  if (
    !context ||
    [
      context.has_supply_pair,
      context.has_task,
      context.has_binding,
      context.has_profile_binding,
      context.has_pending_invitation,
      context.has_tracking_context,
    ].some((value) => typeof value !== "boolean")
  ) {
    return "LIVE_MAP_FIXTURE_CONTEXT_UNAVAILABLE";
  }
  if (
    context.has_supply_pair ||
    context.has_task ||
    context.has_tracking_context
  ) {
    return "LIVE_MAP_FIXTURE_ASSIGNED";
  }
  if (context.has_binding || context.has_profile_binding)
    return "LIVE_MAP_FIXTURE_BOUND";
  if (context.has_pending_invitation)
    return "LIVE_MAP_FIXTURE_INVITATION_PENDING";
  return null;
}

function newFixture(): DriverRegistryRecord {
  const now = new Date().toISOString();
  return {
    driverId: LIVE_MAP_FIXTURE_DRIVER_ID,
    name: "Live Map Acceptance Fixture",
    supportedServiceBuckets: ["standard_taxi"],
    workState: "offline",
    licensesValid: true,
    lifecycleStatus: "active",
    eligibilityBlockedReasons: ["work_state_offline"],
    dispatchEligible: false,
    createdAt: now,
    updatedAt: now,
    activatedAt: now,
    suspendedAt: null,
    retiredAt: null,
    profileUpdatedAt: null,
    deviceBindings: [],
  };
}

export async function ensureLiveMapFixture(
  database: DatabaseService | undefined,
): Promise<LiveMapFixtureResult> {
  if (process.env.DRTS_E2E_PROVISIONING !== "true")
    return { status: "disabled" };
  const environment = detectAuthEnvironment(process.env);
  if (environment === "production" || environment === "staging") {
    return refuse("LIVE_MAP_FIXTURE_ENVIRONMENT_FORBIDDEN");
  }
  if (!database?.isEnabled())
    return refuse("LIVE_MAP_FIXTURE_DATABASE_REQUIRED");

  let client: PoolClient | undefined;
  try {
    client = await database.connect();
    await client.query("BEGIN");
    // Serialize concurrent startup hooks for the same fixed fixture. Operators
    // must still avoid overlapping deployment, acceptance or fixture writes.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["drts-live-map-fixture:drv-demo-002"],
    );
    let driver = await readDriver(client);
    let reason = contextRefusal(await readIsolationContext(client));
    let result: LiveMapFixtureResult;
    if (reason) result = refuse(reason);
    else if (driver) {
      result = unsafeDriver(driver)
        ? refuse("LIVE_MAP_FIXTURE_DRIVER_UNSAFE")
        : { status: "unchanged" };
    } else {
      const fixture = newFixture();
      const inserted = await client.query(
        `INSERT INTO reg.phase1_registry_drivers
         (driver_id, full_name, work_state, licenses_valid, updated_at, record)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (driver_id) DO NOTHING RETURNING record`,
        [
          fixture.driverId,
          fixture.name,
          fixture.workState,
          fixture.licensesValid,
          fixture.updatedAt,
          JSON.stringify(fixture),
        ],
      );
      if (inserted.rows.length === 1) result = { status: "created" };
      else {
        // Another writer may have won the unique-key race. Never replace it,
        // including when its state became unsafe since our initial read.
        driver = await readDriver(client);
        reason = contextRefusal(await readIsolationContext(client));
        result = reason
          ? refuse(reason)
          : !driver || unsafeDriver(driver)
            ? refuse("LIVE_MAP_FIXTURE_DRIVER_UNSAFE")
            : { status: "unchanged" };
      }
    }
    await client.query("COMMIT");
    if (result.status === "created") logger.log("LIVE_MAP_FIXTURE_CREATED");
    if (result.status === "unchanged") logger.log("LIVE_MAP_FIXTURE_UNCHANGED");
    return result;
  } catch {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* Fixed error below. */
      }
    }
    // Fixture availability must never decide application availability: an
    // opted-in failed durable ensure is refused, not thrown, and must not
    // fall back to in-memory seeds either.
    return refuse("LIVE_MAP_FIXTURE_PERSISTENCE_FAILED");
  } finally {
    client?.release();
  }
}

// Every statement below is parameterized on the reserved fixture identity
// and nothing else; it is not possible to call this with another driver's
// ID, so a live-map acceptance run can be unstuck without risk to real
// drivers even when the API process it would normally call cannot start.
const LIVE_MAP_FIXTURE_RESET_TABLES = [
  "iam.driver_refresh_families",
  "iam.driver_device_bindings",
  "iam.driver_device_invitations",
  "ops.phase1_driver_profiles",
  "reg.phase1_registry_supply_pairs",
  "telemetry.driver_location_events",
] as const;

export type LiveMapFixtureResetResult = {
  status: "disabled" | "reset" | "failed";
};

export async function resetLiveMapFixture(
  database: DatabaseService | undefined,
): Promise<LiveMapFixtureResetResult> {
  if (process.env.DRTS_E2E_PROVISIONING !== "true")
    return { status: "disabled" };
  const environment = detectAuthEnvironment(process.env);
  if (environment === "production" || environment === "staging") {
    logger.warn("LIVE_MAP_FIXTURE_ENVIRONMENT_FORBIDDEN");
    return { status: "disabled" };
  }
  if (!database?.isEnabled()) return { status: "disabled" };

  let client: PoolClient | undefined;
  try {
    client = await database.connect();
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["drts-live-map-fixture:drv-demo-002"],
    );
    for (const table of LIVE_MAP_FIXTURE_RESET_TABLES) {
      await client.query(`DELETE FROM ${table} WHERE driver_id = $1`, [
        LIVE_MAP_FIXTURE_DRIVER_ID,
      ]);
    }
    await client.query(
      `DELETE FROM ops.phase1_driver_tasks WHERE record->>'driverId' = $1`,
      [LIVE_MAP_FIXTURE_DRIVER_ID],
    );
    await client.query(
      `DELETE FROM ops.phase1_dispatch_assignments WHERE record->>'driverId' = $1`,
      [LIVE_MAP_FIXTURE_DRIVER_ID],
    );
    // Drop the fixture row itself last; ensureLiveMapFixture recreates a
    // fresh isolated record on the next startup or acceptance run.
    await client.query(
      "DELETE FROM reg.phase1_registry_drivers WHERE driver_id = $1",
      [LIVE_MAP_FIXTURE_DRIVER_ID],
    );
    await client.query("COMMIT");
    logger.log("LIVE_MAP_FIXTURE_RESET");
    return { status: "reset" };
  } catch {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* Fixed error below. */
      }
    }
    logger.warn("LIVE_MAP_FIXTURE_RESET_FAILED");
    return { status: "failed" };
  } finally {
    client?.release();
  }
}
