import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { recordsToPdf } from "../../../../apps/api/src/modules/reporting-filing/report-renderers";

describe("recordsToPdf header layout", () => {
  it("reserves enough height for wrapped headers before the first data row", async () => {
    const headers = Array.from(
      { length: 18 },
      (_, index) => `欄位${index + 1}駕駛清冊長欄名`,
    );
    const row = Object.fromEntries(
      headers.map((header, index) => [header, `DATA_SENTINEL_${index + 1}`]),
    );
    const pdf = await recordsToPdf([row], "表頭高度回歸");
    const loading = getDocument({
      data: new Uint8Array(pdf),
      useSystemFonts: false,
      disableFontFace: true,
    });
    const document = await loading.promise;
    try {
      const items: Array<{
        str: string;
        transform: number[];
        page: number;
      }> = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        items.push(
          ...content.items
            .filter(
              (item): item is typeof item & {
                str: string;
                transform: number[];
              } => "str" in item && Array.isArray(item.transform),
            )
            .map((item) => ({
              str: item.str,
              transform: item.transform,
              page: pageNumber,
            })),
        );
      }
      const firstData = items.find((item) => item.str.startsWith("DATA_"));
      expect(firstData).toBeDefined();
      const headerItems = items.filter((item) => item.str.includes("欄位"));
      expect(headerItems.length).toBe(18);
      const samePageHeaders = headerItems.filter(
        (item) => item.page === firstData?.page,
      );
      expect(samePageHeaders.length).toBeGreaterThan(0);
      // PDF coordinates use a bottom-left origin: header lines have a larger
      // y coordinate than the first data row on the same page.
      expect(
        Math.min(...samePageHeaders.map((item) => item.transform[5] ?? 0)),
      ).toBeGreaterThan(firstData?.transform[5] ?? 0);
    } finally {
      await loading.destroy();
    }
  });
});
