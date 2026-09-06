import { describe, expect, it } from "vitest";
import {
  buildEnterpriseBookingCommand,
  createEnterpriseBookingDraft,
  formatDefaultPlacard,
  formatReservationWindowLabel,
  getEnterpriseBookingPreview,
  isEnterpriseDraftComplete,
  parseEnterpriseBookingDraft,
  serializeEnterpriseBookingDraft,
  validateReservationWindow,
  MIN_LEAD_TIME_MINUTES,
  type EnterpriseBookingDraftForm,
} from "../../../../apps/enterprise-dispatch-web/lib/enterprise-booking-draft";

describe("SR-ENTERPRISE-FORM-001 — 企業預約乘客、日期與手機表單", () => {
  const referenceNow = new Date("2026-09-06T06:12:00.000Z"); // Taipei: 2026-09-06 14:12:00 (+08:00)

  describe("R20 & C015: 自訂/代訂/改名後舉牌一致與入口預設", () => {
    it("1.1 建立自訂預約（self mode / entry=self）時，預設乘客為登入下單人，舉牌與姓名同步", () => {
      const selfDraft = createEnterpriseBookingDraft(
        "zh",
        { entry: "self" },
        referenceNow,
      );

      expect(selfDraft.passengerMode).toBe("self");
      expect(selfDraft.bookedBy).toBe("林宜君");
      expect(selfDraft.passenger).toBe("林宜君");
      expect(selfDraft.placard).toBe("林宜君 様");
    });

    it("1.2 建立代訂預約（other mode / entry=delegate）時，乘客為代訂對象，舉牌與代訂對象姓名同步", () => {
      const delegateDraft = createEnterpriseBookingDraft(
        "zh",
        { entry: "delegate" },
        referenceNow,
      );

      expect(delegateDraft.passengerMode).toBe("other");
      expect(delegateDraft.bookedBy).toBe("林宜君");
      expect(delegateDraft.passenger).toBeTruthy();
      expect(delegateDraft.placard).toBe(
        formatDefaultPlacard(delegateDraft.passenger),
      );
    });

    it("1.3 機場入口（entry=airport）帶出接機預設、航廈與航班及相應舉牌", () => {
      const airportDraft = createEnterpriseBookingDraft(
        "zh",
        { entry: "airport" },
        referenceNow,
      );

      expect(airportDraft.airportDirection).toBe("pickup");
      expect(airportDraft.terminal).toBe("T1");
      expect(airportDraft.flight).toBe("JL809");
      expect(airportDraft.luggageCount).toBe("3");
      expect(airportDraft.placard).toBe(
        formatDefaultPlacard(airportDraft.passenger),
      );
    });

    it("1.4 代訂改名時，預設舉牌隨之自動同步更新", () => {
      const initial = createEnterpriseBookingDraft(
        "zh",
        { entry: "delegate" },
        referenceNow,
      );
      expect(initial.placard).toBe(formatDefaultPlacard(initial.passenger));

      // 當改名為 "陳思妤"
      const updatedPassenger = "陳思妤";
      const syncedPlacard = formatDefaultPlacard(updatedPassenger);
      expect(syncedPlacard).toBe("陳思妤 様");

      // 序列化並重新解析，舉牌維持一致
      const params = serializeEnterpriseBookingDraft({
        ...initial,
        passenger: updatedPassenger,
        placard: syncedPlacard,
      });

      const parsed = parseEnterpriseBookingDraft(
        Object.fromEntries(params),
        "zh",
        referenceNow,
      );
      expect(parsed.passenger).toBe("陳思妤");
      expect(parsed.placard).toBe("陳思妤 様");
    });

    it("1.5 使用者明確自訂舉牌（如自訂稱謂或客製舉牌）時，往返 review 不被蓋掉", () => {
      const initial = createEnterpriseBookingDraft(
        "zh",
        { entry: "delegate" },
        referenceNow,
      );
      const customPlacard = "VIP 日本總部 田中董事長一行";

      const params = serializeEnterpriseBookingDraft({
        ...initial,
        passenger: "田中 健一郎",
        placard: customPlacard,
      });

      const parsed = parseEnterpriseBookingDraft(
        Object.fromEntries(params),
        "zh",
        referenceNow,
      );

      expect(parsed.passenger).toBe("田中 健一郎");
      expect(parsed.placard).toBe(customPlacard);
    });

    it("1.6 formatDefaultPlacard 已有敬稱（様／先生／女士／小姐）時不重複附加敬稱", () => {
      expect(formatDefaultPlacard("Sato 様")).toBe("Sato 様");
      expect(formatDefaultPlacard("張先生")).toBe("張先生");
      expect(formatDefaultPlacard("李小姐")).toBe("李小姐");
      expect(formatDefaultPlacard("王女士")).toBe("王女士");
      expect(formatDefaultPlacard("  林冠廷  ")).toBe("林冠廷 様");
      expect(formatDefaultPlacard("")).toBe("");
    });

    it("1.7 buildEnterpriseBookingCommand 在 self mode 與 other mode 下之乘客與聯絡人資料一致", () => {
      const selfDraft: EnterpriseBookingDraftForm = {
        ...createEnterpriseBookingDraft("zh", { entry: "self" }, referenceNow),
        reservationDate: "2026-09-08",
        reservationTime: "10:00",
        onsiteContactPhone: "0912-345-678",
      };

      const selfCmd = buildEnterpriseBookingCommand(selfDraft, referenceNow);
      expect(selfCmd.passenger.name).toBe("林宜君");
      expect(selfCmd.onsiteContact?.name).toBe("林宜君");
      expect(selfCmd.onsiteContact?.phone).toBe("0912-345-678");
      expect(selfCmd.bookedBy?.name).toBe("林宜君");

      const otherDraft: EnterpriseBookingDraftForm = {
        ...createEnterpriseBookingDraft("zh", { entry: "other" }, referenceNow),
        passenger: "高橋 誠",
        reservationDate: "2026-09-08",
        reservationTime: "10:00",
        onsiteContactPhone: "0988-765-432",
      };

      const otherCmd = buildEnterpriseBookingCommand(otherDraft, referenceNow);
      expect(otherCmd.passenger.name).toBe("高橋 誠");
      expect(otherCmd.onsiteContact?.name).toBe("高橋 誠");
      expect(otherCmd.onsiteContact?.phone).toBe("0988-765-432");
      expect(otherCmd.bookedBy?.name).toBe("林宜君");
    });
  });

  describe("R21 & C016: 過去時間/時區邊界與最短提前規則", () => {
    it("2.1 填入過去日期（如 9/6 填 6/13）拒絕進入有效送審狀態，並給予最早可預約時間", () => {
      // referenceNow = 2026-09-06 14:12:00 (+08:00)
      const pastResult = validateReservationWindow(
        "2026-06-13",
        "15:20",
        referenceNow,
        "zh",
      );

      expect(pastResult.isValid).toBe(false);
      expect(pastResult.isPast).toBe(true);
      expect(pastResult.isTooSoon).toBe(false);
      expect(pastResult.errorMessage).toContain("預約時間不能為過去時間");
      expect(pastResult.errorMessage).toContain("最早可預約時間為");
      expect(pastResult.earliestAllowedDate).toBe("2026-09-06");
      expect(pastResult.earliestAllowedTime).toBe("14:27"); // 14:12 + 15 min
    });

    it("2.2 預約未達最短提前時間（少於 15 分鐘）時拒絕", () => {
      // 10 分鐘後（14:22）< 15 分鐘門檻（14:27）
      const tooSoonResult = validateReservationWindow(
        "2026-09-06",
        "14:22",
        referenceNow,
        "zh",
      );

      expect(tooSoonResult.isValid).toBe(false);
      expect(tooSoonResult.isPast).toBe(false);
      expect(tooSoonResult.isTooSoon).toBe(true);
      expect(tooSoonResult.errorMessage).toContain(
        `預約需至少提前 ${MIN_LEAD_TIME_MINUTES} 分鐘`,
      );
    });

    it("2.3 滿足最短提前時間之未來時間驗證成功", () => {
      // 23 分鐘後（14:35）>= 15 分鐘門檻
      const validResult = validateReservationWindow(
        "2026-09-06",
        "14:35",
        referenceNow,
        "zh",
      );

      expect(validResult.isValid).toBe(true);
      expect(validResult.isPast).toBe(false);
      expect(validResult.isTooSoon).toBe(false);
      expect(validResult.errorMessage).toBeUndefined();
    });

    it("2.4 時區邊界：UTC 與 Asia/Taipei (+08:00) 跨日轉換不漂移", () => {
      // 設 UTC 為 2026-09-06 23:30:00Z -> 台北時間為 2026-09-07 07:30:00
      const midnightUtcNow = new Date("2026-09-06T23:30:00.000Z");

      // 若使用者在台北選 2026-09-06 23:00（台北前一天），此時台北已是 9/7 07:30，屬過去時間
      const pastTpeResult = validateReservationWindow(
        "2026-09-06",
        "23:00",
        midnightUtcNow,
        "zh",
      );
      expect(pastTpeResult.isPast).toBe(true);
      expect(pastTpeResult.isValid).toBe(false);

      // 若使用者選 2026-09-07 08:00（台北時間 30 分鐘後），應判定有效
      const validTpeResult = validateReservationWindow(
        "2026-09-07",
        "08:00",
        midnightUtcNow,
        "zh",
      );
      expect(validTpeResult.isValid).toBe(true);
    });

    it("2.5 isEnterpriseDraftComplete 在過去時間回傳 false，不可進入 review / 送審", () => {
      const draft: EnterpriseBookingDraftForm = {
        ...createEnterpriseBookingDraft("zh", { entry: "self" }, referenceNow),
        reservationDate: "2026-06-13",
        reservationTime: "15:20",
      };

      expect(isEnterpriseDraftComplete(draft, referenceNow)).toBe(false);

      // 修正為有效未來時間後，回傳 true
      const validDraft: EnterpriseBookingDraftForm = {
        ...draft,
        reservationDate: "2026-09-08",
        reservationTime: "10:00",
      };
      expect(isEnterpriseDraftComplete(validDraft, referenceNow)).toBe(true);
    });

    it("2.6 英文語系下之錯誤訊息包含正確提示", () => {
      const enPastResult = validateReservationWindow(
        "2026-06-13",
        "15:20",
        referenceNow,
        "en",
      );
      expect(enPastResult.errorMessage).toContain(
        "Reservation time cannot be in the past",
      );
    });
  });

  describe("R22, C019 & C120: 390px Viewport 排版適配與長文字容錯", () => {
    it("3.1 長姓名與長備註正常格式化且不損壞 preview 與 command 生成", () => {
      const longName = "Alexander Bartholomew Montgomery III of New Amsterdam";
      const longPlacard = formatDefaultPlacard(longName);
      expect(longPlacard).toBe(`${longName} 様`);

      const draft: EnterpriseBookingDraftForm = {
        ...createEnterpriseBookingDraft("zh", { entry: "other" }, referenceNow),
        passenger: longName,
        placard: longPlacard,
        reservationDate: "2026-09-09",
        reservationTime: "14:00",
        notes: "Very long instructions for airport terminal VIP pickup with oversized luggage",
      };

      const preview = getEnterpriseBookingPreview(draft, "zh");
      expect(preview.estimatedFare).toBeGreaterThan(0);
      expect(isEnterpriseDraftComplete(draft, referenceNow)).toBe(true);

      const cmd = buildEnterpriseBookingCommand(draft, referenceNow);
      expect(cmd.passenger.name).toBe(longName);
      expect(cmd.notes).toContain("Very long instructions");
    });

    it("3.2 視窗標籤格式化輸出維持緊湊排版", () => {
      expect(
        formatReservationWindowLabel({
          reservationDate: "2026-09-08",
          reservationTime: "10:30",
        }),
      ).toBe("09/08 10:30");

      expect(
        formatReservationWindowLabel({
          reservationDate: "2026/09/08",
          reservationTime: "10:30",
        }),
      ).toBe("2026/09/08 10:30");
    });
  });
});
