/** Escape a value for CSV cells that may be opened by spreadsheet applications.
 * RFC 4180 quoting alone does not prevent spreadsheet formula execution.
 */
export function quoteCsvCell(value: unknown): string {
  const raw = String(value ?? "");
  // Keep numeric values usable by importers, including legitimate negative prices.
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw);
  // Excel/LibreOffice may ignore leading whitespace or BOM before a formula.
  const formula = /^[\s\uFEFF\u200B\u200E\u200F]*[=+\-@]/u.test(raw);
  const safe = formula && !numeric ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}
