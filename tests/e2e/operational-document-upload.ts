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

export async function uploadOperationalDocument(
  request: APIRequestContext,
  origin: string,
  intentPath: string,
  intentBody: Record<string, unknown>,
  confirmPath: string,
  confirmBody: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ objectKey: string; sha256: string; fileSize: number }> {
  const pdfBytes = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>\nendobj\ntrailer\n<< /Size 4 /Root 1 0 R >>\n%%EOF\n"
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
      timeout: 10000,
    },
  );
  expect(
    intentResponse.status(),
    `intent request to ${intentPath}`,
  ).toBeLessThan(400);
  expectCandidateRevision(intentResponse.headers(), `intent request to ${intentPath}`);

  const intentData = (await intentResponse.json()) as {
    data: { object_key: string; upload_url: string; method?: string; headers?: Record<string, string> };
  };
  const objectKey = intentData.data.object_key;
  const rawUploadUrl = intentData.data.upload_url;
  const uploadMethod = intentData.data.method || "PUT";
  const uploadHeaders = intentData.data.headers || { "Content-Type": contentType };

  expect(objectKey, "object_key from intent").toBeTruthy();
  expect(rawUploadUrl, "upload_url from intent").toBeTruthy();
  expect(uploadMethod, "upload method must be PUT").toBe("PUT");

  const parsedUploadUrl = new URL(rawUploadUrl, origin);
  expect(parsedUploadUrl.origin, "upload URL must be same origin").toBe(new URL(origin).origin);
  expect(parsedUploadUrl.username, "upload URL must not contain credentials").toBe("");
  expect(parsedUploadUrl.password, "upload URL must not contain credentials").toBe("");

  if (parsedUploadUrl.pathname.startsWith('/api/')) {
    parsedUploadUrl.pathname = parsedUploadUrl.pathname.replace(/^\/api\//, '/control-plane-proxy/');
  }
  const uploadUrl = parsedUploadUrl.toString();

  // 2. PUT exact bytes
  let scanReceiptOk = false;
  let attempts = 0;
  const maxAttempts = 15;
  const startTime = Date.now();
  const deadline = startTime + 30000;

  while (!scanReceiptOk && attempts < maxAttempts && Date.now() < deadline) {
    attempts++;
    const putResponse = await request.put(uploadUrl, {
      headers: {
        ...uploadHeaders,
        Authorization: headers["Authorization"] || headers["authorization"],
      },
      data: pdfBytes,
      maxRedirects: 0,
      timeout: 10000,
    });

    if (putResponse.status() === 503) {
      const errBody = await putResponse.json().catch(() => ({}));
      if (errBody?.error?.code === "DOCUMENT_SCANNER_UNAVAILABLE") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
    }
    
    expect(
      putResponse.status(),
      `PUT exact bytes to ${uploadUrl}`,
    ).toBeLessThan(400);
    expectCandidateRevision(putResponse.headers(), `PUT exact bytes to ${uploadUrl}`);
    
    const putData = await putResponse.json() as {
      data?: { checksum_sha256?: string; file_size?: number; scan_state?: string }
    };
    expect(putData?.data?.checksum_sha256, "PUT checksum").toBe(sha256);
    expect(putData?.data?.file_size, "PUT file_size").toBe(fileSize);
    expect(putData?.data?.scan_state, "PUT scan_state").toBe("clean");
    scanReceiptOk = true;
  }
  expect(
    scanReceiptOk,
    "Scanner must eventually process the bytes and return clean receipt",
  ).toBeTruthy();

  // READBACK
  const readbackResponse = await request.get(uploadUrl, {
    headers: {
      Authorization: headers["Authorization"] || headers["authorization"],
    },
    maxRedirects: 0,
    timeout: 10000,
  });
  expect(readbackResponse.status(), `GET readback from ${uploadUrl}`).toBeLessThan(400);
  expectCandidateRevision(readbackResponse.headers(), `GET readback from ${uploadUrl}`);
  
  const readbackBuffer = await readbackResponse.body();
  const readbackSha256 = createHash("sha256").update(readbackBuffer).digest("hex");
  expect(readbackSha256, "readback checksum").toBe(sha256);
  expect(readbackBuffer.length, "readback file_size").toBe(fileSize);
  expect(readbackResponse.headers()["content-type"], "readback content_type").toContain("application/pdf");

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
      timeout: 10000,
    },
  );
  expect(
    confirmResponse.status(),
    `confirm request to ${confirmPath}`,
  ).toBeLessThan(400);
  expectCandidateRevision(confirmResponse.headers(), `confirm request to ${confirmPath}`);

  return { objectKey, sha256, fileSize };
}

