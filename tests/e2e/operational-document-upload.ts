import { expect, type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";

export async function uploadOperationalDocument(
  request: APIRequestContext,
  origin: string,
  intentPath: string,
  intentBody: Record<string, unknown>,
  confirmPath: string,
  confirmBody: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ objectKey: string; sha256: string; fileSize: number }> {
  // We'll read a harmless PDF document
  const pdfBytes = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<<\n/Title (Harmless Operational Upload)\n/Creator (Operational Test Harness)\n>>\nendobj\ntrailer\n<<\n/Size 2\n/Root 1 0 R\n>>\n%%EOF\n",
  );
  const sha256 = createHash("sha256").update(pdfBytes).digest("hex");
  const fileSize = pdfBytes.length;
  const contentType = "application/pdf";

  // 1. Intent
  const intentResponse = await request.post(
    new URL(intentPath, origin).toString(),
    {
      headers: { "Content-Type": "application/json", ...headers },
      data: {
        ...intentBody,
        contentType,
        originalFileName: "harmless-upload.pdf",
      },
      maxRedirects: 0,
    },
  );
  expect(
    intentResponse.status(),
    `intent request to ${intentPath}`,
  ).toBeLessThan(400);
  const intentData = (await intentResponse.json()) as {
    data: { object_key: string; upload_url: string };
  };
  const objectKey = intentData.data.object_key;
  const uploadUrl = intentData.data.upload_url;

  expect(objectKey, "object_key from intent").toBeTruthy();
  expect(uploadUrl, "upload_url from intent").toBeTruthy();

  // 2. PUT exact bytes
  let scanReceiptOk = false;
  let attempts = 0;
  const maxAttempts = 15; // Give it some time if cold start
  while (!scanReceiptOk && attempts < maxAttempts) {
    attempts++;
    const putResponse = await request.put(
      new URL(uploadUrl, origin).toString(),
      {
        headers: {
          "Content-Type": contentType,
          ...headers,
        },
        data: pdfBytes,
        maxRedirects: 0,
      },
    );

    if (putResponse.status() === 503) {
      // DOCUMENT_SCANNER_UNAVAILABLE
      const errBody = await putResponse.json().catch(() => ({}));
      if ((errBody as any).code === "DOCUMENT_SCANNER_UNAVAILABLE") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
    }
    expect(
      putResponse.status(),
      `PUT exact bytes to ${uploadUrl}`,
    ).toBeLessThan(400);
    scanReceiptOk = true;
  }
  expect(
    scanReceiptOk,
    "Scanner must eventually process the bytes",
  ).toBeTruthy();

  // 3. Confirm
  const finalConfirmBody = {
    ...confirmBody,
    objectKey,
    contentType,
    fileSize,
    checksumSha256: sha256,
    originalFileName: "harmless-upload.pdf",
  };
  const confirmResponse = await request.post(
    new URL(confirmPath, origin).toString(),
    {
      headers: { "Content-Type": "application/json", ...headers },
      data: finalConfirmBody,
      maxRedirects: 0,
    },
  );
  expect(
    confirmResponse.status(),
    `confirm request to ${confirmPath}`,
  ).toBeLessThan(400);

  return { objectKey, sha256, fileSize };
}
