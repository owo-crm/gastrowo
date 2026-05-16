import { describe, expect, it } from "vitest";

import { getMonday } from "@/lib/date";

describe("date utils", () => {
  it("returns monday in ISO format", () => {
    const monday = getMonday(new Date("2026-04-23T10:00:00.000Z"));
    expect(monday).toBe("2026-04-20");
  });
});