/**
 * Price Parsing & Formatting Utilities
 * Uses STRING and BIGINT arithmetic ONLY - NEVER FLOATS.
 */

export type PriceUnit = 'Cr' | 'Lakh' | 'Rupees';

/**
 * Parses user price input like "1", "0.5", "1.25", "99.99" into integer Rupees.
 * Uses exact BigInt/string arithmetic to prevent floating-point inaccuracies.
 * Supports up to 2 decimal places.
 *
 * @param value String or numeric representation of price
 * @param unit 'Cr' (10,000,000 Rs) | 'Lakh' (100,000 Rs) | 'Rupees'
 * @returns integer Rupees as number (safe within JS MAX_SAFE_INTEGER) or null if invalid
 */
export function parsePriceInput(value: string | number | null | undefined, unit: PriceUnit = 'Lakh'): number | null {
  if (value === null || value === undefined) return null;

  const str = String(value).trim();
  if (!str) return null;

  // Reject negative numbers or invalid characters
  if (str.startsWith('-')) return null;
  if (!/^\d+(\.\d+)?$/.test(str)) return null;

  const parts = str.split('.');
  if (parts.length > 2) return null;

  const intPartStr = parts[0] || '0';
  const fracPartStr = parts[1] || '';

  // Max 2 decimal places allowed
  if (fracPartStr.length > 2) return null;

  // Parse as hundredths (e.g. 1.5 -> 150 hundredths, 0.05 -> 5 hundredths)
  const fracTwoDigits = fracPartStr.padEnd(2, '0');
  const intPart = BigInt(intPartStr);
  const fracPart = BigInt(fracTwoDigits);
  const totalHundredths = intPart * 100n + fracPart;

  if (totalHundredths < 0n) return null;

  let totalRupeesBigInt: bigint;

  switch (unit) {
    case 'Cr':
      // 1 Cr = 10,000,000 Rs.
      // totalHundredths is value * 100.
      // So value * 10,000,000 = (totalHundredths / 100) * 10,000,000 = totalHundredths * 100,000
      totalRupeesBigInt = totalHundredths * 100000n;
      break;

    case 'Lakh':
      // 1 Lakh = 100,000 Rs.
      // value * 100,000 = totalHundredths * 1,000
      totalRupeesBigInt = totalHundredths * 1000n;
      break;

    case 'Rupees':
      // Value in rupees. Frac part cannot have fractional paise in integer rupees.
      // If user typed 1000.5, totalHundredths = 100050.
      // We divide by 100n
      if (fracPart !== 0n) {
        return null; // fractional rupees not accepted for integer rupee storage
      }
      totalRupeesBigInt = intPart;
      break;

    default:
      return null;
  }

  // Database check: price > 0 and price <= 1,000,000,000,000 (10,000 Cr)
  if (totalRupeesBigInt <= 0n || totalRupeesBigInt > 1000000000000n) {
    return null;
  }

  return Number(totalRupeesBigInt);
}

/**
 * Formats integer rupees into readable Indian real estate notation:
 * "₹1.25 Cr", "₹85 Lakh", or standard en-IN grouping below 1 Lakh.
 */
export function formatPrice(rupees: number | bigint | null | undefined): string {
  if (rupees === null || rupees === undefined || isNaN(Number(rupees))) {
    return '₹0';
  }

  const amt = BigInt(Math.floor(Number(rupees)));
  if (amt <= 0n) return '₹0';

  const ONE_CR = 10000000n;
  const ONE_LAKH = 100000n;

  if (amt >= ONE_CR) {
    const crInt = amt / ONE_CR;
    const crRem = amt % ONE_CR;
    // Remainder in hundredths of Cr (each hundredth is 100,000)
    const frac = crRem / ONE_LAKH;
    if (frac === 0n) {
      return `₹${crInt} Cr`;
    }
    const fracStr = frac.toString().padStart(2, '0').replace(/0+$/, '');
    return `₹${crInt}.${fracStr} Cr`;
  }

  if (amt >= ONE_LAKH) {
    const lakhInt = amt / ONE_LAKH;
    const lakhRem = amt % ONE_LAKH;
    // Remainder in hundredths of Lakh (each hundredth is 1,000)
    const frac = lakhRem / 1000n;
    if (frac === 0n) {
      return `₹${lakhInt} Lakh`;
    }
    const fracStr = frac.toString().padStart(2, '0').replace(/0+$/, '');
    return `₹${lakhInt}.${fracStr} Lakh`;
  }

  // Below 1 Lakh: Indian grouping format
  return `₹${Number(amt).toLocaleString('en-IN')}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertTwoDigits(num: number): string {
  if (num < 20) return ONES[num];
  const t = Math.floor(num / 10);
  const o = num % 10;
  return o === 0 ? TENS[t] : `${TENS[t]}-${ONES[o]}`;
}

/**
 * Converts integer rupees to Indian currency words, e.g.:
 * 27500000 -> "Two Crore Seventy-Five Lakh Rupees"
 */
export function priceInWords(rupees: number | bigint | null | undefined): string {
  if (!rupees || Number(rupees) <= 0) return '';
  const num = Math.floor(Number(rupees));

  const crores = Math.floor(num / 10000000);
  const remCrores = num % 10000000;
  const lakhs = Math.floor(remCrores / 100000);
  const remLakhs = remCrores % 100000;
  const thousands = Math.floor(remLakhs / 1000);
  const remThousands = remLakhs % 1000;
  const hundreds = Math.floor(remThousands / 100);
  const remHundreds = remThousands % 100;

  const parts: string[] = [];
  if (crores > 0) parts.push(`${crores < 100 ? convertTwoDigits(crores) : crores} Crore`);
  if (lakhs > 0) parts.push(`${convertTwoDigits(lakhs)} Lakh`);
  if (thousands > 0) parts.push(`${convertTwoDigits(thousands)} Thousand`);
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (remHundreds > 0) parts.push(convertTwoDigits(remHundreds));

  return parts.length > 0 ? `${parts.join(' ')} Rupees` : '';
}

/**
 * Provides a live helper description for inputs, e.g.:
 * "₹2,75,00,000 (Two Crore Seventy-Five Lakh Rupees)"
 */
export function getPricePreview(value: string | number, unit: PriceUnit): string {
  const parsed = parsePriceInput(value, unit);
  if (!parsed) return '';

  const inRupeesFormatted = `₹${parsed.toLocaleString('en-IN')}`;
  const words = priceInWords(parsed);

  if (words) {
    return `${inRupeesFormatted} • ${words}`;
  }

  return inRupeesFormatted;
}

