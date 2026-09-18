/**
 * A small, dependency-free CSV parser — handles quoted fields (including
 * an escaped `""` inside a quoted field) and both \n and \r\n line
 * endings, which covers what a real HRIS export or a spreadsheet's "Save
 * as CSV" actually produces. Not a full RFC 4180 implementation (no
 * multi-line quoted fields spanning several rows), but that's a
 * deliberately small gap for a v1 given nothing in this codebase needed a
 * CSV library before now — pulling one in for this alone would be a
 * bigger footprint than parsing the common case by hand.
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.length > 0);
  const parsed = lines.map(parseCsvLine);
  const [headers, ...rows] = parsed;
  return { headers: headers ?? [], rows };
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}
