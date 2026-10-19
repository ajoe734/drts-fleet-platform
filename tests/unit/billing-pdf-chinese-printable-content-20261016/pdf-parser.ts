import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Independent, locked PDF.js parser; never decodes our renderer's private syntax. */
export async function parsePdf(bytes: Buffer) {
  const task = getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: false,
  });
  const pdf = await task.promise;
  const pages: string[][] = [];
  const glyphs: { unicode: string; isInFont: boolean }[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let line = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = "";
        }
      }
      if (line) lines.push(line);
      pages.push(lines);
      const operators = await page.getOperatorList();
      operators.fnArray.forEach((operator, index) => {
        if (operator !== OPS.showText) return;
        for (const glyph of operators.argsArray[index][0]) {
          if (glyph && typeof glyph === "object") {
            glyphs.push({ unicode: glyph.unicode, isInFont: glyph.isInFont });
          }
        }
      });
    }
    return {
      pages,
      lines: pages.flat(),
      text: pages.flat().join("\n"),
      glyphs,
    };
  } finally {
    await task.destroy();
  }
}
