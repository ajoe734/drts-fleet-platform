import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  recordsToPdf,
  recordsToXlsx,
} from "../../../apps/api/src/modules/reporting-filing/report-renderers";
import { recordsToCsv } from "../../../apps/api/src/common/csv";

async function readPdf(buffer: Buffer) {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
    disableFontFace: true,
  });
  try {
    const pdf = await task.promise;
    const pages: Array<Array<{ text: string; y: number }>> = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const content = await (await pdf.getPage(index)).getTextContent();
      pages.push(
        content.items.flatMap((item) =>
          "str" in item
            ? [{ text: item.str, y: Number(item.transform[5]) }]
            : [],
        ),
      );
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
function gap(
  page: Array<{ text: string; y: number }>,
  first: string,
  second: string,
) {
  const from = page.find((item) => item.text === first),
    to = page.find((item) => item.text === second);
  expect(from).toBeDefined();
  expect(to).toBeDefined();
  return Math.abs(from!.y - to!.y);
}
async function xlsxRows(rows: Record<string, unknown>[]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await recordsToXlsx(rows)) as never);
  return workbook.worksheets[0]!.rowCount;
}
it.each([null, undefined, ""])(
  "preserves a complete empty %s row between two real report records across CSV/XLSX/PDF",
  async (value) => {
    const ordinary = [{ value: "BEFORE" }, { value: "AFTER" }],
      rows = [{ value: "BEFORE" }, { value }, { value: "AFTER" }];
    expect(recordsToCsv(rows).split("\r\n")).toEqual([
      '"value"',
      '"BEFORE"',
      '""',
      '"AFTER"',
    ]);
    expect(await xlsxRows(rows)).toBe(4);
    const original = await readPdf(
        await recordsToPdf(ordinary, "Existing records"),
      ),
      actual = await readPdf(await recordsToPdf(rows, "Existing records"));
    expect(actual).toHaveLength(1);
    expect(gap(actual[0]!, "BEFORE", "AFTER")).toBeGreaterThan(
      gap(original[0]!, "BEFORE", "AFTER"),
    );
  },
);
it("retains an empty first record below the true PDF header without changing the following record", async () => {
  const ordinary = await readPdf(
    await recordsToPdf([{ value: "FIRST" }], "Leading row"),
  );
  const actual = await readPdf(
    await recordsToPdf([{ value: null }, { value: "FIRST" }], "Leading row"),
  );
  expect(gap(actual[0]!, "value", "FIRST")).toBeGreaterThan(
    gap(ordinary[0]!, "value", "FIRST"),
  );
  expect(actual.flat().filter((item) => item.text === "FIRST")).toHaveLength(1);
});
it("paginates a real all-empty record set and repeats headers rather than dropping all rows or inventing No data", async () => {
  const rows = Array.from({ length: 100 }, () => ({ value: null }));
  expect(recordsToCsv(rows).split("\r\n")).toHaveLength(101);
  expect(await xlsxRows(rows)).toBe(101);
  const actual = await readPdf(
    await recordsToPdf(rows, "Empty-valued records"),
  );
  expect(actual.length).toBeGreaterThan(1);
  for (const page of actual) {
    expect(page.filter((item) => item.text === "value")).toHaveLength(1);
    expect(page.map((item) => item.text).join("")).not.toContain("No data");
  }
});
