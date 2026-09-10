import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock server-only before any web module import
vi.mock("server-only", () => ({}));

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: vi.fn(() => ({ value: "zh" })),
  })),
}));

// Mock api-client.server
vi.mock(
  "../../../../apps/fleet-partner-portal-web/lib/api-client.server",
  () => ({
    getServerFleetPartnerClient: vi.fn(async () => ({
      client: {
        getList: vi.fn().mockImplementation(async (path: string) => {
          if (path.includes("/cases") && path.includes("/timeline")) {
            return [
              {
                entryId: "tl-1",
                caseId: "cmp_0908",
                at: "2026-05-20 14:30",
                tone: "accent",
                t: "建立",
                actor: "eva.wang@yamato.tw",
                actorRealm: "tenant",
                body: "乘客反映司機言語不當，已上傳影片證據。",
              },
            ];
          }
          if (path.includes("/cases")) {
            return [
              {
                id: "cmp_0908",
                type: "complaint",
                cat: "driver_conduct",
                desc: "乘客反映司機言語不當，已上傳影片證據。",
                driver: "黃文豪",
                driverId: "d_8851",
                severity: "high",
                responsibility: "fleet",
                status: "reopened",
                slaTone: "danger",
                slaLabel: "SLA breached",
                slaBreachedAt: "2026-05-22 14:31",
                slaBreach: true,
                openedAt: "2026-05-20 14:30",
              },
              {
                id: "cmp_0912",
                type: "complaint",
                cat: "pricing_dispute",
                desc: "乘客反映車資與預估不符，屬平台計價規則爭議。",
                driver: "林志偉",
                driverId: "d_7702",
                severity: "normal",
                responsibility: "platform",
                status: "under_investigation",
                slaTone: "success",
                slaLabel: "on track",
                slaBreachedAt: null,
                slaBreach: false,
                openedAt: "2026-05-18 09:40",
              },
              {
                id: "cmp_closed_001",
                type: "complaint",
                cat: "vehicle_condition",
                desc: "冷氣不冷申訴案。",
                driver: "張大千",
                driverId: "d_6601",
                severity: "normal",
                responsibility: "fleet",
                status: "closed",
                slaTone: "neutral",
                slaLabel: "closed",
                slaBreachedAt: null,
                slaBreach: false,
                openedAt: "2026-05-15 10:00",
              },
            ];
          }
          return [];
        }),
        get: vi.fn().mockImplementation(async (path: string) => {
          if (path.includes("cmp_0912")) {
            return {
              caseDetail: {
                id: "cmp_0912",
                type: "complaint",
                cat: "pricing_dispute",
                desc: "乘客反映車資與預估不符，屬平台計價規則爭議。",
                driver: "林志偉",
                driverId: "d_7702",
                severity: "normal",
                responsibility: "platform",
                status: "under_investigation",
                slaTone: "success",
                slaLabel: "on track",
                slaBreachedAt: null,
                slaDueAt: "2026-05-20 09:40",
                reopenCount: 0,
                relatedOrder: "ord_7960",
                relatedCall: null,
                assignee: "王芳 (ops_billing)",
                fleetPartnerId: "METRO_FLEET",
              },
              attachments: [],
            };
          }
          if (path.includes("cmp_closed_001")) {
            return {
              caseDetail: {
                id: "cmp_closed_001",
                type: "complaint",
                cat: "vehicle_condition",
                desc: "冷氣不冷申訴案。",
                driver: "張大千",
                driverId: "d_6601",
                severity: "normal",
                responsibility: "fleet",
                status: "closed",
                slaTone: "neutral",
                slaLabel: "closed",
                slaBreachedAt: null,
                slaDueAt: "2026-05-17 10:00",
                reopenCount: 0,
                relatedOrder: "ord_6500",
                relatedCall: null,
                assignee: "陳維 (ops_compliance)",
                fleetPartnerId: "METRO_FLEET",
              },
              attachments: [
                {
                  attachmentId: "att-closed-1",
                  caseId: "cmp_closed_001",
                  name: "training_ack_20260523.pdf",
                  size: "482 KB",
                  state: "done",
                },
              ],
            };
          }
          return {
            caseDetail: {
              id: "cmp_0908",
              type: "complaint",
              cat: "driver_conduct",
              desc: "乘客反映司機言語不當，已上傳影片證據。",
              driver: "黃文豪",
              driverId: "d_8851",
              severity: "high",
              responsibility: "fleet",
              status: "reopened",
              slaTone: "danger",
              slaLabel: "SLA breached",
              slaBreachedAt: "2026-05-22 14:31",
              slaDueAt: "2026-05-22 14:30",
              reopenCount: 1,
              relatedOrder: "ord_8175",
              relatedCall: "call_2014",
              assignee: "陳維 (ops_compliance)",
              fleetPartnerId: "METRO_FLEET",
            },
            attachments: [
              {
                attachmentId: "att-001",
                caseId: "cmp_0908",
                name: "training_ack_20260523.pdf",
                size: "482 KB",
                state: "done",
              },
              {
                attachmentId: "att-002",
                caseId: "cmp_0908",
                name: "dashcam_clip_0908.mp4",
                size: "18.4 MB",
                state: "done",
              },
            ],
          };
        }),
        post: vi.fn().mockResolvedValue({ success: true }),
      },
      fleetPartnerId: "METRO_FLEET",
    })),
  }),
);

import { FleetPartnerCaseService } from "../../../../apps/api/src/modules/fleet-partner/fleet-partner-case.service";
import { FleetPartnerController } from "../../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import type { ComplaintService } from "../../../../apps/api/src/modules/complaint/complaint.service";
import {
  loadCases,
  loadCaseDetail,
} from "../../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server";

describe("SR-FLEET-CASE-001: 車行案件回覆與 Ops timeline 閉環", () => {
  let caseService: FleetPartnerCaseService;
  let mockComplaintService: {
    addComplaintCaseNote: ReturnType<typeof vi.fn>;
    getComplaintByCaseNo: ReturnType<typeof vi.fn>;
    getComplaintTimeline: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockComplaintService = {
      addComplaintCaseNote: vi.fn().mockImplementation((caseNo, cmd) => {
        return {
          caseNo,
          note: cmd.note,
          author: cmd.author || "system",
          addedAt: new Date().toISOString(),
        };
      }),
      getComplaintByCaseNo: vi.fn().mockImplementation((caseNo) => ({
        caseNo,
        assignee: "陳維 (ops_compliance)",
        status: "reopened",
        responsibility: "fleet",
      })),
      getComplaintTimeline: vi.fn().mockReturnValue([
        {
          caseNo: "C-20260520-000001",
          action: "case_created",
          note: "乘客反映司機言語不當，已上傳影片證據。",
        },
        {
          caseNo: "C-20260520-000001",
          action: "case_assigned",
          note: "由 ops_compliance 接手。",
          assignee: "陳維 (ops_compliance)",
        },
      ]),
    };

    caseService = new FleetPartnerCaseService(
      mockComplaintService as unknown as ComplaintService,
    );
  });

  describe("Capability 1: fleet_case_reply_ops_timeline_remote (車行回覆寫入共享案件歷程與 Ops 閉環)", () => {
    it("should submit reply to case cmp_0908 and write to authoritative timeline with actorRealm: 'tenant'", async () => {
      const fleetPartnerId = "METRO_FLEET";
      const caseId = "cmp_0908";
      const actorId = "陳家豪";
      const content = "已與司機當面對證並完成教育訓練，訓練紀錄與行車記錄器截圖已附上。";

      const receipt = await caseService.submitReply(
        fleetPartnerId,
        caseId,
        actorId,
        {
          content,
          idempotencyKey: "idem-test-001",
          attachmentIds: ["att-001"],
        },
      );

      expect(receipt).toBeDefined();
      expect(receipt.caseId).toBe(caseId);
      expect(receipt.content).toBe(content);
      expect(receipt.actorId).toBe("陳家豪");
      expect(receipt.fleetPartnerId).toBe(fleetPartnerId);
      expect(receipt.deduplicated).toBe(false);

      // Verify case timeline contains the new entry with actorRealm: 'tenant'
      const timeline = await caseService.getCaseTimeline(fleetPartnerId, caseId);
      const replyEntry = timeline.find((e) => e.t === "車行回覆" && e.actorRealm === "tenant");
      expect(replyEntry).toBeDefined();
      expect(replyEntry?.actor).toBe("陳家豪 (METRO_FLEET)");
      expect(replyEntry?.actorRealm).toBe("tenant");
      expect(replyEntry?.body).toBe(content);
      expect(replyEntry?.attachments).toBeDefined();
      expect(replyEntry?.attachments?.length).toBe(1);
      expect(replyEntry?.attachments?.[0]?.name).toBe("training_ack_20260523.pdf");
    });

    it("should synchronize reply to Ops complaint timeline via addComplaintCaseNote and preserve Ops owner (assignee)", async () => {
      const fleetPartnerId = "METRO_FLEET";
      const caseId = "cmp_0908";
      const content = "已完成車行內部檢討懲處。";

      // Check detail before reply: Ops owner is 陳維
      const detailBefore = await caseService.getCaseDetail(fleetPartnerId, caseId);
      expect(detailBefore.caseDetail.assignee).toBe("陳維 (ops_compliance)");

      await caseService.submitReply(fleetPartnerId, caseId, "陳家豪", {
        content,
      });

      // Ops timeline service was called with authoritative prefix
      expect(mockComplaintService.addComplaintCaseNote).toHaveBeenCalledTimes(1);
      const [calledCaseNo, calledPayload] = mockComplaintService.addComplaintCaseNote.mock.calls[0] as [string, any];
      expect(calledCaseNo).toBe("C-20260520-000001");
      expect(calledPayload.note).toContain("[車行回覆 · METRO_FLEET]");
      expect(calledPayload.note).toContain(content);

      // Detail after reply: Ops owner is STRICTLY PRESERVED
      const detailAfter = await caseService.getCaseDetail(fleetPartnerId, caseId);
      expect(detailAfter.caseDetail.assignee).toBe("陳維 (ops_compliance)");
    });
  });

  describe("Capability 2: fleet_case_attachment_authorized_readback (附件上傳、授權回讀與防竄改簽章)", () => {
    it("should generate pre-signed upload URL for open case", async () => {
      const upload = await caseService.createAttachmentUploadUrl(
        "METRO_FLEET",
        "cmp_0908",
        "usr-partner-admin",
        {
          fileName: "supplement_evidence.pdf",
          fileSize: 512000,
          contentType: "application/pdf",
        },
      );

      expect(upload).toBeDefined();
      expect(upload.uploadUrl).toContain("https://uploads.drts.example/presigned/");
      expect(upload.attachmentId).toBeDefined();
      expect(upload.objectKey).toContain("fleet-partner/METRO_FLEET/cases/cmp_0908/");
      expect(upload.expiresAt).toBeDefined();
    });

    it("should confirm uploaded attachment and register it in case attachments", async () => {
      const upload = await caseService.createAttachmentUploadUrl(
        "METRO_FLEET",
        "cmp_0908",
        "usr-partner-admin",
        {
          fileName: "photo.jpg",
          fileSize: 204800,
          contentType: "image/jpeg",
        },
      );

      const confirmed = await caseService.confirmAttachmentUpload(
        "METRO_FLEET",
        "cmp_0908",
        "usr-partner-admin",
        {
          attachmentId: upload.attachmentId,
          objectKey: upload.objectKey,
          fileName: "photo.jpg",
          fileSize: 204800,
          contentType: "image/jpeg",
        },
      );

      expect(confirmed.attachmentId).toBe(upload.attachmentId);
      expect(confirmed.state).toBe("done");

      const detail = await caseService.getCaseDetail("METRO_FLEET", "cmp_0908");
      const found = detail.attachments.find((a) => a.attachmentId === upload.attachmentId);
      expect(found).toBeDefined();
      expect(found?.state).toBe("done");
    });

    it("should reject attachment upload for closed case with CASE_CLOSED_NO_REPLY (409)", async () => {
      await expect(
        caseService.createAttachmentUploadUrl(
          "METRO_FLEET",
          "cmp_closed_001",
          "usr-partner-admin",
          {
            fileName: "late_report.pdf",
            fileSize: 102400,
            contentType: "application/pdf",
          },
        ),
      ).rejects.toThrow();

      try {
        await caseService.createAttachmentUploadUrl(
          "METRO_FLEET",
          "cmp_closed_001",
          "usr-partner-admin",
          {
            fileName: "late_report.pdf",
            fileSize: 102400,
            contentType: "application/pdf",
          },
        );
      } catch (err: any) {
        expect(err.code || err.getResponse?.()?.error?.code).toBe("CASE_CLOSED_NO_REPLY");
      }
    });

    it("should allow authorized readback of uploaded attachments even for closed case (closed cases remain downloadable)", async () => {
      // For closed case cmp_closed_001, attachment att-closed-1 can still obtain authorized read URL
      const readback = await caseService.getAttachmentReadUrl(
        "METRO_FLEET",
        "cmp_closed_001",
        "att-closed-1",
      );

      expect(readback).toBeDefined();
      expect(readback.attachmentId).toBe("att-closed-1");
      expect(readback.downloadUrl).toContain("/download?");
      expect(readback.authorized).toBe(true);

      const params = new URLSearchParams(readback.downloadUrl.split("?")[1]);
      const expiresAt = Number(params.get("expiresAt"));
      const sig = params.get("sig")!;

      // Verification of the issued token succeeds
      const verified = await caseService.verifyAndGetAttachmentForDownload(
        "METRO_FLEET",
        "cmp_closed_001",
        "att-closed-1",
        expiresAt,
        sig,
      );
      expect(verified.attachment.name).toBe("training_ack_20260523.pdf");
      expect(verified.attachment.state).toBe("done");
      expect(verified.fileContent).toBeDefined();
    });

    it("should reject tampered HMAC token or expired readback token with 403", async () => {
      const readback = await caseService.getAttachmentReadUrl(
        "METRO_FLEET",
        "cmp_0908",
        "att-001",
      );

      const params = new URLSearchParams(readback.downloadUrl.split("?")[1]);
      const expiresAt = Number(params.get("expiresAt"));
      const sig = params.get("sig")!;

      // Tampered token
      const tamperedSig = sig.slice(0, -4) + "dead";
      await expect(
        caseService.verifyAndGetAttachmentForDownload(
          "METRO_FLEET",
          "cmp_0908",
          "att-001",
          expiresAt,
          tamperedSig,
        ),
      ).rejects.toThrow();

      // Expired token (in the past)
      const pastExpiresAt = Date.now() - 60000;
      await expect(
        caseService.verifyAndGetAttachmentForDownload(
          "METRO_FLEET",
          "cmp_0908",
          "att-001",
          pastExpiresAt,
          sig,
        ),
      ).rejects.toThrow();
    });

    it("should reject cross-fleet download request with 403", async () => {
      const readback = await caseService.getAttachmentReadUrl(
        "METRO_FLEET",
        "cmp_0908",
        "att-001",
      );

      const params = new URLSearchParams(readback.downloadUrl.split("?")[1]);
      const expiresAt = Number(params.get("expiresAt"));
      const sig = params.get("sig")!;

      // Trying to download with a different fleet partner ID
      await expect(
        caseService.verifyAndGetAttachmentForDownload(
          "ROGUE_FLEET",
          "cmp_0908",
          "att-001",
          expiresAt,
          sig,
        ),
      ).rejects.toThrow();
    });
  });

  describe("Capability 3: fleet_case_cross_fleet_closed_dedup (邊界約束、權限隔離與重送去重)", () => {
    it("should throw 403 CASE_NOT_FLEET_SCOPED when accessing other fleet case", async () => {
      // cmp_9999 belongs to OTHER_FLEET
      await expect(
        caseService.getCaseDetail("METRO_FLEET", "cmp_9999"),
      ).rejects.toThrow();

      try {
        await caseService.getCaseDetail("METRO_FLEET", "cmp_9999");
      } catch (err: any) {
        expect(err.code || err.getResponse?.()?.error?.code).toBe("CASE_NOT_FLEET_SCOPED");
      }
    });

    it("should allow viewing platform-owned case cmp_0912 but reject reply with 409 CASE_PLATFORM_OWNED", async () => {
      // Visible
      const detail = await caseService.getCaseDetail("METRO_FLEET", "cmp_0912");
      expect(detail.caseDetail.responsibility).toBe("platform");

      // Reply rejected
      await expect(
        caseService.submitReply("METRO_FLEET", "cmp_0912", "usr-partner", {
          content: "車行嘗試回覆平台責任案件",
        }),
      ).rejects.toThrow();

      try {
        await caseService.submitReply("METRO_FLEET", "cmp_0912", "usr-partner", {
          content: "車行嘗試回覆平台責任案件",
        });
      } catch (err: any) {
        expect(err.code || err.getResponse?.()?.error?.code).toBe("CASE_PLATFORM_OWNED");
      }
    });

    it("should reject reply on closed case cmp_closed_001 with 409 CASE_CLOSED_NO_REPLY", async () => {
      await expect(
        caseService.submitReply("METRO_FLEET", "cmp_closed_001", "usr-partner", {
          content: "案件已結案仍回覆",
        }),
      ).rejects.toThrow();

      try {
        await caseService.submitReply("METRO_FLEET", "cmp_closed_001", "usr-partner", {
          content: "案件已結案仍回覆",
        });
      } catch (err: any) {
        expect(err.code || err.getResponse?.()?.error?.code).toBe("CASE_CLOSED_NO_REPLY");
      }
    });

    it("should deduplicate resubmitted reply using idempotency-key and return original receipt without duplicate timeline entries", async () => {
      const fleetPartnerId = "METRO_FLEET";
      const caseId = "cmp_0908";
      const actorId = "陳家豪";
      const idempotencyKey = "idem-unique-key-999";
      const content = "首次回覆說明";

      const timelineBefore = await caseService.getCaseTimeline(fleetPartnerId, caseId);
      const initialCount = timelineBefore.length;

      // First submission
      const firstReceipt = await caseService.submitReply(
        fleetPartnerId,
        caseId,
        actorId,
        {
          content,
          idempotencyKey,
        },
      );
      expect(firstReceipt.deduplicated).toBe(false);

      const timelineAfterFirst = await caseService.getCaseTimeline(fleetPartnerId, caseId);
      expect(timelineAfterFirst.length).toBe(initialCount + 1);

      // Second submission with exact same idempotencyKey
      const secondReceipt = await caseService.submitReply(
        fleetPartnerId,
        caseId,
        actorId,
        {
          content,
          idempotencyKey,
        },
      );
      expect(secondReceipt.deduplicated).toBe(true);
      expect(secondReceipt.replyId).toBe(firstReceipt.replyId);
      expect(secondReceipt.repliedAt).toBe(firstReceipt.repliedAt);

      // Timeline entries count MUST NOT increase
      const timelineAfterSecond = await caseService.getCaseTimeline(fleetPartnerId, caseId);
      expect(timelineAfterSecond.length).toBe(initialCount + 1);
    });

    it("should drive SLA display directly by slaBreachedAt truthiness", async () => {
      const detailOpen = await caseService.getCaseDetail("METRO_FLEET", "cmp_0908");
      expect(detailOpen.caseDetail.slaBreachedAt).toBeTruthy();
      expect(detailOpen.caseDetail.slaTone).toBe("danger");
      expect(detailOpen.caseDetail.slaLabel).toBe("SLA breached");

      const detailPlatform = await caseService.getCaseDetail("METRO_FLEET", "cmp_0912");
      expect(detailPlatform.caseDetail.slaBreachedAt).toBeNull();
      expect(detailPlatform.caseDetail.slaTone).toBe("success");
      expect(detailPlatform.caseDetail.slaLabel).toBe("on track");
    });
  });

  describe("FleetPartnerController: HTTP Endpoint Integration", () => {
    let controller: FleetPartnerController;

    beforeEach(() => {
      controller = new FleetPartnerController(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        caseService,
      );
    });

    it("GET /api/fleet-partner/cases should return scoped cases list", async () => {
      const res = await controller.listPortalCases("METRO_FLEET");
      expect(res.data).toBeDefined();
      expect(res.data.items).toBeDefined();
      expect(res.data.items.length).toBeGreaterThanOrEqual(3);
      expect(res.data.items.some((c) => c.id === "cmp_0908")).toBe(true);
    });

    it("GET /api/fleet-partner/cases/:caseId should return case detail and attachments", async () => {
      const res = await controller.getPortalCaseDetail("METRO_FLEET", "cmp_0908");
      expect(res.data.caseDetail.id).toBe("cmp_0908");
      expect(res.data.attachments.length).toBeGreaterThanOrEqual(1);
    });

    it("POST /api/fleet-partner/cases/:caseId/reply should return reply receipt in standard envelope", async () => {
      const res = await controller.submitPortalCaseReply(
        "METRO_FLEET",
        "陳家豪",
        "cmp_0908",
        {
          content: "由 controller 呼叫的回覆",
          idempotencyKey: "idem-ctrl-001",
        },
      );
      expect(res.data.caseId).toBe("cmp_0908");
      expect(res.data.actorId).toBe("陳家豪");
      expect(res.data.fleetPartnerId).toBe("METRO_FLEET");
    });

    it("GET /api/fleet-partner/cases/:caseId/attachments/:attachmentId/download should serve binary content with headers", async () => {
      const readUrlRes = await controller.getPortalCaseAttachmentReadUrl("METRO_FLEET", "cmp_0908", "att-001");
      const { downloadUrl } = readUrlRes.data;
      const params = new URLSearchParams(downloadUrl.split("?")[1]);
      const expiresAtStr = params.get("expiresAt")!;
      const sig = params.get("sig")!;

      const headers: Record<string, string> = {};
      let responseBody: Buffer | null = null;
      const mockRes = {
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
        send: (body: Buffer) => {
          responseBody = body;
        },
      };

      await controller.downloadPortalCaseAttachment(
        "METRO_FLEET",
        "cmp_0908",
        "att-001",
        expiresAtStr,
        sig,
        mockRes,
      );

      expect(headers["Content-Type"]).toBe("application/pdf");
      expect(headers["Content-Disposition"]).toContain("training_ack_20260523.pdf");
      expect(responseBody).toBeInstanceOf(Buffer);
    });
  });

  describe("Web Data Layer: loadCases & loadCaseDetail", () => {
    it("loadCases should load and map cases with SLA breach derivation", async () => {
      const result = await loadCases();
      expect(result.rows).toBeDefined();
      expect(result.rows.length).toBeGreaterThanOrEqual(3);

      const cmp0908 = result.rows.find((r) => r.id === "cmp_0908");
      expect(cmp0908).toBeDefined();
      expect(cmp0908?.responsibility).toBe("fleet");
      expect(cmp0908?.sla).toBe("breached");

      const cmp0912 = result.rows.find((r) => r.id === "cmp_0912");
      expect(cmp0912).toBeDefined();
      expect(cmp0912?.responsibility).toBe("platform");
      expect(cmp0912?.sla).toBe("on_track");
    });

    it("loadCaseDetail should return full case detail, timeline, and attachments", async () => {
      const openResult = await loadCaseDetail("cmp_0908");
      expect(openResult.caseDetail.id).toBe("cmp_0908");
      expect(openResult.timeline.length).toBeGreaterThanOrEqual(1);

      const platformResult = await loadCaseDetail("cmp_0912");
      expect(platformResult.caseDetail.id).toBe("cmp_0912");
      expect(platformResult.caseDetail.responsibility).toBe("platform");

      const closedResult = await loadCaseDetail("cmp_closed_001");
      expect(closedResult.caseDetail.status).toBe("closed");
    });
  });
});
