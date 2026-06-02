import { describe, expect, it, vi } from "vitest";

import {
  PlatformAdminAssistantAuditRecorder,
  resolveAssistantRetentionConfig,
  type PlatformAssistantAuditEvent,
} from "../../src/modules/platform-admin-assistant/platform-admin-assistant.audit";
import { findResidualSecrets } from "../../src/modules/platform-admin-assistant/platform-admin-assistant.redaction";

function fixedClock(iso: string): () => Date {
  return () => new Date(iso);
}

function createRecorder(
  options: {
    iso?: string;
    auditRetentionDays?: number;
    transcriptRetentionDays?: number;
  } = {},
) {
  const sink = { persist: vi.fn() };
  let counter = 0;
  const recorder = new PlatformAdminAssistantAuditRecorder({
    sink,
    now: fixedClock(options.iso ?? "2026-06-02T12:00:00.000Z"),
    generateId: () => `aud-${(counter += 1)}`,
    retention: {
      transcriptRetentionDays: options.transcriptRetentionDays ?? 30,
      auditRetentionDays: options.auditRetentionDays ?? 365,
    },
  });
  return { recorder, sink };
}

describe("PlatformAdminAssistantAuditRecorder event shape", () => {
  it("records planned/blocked/confirmed/executed events with the §9.3 fields", () => {
    const { recorder, sink } = createRecorder();

    const base = {
      actorId: "actor-1",
      sessionId: "sess-1",
      route: "/partners/acme",
      resourceType: "partner",
      resourceId: "PIC-001",
      actionId: "partner.issue_credential",
      domainAuditId: "audit-domain-9",
    };

    const planned = recorder.recordPlanCreated(base);
    const blocked = recorder.recordActionBlocked(base);
    const confirmed = recorder.recordActionConfirmed(base);
    const executed = recorder.recordActionExecuted(base);

    expect(planned.event).toBe("assistant_plan_created");
    expect(blocked.event).toBe("assistant_action_blocked");
    expect(confirmed.event).toBe("assistant_action_confirmed");
    expect(executed.event).toBe("assistant_action_executed");

    for (const event of [planned, blocked, confirmed, executed]) {
      expect(event).toMatchObject({
        actorId: "actor-1",
        sessionId: "sess-1",
        route: "/partners/acme",
        resourceType: "partner",
        resourceId: "PIC-001",
        actionId: "partner.issue_credential",
        domainAuditId: "audit-domain-9",
        createdAt: "2026-06-02T12:00:00.000Z",
      });
      expect(typeof event.assistantAuditId).toBe("string");
      expect(typeof event.redactionApplied).toBe("boolean");
    }

    expect(sink.persist).toHaveBeenCalledTimes(4);
  });

  it("links assistant audit to the domain audit id and supports null", () => {
    const { recorder } = createRecorder();
    const withDomain = recorder.recordActionExecuted({
      actorId: "a",
      sessionId: "s",
      route: "/pricing",
      domainAuditId: "audit-1",
    });
    expect(withDomain.domainAuditId).toBe("audit-1");

    const noDomain = recorder.recordActionBlocked({
      actorId: "a",
      sessionId: "s",
      route: "/pricing",
      domainAuditId: null,
    });
    expect(noDomain.domainAuditId).toBeNull();
  });
});

describe("PlatformAdminAssistantAuditRecorder redaction", () => {
  it("redacts secret material out of metadata and flags redactionApplied", () => {
    const { recorder } = createRecorder();
    const event = recorder.recordMessage({
      actorId: "actor-1",
      sessionId: "sess-1",
      route: "/partners/acme",
      metadata: {
        intent: "issue credential",
        apiKey: "sk-proj-AbCdEf0123456789ZyXwVuTs",
        userText: "my webhook secret is whsec_abcdEFGH12345678ZZZZ",
      },
    });

    expect(event.redactionApplied).toBe(true);
    expect(findResidualSecrets(event)).toEqual([]);
    expect(JSON.stringify(event)).not.toContain(
      "sk-proj-AbCdEf0123456789ZyXwVuTs",
    );
    expect(JSON.stringify(event)).not.toContain("whsec_abcdEFGH12345678ZZZZ");
  });

  it("does not flag redaction for clean payloads", () => {
    const { recorder } = createRecorder();
    const event = recorder.recordMessage({
      actorId: "actor-1",
      sessionId: "sess-1",
      route: "/tenants",
      metadata: { intent: "list tenants in staging stage" },
    });
    expect(event.redactionApplied).toBe(false);
  });

  it("honors a caller-provided redactionApplied flag", () => {
    const { recorder } = createRecorder();
    const event = recorder.recordMessage({
      actorId: "a",
      sessionId: "s",
      route: "/",
      redactionApplied: true,
    });
    expect(event.redactionApplied).toBe(true);
  });
});

describe("resolveAssistantRetentionConfig (§9.5 / §8.3)", () => {
  it("defaults to 30 days transcript retention in non-production", () => {
    const config = resolveAssistantRetentionConfig({ NODE_ENV: "development" });
    expect(config.transcriptRetentionDays).toBe(30);
  });

  it("defaults to 7 days transcript retention in production", () => {
    const config = resolveAssistantRetentionConfig({ APP_ENV: "production" });
    expect(config.transcriptRetentionDays).toBe(7);
  });

  it("honors ASSISTANT_TRANSCRIPT_RETENTION_DAYS override", () => {
    const config = resolveAssistantRetentionConfig({
      APP_ENV: "production",
      ASSISTANT_TRANSCRIPT_RETENTION_DAYS: "90",
    });
    expect(config.transcriptRetentionDays).toBe(90);
  });

  it("ignores invalid retention values and falls back", () => {
    const config = resolveAssistantRetentionConfig({
      NODE_ENV: "development",
      ASSISTANT_TRANSCRIPT_RETENTION_DAYS: "-5",
    });
    expect(config.transcriptRetentionDays).toBe(30);
  });
});

describe("PlatformAdminAssistantAuditRecorder retention pruning", () => {
  it("drops audit events older than the audit retention window", () => {
    const sink = { persist: vi.fn() };
    let clock = new Date("2026-01-01T00:00:00.000Z");
    let counter = 0;
    const recorder = new PlatformAdminAssistantAuditRecorder({
      sink,
      now: () => clock,
      generateId: () => `aud-${(counter += 1)}`,
      retention: { transcriptRetentionDays: 7, auditRetentionDays: 10 },
    });

    recorder.recordMessage({ actorId: "a", sessionId: "s", route: "/" });
    expect(recorder.list()).toHaveLength(1);

    // Advance 20 days, beyond the 10-day audit retention window.
    clock = new Date("2026-01-21T00:00:00.000Z");
    const fresh = recorder.recordMessage({
      actorId: "a",
      sessionId: "s",
      route: "/",
    });

    const retained = recorder.list();
    expect(retained).toHaveLength(1);
    expect(retained[0].assistantAuditId).toBe(fresh.assistantAuditId);
  });

  it("exports retained events filtered by actor/session", () => {
    const { recorder } = createRecorder();
    recorder.recordMessage({ actorId: "a", sessionId: "s1", route: "/" });
    recorder.recordMessage({ actorId: "b", sessionId: "s2", route: "/" });

    const forA = recorder.export({ actorId: "a" });
    expect(forA).toHaveLength(1);
    expect(forA[0].actorId).toBe("a");

    const forSession = recorder.export({ sessionId: "s2" });
    expect(forSession).toHaveLength(1);
    expect(forSession[0].sessionId).toBe("s2");
  });
});

describe("PlatformAdminAssistantAuditRecorder resilience", () => {
  it("does not throw when the durable sink rejects", () => {
    const sink = {
      persist: vi.fn().mockRejectedValue(new Error("db down")),
    };
    const recorder = new PlatformAdminAssistantAuditRecorder({ sink });
    expect(() =>
      recorder.recordMessage({ actorId: "a", sessionId: "s", route: "/" }),
    ).not.toThrow();
  });

  it("constructs with no arguments for Nest DI", () => {
    const recorder = new PlatformAdminAssistantAuditRecorder();
    const event: PlatformAssistantAuditEvent = recorder.recordMessage({
      actorId: "a",
      sessionId: "s",
      route: "/",
    });
    expect(event.assistantAuditId).toBeTruthy();
    expect(recorder.getRetentionConfig().transcriptRetentionDays).toBeGreaterThan(0);
  });
});
