import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import {
  getEvidenceRetentionPolicy,
  type EvidenceAccessIdentity,
} from "../../../../apps/api/src/common/evidence-governance";

describe("C100: 稽核不可變性、資料庫保護觸發器、封存與刪除邊界演練驗收", () => {
  const rootDir = path.resolve(__dirname, "../../../..");

  it("V0080 Migration 結構合規：具備行級保護、截斷阻止、專屬角色授權與特權豁免條件", () => {
    const migrationPath = path.join(
      rootDir,
      "infra/migrations/V0080__audit_log_immutability.sql",
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sql = fs.readFileSync(migrationPath, "utf-8");

    // 1. 建立專屬 NOLOGIN 角色 audit_retention_operator
    expect(sql).toContain("CREATE ROLE audit_retention_operator NOLOGIN");

    // 2. 定義核心防御函數 admin.raise_audit_logs_append_only()
    expect(sql).toContain("CREATE OR REPLACE FUNCTION admin.raise_audit_logs_append_only()");
    expect(sql).toContain("RAISE EXCEPTION 'admin.audit_logs is append-only'");

    // 3. 特權豁免條件：必須同時滿足 DELETE 操作、session setting 設定為 on、且具備 audit_retention_operator 角色
    expect(sql).toContain("IF TG_OP = 'DELETE'");
    expect(sql).toContain("current_setting('audit.allow_retention_archival', true) = 'on'");
    expect(sql).toContain("pg_has_role(current_user, 'audit_retention_operator'");

    // 4. 建立行級觸發器：阻擋 UPDATE 與未授權 DELETE
    expect(sql).toContain("CREATE TRIGGER trg_audit_logs_append_only");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON admin.audit_logs");
    expect(sql).toContain("FOR EACH ROW");

    // 5. 建立語句級觸發器：全面禁止 TRUNCATE（即使設定 archival 旗標亦不豁免）
    expect(sql).toContain("CREATE TRIGGER trg_audit_logs_prevent_truncate");
    expect(sql).toContain("BEFORE TRUNCATE ON admin.audit_logs");
    expect(sql).toContain("FOR EACH STATEMENT");

    // 6. 縱深防禦：回收 PUBLIC 之變更權限
    expect(sql).toContain("REVOKE UPDATE, DELETE, TRUNCATE ON admin.audit_logs FROM PUBLIC");
  });

  it("封存運維工具合規：檢查 audit-log-retention-archival.sh 與 730 天法定保存門檻", () => {
    const scriptPath = path.join(
      rootDir,
      "operations/database/audit-log-retention-archival.sh",
    );
    expect(fs.existsSync(scriptPath)).toBe(true);

    const script = fs.readFileSync(scriptPath, "utf-8");

    // 1. 預設 730 天（汽車運輸業管理規則 s91(4) 2年基準，非商業會計法之憑證）
    expect(script).toContain("RETENTION_DAYS=\"730\"");
    expect(script).toContain("汽車運輸業管理規則 s91(4)");

    // 2. 支援 --dry-run 與 --apply 雙模式
    expect(script).toContain("--dry-run");
    expect(script).toContain("--apply");

    // 3. 執行 purge 前先匯出至 jsonl 備份
    expect(script).toContain("audit_logs_archived_");
    expect(script).toContain(".jsonl");

    // 4. 使用事務級局部變數 SET LOCAL audit.allow_retention_archival = 'on'
    expect(script).toContain("SET LOCAL audit.allow_retention_archival = 'on'");
    expect(script).toContain("DELETE FROM admin.audit_logs");
  });

  it("稽核家族政策邊界：730 天生命週期 (180 天熱存 + 550 天冷封存) 與不可直接硬刪除", () => {
    const policy = getEvidenceRetentionPolicy("audit_log");

    expect(policy.family).toBe("audit_log");
    expect(policy.hotRetentionDays).toBe(180);
    expect(policy.archiveAfterDays).toBe(180);
    expect(policy.archiveRetentionDays).toBe(550);
    expect(policy.hotRetentionDays + (policy.archiveRetentionDays ?? 0)).toBe(730);
    expect(policy.archiveTier).toBe("cold_archive");

    // 法律保留規範
    expect(policy.legalHold.supported).toBe(true);
    expect(policy.legalHold.deletionSuppressed).toBe(true);
    expect(policy.deletionException).toContain(
      "Audit evidence is never hard-deleted while linked incident, complaint, or regulator references remain unresolved.",
    );
  });

  it("應用程式層 Append-Only 保證：AuditNotificationService 僅支援新增與唯讀檢索，無刪修介面", async () => {
    const service = new AuditNotificationService();

    // 1. 寫入一筆審計日誌
    const created = await service.recordAuditLog({
      actionName: "system_security_check",
      actorId: "actor-ops-01",
      actorType: "ops_user",
      tenantId: null,
      moduleName: "compliance",
      resourceType: "audit_immutability",
      resourceId: "rule-v0080",
      newValuesSummary: { enforced: true },
    });

    expect(created.auditId).toBeDefined();
    expect(created.actionName).toBe("system_security_check");

    // 2. 查詢日誌（以具備 audit:read scope 之 identity 存取）
    const identity: EvidenceAccessIdentity = {
      actorId: "actor-ops-01",
      actorType: "ops_user",
      realm: "ops",
      scopes: ["audit:read"],
      tenantId: null,
    };
    const logs = await service.listAuditLogs(identity, "req-check-001");
    expect(logs.some((l) => l.auditId === created.auditId)).toBe(true);

    // 3. 介面契約驗證：確認無任何 delete / update / truncate 方法外洩
    expect((service as any).deleteAuditLog).toBeUndefined();
    expect((service as any).updateAuditLog).toBeUndefined();
    expect((service as any).purgeAuditLogs).toBeUndefined();
  });
});
