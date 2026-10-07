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
  bytes: Buffer,
) {
  const normalizedContentType = contentType.toLowerCase().split(";")[0]!.trim();
  let expectedFormat = "csv";
  if (normalizedContentType === "application/pdf") expectedFormat = "pdf";
  else if (
    normalizedContentType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    expectedFormat = "xlsx";
  else if (normalizedContentType === "text/csv") expectedFormat = "csv";
  else throw new Error(`Unsupported MIME type: ${contentType}`);
  expect(jobDetail.format).toBe(expectedFormat);
  if (!jobDetail.rows) {
    throw new Error("Missing rows evidence in metadata");
  }

  const expectedColumns: string[] = [];
  for (const record of jobDetail.rows) {
    for (const key of Object.keys(record)) {
      if (!expectedColumns.includes(key)) expectedColumns.push(key);
    }
  }

  if (normalizedContentType === "application/pdf") {
    const { recordsToPdf } =
      await import("../../../../apps/api/src/modules/reporting-filing/report-renderers");
    const title = jobDetail.jobType
      ? `${jobDetail.jobType} — ${jobId}`
      : undefined;
    const expectedPdf = await recordsToPdf(jobDetail.rows, title);
    const expectedText = await extractPdfText(expectedPdf);
    const actualText = await extractPdfText(bytes);
    expect(actualText).toBe(expectedText);
  } else if (normalizedContentType === "text/csv") {
    const { recordsToCsv } =
      await import("../../../../apps/api/src/common/csv");
    const expectedCsv = recordsToCsv(jobDetail.rows);
    const csvText = bytes.toString("utf-8");
    expect(csvText.trim().startsWith("<html>")).toBe(false);
    expect(csvText).toBe(expectedCsv);
  } else if (
    normalizedContentType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    const ExcelJS =
      (await import("exceljs")).default || (await import("exceljs"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as any);
    expect(workbook.worksheets.length).toBe(1);

    const worksheet = workbook.worksheets[0]!;
    const expectedRows = jobDetail.rows;
    expect(worksheet.rowCount).toBe(
      expectedRows.length > 0 ? expectedRows.length + 1 : 0,
    );

    if (expectedRows.length === 0) return;

    const headerRow = worksheet.getRow(1);
    const maxHeaderCol = Math.max(expectedColumns.length, headerRow.cellCount);
    expect(maxHeaderCol).toBe(expectedColumns.length);
    for (let ci = 0; ci < expectedColumns.length; ci++) {
      const colName = expectedColumns[ci];
      const cell = headerRow.getCell(ci + 1);
      expect(String(cell.value || "")).toBe(colName);
    }

    for (let ri = 0; ri < expectedRows.length; ri++) {
      const expectedRow = expectedRows[ri]!;
      const sheetRow = worksheet.getRow(ri + 2);

      const maxRowCol = Math.max(expectedColumns.length, sheetRow.cellCount);
      for (let ci = 0; ci < maxRowCol; ci++) {
        const cellValue = sheetRow.getCell(ci + 1).value;
        let actualVal = "";
        if (cellValue !== null && cellValue !== undefined) {
          if (typeof cellValue === "object" && "text" in cellValue) {
            actualVal = String(cellValue.text);
          } else if (
            typeof cellValue === "object" &&
            "formula" in cellValue &&
            "result" in cellValue
          ) {
            actualVal = String(cellValue.result);
          } else {
            actualVal = String(cellValue);
          }
        }

        if (ci >= expectedColumns.length) {
          expect(actualVal).toBe("");
          continue;
        }

        const colName = expectedColumns[ci]!;
        const val = expectedRow[colName];
        const expectedVal =
          val === null || val === undefined
            ? ""
            : typeof val === "object"
              ? JSON.stringify(val)
              : String(val);
        expect(actualVal).toBe(expectedVal);
      }
    }
  }
}

export async function fetchAndValidateReport(
  reportPath: string,
  platformAdminOriginStrict: string,
  platformHeaders: HeadersInit,
  candidateSha: string | undefined,
  fetchFn: typeof fetch = fetch,
) {
  const reportMatch = reportPath.match(/\/reports\/([^/?]+)\/artifact/);
  const jobId = reportMatch ? reportMatch[1] : null;
  if (!jobId) throw new Error("Could not find jobId in reportPath");

  const jobUrl = `${platformAdminOriginStrict}${reportPath.replace(/\/artifact.*$/, "")}`;
  const jobRes = await fetchFn(jobUrl, { headers: platformHeaders });

  if (jobRes.status !== 200)
    throw new Error(`Report job metadata fetch failed: ${jobRes.status}`);
  if (
    candidateSha &&
    jobRes.headers.get("x-drts-candidate-sha") !== candidateSha
  ) {
    throw new Error("Mismatch x-drts-candidate-sha in metadata response");
  }

  const body = await jobRes.json();
  if (!body || typeof body !== "object") throw new Error("Invalid envelope");
  const jobDetail = body.data;
  if (!jobDetail) throw new Error("Missing data in job response envelope");
  if (!jobDetail.jobId) throw new Error("Missing jobId in job detail");
  if (jobDetail.jobId !== jobId) throw new Error("Mismatch jobId");
  if (jobDetail.status !== "completed") throw new Error("Job not completed");
  if (!jobDetail.rows) throw new Error("Missing rows in job detail");

  const artifactUrl = `${platformAdminOriginStrict}${reportPath}`;
  const artifactRes = await fetchFn(artifactUrl, { headers: platformHeaders });
  if (artifactRes.status !== 200)
    throw new Error(`Report artifact fetch failed: ${artifactRes.status}`);
  if (
    candidateSha &&
    artifactRes.headers.get("x-drts-candidate-sha") !== candidateSha
  ) {
    throw new Error("Mismatch x-drts-candidate-sha in artifact response");
  }

  const contentType = artifactRes.headers.get("content-type");
  if (!contentType || contentType.trim() === "") {
    throw new Error("Missing content-type in artifact response");
  }
  const arrayBuffer = await artifactRes.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  await validateReportArtifact(jobDetail, jobId, contentType, bytes);
}
