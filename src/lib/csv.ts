/**
 * CSV Generation & Sanitization Utilities
 * - Prevents CSV Formula Injection: prefixes cells starting with '=', '+', '-', '@', '\t', '\r' with single quote "'"
 * - Quotes strings with commas, quotes, or newlines
 * - Emits UTF-8 Byte Order Mark (BOM) \uFEFF so Hindi / Devanagari text opens seamlessly in MS Excel
 * - Structured property data builder for professional, clean spreadsheet presentation
 */

import { formatPrice } from './price';
import { formatPropertyId } from './propertyFormat';
import { normalizePhone } from './phone';

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

export interface CsvExportOptions {
  includeContact?: boolean;
}

export interface GenericPropertyExportItem {
  plot_id?: string | null;
  sector_name?: string | null;
  sector?: string | null;
  location?: string | null;
  house_no?: string | null;
  type_name?: string | null;
  property_type?: string | null;
  price: number;
  area_size?: number | null;
  area_unit?: string | null;
  status?: string | null;
  details?: string | null;
  is_broker?: boolean | null;
  contact_name?: string | null;
  owner_name?: string | null;
  _mockContactName?: string | null;
  phone?: string | null;
  owner_phone?: string | null;
  _mockPhone?: string | null;
}

/**
 * Extracts structured metadata (dimensions, rate, broker, remarks) from details string.
 */
export function extractPropertyMetadata(details: string | null | undefined, isBrokerFlag?: boolean | null): {
  listedBy: 'Broker' | 'Owner';
  dimensions: string;
  rate: string;
  cleanDetails: string;
} {
  const raw = (details || '').trim();
  const isBroker = Boolean(isBrokerFlag || /\[\s*\[?Broker\]?\s*\]/i.test(raw));
  const listedBy: 'Broker' | 'Owner' = isBroker ? 'Broker' : 'Owner';

  let dimensions = '—';
  // Match "Length: 30 ft, Breadth: 60 ft" or "Dim: 30x60" or "Dim: 300x200 ft"
  const dimMatch = raw.match(
    /(?:Length:\s*(\d+(?:\.\d+)?)\s*ft,\s*Breadth:\s*(\d+(?:\.\d+)?)\s*ft)|(?:(?:Dim|Dimensions?):\s*(\d+(?:\.\d+)?)\s*[x*×]\s*(\d+(?:\.\d+)?)\s*(?:ft)?)/i
  );
  if (dimMatch) {
    const l = dimMatch[1] || dimMatch[3];
    const b = dimMatch[2] || dimMatch[4];
    dimensions = `Length: ${l} ft, Breadth: ${b} ft`;
  }

  let rate = '—';
  const rateMatch = raw.match(/Rate:\s*₹?([0-9,]+(?:\.[0-9]+)?)\s*(?:\/|\s*per\s*)\s*([a-zA-Z\s]+)/i);
  if (rateMatch) {
    rate = `₹${rateMatch[1].trim()} / ${rateMatch[2].trim()}`;
  }

  // Remove inner [Broker] tags cleanly without eating outer closing bracket
  let clean = raw.replace(/\[\s*Broker\s*\]/gi, '');

  // Remove metadata segments inside brackets
  clean = clean.replace(/\[\s*(?:(?:Length|Breadth|Rate|Dim|Dimensions?):[^\]|]+(?:\s*\|\s*)?)+\s*\]/gi, '');
  clean = clean.replace(/\[\s*[^\]]*(?:Length|Breadth|Rate|Dim|Dimensions?)[^\]]*\]/gi, '');
  // Remove leading bracket block if it was metadata
  clean = clean.replace(/^\[[^\]]+\]\s*/g, '');

  // Clean empty brackets, dangling pipes and trims
  clean = clean.replace(/\[\s*\]/g, '').replace(/^[\s|–-]+|[\s|–-]+$/g, '').trim();

  return {
    listedBy,
    dimensions,
    rate,
    cleanDetails: clean || '—',
  };
}

/**
 * Builds clean, beautifully structured headers and rows for property CSV exports.
 * Eliminates redundant raw price columns and splits cluttered details into clean, dedicated columns.
 */
export function buildPropertyCsvData(
  properties: GenericPropertyExportItem[],
  options?: CsvExportOptions
): { headers: string[]; rows: (string | number)[][] } {
  const includeContact = Boolean(options?.includeContact);

  const headers = [
    'Property ID',
    'Listed By',
    'Sector',
    'Location',
    'House No',
    'Type',
    'Price',
    'Price in ₹',
    'Area',
    'Dimensions',
    'Rate',
    'Details / Notes',
    ...(includeContact ? ['Contact Name', 'Contact Phone'] : []),
  ];

  const rows = properties.map((p) => {
    const meta = extractPropertyMetadata(p.details, p.is_broker);
    const sector = (p.sector_name || p.sector || '').trim() || '—';
    const location = (p.location || '').trim() || '—';
    const houseNo = (p.house_no || '').trim() || '—';
    const propType = (p.type_name || p.property_type || '').trim() || 'Plot';
    const area = p.area_size ? `${p.area_size} ${p.area_unit || 'sq yard'}` : '—';

    const row: (string | number)[] = [
      formatPropertyId(p.plot_id),
      meta.listedBy,
      sector,
      location,
      houseNo,
      propType,
      formatPrice(p.price),
      p.price,
      area,
      meta.dimensions,
      meta.rate,
      meta.cleanDetails,
    ];

    if (includeContact) {
      const contactName = (p.contact_name || p.owner_name || p._mockContactName || '').trim() || '—';
      const rawPhone = p.phone || p.owner_phone || p._mockPhone || '';
      const formattedPhone = rawPhone ? (normalizePhone(rawPhone).formatted || rawPhone) : '—';
      row.push(contactName, formattedPhone);
    }

    return row;
  });

  return { headers, rows };
}
