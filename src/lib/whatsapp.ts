/**
 * WhatsApp Integration Utilities
 * Generates wa.me shareable links, formatted messages, and caps at 10 properties.
 */

import { normalizePhone } from './phone';
import { formatPrice } from './price';

export interface WhatsAppPropertyItem {
  plot_id: string;
  sector_name?: string;
  location?: string;
  type_name?: string;
  price: number;
  area_size?: number | null;
  area_unit?: string | null;
  phone?: string | null;
}

/**
 * Builds a direct wa.me link with encoded text.
 * If phone is provided, formats as https://wa.me/91XXXXXXXXXX?text=...
 * If phone is empty/null, formats as https://wa.me/?text=... for broadcast / general sharing.
 */
export function buildWhatsAppLink(phone: string | null | undefined, message: string): string {
  const encodedText = encodeURIComponent(message);

  if (phone) {
    const norm = normalizePhone(phone);
    if (norm.isValid) {
      return `https://wa.me/91${norm.raw}?text=${encodedText}`;
    }
  }

  return `https://wa.me/?text=${encodedText}`;
}

/**
 * Formats a clean, professional WhatsApp text message for a list of properties.
 * Strict cap at 10 properties; includes a note if more exist.
 * Includes owner phone ONLY if present in property item.
 */
export function formatPropertiesMessage(
  properties: WhatsAppPropertyItem[],
  customHeader?: string
): string {
  if (!properties || properties.length === 0) {
    return 'No properties selected.';
  }

  const MAX_ITEMS = 10;
  const totalCount = properties.length;
  const itemsToInclude = properties.slice(0, MAX_ITEMS);

  const lines: string[] = [];

  if (customHeader) {
    lines.push(`*${customHeader}*`);
    lines.push('');
  } else {
    lines.push(`*Verified Property Options (${Math.min(totalCount, MAX_ITEMS)} shown)*`);
    lines.push('');
  }

  itemsToInclude.forEach((p, idx) => {
    const priceStr = formatPrice(p.price);
    const areaStr = p.area_size ? `${p.area_size} ${p.area_unit || ''}`.trim() : null;
    const typeStr = p.type_name || 'Property';
    const sectorStr = p.sector_name || p.location || 'Prime Location';

    lines.push(`${idx + 1}. *[${p.plot_id}]* ${typeStr} in ${sectorStr}`);
    lines.push(`   💰 Price: ${priceStr}`);
    if (areaStr) {
      lines.push(`   📐 Area: ${areaStr}`);
    }
    if (p.location && p.location !== sectorStr) {
      lines.push(`   📍 Locality: ${p.location}`);
    }
    if (p.phone) {
      lines.push(`   📞 Owner/Contact: ${p.phone}`);
    }
    lines.push('');
  });

  if (totalCount > MAX_ITEMS) {
    lines.push(`_Showing 10 of ${totalCount} properties. Please contact us for the remaining ${totalCount - MAX_ITEMS} options._`);
    lines.push('');
  }

  lines.push('Interested in any of these? Reply here or call us directly!');

  return lines.join('\n').trim();
}
