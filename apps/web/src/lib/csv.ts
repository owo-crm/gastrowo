/** Rows for the team import, from a CSV file or a table pasted from Excel / Google Sheets. */
export type ImportRow = { email: string; name?: string; position?: string; rate?: string };

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

const HEADERS: Record<keyof ImportRow, string[]> = {
  email: ["email", "e-mail", "mail", "correo", "почта", "адрес"],
  name: ["name", "full name", "imię", "imie", "imię i nazwisko", "nombre", "имя", "фио"],
  position: ["position", "role", "job", "stanowisko", "puesto", "должность", "позиция"],
  rate: ["rate", "hourly rate", "pay", "wage", "stawka", "tarifa", "ставка"],
};

export function parseTeamTable(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const first = splitLine(lines[0], delimiter).map((cell) => cell.toLowerCase());
  const hasHeader = first.some((cell) => Object.values(HEADERS).some((names) => names.includes(cell)));
  // Without a header the order is: email, name, position, rate. With one, columns can be in any order.
  const index = (key: keyof ImportRow, fallback: number) => {
    if (!hasHeader) return fallback;
    const found = first.findIndex((cell) => HEADERS[key].includes(cell));
    return found;
  };
  const columns = { email: index("email", 0), name: index("name", 1), position: index("position", 2), rate: index("rate", 3) };
  if (columns.email < 0) {
    // No email header: take the first column that looks like an email in the first data row.
    const sample = splitLine(lines[hasHeader ? 1 : 0] ?? "", delimiter);
    columns.email = sample.findIndex((cell) => cell.includes("@"));
  }
  return lines
    .slice(hasHeader ? 1 : 0)
    .map((line) => splitLine(line, delimiter))
    .map((cells) => ({
      email: cells[columns.email] ?? "",
      name: columns.name >= 0 ? cells[columns.name] || undefined : undefined,
      position: columns.position >= 0 ? cells[columns.position] || undefined : undefined,
      rate: columns.rate >= 0 ? (cells[columns.rate] || "").replace(/[^\d.,]/g, "").replace(",", ".") || undefined : undefined,
    }))
    .filter((row) => row.email.includes("@"));
}
