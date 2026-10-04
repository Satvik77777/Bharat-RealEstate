/**
 * Phone Normalization and Validation Utilities for Indian Mobile Numbers
 * Format requirement: exactly 10 digits starting with 6, 7, 8, or 9.
 */

export interface NormalizedPhoneResult {
  raw: string; // Exactly 10 digits e.g. "9876543210" or empty if invalid
  formatted: string; // "+91 98765 43210" or empty
  isValid: boolean;
  error?: string;
}

/**
 * Strips spaces, dashes, leading 0, +91, or 91; validates /^[6-9]\d{9}$/;
 * and produces a standardized +91 XXXXX XXXXX display representation.
 */
export function normalizePhone(input: string | null | undefined): NormalizedPhoneResult {
  if (!input) {
    return { raw: '', formatted: '', isValid: false, error: 'Phone number is required' };
  }

  // 1. Strip all non-digit characters (including +, spaces, dashes, brackets)
  let digits = input.replace(/\D/g, '');

  // 2. Strip leading country code: +91 or 91 (when total length is 12)
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  // Strip leading 0 (when total length is 11)
  else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // 3. Validate against standard Indian mobile regex: ^[6-9]\d{9}$
  const isValid = /^[6-9]\d{9}$/.test(digits);

  if (!isValid) {
    return {
      raw: digits,
      formatted: digits,
      isValid: false,
      error: 'Enter a valid 10-digit Indian mobile number (e.g. 98765 43210)',
    };
  }

  // 4. Format as +91 XXXXX XXXXX
  const part1 = digits.slice(0, 5);
  const part2 = digits.slice(5, 10);
  const formatted = `+91 ${part1} ${part2}`;

  return {
    raw: digits,
    formatted,
    isValid: true,
  };
}

/**
 * Simple helper to check if a phone number is valid
 */
export function isValidPhone(input: string | null | undefined): boolean {
  return normalizePhone(input).isValid;
}

/**
 * Returns raw 10 digits or empty string
 */
export function cleanPhoneNumber(input: string | null | undefined): string {
  const norm = normalizePhone(input);
  return norm.isValid ? norm.raw : '';
}
