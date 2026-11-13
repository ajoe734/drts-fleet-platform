import { describe, expect, it } from "vitest";

import type { AssistTranscriptSegment } from "../../../apps/api/src/modules/callcenter-assist/assist-fields";
import {
  extractAssistFieldsByRules,
  parseChineseNumber,
} from "../../../apps/api/src/modules/callcenter-assist/assist-rule-extractor";

let sequence = 0;
function seg(
  speaker: AssistTranscriptSegment["speaker"],
  text: string,
): AssistTranscriptSegment {
  sequence += 1;
  return {
    segmentId: `s${sequence}`,
    speaker,
    text,
    startedAt: null,
    receivedAt: "2026-11-11T00:00:00.000Z",
  };
}

const NOW = "2026-11-11T00:00:00.000Z";

describe("parseChineseNumber", () => {
  it.each([
    ["3", 3],
    ["三", 3],
    ["兩", 2],
    ["十", 10],
    ["十二", 12],
    ["二十", 20],
    ["三十五", 35],
    ["一百", 100],
  ])("%s → %d", (text, value) => {
    expect(parseChineseNumber(text)).toBe(value);
  });

  it("rejects non-numbers", () => {
    expect(parseChineseNumber("車")).toBeNull();
    expect(parseChineseNumber("")).toBeNull();
  });
});

describe("extractAssistFieldsByRules", () => {
  it("fills a typical immediate booking from caller speech", () => {
    const fields = extractAssistFieldsByRules(
      [
        seg("agent", "您好，這裡是叫車專線，請問您貴姓？"),
        seg("caller", "我姓王，我現在在中山北路二段45巷3號要叫車"),
        seg("caller", "要去台北車站，兩個人，有一個大行李箱"),
        seg("caller", "電話是0912-345-678"),
      ],
      NOW,
    );
    expect(fields.passengerName?.value).toBe("王");
    expect(fields.passengerName?.status).toBe("uncertain");
    expect(fields.pickup?.value).toBe("中山北路二段45巷3號");
    expect(fields.pickup?.status).toBe("filled");
    expect(fields.dropoff?.value).toBe("台北車站");
    expect(fields.passengerCount?.value).toBe("2");
    expect(fields.luggage?.value).toBe("1 件（大型）");
    expect(fields.passengerPhone?.value).toBe("0912345678");
    expect(fields.passengerPhone?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(fields.pickupTime?.value).toBe("現在（即時叫車）");
  });

  it("splits 從…到… into pickup and drop-off", () => {
    const fields = extractAssistFieldsByRules(
      [seg("caller", "從松山機場到台大醫院")],
      NOW,
    );
    expect(fields.pickup?.value).toBe("松山機場");
    expect(fields.dropoff?.value).toBe("台大醫院");
  });

  it("takes the latest value and keeps the corrected one as a candidate", () => {
    const fields = extractAssistFieldsByRules(
      [
        seg("caller", "我要去台北車站"),
        seg("caller", "不好意思，不是，我要去松山車站"),
      ],
      NOW,
    );
    expect(fields.dropoff?.value).toBe("松山車站");
    expect(fields.dropoff?.candidates).toEqual(["台北車站"]);
  });

  it("raises confidence when the agent reads the same value back", () => {
    const fields = extractAssistFieldsByRules(
      [
        seg("caller", "我在民生東路三段"),
        seg("agent", "好的王先生，跟您確認在民生東路三段上車"),
      ],
      NOW,
    );
    expect(fields.pickup?.value).toBe("民生東路三段");
    expect(fields.pickup?.sourceSegmentIds).toHaveLength(2);
    expect(fields.pickup?.confidence).toBeGreaterThan(0.8);
    expect(fields.passengerName?.value).toBe("王先生");
  });

  it("recognises a place followed by 上車/下車 without a leading cue", () => {
    const fields = extractAssistFieldsByRules(
      [seg("caller", "麻煩派車，國父紀念館上車，101大樓下車")],
      NOW,
    );
    expect(fields.pickup?.value).toBe("國父紀念館");
    expect(fields.dropoff?.value).toBe("101大樓");
  });

  it("does not read 現在 or 快一點 as a place or a clock time", () => {
    const fields = extractAssistFieldsByRules(
      [seg("caller", "現在要叫車，可以快一點嗎")],
      NOW,
    );
    expect(fields.pickup).toBeUndefined();
    expect(fields.pickupTime?.value).toBe("現在（即時叫車）");
  });

  it("parses scheduled clock times and flags ambiguous ones", () => {
    const afternoon = extractAssistFieldsByRules(
      [seg("caller", "明天下午三點半來接我")],
      NOW,
    );
    expect(afternoon.pickupTime?.value).toBe("明天 下午 3:30");
    expect(afternoon.pickupTime?.status).toBe("filled");
    const bare = extractAssistFieldsByRules([seg("caller", "三點")], NOW);
    expect(bare.pickupTime?.value).toBe("3:00");
    expect(bare.pickupTime?.status).toBe("uncertain");
  });

  it("converts spoken digits into a phone number", () => {
    const fields = extractAssistFieldsByRules(
      [seg("caller", "我的電話是零九八七六五四三二一")],
      NOW,
    );
    expect(fields.passengerPhone?.value).toBe("0987654321");
  });

  it("detects wheelchair and notes but honours negation", () => {
    const needs = extractAssistFieldsByRules(
      [seg("caller", "我媽媽要坐輪椅，會帶狗狗，要刷卡")],
      NOW,
    );
    expect(needs.requiredCapabilities?.value).toBe("wheelchair");
    expect(needs.notes?.value).toBe("帶寵物、要刷卡");
    const none = extractAssistFieldsByRules(
      [seg("caller", "不用輪椅，沒有行李")],
      NOW,
    );
    expect(none.requiredCapabilities).toBeUndefined();
    expect(none.luggage?.value).toBe("0 件");
  });

  it("does not mistake 我叫車 for a name", () => {
    const fields = extractAssistFieldsByRules(
      [seg("caller", "我叫車，我叫一台車到桃園高鐵站")],
      NOW,
    );
    expect(fields.passengerName).toBeUndefined();
    expect(fields.dropoff?.value).toBe("桃園高鐵站");
  });

  it("treats a bare street address as an uncertain pickup", () => {
    const fields = extractAssistFieldsByRules(
      [seg("agent", "請問地址？"), seg("caller", "忠孝東路四段100號")],
      NOW,
    );
    expect(fields.pickup?.value).toBe("忠孝東路四段100號");
    expect(fields.pickup?.status).toBe("uncertain");
  });
});
