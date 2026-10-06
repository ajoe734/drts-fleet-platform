import { expect } from "vitest";

export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: false,
    disableFontFace: true,
  });
  const pdf = await task.promise;
  const text: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    text.push(strings.join(" "));
  }
  return text.join("\n");
}

export async function validateReportArtifact(
  jobDetail: any,
  jobId: string,
  contentType: string,
  bytes: Buffer
) {
  let expectedFormat = "csv";
  if (contentType === "application/pdf") expectedFormat = "pdf";
  else if (contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") expectedFormat = "xlsx";
  expect(jobDetail.format).toBe(expectedFormat);

  const expectedColumns: string[] = [];
  if (jobDetail.rows) {
      for (const record of jobDetail.rows) {
          for (const key of Object.keys(record)) {
              if (!expectedColumns.includes(key)) expectedColumns.push(key);
          }
      }
  }

  const escapeCellForCsv = (value: unknown): string => {
      const text = value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
      const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
      // We do NOT add quotes here because we are comparing against parsed CSV fields which already had quotes stripped by the parser.
      // Wait! The production recordsToCsv uses `"..."` around every field! And the CSV parser handles stripping the outer quotes.
      // So the expected value we compare against the parsed field should just be `safeText`.
      return safeText;
  };

  if (contentType === "application/pdf") {
      const fullText = await extractPdfText(bytes);
      
      if (jobDetail.rows !== undefined) {
          if (jobDetail.rows.length > 0) {
              for (const row of jobDetail.rows) {
                  for (const col of expectedColumns) {
                      const val = row[col];
                      if (val !== undefined && val !== null) {
                          const strVal = typeof val === "object" ? JSON.stringify(val) : String(val);
                          // Replace exact whitespaces in the expected string with \s+ so it matches extracted PDF text which collapses newlines into spaces
                          const escapedStrVal = strVal
                                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                                .replace(/\s+/g, '\\s+');
                          const matchExact = new RegExp(`(?:^|\\s|\\b)${escapedStrVal}(?:\\b|\\s|$)`);
                          expect(fullText).toMatch(matchExact);
                      }
                  }
              }
          } else {
              expect(fullText).toContain(jobId);
          }
      } else {
          throw new Error("Missing rows evidence in metadata");
      }
  } else if (contentType === "text/csv") {
      const csvText = bytes.toString("utf-8");
      expect(csvText.trim().startsWith("<html>")).toBe(false);

      const parseCsvStrict = (text: string) => {
          const records: string[][] = [];
          let currentRecord: string[] = [];
          let currentField = "";
          let inQuotes = false;
          for (let i = 0; i < text.length; i++) {
              const c = text[i];
              if (inQuotes) {
                  if (c === "\"") {
                      if (i + 1 < text.length && text[i + 1] === "\"") {
                          currentField += "\"";
                          i++;
                      } else {
                          inQuotes = false;
                      }
                  } else {
                      currentField += c;
                  }
              } else {
                  if (c === "\"") {
                      inQuotes = true;
                  } else if (c === ",") {
                      currentRecord.push(currentField);
                      currentField = "";
                  } else if (c === "\r" && i + 1 < text.length && text[i + 1] === "\n") {
                      currentRecord.push(currentField);
                      records.push(currentRecord);
                      currentRecord = [];
                      currentField = "";
                      i++;
                  } else if (c === "\n") {
                      currentRecord.push(currentField);
                      records.push(currentRecord);
                      currentRecord = [];
                      currentField = "";
                  } else {
                      currentField += c;
                  }
              }
          }
          if (inQuotes) {
             throw new Error("Unterminated quote");
          }
          if (currentField !== "" || currentRecord.length > 0) {
              currentRecord.push(currentField);
              records.push(currentRecord);
          }
          if (records.length > 0 && records[records.length - 1]!.length === 1 && records[records.length - 1]![0] === "") {
              records.pop();
          }
          return records;
      };

      const records = parseCsvStrict(csvText);

      if (jobDetail.rows !== undefined) {
          if (jobDetail.rows.length === 0) {
              expect(records.length).toBeLessThanOrEqual(1);
          } else {
              expect(records.length).toBeGreaterThan(0);
              const headers = records[0]!;
              
              const headerSet = new Set(headers);
              expect(headerSet.size).toBe(headers.length);
              expect(headers).toEqual(expectedColumns);
              expect(records.length - 1).toBe(jobDetail.rows.length);
              
              for (let i = 0; i < jobDetail.rows.length; i++) {
                  const expectedRow = jobDetail.rows[i]!;
                  const actualRow = records[i + 1]!;
                  
                  expect(actualRow.length).toBe(headers.length);
                  
                  for (let colIdx = 0; colIdx < expectedColumns.length; colIdx++) {
                      const col = expectedColumns[colIdx]!;
                      const actualVal = actualRow[colIdx]!;
                      const expectedVal = escapeCellForCsv(expectedRow[col]);
                      expect(actualVal).toBe(expectedVal);
                  }
              }
          }
      } else {
          throw new Error("Missing rows evidence in metadata");
      }
  } else if (contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes as any);
      expect(workbook.worksheets.length).toBeGreaterThan(0);

      const worksheet = workbook.worksheets[0]!;

      if (jobDetail.rows !== undefined) {
          if (jobDetail.rows.length === 0) {
              expect(worksheet.rowCount).toBeLessThanOrEqual(1);
          } else {
              expect(worksheet.rowCount).toBe(jobDetail.rows.length + 1);
              const headerRow = worksheet.getRow(1);

              const sheetColumns: Record<string, number> = {};
              let headerCount = 0;
              headerRow.eachCell((cell, colNumber) => {
                  const val = String(cell.value);
                  expect(sheetColumns).not.toHaveProperty(val);
                  sheetColumns[val] = colNumber;
                  headerCount++;
              });
              
              expect(headerCount).toBe(expectedColumns.length);

              for (const col of expectedColumns) {
                  expect(sheetColumns[col]).toBeGreaterThan(0);
              }

              for (let i = 0; i < jobDetail.rows.length; i++) {
                  const row = jobDetail.rows[i]!;
                  const sheetRow = worksheet.getRow(i + 2);
                  for (const col of expectedColumns) {
                      const colNumber = sheetColumns[col]!;
                      const cellValue = sheetRow.getCell(colNumber).value;
                      let actualVal = "";
                      if (cellValue !== null && cellValue !== undefined) {
                          if (typeof cellValue === "object" && "text" in cellValue) {
                              actualVal = String(cellValue.text);
                          } else if (typeof cellValue === "object" && "formula" in cellValue && "result" in cellValue) {
                              actualVal = String(cellValue.result);
                          } else {
                              actualVal = String(cellValue);
                          }
                      }
                      
                      const expectedVal = row[col] === null || row[col] === undefined
                          ? ""
                          : (typeof row[col] === "object" ? JSON.stringify(row[col]) : String(row[col]));

                      expect(actualVal).toBe(expectedVal);
                  }
              }
          }
      } else {
          throw new Error("Missing rows evidence in metadata");
      }
  }
}
