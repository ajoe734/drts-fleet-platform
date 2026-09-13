import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// Mock server-only for node environment in tests
vi.mock("server-only", () => ({}));

import {
  computePayloadDigest,
  buildArtifactText,
  parseArtifact,
  verifyArtifact,
} from "../../../../apps/bank-console-web/app/artifacts/artifact-crypto";
import { settlementStatements } from "../../../../apps/bank-console-web/lib/statements";
import {
  loadBankHomeSnapshot,
  deriveStatementDates,
  formatPeriodDate,
  getTaipeiDateString,
} from "../../../../apps/bank-console-web/lib/bank-dev-read-models";
import {
  getContractRecord,
  metricValue,
  metricTarget,
  formatPeriod,
} from "../../../../apps/bank-console-web/lib/contracts-data";
import {
  BANK_ACTORS,
  toHomeRole,
  roleView,
} from "../../../../apps/bank-console-web/lib/home-data";

describe("SR-QA-FINANCE-001 - C082, C083, C084 & C085: 銀行財務、簽章可驗證性、日期與方案管理", () => {
  const TENANT_ID = "tenant-demo-001";

  describe("1. C082: 真 statement CSV 下載與資料一致", () => {
    it("provides authentic statement periods and consistent summary figures", () => {
      expect(settlementStatements.length).toBeGreaterThan(0);

      const marchStatement = settlementStatements.find(
        (stmt) => stmt.period === "2026-03",
      );
      expect(marchStatement).toBeDefined();
      expect(marchStatement?.totalTrips).toBeGreaterThan(0);
      expect(marchStatement?.totalFareAmount).toBeGreaterThan(0);
      expect(marchStatement?.totalIssuerPayableAmount).toBeGreaterThan(0);

      // Verify that statement records provide consistent IDs and format
      settlementStatements.forEach((stmt) => {
        expect(stmt.statementNo).toBeDefined();
        expect(stmt.period).toMatch(/^\d{4}-\d{2}$/);
        expect(stmt.status).toMatch(/^(published|paid|due)$/);
      });
    });
  });

  describe("2. C083: 摘要／簽章真實可驗證 (R14)", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    it("computes authentic SHA-256 digest over raw byte payload", () => {
      const payload = "order_id,gross_amount,date\nord-001,1500,2026-03-15\n";
      const digestInfo = computePayloadDigest(payload);

      expect(digestInfo.algorithm).toBe("sha256");
      expect(digestInfo.formatted).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(digestInfo.hex).toMatch(/^[a-f0-9]{64}$/);
    });

    it("creates digital signature and verifies artifact successfully", () => {
      const payload = "BANK STATEMENT AUDIT TRAIL 2026-03";

      const artifactText = buildArtifactText(payload, {
        authDomain: "drts.settlement.issuer",
        signingConfig: {
          privateKeyPem: privateKey,
          keyId: "bank-qa-key-1",
        },
      });

      const parsed = parseArtifact(artifactText);
      expect(parsed.payloadText).toBe(payload);
      expect(parsed.manifest).not.toBeNull();
      expect(parsed.manifest.signatureStatus).toBe("SIGNED");

      // Independent verification
      const verifyResult = verifyArtifact(artifactText, { publicKeyPem: publicKey });
      expect(verifyResult.ok).toBe(true);
      expect(verifyResult.status).toBe("SIGNED");
      expect(verifyResult.hashMatch).toBe(true);
      expect(verifyResult.signatureVerified).toBe(true);
    });

    it("detects payload tampering and fails verification honestly", () => {
      const payload = "ORIGINAL BANK SETTLEMENT CONTENT";

      const artifactText = buildArtifactText(payload, {
        authDomain: "drts.settlement.issuer",
        signingConfig: {
          privateKeyPem: privateKey,
          keyId: "bank-qa-key-1",
        },
      });

      // Tamper payload byte
      const tamperedText = artifactText.replace("ORIGINAL", "TAMPERED");
      const verifyResult = verifyArtifact(tamperedText, { publicKeyPem: publicKey });

      expect(verifyResult.ok).toBe(false);
      expect(verifyResult.hashMatch).toBe(false);
      expect(verifyResult.status).toBe("TAMPERED");
    });
  });

  describe("3. C084: 正確開立日、到期日與帳期 (R28)", () => {
    it("derives immutable period dates from statement period instead of current runtime date", () => {
      const dates = deriveStatementDates({ period: "2026-02" });

      // Opening and closing dates must strictly match February 2026
      expect(dates.issuedAt).toBe("2026-02-01T00:00:00+08:00");
      expect(dates.dueAt).toBe("2026-02-28T23:59:59+08:00");

      expect(formatPeriod("2026-03")).toBe("2026 年 03 月");
      expect(formatPeriodDate("2026-03")).toBe("2026-03-01T00:00:00+08:00");
      expect(formatPeriodDate("2026-03", true)).toBe("2026-03-31T23:59:59+08:00");

      const taipeiDate = getTaipeiDateString(new Date("2026-02-28T18:00:00Z"));
      expect(taipeiDate).toBe("2026-03-01");
    });
  });

  describe("4. C085: 合約、使用量、方案與人員管理 (R06, BANK)", () => {
    it("loads bank home snapshot and contract read models without SSR crash", async () => {
      const homeSnapshot = await loadBankHomeSnapshot(TENANT_ID, "bank_program_admin");
      expect(homeSnapshot).toBeDefined();
      expect(homeSnapshot.data.period).toBeDefined();
      expect(homeSnapshot.data.todayLabel).toBeDefined();
      expect(homeSnapshot.data.tallies).toBeDefined();

      const contract = getContractRecord("ctr_acme_world_elite_2026");
      expect(contract).toBeDefined();
      expect(contract?.contractId).toBe("ctr_acme_world_elite_2026");
      expect(contract?.periodAttainment.totalTrips).toBeGreaterThan(0);

      const punctualityTarget = metricTarget(contract!, "pickup_punctuality");
      expect(punctualityTarget).toBe(96);
      const punctualityValue = metricValue(contract?.periodAttainment, "pickup_punctuality");
      expect(punctualityValue).toBe(97.4);
    });

    it("enforces role boundaries across bank personas", () => {
      const adminRole = toHomeRole(BANK_ACTORS.admin.persona);
      const adminView = roleView(adminRole);
      expect(adminView.seeOrders).toBe(true);
      expect(adminView.seeQuota).toBe(true);
      expect(adminView.seeSla).toBe(true);
      expect(adminView.seeFinance).toBe(true);

      const opsRole = toHomeRole(BANK_ACTORS.ops.persona);
      const opsView = roleView(opsRole);
      expect(opsView.seeOrders).toBe(true);
      expect(opsView.seeQuota).toBe(true);
      expect(opsView.seeSla).toBe(true);
      expect(opsView.seeFinance).toBe(false); // Ops cannot view finance
    });
  });
});
