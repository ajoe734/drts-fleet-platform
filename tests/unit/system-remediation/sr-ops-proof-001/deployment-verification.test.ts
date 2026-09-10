import { describe, expect, it } from "vitest";
import {
  ACTIVE_DEV_SERVICES_CATALOG,
  verifyDeploymentCatalog,
} from "../../../../tools/system-remediation/ops-proof/deployment-verification.js";

describe("SR-OPS-PROOF-001: Deployment Verification & Service Catalog", () => {
  it("contains all 9 active Cloud Run services and 1 migration job without drift (R29 compliance)", () => {
    expect(ACTIVE_DEV_SERVICES_CATALOG).toHaveLength(10);

    const serviceNames = ACTIVE_DEV_SERVICES_CATALOG.map((s) => s.name);
    expect(serviceNames).toContain("drts-dev-api");
    expect(serviceNames).toContain("drts-dev-platform-admin-web");
    expect(serviceNames).toContain("drts-dev-ops-console-web");
    expect(serviceNames).toContain("drts-dev-fleet-partner-portal-web");
    expect(serviceNames).toContain("drts-dev-tenant-console-web");
    expect(serviceNames).toContain("drts-dev-bank-console-web");
    expect(serviceNames).toContain("drts-dev-referral-embed-web");
    expect(serviceNames).toContain("drts-dev-enterprise-dispatch-web");
    expect(serviceNames).toContain("drts-channel-partner-portal-web");
    expect(serviceNames).toContain("drts-migrate");
  });

  it("successfully passes when all services match candidate SHA and health probes pass", async () => {
    const candidateSha = "2093cf7e38526a7a7c027600be92004f7275efd3";

    const report = await verifyDeploymentCatalog({ candidateSha });

    expect(report.overallVerdict).toBe("PASSED");
    expect(report.candidateSha).toBe(candidateSha);
    expect(report.versionParityPassed).toBe(true);
    expect(report.allHealthPassed).toBe(true);
    expect(report.allRoleJourneysPassed).toBe(true);
    expect(report.rollbackFeasibility.gatePassed).toBe(true);
    expect(report.rollbackFeasibility.supportsPreviousRevision).toBe(true);
    expect(report.services).toHaveLength(10);
  });

  it("detects version drift when one service is serving an older or unexpected SHA", async () => {
    const candidateSha = "2093cf7e38526a7a7c027600be92004f7275efd3";

    // Custom probe simulating that ops-console is running an older SHA
    const driftProbe = async (name: string) => {
      if (name === "drts-dev-ops-console-web") {
        return {
          status: "HEALTHY" as const,
          reportedSha: "old-sha-1234567890abcdef",
          roleJourneyPassed: true,
        };
      }
      return {
        status: "HEALTHY" as const,
        reportedSha: candidateSha,
        roleJourneyPassed: true,
      };
    };

    const report = await verifyDeploymentCatalog({
      candidateSha,
      probe: driftProbe,
    });

    expect(report.overallVerdict).toBe("FAILED");
    expect(report.versionParityPassed).toBe(false);

    const opsSvc = report.services.find(
      (s) => s.name === "drts-dev-ops-console-web",
    );
    expect(opsSvc?.versionParityPassed).toBe(false);
    expect(opsSvc?.deployedCandidateSha).toBe("old-sha-1234567890abcdef");
  });

  it("detects unhealthy service or failed role journey", async () => {
    const candidateSha = "2093cf7e38526a7a7c027600be92004f7275efd3";

    const failedProbe = async (name: string) => {
      if (name === "drts-dev-api") {
        return {
          status: "DEGRADED" as const,
          reportedSha: candidateSha,
          roleJourneyPassed: false,
        };
      }
      return {
        status: "HEALTHY" as const,
        reportedSha: candidateSha,
        roleJourneyPassed: true,
      };
    };

    const report = await verifyDeploymentCatalog({
      candidateSha,
      probe: failedProbe,
    });

    expect(report.overallVerdict).toBe("FAILED");
    expect(report.allHealthPassed).toBe(false);
    expect(report.allRoleJourneysPassed).toBe(false);
  });
});
