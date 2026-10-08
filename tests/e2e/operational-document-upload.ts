import { expect, type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";

function expectCandidateRevision(headers: Record<string, string>, label: string) {
  const candidateSha = process.env.DRTS_CANDIDATE_SHA?.trim();
  if (candidateSha) {
    const headerValue = headers["x-drts-candidate-sha"] || headers["X-Drts-Candidate-Sha"];
    expect(
      headerValue,
      `${label} must report the deployed immutable candidate SHA`
    ).toBe(candidateSha);
  }
}

export type LifecycleEvidence = {
  objectKey: string;
  sha256: string;
  fileSize: number;
  intentAttempts: number;
  putAttempts: number;
  confirmAttempts: number;
  downloadAttempts: number;
  documentId?: string;
};

export async function uploadOperationalDocument(
  request: APIRequestContext,
  origin: string,
  intentPath: string,
  intentBody: Record<string, unknown>,
  confirmPath: string,
  confirmBody: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<LifecycleEvidence> {
  // A completely harmless, well-formed valid PDF with xref and startxref for strict parsers
  const pdfBytes = Buffer.from(
    "%PDF-1.4\n" +
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>\nendobj\n" +
    "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000122 00000 n \n" +
    "trailer\n<< /Size 4 /Root 1 0 R >>\n" +
    "startxref\n200\n%%EOF\n"
  );
  const sha256 = createHash("sha256").update(pdfBytes).digest("hex");
  const fileSize = pdfBytes.length;
  const contentType = "application/pdf";

  const totalBudget = 30000;
  const startTime = Date.now();
  function getRemainingTime(): number {
    return Math.max(1, totalBudget - (Date.now() - startTime));
  }
  function checkDeadline() {
    if (Date.now() - startTime > totalBudget) {
      throw new Error("Operational document upload lifecycle exceeded time budget");
    }
  }

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
      timeout: getRemainingTime(),
    },
  );
  checkDeadline();
  expect(
    [200, 201].includes(intentResponse.status()),
    `intent request to ${intentPath} must be 200 or 201, got ${intentResponse.status()}`
  ).toBeTruthy();
  expectCandidateRevision(intentResponse.headers(), `intent request to ${intentPath}`);

  const intentData = (await intentResponse.json()) as {
    data: { object_key: string; upload_url: string; method: string; headers: Record<string, string> };
  };
  checkDeadline();

  const objectKey = intentData.data.object_key;
  const rawUploadUrl = intentData.data.upload_url;
  const uploadMethod = intentData.data.method;
  const uploadHeaders = intentData.data.headers;

  expect(objectKey, "object_key from intent").toBeTruthy();
  expect(rawUploadUrl, "upload_url from intent").toBeTruthy();
  expect(uploadMethod, "upload method must be exactly provided").toBe("PUT");
  expect(uploadHeaders, "upload headers must be exactly provided").toBeTruthy();

  const parsedUploadUrl = new URL(rawUploadUrl, origin);
  expect(parsedUploadUrl.origin, "upload URL must be same origin").toBe(new URL(origin).origin);
  expect(parsedUploadUrl.username, "upload URL must not contain credentials").toBe("");
  expect(parsedUploadUrl.password, "upload URL must not contain credentials").toBe("");

  // Bind parent path: upload URL must be the content endpoint for the exact parent
  const parentPrefixMatch = intentPath.match(/^(.*)\/documents\/intent$/);
  expect(parentPrefixMatch, "intentPath must match parent prefix shape").toBeTruthy();
  const parentPrefix = parentPrefixMatch![1];
  expect(
    parsedUploadUrl.pathname,
    "upload URL pathname must match parent scope"
  ).toBe(`${parentPrefix}/documents/content`);

  // Bound query: must have exactly the objectKey parameter
  expect(
    parsedUploadUrl.searchParams.get("objectKey") || parsedUploadUrl.searchParams.get("object_key"),
    "upload URL must bind objectKey"
  ).toBe(objectKey);
  expect(
    Array.from(parsedUploadUrl.searchParams.keys()).length,
    "upload URL must not contain extra queries"
  ).toBe(1);
  expect(parsedUploadUrl.hash, "upload URL must not contain fragment").toBe("");

  if (parsedUploadUrl.pathname.startsWith('/api/')) {
    parsedUploadUrl.pathname = parsedUploadUrl.pathname.replace(/^\/api\//, '/control-plane-proxy/');
  }
  const uploadUrl = parsedUploadUrl.toString();

  // 2. PUT exact bytes
  let scanReceiptOk = false;
  let putAttempts = 0;
  const maxAttempts = 15;

  while (!scanReceiptOk && putAttempts < maxAttempts && getRemainingTime() > 0) {
    putAttempts++;
    const putResponse = await request.put(uploadUrl, {
      headers: {
        ...uploadHeaders,
        Authorization: headers["Authorization"] || headers["authorization"] || "",
      },
      data: pdfBytes,
      maxRedirects: 0,
      timeout: getRemainingTime(),
    });
    checkDeadline();

    if (putResponse.status() === 503) {
      const errBody = await putResponse.json().catch(() => ({}));
      checkDeadline();
      expectCandidateRevision(putResponse.headers(), `PUT exact bytes transient error to ${uploadUrl}`);
      if (errBody?.error?.code === "DOCUMENT_SCANNER_UNAVAILABLE") {
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000, getRemainingTime())));
        checkDeadline();
        continue;
      }
    }

    expect(
      [200, 201].includes(putResponse.status()),
      `PUT exact bytes to ${uploadUrl} must be 200 or 201, got ${putResponse.status()}`
    ).toBeTruthy();
    expectCandidateRevision(putResponse.headers(), `PUT exact bytes to ${uploadUrl}`);

    const putData = await putResponse.json() as {
      data?: { checksum_sha256?: string; file_size?: number; scan_state?: string }
    };
    checkDeadline();
    expect(putData?.data?.checksum_sha256, "PUT checksum").toBe(sha256);
    expect(putData?.data?.file_size, "PUT file_size").toBe(fileSize);
    expect(putData?.data?.scan_state, "PUT scan_state").toBe("clean");
    scanReceiptOk = true;
  }
  expect(
    scanReceiptOk,
    "Scanner must eventually process the bytes and return clean receipt within deadline"
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
      timeout: getRemainingTime(),
    },
  );
  checkDeadline();
  expect(
    [200, 201].includes(confirmResponse.status()),
    `confirm request to ${confirmPath} must be 200 or 201, got ${confirmResponse.status()}`
  ).toBeTruthy();
  expectCandidateRevision(confirmResponse.headers(), `confirm request to ${confirmPath}`);

  const confirmData = await confirmResponse.json() as {
    data?: { document_id?: string; documentId?: string; file_object_key?: string; fileObjectKey?: string; checksum_sha256?: string; checksumSha256?: string; file_size?: number; fileSize?: number; content_type?: string; contentType?: string }
  };
  checkDeadline();

  const documentId = confirmData?.data?.document_id || confirmData?.data?.documentId;
  const confirmObjKey = confirmData?.data?.file_object_key || confirmData?.data?.fileObjectKey;
  const confirmHash = confirmData?.data?.checksum_sha256 || confirmData?.data?.checksumSha256;
  const confirmSize = confirmData?.data?.file_size || confirmData?.data?.fileSize;
  const confirmType = confirmData?.data?.content_type || confirmData?.data?.contentType;

  expect(documentId, "confirm must return documentId").toBeTruthy();
  expect(confirmObjKey, "confirm object key metadata").toBe(objectKey);
  expect(confirmHash, "confirm hash metadata").toBe(sha256);
  expect(confirmSize, "confirm size metadata").toBe(fileSize);
  expect(confirmType, "confirm mime metadata").toBe(contentType);

  // 4. Download READBACK (using proper route after confirm)
  const downloadPath = `${parentPrefix}/documents/${documentId}/download`;
  const parsedDownloadUrl = new URL(downloadPath, origin);
  if (parsedDownloadUrl.pathname.startsWith('/api/')) {
    parsedDownloadUrl.pathname = parsedDownloadUrl.pathname.replace(/^\/api\//, '/control-plane-proxy/');
  }

  const downloadResponse = await request.get(parsedDownloadUrl.toString(), {
    headers: {
      Authorization: headers["Authorization"] || headers["authorization"] || "",
    },
    maxRedirects: 0,
    timeout: getRemainingTime(),
  });
  checkDeadline();
  expect(
    downloadResponse.status(),
    `GET readback from ${parsedDownloadUrl.toString()}`
  ).toBe(200);
  expectCandidateRevision(downloadResponse.headers(), `GET readback from ${parsedDownloadUrl.toString()}`);

  const readbackBuffer = await downloadResponse.body();
  checkDeadline();
  const readbackSha256 = createHash("sha256").update(readbackBuffer).digest("hex");
  expect(readbackSha256, "readback checksum").toBe(sha256);
  expect(readbackBuffer.length, "readback file_size").toBe(fileSize);
  expect(downloadResponse.headers()["content-type"], "readback content_type").toContain("application/pdf");

  return {
    objectKey,
    sha256,
    fileSize,
    intentAttempts: 1,
    putAttempts,
    confirmAttempts: 1,
    downloadAttempts: 1,
    documentId: documentId!,
  };
}
