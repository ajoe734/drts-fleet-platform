import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

/** Expo's existing SPA router owns Driver paths below the build's baseUrl.
 * Static JS/WASM/assets are served from public/review-driver at the same SHA.
 */
export async function GET() {
  if (process.env.PAX_REVIEW_DEMO_ENABLED !== "true")
    return new Response("Not found", { status: 404 });
  try {
    const html = await readFile(
      path.join(process.cwd(), "public/review-driver/index.html"),
      "utf8",
    );
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Driver rehearsal export is unavailable.", {
      status: 503,
    });
  }
}
