import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, it } from "vitest";

const apiRequire = createRequire(path.resolve("apps/api/package.json"));
const { Client } = apiRequire("pg");
const { credentials } = apiRequire(
  path.resolve("infra/gcp/dev/ops-drill/db_credentials.cjs"),
);

it("matches the API pg driver's credentials without opening a connection", () => {
  const urls = [
    "postgresql://drill-user:TOP-SECRET-PASSWORD@/drts?host=/cloudsql/private-db",
    "postgres://drill-user:TOP-SECRET:p@ss+[]@/drts?host=/cloudsql/private-db",
    "postgresql://drill%40user:TOP-SECRET%40%3A%2F%3F%23%25%5B%5D%5C@/drts?host=/cloudsql/private-db",
    "postgresql://drill-user:TOP-SECRET-PASSWORD@private-db/drts%20db",
    "postgresql://ignored:ignored@/drts?host=/cloudsql/private-db&user=drill-user&password=TOP-SECRET%2Bpass",
    "postgresql://user:TOP-SECRET%xy@/drts?host=/cloudsql/private-db",
    "postgresql://user:TOP-SECRET pass@/drts%2Fdb?host=/cloudsql/private-db",
    "postgresql://user:TOP-SECRET@private-db/drts?password=first&password=last",
  ];
  for (const url of urls) {
    const { user, password, database } = new Client({
      connectionString: url,
    }).connectionParameters;
    expect(credentials(url)).toEqual({ user, password, database });
  }
});

it("runs the real orchestration against offline CLI boundaries, including cleanup and missing evidence", () => {
  const output = execFileSync(
    "python3",
    [
      path.resolve(
        "tests/unit/system-remediation/sr-live-ops-001/test_drill.py",
      ),
      "-v",
    ],
    { encoding: "utf8", timeout: 90_000, stdio: ["ignore", "pipe", "pipe"] },
  );
  expect(output).not.toContain("TOP-SECRET-PASSWORD");
}, 95_000);
