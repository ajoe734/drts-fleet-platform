import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../../..");
const assets = path.join(root, "apps/api/assets/fonts");
const font = path.join(assets, "NotoSansCJKtc-Regular.otf");
const sentinel = "長尾驗證末筆龜山區臺灣繁體中文王小明END-0371";

async function generate(lines: string[], embedded = true): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  const result = new Promise<Uint8Array>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
  });
  doc.font(embedded ? font : "Helvetica").fontSize(12);
  for (const line of lines) doc.text(line);
  doc.end();
  return result;
}

async function extract(data: Uint8Array): Promise<string[]> {
  const task = getDocument({
    data,
    useSystemFonts: false,
    disableFontFace: true,
  });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .filter((item) => "str" in item)
          .map((item) => item.str)
          .join(""),
      );
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

describe("SR-DEPS-REPORT-FONT-001", () => {
  it("ships the pinned unmodified font and full upstream license", () => {
    const provenance = JSON.parse(
      readFileSync(path.join(assets, "provenance.json"), "utf8"),
    );
    expect(provenance.upstreamCommit).toBe(
      "523d033d6cb47f4a80c58a35753646f5c3608a78",
    );
    expect(provenance.license).toBe("OFL-1.1");
    expect(provenance.modified).toBe(false);
    const expected = [
      [
        "NotoSansCJKtc-Regular.otf",
        "Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf",
        "dce08bd4fd91aa8aa76ed8fea4b694c2dfb8550f67871e326843212ddbeb88b4",
      ],
      [
        "LICENSE",
        "LICENSE",
        "6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2",
      ],
    ] as const;
    expect(provenance.files).toHaveLength(expected.length);
    for (const [file, upstream, sha256] of expected) {
      expect(provenance.files).toContainEqual({
        file,
        url: `https://raw.githubusercontent.com/notofonts/noto-cjk/${provenance.upstreamCommit}/${upstream}`,
        sha256,
      });
      expect(
        createHash("sha256")
          .update(readFileSync(path.join(assets, file)))
          .digest("hex"),
      ).toBe(sha256);
    }
  });

  it("explicitly copies all distribution assets into the runtime stage", () => {
    const dockerfile = readFileSync(
      path.join(root, "apps/api/Dockerfile"),
      "utf8",
    );
    const runtime = dockerfile.split(" AS runtime\n")[1];
    expect(runtime).toContain(
      "COPY apps/api/assets/fonts/NotoSansCJKtc-Regular.otf apps/api/assets/fonts/LICENSE apps/api/assets/fonts/provenance.json /app/assets/fonts/",
    );
    expect(runtime).not.toMatch(/\/usr\/share\/fonts|curl|wget/);
  });

  it("extracts every source row and the long-tail sentinel from a multi-page PDF", async () => {
    const lines = [
      "王小明中文報表",
      ...Array.from(
        { length: 370 },
        (_, i) => `第${String(i + 1).padStart(4, "0")}筆臺北市駕駛清冊繁體中文`,
      ),
      sentinel,
    ];
    const pages = await extract(await generate(lines));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join("")).toBe(lines.join(""));
    expect(pages.at(-1)).toContain(sentinel);
  });

  it("does not mistake Helvetica fallback bytes for real Chinese", async () => {
    const pages = await extract(
      await generate(["王小明中文", sentinel], false),
    );
    expect(pages.join("")).not.toContain("王小明中文");
    expect(pages.join("")).not.toContain(sentinel);
  });
});
