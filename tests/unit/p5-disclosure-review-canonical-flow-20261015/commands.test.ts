import { describe, it, expect, vi, afterEach } from "vitest";
import { fixture, actor, vid, did, command, deferred } from "./fixture";
afterEach(() => vi.useRealTimers());
describe("actual Controller / Repository P5 canonical review", () => {
  it("approves actual vehicle, canonical actor/submission/version and durable history in one transaction, then fresh-reader readback", async () => {
    const h = await fixture();
    const r = await h.controller.reviewDisclosure(
      "vehicle",
      vid,
      command(),
      "approve-v",
      actor,
    );
    expect(r.data.subject.record.status).toBe("complete");
    expect(r.data.decision.actorId).toBe(actor.actorId);
    expect(r.data.subject.sourceSubmissionId).toBe(
      command().sourceSubmissionId,
    );
    expect(r.data.subject.version).toBe(5);
    expect(r.data.decision.previousRecord.status).toBe("incomplete");
    expect(r.data.decision.previousRecord.version).toBe(4);
    expect(h.state().history).toHaveLength(1);
    const fresh = await h.fresh().getDisclosureReview("vehicle", vid, actor);
    expect(fresh.record.status).toBe("complete");
    expect(fresh.history[0]?.decisionId).toBe(r.data.decision.decisionId);
    expect(h.calls.some((c) => c.sql.includes("FOR UPDATE"))).toBe(true);
  });
  it("does not publish a pending write and rejects/rolls back both record and audit; exact retry succeeds", async () => {
    const h = await fixture();
    const gate = deferred();
    h.control.gate = gate;
    const pending = h.controller.reviewDisclosure(
      "vehicle",
      vid,
      command(),
      "pending-v",
      actor,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      (await h.controller.getDisclosureReview("vehicle", vid, actor)).data
        .record.status,
    ).toBe("incomplete");
    expect(h.state().history).toHaveLength(0);
    gate.reject(new Error("Rejected pending storage"));
    await expect(pending).rejects.toThrow("Rejected pending storage");
    expect(
      (await h.controller.listDisclosureReviews(actor)).data.items.find(
        (x) => x.subjectId === vid,
      )?.version,
    ).toBe(4);
    h.control.gate = null;
    await h.controller.reviewDisclosure(
      "vehicle",
      vid,
      command(),
      "pending-v",
      actor,
    );
    expect(h.state().history).toHaveLength(1);
  });
  it("rolls back approval when the original audit insert rejects", async () => {
    const h = await fixture();
    h.control.failAudit = true;
    await expect(
      h.controller.reviewDisclosure(
        "vehicle",
        vid,
        command(),
        "audit-fail",
        actor,
      ),
    ).rejects.toThrow("Audit refused");
    expect(h.state().profiles[0]?.status).toBe("incomplete");
    expect(h.state().history).toHaveLength(0);
    h.control.failAudit = false;
    await h.controller.reviewDisclosure(
      "vehicle",
      vid,
      command(),
      "audit-fail",
      actor,
    );
    expect(h.state().profiles[0]?.status).toBe("complete");
  });
  it("recovers a committed lost ACK by replaying the same command on a fresh service; altered payload conflicts", async () => {
    const h = await fixture();
    h.control.loseCommitAck = true;
    await expect(
      h.controller.reviewDisclosure("vehicle", vid, command(), "lost", actor),
    ).rejects.toThrow("COMMIT response lost");
    const fresh = h.fresh();
    const r = await fresh.reviewDisclosure(
      "vehicle",
      vid,
      command(),
      "lost",
      actor,
    );
    expect(r.subject.version).toBe(5);
    expect(h.state().history).toHaveLength(1);
    await expect(
      fresh.reviewDisclosure(
        "vehicle",
        vid,
        { ...command(), reason: "changed" },
        "lost",
        actor,
      ),
    ).rejects.toThrow();
    expect(h.state().history).toHaveLength(1);
  });
  it("serializes same-subject noDB decisions, preserving replay and version conflicts", async () => {
    const h = await fixture();
    h.control.enabled = false;
    const results = await Promise.allSettled([
      h.service.reviewDisclosure("vehicle", vid, command(), "one", actor),
      h.service.reviewDisclosure("vehicle", vid, command(), "two", actor),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
    const replay = await h.service.reviewDisclosure(
      "vehicle",
      vid,
      command(),
      "one",
      actor,
    );
    expect(replay.subject.history).toHaveLength(1);
    expect(replay.subject.version).toBe(5);
  });
  it("supports return/correction with reason and later legitimate approval without overwriting history", async () => {
    const h = await fixture();
    const returned = await h.service.reviewDisclosure(
      "vehicle",
      vid,
      command(4, "return"),
      "return",
      actor,
    );
    expect(returned.subject.record.status).toBe("incomplete");
    expect(returned.subject.record.verifiedByActorId).toBeNull();
    const approved = await h.service.reviewDisclosure(
      "vehicle",
      vid,
      command(5),
      "approve",
      actor,
    );
    expect(approved.subject.record.status).toBe("complete");
    expect(approved.subject.history.map((x) => x.action)).toEqual([
      "return",
      "approve",
    ]);
  });
  it("reads and reviews actual driver credentials without exposing raw registration numbers", async () => {
    const h = await fixture();
    const r = await h.service.reviewDisclosure(
      "driver",
      did,
      command(2),
      "driver",
      actor,
    );
    expect(r.subject.record.status).toBe("verified_active");
    expect(JSON.stringify(r)).not.toContain("REAL-REG-9876");
    expect(h.state().credentials[0]?.registration_no).toBe("REAL-REG-9876");
    expect(h.state().credentials[0]?.verified_by_actor_id).toBe(actor.actorId);
  });
  it.each(["make", "model", "model_year", "door_count", "color"])(
    "does not default missing/invalid vehicle %s into approval",
    async (field) => {
      const h = await fixture();
      h.state().profiles[0]![field] =
        field === "door_count" ? 2 : field === "model_year" ? 0 : "";
      if (field === "color")
        h.state().profiles[0]!.missing_field_codes = ["color"];
      await expect(
        h.service.reviewDisclosure("vehicle", vid, command(), "missing", actor),
      ).rejects.toThrow();
      expect(h.state().history).toHaveLength(0);
    },
  );
  it.each(["effective_from", "effective_until", "registration_area"])(
    "refuses missing, future or expired driver %s",
    async (field) => {
      const h = await fixture();
      h.state().credentials[0]![field] =
        field === "effective_from"
          ? "2099-01-01"
          : field === "effective_until"
            ? "2000-01-01"
            : "";
      await expect(
        h.service.reviewDisclosure("driver", did, command(2), "expired", actor),
      ).rejects.toThrow();
      expect(h.state().history).toHaveLength(0);
    },
  );
  it("refuses wrong subject/submission/stale version/missing reason and does not mutate unrelated records", async () => {
    const h = await fixture();
    const original = structuredClone(h.state());
    await expect(
      h.service.reviewDisclosure(
        "vehicle",
        "unknown",
        command(),
        "unknown",
        actor,
      ),
    ).rejects.toThrow();
    await expect(
      h.service.reviewDisclosure(
        "vehicle",
        vid,
        { ...command(), sourceSubmissionId: "wrong" },
        "wrong",
        actor,
      ),
    ).rejects.toThrow();
    await expect(
      h.service.reviewDisclosure("vehicle", vid, command(3), "stale", actor),
    ).rejects.toThrow();
    await expect(
      h.service.reviewDisclosure(
        "vehicle",
        vid,
        { ...command(), reason: "" },
        "empty",
        actor,
      ),
    ).rejects.toThrow();
    expect(h.state()).toEqual(original);
  });
  it.each([
    { ...actor, scopes: ["regulatory:read", "reg.read"] },
    { ...actor, realm: "tenant" as const },
    { ...actor, actorId: "" },
  ])("preserves reviewer authority denial %#", async (identity) => {
    const h = await fixture();
    await expect(
      h.controller.reviewDisclosure(
        "vehicle",
        vid,
        command(),
        "deny",
        identity,
      ),
    ).rejects.toThrow();
    expect(h.state().history).toHaveLength(0);
  });
  it("honest durable absence/unavailability never falls back to warm cache", async () => {
    const h = await fixture();
    h.state().profiles = [];
    expect(
      (await h.service.listDisclosureReviews(actor)).items.filter(
        (x) => x.subjectType === "vehicle",
      ),
    ).toHaveLength(0);
    await expect(
      h.service.getDisclosureReview("vehicle", vid, actor),
    ).rejects.toThrow();
  });
  it("return never clears an existing suspension/revocation; expiry is honest in reader projection", async () => {
    const h = await fixture();
    h.state().credentials[0]!.status = "revoked";
    const returned = await h.service.reviewDisclosure(
      "driver",
      did,
      command(2, "return"),
      "revoked-return",
      actor,
    );
    expect(returned.subject.record.status).toBe("revoked");
    await expect(
      h.service.reviewDisclosure(
        "driver",
        did,
        command(3),
        "revoked-approve",
        actor,
      ),
    ).rejects.toThrow();
    h.state().credentials[0]!.status = "verified_active";
    h.state().credentials[0]!.effective_until = "2000-01-01";
    expect(
      (await h.service.getDisclosureReview("driver", did, actor)).record.status,
    ).toBe("expired");
  });
  it("preserves the original approval receipt after expiry while current readback honestly expires", async () => {
    const h = await fixture();
    const first = await h.service.reviewDisclosure(
      "driver",
      did,
      command(2),
      "time-stable",
      actor,
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2100-01-01T00:00:00Z"));
    const replay = await h
      .fresh()
      .reviewDisclosure("driver", did, command(2), "time-stable", actor);
    expect(replay.decision).toEqual(first.decision);
    expect(replay.decision.record.status).toBe("verified_active");
    expect(replay.subject.record.status).toBe("expired");
    expect(replay.subject.history[0]?.record.status).toBe("verified_active");
    expect(h.state().history).toHaveLength(1);
  });
  it("attributes a legitimate existing ops reviewer to the original actor/type without changing role policy", async () => {
    const h = await fixture();
    const ops = {
      ...actor,
      realm: "ops" as const,
      actorType: "ops_user" as const,
      actorId: "55555555-5555-4555-8555-555555555555",
    };
    const r = await h.service.reviewDisclosure(
      "vehicle",
      vid,
      command(),
      "ops",
      ops,
    );
    expect(r.decision.actorId).toBe(ops.actorId);
    expect(r.decision.actorType).toBe("ops_user");
    expect(r.subject.record.verifiedByActorId).toBe(ops.actorId);
  });
  it("keeps different legitimate noDB subjects independent", async () => {
    const h = await fixture();
    h.control.enabled = false;
    const results = await Promise.all([
      h.service.reviewDisclosure(
        "vehicle",
        vid,
        command(),
        "vehicle-independent",
        actor,
      ),
      h.service.reviewDisclosure(
        "driver",
        did,
        command(2),
        "driver-independent",
        actor,
      ),
    ]);
    expect(results.map((r) => r.subject.record.status)).toEqual([
      "complete",
      "verified_active",
    ]);
    expect(results.map((r) => r.subject.history.length)).toEqual([1, 1]);
  });
  it("preserves nullable central-minimum colour and the existing profile-specific missing-colour refusal", async () => {
    const central = await fixture();
    central.state().profiles[0]!.color = null;
    const r = await central.service.reviewDisclosure(
      "vehicle",
      vid,
      command(),
      "central-colour",
      actor,
    );
    expect("color" in r.subject.record && r.subject.record.color).toBeNull();
    expect(r.subject.record.status).toBe("complete");
    const configured = await fixture();
    configured.state().profiles[0]!.color = null;
    configured.state().profiles[0]!.missing_field_codes = ["color"];
    await expect(
      configured.service.reviewDisclosure(
        "vehicle",
        vid,
        command(),
        "profile-colour",
        actor,
      ),
    ).rejects.toThrow();
    expect(configured.state().history).toHaveLength(0);
  });
});
