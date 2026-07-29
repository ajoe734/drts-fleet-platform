import type {
  CertificateArtifact,
  CertificateSupportView,
} from "./certificate-support.types";

export function renderCertificateArtifact(
  certificate: CertificateSupportView,
  format: "html" | "pdf",
): CertificateArtifact {
  return format === "html"
    ? {
        buffer: Buffer.from(renderHtml(certificate), "utf8"),
        contentType: "text/html; charset=utf-8",
        fileName: `${safeFileName(certificate.certificateNo)}.html`,
      }
    : {
        buffer: renderPdf(certificate),
        contentType: "application/pdf",
        fileName: `${safeFileName(certificate.certificateNo)}.pdf`,
      };
}

function renderHtml(certificate: CertificateSupportView) {
  const rows = certificateRows(certificate)
    .map(
      ([label, value]) =>
        `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(certificate.certificateNo)} 電子乘車證明</title>
  <style>
    body{margin:0;background:#f4f1e8;color:#173e3a;font-family:"Noto Sans TC",sans-serif}
    main{max-width:760px;margin:32px auto;padding:28px;background:#fff;border:1px solid #cbd9d4;border-radius:16px}
    h1{margin:0 0 6px;font-size:24px}p{color:#58706c}table{width:100%;border-collapse:collapse}
    th,td{padding:11px 8px;border-bottom:1px solid #e1e8e4;text-align:left;vertical-align:top}
    th{width:36%;color:#49635f}footer{margin-top:20px;font-size:12px;color:#667a76}
  </style>
</head>
<body>
  <main>
    <h1>電子乘車證明</h1>
    <p>${escapeHtml(certificate.certificateNo)} / ${escapeHtml(certificate.certificateVersion ?? "未取得")}</p>
    <table>${rows}</table>
    <footer>本文件由已保存的 canonical 電子乘車證明紀錄產生。</footer>
  </main>
</body>
</html>`;
}

function renderPdf(certificate: CertificateSupportView) {
  const lines = [
    "電子乘車證明 / Electronic Ride Certificate",
    `${certificate.certificateNo} / ${certificate.certificateVersion ?? "未取得"}`,
    ...certificateRows(certificate).map(
      ([label, value]) => `${label}: ${value}`,
    ),
    "本文件由已保存的 canonical 電子乘車證明紀錄產生。",
  ];
  const content = [
    "BT",
    "/F1 10 Tf",
    "44 800 Td",
    "15 TL",
    ...lines.flatMap((line) => [`<${utf16Hex(line)}> Tj`, "T*"]),
    "ET",
  ].join("\n");
  const metadata = `<?xpacket begin="\uFEFF"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description xmlns:drts="https://drts.example/schema/certificate/1.0/"
      drts:certificateId="${escapeXml(certificate.certificateId)}"
      drts:orderId="${escapeXml(certificate.orderId)}"
      drts:tripId="${escapeXml(certificate.tripId ?? "")}"
      drts:routeSummary="${escapeXml(certificate.routeSummary ?? "")}" />
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R /Metadata 7 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type0 /BaseFont /MSung-Light /Encoding /UniCNS-UTF16-H /DescendantFonts [5 0 R] >>",
    "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /MSung-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (CNS1) /Supplement 7 >> >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
    `<< /Type /Metadata /Subtype /XML /Length ${Buffer.byteLength(metadata, "utf8")} >>\nstream\n${metadata}\nendstream`,
  ];
  const chunks: Buffer[] = [
    Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "binary"),
  ];
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(totalLength(chunks));
    chunks.push(Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, "utf8"));
  }
  const xrefOffset = totalLength(chunks);
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    `startxref\n${xrefOffset}\n%%EOF\n`,
  ].join("\n");
  chunks.push(Buffer.from(xref, "ascii"));
  return Buffer.concat(chunks);
}

function certificateRows(
  certificate: CertificateSupportView,
): Array<[string, string]> {
  return [
    ["訂單 / 行程", `${certificate.orderId} / ${value(certificate.tripId)}`],
    ["車牌", value(certificate.plateNo)],
    ["上車時間", value(certificate.pickupAt)],
    ["下車時間", value(certificate.dropoffAt)],
    ["行駛時間（秒）", value(certificate.travelDurationSeconds)],
    ["路線", value(certificate.routeSummary)],
    ["里程（公尺）", value(certificate.distanceMeters)],
    ["車資", money(certificate.fareMinor, certificate.currency)],
    ["通行費", money(certificate.tollMinor, certificate.currency)],
    ["客服電話", value(certificate.consumerServicePhone)],
    ["主管機關申訴電話", value(certificate.authorityComplaintPhone)],
    ["簽發時間", certificate.issuedAt],
  ];
}

function value(input: string | number | null) {
  return input === null || input === "" ? "未取得" : String(input);
}

function money(input: number | null, currency: string) {
  return input === null ? "未取得" : `${currency} ${(input / 100).toFixed(0)}`;
}

function utf16Hex(value: string) {
  const buffer = Buffer.alloc(2 + value.length * 2);
  buffer.writeUInt16BE(0xfeff, 0);
  for (let index = 0; index < value.length; index += 1) {
    buffer.writeUInt16BE(value.charCodeAt(index), 2 + index * 2);
  }
  return buffer.toString("hex").toUpperCase();
}

function totalLength(buffers: Buffer[]) {
  return buffers.reduce((sum, buffer) => sum + buffer.length, 0);
}

function safeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value: string) {
  return escapeHtml(value);
}
