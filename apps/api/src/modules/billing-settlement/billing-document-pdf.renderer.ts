import path from "node:path";
import PDFDocument from "pdfkit";

// The same packaged, licensed font used by the accepted reporting renderer.
// Resolves in both src/modules and dist/modules, independently of process cwd.
const FONT_PATH = path.resolve(
  __dirname,
  "../../../assets/fonts/NotoSansCJKtc-Regular.otf",
);

/**
 * Render the producer's ordered snapshot rows with actual embedded Unicode
 * glyphs. PDFKit owns escaping, ToUnicode, byte offsets and width-aware wrapping;
 * flowing text continues across pages even when one row is taller than a page.
 * Fixed PDF metadata avoids introducing wall-clock changes during a registered
 * missing-object rebuild. The document's real issue time remains in its rows.
 */
export function renderBillingDocumentPdf(
  lines: readonly string[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      pdfVersion: "1.4",
      size: "LETTER",
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      compress: false,
      info: {
        Producer: "DRTS billing PDF",
        Creator: "DRTS billing settlement",
        CreationDate: new Date(0),
        ModDate: new Date(0),
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      // Font failure must reject issuance, never substitute question marks.
      doc.font(FONT_PATH).fontSize(10);
      for (const line of lines) {
        if (line === "") {
          doc.moveDown();
        } else {
          doc.text(line, { width: 532, lineGap: 2 });
        }
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
