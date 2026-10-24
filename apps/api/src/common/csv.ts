/**
 * CSV cells for exports. Values that a spreadsheet would treat as a formula (=, +, -, @, tab, CR)
 * are prefixed with an apostrophe so an exported cell can never execute (CSV injection).
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : typeof value === 'bigint' ? value.toString() : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
}
