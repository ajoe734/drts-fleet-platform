import { expect, type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";

function expectCandidateRevision(headers: Headers, label: string) {
  const candidateSha = process.env.DRTS_CANDIDATE_SHA?.trim();
  if (candidateSha) {
    const headerValue = headers.get("x-drts-candidate-sha");
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
  intentStatus: number;
  putStatus: number;
  putScanState: string;
  confirmStatus: number;
  confirmSubmissionId?: string;
  confirmFleetPartnerId?: string;
  confirmDocumentType?: string;
  downloadStatus: number;
  readbackSha256: string;
  readbackFileSize: number;
  readbackContentType: string;
  transientHistory: string[];
};

export async function uploadOperationalDocument(
  requestContext: APIRequestContext, // Keeping this parameter for backward compatibility if needed by the signature, but we'll use fetch
  origin: string,
  intentPath: string,
  intentBody: Record<string, unknown>,
  confirmPath: string,
  confirmBody: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<LifecycleEvidence> {
  const pdfBytes = Buffer.from(
    "%PDF-1.4\n" +
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>\nendobj\n" +
    "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n" +
    "trailer\n<< /Size 4 /Root 1 0 R >>\n" +
    "startxref\n184\n%%EOF\n"
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

  // Bounded Fetch implementation
  async function boundedFetch(url: string, options: RequestInit): Promise<{ status: number; headers: Headers; body: Buffer }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error("Timeout")), getRemainingTime());
    try {
      const res = await fetch(url, { ...options, signal: controller.signal, redirect: "manual" });
      const chunks: Uint8Array[] = [];
      let received = 0;
      if (res.body) {
        const reader = res.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            received += value.length;
            if (received > 1024 * 1024) {
              reader.cancel();
              throw new Error("Response exceeded bounded limit of 1MB");
            }
            chunks.push(value);
          }
        }
      }
      return { status: res.status, headers: res.headers, body: Buffer.concat(chunks) };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // 1. Intent Validation (R3)
  const parsedIntentUrl = new URL(intentPath, origin);
  expect(parsedIntentUrl.origin, "intent URL must be same origin").toBe(new URL(origin).origin);
  expect(parsedIntentUrl.username, "intent URL must not contain credentials").toBe("");
  expect(parsedIntentUrl.password, "intent URL must not contain credentials").toBe("");
  expect(Array.from(parsedIntentUrl.searchParams.keys()).length, "intent URL must not contain extra queries").toBe(0);
  expect(parsedIntentUrl.hash, "intent URL must not contain fragment").toBe("");

  let intentPathname = parsedIntentUrl.pathname;
  if (intentPathname.startsWith('/api/')) {
    intentPathname = intentPathname.replace(/^\/api\//, '/control-plane-proxy/');
  }
  const parentPrefixMatch = intentPathname.match(/^(.*\/supply-submissions\/([^/]+))\/documents\/(?:intent|upload-url)$/);
  expect(parentPrefixMatch, "intentPath must match parent prefix shape (supply-submissions/...).").toBeTruthy();
  const parentPrefix = parentPrefixMatch![1] as string;
  const expectedSubmissionId = parentPrefixMatch![2] as string;

  // R4: Authoritative Fleet readback
  const readbackResponse = await boundedFetch(new URL(parentPrefix, origin).toString(), {
    method: "GET",
    headers: { Authorization: headers["Authorization"] || headers["authorization"] || "" }
  });
  checkDeadline();
  expect(readbackResponse.status, `readback submission ${parentPrefix}`).toBe(200);
  const readbackData = JSON.parse(readbackResponse.body.toString("utf8")) as any;
  const authoritativeFleetId = readbackData?.data?.submission?.fleet_id || readbackData?.data?.submission?.fleet_partner_id || readbackData?.data?.fleet_id || readbackData?.data?.fleet_partner_id;
  expect(authoritativeFleetId, "authoritative expected fleet").toBeTruthy();

  // 1. Intent execution
  const intentResponse = await boundedFetch(parsedIntentUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      ...intentBody,
      contentType,
      originalFileName: "harmless-upload.pdf",
    }),
  });
  checkDeadline();
  expect(
    [200, 201].includes(intentResponse.status),
    `intent request to ${intentPath} must be 200 or 201, got ${intentResponse.status}`
  ).toBeTruthy();
  expectCandidateRevision(intentResponse.headers, `intent request to ${intentPath}`);

  const intentText = intentResponse.body.toString("utf8");
  const intentData = JSON.parse(intentText) as {
    data: { object_key: string; upload_url: string; method: string; headers: Record<string, string>; submission_id?: string; fleet_partner_id?: string; };
  };

  const objectKey = intentData.data.object_key;
  const rawUploadUrl = intentData.data.upload_url;
  const uploadMethod = intentData.data.method;
  const uploadHeaders = intentData.data.headers;

  expect(objectKey, "object_key from intent").toBeTruthy();
  expect(objectKey.includes(authoritativeFleetId), "object_key must be scoped to authoritative fleet").toBeTruthy();
  expect(objectKey.includes(expectedSubmissionId), "object_key must be scoped to authoritative submission").toBeTruthy();
  
  if (intentData.data.submission_id) {
    expect(intentData.data.submission_id, "intent submission_id must match").toBe(expectedSubmissionId);
  }

  expect(rawUploadUrl, "upload_url from intent").toBeTruthy();
  expect(uploadMethod, "upload method must be exactly provided").toBe("PUT");
  expect(uploadHeaders, "upload headers must be exactly provided").toBeTruthy();
  expect(uploadHeaders['Content-Type'] || uploadHeaders['content-type'], "must contain application/octet-stream").toBe("application/octet-stream");

  const parsedUploadUrl = new URL(rawUploadUrl, origin);
  expect(parsedUploadUrl.origin, "upload URL must be same origin").toBe(new URL(origin).origin);
  expect(parsedUploadUrl.username, "upload URL must not contain credentials").toBe("");
  expect(parsedUploadUrl.password, "upload URL must not contain credentials").toBe("");

  if (parsedUploadUrl.pathname.startsWith('/api/')) {
    parsedUploadUrl.pathname = parsedUploadUrl.pathname.replace(/^\/api\//, '/control-plane-proxy/');
  }
  expect(parsedUploadUrl.pathname, "upload URL pathname must match parent scope").toBe(`${parentPrefix}/documents/content`);
  expect(
    parsedUploadUrl.searchParams.get("objectKey") || parsedUploadUrl.searchParams.get("object_key"),
    "upload URL must bind objectKey"
  ).toBe(objectKey);
  expect(Array.from(parsedUploadUrl.searchParams.keys()).length, "upload URL must not contain extra queries").toBe(1);
  expect(parsedUploadUrl.hash, "upload URL must not contain fragment").toBe("");

  const uploadUrl = parsedUploadUrl.toString();

  // 2. PUT exact bytes
  let scanReceiptOk = false;
  let putAttempts = 0;
  let putStatus = 0;
  let putScanState = "";
  const transientHistory: string[] = [];
  const maxAttempts = 15;

  while (!scanReceiptOk && putAttempts < maxAttempts && getRemainingTime() > 0) {
    putAttempts++;
    const putResponse = await boundedFetch(uploadUrl, {
      method: "PUT",
      headers: {
        ...uploadHeaders,
        Authorization: headers["Authorization"] || headers["authorization"] || "",
      },
      body: pdfBytes,
    });
    checkDeadline();

    putStatus = putResponse.status;
    if (putResponse.status === 503) {
      const errText = putResponse.body.toString("utf8");
      const errBody = JSON.parse(errText || "{}");
      checkDeadline();
      expectCandidateRevision(putResponse.headers, `PUT exact bytes transient error to ${uploadUrl}`);
      transientHistory.push(errBody?.error?.code || "unknown_503");
      if (errBody?.error?.code === "DOCUMENT_SCANNER_UNAVAILABLE") {
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000, getRemainingTime())));
        checkDeadline();
        continue;
      }
    }

    expect(
      [200, 201].includes(putResponse.status),
      `PUT exact bytes to ${uploadUrl} must be 200 or 201, got ${putResponse.status}`
    ).toBeTruthy();
    expectCandidateRevision(putResponse.headers, `PUT exact bytes to ${uploadUrl}`);

    const putText = putResponse.body.toString("utf8");
    const putData = JSON.parse(putText) as {
      data?: { checksum_sha256?: string; file_size?: number; scan_state?: string }
    };
    checkDeadline();
    expect(putData?.data?.checksum_sha256, "PUT checksum").toBe(sha256);
    expect(putData?.data?.file_size, "PUT file_size").toBe(fileSize);
    expect(putData?.data?.scan_state, "PUT scan_state").toBe("clean");
    putScanState = putData?.data?.scan_state || "";
    scanReceiptOk = true;
  }
  expect(scanReceiptOk, "Scanner must eventually process the bytes and return clean receipt within deadline").toBeTruthy();

  // 3. Confirm (R3 validate first)
  const parsedConfirmUrl = new URL(confirmPath, origin);
  expect(parsedConfirmUrl.origin, "confirm URL must be same origin").toBe(new URL(origin).origin);
  expect(parsedConfirmUrl.username, "confirm URL must not contain credentials").toBe("");
  expect(parsedConfirmUrl.password, "confirm URL must not contain credentials").toBe("");
  expect(Array.from(parsedConfirmUrl.searchParams.keys()).length, "confirm URL must not contain extra queries").toBe(0);
  expect(parsedConfirmUrl.hash, "confirm URL must not contain fragment").toBe("");

  let confirmPathname = parsedConfirmUrl.pathname;
  if (confirmPathname.startsWith('/api/')) {
    confirmPathname = confirmPathname.replace(/^\/api\//, '/control-plane-proxy/');
  }
  expect(confirmPathname, "confirm URL pathname must match parent scope").toBe(`${parentPrefix}/documents/confirm`);

  const finalConfirmBody = {
    ...confirmBody,
    objectKey,
    contentType,
    fileSize,
    checksumSha256: sha256,
    originalFileName: "harmless-upload.pdf",
  };

  const confirmResponse = await boundedFetch(parsedConfirmUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(finalConfirmBody),
  });
  checkDeadline();
  expect(
    [200, 201].includes(confirmResponse.status),
    `confirm request to ${confirmPath} must be 200 or 201, got ${confirmResponse.status}`
  ).toBeTruthy();
  expectCandidateRevision(confirmResponse.headers, `confirm request to ${confirmPath}`);

  const confirmText = confirmResponse.body.toString("utf8");
  const confirmData = JSON.parse(confirmText) as {
    data?: { document_id?: string; documentId?: string; file_object_key?: string; fileObjectKey?: string; checksum_sha256?: string; checksumSha256?: string; file_size?: number; fileSize?: number; content_type?: string; contentType?: string; submission_id?: string; submissionId?: string; fleet_partner_id?: string; fleetPartnerId?: string; document_type?: string; documentType?: string }
  };
  checkDeadline();

  const documentId = confirmData?.data?.document_id || confirmData?.data?.documentId;
  const confirmObjKey = confirmData?.data?.file_object_key || confirmData?.data?.fileObjectKey;
  const confirmHash = confirmData?.data?.checksum_sha256 || confirmData?.data?.checksumSha256;
  const confirmSize = confirmData?.data?.file_size || confirmData?.data?.fileSize;
  const confirmType = confirmData?.data?.content_type || confirmData?.data?.contentType;
  const confirmSubmissionId = confirmData?.data?.submission_id || confirmData?.data?.submissionId;
  const confirmFleetId = confirmData?.data?.fleet_partner_id || confirmData?.data?.fleetPartnerId;
  const confirmDocType = confirmData?.data?.document_type || confirmData?.data?.documentType;

  expect(documentId, "confirm must return documentId").toBeTruthy();
  expect(documentId, "documentId must be a strict single segment").toMatch(/^[-a-zA-Z0-9_]+$/);
  expect(confirmObjKey, "confirm object key metadata").toBe(objectKey);
  expect(confirmHash, "confirm hash metadata").toBe(sha256);
  expect(confirmSize, "confirm size metadata").toBe(fileSize);
  expect(confirmType, "confirm mime metadata").toBe(contentType);
  expect(...(confirmSubmissionId ? { confirmSubmissionId } : {}), "confirm submission_id metadata must match URL").toBe(expectedSubmissionId);
  expect(confirmDocType, "confirm document_type metadata must match intent body").toBe(intentBody.documentType || confirmBody.documentType);
  
  // R4: Bind authoritative fleet
  expect(confirmFleetId, "confirm fleet_partner_id must match authoritative readback").toBe(authoritativeFleetId);

  // 4. Download READBACK
  const downloadPath = `${parentPrefix}/documents/${documentId}/download`;
  const parsedDownloadUrl = new URL(downloadPath, origin);
  if (parsedDownloadUrl.pathname.startsWith('/api/')) {
    parsedDownloadUrl.pathname = parsedDownloadUrl.pathname.replace(/^\/api\//, '/control-plane-proxy/');
  }

  const downloadResponse = await boundedFetch(parsedDownloadUrl.toString(), {
    method: "GET",
    headers: { Authorization: headers["Authorization"] || headers["authorization"] || "" },
  });
  checkDeadline();
  expect(downloadResponse.status, `GET readback from ${parsedDownloadUrl.toString()}`).toBe(200);
  expectCandidateRevision(downloadResponse.headers, `GET readback from ${parsedDownloadUrl.toString()}`);

  const readbackBuffer = downloadResponse.body;
  const readbackSha256 = createHash("sha256").update(readbackBuffer).digest("hex");
  expect(readbackSha256, "readback checksum").toBe(sha256);
  expect(readbackBuffer.length, "readback file_size").toBe(fileSize);
  
  // R4 strict MIME gap
  const returnedType = downloadResponse.headers.get("content-type") || "";
  expect((returnedType.split(";")[0] || "").trim().toLowerCase(), "readback content_type exactly application/pdf").toBe("application/pdf");

  return {
    objectKey,
    sha256,
    fileSize,
    intentAttempts: 1,
    putAttempts,
    confirmAttempts: 1,
    downloadAttempts: 1,
    documentId: documentId!,
    intentStatus: intentResponse.status,
    putStatus,
    putScanState,
    confirmStatus: confirmResponse.status,
    ...(confirmSubmissionId ? { confirmSubmissionId } : {}),
    ...(confirmFleetId ? { confirmFleetPartnerId: confirmFleetId } : {}),
    ...(confirmDocType ? { confirmDocumentType: confirmDocType } : {}),
    downloadStatus: downloadResponse.status,
    readbackSha256,
    readbackFileSize: readbackBuffer.length,
    readbackContentType: returnedType,
    transientHistory,
  };
}
