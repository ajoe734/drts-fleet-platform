import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const dashboardPath = path.resolve(
  __dirname,
  "../../infra/grafana/dashboards/tenant-governance.json",
);
const alertsPath = path.resolve(
  __dirname,
  "../../infra/alerts/tenant-governance-alerts.yaml",
);

describe("tenant governance observability artifacts", () => {
  it("defines the required Grafana panels and sample-data smoke targets", () => {
    const dashboard = JSON.parse(readFileSync(dashboardPath, "utf8")) as {
      panels: Array<{
        title: string;
        targets?: Array<{
          datasource?: { type?: string; uid?: string };
          hide?: boolean;
        }>;
      }>;
    };

    const requiredTitles = [
      "Pending Approvals",
      "Quota Usage By Tenant",
      "Evaluator p50/p95/p99",
      "Ledger Writes/sec",
      "Race Failures/min",
      "Validation Rejects/min",
    ];
    expect(dashboard.panels.map((panel) => panel.title)).toEqual(
      expect.arrayContaining(requiredTitles),
    );

    for (const title of requiredTitles) {
      const panel = dashboard.panels.find(
        (candidate) => candidate.title === title,
      );
      expect(panel).toBeDefined();
      expect(panel?.targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            datasource: expect.objectContaining({
              type: "grafana-testdata-datasource",
            }),
            hide: true,
          }),
        ]),
      );
    }
  });

  it("declares the required tenant governance alert thresholds", () => {
    const alerts = readFileSync(alertsPath, "utf8");

    expect(alerts).toContain("alert: TenantGovernanceQuotaNearExhaustion");
    expect(alerts).toContain("> 95");
    expect(alerts).toContain(
      "alert: TenantGovernancePendingApprovalAgeWarning",
    );
    expect(alerts).toContain("> 86400");
    expect(alerts).toContain(
      "alert: TenantGovernancePendingApprovalAgeCritical",
    );
    expect(alerts).toContain("> 172800");
    expect(alerts).toContain(
      "alert: TenantGovernanceEvaluatorLatencyP95Warning",
    );
    expect(alerts).toContain("> 200");
    expect(alerts).toContain("alert: TenantGovernanceQuotaRaceFailuresWarning");
    expect(alerts).toContain("> 10");
  });
});
