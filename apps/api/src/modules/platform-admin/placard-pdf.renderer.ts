import type {
  PlacardVersionRecord,
  PublicInfoVersionRecord,
} from "@drts/contracts";

export const PLACARD_PDF_LINES_PER_PAGE = 40;

export function sanitizePdfLineText(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0x20;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      out += " ";
    } else {
      out += ch;
    }
  }
  return out;
}

export function isPdfPrintableAscii(value: string): boolean {
  return /^[\x20-\x7e]*$/.test(value);
}

export function escapePdfLiteralText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export function chunkPdfLines(lines: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < lines.length; index += size) {
    chunks.push(lines.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function toHex4(codeUnit: number): string {
  return codeUnit.toString(16).toUpperCase().padStart(4, "0");
}

function encodePdfUnicodeHex(
  text: string,
  unicodeMappings: Map<number, string>,
  supplementaryCodes: Map<number, number>,
): string {
  const hexParts: string[] = [];
  for (const ch of text) {
    const codePoint = ch.codePointAt(0)!;
    if (
      codePoint <= 0xffff &&
      (codePoint < 0xd800 || codePoint > 0xdfff) &&
      (codePoint < 0xe000 || codePoint > 0xf8ff)
    ) {
      const hex = toHex4(codePoint);
      unicodeMappings.set(codePoint, hex);
      hexParts.push(hex);
    } else {
      let glyphCode = supplementaryCodes.get(codePoint);
      if (glyphCode === undefined) {
        glyphCode = 0xe000 + supplementaryCodes.size;
        supplementaryCodes.set(codePoint, glyphCode);
      }
      const targetHex = Array.from({ length: ch.length }, (_, i) =>
        toHex4(ch.charCodeAt(i)),
      ).join("");
      unicodeMappings.set(glyphCode, targetHex);
      hexParts.push(toHex4(glyphCode));
    }
  }
  return hexParts.join("");
}

function buildToUnicodeCMapStream(
  unicodeMappings: Map<number, string>,
): string {
  const entries = new Map<number, string>(unicodeMappings);
  if (!entries.has(0x0020)) {
    entries.set(0x0020, "0020");
  }

  const sortedCodes = Array.from(entries.keys()).sort((a, b) => a - b);
  const bfcharBlocks: string[] = [];
  const blockSize = 100;

  for (let i = 0; i < sortedCodes.length; i += blockSize) {
    const slice = sortedCodes.slice(i, i + blockSize);
    const lines = slice.map(
      (code) => `<${toHex4(code)}> <${entries.get(code)!}>`,
    );
    bfcharBlocks.push(
      `${slice.length} beginbfchar\n${lines.join("\n")}\nendbfchar`,
    );
  }

  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /Adobe-Identity-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    ...bfcharBlocks,
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
}

export function buildPdfPageContentStream(
  lines: string[],
  unicodeMappings = new Map<number, string>(),
  supplementaryCodes = new Map<number, number>(),
): string {
  const operators: string[] = ["BT", "/F1 10 Tf", "40 760 Td"];
  let activeFont: "F1" | "F2" = "F1";

  lines.forEach((rawLine, index) => {
    if (index > 0) {
      operators.push("0 -16 Td");
    }
    const line = sanitizePdfLineText(rawLine);
    if (isPdfPrintableAscii(line)) {
      if (activeFont !== "F1") {
        operators.push("/F1 10 Tf");
        activeFont = "F1";
      }
      operators.push(`(${escapePdfLiteralText(line)}) Tj`);
    } else {
      if (activeFont !== "F2") {
        operators.push("/F2 10 Tf");
        activeFont = "F2";
      }
      const hex = encodePdfUnicodeHex(
        line,
        unicodeMappings,
        supplementaryCodes,
      );
      operators.push(`<${hex}> Tj`);
    }
  });

  operators.push("ET");
  return operators.join("\n");
}

export function buildMinimalPdf(lines: string[]): Buffer {
  const pages = chunkPdfLines(lines, PLACARD_PDF_LINES_PER_PAGE);
  const pageCount = pages.length;
  const latinFontId = 3 + pageCount * 2;
  const cjkFontId = latinFontId + 1;
  const cidFontId = latinFontId + 2;
  const toUnicodeId = latinFontId + 3;
  const totalObjects = toUnicodeId;
  const objectBodies: string[] = new Array(totalObjects + 1).fill("");
  const kids = Array.from(
    { length: pageCount },
    (_, index) => `${3 + index * 2} 0 R`,
  ).join(" ");

  objectBodies[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objectBodies[2] = `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`;

  const unicodeMappings = new Map<number, string>();
  const supplementaryCodes = new Map<number, number>();

  pages.forEach((pageLines, index) => {
    const pageId = 3 + index * 2;
    const contentId = 4 + index * 2;
    const content = buildPdfPageContentStream(
      pageLines,
      unicodeMappings,
      supplementaryCodes,
    );
    const contentByteLength = Buffer.byteLength(content, "latin1");
    objectBodies[pageId] =
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${latinFontId} 0 R /F2 ${cjkFontId} 0 R >> >> /MediaBox [0 0 612 792] /Contents ${contentId} 0 R >>\nendobj\n`;
    objectBodies[contentId] =
      `${contentId} 0 obj\n<< /Length ${contentByteLength} >>\nstream\n${content}\nendstream\nendobj\n`;
  });

  const toUnicodeCMap = buildToUnicodeCMapStream(unicodeMappings);
  const toUnicodeByteLength = Buffer.byteLength(toUnicodeCMap, "latin1");

  objectBodies[latinFontId] =
    `${latinFontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;
  objectBodies[cjkFontId] =
    `${cjkFontId} 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /MSung-Light /Encoding /Identity-H /DescendantFonts [${cidFontId} 0 R] /ToUnicode ${toUnicodeId} 0 R >>\nendobj\n`;
  objectBodies[cidFontId] =
    `${cidFontId} 0 obj\n<< /Type /Font /Subtype /CIDFontType0 /BaseFont /MSung-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (CNS1) /Supplement 7 >> /DW 400 >>\nendobj\n`;
  objectBodies[toUnicodeId] =
    `${toUnicodeId} 0 obj\n<< /Length ${toUnicodeByteLength} >>\nstream\n${toUnicodeCMap}\nendstream\nendobj\n`;

  const header = "%PDF-1.4\n";
  const offsets: number[] = new Array(totalObjects + 1).fill(0);
  let offset = Buffer.byteLength(header, "latin1");
  let body = "";
  for (let id = 1; id <= totalObjects; id += 1) {
    offsets[id] = offset;
    const objectBody = objectBodies[id]!;
    body += objectBody;
    offset += Buffer.byteLength(objectBody, "latin1");
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= totalObjects; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(header + body + xref + trailer, "latin1");
}

function expandPlacardFieldLines(
  label: string,
  value: string | null | undefined,
): string[] {
  const resolved = value ?? "N/A";
  const segments = resolved.split(/\r?\n/);
  return segments.map((segment, index) =>
    index === 0
      ? `${label}: ${sanitizePdfLineText(segment)}`
      : sanitizePdfLineText(segment),
  );
}

export function buildPlacardPdfRows(
  placard: Pick<
    PlacardVersionRecord,
    | "placardVersionId"
    | "versionCode"
    | "templateName"
    | "publishedAt"
    | "createdAt"
  >,
  source: PublicInfoVersionRecord,
): string[] {
  return [
    `Vehicle Service Placard`,
    `========================================`,
    `Version Code: ${sanitizePdfLineText(placard.versionCode)}`,
    `Placard ID: ${sanitizePdfLineText(placard.placardVersionId)}`,
    `Template: ${sanitizePdfLineText(placard.templateName)}`,
    `Public Info Source: ${sanitizePdfLineText(source.title)} (${sanitizePdfLineText(source.versionId)})`,
    `Source Status: ${sanitizePdfLineText(source.status)}`,
    ...expandPlacardFieldLines("Booking / Dispatch Phone", source.callPhone),
    ...expandPlacardFieldLines(
      "Customer Complaint Hotline",
      source.complaintPhone,
    ),
    ...expandPlacardFieldLines("Call Rate", source.callRateText),
    ...expandPlacardFieldLines("Fare Rule", source.fareText),
    ...expandPlacardFieldLines("Payment Methods", source.paymentMethodText),
    `Effective Period: ${source.effectiveFrom ?? "N/A"} to ${source.effectiveTo ?? "indefinite"}`,
    `Published At: ${placard.publishedAt ?? "Draft"}`,
    `Generated At: ${placard.createdAt}`,
    `========================================`,
  ];
}
