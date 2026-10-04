import { describe, it, expect } from 'vitest';
import { parsePriceInput, formatPrice, getPricePreview } from '../price';
import { normalizePhone, isValidPhone } from '../phone';
import { buildWhatsAppLink, formatPropertiesMessage, type WhatsAppPropertyItem } from '../whatsapp';
import { csvEscapeCell, generateCsv } from '../csv';

describe('Price Parsing (parsePriceInput)', () => {
  it('correctly converts 1 Cr to 10,000,000 integer rupees', () => {
    expect(parsePriceInput('1', 'Cr')).toBe(10000000);
    expect(parsePriceInput(1, 'Cr')).toBe(10000000);
  });

  it('correctly converts 0.5 Cr to 5,000,000 integer rupees without floating error', () => {
    expect(parsePriceInput('0.5', 'Cr')).toBe(5000000);
    expect(parsePriceInput('0.50', 'Cr')).toBe(5000000);
  });

  it('correctly converts 1.5 Cr to 15,000,000 integer rupees', () => {
    expect(parsePriceInput('1.5', 'Cr')).toBe(15000000);
  });

  it('correctly converts 0.25 Cr to 2,500,000 integer rupees', () => {
    expect(parsePriceInput('0.25', 'Cr')).toBe(2500000);
  });

  it('correctly converts 50 Lakh to 5,000,000 integer rupees', () => {
    expect(parsePriceInput('50', 'Lakh')).toBe(5000000);
  });

  it('correctly converts 85 Lakh to 8,500,000 integer rupees', () => {
    expect(parsePriceInput('85', 'Lakh')).toBe(8500000);
  });

  it('correctly converts 0.1 Lakh to 10,000 integer rupees', () => {
    expect(parsePriceInput('0.1', 'Lakh')).toBe(10000);
    expect(parsePriceInput('0.10', 'Lakh')).toBe(10000);
  });

  it('correctly converts 99.99 Cr without float inaccuracies', () => {
    expect(parsePriceInput('99.99', 'Cr')).toBe(999900000);
  });

  it('returns null on empty input', () => {
    expect(parsePriceInput('', 'Cr')).toBeNull();
    expect(parsePriceInput('   ', 'Lakh')).toBeNull();
    expect(parsePriceInput(null, 'Cr')).toBeNull();
    expect(parsePriceInput(undefined, 'Cr')).toBeNull();
  });

  it('returns null on negative numbers', () => {
    expect(parsePriceInput('-5', 'Cr')).toBeNull();
    expect(parsePriceInput('-0.5', 'Lakh')).toBeNull();
  });

  it('returns null on letters or invalid symbols', () => {
    expect(parsePriceInput('abc', 'Cr')).toBeNull();
    expect(parsePriceInput('12a', 'Lakh')).toBeNull();
    expect(parsePriceInput('1.2.3', 'Cr')).toBeNull();
  });

  it('returns null on too many decimal places (> 2)', () => {
    expect(parsePriceInput('1.234', 'Cr')).toBeNull();
    expect(parsePriceInput('0.555', 'Lakh')).toBeNull();
  });
});

describe('Price Formatting (formatPrice)', () => {
  it('formats Crore values correctly', () => {
    expect(formatPrice(10000000)).toBe('₹1 Cr');
    expect(formatPrice(12500000)).toBe('₹1.25 Cr');
    expect(formatPrice(15000000)).toBe('₹1.5 Cr');
  });

  it('formats Lakh values correctly', () => {
    expect(formatPrice(8500000)).toBe('₹85 Lakh');
    expect(formatPrice(5000000)).toBe('₹50 Lakh');
    expect(formatPrice(150000)).toBe('₹1.5 Lakh');
  });

  it('formats below 1 Lakh with en-IN grouping', () => {
    expect(formatPrice(50000)).toBe('₹50,000');
    expect(formatPrice(99999)).toBe('₹99,999');
    expect(formatPrice(500)).toBe('₹500');
    expect(formatPrice(0)).toBe('₹0');
  });

  it('generates price preview string correctly', () => {
    expect(getPricePreview('0.5', 'Cr')).toContain('50 Lakh');
    expect(getPricePreview('50', 'Lakh')).toContain('50,00,000');
  });
});

describe('Phone Normalization & Validation (normalizePhone)', () => {
  it('strips spaces, dashes and brackets', () => {
    const res = normalizePhone(' 98765-43210 ');
    expect(res.isValid).toBe(true);
    expect(res.raw).toBe('9876543210');
    expect(res.formatted).toBe('+91 98765 43210');
  });

  it('strips leading 0 for 11 digit input', () => {
    const res = normalizePhone('09876543210');
    expect(res.isValid).toBe(true);
    expect(res.raw).toBe('9876543210');
    expect(res.formatted).toBe('+91 98765 43210');
  });

  it('strips leading +91 and 91 for 12 digit input', () => {
    const res1 = normalizePhone('+919876543210');
    expect(res1.isValid).toBe(true);
    expect(res1.raw).toBe('9876543210');

    const res2 = normalizePhone('919876543210');
    expect(res2.isValid).toBe(true);
    expect(res2.raw).toBe('9876543210');
  });

  it('validates starting digit in [6-9]', () => {
    expect(isValidPhone('6123456789')).toBe(true);
    expect(isValidPhone('7123456789')).toBe(true);
    expect(isValidPhone('8123456789')).toBe(true);
    expect(isValidPhone('9123456789')).toBe(true);
    // Invalid starting digit
    expect(isValidPhone('5123456789')).toBe(false);
    expect(isValidPhone('1123456789')).toBe(false);
  });

  it('rejects too short or too long inputs', () => {
    expect(isValidPhone('987654321')).toBe(false); // 9 digits
    expect(isValidPhone('98765432101')).toBe(false); // 11 digits not starting with 0
    expect(isValidPhone('')).toBe(false);
  });
});

describe('WhatsApp Link & Message Generation', () => {
  const dummyProps: WhatsAppPropertyItem[] = Array.from({ length: 14 }).map((_, i) => ({
    plot_id: `P-000${i + 1}`,
    sector_name: `Sector ${i + 1}`,
    location: `Near Landmark ${i + 1}`,
    type_name: 'Plot',
    price: (i + 1) * 10000000,
    area_size: 250,
    area_unit: 'sq yard',
  }));

  it('builds recipient wa.me link with 91 country code prefix', () => {
    const link = buildWhatsAppLink('9876543210', 'Hello world');
    expect(link).toBe('https://wa.me/919876543210?text=Hello%20world');
  });

  it('supports no-recipient link for open sharing', () => {
    const link = buildWhatsAppLink(null, 'Share with anyone');
    expect(link).toBe('https://wa.me/?text=Share%20with%20anyone');

    const linkEmpty = buildWhatsAppLink('', 'Share with anyone');
    expect(linkEmpty).toBe('https://wa.me/?text=Share%20with%20anyone');
  });

  it('caps property list messages strictly at 10 items and warns if more exist', () => {
    const msg = formatPropertiesMessage(dummyProps);
    expect(msg).toContain('1. *[P-0001]*');
    expect(msg).toContain('10. *[P-00010]*');
    expect(msg).not.toContain('11. *[P-00011]*');
    expect(msg).toContain('Showing 10 of 14 properties. Please contact us for the remaining 4 options.');
  });

  it('handles empty properties list gracefully', () => {
    const msg = formatPropertiesMessage([]);
    expect(msg).toBe('No properties selected.');
  });
});

describe('CSV Escaping & Formula Injection Protection', () => {
  it('prefixes dangerous formula starting characters with a single quote', () => {
    expect(csvEscapeCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(csvEscapeCell('+12345')).toBe("'+12345");
    expect(csvEscapeCell('-cmd')).toBe("'-cmd");
    expect(csvEscapeCell('@admin')).toBe("'@admin");
  });

  it('quotes cells containing commas, quotes, and newlines', () => {
    expect(csvEscapeCell('Hello, World')).toBe('"Hello, World"');
    expect(csvEscapeCell('He said "Hi"')).toBe('"He said ""Hi"""');
    expect(csvEscapeCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
  });

  it('outputs CSV with UTF-8 BOM so Hindi text opens in Excel', () => {
    const headers = ['Plot ID', 'विवरण (Details)', 'Price'];
    const rows = [['P-0001', 'शानदार प्लॉट (Prime Plot)', '₹1.5 Cr']];
    const csv = generateCsv(headers, rows);

    // Starts with UTF-8 BOM
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toContain('शानदार प्लॉट (Prime Plot)');
    expect(csv).toContain('P-0001');
  });
});
