import { describe, expect, it } from "vitest";

import { breakEven, charmPrice, menuPrice, overtimeHours, periodFoodCost, primeCost, shiftHours, tipShares } from "@/pages/tools-pages";

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

describe("cost calculators", () => {
  it("food cost for a period", () => {
    expect(periodFoodCost({ begin: 8000, purchases: 20000, end: 6000, sales: 70000 })).toEqual({ cost: 22000, pct: (22000 / 70000) * 100 });
    expect(periodFoodCost({ begin: 0, purchases: 0, end: 0, sales: 0 }).pct).toBe(0);
  });
  it("menu price and charm rounding", () => {
    expect(menuPrice(4.2, 30)).toBeCloseTo(14);
    expect(menuPrice(4.2, 0)).toBe(0);
    expect(charmPrice(12)).toBe(12.49);
    expect(charmPrice(12.49)).toBe(12.49);
    expect(charmPrice(12.5)).toBe(12.99);
    expect(charmPrice(14.000000000000002)).toBe(14.49);
  });
  it("prime cost", () => {
    expect(primeCost({ cogs: 25000, labor: 26000, sales: 85000 })).toEqual({ prime: 51000, pct: 60 });
  });
  it("break-even", () => {
    const result = breakEven(30000, 65, 40, 25);
    expect(result?.sales).toBeCloseTo(85714.29, 1);
    expect(result?.perDay).toBeCloseTo(3428.57, 1);
    expect(result?.covers).toBeCloseTo(2142.86, 1);
    expect(breakEven(30000, 100, 40, 25)).toBeNull();
  });
  it("time card hours with breaks and overnight shifts", () => {
    expect(shiftHours("10:00", "18:30", 30)).toBe(8);
    expect(shiftHours("18:00", "02:00", 0)).toBe(8);
    expect(shiftHours("", "18:00", 0)).toBe(0);
    expect(shiftHours("09:00", "09:15", 30)).toBe(0);
  });
});
