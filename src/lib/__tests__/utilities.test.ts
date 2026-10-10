import { describe, it, expect } from 'vitest';
import { parsePriceInput, formatPrice, getPricePreview, priceInWords } from '../price';
import { normalizePhone, isValidPhone } from '../phone';
import { buildWhatsAppLink, formatPropertiesMessage, type WhatsAppPropertyItem } from '../whatsapp';
import { formatPropertyId, formatPropertiesText } from '../propertyFormat';
import { csvEscapeCell, generateCsv, buildPropertyCsvData, extractPropertyMetadata } from '../csv';

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

  it('generates price preview string correctly with Indian currency words', () => {
    expect(priceInWords(27500000)).toBe('Two Crore Seventy-Five Lakh Rupees');
    expect(priceInWords(6930000)).toBe('Sixty-Nine Lakh Thirty Thousand Rupees');
    expect(priceInWords(40000000)).toBe('Four Crore Rupees');
    expect(getPricePreview('0.5', 'Cr')).toContain('Fifty Lakh Rupees');
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
    expect(msg).toContain('1. *[JSK-0001]*');
    expect(msg).toContain('10. *[JSK-00010]*');
    expect(msg).not.toContain('11. *[JSK-00011]*');
    expect(msg).toContain('Showing 10 of 14 properties. Please contact us for the remaining 4 options.');
  });

  it('handles empty properties list gracefully', () => {
    const msg = formatPropertiesMessage([]);
    expect(msg).toBe('No properties selected.');
  });
});

describe('Property ID & Copy Text Formatting (propertyFormat)', () => {
  it('normalizes various ID formats to JSK-XXXX standard', () => {
    expect(formatPropertyId('P-0024')).toBe('JSK-0024');
    expect(formatPropertyId('P-0001')).toBe('JSK-0001');
    expect(formatPropertyId('JSK-0024')).toBe('JSK-0024');
    expect(formatPropertyId('24')).toBe('JSK-0024');
    expect(formatPropertyId(null)).toBe('JSK-0000');
  });

  it('formats single property text with Price, bold Property ID & Details, no status, and optional CTA footer', () => {
    const item = {
      plot_id: 'P-0024',
      price: 30000000,
      type_name: 'Plot',
      location: 'near market',
      house_no: '2135',
      sector_name: 'Sector 7',
      area_size: 75,
      area_unit: 'sq yard',
      status: 'AVAILABLE',
      details: 'south facing [Dim: 30x60 ft]',
    };

    const textWithCta = formatPropertiesText([item], { showHouseNo: true, includeContactCta: true });
    expect(textWithCta).toContain('*Property ID:* JSK-0024');
    expect(textWithCta).toContain('Price: ₹3 Cr asking (negotiable)');
    expect(textWithCta).toContain('Type: Plot');
    expect(textWithCta).toContain('Location: near market');
    expect(textWithCta).toContain('House No: 2135');
    expect(textWithCta).toContain('Sector: Sector 7');
    expect(textWithCta).toContain('Area: 75 sq yard');
    expect(textWithCta).not.toContain('Status:');
    expect(textWithCta).toContain('*Details:* south facing Length: 30 ft, Breadth: 60 ft');
    expect(textWithCta).toContain('Interested?');
    expect(textWithCta).toContain('Call/whatsapp : 80178-80178');

    // Test location & house no hiding when showLocation is false or showHouseNo is false
    const textWithoutLoc = formatPropertiesText([item], { showLocation: false, includeContactCta: true });
    expect(textWithoutLoc).not.toContain('Location:');
    expect(textWithoutLoc).not.toContain('House No:');
    expect(textWithoutLoc).toContain('Price: ₹3 Cr asking (negotiable)');

    const textWithoutCta = formatPropertiesText([item], { includeContactCta: false });
    expect(textWithoutCta).not.toContain('Interested?');
    expect(textWithoutCta).not.toContain('Call/whatsapp');
  });

  it('formats multiple selected properties with dividers and single footer at end', () => {
    const items = [
      {
        plot_id: 'P-0001',
        price: 15000000,
        type_name: 'Plot',
        sector_name: 'Sector 7',
      },
      {
        plot_id: 'P-0002',
        price: 30000000,
        type_name: 'Flat',
        sector_name: 'Sector 7',
      },
    ];

    const multiText = formatPropertiesText(items, { includeContactCta: true });
    expect(multiText).toContain('*Property ID:* JSK-0001');
    expect(multiText).toContain('Price: ₹1.5 Cr asking (negotiable)');
    expect(multiText).toContain('*Property ID:* JSK-0002');
    expect(multiText).toContain('Price: ₹3 Cr asking (negotiable)');
    expect(multiText).toContain('----------------------------------------');
    expect(multiText).toContain('Interested?\nCall/whatsapp : 80178-80178');
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

  it('correctly extracts structured metadata (broker, dimensions, rate, clean details)', () => {
    const meta1 = extractPropertyMetadata('[[Broker]] new built up kothi');
    expect(meta1.listedBy).toBe('Broker');
    expect(meta1.cleanDetails).toBe('new built up kothi');

    const meta2 = extractPropertyMetadata('[Rate: ₹45,000/gaj] good location');
    expect(meta2.listedBy).toBe('Owner');
    expect(meta2.rate).toBe('₹45,000 / gaj');
    expect(meta2.cleanDetails).toBe('good location');

    const meta3 = extractPropertyMetadata('[Dim: 300x200 ft] hii');
    expect(meta3.dimensions).toBe('Length: 300 ft, Breadth: 200 ft');
    expect(meta3.cleanDetails).toBe('hii');

    const meta4 = extractPropertyMetadata('[Length: 30 ft, Breadth: 60 ft | Rate: ₹50,000/gaj | [Broker]] corner plot');
    expect(meta4.listedBy).toBe('Broker');
    expect(meta4.dimensions).toBe('Length: 30 ft, Breadth: 60 ft');
    expect(meta4.rate).toBe('₹50,000 / gaj');
    expect(meta4.cleanDetails).toBe('corner plot');
  });

  it('builds beautifully structured CSV rows and headers', () => {
    const properties = [
      {
        plot_id: 'JSK-0067',
        sector_name: 'Sector 8',
        location: '',
        house_no: '',
        price: 27500000,
        type_name: 'Residential (House/Kothi)',
        area_size: 8,
        area_unit: 'marla',
        details: '[[Broker]] new built up kothi',
        is_broker: true,
      },
      {
        plot_id: 'JSK-0066',
        sector_name: 'Kohinoor City I',
        location: '',
        house_no: '15A',
        price: 6930000,
        type_name: 'Plot',
        area_size: 154,
        area_unit: 'sq yard',
        details: '[Rate: ₹45,000/gaj] good location',
      },
    ];

    const { headers, rows } = buildPropertyCsvData(properties as any);
    expect(headers).toEqual([
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
    ]);

    expect(rows[0]).toEqual([
      'JSK-0067',
      'Broker',
      'Sector 8',
      '—',
      '—',
      'Residential (House/Kothi)',
      '₹2.75 Cr',
      27500000,
      '8 marla',
      '—',
      '—',
      'new built up kothi',
    ]);

    expect(rows[1]).toEqual([
      'JSK-0066',
      'Owner',
      'Kohinoor City I',
      '—',
      '15A',
      'Plot',
      '₹69.3 Lakh',
      6930000,
      '154 sq yard',
      '—',
      '₹45,000 / gaj',
      'good location',
    ]);
  });
});

