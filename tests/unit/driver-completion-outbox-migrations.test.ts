import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");
const v0065 = readFileSync(
  path.join(repoRoot, "infra/migrations/V0065__driver_completion_outbox.sql"),
  "utf8",
);
const v0066 = readFileSync(
  path.join(
    repoRoot,
    "infra/migrations/V0066__driver_completion_outbox_recovery_hardening.sql",
  ),
  "utf8",
);

const expectedEffectTypes = [
  "tenant_order_completed_webhook",
  "owned_mobility_trip_completed",
  "multi_taxi_certificate",
  "completion_audit_bundle",
  "driver_task_updated",
  "ops_dispatch_job_updated",
];

function extractEffectTypeConstraint(sql: string) {
  const constraint = sql.match(
    /(?:ADD\s+)?CONSTRAINT\s+driver_completion_outbox_effect_type_chk\s+CHECK\s*\(\s*effect_type\s+IN\s*\(([^)]*)\)\s*\)/s,
  );
  expect(constraint, "effect-type CHECK constraint is missing").not.toBeNull();
  return [...(constraint?.[1] ?? "").matchAll(/'([^']+)'/g)].map(
    (match) => match[1],
  );
}

describe("driver completion outbox migrations", () => {
  it("allows exactly the six durable effects on fresh and upgraded databases", () => {
    expect(extractEffectTypeConstraint(v0065)).toEqual(expectedEffectTypes);
    expect(extractEffectTypeConstraint(v0066)).toEqual(expectedEffectTypes);
  });

  it("does not allow fresh installs to cascade-delete durable completion intent", () => {
    expect(v0065).toContain(
      "REFERENCES ops.phase1_driver_tasks(task_id) ON DELETE NO ACTION",
    );
    expect(v0065).toContain(
      "REFERENCES ops.phase1_owned_orders(order_id) ON DELETE NO ACTION",
    );
    expect(v0065).not.toContain("ON DELETE CASCADE");
  });

  it("repairs legacy foreign keys to durable no-action constraints", () => {
    expect(v0066).toContain(
      "DROP CONSTRAINT IF EXISTS driver_completion_outbox_task_id_fkey;",
    );
    expect(v0066).toContain(
      "DROP CONSTRAINT IF EXISTS driver_completion_outbox_order_id_fkey;",
    );
    expect(v0066).toContain(
      "ADD CONSTRAINT driver_completion_outbox_task_order_fk",
    );
    expect(v0066).toContain("FOREIGN KEY (task_id, order_id)");
    expect(v0066).toContain("ON DELETE NO ACTION;");
    expect(v0066).toContain("ADD CONSTRAINT driver_completion_outbox_order_fk");
    expect(v0066).not.toContain("ON DELETE CASCADE");
  });

  it("keeps the global recovery readiness index and hardening checks in place", () => {
    expect(v0066).toContain(
      "ADD CONSTRAINT driver_completion_outbox_delivery_state_chk CHECK",
    );
    expect(v0066).toContain(
      "ADD CONSTRAINT driver_completion_outbox_processing_lease_chk CHECK",
    );
    expect(v0066).toContain(
      "ADD CONSTRAINT driver_completion_outbox_dead_letter_state_chk CHECK",
    );
    expect(v0066).toContain(
      "ADD CONSTRAINT phase1_driver_tasks_task_order_unique UNIQUE (task_id, order_id);",
    );
    expect(v0066).toContain(
      "CREATE INDEX IF NOT EXISTS driver_completion_outbox_recovery_idx",
    );
    expect(v0066).toContain("next_attempt_at,");
    expect(v0066).toContain("created_at,");
    expect(v0066).toContain("task_id,");
    expect(v0066).toContain("outbox_id");
  });
});
