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
}

export interface PropertyCopyOptions {
  showOwnerPhone?: boolean;
  showLocation?: boolean;
  includeContactCta?: boolean;
  contactCtaText?: string;
}

/**
 * Formats a single property item block with Property ID, Price (with asking (negotiable)), Type, Location, etc.
 */
export function formatSinglePropertyItem(
  p: PropertyDataToCopy,
  options: { showOwnerPhone?: boolean; showLocation?: boolean } = {}
): string {
  const propId = formatPropertyId(p.plot_id);
  const priceStr = formatPrice(p.price);
  const typeStr = p.type_name || 'Property';
  const statusStr = (p.status || 'AVAILABLE').toUpperCase();

  const lines: string[] = [
    `Property ID: ${propId}`,
    `Price: ${priceStr} asking (negotiable)`,
    `Type: ${typeStr}`,
  ];

  // Only include location and house no if showLocation is not explicitly false
  if (options.showLocation !== false) {
    if (p.location) {
      lines.push(`Location: ${p.location}`);
    }
    if (p.house_no) {
      lines.push(`House No: ${p.house_no}`);
    }
  }
  if (p.sector_name && p.sector_name !== p.location) {
    lines.push(`Sector: ${p.sector_name}`);
  }
  if (p.area_size) {
    lines.push(`Area: ${p.area_size} ${p.area_unit || ''}`.trim());
  }
  lines.push(`Status: ${statusStr}`);
  if (p.details) {
    lines.push(`Details: ${p.details}`);
  }
  if (options.showOwnerPhone && p.phone) {
    lines.push(`Owner: ${p.contact_name || 'Owner'}`);
    lines.push(`Contact: ${normalizePhone(p.phone).formatted || p.phone}`);
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
