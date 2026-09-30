import { describe, expect, it } from "vitest";

import { overtimeHours, tipShares } from "@/pages/tools-pages";

describe("overtime", () => {
  it("federal: only hours over 40 a week", () => {
    expect(overtimeHours([9, 9, 8, 10, 11, 0, 0], "federal")).toEqual({ regular: 40, overtime: 7, double: 0 });
    expect(overtimeHours([12, 12, 0, 0, 0, 0, 0], "federal")).toEqual({ regular: 24, overtime: 0, double: 0 });
  });
  it("california: daily overtime and double time", () => {
    // 12 h days: 8 regular + 4 OT each; 14 h: 8 + 4 + 2 DT.
    expect(overtimeHours([12, 14, 0, 0, 0, 0, 0], "california")).toEqual({ regular: 16, overtime: 8, double: 2 });
  });
  it("california: weekly overtime without double counting", () => {
    // 6 days × 9 h: 6 daily OT hours, 48 regular → 40 regular + 8 weekly OT.
    expect(overtimeHours([9, 9, 9, 9, 9, 9, 0], "california")).toEqual({ regular: 40, overtime: 14, double: 0 });
  });
  it("california: seventh consecutive day", () => {
    const result = overtimeHours([8, 8, 8, 8, 8, 8, 10], "california");
    expect(result.double).toBe(2);
    expect(result.regular).toBe(40);
    expect(result.overtime).toBe(8 + 8); // 8 weekly (48 regular) + 8 on day 7
  });
});

describe("tip pool", () => {
  it("splits by hours, points or equally", () => {
    const rows = [{ hours: 30, points: 10 }, { hours: 10, points: 5 }];
    expect(tipShares(400, rows, "hours")).toEqual([300, 100]);
    expect(tipShares(350, rows, "points")).toEqual([300, 50]);
    expect(tipShares(400, rows, "equal")).toEqual([200, 200]);
    expect(tipShares(400, [], "hours")).toEqual([]);
  });
});
