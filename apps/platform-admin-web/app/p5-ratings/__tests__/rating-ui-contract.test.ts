import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRatingTranslator } from "../rating-translations";

const ratingRoot = resolve(import.meta.dirname, "..");

function source(path: string): string {
  return readFileSync(resolve(ratingRoot, path), "utf8");
}

describe("P5 rating UI production contracts", () => {
  it.each([
    ["components/rating-review-queue.tsx", "P5-RATE-UI-01"],
    ["components/rating-review-detail.tsx", "P5-RATE-UI-02"],
    ["components/driver-rating-authority.tsx", "P5-RATE-UI-03"],
  ])("owns the %s screen identity", (path, screenId) => {
    expect(source(path)).toContain(`screenId="${screenId}"`);
  });

  it("keeps aggregate authority read-only and restore command-pending", () => {
    const detail = source("components/rating-review-detail.tsx");

    expect(detail).toContain("detail.aggregateLocked");
    expect(detail).toContain('title="command-pending"');
    expect(detail).not.toMatch(/setAverageRating|setRatingCount/);
  });

  it("renders all required fail-closed states from production components", () => {
    const queue = source("components/rating-review-queue.tsx");
    const detail = source("components/rating-review-detail.tsx");
    const authority = source("components/driver-rating-authority.tsx");
    const shared = source("components/rating-shared.tsx");
    const combined = `${queue}\n${detail}\n${authority}\n${shared}`;

    expect(combined).toContain("RatingLoadingState");
    expect(combined).toContain('kind="empty"');
    expect(combined).toContain("forbidden");
    expect(combined).toContain("request_failed");
    expect(combined).toContain("RatingStaleBanner");
  });

  it("contains no production fixture fallback", () => {
    const production = [
      source("rating-api.ts"),
      source("components/rating-review-queue.tsx"),
      source("components/rating-review-detail.tsx"),
      source("components/driver-rating-authority.tsx"),
    ].join("\n");

    expect(production).not.toMatch(/\bFX_[A-Z0-9_]+\b/);
    expect(production).not.toMatch(/\bfixture[A-Z_]*\s*=/i);
    expect(production).not.toContain("restoreRating(");
  });
});

describe("rating-local translations", () => {
  it("supports zh-TW default and English without global translations", () => {
    expect(createRatingTranslator("zh-TW")("queue.title")).toBe("評價審查佇列");
    expect(createRatingTranslator("en")("queue.total", { count: 3 })).toBe(
      "3 records",
    );
  });
});
