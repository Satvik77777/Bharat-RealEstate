/**
 * Property Formatting Utilities
 * Standardizes Property ID display (JSK- prefix) and WhatsApp / Clipboard copy formats.
 */

import { formatPrice } from './price';
import { normalizePhone } from './phone';

export const DEFAULT_CONTACT_CTA = '*Interested?*\n*Call/whatsapp : 80178-80178*';

/**
 * Normalizes property ID into 'JSK-XXXX' standard.
 * Converts legacy 'P-0024' or plain '0024' to 'JSK-0024'.
 * Preserves existing 'JSK-XXXX'.
 */
export function formatPropertyId(plotId: string | null | undefined): string {
  if (!plotId) return 'JSK-0000';
  const trimmed = String(plotId).trim();
  
  // Already JSK- formatted
  if (/^JSK[-_\s]?\d+/i.test(trimmed)) {
    return trimmed.replace(/^JSK[-_\s]*/i, 'JSK-');
  }
  
  // Legacy P- prefix
  if (/^P[-_\s]?\d+/i.test(trimmed)) {
    return trimmed.replace(/^P[-_\s]*/i, 'JSK-');
  }

  // Pure digits (e.g. 24)
  if (/^\d+$/.test(trimmed)) {
    return `JSK-${trimmed.padStart(4, '0')}`;
  }

  // Fallback
  return trimmed.startsWith('JSK-') ? trimmed : `JSK-${trimmed}`;
}

/**
 * Formats property category + subType into standardized "Residential - Plot", "Commercial - Shop", etc.
 */
export function formatCategoryTypeName(typeName?: string | null, details?: string | null): string {
  if (!typeName) return 'Residential - Plot';
  const trimmed = typeName.trim();

  // If already formatted as "Category - Type", return directly
  if (trimmed.includes(' - ')) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  const lowerDetails = (details || '').toLowerCase();

  if (lower === 'plot') {
    if (lowerDetails.includes('commercial') || lowerDetails.includes('shop')) {
      return 'Commercial - Plot';
    }
    return 'Residential - Plot';
  }

  if (lower.includes('house') || lower.includes('kothi') || lower.includes('home')) {
    return 'Residential - House/Kothi';
  }

  if (lower.includes('flat') || lower.includes('apartment')) {
    return 'Residential - Flat / Apartment';
  }

  if (lower.includes('farm')) {
    return 'Residential - Farmhouse';
  }

  if (lower.includes('shop') || lower === 'commercial') {
    return 'Commercial - Shop';
  }

  if (lower.includes('agri')) {
    return 'Commercial - Agricultural Land';
  }

  if (lower.includes('industr')) {
    return 'Commercial - Industrial';
  }

  return trimmed;
}

/**
 * Extracts Length and Breadth from details text.
 */
export function extractDimensions(details?: string | null): { length?: string; breadth?: string } {
  if (!details) return {};

  const lenMatch = details.match(/Length:\s*([0-9.]+(?:\s*ft)?)/i);
  const brMatch = details.match(/Breadth:\s*([0-9.]+(?:\s*ft)?)/i);
  if (lenMatch && brMatch) {
    const l = lenMatch[1].toLowerCase().includes('ft') ? lenMatch[1] : `${lenMatch[1]} ft`;
    const b = brMatch[1].toLowerCase().includes('ft') ? brMatch[1] : `${brMatch[1]} ft`;
    return { length: l, breadth: b };
  }

  const dimMatch = details.match(/(?:(?:Dim|Dimensions?):\s*)?([0-9.]+)\s*[x*×]\s*([0-9.]+)\s*(?:ft)?/i);
  if (dimMatch) {
    return { length: `${dimMatch[1]} ft`, breadth: `${dimMatch[2]} ft` };
  }

  return {};
}

/**
 * Extracts per-unit rate from details text (e.g. Rate: ₹60,000/gaj).
 */
export function extractRate(details?: string | null): { rateValue: string; rateUnit: string } | null {
  if (!details) return null;
  const rateMatch = details.match(/Rate:\s*₹?([0-9,]+(?:\.[0-9]+)?)\s*(?:\/|\s*per\s*)\s*([a-zA-Z\s]+)/i);
  if (rateMatch) {
    const unitRaw = rateMatch[2].trim().toLowerCase();
    let displayUnit = unitRaw;
    if (unitRaw === 'gaj') displayUnit = 'gaj';
    else if (unitRaw === 'sqft' || unitRaw === 'sq ft') displayUnit = 'square feet';
    else if (unitRaw === 'sqm' || unitRaw === 'sq meter' || unitRaw === 'sq metre') displayUnit = 'square meter';
    else if (unitRaw === 'acre') displayUnit = 'acre';
    return {
      rateValue: rateMatch[1].trim(),
      rateUnit: displayUnit,
    };
  }
  return null;
}

/**
 * Strips technical metadata (Rate, Dimensions, Broker tags) from details string for clean display.
 */
export function extractCleanDetails(details?: string | null): string {
  if (!details) return '';
  let clean = details;
  clean = clean.replace(/\[\s*\[?Broker\]?\s*\]/gi, '').replace(/\[Broker\]/gi, '');
  clean = clean.replace(/\[?\s*Rate:\s*₹?[0-9,.]+\s*(?:\/|\s*per\s*)\s*[a-zA-Z\s]+(?:\s*\|\s*)?\]?/gi, '');
  clean = clean.replace(/\[?\s*(?:Length:\s*[0-9.]+\s*ft,\s*Breadth:\s*[0-9.]+\s*ft)(?:\s*\|\s*)?\]?/gi, '');
  clean = clean.replace(/\[?\s*(?:Dim|Dimensions?):\s*[0-9.]+\s*[x*×]\s*[0-9.]+\s*(?:ft)?(?:\s*\|\s*)?\]?/gi, '');
  clean = clean.replace(/\[\s*\|\s*\]/g, '').replace(/\[\s*\]/g, '');
  clean = clean.replace(/^\[[^\]]+\]\s*/g, '');
  clean = clean.replace(/^[\s|–-]+|[\s|–-]+$/g, '').trim();
  return clean;
}

/**
 * Converts legacy/compact dimension strings like "Dim: 30x60 ft" or "30*60" into "Length: 30 ft, Breadth: 60 ft".
 */
export function formatDimensions(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[?Dim:\s*(\d+(?:\.\d+)?)\s*[x*×]\s*(\d+(?:\.\d+)?)\s*(?:ft)?\]?/gi, 'Length: $1 ft, Breadth: $2 ft')
    .replace(/Dimensions?:\s*(\d+(?:\.\d+)?)\s*[x*×]\s*(\d+(?:\.\d+)?)\s*(?:ft)?/gi, 'Length: $1 ft, Breadth: $2 ft');
}

export interface PropertyDataToCopy {
  plot_id: string;
  price: number;
  type_name?: string | null;
  location?: string | null;
  landmark?: string | null;
  house_no?: string | null;
  sector_name?: string | null;
  locality_name?: string | null;
  area_size?: number | null;
  area_unit?: string | null;
  status?: string | null;
  details?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  is_broker?: boolean;
}

export interface PropertyCopyOptions {
  showOwnerPhone?: boolean;
  showLocation?: boolean;
  showHouseNo?: boolean;
  includeContactCta?: boolean;
  contactCtaText?: string;
  headerTitle?: string | null;
}

/**
 * Formats a single property item block according to user specification:
 * 1. Property ID
 * 2. Type: Residential - Plot (or other selected)
 * 3. Length (if available)
 * 4. Breadth (if available)
 * 5. Area
 * 6. Locality
 * 7. Landmark
 * 8. House No (if checked)
 * 9. Phone No (if checked)
 * 10. Rate per unit (if given) & Price / Total Cost asking (negotiable)
 * 11. Details (clean details)
 */
export function formatSinglePropertyItem(
  p: PropertyDataToCopy,
  options: PropertyCopyOptions = {}
): string {
  const propId = formatPropertyId(p.plot_id);
  const priceStr = formatPrice(p.price);
  const typeStr = formatCategoryTypeName(p.type_name, p.details);

  const lines: string[] = [
    `Property ID: ${propId}`,
    `Type: ${typeStr}`,
  ];

  // Length & Breadth
  const dims = extractDimensions(p.details);
  if (dims.length) {
    lines.push(`Length: ${dims.length}`);
  }
  if (dims.breadth) {
    lines.push(`Breadth: ${dims.breadth}`);
  }

  // Area
  if (p.area_size) {
    lines.push(`Area: ${p.area_size} ${p.area_unit || ''}`.trim());
  }

  // Locality (changed from Sector)
  const locality = p.locality_name || p.sector_name;
  if (locality) {
    lines.push(`Locality: ${locality}`);
  }

  // Landmark (changed from Location)
  const landmark = p.landmark || p.location;
  if (options.showLocation !== false && landmark) {
    lines.push(`Landmark: ${landmark}`);
  }

  // House No (only if checked)
  const shouldShowHouseNo = Boolean(options.showHouseNo);
  if (shouldShowHouseNo && p.house_no) {
    lines.push(`House No: ${p.house_no}`);
  }

  // Phone No (only if checked)
  const shouldShowPhone = Boolean(options.showOwnerPhone);
  if (shouldShowPhone && p.phone) {
    const formattedPhone = normalizePhone(p.phone).formatted || p.phone;
    lines.push(`Phone: ${formattedPhone}`);
  }

  // Price & Rate logic
  // If rate per unit (e.g. per gaj, per square feet, per square meter) is given, show ONLY that rate.
  // If rate is not given, show Total Cost asking (negotiable).
  const rateInfo = extractRate(p.details);
  if (rateInfo) {
    lines.push(`Price per ${rateInfo.rateUnit}: ₹${rateInfo.rateValue}`);
  } else {
    lines.push(`Total Cost: ${priceStr} asking (negotiable)`);
  }

  // Details: clean notes without redundant rate and dimensions
  const cleanDetails = extractCleanDetails(p.details);
  if (cleanDetails) {
    lines.push(`Details: ${cleanDetails}`);
  }

  return lines.join('\n');
}

/**
 * Formats one or multiple properties into a clean text block for WhatsApp or clipboard copying.
 * Appends the Interested / Call/whatsapp CTA footer if includeContactCta is true (default true).
 * If multiple records are copied, the CTA footer is appended only ONCE at the very end.
 */
export function formatPropertiesText(
  properties: PropertyDataToCopy[],
  options: PropertyCopyOptions = {}
): string {
  if (!properties || properties.length === 0) return '';

  const blocks = properties.map((p) =>
    formatSinglePropertyItem(p, {
      showOwnerPhone: options.showOwnerPhone,
      showLocation: options.showLocation,
      showHouseNo: options.showHouseNo,
    })
  );

  let text = blocks.join('\n\n----------------------------------------\n\n');

  if (options.includeContactCta !== false) {
    const cta = (options.contactCtaText || DEFAULT_CONTACT_CTA).trim();
    if (cta) {
      text += `\n\n${cta}`;
    }
  }

  if (options.headerTitle && options.headerTitle.trim()) {
    const cleanHeader = options.headerTitle.trim();
    const boldHeader = cleanHeader.startsWith('*') && cleanHeader.endsWith('*')
      ? cleanHeader
      : `*${cleanHeader}*`;
    text = `${boldHeader}\n\n${text}`;
  }

  return text;
}
