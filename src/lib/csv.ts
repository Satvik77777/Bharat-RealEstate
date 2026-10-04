/**
 * CSV Generation & Sanitization Utilities
 * - Prevents CSV Formula Injection: prefixes cells starting with '=', '+', '-', '@', '\t', '\r' with single quote "'"
 * - Quotes strings with commas, quotes, or newlines
 * - Emits UTF-8 Byte Order Mark (BOM) \uFEFF so Hindi / Devanagari text opens seamlessly in MS Excel
 */

/**
 * Escapes a single CSV cell value
 */
export function csvEscapeCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // CSV Formula Injection Prevention (OWASP)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Quote cell if it contains quotes, commas, newlines, or carriage returns
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Converts a 2D array of data into a CSV string prefixed with UTF-8 BOM
 */
export function generateCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const BOM = '\uFEFF';
  const headerLine = headers.map(csvEscapeCell).join(',');
  const rowLines = rows.map((row) => row.map(csvEscapeCell).join(','));

  return BOM + [headerLine, ...rowLines].join('\r\n');
}

/**
 * Downloads a generated CSV string in browser
 */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
