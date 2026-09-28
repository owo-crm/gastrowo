import { describe, expect, it } from "vitest";

import { parseTeamTable } from "@/lib/csv";

describe("parseTeamTable", () => {
  it("reads a CSV with headers in any order", () => {
    expect(parseTeamTable("Name,Email,Rate,Position\nAna Cook,ana@x.com,$21.50,Line cook\n")).toEqual([
      { email: "ana@x.com", name: "Ana Cook", position: "Line cook", rate: "21.50" },
    ]);
  });

  it("reads a table pasted from Google Sheets without a header", () => {
    expect(parseTeamTable("ben@x.com\tBen\tServer\t15\n")).toEqual([{ email: "ben@x.com", name: "Ben", position: "Server", rate: "15" }]);
  });

  it("handles Polish semicolon CSV with decimal commas and quotes", () => {
    expect(parseTeamTable('Imię;E-mail;Stanowisko;Stawka\n"Kowalska, Anna";anna@x.pl;Kucharz;32,50')).toEqual([
      { email: "anna@x.pl", name: "Kowalska, Anna", position: "Kucharz", rate: "32.50" },
    ]);
  });

  it("skips lines without an email", () => {
    expect(parseTeamTable("email\nnobody\ncara@x.com")).toEqual([{ email: "cara@x.com", name: undefined, position: undefined, rate: undefined }]);
  });
});
