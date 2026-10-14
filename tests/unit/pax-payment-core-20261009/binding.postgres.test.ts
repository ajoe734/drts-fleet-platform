import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { PaymentMethodRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.repository";
import { PaymentMethodService } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.service";
import { PaymentTokenCipher } from "../../../apps/api/src/modules/passenger-app/payment/payment-token-cipher";
import { FakePaymentProvider } from "../../../apps/api/src/modules/passenger-app/payment/fake-payment-provider";

const require = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");
const runFile = promisify(execFile);
function credentialValue() {
  // The existing fake provider intentionally accepts alphabetic suffixes only.
  return `synthetic_credential_${randomUUID().replace(/[0-9]/g, (digit) => String.fromCharCode(97 + Number(digit)))}`;
}
// Do not connect even to an inherited URL on the worker VM. Existing hosted CI
// supplies DATABASE_URL; missing hosted configuration must fail, never skip.
describe.skipIf(process.env.GITHUB_ACTIONS !== "true")(
  "PaymentCore binding production PostgreSQL regression",
  () => {
    const name = `pax_bind_${randomUUID().replaceAll("-", "")}`;
    let admin: InstanceType<typeof Pool> | undefined;
    let pool: InstanceType<typeof Pool> | undefined;
    let created = false;
    let database: DatabaseService | undefined;
    let repository: PaymentMethodRepository;
    let service: PaymentMethodService;
    let provider: FakePaymentProvider;
    let cipher: PaymentTokenCipher;
    let owner: string;
    let other: string;

    beforeAll(async () => {
      const sourceUrl = process.env.DATABASE_URL;
      if (!sourceUrl)
        throw new Error("Hosted binding regression requires DATABASE_URL.");
      // Require native psql before db-apply so its Docker fallback is never used.
      await runFile("psql", ["--version"]);
      admin = new Pool({
        connectionString: sourceUrl,
        connectionTimeoutMillis: 10000,
      });
      await admin.query(`CREATE DATABASE "${name}"`);
      created = true;
      const url = new URL(sourceUrl);
      url.pathname = `/${name}`;
      const { stdout } = await runFile(
        "bash",
        ["operations/database/db-apply.sh"],
        {
          env: { ...process.env, DATABASE_URL: url.toString() },
          timeout: 180000,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      pool = new Pool({
        connectionString: url.toString(),
        connectionTimeoutMillis: 10000,
      });
      // Verify complete formal runner provenance, including V0018A and the
      // runner's identical-checksum canonicalization of V0036/V0047.
      const files = (await readdir("infra/migrations"))
        .filter((file) => /^V[0-9A-Z]+__.+\.sql$/.test(file))
        .sort();
      const checksums = new Map<string, string>();
      for (const file of files)
        checksums.set(
          file,
          createHash("sha256")
            .update(await readFile(`infra/migrations/${file}`))
            .digest("hex"),
        );
      const applied = await pool.query(
        "SELECT version,file_name,checksum FROM admin.schema_migrations",
      );
      const distinct = new Set(checksums.values());
      expect(applied.rows).toHaveLength(distinct.size);
      for (const row of applied.rows) {
        expect(row.version).toBe(row.file_name.split("__")[0]);
        expect(checksums.get(row.file_name)).toBe(row.checksum);
      }
      expect(new Set(applied.rows.map((row) => row.checksum))).toEqual(
        distinct,
      );
      const { stdout: checkout } = await runFile("git", ["rev-parse", "HEAD"]);
      process.stdout.write(
        `PaymentCore binding migrations: checkout=${checkout.trim()} run=${process.env.GITHUB_RUN_ID} files=${files.length} checksums=${distinct.size} exit=0 stdoutSHA256=${createHash("sha256").update(stdout).digest("hex")}\n`,
      );
      const previous = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = url.toString();
        database = new DatabaseService();
      } finally {
        process.env.DATABASE_URL = previous;
      }
      repository = new PaymentMethodRepository(database);
    }, 240000);

    afterAll(async () => {
      try {
        await database?.onModuleDestroy();
        await pool?.end();
        if (created) await admin!.query(`DROP DATABASE "${name}"`);
      } finally {
        await admin?.end();
      }
    }, 30000);

    beforeEach(async () => {
      owner = `synthetic_${randomUUID()}`;
      other = `synthetic_${randomUUID()}`;
      await pool!.query(
        "INSERT INTO passenger.accounts(drts_passenger_id) VALUES ($1),($2)",
        [owner, other],
      );
      cipher = new PaymentTokenCipher(
        JSON.stringify({
          activeKeyId: "test",
          keys: { test: randomBytes(32).toString("base64") },
        }),
      );
      provider = new FakePaymentProvider({ DRTS_ENV: "test" });
      service = new PaymentMethodService(repository, { provider, cipher });
    });

    async function bind(credential = credentialValue(), passengerId = owner) {
      const result = await service.bind(passengerId, {
        providerToken: credential,
      });
      expect(result.status).toBe("completed");
      if (result.status !== "completed")
        throw new Error("Binding did not complete.");
      return { credential, method: result.method };
    }

    it("binds first/default and second/nondefault cards with encrypted metadata on formal schema", async () => {
      const first = await bind();
      const second = await bind();
      expect(first.method.isDefault).toBe(true);
      expect(second.method.isDefault).toBe(false);
      expect(second.method.paymentMethodId).not.toBe(
        first.method.paymentMethodId,
      );
      const rows = await pool!.query(
        "SELECT payment_method_id,token_envelope,status FROM passenger.psp_tokens WHERE drts_passenger_id=$1",
        [owner],
      );
      expect(rows.rows).toHaveLength(2);
      for (const row of rows.rows) {
        expect(row.status).toBe("active");
        expect(
          cipher.decrypt(row.token_envelope, owner, row.payment_method_id),
        ).toMatch(/^synthetic_token_/);
        expect(JSON.stringify(row)).not.toContain("synthetic_token_");
      }
      expect(await repository.list(owner)).toEqual([
        first.method,
        second.method,
      ]);
      expect(
        (
          await pool!.query(
            "SELECT outcome FROM passenger.payment_idempotency_keys WHERE drts_passenger_id=$1",
            [owner],
          )
        ).rows,
      ).toEqual([{ outcome: "completed" }, { outcome: "completed" }]);
    });

    it("preserves same-key service and repository completion replay after default changes", async () => {
      const exchange = vi.spyOn(provider, "bind");
      const first = await bind();
      const second = await bind();
      await repository.setDefault(owner, second.method.paymentMethodId);
      const replay = await bind(first.credential);
      expect(replay.method).toEqual({ ...first.method, isDefault: false });
      expect(exchange).toHaveBeenCalledTimes(2);
      const claim = await repository.claimBinding(
        owner,
        provider.name,
        first.credential,
      );
      expect(
        await repository.completeBinding(owner, claim.idempotencyKey, {
          ...first.method,
          drtsPassengerId: owner,
          provider: provider.name,
          tokenEnvelope: cipher.encrypt(
            "synthetic_replay_must_not_replace",
            owner,
            first.method.paymentMethodId,
          ),
        }),
      ).toEqual(replay.method);
      expect(await repository.list(owner)).toEqual([
        second.method,
        replay.method,
      ]);
      const stored = await pool!.query(
        "SELECT token_envelope FROM passenger.psp_tokens WHERE payment_method_id=$1",
        [first.method.paymentMethodId],
      );
      expect(
        cipher.decrypt(
          stored.rows[0].token_envelope,
          owner,
          first.method.paymentMethodId,
        ),
      ).not.toBe("synthetic_replay_must_not_replace");
    });

    it("rejects another account's credential and completion claim without mutation", async () => {
      const first = await bind();
      await expect(bind(first.credential, other)).rejects.toMatchObject({
        code: "invalid_credential",
      });
      const claim = await repository.claimBinding(
        owner,
        provider.name,
        first.credential,
      );
      await expect(
        repository.completeBinding(other, claim.idempotencyKey, {
          ...first.method,
          drtsPassengerId: other,
          provider: provider.name,
          tokenEnvelope: cipher.encrypt(
            "synthetic_foreign",
            other,
            first.method.paymentMethodId,
          ),
        }),
      ).rejects.toMatchObject({ code: "not_found" });
      expect(await repository.list(other)).toEqual([]);
      expect(await repository.list(owner)).toEqual([first.method]);
    });

    it("rejects an inactive account before PSP exchange or claim creation", async () => {
      await pool!.query(
        "UPDATE passenger.accounts SET status='suspended' WHERE drts_passenger_id=$1",
        [owner],
      );
      const exchange = vi.spyOn(provider, "bind");
      await expect(bind()).rejects.toMatchObject({ code: "unauthorized" });
      expect(exchange).not.toHaveBeenCalled();
      expect(
        (
          await pool!.query(
            "SELECT * FROM passenger.payment_idempotency_keys WHERE drts_passenger_id=$1",
            [owner],
          )
        ).rows,
      ).toEqual([]);
    });

    it("rolls back a real V0115 card CHECK failure, retaining the pending claim for valid retry", async () => {
      const claim = await repository.claimBinding(
        owner,
        provider.name,
        credentialValue(),
      );
      const value = {
        paymentMethodId: claim.methodId,
        drtsPassengerId: owner,
        provider: provider.name,
        last4: "bad!",
        cardType: "synthetic",
        expiryMonth: "12",
        expiryYear: "2099",
        isDefault: true,
        tokenEnvelope: cipher.encrypt(
          "synthetic_private_token",
          owner,
          claim.methodId,
        ),
      };
      await expect(
        repository.completeBinding(owner, claim.idempotencyKey, value),
      ).rejects.toMatchObject({ code: "payment_persistence_unavailable" });
      expect(await repository.list(owner)).toEqual([]);
      expect(
        (
          await pool!.query(
            "SELECT outcome FROM passenger.payment_idempotency_keys WHERE idempotency_key=$1",
            [claim.idempotencyKey],
          )
        ).rows,
      ).toEqual([{ outcome: "pending" }]);
      expect(
        await repository.completeBinding(owner, claim.idempotencyKey, {
          ...value,
          last4: "0042",
        }),
      ).toMatchObject({
        paymentMethodId: claim.methodId,
        last4: "0042",
        isDefault: true,
      });
    });

    it("preserves the full 100-character passenger id through insert and default comparison", async () => {
      owner = `synthetic_${randomUUID()}`.padEnd(100, "x");
      await pool!.query(
        "INSERT INTO passenger.accounts(drts_passenger_id) VALUES ($1)",
        [owner],
      );
      const first = await bind();
      const second = await bind();
      expect(first.method.isDefault).toBe(true);
      expect(second.method.isDefault).toBe(false);
      expect(
        (
          await pool!.query(
            "SELECT drts_passenger_id FROM passenger.psp_tokens WHERE payment_method_id=$1",
            [first.method.paymentMethodId],
          )
        ).rows,
      ).toEqual([{ drts_passenger_id: owner }]);
    });
  },
);
