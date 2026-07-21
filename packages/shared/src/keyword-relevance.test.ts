import { describe, expect, it } from "vitest";
import {
  filterRelevantKeywords,
  isRelevantToSeed,
} from "./keyword-relevance";

describe("keyword relevance", () => {
  it("keeps suggestions that contain the seed phrase", () => {
    expect(isRelevantToSeed("best running shoes for men", "running shoes")).toBe(
      true,
    );
    expect(isRelevantToSeed("trail running shoes", "running shoes")).toBe(true);
  });

  it("rejects unrelated category-adjacent junk", () => {
    expect(isRelevantToSeed("free adword tools", "keyword research")).toBe(
      false,
    );
    expect(isRelevantToSeed("accounts payable automation", "running shoes")).toBe(
      false,
    );
    expect(isRelevantToSeed("yoga mat cleaner", "running shoes")).toBe(false);
  });

  it("requires most seed tokens for multi-word seeds", () => {
    expect(isRelevantToSeed("personal injury attorney dallas", "personal injury lawyer")).toBe(
      true,
    );
    expect(isRelevantToSeed("criminal defense attorney", "personal injury lawyer")).toBe(
      false,
    );
  });

  it("dedupes and always includes the seed", () => {
    const filtered = filterRelevantKeywords(
      [
        "RUNNING SHOES",
        "best running shoes",
        "yoga pants",
        "trail running shoes",
        "best running shoes",
      ],
      "running shoes",
      10,
    );
    expect(filtered[0]).toBe("running shoes");
    expect(filtered).toEqual([
      "running shoes",
      "best running shoes",
      "trail running shoes",
    ]);
  });
});
