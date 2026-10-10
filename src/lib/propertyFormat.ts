/**
 * Property Formatting Utilities
 * Standardizes Property ID display (JSK- prefix) and WhatsApp / Clipboard copy formats.
 */

import { formatPrice } from './price';
import { normalizePhone } from './phone';

export const DEFAULT_CONTACT_CTA = 'Interested?\nCall/whatsapp : 80178-80178';

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
 * Converts legacy/compact dimension strings like "Dim: 30x60 ft" or "30*60" into "Length: 30 ft, Breadth: 60 ft".
 */
export function formatDimensions(text: string): string {
  if (!text) return '';
  return text
    // Handles [Dim: 30x60 ft] or Dim: 30x60 ft or Dim: 30*60
    .replace(/\[?Dim:\s*(\d+(?:\.\d+)?)\s*[x*×]\s*(\d+(?:\.\d+)?)\s*(?:ft)?\]?/gi, 'Length: $1 ft, Breadth: $2 ft')
    // Handles Dimensions: 30x60 or 30*60
    .replace(/Dimensions?:\s*(\d+(?:\.\d+)?)\s*[x*×]\s*(\d+(?:\.\d+)?)\s*(?:ft)?/gi, 'Length: $1 ft, Breadth: $2 ft');
}

export interface PropertyDataToCopy {
  plot_id: string;
  price: number;
  type_name?: string | null;
  location?: string | null;
  house_no?: string | null;
  sector_name?: string | null;
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
}

/**
 * Formats a single property item block:
 * - Labels *Property ID:*, *Details:*, *Owner:* (or *Broker:*), *Contact:* are bold with asterisks (*Label:*)
 * - Values are not bold
 * - Status is excluded
 * - Location is shown, House No only if showHouseNo is true
 * - Dimensions are formatted as "Length: <L> ft, Breadth: <B> ft"
 */
export function formatSinglePropertyItem(
  p: PropertyDataToCopy,
  options: { showOwnerPhone?: boolean; showLocation?: boolean; showHouseNo?: boolean } = {}
): string {
  const propId = formatPropertyId(p.plot_id);
  const priceStr = formatPrice(p.price);
  const typeStr = p.type_name || 'Property';

  const isBroker = Boolean(p.is_broker || (p.details && /\[Broker\]/i.test(p.details)));

  const lines: string[] = [
    `*Property ID:* ${propId}`,
    `Price: ${priceStr} asking (negotiable)`,
    `Type: ${typeStr}`,
  ];

  // Location is shown by default unless explicitly disabled
  if (options.showLocation !== false && p.location) {
    lines.push(`Location: ${p.location}`);
  }

  // House No is only shown if showHouseNo is true (or legacy showLocation is true)
  const shouldShowHouseNo = options.showHouseNo ?? options.showLocation ?? false;
  if (shouldShowHouseNo && p.house_no) {
    lines.push(`House No: ${p.house_no}`);
  }

  if (p.sector_name && p.sector_name !== p.location) {
    lines.push(`Sector: ${p.sector_name}`);
  }

  if (p.area_size) {
    lines.push(`Area: ${p.area_size} ${p.area_unit || ''}`.trim());
  }

  // Details: clean up [Broker] tag and format dimensions to Length: ... ft, Breadth: ... ft
  if (p.details) {
    let cleanDetails = p.details.replace(/\[Broker\]\s*/gi, '').trim();
    cleanDetails = formatDimensions(cleanDetails);
    if (cleanDetails) {
      lines.push(`*Details:* ${cleanDetails}`);
    }
  }

  if (options.showOwnerPhone && p.phone) {
    const contactRole = isBroker ? 'Broker' : 'Owner';
    lines.push(`*${contactRole}:* ${p.contact_name || contactRole}`);
    lines.push(`*Contact:* ${normalizePhone(p.phone).formatted || p.phone}`);
  }

  return lines.join('\n');
}

/**
 * Formats one or multiple properties into a clean text block for WhatsApp or clipboard copying.
 * Appends the Interested / Call/whatsapp CTA footer if includeContactCta is true (default true).
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

  return text;
}
