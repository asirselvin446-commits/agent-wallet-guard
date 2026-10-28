import { describe, expect, it } from "vitest";
import { hardBlock, withinWindow } from "./decision-rules";

describe("decision rules", () => {
  it("records hard-rule reasons without changing prior reasons", () => {
    expect(hardBlock(["verified"], true, "cap exceeded")).toEqual(["verified", "cap exceeded"]);
    expect(hardBlock(["verified"], false, "cap exceeded")).toBeNull();
  });
  it("checks rolling time windows", () => {
    const now = new Date("2026-01-08T00:00:00Z");
    expect(withinWindow(new Date("2026-01-02T00:00:00Z"), now, 7)).toBe(true);
    expect(withinWindow(new Date("2025-12-31T00:00:00Z"), now, 7)).toBe(false);
  });
});
