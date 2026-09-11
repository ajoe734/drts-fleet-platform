import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createWireApp, DRIVER_ID, wireRequest } from "./wire-app";
import {
  HOST_A_PARTNER_ID,
  VEHICLE_A1,
  VEHICLE_B1,
} from "../../../e2e/system-remediation/sr-host-fe-001/host-acceptance-seed";

const enabled = Boolean(process.env.DRTS_WIRE_TEST_DATABASE_URL);
describe.runIf(enabled)(
  "SR-WIRE-001 full AppModule + real PostgreSQL and signed durable sessions",
  () => {
    let wire: Awaited<ReturnType<typeof createWireApp>>;
    let leaveId: string;
    const facts: Record<string, unknown> = {
      candidateSha: process.env.CANDIDATE_SHA,
      runId: process.env.GITHUB_RUN_ID,
    };
    beforeAll(async () => {
      wire = await createWireApp();
    }, 240000);
    afterAll(async () => {
      if (wire) await wire.app.close();
      const directory = path.resolve(".artifacts/wire-acceptance");
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        path.join(directory, "api-evidence.json"),
        JSON.stringify(facts, null, 2),
      );
    });

    it("injects the same real leave/academy providers into all production consumers", () => {
      const get = (key: keyof typeof wire.tokens) =>
        wire.app.get<Record<string, unknown>>(wire.tokens[key]);
      expect(get("shifts").driverLeaveService).toBe(get("leave"));
      expect(get("presence").driverLeaveService).toBe(get("leave"));
      expect(get("evaluator").driverLeaveService).toBe(get("leave"));
      expect(get("evaluator").academyService).toBe(get("academy"));
      expect(get("readiness").academyService).toBe(get("academy"));
      expect(wire.db.isEnabled()).toBe(true);
      facts.realProviders = true;
    });

    it("serves registered Host APIs with same-host reads, cross-host isolation and write denial", async () => {
      const unauth = await wireRequest(wire.baseUrl, "/host/vehicles");
      expect(unauth.status).toBe(401);
      const own = await wireRequest(wire.baseUrl, "/host/vehicles", wire.hostA);
      expect(own.status).toBe(200);
      expect(JSON.stringify(own.json)).toContain(VEHICLE_A1);
      expect(JSON.stringify(own.json)).not.toContain(VEHICLE_B1);
      const other = await wireRequest(
        wire.baseUrl,
        `/host/vehicles/${VEHICLE_A1}/maintenance`,
        wire.hostB,
      );
      expect(other.status).toBe(404);
      const write = await wireRequest(
        wire.baseUrl,
        "/host/vehicles",
        wire.hostA,
        { vehicleId: VEHICLE_A1 },
      );
      expect(write.status).toBe(403);
      facts.host = {
        partnerId: HOST_A_PARTNER_ID,
        ownedVehicleId: VEHICLE_A1,
        crossHostStatus: other.status,
        writeStatus: write.status,
      };
    });

    it("derives training eligibility from real quiz HTTP writes, restores after pass and re-blocks expired DB attempts", async () => {
      const list = await wireRequest(
        wire.baseUrl,
        "/driver-academy/courses",
        wire.driverToken,
      );
      expect(list.status).toBe(200);
      expect(list.json.data.items.length).toBeGreaterThan(0);
      expect(
        (await wire.evaluator.assessDriverRequirements(DRIVER_ID))
          .trainingIncomplete,
      ).toBe(true);
      const courses = await wire.db.query<{
        course_id: string;
        course_version: number;
      }>(
        "SELECT course_id, course_version FROM reg.phase1_driver_academy_courses WHERE is_required=true",
      );
      for (const course of courses.rows) {
        const answers = await wire.db.query<{
          question_id: string;
          correct_option_id: string;
        }>(
          "SELECT question_id, correct_option_id FROM reg.phase1_driver_quiz_questions WHERE course_id=$1 AND course_version=$2",
          [course.course_id, course.course_version],
        );
        const submitted = await wireRequest(
          wire.baseUrl,
          `/driver-academy/courses/${course.course_id}/quiz/submit`,
          wire.driverToken,
          {
            courseVersion: course.course_version,
            answers: answers.rows.map((q) => ({
              questionId: q.question_id,
              selectedOptionId: q.correct_option_id,
            })),
          },
        );
        expect(submitted.status).toBe(201);
        expect(submitted.json.data.passed).toBe(true);
      }
      expect(
        (await wire.evaluator.assessDriverRequirements(DRIVER_ID))
          .trainingSatisfied,
      ).toBe(true);
      const evidence = await wire.db.query(
        "SELECT driver_id, training_status FROM reg.driver_reg_profiles WHERE driver_id=$1",
        [DRIVER_ID],
      );
      expect(evidence.rows[0]?.training_status).toBe("passed");
      await wire.db.query(
        "UPDATE reg.phase1_driver_quiz_attempts SET attempted_at=now()-interval '800 days' WHERE driver_id=$1",
        [DRIVER_ID],
      );
      expect(
        (await wire.evaluator.assessDriverRequirements(DRIVER_ID))
          .trainingIncomplete,
      ).toBe(true);
      facts.training = {
        driverId: DRIVER_ID,
        courseIds: courses.rows.map((c) => c.course_id),
        projection: evidence.rows,
        expiredAttemptBlocked: true,
      };
    });

    it("creates and approves leave through real scoped APIs and blocks online/clock-in without a side effect", async () => {
      const online = await wireRequest(
        wire.baseUrl,
        "/platform-presence/online",
        wire.driverToken,
        { platformCode: "uber" },
      );
      expect(online.status).toBe(201);
      const start = new Date(Date.now() - 5000).toISOString();
      const end = new Date(Date.now() + 3600000).toISOString();
      const created = await wireRequest(
        wire.baseUrl,
        "/driver-leave/requests",
        wire.driverToken,
        {
          leaveType: "personal",
          startTime: start,
          endTime: end,
          reason: "WIRE real API acceptance",
        },
      );
      expect(created.status).toBe(201);
      leaveId = created.json.data.leaveId;
      expect(leaveId).toMatch(/^lv_/);
      const deny = await wireRequest(
        wire.baseUrl,
        `/driver-leave/requests/${leaveId}/review`,
        wire.driverToken,
        { decision: "approve" },
      );
      expect(deny.status).toBe(403);
      const approved = await wireRequest(
        wire.baseUrl,
        `/driver-leave/requests/${leaveId}/review`,
        wire.reviewerToken,
        { decision: "approve" },
      );
      expect(approved.status).toBe(201);
      const clockIn = await wireRequest(
        wire.baseUrl,
        "/shift-attendance/clock-in",
        wire.driverToken,
        { driverId: DRIVER_ID },
      );
      expect(clockIn.status).toBe(409);
      expect(clockIn.json.error.code).toBe("DRIVER_ON_LEAVE");
      const blocked = await wireRequest(
        wire.baseUrl,
        "/platform-presence/online",
        wire.driverToken,
        { platformCode: "uber" },
      );
      expect(blocked.status).toBe(409);
      expect(blocked.json.error.code).toBe("DRIVER_ON_LEAVE");
      const rows = await wire.db.query(
        "SELECT leave_id, driver_id, status FROM ops.phase1_driver_leave_requests WHERE leave_id=$1",
        [leaveId],
      );
      expect(rows.rows[0]?.status).toBe("approved");
      const shifts = await wireRequest(
        wire.baseUrl,
        "/shift-attendance/shifts",
        wire.driverToken,
      );
      expect(shifts.json.data.items).toEqual([]);
      expect(
        (await wire.evaluator.assessDriverRequirements(DRIVER_ID)).onLeave,
      ).toBe(true);
      facts.leave = {
        leaveId,
        rows: rows.rows,
        clockInStatus: clockIn.status,
        onlineStatus: blocked.status,
        crossRoleReviewStatus: deny.status,
      };
    });

    it("reloads leave expiry from SQL and restores online/clock-in without altering exclusion authority", async () => {
      const ended = new Date(Date.now() - 1000).toISOString();
      await wire.db.query(
        "UPDATE ops.phase1_driver_leave_requests SET end_time=$2, record=jsonb_set(record,'{endTime}',to_jsonb($2::text)) WHERE leave_id=$1",
        [leaveId, ended],
      );
      expect(
        (await wire.evaluator.assessDriverRequirements(DRIVER_ID)).onLeave,
      ).toBe(false);
      const online = await wireRequest(
        wire.baseUrl,
        "/platform-presence/online",
        wire.driverToken,
        { platformCode: "uber" },
      );
      expect(online.status).toBe(201);
      const clockIn = await wireRequest(
        wire.baseUrl,
        "/shift-attendance/clock-in",
        wire.driverToken,
        { driverId: DRIVER_ID },
      );
      expect(clockIn.status).toBe(201);
      expect(clockIn.json.data.status).toBe("active");
      facts.leaveRecovery = {
        leaveId,
        ended,
        shiftId: clockIn.json.data.shiftId,
        status: clockIn.status,
      };
    });
  },
);
